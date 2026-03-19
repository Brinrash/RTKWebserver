const socket = io();

const state = {
  selectedLamp: null,
  lamps: [],
  lampMap: {},
  states: {},
  logs: [],
  builtProgram: [],
  programs: {}
};

const dom = {
  lampSelector: document.getElementById('lamp-selector'),
  selectedLampLabel: document.getElementById('selected-lamp-label'),
  actionResult: document.getElementById('action-result'),
  connectionStatus: document.getElementById('connection-status'),
  stateSource: document.getElementById('state-source'),
  stateOnline: document.getElementById('state-online'),
  stateLastSeen: document.getElementById('state-last-seen'),
  builtinPrograms: document.getElementById('builtin-programs'),
  customProgram: document.getElementById('custom-program'),
  phaseProgram: document.getElementById('phase-program'),
  addLampForm: document.getElementById('add-lamp-form'),
  logPanel: document.getElementById('log-panel'),
  logFilter: document.getElementById('log-filter'),
  builderCommand: document.getElementById('builder-command'),
  builderDelay: document.getElementById('builder-delay'),
  builderPreview: document.getElementById('builder-preview'),
  segments: {
    red: document.getElementById('seg-red'),
    blue: document.getElementById('seg-blue'),
    green: document.getElementById('seg-green'),
    yellow: document.getElementById('seg-yellow')
  }
};

const STORAGE_KEYS = {
  builtProgram: 'scada_built_program',
  customProgram: 'scada_custom_program',
  phaseProgram: 'scada_phase_program'
};

function bootstrapApp() {
  restoreLocalState();
  bindEvents();
  fetchBootstrap();
}

function bindEvents() {
  document.querySelectorAll('[data-command]').forEach((button) => {
    button.addEventListener('click', () => sendCommand(button.dataset.command));
  });

  document.getElementById('run-custom-program').addEventListener('click', runCustomProgram);
  document.getElementById('run-phase-program').addEventListener('click', runPhaseProgram);
  document.getElementById('stop-program').addEventListener('click', () => stopProgram());
  document.getElementById('builder-add-step').addEventListener('click', addBuilderStep);
  document.getElementById('builder-clear').addEventListener('click', clearBuilder);
  document.getElementById('builder-run').addEventListener('click', () => runBuiltProgram(false));
  document.getElementById('builder-run-repeat').addEventListener('click', () => runBuiltProgram(true));
  document.getElementById('clear-log-view').addEventListener('click', () => {
    state.logs = [];
    renderLogs();
  });
  dom.logFilter.addEventListener('change', renderLogs);
  dom.addLampForm.addEventListener('submit', submitAddLamp);
  dom.customProgram.addEventListener('input', () => localStorage.setItem(STORAGE_KEYS.customProgram, dom.customProgram.value));
  dom.phaseProgram.addEventListener('input', () => localStorage.setItem(STORAGE_KEYS.phaseProgram, dom.phaseProgram.value));

  socket.on('connect', () => {
    dom.connectionStatus.textContent = 'Socket: подключено';
    dom.connectionStatus.classList.add('online');
    dom.connectionStatus.classList.remove('offline');
  });

  socket.on('disconnect', () => {
    dom.connectionStatus.textContent = 'Socket: отключено';
    dom.connectionStatus.classList.remove('online');
    dom.connectionStatus.classList.add('offline');
  });

  socket.on('bootstrap', handleBootstrap);
  socket.on('inventory', handleInventory);
  socket.on('lamp_state', handleLampState);
  socket.on('log_line', handleLogLine);
}

async function fetchBootstrap() {
  const response = await fetch('/api/bootstrap');
  const payload = await response.json();
  handleBootstrap(payload);
}

function handleBootstrap(payload) {
  state.programs = payload.programs || {};
  state.logs = payload.logs || [];
  applyInventory(payload.lamps || [], payload.states || {});
  renderPrograms();
  renderLogs();
}

function handleInventory(payload) {
  applyInventory(payload.lamps || [], payload.states || {});
}

function applyInventory(lamps, states) {
  state.lamps = lamps;
  state.lampMap = Object.fromEntries(lamps.map((lamp) => [lamp.name, lamp]));
  state.states = { ...state.states, ...states };

  const validSelection = state.selectedLamp === 'ALL' || (state.selectedLamp && state.lampMap[state.selectedLamp]);
 if (!state.selectedLamp && lamps.length) {
  state.selectedLamp = lamps[0].name;
  }

  renderLampSelector();
  renderSelectedLampState();
}

function handleLampState(payload) {
  state.states[payload.lamp] = payload.state;

  // НЕ трогаем selector!
  if (state.selectedLamp === payload.lamp || state.selectedLamp === 'ALL') {
    renderSelectedLampState();
  }
}

