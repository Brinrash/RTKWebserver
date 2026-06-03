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
    ERROR_LOG_PATH,
    INFO_LOG_PATH,
    MAX_LOG_LINES,
    SECRET_KEY,
    SOCKET_ASYNC_MODE,
    MANIPULATOR_DEFAULT_HOST,
    MANIPULATOR_DEFAULT_PORT,
    MANIPULATOR_DEFAULT_PROTOCOL,
)
from system.lamp_controller import LampController, LampDefinition
from system.lamp_monitor import LampMonitor
from system.logger import EventLogger
from system.manipulator_controller import ManipulatorController
from system.manipulator_manager import ManipulatorManager
from system.manipulator_monitor import ManipulatorMonitor
from system.persistence import load_persistent_state, save_persistent_state
from system.program_runner import ProgramRunner
from system.automation_engine import AutomationEngine


class LampSystem:
    def __init__(self, socketio: SocketIO, logger: EventLogger) -> None:
        self.socketio = socketio
        self.logger = logger
        self._lock = Lock()
        self.controllers: dict[str, LampController] = {}
        self.runners: dict[str, ProgramRunner] = {}
        persisted_state = load_persistent_state()
        self.programs = dict(persisted_state["programs"])
        self._automation_payload = dict(persisted_state.get("automation", {}))
        self.automation: AutomationEngine | None = None
        self.monitor = LampMonitor(logger=logger, on_packet=self._broadcast_log)
        self._create_runner("ALL", self._all_controllers)

        for name, cfg in persisted_state["lamps"].items():
            self.add_lamp(
                name=name,
                ip=cfg["ip"],
                port=int(cfg["port"]),
                created_from_ui=bool(cfg.get("created_from_ui", False)),
                persist=False,
            )

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

    def _broadcast_programs(self) -> None:
        self._emit("programs", {"programs": self.programs})

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

    def _validate_lamp_payload(self, name: str, ip: str, port: int) -> tuple[str, str, int]:
        normalized_name = name.strip()
        normalized_ip = ip.strip()
        normalized_port = int(port)

        if not normalized_name:
            raise ValueError("Имя лампы обязательно")
        if normalized_name.upper() == "ALL":
            raise ValueError("Имя ALL зарезервировано")
        if not normalized_ip:
            raise ValueError("IP адрес обязателен")
        if not 1 <= normalized_port <= 65535:
            raise ValueError("UDP порт должен быть в диапазоне 1-65535")

        return normalized_name, normalized_ip, normalized_port

    def add_lamp(
        self,
        name: str,
        ip: str,
        port: int,
        created_from_ui: bool = True,
        persist: bool = True,
    ) -> dict[str, object]:
        normalized_name, normalized_ip, normalized_port = self._validate_lamp_payload(name, ip, port)

        with self._lock:
            if normalized_name in self.controllers:
                raise ValueError(f"Лампа {normalized_name} уже существует")
            if any(controller.ip == normalized_ip for controller in self.controllers.values()):
                raise ValueError(f"IP {normalized_ip} уже привязан к другой лампе")

            definition = LampDefinition(
                name=normalized_name,
                ip=normalized_ip,
                port=normalized_port,
                created_from_ui=created_from_ui,
            )
            controller = LampController(definition=definition, logger=self.logger, on_state_change=self._broadcast_state)
            self.controllers[normalized_name] = controller
            self.monitor.register(controller)
            self._create_runner(normalized_name, self._single_controller_provider(normalized_name))

        self.logger.info(f"Лампа добавлена: {normalized_name} ({normalized_ip}:{normalized_port})")
        if persist:
            self._persist_state()
        self._broadcast_inventory()
        return controller.get_snapshot()

    def update_lamp(self, lamp_name: str, *, new_name: str, ip: str, port: int) -> dict[str, object]:
        normalized_name, normalized_ip, normalized_port = self._validate_lamp_payload(new_name, ip, port)
        old_runner = None

        with self._lock:
            controller = self.controllers.get(lamp_name)
            if controller is None:
                raise KeyError(lamp_name)

            if normalized_name != lamp_name and normalized_name in self.controllers:
                raise ValueError(f"Лампа {normalized_name} уже существует")

            for existing_name, existing_controller in self.controllers.items():
                if existing_name == lamp_name:
                    continue
                if existing_controller.ip == normalized_ip:
                    raise ValueError(f"IP {normalized_ip} уже привязан к другой лампе")

            self.monitor.unregister(controller.ip)
            controller.update_definition(name=normalized_name, ip=normalized_ip, port=normalized_port)
            if normalized_name != lamp_name:
                self.controllers.pop(lamp_name)
            self.controllers[normalized_name] = controller
            self.monitor.register(controller)

            old_runner = self.runners.pop(lamp_name, None)
            self._create_runner(normalized_name, self._single_controller_provider(normalized_name))

        if old_runner:
            old_runner.stop()
        self.logger.info(
            f"Лампа обновлена: {lamp_name} -> {normalized_name} ({normalized_ip}:{normalized_port})"
        )
        self._persist_state()
        self._broadcast_inventory()
        return controller.get_snapshot()

    def delete_lamp(self, lamp_name: str) -> None:
        runner = None
        with self._lock:
            controller = self.controllers.pop(lamp_name, None)
            if controller is None:
                raise KeyError(lamp_name)
            self.monitor.unregister(controller.ip)
            runner = self.runners.pop(lamp_name, None)

        if runner:
            runner.stop()
        controller.close()
        self.logger.info(f"Лампа удалена: {lamp_name}")
        self._persist_state()
        self._broadcast_inventory()

    def upsert_program(self, program_key: str, program_name: str, program_payload: dict[str, object] | list[dict[str, object]]) -> dict[str, object]:
        normalized_key = program_key.strip()
        normalized_name = program_name.strip()
        if not normalized_key:
            raise ValueError("Ключ стандартной программы обязателен")
        if not normalized_name:
            raise ValueError("Название стандартной программы обязательно")

        if isinstance(program_payload, list):
            normalized_program = {
                "name": normalized_name,
                "repeat": False,
                "steps": program_payload,
            }
        elif isinstance(program_payload, dict):
            normalized_program = dict(program_payload)
            normalized_program["name"] = normalized_name
        else:
            raise ValueError("Стандартная программа должна быть JSON-объектом или списком шагов")

        steps = normalized_program.get("steps")
        if not isinstance(steps, list) or not steps:
            raise ValueError("Стандартная программа должна содержать непустой список steps")

        self.programs[normalized_key] = normalized_program
        self._persist_state()
        self._broadcast_programs()
        return normalized_program

    def _persist_state(self) -> None:
        with self._lock:
            lamps_payload = {
                name: {
                    "ip": controller.ip,
                    "port": controller.port,
                    "created_from_ui": controller.definition.created_from_ui,
                }
                for name, controller in self.controllers.items()
            }
            programs_payload = dict(self.programs)

        automation_payload = self.automation.snapshot() if self.automation else self._automation_payload
        save_persistent_state(lamps_payload, programs_payload, automation_payload)

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

    def run_phase(
        self,
        lamp_name: str,
        phase_table: dict[str, dict[str, object]],
        repeat: bool = False,
        delay: float = 0.5,
    ) -> None:
        runner = self.runners.get(lamp_name)
        if runner is None:
            raise KeyError(lamp_name)
        runner.run_phase_table(phase_table=phase_table, repeat=repeat, delay=delay)

    def bootstrap_payload(self) -> dict[str, object]:
        return {
            "lamps": self.list_lamps(),
            "states": self.get_states(),
            "programs": self.programs,
            "automation": self.automation.snapshot() if self.automation else self._automation_payload,
            "logs": self.logger.tail(MAX_LOG_LINES),
        }


