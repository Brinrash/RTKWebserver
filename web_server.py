"""Flask + SocketIO web control platform for UDP lamp."""

from __future__ import annotations

from flask import Flask, jsonify, render_template, request
from flask_socketio import SocketIO

from system.config import LOG_FILE, MAX_LOG_LINES, LAMPS
from system.lamp_controller import LampController
from system.lamp_monitor import LampMonitor
from system.logger import EventLogger
from system.program_runner import ProgramRunner

import webbrowser
import threading

# -------------------- INIT --------------------

app = Flask(__name__, template_folder="templates", static_folder="static")
app.config["SECRET_KEY"] = "lamp-dashboard-secret"

socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")
logger = EventLogger(LOG_FILE, console_output=False)

# -------------------- SOCKET EMIT --------------------

def emit_lamp_state(name: str, state: dict) -> None:
    socketio.start_background_task(
        socketio.emit,
        "lamp_state",
        {
            "lamp": name,
            "state": state
        }
    )


def emit_log_line(line: str) -> None:
    socketio.start_background_task(
        socketio.emit,
        "lamp_log",
        {"line": line}
    )

# -------------------- CONTROLLERS --------------------

lamp_controllers: dict[str, LampController] = {}

for name, cfg in LAMPS.items():
    lamp_controllers[name] = LampController(
        name=name,
        ip=cfg["ip"],
        port=cfg["port"],
        logger=logger,
        on_state_change=emit_lamp_state
    )

# -------------------- MONITORS (MULTI DEVICE) --------------------

lamp_monitor = LampMonitor(
    lamp_controllers,
    logger,
    on_response=emit_log_line
)

# -------------------- PROGRAM MANAGER --------------------

program_runners: dict[str, ProgramRunner] = {}

def get_runner(lamp_name: str) -> ProgramRunner:
    if lamp_name not in program_runners:
        program_runners[lamp_name] = ProgramRunner(lamp_controllers[lamp_name])
    return program_runners[lamp_name]

# -------------------- PROGRAMS --------------------

PROGRAMS = {
    "blink_red": [
        {"cmd": "RED", "delay": 0.5},
        {"cmd": "OFF", "delay": 0.5},
    ],
    "traffic": [
        {"cmd": "RED", "delay": 1},
        {"cmd": "GREEN", "delay": 1},
        {"cmd": "YELLOW", "delay": 1},
    ],
    "all_cycle": [
        {"cmd": "RED", "delay": 0.3},
        {"cmd": "BLUE", "delay": 0.3},
        {"cmd": "GREEN", "delay": 0.3},
        {"cmd": "YELLOW", "delay": 0.3},
    ]
}

# -------------------- ROUTES --------------------

@app.get("/")
def dashboard() -> str:
    return render_template("dashboard.html")


@app.get("/api/lamp/state")
def lamp_state():
    return jsonify({
        name: ctrl.get_state()
        for name, ctrl in lamp_controllers.items()
    }), 200


@app.post("/api/lamp/<lamp>/<command>")
def send_lamp_command(lamp: str, command: str):

    if lamp not in lamp_controllers:
        return {"error": "unknown lamp"}, 404

    controller = lamp_controllers[lamp]
    controller.send_command(command)

    return {"ok": True, "state": controller.get_state()}


@app.post("/api/lamp/all/<command>")
def send_all(command: str):
    for ctrl in lamp_controllers.values():
        ctrl.send_command(command)
    return {"ok": True}


@app.get("/api/logs")
def get_logs():
    return jsonify({"lines": logger.tail(MAX_LOG_LINES)}), 200

# -------------------- PROGRAM API --------------------

@app.post("/api/program/<lamp>/<name>")
def run_program(lamp, name):

    if lamp not in lamp_controllers:
        return {"error": "unknown lamp"}, 404

    if name not in PROGRAMS:
        return {"error": "unknown program"}, 404

    runner = get_runner(lamp)
    runner.run_program(PROGRAMS[name])

    return {"ok": True}


@app.post("/api/program/stop/<lamp>")
def stop_program(lamp):

    if lamp not in program_runners:
        return {"ok": True}

    program_runners[lamp].stop()
    return {"ok": True}


@app.post("/api/program/custom/<lamp>")
def run_custom_program(lamp):

    if lamp not in lamp_controllers:
        return {"error": "unknown lamp"}, 404

    try:
        program = request.json

        if isinstance(program, list):
            steps = program

        elif isinstance(program, dict):
            steps = program.get("steps")

            if not isinstance(steps, list):
                return {"error": "invalid steps"}, 400

        else:
            return {"error": "invalid format"}, 400

        for step in steps:
            if "cmd" not in step:
                return {"error": "missing cmd"}, 400

        runner = get_runner(lamp)
        runner.run_program(program)

        return {"ok": True}

    except Exception as e:
        return {"error": str(e)}, 500


@app.post("/api/program/phase/<lamp>")
def run_phase(lamp):

    if lamp not in lamp_controllers:
        return {"error": "unknown lamp"}, 404

    table = request.json

    runner = get_runner(lamp)
    runner.run_phase_table(table)

    return {"ok": True}

# -------------------- SOCKET --------------------

@socketio.on("connect")
def on_connect():
    socketio.emit("lamp_state_init", {
        name: ctrl.get_state()
        for name, ctrl in lamp_controllers.items()
    })
    socketio.emit("lamp_logs_snapshot", {
        "lines": logger.tail(MAX_LOG_LINES)
    })

# -------------------- AUTO OPEN --------------------

def open_browser():
    webbrowser.open("http://localhost:8000")

# -------------------- MAIN --------------------

if __name__ == "__main__":

    lamp_monitor.start()

    threading.Timer(2, open_browser).start()

    socketio.run(app, host="0.0.0.0", port=8000)