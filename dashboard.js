const socket = io();

const actionResult = document.getElementById('action-result');
const logPanel = document.getElementById('log-panel');
let lampList = [];
let allLogs = [];
let selectedLamp = null;
let allStates = {}; // состояние всех ламп

// -------------------- SEGMENTS --------------------

const segmentElements = {
  red: document.getElementById('seg-red'),
  blue: document.getElementById('seg-blue'),
  green: document.getElementById('seg-green'),
  yellow: document.getElementById('seg-yellow')
};

function renderState(state) {
  Object.entries(segmentElements).forEach(([key, el]) => {
    el.classList.toggle('active', !!state[key]);
  });
}

// -------------------- LAMP SELECTION --------------------

function setLamp(name) {
  selectedLamp = name;
  highlightSelected();

    if (name === "ALL") {
    // НЕ сбрасываем состояние
     return;
    }

  if (allStates[name]) {
    renderState(allStates[name]);
  }
}

function renderLamps(states) {
  const container = document.getElementById("lamps");
  container.innerHTML = "";

  // 🔥 ALL как карточка
  const allLamp = document.createElement("div");
  allLamp.className = "card";
  allLamp.innerHTML = `<b>ALL</b>`;
  allLamp.onclick = () => setLamp("ALL");
  allLamp.id = "lamp-ALL";

  container.appendChild(allLamp);

  // обычные лампы
  Object.keys(states).forEach(name => {
    const lamp = document.createElement("div");
    lamp.className = "card";
    lamp.innerHTML = `<b>${name}</b>`;
    lamp.onclick = () => setLamp(name);
    lamp.id = `lamp-${name}`;

    container.appendChild(lamp);
  });
}

function highlightSelected() {
  document.querySelectorAll("[id^='lamp-']").forEach(el => {
    el.style.border = "1px solid #334155";
  });

  if (selectedLamp) {
    const el = document.getElementById(`lamp-${selectedLamp}`);
    if (el) {
      el.style.border = "2px solid #22c55e";
    }
  }
}

// -------------------- COMMANDS --------------------

function send(cmd) {
  if (!selectedLamp) {
    alert("Select lamp first");
    return;
  }

  if (selectedLamp === "ALL") {
    fetch(`/api/lamp/all/${cmd}`, { method: "POST" });
    return;
  }

  fetch(`/api/lamp/${selectedLamp}/${cmd}`, { method: "POST" });
}

// кнопки
document.querySelectorAll("[data-cmd]").forEach(btn => {
  btn.onclick = () => send(btn.dataset.cmd.toUpperCase());
});

// -------------------- PROGRAMS --------------------

function runProgram(name) {
  if (!selectedLamp) return;

  if (selectedLamp === "ALL") {
    lampList.forEach(lamp => {
      fetch(`/api/program/${lamp}/${name}`, { method: "POST" });
    });
  } else {
    fetch(`/api/program/${selectedLamp}/${name}`, { method: "POST" });
  }
}

function runCustom() {
  if (!selectedLamp) return alert("Select lamp");

  const program = JSON.parse(document.getElementById("program").value);

  if (selectedLamp === "ALL") {
    lampList.forEach(lamp => {
      fetch(`/api/program/custom/${lamp}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(program)
      });
    });
  } else {
    fetch(`/api/program/custom/${selectedLamp}`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(program)
    });
  }
}

function runPhase() {
  if (!selectedLamp) return;

  const text = document.getElementById("program").value;
  const data = JSON.parse(text);

  fetch(`/api/program/phase/${selectedLamp}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

function stopProgram() {
  if (!selectedLamp) return;

  if (selectedLamp === "ALL") {
    lampList.forEach(lamp => {
      fetch(`/api/program/stop/${lamp}`, { method: "POST" });
    });
  } else {
    fetch(`/api/program/stop/${selectedLamp}`, { method: "POST" });
  }
}

// -------------------- PROGRAM BUILDER --------------------

let program = [];

function addStep() {
  const cmd = document.getElementById("cmd").value;
  const delay = parseFloat(document.getElementById("delay").value);

  program.push({ cmd, delay });
  renderProgram();
  saveProgram();
}

function renderProgram() {
  document.getElementById("program_view").textContent =
    JSON.stringify(program, null, 2);
}

function clearProgram() {
  program = [];
  renderProgram();
  saveProgram();
}

function runBuilt() {
  if (!selectedLamp) return;

  fetch(`/api/program/custom/${selectedLamp}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(program)
  });
}

function runLoop() {
  if (!selectedLamp) return;

  fetch(`/api/program/custom/${selectedLamp}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repeat: true,
      steps: program
    })
  });
}

// -------------------- STORAGE --------------------

function saveProgram() {
  localStorage.setItem("program", JSON.stringify(program));
}

function loadProgram() {
  const data = localStorage.getItem("program");
  if (data) {
    program = JSON.parse(data);
    renderProgram();
  }
}

function saveCustom() {
  const text = document.getElementById("program").value;
  localStorage.setItem("custom_program", text);
}

function loadCustom() {
  const data = localStorage.getItem("custom_program");
  if (data) {
    document.getElementById("program").value = data;
  }
}

// -------------------- LOGS --------------------

function parseLog(line) {
  const parts = line.split("|");

  return {
    time: parts[0],
    level: parts[1],
    message: parts[2]
  };
}

function renderAllLogs() {
  logPanel.innerHTML = "";

  const filterEl = document.getElementById("logFilter");
  const filter = filterEl ? filterEl.value : "ALL";

  allLogs.forEach(line => {
    const log = parseLog(line);

    if (filter !== "ALL" && log.level !== filter) return;

    const div = document.createElement("div");
    div.className = "log-line log-" + log.level.toLowerCase();
    div.textContent = `${log.time}  ${log.message}`;

    logPanel.appendChild(div);
  });

  logPanel.scrollTop = logPanel.scrollHeight;
}

// -------------------- SOCKET --------------------

socket.on("lamp_state_init", (states) => {
  allStates = states;
  lampList = Object.keys(states); // 🔥 ВАЖНО
  renderLamps(states);

  const first = lampList[0];
  if (first) setLamp(first);
});

socket.on("lamp_state", (data) => {
  const { lamp, state } = data;

  allStates[lamp] = state;

  // 🔥 ВСЕГДА обновляем если:
  if (selectedLamp === "ALL") {
    renderState(state);
  } else if (lamp === selectedLamp) {
    renderState(state);
  }

  // DEBUG
  console.log("STATE:", lamp, state, "selected:", selectedLamp);
});

socket.on("lamp_log", ({ line }) => {
  allLogs.push(line);
  renderAllLogs();
});

socket.on("lamp_logs_snapshot", ({ lines }) => {
  allLogs = lines;
  renderAllLogs();
});

socket.on("lamp_state", (data) => {
  console.log("STATE:", data); // 👈 добавь

  const { lamp, state } = data;

  allStates[lamp] = state;

  if (lamp === selectedLamp) {
    renderState(state);
  }
});

socket.on("lamp_state", (data) => {
  console.log("STATE FRONT:", data);
});

// -------------------- INIT --------------------

fetch("/api/lamp/state")
  .then(r => r.json())
  .then(states => {
    allStates = states;
    renderLamps(states);
  });

fetch("/api/logs")
  .then(r => r.json())
  .then(({ lines }) => {
    allLogs = lines;
    renderAllLogs();
  });

const filterEl = document.getElementById("logFilter");
if (filterEl) {
  filterEl.addEventListener("change", renderAllLogs);
}

loadProgram();
loadCustom();