function handleLogLine(payload) {
  if (!payload?.line) return;
  state.logs.push(payload.line);
  if (state.logs.length > 500) {
    state.logs = state.logs.slice(-500);
  }
  renderLogs();
}

function renderLampSelector() {
  dom.lampSelector.innerHTML = '';
  const allButton = createLampButton('ALL', { name: 'ALL', state: aggregateAllState() });
  dom.lampSelector.appendChild(allButton);

  state.lamps.forEach((lamp) => {
    dom.lampSelector.appendChild(createLampButton(lamp.name, lamp));
  });
}

function createLampButton(name, lamp) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lamp-button';
  if (state.selectedLamp === name) {
    button.classList.add('selected');
  }

  const lampState = name === 'ALL' ? lamp.state : state.states[name] || lamp.state;
  if (lampState?.online) {
    button.classList.add('online');
  } else {
    button.classList.add('offline');
  }

  button.innerHTML = `
    <span class="lamp-name">${name}</span>
    <span class="lamp-ip">${name === 'ALL' ? 'Все лампы' : `${lamp.ip}:${lamp.port}`}</span>
  `;
  button.addEventListener('click', () => {
  state.selectedLamp = name;

  localStorage.setItem("selectedLamp", name); // 👈 добавить

  renderLampSelector();
  renderSelectedLampState();
});
  return button;
}

function aggregateAllState() {
  const aggregated = {
    red: false,
    blue: false,
    green: false,
    yellow: false,
    online: false,
    source: 'aggregate',
    last_seen: null
  };

  state.lamps.forEach((lamp) => {
    const lampState = state.states[lamp.name] || lamp.state || {};
    aggregated.red = aggregated.red || Boolean(lampState.red);
    aggregated.blue = aggregated.blue || Boolean(lampState.blue);
    aggregated.green = aggregated.green || Boolean(lampState.green);
    aggregated.yellow = aggregated.yellow || Boolean(lampState.yellow);
    aggregated.online = aggregated.online || Boolean(lampState.online);
    if (lampState.last_seen && (!aggregated.last_seen || lampState.last_seen > aggregated.last_seen)) {
      aggregated.last_seen = lampState.last_seen;
    }
  });

  return aggregated;
}

function renderSelectedLampState() {
  const selected = state.selectedLamp;
  dom.selectedLampLabel.textContent = selected || '—';
  const selectedState = selected === 'ALL'
    ? aggregateAllState()
    : (selected ? state.states[selected] || state.lampMap[selected]?.state : null);

  const current = selectedState || {
    red: false,
    blue: false,
    green: false,
    yellow: false,
    source: 'unknown',
    online: false,
    last_seen: null
  };

  Object.entries(dom.segments).forEach(([color, element]) => {
    element.classList.toggle('active', Boolean(current[color]));
  });

  dom.stateSource.textContent = current.source || 'unknown';
  dom.stateOnline.textContent = current.online ? 'online' : 'offline';
  dom.stateLastSeen.textContent = current.last_seen ? new Date(current.last_seen * 1000).toLocaleString('ru-RU') : 'нет данных';
}

function renderPrograms() {
  dom.builtinPrograms.innerHTML = '';
  Object.entries(state.programs).forEach(([programKey, meta]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = meta.name || programKey;
    button.addEventListener('click', () => runBuiltinProgram(programKey));
    dom.builtinPrograms.appendChild(button);
  });
}

function renderLogs() {
  dom.logPanel.innerHTML = '';
  const filter = dom.logFilter.value;
  state.logs
    .filter((line) => filter === 'ALL' || line.includes(`| ${filter} |`))
    .forEach((line) => {
      const div = document.createElement('div');
      div.className = `log-line ${resolveLogClass(line)}`;
      div.textContent = line;
      dom.logPanel.appendChild(div);
    });
  dom.logPanel.scrollTop = dom.logPanel.scrollHeight;
}

function resolveLogClass(line) {
  if (line.includes('| ERROR |')) return 'log-error';
  if (line.includes('| DEBUG |')) return 'log-debug';
  return 'log-info';
}


let debugEnabled = localStorage.getItem("debug") !== "off";

document.getElementById("toggle-debug").addEventListener("click", async () => {
  debugEnabled = !debugEnabled;

  const mode = debugEnabled ? "on" : "off";

  await fetch(`/api/logs/debug/${mode}`, { method: "POST" });

  document.getElementById("toggle-debug").textContent =
    debugEnabled ? "DEBUG ON" : "DEBUG OFF";
});