app = Flask(__name__, template_folder="templates", static_folder="static")
app.config["SECRET_KEY"] = SECRET_KEY
socketio = SocketIO(app, cors_allowed_origins="*", async_mode=SOCKET_ASYNC_MODE)
logger = EventLogger(INFO_LOG_PATH, DEBUG_LOG_PATH, ERROR_LOG_PATH, max_buffer_lines=MAX_LOG_LINES)
manipulator = ManipulatorController(logger=logger)
system = LampSystem(socketio=socketio, logger=logger)
system.automation = AutomationEngine(
    logger=logger,
    send_lamp_command=system.send_command,
    persist=system._persist_state,
    zones=system._automation_payload.get("zones", {}),
    rules=system._automation_payload.get("rules", []),
    states=system._automation_payload.get("states", {}),
)
logger.set_callback(system._broadcast_log)
system.start()


def _emit_ws(event: str, payload: dict[str, object]) -> None:
    socketio.start_background_task(socketio.emit, event, payload)

manipulator_manager = ManipulatorManager(logger=logger, emit=_emit_ws)
manipulator_manager.start()



def _resolve_manipulator_target(payload: dict[str, object]) -> dict[str, object]:
    manipulator_id = str(payload.get("manipulator_id", "")).strip()
    item = manipulator_manager.resolve_target(manipulator_id if manipulator_id else None)
    return {
        "id": item["id"],
        "host": str(payload.get("host") or item["host"]),
        "port": int(payload.get("port") or item["command_port"]),
        "protocol": str(payload.get("protocol") or item["protocol"]),
        "axes": int(item.get("axes", 5)),
    }


