from __future__ import annotations

import socket
import threading
from collections import deque
from dataclasses import dataclass, field
from time import time
from typing import Callable

from .logger import EventLogger


@dataclass(slots=True)
class ManipulatorTelemetryState:
    online: bool = False
    last_seen: float | None = None
    angles: list[int] = field(default_factory=list)
    temperatures: list[int] = field(default_factory=list)
    loads: list[int] = field(default_factory=list)
    raw_packets: deque[str] = field(default_factory=lambda: deque(maxlen=50))

    def to_dict(self, manipulator_id: str) -> dict[str, object]:
        return {
            "manipulator_id": manipulator_id,
            "online": self.online,
            "last_seen": self.last_seen,
            "angles": list(self.angles),
            "temperatures": list(self.temperatures),
            "loads": list(self.loads),
            "raw_packets": list(self.raw_packets),
        }


class ManipulatorMonitor:
    def __init__(
        self,
        logger: EventLogger,
        on_telemetry: Callable[[str, str], None],
        host: str = "0.0.0.0",
        port: int = 9090,
        timeout_seconds: float = 3.0,
        socket_timeout: float = 0.5,
        buffer_size: int = 2048,
    ) -> None:
        self._logger = logger
        self._on_telemetry = on_telemetry
        self._host = host
        self._port = port
        self._timeout_seconds = timeout_seconds
        self._socket_timeout = socket_timeout
        self._buffer_size = buffer_size
        self._running = False
        self._thread: threading.Thread | None = None

        self._socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self._socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._socket.bind((self._host, self._port))
        self._socket.settimeout(self._socket_timeout)

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name="manipulator-monitor")
        self._thread.start()
        self._logger.info(f"ManipulatorMonitor запущен на {self._host}:{self._port}")

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
                data, addr = self._socket.recvfrom(self._buffer_size)
            except socket.timeout:
                self._on_telemetry("", "")
                continue
            except OSError:
                break

            source_ip, _ = addr
            payload = data.decode("utf-8", errors="replace").strip()
            print("UDP RX:", payload)
            self._on_telemetry(source_ip, payload)
