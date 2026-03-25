"""Manipulator controller for sending Ethernet commands to the arm controller."""

from __future__ import annotations

import socket
from threading import Lock

from .config import (
    MANIPULATOR_ABOVE_CARGO_Z,
    MANIPULATOR_ALLOWED_COMMANDS,
    MANIPULATOR_CARGO_POS_Z,
    MANIPULATOR_DEFAULT_HOST,
    MANIPULATOR_DEFAULT_PORT,
    MANIPULATOR_DEFAULT_PROTOCOL,
    MANIPULATOR_MAX_DIST,
    MANIPULATOR_MAX_ROT,
    MANIPULATOR_MIN_DIST,
    MANIPULATOR_MIN_ROT,
    MANIPULATOR_SOCKET_TIMEOUT,
)
from .logger import EventLogger


class ManipulatorController:
    def __init__(self, logger: EventLogger) -> None:
        self._logger = logger
        self._lock = Lock()

    def config_payload(self) -> dict[str, object]:
        return {
            "default_host": MANIPULATOR_DEFAULT_HOST,
            "default_port": MANIPULATOR_DEFAULT_PORT,
            "default_protocol": MANIPULATOR_DEFAULT_PROTOCOL,
            "allowed_commands": list(MANIPULATOR_ALLOWED_COMMANDS),
            "limits": {
                "min_rot": MANIPULATOR_MIN_ROT,
                "max_rot": MANIPULATOR_MAX_ROT,
                "min_dist": MANIPULATOR_MIN_DIST,
                "max_dist": MANIPULATOR_MAX_DIST,
                "cargo_pos_z": MANIPULATOR_CARGO_POS_Z,
                "above_cargo_z": MANIPULATOR_ABOVE_CARGO_Z,
            },
        }

    def resolve_target(
        self,
        *,
        host: str | None = None,
        port: int | str | None = None,
        protocol: str | None = None,
    ) -> tuple[str, int, str]:
        resolved_host = (host or MANIPULATOR_DEFAULT_HOST).strip()
        if not resolved_host:
            raise ValueError("IP/host манипулятора обязателен")

        try:
            resolved_port = int(MANIPULATOR_DEFAULT_PORT if port is None else port)
        except (TypeError, ValueError) as error:
            raise ValueError("Порт манипулятора должен быть числом") from error

        if not 1 <= resolved_port <= 65535:
            raise ValueError("Порт манипулятора должен быть в диапазоне 1-65535")

        resolved_protocol = (protocol or MANIPULATOR_DEFAULT_PROTOCOL).strip().lower()
        if resolved_protocol not in {"udp", "tcp"}:
            raise ValueError("Протокол манипулятора должен быть udp или tcp")

        return resolved_host, resolved_port, resolved_protocol

    def send_short_command(
        self,
        command: str,
        *,
        host: str | None = None,
        port: int | str | None = None,
        protocol: str | None = None,
    ) -> dict[str, object]:
        normalized_command = command.strip()
        if normalized_command not in MANIPULATOR_ALLOWED_COMMANDS:
            raise ValueError(f"Неизвестная команда манипулятора: {command}")

        return self.send_payload(normalized_command, host=host, port=port, protocol=protocol)

    def build_packet(self, *, angle: int | str, distance: int | str, marker: int | str) -> str:
        try:
            normalized_angle = int(angle)
        except (TypeError, ValueError) as error:
            raise ValueError("Угол поворота должен быть целым числом") from error

        try:
            normalized_distance = int(distance)
        except (TypeError, ValueError) as error:
            raise ValueError("Расстояние должно быть целым числом") from error

        try:
            normalized_marker = int(marker)
        except (TypeError, ValueError) as error:
            raise ValueError("Маркер должен быть 0 или 1") from error

        if not MANIPULATOR_MIN_ROT <= normalized_angle <= MANIPULATOR_MAX_ROT:
            raise ValueError(
                f"Угол должен быть в диапазоне {MANIPULATOR_MIN_ROT}-{MANIPULATOR_MAX_ROT}"
            )
        if not MANIPULATOR_MIN_DIST <= normalized_distance <= MANIPULATOR_MAX_DIST:
            raise ValueError(
                f"Расстояние должно быть в диапазоне {MANIPULATOR_MIN_DIST}-{MANIPULATOR_MAX_DIST}"
            )
        if normalized_marker not in {0, 1}:
            raise ValueError("Маркер должен быть 0 или 1")

        return f"p:{normalized_angle}:{normalized_distance}:{normalized_marker}#"

    def send_packet(
        self,
        *,
        angle: int | str,
        distance: int | str,
        marker: int | str,
        host: str | None = None,
        port: int | str | None = None,
        protocol: str | None = None,
    ) -> dict[str, object]:
        packet = self.build_packet(angle=angle, distance=distance, marker=marker)
        return self.send_payload(packet, host=host, port=port, protocol=protocol)

    def send_payload(
        self,
        payload: str,
        *,
        host: str | None = None,
        port: int | str | None = None,
        protocol: str | None = None,
    ) -> dict[str, object]:
        target_host, target_port, target_protocol = self.resolve_target(
            host=host,
            port=port,
            protocol=protocol,
        )
        encoded_payload = payload.encode("ascii")

        with self._lock:
            if target_protocol == "udp":
                with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                    sock.sendto(encoded_payload, (target_host, target_port))
            else:
                with socket.create_connection((target_host, target_port), timeout=MANIPULATOR_SOCKET_TIMEOUT) as sock:
                    sock.sendall(encoded_payload)

        self._logger.info(
            "Команда манипулятора отправлена "
            f"на {target_host}:{target_port} по {target_protocol.upper()}: {payload}"
        )
        return {
            "host": target_host,
            "port": target_port,
            "protocol": target_protocol,
            "payload": payload,
        }