def _remember_payload_position(manipulator_id: str, payload: str) -> None:
    raw = payload.strip().removesuffix("#")
    parts = raw.split(":")
    if len(parts) >= 5 and parts[0] == "p":
        system.automation.set_last_position(
            manipulator_id,
            {
                "angle": int(parts[1]),
                "distance": int(parts[2]),
                "marker": int(parts[3]) if len(parts) == 5 else int(parts[-1]),
                "gripper": int(parts[4]) if len(parts) == 5 else 0,
            },
        )
    elif len(parts) == 6 and parts[0] == "g":
        system.automation.set_last_position(
            manipulator_id,
            {
                "angle": int(parts[1]),
                "distance": int(parts[2]),
                "marker": int(parts[4]),
                "gripper": int(parts[5]),
            },
        )

try:
    manipulator_manager.create(
        name="Palletizer Default",
        host=MANIPULATOR_DEFAULT_HOST,
        command_port=MANIPULATOR_DEFAULT_PORT,
        telemetry_port=9090,
        protocol=MANIPULATOR_DEFAULT_PROTOCOL,
        axes=5,
    )
except ValueError:
    pass


@app.get("/")
def dashboard() -> str:
    return render_template("dashboard.html")


@app.get("/manipulator")
def manipulator_page() -> str:
    return render_template("manipulator.html")


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


@app.put("/api/lamps/<lamp_name>")
def api_update_lamp(lamp_name: str):
    payload = request.get_json(force=True, silent=False) or {}
    lamp = system.update_lamp(
        lamp_name,
        new_name=str(payload.get("name", lamp_name)),
        ip=str(payload.get("ip", "")).strip(),
        port=int(payload.get("port", 0)),
    )
    return jsonify({"ok": True, "lamp": lamp})


@app.delete("/api/lamps/<lamp_name>")
def api_delete_lamp(lamp_name: str):
    system.delete_lamp(lamp_name)
    return jsonify({"ok": True})


@app.post("/api/lamp/<lamp_name>/command/<command>")
def api_send_command(lamp_name: str, command: str):
    system.send_command(lamp_name, command)
    return jsonify({"ok": True})




@app.post("/api/lamp/<lamp_name>/state")
def api_send_state(lamp_name: str):
    payload = request.get_json(force=True, silent=False) or {}
    state = {
        "red": bool(payload.get("red", False)),
        "yellow": bool(payload.get("yellow", False)),
        "green": bool(payload.get("green", False)),
        "blue": bool(payload.get("blue", False)),
    }
    if lamp_name == "ALL":
        for lamp in system._all_controllers():
            lamp.send_state(state)
    else:
        system.get_controller(lamp_name).send_state(state)
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


