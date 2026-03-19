"""Configuration for the SCADA-style UDP lamp control system."""

from __future__ import annotations
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

APP_HOST = "0.0.0.0"
APP_PORT = 8000
SECRET_KEY = "lamp-dashboard-secret"
SOCKET_ASYNC_MODE = "threading"

UDP_LISTEN_HOST = "0.0.0.0"
UDP_LISTEN_PORT = 8888
UDP_BUFFER_SIZE = 2048
UDP_SOCKET_TIMEOUT = 0.5


MAX_LOG_LINES = 300
STATE_STALE_SECONDS = 10.0

COLOR_ORDER = ("red", "blue", "green", "yellow")
COMMAND_NAMES = ("RED", "BLUE", "GREEN", "YELLOW", "OFF")

DEFAULT_LAMPS = {
    "lamp1": {"ip": "192.168.254.101", "port": 8888},
    "lamp2": {"ip": "192.168.254.103", "port": 8888},
    "lamp3": {"ip": "192.168.254.108", "port": 8888},
    "lamp4": {"ip": "192.168.254.104", "port": 8888},
}

DEFAULT_PROGRAMS = {
    "blink": {
        "name": "Мигание красным",
        "repeat": True,
        "steps": [
            {"cmd": "RED", "delay": 0.5},
            {"cmd": "OFF", "delay": 0.5},
        ],
    },
    "traffic": {
        "name": "Светофор",
        "repeat": True,
        "steps": [
            {"cmd": "RED", "delay": 1.0},
            {"cmd": "YELLOW", "delay": 0.8},
            {"cmd": "GREEN", "delay": 1.0},
            {"cmd": "OFF", "delay": 0.5},
        ],
    },
}

INFO_LOG_PATH = LOG_DIR / "info.log"
DEBUG_LOG_PATH = LOG_DIR / "debug.log"
ERROR_LOG_PATH = LOG_DIR / "error.log"
