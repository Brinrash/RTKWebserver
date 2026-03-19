"""Lamp controller that sends UDP commands but trusts state only from the device."""

from __future__ import annotations

import re
import socket
from dataclasses import dataclass, field
from threading import Lock
from time import time
from typing import Callable

from .config import COLOR_ORDER, COMMAND_NAMES, STATE_STALE_SECONDS
from .logger import EventLogger

STATE_RE = re.compile(r"leds:\s*r:\s*(\d)\s*b:\s*(\d)\s*g:\s*(\d)\s*y:\s*(\d)", re.IGNORECASE)


@dataclass(slots=True)
class LampState:
    red: bool = False
    blue: bool = False
    green: bool = False
    yellow: bool = False
    source: str = "unknown"
    last_seen: float | None = None
    online: bool = False

    def to_dict(self) -> dict[str, bool | str | float | None]:
        return {
            "red": self.red,
            "blue": self.blue,
            "green": self.green,
            "yellow": self.yellow,
            "source": self.source,
            "last_seen": self.last_seen,
            "online": self.online,
        }


@dataclass(slots=True)
class LampDefinition:
    name: str
    ip: str
    port: int
    created_from_ui: bool = False
    state: LampState = field(default_factory=LampState)

    def to_dict(self) -> dict[str, object]:
        return {
            "name": self.name,
            "ip": self.ip,
            "port": self.port,
            "created_from_ui": self.created_from_ui,
            "state": self.state.to_dict(),
        }


class LampController:
    def __init__(
        self,
        definition: LampDefinition,
        logger: EventLogger,
        on_state_change: Callable[[str, dict[str, object]], None] | None = None,
    ) -> None:
        self.definition = definition
        self._logger = logger
        self._on_state_change = on_state_change
        self._lock = Lock()
        self._socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    @property
    def name(self) -> str:
        return self.definition.name

    @property
    def ip(self) -> str:
        return self.definition.ip

    @property
    def port(self) -> int:
        return self.definition.port

    def set_state_callback(self, callback: Callable[[str, dict[str, object]], None] | None) -> None:
        self._on_state_change = callback

    def _emit_state(self) -> None:
        if self._on_state_change:
            self._on_state_change(self.name, self.get_state())

    @staticmethod
    def _state_to_packet(state: dict[str, bool]) -> bytes:
        # Device packet order: BLUE -> GREEN -> YELLOW -> RED
        return (
            f"{int(state['blue'])}"
            f"{int(state['green'])}"
            f"{int(state['yellow'])}"
            f"{int(state['red'])}"
        ).encode("ascii")

    def send_command(self, command: str) -> None:
        cmd = command.upper()
        if cmd not in COMMAND_NAMES:
            raise ValueError(f"Unsupported command: {command}")

        state = {color: False for color in COLOR_ORDER}
        if cmd != "OFF":
            state[cmd.lower()] = True
        packet = self._state_to_packet(state)
        self._socket.sendto(packet, (self.ip, self.port))
        self._logger.info(f"Команда отправлена на {self.name} ({self.ip}:{self.port}): {cmd} [{packet.decode('ascii')}]")

    def send_state(self, state: dict[str, bool]) -> None:
        normalized = {color: bool(state.get(color, False)) for color in COLOR_ORDER}
        packet = self._state_to_packet(normalized)
        self._socket.sendto(packet, (self.ip, self.port))
        self._logger.info(
            f"Состояние отправлено на {self.name} ({self.ip}:{self.port}): "
            f"red={int(normalized['red'])} blue={int(normalized['blue'])} "
            f"green={int(normalized['green'])} yellow={int(normalized['yellow'])}"
        )

    def update_from_udp(self, payload: str) -> bool:
        match = STATE_RE.search(payload.strip())
        if match:
            parsed = {
                "blue": match.group(1) == "1",
                "green": match.group(2) == "1",
                "yellow": match.group(3) == "1",
                "red": match.group(4) == "1",
            }
        else:
            stripped = payload.strip()
            if len(stripped) == 4 and stripped.isdigit():
                parsed = {
                    "blue": stripped[0] == "1",
                    "green": stripped[1] == "1",
                    "yellow": stripped[2] == "1",
                    "red": stripped[3] == "1",
                }
            else:
                self._logger.error(f"Не удалось распарсить UDP состояние лампы {self.name}: {payload.strip()}")
                return False

        with self._lock:
            state = self.definition.state
            state.red = parsed["red"]
            state.blue = parsed["blue"]
            state.green = parsed["green"]
            state.yellow = parsed["yellow"]
            state.source = "device"
            state.last_seen = time()
            state.online = True

        self._emit_state()
        return True

    def mark_offline_if_stale(self) -> bool:
        with self._lock:
            state = self.definition.state
            if state.last_seen is None:
                return False
            if state.online and (time() - state.last_seen) > STATE_STALE_SECONDS:
                state.online = False
                state.source = "stale"
                changed = True
            else:
                changed = False
        if changed:
            self._emit_state()
        return changed

    def get_state(self) -> dict[str, object]:
        with self._lock:
            return self.definition.state.to_dict()

    def get_snapshot(self) -> dict[str, object]:
        with self._lock:
            return self.definition.to_dict()
