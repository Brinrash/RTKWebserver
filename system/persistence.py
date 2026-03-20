"""Persistent storage helpers for lamps and standard programs."""

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
    }


def load_persistent_state() -> dict[str, Any]:
    default_state = _default_state()
    PERSISTENT_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)

    if not PERSISTENT_STATE_PATH.exists():
        save_persistent_state(default_state["lamps"], default_state["programs"])
        return default_state

    try:
        payload = json.loads(PERSISTENT_STATE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        save_persistent_state(default_state["lamps"], default_state["programs"])
        return default_state

    lamps = payload.get("lamps") if isinstance(payload, dict) else None
    programs = payload.get("programs") if isinstance(payload, dict) else None

    normalized_lamps = lamps if isinstance(lamps, dict) and lamps else deepcopy(default_state["lamps"])
    normalized_programs = programs if isinstance(programs, dict) and programs else deepcopy(default_state["programs"])

    return {
        "lamps": normalized_lamps,
        "programs": normalized_programs,
    }


def save_persistent_state(lamps: dict[str, Any], programs: dict[str, Any]) -> None:
    PERSISTENT_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "lamps": lamps,
        "programs": programs,
    }
    PERSISTENT_STATE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