@app.post("/api/programs")
def api_upsert_program():
    payload = request.get_json(force=True, silent=False) or {}
    program = system.upsert_program(
        program_key=str(payload.get("key", "")),
        program_name=str(payload.get("name", "")),
        program_payload=payload.get("program", {}),
    )
    return jsonify({"ok": True, "program": program, "programs": system.programs})


@app.get("/api/manipulator/config")
def api_manipulator_config():
    return jsonify(manipulator.config_payload())


@app.post("/api/manipulator/command")
def api_manipulator_command():
    payload = request.get_json(force=True, silent=False) or {}
    target = _resolve_manipulator_target(payload)
    result = manipulator.send_short_command(
        str(payload.get("command", "")),
        host=target["host"],
        port=target["port"],
        protocol=target["protocol"],
    )
    return jsonify({"ok": True, **result})


@app.post("/api/manipulator/packet")
def api_manipulator_packet():
    payload = request.get_json(force=True, silent=False) or {}
    target = _resolve_manipulator_target(payload)
    if target["axes"] == 6:
        angle = int(payload.get("angle", payload.get("a1", 0)))
        distance = int(payload.get("distance", payload.get("a2", 0)))
        head_angle = int(payload.get("head_angle", payload.get("a3", 0)))
        lifted = int(payload.get("lifted", payload.get("a4", 0)))
        gripper = int(payload.get("gripper", payload.get("a5", payload.get("dummy", 0))))
        if lifted not in {0, 1}:
            raise ValueError("lifted должен быть 0 или 1")
        if gripper not in {0, 1}:
            raise ValueError("gripper должен быть 0 или 1")
        result = manipulator.send_payload(
            f"g:{angle}:{distance}:{head_angle}:{lifted}:{gripper}",
            host=target["host"],
            port=target["port"],
            protocol=target["protocol"],
        )
        system.automation.set_last_position(
            str(target["id"]),
            {"angle": angle, "distance": distance, "marker": lifted, "gripper": gripper},
        )
    else:
        result = manipulator.send_packet(
            angle=payload.get("angle"),
            distance=payload.get("distance"),
            marker=payload.get("marker"),
            dummy=payload.get("gripper", payload.get("dummy", 0)),
            host=target["host"],
            port=target["port"],
            protocol=target["protocol"],
        )
        system.automation.set_last_position(
            str(target["id"]),
            {
                "angle": int(payload.get("angle")),
                "distance": int(payload.get("distance")),
                "marker": int(payload.get("marker")),
                "gripper": int(payload.get("gripper", payload.get("dummy", 0))),
            },
        )
    return jsonify({"ok": True, **result})


@app.get("/api/manipulators")
def api_manipulators():
    return jsonify({"manipulators": manipulator_manager.list()})

@app.get("/api/manipulators/<manipulator_id>")
def api_get_manipulator(manipulator_id: str):
    return jsonify({"manipulator": manipulator_manager.get(manipulator_id)})


@app.post("/api/manipulators")
def api_create_manipulator():
    payload = request.get_json(force=True, silent=False) or {}
    item = manipulator_manager.create(
        name=str(payload.get("name", "")),
        host=str(payload.get("host", "")).strip(),
        command_port=int(payload.get("command_port", 8888)),
        telemetry_port=int(payload.get("telemetry_port", 9090)),
        protocol=str(payload.get("protocol", "udp")),
        axes=int(payload.get("axes", 5)),
    )
    return jsonify({"ok": True, "manipulator": item}), 201


@app.put("/api/manipulators/<manipulator_id>")
def api_update_manipulator(manipulator_id: str):
    payload = request.get_json(force=True, silent=False) or {}
    item = manipulator_manager.update(manipulator_id, payload)
    return jsonify({"ok": True, "manipulator": item})


@app.delete("/api/manipulators/<manipulator_id>")
def api_delete_manipulator(manipulator_id: str):
    manipulator_manager.delete(manipulator_id)
    return jsonify({"ok": True})


@app.get("/api/manipulator/state")
def api_manipulator_state():
    manipulator_id = request.args.get("manipulator_id", "")
    if not manipulator_id:
        return jsonify({"error": "manipulator_id обязателен"}), 400
    return jsonify(manipulator_manager.state(manipulator_id))


