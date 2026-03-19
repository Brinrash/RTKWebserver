"""UDP monitor that maps lamp states by device IP and broadcasts updates upstream."""

from __future__ import annotations

import socket
import threading
from typing import Callable

from .config import UDP_BUFFER_SIZE, UDP_LISTEN_HOST, UDP_LISTEN_PORT, UDP_SOCKET_TIMEOUT
from .lamp_controller import LampController
from .logger import EventLogger


class LampMonitor:
    def __init__(
        self,
        logger: EventLogger,
        on_packet: Callable[[str], None] | None = None,
    ) -> None:
        self._logger = logger
        self._on_packet = on_packet
        self._controllers_by_ip: dict[str, LampController] = {}
        self._lock = threading.Lock()
        self._running = False
        self._thread: threading.Thread | None = None

        self._socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self._socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            self._socket.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        except OSError:
            pass
        self._socket.bind((UDP_LISTEN_HOST, UDP_LISTEN_PORT))
        self._socket.settimeout(UDP_SOCKET_TIMEOUT)

    def register(self, controller: LampController) -> None:
        with self._lock:
            self._controllers_by_ip[controller.ip] = controller
        self._logger.info(f"Монитор зарегистрировал лампу {controller.name} ({controller.ip}:{controller.port})")

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name="lamp-monitor")
        self._thread.start()
        self._logger.info(f"UDP монитор запущен на {UDP_LISTEN_HOST}:{UDP_LISTEN_PORT}")

    def stop(self) -> None:
        self._running = False
        try:
            self._socket.close()
        except OSError:
            pass
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1)

    def _loop(self) -> None:
        while self._running:
            try:
                data, addr = self._socket.recvfrom(UDP_BUFFER_SIZE)
            except socket.timeout:
                self._mark_stale()
                continue
            except OSError:
                break

            ip, port = addr
            payload = data.decode("utf-8", errors="replace")
            if self._logger.debug_enabled:
                line = self._logger.debug(f"UDP пакет от {ip}:{port}: {payload.strip()}")
                if self._on_packet and line:
                    self._on_packet(line)

            with self._lock:
                controller = self._controllers_by_ip.get(ip)

            if controller is None:
                self._logger.debug(f"Пакет от незарегистрированного устройства {ip}:{port} проигнорирован")
                continue

            controller.update_from_udp(payload)
            self._mark_stale()

    def _mark_stale(self) -> None:
        with self._lock:
            controllers = list(self._controllers_by_ip.values())
        for controller in controllers:
            if controller.mark_offline_if_stale():
                self._logger.debug(f"Лампа {controller.name} помечена как offline по таймауту")
