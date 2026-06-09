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


def _point_inside_polygon(m1: int, m2: int, points: list[list[int]]) -> bool:
    inside = False
    point_count = len(points)
    if point_count < 3:
        return False

    previous_m1, previous_m2 = points[-1]
    for current_m1, current_m2 in points:
        if (current_m2 > m2) != (previous_m2 > m2):
            intersection_m1 = (previous_m1 - current_m1) * (m2 - current_m2) / (previous_m2 - current_m2) + current_m1
            if m1 < intersection_m1:
                inside = not inside
        previous_m1, previous_m2 = current_m1, current_m2
    return inside


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
        self._zones: dict[str, dict[str, list[dict[str, Any]]]] = {}
        for manipulator_id, payload in (zones or {}).items():
            raw_zones = payload.get("zones", []) if isinstance(payload, dict) else []
            self._zones[str(manipulator_id)] = {"zones": [self._normalize_zone(zone) for zone in raw_zones]}
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

    def get_state(self, manipulator_id: str) -> dict[str, Any]:
        with self._lock:
            state = deepcopy(self._states.get(manipulator_id, {}))
        state.setdefault("current_m1", None)
        state.setdefault("current_m2", None)
        state.setdefault("current_zone", self.determine_zone(manipulator_id))
        state.setdefault("program_running", False)
        state.setdefault("lamp_target", "ALL")
        return state

    def set_lamp_target(self, manipulator_id: str, lamp_target: str) -> dict[str, Any]:
        target = str(lamp_target or "ALL").strip() or "ALL"
        with self._lock:
            state = self._states.setdefault(manipulator_id, {})
            state["lamp_target"] = target
            state["last_lamp_command"] = None
        self._persist()
        self.evaluate(manipulator_id)
        return self.get_state(manipulator_id)

    def set_telemetry(self, manipulator_id: str, *, m1: int | None, m2: int | None) -> dict[str, Any]:
        with self._lock:
            state = self._states.setdefault(manipulator_id, {})
            state["current_m1"] = m1
            state["current_m2"] = m2
            state.setdefault("program_running", False)
        self._persist()
        self.evaluate(manipulator_id)
        return self.get_state(manipulator_id)

    def set_program_running(self, manipulator_id: str, running: bool) -> None:
        with self._lock:
            state = self._states.setdefault(manipulator_id, {})
            state["program_running"] = bool(running)
        self._persist()
        self.evaluate(manipulator_id)

    def determine_zone(self, manipulator_id: str) -> str:
        with self._lock:
            state = deepcopy(self._states.get(manipulator_id, {}))
            zones = deepcopy(self._zones.get(manipulator_id, {}).get("zones", []))
        current_m1 = state.get("current_m1")
        current_m2 = state.get("current_m2")
        if current_m1 is None or current_m2 is None:
            return "outside"
        m1 = int(current_m1)
        m2 = int(current_m2)

        parking = next((zone for zone in zones if zone.get("name") == "parking" and zone.get("type") == "point"), None)
        if parking and self._point_matches(m1, m2, parking):
            return "parking"

        work = next((zone for zone in zones if zone.get("name") == "work" and zone.get("type") == "polygon"), None)
        if work and _point_inside_polygon(m1, m2, work.get("points", [])):
            return "work"

        for zone in zones:
            zone_type = zone.get("type")
            if zone.get("name") in {"parking", "work"}:
                continue
            if zone_type == "point" and self._point_matches(m1, m2, zone):
                return str(zone["name"])
            if zone_type == "polygon" and _point_inside_polygon(m1, m2, zone.get("points", [])):
                return str(zone["name"])
        return "outside"

    def evaluate(self, manipulator_id: str) -> str | None:
        with self._lock:
            state = self._states.setdefault(manipulator_id, {})
            program_running = bool(state.get("program_running", False))
            last_command = state.get("last_lamp_command")
            lamp_target = str(state.get("lamp_target") or "ALL")
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
        with self._lock:
            current_state = self._states.setdefault(manipulator_id, {})
            current_state["current_zone"] = zone
        if not command or command == last_command:
            self._persist()
            return None
        try:
            self._send_lamp_command(lamp_target, command)
        except (KeyError, OSError) as error:
            self._logger.error(f"Automation lamp send error for {manipulator_id}: {error}")
            return None
        with self._lock:
            self._states.setdefault(manipulator_id, {})["last_lamp_command"] = command
            self._states[manipulator_id]["current_zone"] = zone
        self._persist()
        self._logger.info(
            f"Automation {manipulator_id}: zone={zone}, program_running={program_running}, lamp={lamp_target}, command={command}"
        )
        return command

    def _point_matches(self, m1: int, m2: int, zone: dict[str, Any]) -> bool:
        return (
            abs(m1 - int(zone["m1"])) <= int(zone.get("tolerance_m1", 50))
            and abs(m2 - int(zone["m2"])) <= int(zone.get("tolerance_m2", 50))
        )

    def _normalize_zone(self, zone: dict[str, Any]) -> dict[str, Any]:
        name = str(zone.get("name", "")).strip()
        if not name:
            raise ValueError("Название зоны обязательно")
        zone_type = str(zone.get("type", "")).strip().lower()
        if not zone_type and {"angle_min", "angle_max", "distance_min", "distance_max"}.issubset(zone):
            return self._legacy_rect_to_polygon(name, zone)
        if zone_type == "point":
            return {
                "name": name,
                "type": "point",
                "m1": int(zone.get("m1", 0)),
                "m2": int(zone.get("m2", 0)),
                "tolerance_m1": int(zone.get("tolerance_m1", 50)),
                "tolerance_m2": int(zone.get("tolerance_m2", 50)),
            }
        if zone_type == "polygon":
            points = zone.get("points", [])
            if not isinstance(points, list) or len(points) < 3:
                raise ValueError("Полигон зоны должен содержать минимум 3 точки")
            normalized_points = []
            for point in points:
                if not isinstance(point, (list, tuple)) or len(point) != 2:
                    raise ValueError("Каждая точка полигона должна быть [M1, M2]")
                normalized_points.append([int(point[0]), int(point[1])])
            return {"name": name, "type": "polygon", "points": normalized_points}
        raise ValueError("Тип зоны должен быть point или polygon")

    def _legacy_rect_to_polygon(self, name: str, zone: dict[str, Any]) -> dict[str, Any]:
        m1_min = int(zone.get("angle_min", 0))
        m1_max = int(zone.get("angle_max", 0))
        m2_min = int(zone.get("distance_min", 0))
        m2_max = int(zone.get("distance_max", 0))
        return {
            "name": name,
            "type": "polygon",
            "points": [[m1_min, m2_min], [m1_max, m2_min], [m1_max, m2_max], [m1_min, m2_max]],
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