@app.get("/api/manipulator/raw")
def api_manipulator_raw():
    manipulator_id = request.args.get("manipulator_id", "")
    if not manipulator_id:
        return jsonify({"error": "manipulator_id обязателен"}), 400
    return jsonify({"manipulator_id": manipulator_id, "packets": manipulator_manager.raw(manipulator_id)})


@app.post("/api/manipulator/telemetry/start")
def api_manipulator_telemetry_start():
    payload = request.get_json(force=True, silent=False) or {}
    target = _resolve_manipulator_target(payload)
    result = manipulator.send_short_command("r", host=target["host"], port=target["port"], protocol=target["protocol"])
    return jsonify({"ok": True, **result})


@app.post("/api/manipulator/telemetry/stop")
def api_manipulator_telemetry_stop():
    payload = request.get_json(force=True, silent=False) or {}
    target = _resolve_manipulator_target(payload)
    result = manipulator.send_short_command("s", host=target["host"], port=target["port"], protocol=target["protocol"])
    return jsonify({"ok": True, **result})




@app.post("/api/program/combined/run")
def api_run_combined_program():
    payload = request.get_json(force=True, silent=False) or {}
    manipulator_target = _resolve_manipulator_target(payload)
    program = payload.get("program", [])
    if not isinstance(program, list) or not program:
        raise ValueError("program должен быть непустым JSON-массивом")

    system.automation.set_program_running(str(manipulator_target["id"]), True)
    try:
        steps_to_run = program
        for step in steps_to_run:
            if not isinstance(step, dict):
                continue
            step_type = str(step.get("type", "")).strip().lower()
            delay = float(step.get("delay", 0) or 0)
            if step_type == "lamp":
                lamp = str(step.get("lamp", "ALL"))
                command = str(step.get("command", "")).strip()
                if command:
                    system.send_command(lamp, command)
            elif step_type == "manipulator":
                if "payload" in step:
                    raw_payload = str(step.get("payload", ""))
                    result = manipulator.send_payload(
                        raw_payload,
                        host=manipulator_target["host"],
                        port=manipulator_target["port"],
                        protocol=manipulator_target["protocol"],
                    )
                    _remember_payload_position(str(manipulator_target["id"]), raw_payload)
                elif "command" in step:
                    manipulator.send_short_command(
                        str(step.get("command", "")),
                        host=manipulator_target["host"],
                        port=manipulator_target["port"],
                        protocol=manipulator_target["protocol"],
                    )
            if delay > 0:
                socketio.sleep(delay)
    finally:
        system.automation.set_program_running(str(manipulator_target["id"]), False)

    return jsonify({"ok": True})


@app.get("/api/manipulator/zones/<manipulator_id>")
def api_get_manipulator_zones(manipulator_id: str):
    return jsonify({"manipulator_id": manipulator_id, "zones": system.automation.get_zones(manipulator_id)})


@app.post("/api/manipulator/zones/<manipulator_id>")
def api_set_manipulator_zones(manipulator_id: str):
    payload = request.get_json(force=True, silent=False) or {}
    zones = payload.get("zones", payload if isinstance(payload, list) else [])
    return jsonify({"ok": True, "manipulator_id": manipulator_id, "zones": system.automation.set_zones(manipulator_id, zones)})


@app.get("/api/automation/rules")
def api_get_automation_rules():
    return jsonify({"rules": system.automation.get_rules()})


@app.post("/api/automation/rules")
def api_set_automation_rules():
    payload = request.get_json(force=True, silent=False) or {}
    rules = payload.get("rules", payload if isinstance(payload, list) else [])
    return jsonify({"ok": True, "rules": system.automation.set_rules(rules)})


@app.post("/api/program/combined/stop")
def api_stop_combined_program():
    payload = request.get_json(force=True, silent=True) or {}
    target = _resolve_manipulator_target(payload)
    system.automation.set_program_running(str(target["id"]), False)
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
    socketio.run(
        app,
        host=APP_HOST,
        port=APP_PORT,
        allow_unsafe_werkzeug=True
    )
