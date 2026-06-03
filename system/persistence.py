"""Persistent storage helpers for server settings."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any

from .config import BASE_DIR, DEFAULT_LAMPS, DEFAULT_PROGRAMS

PERSISTENT_STATE_PATH = BASE_DIR / "data" / "persistent_state.json"


def _default_state() -> dict[str, Any]:
    return {
        "lamps": deepcopy(DEFAULT_LAMPS),
        "programs": deepcopy(DEFAULT_PROGRAMS),
        "automation": {"zones": {}, "rules": [], "states": {}},
    }


def load_persistent_state() -> dict[str, Any]:
    default_state = _default_state()
    PERSISTENT_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)

    if not PERSISTENT_STATE_PATH.exists():
        save_persistent_state(default_state["lamps"], default_state["programs"], default_state["automation"])
        return default_state

    try:
        payload = json.loads(PERSISTENT_STATE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        save_persistent_state(default_state["lamps"], default_state["programs"], default_state["automation"])
        return default_state

    lamps = payload.get("lamps") if isinstance(payload, dict) else None
    programs = payload.get("programs") if isinstance(payload, dict) else None
    automation = payload.get("automation") if isinstance(payload, dict) else None

    normalized_lamps = lamps if isinstance(lamps, dict) and lamps else deepcopy(default_state["lamps"])
    normalized_programs = programs if isinstance(programs, dict) and programs else deepcopy(default_state["programs"])
    normalized_automation = automation if isinstance(automation, dict) else deepcopy(default_state["automation"])
    normalized_automation.setdefault("zones", {})
    normalized_automation.setdefault("rules", [])
    normalized_automation.setdefault("states", {})

    return {
        "lamps": normalized_lamps,
        "programs": normalized_programs,
        "automation": normalized_automation,
    }


def save_persistent_state(lamps: dict[str, Any], programs: dict[str, Any], automation: dict[str, Any] | None = None) -> None:
    PERSISTENT_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "lamps": lamps,
        "programs": programs,
        "automation": automation or {"zones": {}, "rules": [], "states": {}},
    }
    PERSISTENT_STATE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
