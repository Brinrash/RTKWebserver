"""SCADA-style Flask + SocketIO application for UDP lamp control."""

from __future__ import annotations

from threading import Lock
from typing import Iterable

from flask import Flask, jsonify, render_template, request
from flask_socketio import SocketIO

from system.config import (
    APP_HOST,
    APP_PORT,
    DEBUG_LOG_PATH,
    DEFAULT_LAMPS,
    DEFAULT_PROGRAMS,
    INFO_LOG_PATH,
    ERROR_LOG_PATH,
    MAX_LOG_LINES,
    SECRET_KEY,
    SOCKET_ASYNC_MODE,
)
from system.lamp_controller import LampController, LampDefinition
from system.lamp_monitor import LampMonitor
from system.logger import EventLogger
from system.program_runner import ProgramRunner


class LampSystem:
    def __init__(self, socketio: SocketIO, logger: EventLogger) -> None:
        self.socketio = socketio
        self.logger = logger
        self._lock = Lock()
        self.controllers: dict[str, LampController] = {}
        self.runners: dict[str, ProgramRunner] = {}
        self.programs = dict(DEFAULT_PROGRAMS)
        self.monitor = LampMonitor(logger=logger, on_packet=self._broadcast_log)
        self._create_runner("ALL", self._all_controllers)


        for name, cfg in DEFAULT_LAMPS.items():
            self.add_lamp(name=name, ip=cfg["ip"], port=int(cfg["port"]), created_from_ui=False)

    def start(self) -> None:
        self.monitor.start()

    def _emit(self, event: str, payload: dict[str, object]) -> None:
        self.socketio.start_background_task(self.socketio.emit, event, payload)

    def _broadcast_log(self, line: str) -> None:
        self._emit("log_line", {"line": line})

    def _broadcast_inventory(self) -> None:
        self._emit(
            "inventory",
            {
                "lamps": self.list_lamps(),
                "states": self.get_states(),
            },
        )

    def _broadcast_state(self, lamp_name: str, state: dict[str, object]) -> None:
        self._emit("lamp_state", {"lamp": lamp_name, "state": state})

    def _all_controllers(self) -> Iterable[LampController]:
        with self._lock:
            return list(self.controllers.values())

    def _single_controller_provider(self, lamp_name: str):
        def provider() -> Iterable[LampController]:
            with self._lock:
                controller = self.controllers.get(lamp_name)
                return [controller] if controller else []

        return provider

    def _create_runner(self, target_name: str, provider) -> ProgramRunner:
        runner = ProgramRunner(target_name=target_name, controller_provider=provider, logger=self.logger)
        self.runners[target_name] = runner
        return runner

    def add_lamp(self, name: str, ip: str, port: int, created_from_ui: bool = True) -> dict[str, object]:
        normalized_name = name.strip()
        if not normalized_name:
            raise ValueError("Имя лампы обязательно")
        if normalized_name.upper() == "ALL":
            raise ValueError("Имя ALL зарезервировано")

        with self._lock:
            if normalized_name in self.controllers:
                raise ValueError(f"Лампа {normalized_name} уже существует")
            if any(controller.ip == ip for controller in self.controllers.values()):
                raise ValueError(f"IP {ip} уже привязан к другой лампе")

            definition = LampDefinition(name=normalized_name, ip=ip.strip(), port=int(port), created_from_ui=created_from_ui)
            controller = LampController(definition=definition, logger=self.logger, on_state_change=self._broadcast_state)
            self.controllers[normalized_name] = controller
            self.monitor.register(controller)
            self._create_runner(normalized_name, self._single_controller_provider(normalized_name))

        self.logger.info(f"Лампа добавлена: {normalized_name} ({ip}:{port})")
        self._broadcast_inventory()
        return controller.get_snapshot()

    def list_lamps(self) -> list[dict[str, object]]:
        with self._lock:
            lamps = [controller.get_snapshot() for controller in self.controllers.values()]
        return sorted(lamps, key=lambda lamp: str(lamp["name"]))

    def get_states(self) -> dict[str, dict[str, object]]:
        with self._lock:
            return {name: controller.get_state() for name, controller in self.controllers.items()}

    def get_controller(self, lamp_name: str) -> LampController:
        with self._lock:
            controller = self.controllers.get(lamp_name)
        if controller is None:
            raise KeyError(lamp_name)
        return controller

    def send_command(self, lamp_name: str, command: str) -> None:
        if lamp_name == "ALL":
            for controller in self._all_controllers():
                controller.send_command(command)
            return
        self.get_controller(lamp_name).send_command(command)

    def run_program(self, lamp_name: str, program: dict[str, object] | list[dict[str, object]]) -> None:
        runner = self.runners.get(lamp_name)
        if runner is None:
            if lamp_name == "ALL":
                runner = self._create_runner("ALL", self._all_controllers)
            else:
                self.get_controller(lamp_name)
                runner = self._create_runner(lamp_name, self._single_controller_provider(lamp_name))
        runner.run_program(program)

    def stop_program(self, lamp_name: str) -> None:
        runner = self.runners.get(lamp_name)
        if runner:
            runner.stop()

    def run_phase(self, lamp_name: str, phase_table: dict[str, dict[str, object]], repeat: bool = False, delay: float = 0.5) -> None:
        runner = self.runners.get(lamp_name)
        if runner is None:
            raise KeyError(lamp_name)
        runner.run_phase_table(phase_table=phase_table, repeat=repeat, delay=delay)

    def bootstrap_payload(self) -> dict[str, object]:
        return {
            "lamps": self.list_lamps(),
            "states": self.get_states(),
            "programs": self.programs,
            "logs": self.logger.tail(MAX_LOG_LINES),
        }


