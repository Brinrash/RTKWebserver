from __future__ import annotations

import threading
from dataclasses import dataclass
from time import time
import re
from typing import Callable

from .logger import EventLogger
from .manipulator_monitor import ManipulatorMonitor, ManipulatorTelemetryState
from system.manipulator_logger import (
    manipulator_logger
)

@dataclass(slots=True)
class ManipulatorDefinition:
    id: str
    name: str
    host: str
    command_port: int
    telemetry_port: int = 9090
    protocol: str = "udp"
    axes: int = 5


class ManipulatorManager:
    def __init__(self, logger: EventLogger, emit: Callable[[str, dict[str, object]], None]) -> None:
        self._logger = logger
        self._emit = emit
        self._lock = threading.Lock()
        self._items: dict[str, ManipulatorDefinition] = {}
        self._state: dict[str, ManipulatorTelemetryState] = {}
        self._timeout = 3.0
        self._monitor = ManipulatorMonitor(logger=logger, on_telemetry=self._handle_telemetry)

    def start(self) -> None:
        self._monitor.start()

    def stop(self) -> None:
        self._monitor.stop()

    def _build_id(self, name: str, host: str) -> str:
        tail = host.split(".")[-1] if host else name.lower().replace(" ", "_")
        return f"manip_{tail}"

    def create(self, *, name: str, host: str, command_port: int, telemetry_port: int = 9090, protocol: str = "udp", axes: int = 5) -> dict[str, object]:
        manipulator_id = self._build_id(name, host)
        item = ManipulatorDefinition(
            id=manipulator_id,
            name=name.strip(),
            host=host.strip(),
            command_port=int(command_port),
            telemetry_port=int(telemetry_port),
            protocol=protocol,
            axes=int(axes),
        )
        if item.axes not in {5, 6}:
            raise ValueError("axes должен быть 5 или 6")
        with self._lock:
            if manipulator_id in self._items:
                raise ValueError(f"Манипулятор {manipulator_id} уже существует")
            self._items[manipulator_id] = item
            self._state[manipulator_id] = ManipulatorTelemetryState()
        return self.get(manipulator_id)

    def update(self, manipulator_id: str, payload: dict[str, object]) -> dict[str, object]:
        with self._lock:
            item = self._items.get(manipulator_id)
            if not item:
                raise KeyError(manipulator_id)
            item.name = str(payload.get("name", item.name)).strip()
            item.host = str(payload.get("host", item.host)).strip()
            item.command_port = int(payload.get("command_port", item.command_port))
            item.telemetry_port = int(payload.get("telemetry_port", item.telemetry_port))
            item.protocol = str(payload.get("protocol", item.protocol)).strip().lower()
            item.axes = int(payload.get("axes", item.axes))
            if item.axes not in {5, 6}:
                raise ValueError("axes должен быть 5 или 6")
        return self.get(manipulator_id)

    def delete(self, manipulator_id: str) -> None:
        with self._lock:
            if manipulator_id not in self._items:
                raise KeyError(manipulator_id)
            self._items.pop(manipulator_id, None)
            self._state.pop(manipulator_id, None)

    def get(self, manipulator_id: str) -> dict[str, object]:
        with self._lock:
            item = self._items[manipulator_id]
            state = self._state[manipulator_id]
            return self._snapshot(item, state)

    def resolve_target(self, manipulator_id: str | None = None) -> dict[str, object]:
        with self._lock:
            if manipulator_id:
                item = self._items.get(manipulator_id)
                if not item:
                    raise KeyError(manipulator_id)
                return self._snapshot(item, self._state[manipulator_id])
            if not self._items:
                raise KeyError("no_manipulators")
            first_id = next(iter(self._items))
            return self._snapshot(self._items[first_id], self._state[first_id])

    def list(self) -> list[dict[str, object]]:
        with self._lock:
            return [self._snapshot(item, self._state[item_id]) for item_id, item in self._items.items()]

    def state(self, manipulator_id: str) -> dict[str, object]:
        with self._lock:
            item = self._items[manipulator_id]
            return self._state[manipulator_id].to_dict(item.id)

    def raw(self, manipulator_id: str) -> list[str]:
        with self._lock:
            return list(self._state[manipulator_id].raw_packets)

    def _snapshot(self, item: ManipulatorDefinition, state: ManipulatorTelemetryState) -> dict[str, object]:
        data = state.to_dict(item.id)
        data.update({
            "id": item.id,
            "name": item.name,
            "host": item.host,
            "command_port": item.command_port,
            "telemetry_port": item.telemetry_port,
            "protocol": item.protocol,
            "axes": item.axes,
        })
        return data

    def _find_target(self, source_ip: str, packet_id: str | None) -> str | None:
        with self._lock:
            if packet_id:
                target_id = f"manip_{packet_id}"
                if target_id in self._items:
                    return target_id
            for manipulator_id, item in self._items.items():
                if item.host == source_ip:
                    return manipulator_id
        return None

    def _handle_telemetry(
            self,
            source_ip: str,
            payload: str
    ) -> None:

        now = time()

        try:

            if not payload:
                self._check_stale(now)

                return

            manipulator_logger.info(payload)

            self._logger.debug(
                f"Manipulator UDP payload: {payload}"
            )

            parts = (
                payload
                .rstrip("#")
                .split(":")
            )

            if len(parts) < 2:
                return

            packet_id = parts[1]

            target_id = self._find_target(
                source_ip,
                packet_id
            )

            if not target_id:
                self._check_stale(now)

                return

            with self._lock:

                state = self._state[target_id]

                state.last_seen = now

                state.online = True

                state.raw_packets.append(payload)

                kind = (
                    parts[0]
                    .strip()
                    .upper()
                )

                values = []

                if len(parts) > 3:
                    values = parts[3:]

                clean = []

                for value in values:

                    try:

                        value = (
                            str(value)
                            .replace("#", "")
                            .strip()
                        )

                        if not value:
                            continue

                        clean.append(int(value))

                    except Exception:

                        continue

                # =========================
                # ANGLES
                # =========================

                if kind.startswith("I"):

                    state.angles = clean[:6]


                # =========================
                # TEMPERATURES
                # =========================

                elif kind.startswith("T"):

                    state.temperatures = clean[:6]


                # =========================
                # LOADS
                # =========================

                elif kind.startswith("L"):

                    state.loads = clean[:6]

                snapshot = self._snapshot(
                    self._items[target_id],
                    state
                )

            self._emit(
                "manipulator_log",
                {
                    "manipulator_id": target_id,
                    "packet": payload,
                    "source_ip": source_ip,
                    "timestamp": now
                }
            )

            self._emit(
                "manipulator_state",
                snapshot
            )

        except Exception as error:

            self._logger.error(
                f"Manipulator telemetry error: {error}"
            )

        finally:

            self._check_stale(now)

    def _check_stale(self, now: float | None = None) -> None:
        current = now or time()
        stale: list[dict[str, object]] = []
        with self._lock:
            for manipulator_id, state in self._state.items():
                if state.last_seen and state.online and (current - state.last_seen) > self._timeout:
                    state.online = False
                    stale.append(state.to_dict(manipulator_id))
        for snapshot in stale:
            self._emit("manipulator_state", snapshot)
