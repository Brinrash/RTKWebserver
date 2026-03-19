"""Program runner for single lamp and ALL mode without logic duplication."""

from __future__ import annotations

import threading
from time import sleep
from typing import Callable, Iterable, Sequence

from .config import COLOR_ORDER, COMMAND_NAMES
from .lamp_controller import LampController
from .logger import EventLogger


class ProgramRunner:
    def __init__(self, target_name: str, controller_provider: Callable[[], Iterable[LampController]], logger: EventLogger) -> None:
        self._target_name = target_name
        self._controller_provider = controller_provider
        self._logger = logger
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()

    def run_program(self, program: dict[str, object] | Sequence[dict[str, object]]) -> None:
        steps, repeat, step_delay = self._normalize_program(program)
        self.stop()
        self._stop_event.clear()

        def loop() -> None:
            self._logger.info(f"Программа запущена для {self._target_name}: repeat={repeat}")
            while not self._stop_event.is_set():
                for step in steps:
                    if self._stop_event.is_set():
                        break
                    self._execute_step(step)
                    self._sleep(step.get("delay", step_delay))
                if not repeat:
                    break
            self._logger.info(f"Программа завершена для {self._target_name}")

        self._thread = threading.Thread(target=loop, daemon=True, name=f"program-{self._target_name}")
        self._thread.start()

    def run_phase_table(self, phase_table: dict[str, dict[str, object]], repeat: bool = False, delay: float = 0.5) -> None:
        ordered_steps = []
        for phase_key in sorted(phase_table.keys(), key=lambda value: int(value)):
            raw_state = phase_table[phase_key]
            ordered_steps.append(
                {
                    "state": {
                        "red": bool(int(raw_state.get("L1", 0))),
                        "blue": bool(int(raw_state.get("L2", 0))),
                        "green": bool(int(raw_state.get("L3", 0))),
                        "yellow": bool(int(raw_state.get("L4", 0))),
                    },
                    "delay": delay,
                }
            )
        self.run_program({"repeat": repeat, "steps": ordered_steps})

    def stop(self) -> None:
        with self._lock:
            self._stop_event.set()
            thread = self._thread
            self._thread = None
        if thread and thread.is_alive():
            thread.join(timeout=1.0)
        self._logger.info(f"Останов программы для {self._target_name} выполнен")

    def _execute_step(self, step: dict[str, object]) -> None:
        controllers = list(self._controller_provider())
        if not controllers:
            self._logger.error(f"Нет доступных ламп для выполнения программы {self._target_name}")
            return

        if "cmd" in step:
            cmd = str(step["cmd"]).upper()
            if cmd not in COMMAND_NAMES:
                raise ValueError(f"Unsupported program command: {cmd}")
            for controller in controllers:
                controller.send_command(cmd)
            return

        if "state" in step:
            raw_state = step["state"]
            if not isinstance(raw_state, dict):
                raise ValueError("Program step state must be an object")
            normalized = {color: bool(raw_state.get(color, False)) for color in COLOR_ORDER}
            for controller in controllers:
                controller.send_state(normalized)
            return

        raise ValueError("Program step must contain 'cmd' or 'state'")

    def _sleep(self, delay: object) -> None:
        remaining = max(float(delay), 0.0)
        interval = 0.05
        while remaining > 0 and not self._stop_event.is_set():
            chunk = min(interval, remaining)
            sleep(chunk)
            remaining -= chunk

    def _normalize_program(self, program: dict[str, object] | Sequence[dict[str, object]]) -> tuple[list[dict[str, object]], bool, float]:
        if isinstance(program, dict):
            steps = program.get("steps", [])
            repeat = bool(program.get("repeat", False))
            step_delay = float(program.get("default_delay", 0.5))
        else:
            steps = program
            repeat = False
            step_delay = 0.5

        if not isinstance(steps, Sequence) or isinstance(steps, (str, bytes)):
            raise ValueError("Program steps must be a list")

        normalized_steps: list[dict[str, object]] = []
        for step in steps:
            if not isinstance(step, dict):
                raise ValueError("Each program step must be an object")
            normalized_steps.append(dict(step))
        return normalized_steps, repeat, step_delay