app = Flask(__name__, template_folder="templates", static_folder="static")
app.config["SECRET_KEY"] = SECRET_KEY
socketio = SocketIO(app, cors_allowed_origins="*", async_mode=SOCKET_ASYNC_MODE)
logger = EventLogger(INFO_LOG_PATH, DEBUG_LOG_PATH, ERROR_LOG_PATH, max_buffer_lines=MAX_LOG_LINES)
system = LampSystem(socketio=socketio, logger=logger)
logger.set_callback(system._broadcast_log)
system.start()


@app.get("/")
def dashboard() -> str:
    return render_template("dashboard.html")


@app.get("/api/bootstrap")
def api_bootstrap():
    return jsonify(system.bootstrap_payload())


@app.get("/api/lamps")
def api_lamps():
    return jsonify({"lamps": system.list_lamps(), "states": system.get_states()})


@app.post("/api/lamps")
def api_add_lamp():
    payload = request.get_json(force=True, silent=False) or {}
    lamp = system.add_lamp(
        name=str(payload.get("name", "")),
        ip=str(payload.get("ip", "")).strip(),
        port=int(payload.get("port", 0)),
        created_from_ui=True,
    )
    return jsonify({"ok": True, "lamp": lamp}), 201


@app.post("/api/lamp/<lamp_name>/command/<command>")
def api_send_command(lamp_name: str, command: str):
    system.send_command(lamp_name, command)
    return jsonify({"ok": True})


@app.post("/api/program/<lamp_name>/<program_name>")
def api_run_program(lamp_name: str, program_name: str):
    if program_name not in system.programs:
        return jsonify({"error": "Неизвестная программа"}), 404
    system.run_program(lamp_name, system.programs[program_name])
    return jsonify({"ok": True})


@app.post("/api/program/custom/<lamp_name>")
def api_run_custom_program(lamp_name: str):
    payload = request.get_json(force=True, silent=False)
    system.run_program(lamp_name, payload)
    return jsonify({"ok": True})


@app.post("/api/program/phase/<lamp_name>")
def api_run_phase(lamp_name: str):
    payload = request.get_json(force=True, silent=False) or {}
    phase_table = payload.get("phases", payload)
    repeat = bool(payload.get("repeat", False)) if isinstance(payload, dict) else False
    delay = float(payload.get("delay", 0.5)) if isinstance(payload, dict) else 0.5
    system.run_phase(lamp_name, phase_table=phase_table, repeat=repeat, delay=delay)
    return jsonify({"ok": True})


@app.post("/api/program/stop/<lamp_name>")
def api_stop_program(lamp_name: str):
    system.stop_program(lamp_name)
    return jsonify({"ok": True})

@app.post("/api/logs/debug/<mode>")
def api_toggle_debug(mode: str):
    if mode.lower() == "on":
        logger.debug_enabled = True
        logger.info("DEBUG включен")
    elif mode.lower() == "off":
        logger.debug_enabled = False
        logger.info("DEBUG выключен")
    else:
        return jsonify({"error": "mode должен быть on/off"}), 400

    return jsonify({"ok": True, "debug": logger.debug_enabled})

@app.get("/api/logs")
def api_logs():
    level = request.args.get("level")
    return jsonify({"lines": logger.tail(MAX_LOG_LINES, level=level)})


@app.errorhandler(ValueError)
def handle_value_error(error: ValueError):
    line = logger.error(str(error))
    system._broadcast_log(line)
    return jsonify({"error": str(error)}), 400


@app.errorhandler(KeyError)
def handle_key_error(error: KeyError):
    lamp_name = str(error).strip("'")
    message = f"Лампа {lamp_name} не найдена"
    line = logger.error(message)
    system._broadcast_log(line)
    return jsonify({"error": message}), 404


@socketio.on("connect")
def handle_connect():
    socketio.emit("bootstrap", system.bootstrap_payload())


if __name__ == "__main__":
    socketio.run(app, host=APP_HOST, port=APP_PORT)
