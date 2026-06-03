"""Automation rules for manipulator zones and lamp reactions."""

from __future__ import annotations

from copy import deepcopy
from threading import Lock
from typing import Callable, Any

from .config import COMMAND_NAMES
from .logger import EventLogger

DEFAULT_RULES = [
    {"when": {"zone": "parking"}, "then": {"lamp_command": "GREEN"}},
    {"when": {"zone": "work", "program_running": True}, "then": {"lamp_command": "BLUE"}},
    {"when": {"zone": "work", "program_running": False}, "then": {"lamp_command": "YELLOW"}},
    {"when": {"zone": "outside"}, "then": {"lamp_command": "RED"}},
]


class AutomationEngine:
    def __init__(
        self,
        *,
        logger: EventLogger,
        send_lamp_command: Callable[[str, str], None],
        persist: Callable[[], None],
        zones: dict[str, Any] | None = None,
        rules: list[dict[str, Any]] | None = None,
        states: dict[str, Any] | None = None,
    ) -> None:
        self._logger = logger
        self._send_lamp_command = send_lamp_command
        self._persist = persist
        self._lock = Lock()
        self._zones: dict[str, dict[str, list[dict[str, Any]]]] = deepcopy(zones or {})
        self._rules: list[dict[str, Any]] = self._normalize_rules(rules or DEFAULT_RULES)
        self._states: dict[str, dict[str, Any]] = deepcopy(states or {})

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "zones": deepcopy(self._zones),
                "rules": deepcopy(self._rules),
                "states": deepcopy(self._states),
            }

    def get_zones(self, manipulator_id: str) -> list[dict[str, Any]]:
        with self._lock:
            return deepcopy(self._zones.get(manipulator_id, {}).get("zones", []))

    def set_zones(self, manipulator_id: str, zones: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized = [self._normalize_zone(zone) for zone in zones]
        with self._lock:
            self._zones[manipulator_id] = {"zones": normalized}
        self._persist()
        self.evaluate(manipulator_id)
        return deepcopy(normalized)

    def get_rules(self) -> list[dict[str, Any]]:
        with self._lock:
            return deepcopy(self._rules)

    def set_rules(self, rules: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized = self._normalize_rules(rules)
        with self._lock:
            self._rules = normalized
            for state in self._states.values():
                state["last_lamp_command"] = None
        self._persist()
        for manipulator_id in list(self._states):
            self.evaluate(manipulator_id)
        return deepcopy(normalized)

    def set_last_position(self, manipulator_id: str, position: dict[str, Any]) -> None:
        normalized = {
            "angle": int(position["angle"]),
            "distance": int(position["distance"]),
            "marker": int(position.get("marker", 0)),
            "gripper": int(position.get("gripper", 0)),
        }
        with self._lock:
            state = self._states.setdefault(manipulator_id, {})
            state["last_position"] = normalized
            state.setdefault("program_running", False)
        self._persist()
        self.evaluate(manipulator_id)

    def set_program_running(self, manipulator_id: str, running: bool) -> None:
        with self._lock:
            state = self._states.setdefault(manipulator_id, {})
            state["program_running"] = bool(running)
        self._persist()
        self.evaluate(manipulator_id)

    def determine_zone(self, manipulator_id: str) -> str:
        with self._lock:
            position = self._states.get(manipulator_id, {}).get("last_position")
            zones = self._zones.get(manipulator_id, {}).get("zones", [])
        if not isinstance(position, dict):
            return "outside"
        angle = int(position.get("angle", 0))
        distance = int(position.get("distance", 0))
        for zone in zones:
            if (
                int(zone["angle_min"]) <= angle <= int(zone["angle_max"])
                and int(zone["distance_min"]) <= distance <= int(zone["distance_max"])
            ):
                return str(zone["name"])
        return "outside"

    def evaluate(self, manipulator_id: str) -> str | None:
        with self._lock:
            program_running = bool(self._states.get(manipulator_id, {}).get("program_running", False))
            last_command = self._states.get(manipulator_id, {}).get("last_lamp_command")
            rules = deepcopy(self._rules)
        zone = self.determine_zone(manipulator_id)
        command = None
        for rule in rules:
            when = rule.get("when", {})
            if not isinstance(when, dict):
                continue
            if "zone" in when and str(when["zone"]) != zone:
                continue
            if "program_running" in when and bool(when["program_running"]) != program_running:
                continue
            then = rule.get("then", {})
            if isinstance(then, dict) and then.get("lamp_command"):
                command = str(then["lamp_command"]).upper()
                break
        if not command or command == last_command:
            return None
        try:
            self._send_lamp_command("ALL", command)
        except OSError as error:
            self._logger.error(f"Automation lamp send error for {manipulator_id}: {error}")
            return None
        with self._lock:
            self._states.setdefault(manipulator_id, {})["last_lamp_command"] = command
            self._states[manipulator_id]["current_zone"] = zone
        self._persist()
        self._logger.info(f"Automation {manipulator_id}: zone={zone}, program_running={program_running}, lamp={command}")
        return command

    def _normalize_zone(self, zone: dict[str, Any]) -> dict[str, Any]:
        name = str(zone.get("name", "")).strip()
        if not name:
            raise ValueError("Название зоны обязательно")
        return {
            "name": name,
            "angle_min": int(zone.get("angle_min", 0)),
            "angle_max": int(zone.get("angle_max", 0)),
            "distance_min": int(zone.get("distance_min", 0)),
            "distance_max": int(zone.get("distance_max", 0)),
        }

    def _normalize_rules(self, rules: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not isinstance(rules, list):
            raise ValueError("rules должен быть массивом")
        normalized = []
        for rule in rules:
            when = dict(rule.get("when", {}))
            then = dict(rule.get("then", {}))
            if "zone" in when:
                when["zone"] = str(when["zone"]).strip() or "outside"
            if "program_running" in when:
                when["program_running"] = bool(when["program_running"])
            command = str(then.get("lamp_command", "")).upper().strip()
            if command not in COMMAND_NAMES:
                raise ValueError(f"Недопустимая команда лампы: {command}")
            normalized.append({"when": when, "then": {"lamp_command": command}})
        return normalized
