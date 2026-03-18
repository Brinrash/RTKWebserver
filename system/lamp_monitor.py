"""UDP broadcast listener for lamps (REAL DEVICE MODE)."""

from __future__ import annotations

import socket
import threading
from typing import Callable

from .config import BUFFER_SIZE, LOCAL_LISTEN_PORT
from .lamp_controller import LampController
from .logger import EventLogger


class LampMonitor:

    def __init__(
        self,
        controllers: dict[str, LampController],
        logger: EventLogger,
        on_response: Callable[[str], None] | None = None,
    ) -> None:

        self.controllers = controllers
        self.logger = logger
        self._on_response = on_response

        self._running = False
        self._thread: threading.Thread | None = None

        # ✅ отдельный listener сокет
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self._sock.bind(("0.0.0.0", 8888))  # ← КЛЮЧЕВОЕ

        # IP → controller
        self._ip_map = {
            ctrl.ip: ctrl
            for ctrl in controllers.values()
        }

    def start(self) -> None:
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        try:
            self._sock.close()
        except OSError:
            pass

    def _loop(self) -> None:
        while self._running:
            try:
                data, addr = self._sock.recvfrom(BUFFER_SIZE)
            except OSError:
                break

            ip = addr[0]
            text = data.decode("utf-8", errors="replace")

            line = self.logger.response(f"{ip}:{addr[1]} -> {text}")

            controller = self._ip_map.get(ip)

            if controller:
                controller.update_state_from_response(text)

            if self._on_response:
                self._on_response(line)