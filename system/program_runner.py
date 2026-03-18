import threading
import time


class ProgramRunner:

    def __init__(self, controller):
        self.controller = controller
        self._thread = None
        self._running = False
        self._lock = threading.Lock()

    # -------------------- PROGRAM --------------------

    def run_program(self, program):

        self.stop()

        with self._lock:
            self._running = True

        # поддержка форматов
        if isinstance(program, dict):
            steps = program.get("steps", [])
            repeat = program.get("repeat", False)
        else:
            steps = program
            repeat = False

        def loop():
            while self._running:

                for step in steps:

                    if not self._running:
                        break

                    # --- CMD ---
                    if "cmd" in step:
                        self.controller.send_command(step["cmd"])

                    # --- STATE ---
                    elif "state" in step:
                        state = step["state"]
                        self.controller.set_state(
                            red=state.get("red", False),
                            blue=state.get("blue", False),
                            green=state.get("green", False),
                            yellow=state.get("yellow", False),
                        )

                    # --- DELAY ---
                    delay = step.get("delay", 0.5)
                    time.sleep(delay)

                if not repeat:
                    break

            self._running = False

        self._thread = threading.Thread(target=loop, daemon=True)
        self._thread.start()

    # -------------------- PHASE --------------------

    def run_phase_table(self, table, delay=0.5):

        self.stop()

        with self._lock:
            self._running = True

        def loop():
            while self._running:

                for key in sorted(table.keys(), key=int):

                    if not self._running:
                        break

                    state = table[key]

                    self.controller.set_state(
                        red=bool(int(state.get("L1", 0))),
                        blue=bool(int(state.get("L2", 0))),
                        green=bool(int(state.get("L3", 0))),
                        yellow=bool(int(state.get("L4", 0))),
                    )

                    time.sleep(delay)

            self._running = False

        self._thread = threading.Thread(target=loop, daemon=True)
        self._thread.start()

    # -------------------- STOP --------------------

    def stop(self):

        with self._lock:
            self._running = False

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1)

        self._thread = None