"""Thread-safe multi-file logger for the SCADA backend."""

from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Deque, Iterable


class EventLogger:
    """Writes logs to dedicated files and keeps an in-memory tail for the UI."""

    def __init__(self, info_path: Path, debug_path: Path, error_path: Path, max_buffer_lines: int = 300) -> None:
        self._paths = {
            "INFO": Path(info_path),
            "DEBUG": Path(debug_path),
            "ERROR": Path(error_path),
        }
        self._lock = Lock()
        self._buffer: Deque[str] = deque(maxlen=max_buffer_lines)
        self.debug_enabled = True
        self._callback = None


        for path in self._paths.values():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.touch(exist_ok=True)

    @staticmethod
    def _timestamp() -> str:
        return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S")

    def _format(self, level: str, message: str) -> str:
        return f"{self._timestamp()} | {level} | {message}"

    def set_callback(self, cb):
        self._callback = cb

    def log(self, level: str, message: str) -> str:
        level = level.upper()
        if level not in self._paths:
            raise ValueError(f"Unsupported log level: {level}")

        line = self._format(level, message)
        with self._lock:
            with self._paths[level].open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")
            self._buffer.append(line)
            if self._callback:
                self._callback(line)
        return line


    def info(self, message: str) -> str:
        return self.log("INFO", message)

    def debug(self, message: str) -> str:
        if not self.debug_enabled:
            return ""
        return self.log("DEBUG", message)

    def error(self, message: str) -> str:
        return self.log("ERROR", message)

    def tail(self, lines: int = 100, level: str | None = None) -> list[str]:
        with self._lock:
            snapshot = list(self._buffer)

        if level:
            marker = f"| {level.upper()} |"
            snapshot = [line for line in snapshot if marker in line]
        return snapshot[-lines:]

    def read_file(self, level: str) -> Iterable[str]:
        path = self._paths[level.upper()]
        return path.read_text(encoding="utf-8").splitlines()
