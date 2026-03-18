"""Timestamped logger for UDP platform events."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path


class EventLogger:
    def __init__(self, log_file: str, console_output: bool = False) -> None:
        self.log_path = Path(log_file)
        self.console_output = console_output
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self.log_path.touch(exist_ok=True)

    @staticmethod
    def _ts() -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def _write(self, message: str) -> str:

        ts = self._ts()

        # определяем тип
        if message.startswith("SEND"):
            level = "INFO"
        elif message.startswith("RESPONSE"):
            level = "DEBUG"
        elif "ERROR" in message:
            level = "ERROR"
        else:
            level = "INFO"

        line = f"{ts}|{level}|{message}"

        with self.log_path.open("a", encoding="utf-8") as f:
            f.write(line + "\n")

        return line

    def send(self, text: str) -> str:
        return self._write(f"SEND: {text}")

    def response(self, text: str) -> str:
        return self._write(f"RESPONSE: {text}")

    def tail(self, lines: int = 100) -> list[str]:
        data = self.log_path.read_text(encoding="utf-8").splitlines()
        return data[-lines:]
