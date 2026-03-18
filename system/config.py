"""System configuration for UDP lamp platform."""

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)


LOCAL_LISTEN_PORT = 8888
BUFFER_SIZE = 1024

LAMPS = {
    "lamp1": {
        "ip": "192.168.254.101",
        "port": 8888
    },
    "lamp2": {
        "ip": "192.168.254.103",
        "port": 8888
    },
    "lamp3": {
        "ip": "192.168.254.108",
        "port": 8888
    },
    "lamp4": {
        "ip": "192.168.254.104",
        "port": 8888
    }
}

# UDP command payloads (replace with the exact binary protocol if required).
COMMAND_PACKETS = {
    "RED": b"0001",
    "BLUE": b"1000",
    "GREEN": b"0100",
    "YELLOW": b"0010",
    "OFF": b"0000",
}


LOG_FILE = str(LOG_DIR / "lamp_log.txt")
MAX_LOG_LINES = 200