function restoreLocalState() {
  const savedBuiltProgram = localStorage.getItem(STORAGE_KEYS.builtProgram);
  const savedCustomProgram = localStorage.getItem(STORAGE_KEYS.customProgram);
  const savedPhaseProgram = localStorage.getItem(STORAGE_KEYS.phaseProgram);

  if (savedBuiltProgram) {
    state.builtProgram = JSON.parse(savedBuiltProgram);
  }
  if (savedCustomProgram) {
    dom.customProgram.value = savedCustomProgram;
  }
  if (savedPhaseProgram) {
    dom.phaseProgram.value = savedPhaseProgram;
  }
  renderBuiltProgram();
}

function persistBuiltProgram() {
  localStorage.setItem(STORAGE_KEYS.builtProgram, JSON.stringify(state.builtProgram));
  localStorage.setItem("debug", debugEnabled ? "on" : "off");
}

function addBuilderStep() {
  state.builtProgram.push({
    cmd: dom.builderCommand.value,
    delay: Number(dom.builderDelay.value)
  });
  persistBuiltProgram();
  renderBuiltProgram();
}

function clearBuilder() {
  state.builtProgram = [];
  persistBuiltProgram();
  renderBuiltProgram();
}

function renderBuiltProgram() {
  dom.builderPreview.textContent = JSON.stringify(state.builtProgram, null, 2);
}

function getSelectedTarget() {
  if (!state.selectedLamp) {
    throw new Error('Сначала выберите лампу или режим ALL.');
  }
  return state.selectedLamp;
}

async function sendCommand(command) {
  try {
    const target = getSelectedTarget();
    await apiPost(`/api/lamp/${encodeURIComponent(target)}/command/${encodeURIComponent(command)}`);
    setActionResult(`Команда ${command} отправлена для ${target}. Ожидаем UDP-подтверждение.`, false);
  } catch (error) {
    setActionResult(error.message, true);
  }
}

async function runBuiltinProgram(programKey) {
  try {
    const target = getSelectedTarget();
    await apiPost(`/api/program/${encodeURIComponent(target)}/${encodeURIComponent(programKey)}`);
    setActionResult(`Стандартная программа ${programKey} запущена для ${target}.`, false);
  } catch (error) {
    setActionResult(error.message, true);
  }
}

async function runCustomProgram() {
  try {
    const target = getSelectedTarget();
    const program = JSON.parse(dom.customProgram.value);
    await apiPost(`/api/program/custom/${encodeURIComponent(target)}`, program);
    setActionResult(`JSON-программа запущена для ${target}.`, false);
  } catch (error) {
    setActionResult(error.message, true);
  }
}

async function runPhaseProgram() {
  try {
    const target = getSelectedTarget();
    const phasePayload = JSON.parse(dom.phaseProgram.value);
    await apiPost(`/api/program/phase/${encodeURIComponent(target)}`, phasePayload);
    setActionResult(`Phase table запущен для ${target}.`, false);
  } catch (error) {
    setActionResult(error.message, true);
  }
}

async function runBuiltProgram(repeat) {
  try {
    const target = getSelectedTarget();
    await apiPost(`/api/program/custom/${encodeURIComponent(target)}`, {
      repeat,
      steps: state.builtProgram
    });
    setActionResult(`Программа из конструктора запущена для ${target}.`, false);
  } catch (error) {
    setActionResult(error.message, true);
  }
}

async function stopProgram(target = null) {
  try {
    const resolvedTarget = target || getSelectedTarget();
    await apiPost(`/api/program/stop/${encodeURIComponent(resolvedTarget)}`);
    setActionResult(`Программа остановлена для ${resolvedTarget}.`, false);
  } catch (error) {
    setActionResult(error.message, true);
  }
}

async function submitAddLamp(event) {
  event.preventDefault();
  const formData = new FormData(dom.addLampForm);
  try {
    await apiPost('/api/lamps', {
      name: formData.get('name'),
      ip: formData.get('ip'),
      port: Number(formData.get('port'))
    });
    dom.addLampForm.reset();
    dom.addLampForm.querySelector('[name="port"]').value = 8888;
    setActionResult('Новая лампа добавлена. Ожидается поток состояния от устройства.', false);
  } catch (error) {
    setActionResult(error.message, true);
  }
}

async function apiPost(url, body = null) {
  const response = await fetch(url, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : null
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Ошибка ${response.status}`);
  }
  return payload;
}

function setActionResult(message, isError) {
  dom.actionResult.textContent = message;
  dom.actionResult.classList.toggle('error', Boolean(isError));
  dom.actionResult.classList.toggle('ok', !isError);
}

bootstrapApp();
const savedLamp = localStorage.getItem("selectedLamp");
if (savedLamp) {
  state.selectedLamp = savedLamp;
}
