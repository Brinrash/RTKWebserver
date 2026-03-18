"""UDP lamp command sender and state storage (SCADA mode)."""

from __future__ import annotations

import socket
from threading import Lock
from typing import Callable

from .logger import EventLogger


class LampController:

    def __init__(self, name, ip, port, logger, on_state_change=None):
        self.name = name
        self.ip = ip
        self.port = port
        self.logger: EventLogger = logger

        self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self._lock = Lock()

        # состояние = ТОЛЬКО с устройства
        self._state = {
            "red": False,
            "blue": False,
            "green": False,
            "yellow": False
        }

        self._on_state_change: Callable | None = on_state_change

    # -------------------- INTERNAL --------------------

    def _emit_state(self) -> None:
        if self._on_state_change:
            self._on_state_change(self.name, self.get_state())

    def _build_packet(self) -> bytes:
        """
        Реальный порядок устройства:
        BLUE → GREEN → YELLOW → RED
        """
        return (
            f"{int(self._state['blue'])}"
            f"{int(self._state['green'])}"
            f"{int(self._state['yellow'])}"
            f"{int(self._state['red'])}"
        ).encode()

    def _send_packet(self, packet: bytes) -> None:
        self._sock.sendto(packet, (self.ip, self.port))
        self.logger.send(f"{self.name}: SEND -> {packet.decode()}")

    # -------------------- PUBLIC API --------------------

    def send_command(self, command: str) -> None:
        """
        Только отправка команды.
        Состояние НЕ меняем — ждём ответ от лампы.
        """

        cmd = command.upper()

        if cmd not in ["RED", "BLUE", "GREEN", "YELLOW", "OFF"]:
            raise ValueError(f"Unsupported command: {command}")

        # ⚠️ Формируем временное состояние для отправки
        temp_state = {
            "red": False,
            "blue": False,
            "green": False,
            "yellow": False
        }

        if cmd != "OFF":
            temp_state[cmd.lower()] = True

        packet = (
            f"{int(temp_state['blue'])}"
            f"{int(temp_state['green'])}"
            f"{int(temp_state['yellow'])}"
            f"{int(temp_state['red'])}"
        ).encode()
        print(f"SENT TO {self.name}: {packet}")
        self._send_packet(packet)

        # ❗ НЕ вызываем _emit_state()

    # -------------------- ADVANCED --------------------

    def set_state(self, red=False, blue=False, green=False, yellow=False) -> None:
        """
        Только отправка (для программ).
        """

        packet = (
            f"{int(blue)}"
            f"{int(green)}"
            f"{int(yellow)}"
            f"{int(red)}"
        ).encode()

        self._send_packet(packet)

        # ❗ НЕ обновляем состояние

    # -------------------- MONITOR --------------------

    def update_state_from_response(self, response_text: str) -> None:
        """
        Парсит реальный ответ лампы:
        leds: r: 0 b: 0 g: 0 y: 1
        """

        text = response_text.strip().lower()

        with self._lock:

            # 🔥 новый парсинг формата "leds: r: 0 b: 0 g: 0 y: 1"
            if "leds" in text:
                try:
                    parts = text.replace("leds:", "").split()

                    data = {}
                    for i in range(0, len(parts), 2):
                        key = parts[i].replace(":", "")
                        val = parts[i + 1]
                        data[key] = val == "1"

                    # 🔥 ПРАВИЛЬНОЕ соответствие твоей лампы
                    self._state["blue"] = data.get("r", False)
                    self._state["green"] = data.get("b", False)
                    self._state["yellow"] = data.get("g", False)
                    self._state["red"] = data.get("y", False)

                except Exception as e:
                    self.logger.response(f"PARSE ERROR: {text}")

            # fallback (если вдруг другой формат)
            elif len(text) == 4 and text.isdigit():
                self._state["red"] = text[3] == "1"
                self._state["blue"] = text[0] == "1"
                self._state["green"] = text[1] == "1"
                self._state["yellow"] = text[2] == "1"

        # ✅ обновляем UI
        self._emit_state()

    # -------------------- GET --------------------

    def get_state(self) -> dict[str, bool]:
        with self._lock:
            return dict(self._state)