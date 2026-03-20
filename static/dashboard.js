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
  manualControlSingle: document.getElementById('manual-control-single'),
  allManualControls: document.getElementById('all-manual-controls'),
  connectionStatus: document.getElementById('connection-status'),
  builtinPrograms: document.getElementById('builtin-programs'),
  customProgram: document.getElementById('custom-program'),
  phaseProgram: document.getElementById('phase-program'),
  addLampForm: document.getElementById('add-lamp-form'),
  editLampForm: document.getElementById('edit-lamp-form'),
  deleteLampButton: document.getElementById('delete-lamp'),
  programEditorForm: document.getElementById('program-editor-form'),
  standardProgramKey: document.getElementById('standard-program-key'),
  standardProgramName: document.getElementById('standard-program-name'),
  allLampsState: document.getElementById('all-lamps-state'),
  logPanel: document.getElementById('log-panel'),
  logFilter: document.getElementById('log-filter'),
  builderCommand: document.getElementById('builder-command'),
  builderDelay: document.getElementById('builder-delay'),
  builderPreview: document.getElementById('builder-preview')
};

const STORAGE_KEYS = {
  builtProgram: 'scada_built_program',
  customProgram: 'scada_custom_program',
  phaseProgram: 'scada_phase_program',
  programEditorMeta: 'scada_program_editor_meta',
  selectedLamp: 'selectedLamp',
  debug: 'debug'
};

const DEFAULT_DRAFTS = {
  builtProgram: [],
  customProgram: dom.customProgram.value,
  phaseProgram: dom.phaseProgram.value
};

let debugEnabled = localStorage.getItem(STORAGE_KEYS.debug) === 'on';

function bootstrapApp() {
  restoreLocalState();
  bindEvents();
  syncDebugButton();
  fetchBootstrap();
}

function bindEvents() {
  document.querySelectorAll('[data-command]').forEach((button) => {
    button.addEventListener('click', () => sendCommand(button.dataset.command));
  });

  document.getElementById('run-custom-program').addEventListener('click', runCustomProgram);
  document.getElementById('stop-custom-program').addEventListener('click', () => stopProgram());
  document.getElementById('run-phase-program').addEventListener('click', runPhaseProgram);
  document.getElementById('stop-phase-program').addEventListener('click', () => stopProgram());
  document.getElementById('stop-program').addEventListener('click', () => stopProgram());
  document.getElementById('builder-add-step').addEventListener('click', addBuilderStep);
  document.getElementById('builder-clear').addEventListener('click', clearBuilder);
  document.getElementById('builder-run').addEventListener('click', () => runBuiltProgram(false));
  document.getElementById('builder-run-repeat').addEventListener('click', () => runBuiltProgram(true));
  document.getElementById('builder-stop').addEventListener('click', () => stopProgram());
  document.getElementById('clear-log-view').addEventListener('click', () => {
    state.logs = [];
    renderLogs();
  });
  document.getElementById('toggle-debug').addEventListener('click', toggleDebug);
  dom.logFilter.addEventListener('change', renderLogs);
  dom.addLampForm.addEventListener('submit', submitAddLamp);
  dom.lampSelector.addEventListener('click', handleLampSelectorClick);
  dom.editLampForm.addEventListener('submit', submitEditLamp);
  dom.deleteLampButton.addEventListener('click', deleteLamp);
  dom.programEditorForm.addEventListener('submit', submitStandardProgram);
  dom.customProgram.addEventListener('input', () => persistCurrentDrafts());
  dom.standardProgramKey.addEventListener('input', persistProgramEditorMeta);
  dom.standardProgramName.addEventListener('input', persistProgramEditorMeta);
  dom.phaseProgram.addEventListener('input', () => persistCurrentDrafts());

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
  socket.on('programs', handleProgramsUpdate);
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

function handleProgramsUpdate(payload) {
  state.programs = payload.programs || {};
  renderPrograms();
}

function applyInventory(lamps, states) {
  const previousSelection = state.selectedLamp;
  state.lamps = lamps;
  state.lampMap = Object.fromEntries(lamps.map((lamp) => [lamp.name, lamp]));

  const nextStates = {};
  lamps.forEach((lamp) => {
    nextStates[lamp.name] = states[lamp.name] || state.states[lamp.name] || lamp.state || defaultLampState();
  });
  state.states = nextStates;

  const selectionStillValid = previousSelection === 'ALL' || (previousSelection && state.lampMap[previousSelection]);
  if (!selectionStillValid) {
    state.selectedLamp = lamps.length ? lamps[0].name : 'ALL';
  }
  if (!state.selectedLamp) {
    state.selectedLamp = lamps.length ? lamps[0].name : 'ALL';
  }

  persistSelectedLamp();
  renderLampSelector();
  renderSelectedLampState();
  renderAllManualControls();
  syncEditLampForm();
  loadDraftsForSelection();
}

function handleLampState(payload) {
  if (!payload?.lamp) {
    return;
  }
  state.states[payload.lamp] = payload.state;

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
  button.classList.add('lamp-button');
  if (state.selectedLamp === name) {
    button.classList.add('selected');
  }

  const lampState = name === 'ALL' ? lamp.state : state.states[name] || lamp.state;
  button.classList.add(lampState?.online ? 'online' : 'offline');

  button.dataset.lampName = name;
  button.setAttribute('aria-pressed', state.selectedLamp === name ? 'true' : 'false');
  button.innerHTML = `
    <span class="lamp-name">${name}</span>
    <span class="lamp-ip">${name === 'ALL' ? 'Все лампы' : `${lamp.ip}:${lamp.port}`}</span>
  `;
  return button;
}


function handleLampSelectorClick(event) {
  const lampButton = event.target.closest('.lamp-button');
  if (!lampButton || !dom.lampSelector.contains(lampButton)) {
    return;
  }

  const { lampName } = lampButton.dataset;
  if (!lampName) {
    return;
  }

  selectLamp(lampName);
}

function selectLamp(name) {
  persistCurrentDrafts();
  state.selectedLamp = name;
  persistSelectedLamp();
  renderLampSelector();
  renderSelectedLampState();
  renderAllManualControls();
  syncEditLampForm();
  loadDraftsForSelection();
}

function aggregateAllState() {
  return state.lamps.reduce((aggregated, lamp) => {
    const lampState = state.states[lamp.name] || lamp.state || defaultLampState();
    aggregated.online = aggregated.online || Boolean(lampState.online);
    return aggregated;
  }, { online: false });
}

function renderSelectedLampState() {
  const selected = state.selectedLamp;
  const isAllMode = selected === 'ALL';
  dom.selectedLampLabel.textContent = selected || '—';
  dom.manualControlSingle.classList.toggle('hidden', isAllMode);

  renderLampIndicators();
}

function renderLampIndicators() {
  dom.allLampsState.innerHTML = '';
  const lampsToRender = state.selectedLamp === 'ALL'
    ? state.lamps
    : state.lamps.filter((lamp) => lamp.name === state.selectedLamp);

  lampsToRender.forEach((lamp) => {
    const lampState = state.states[lamp.name] || lamp.state || defaultLampState();
    const card = document.createElement('div');
    card.className = `mini-lamp-card expanded ${lampState.online ? 'online' : 'offline'}`;
    card.innerHTML = `
      <div class="mini-lamp-header">
        <strong>${lamp.name}</strong>
        <span>${lamp.ip}:${lamp.port}</span>
      </div>
      <div class="mini-segments expanded-grid">
        ${renderMiniSegment('КРАСНЫЙ', lampState.red, 'red')}
        ${renderMiniSegment('ЖЁЛТЫЙ', lampState.yellow, 'yellow')}
        ${renderMiniSegment('ЗЕЛЁНЫЙ', lampState.green, 'green')}
        ${renderMiniSegment('СИНИЙ', lampState.blue, 'blue')}
      </div>
      <div class="mini-lamp-meta">
        <span>Источник: ${lampState.source || 'unknown'}</span>
        <span>Статус: ${lampState.online ? 'online' : 'offline'}</span>
        <span>Последний UDP: ${formatTimestamp(lampState.last_seen)}</span>
      </div>
    `;
    dom.allLampsState.appendChild(card);
  });
}

function renderAllManualControls() {
  const showAllControls = state.selectedLamp === 'ALL';
  dom.allManualControls.classList.toggle('hidden', !showAllControls);

  if (!showAllControls) {
    dom.allManualControls.innerHTML = '';
    return;
  }

  dom.allManualControls.innerHTML = '';
  dom.allManualControls.appendChild(createManualControlCard('ALL', 'Все лампы', 'Общее управление'));

  state.lamps.forEach((lamp) => {
    dom.allManualControls.appendChild(createManualControlCard(lamp.name, lamp.name, `${lamp.ip}:${lamp.port}`));
  });
}

function createManualControlCard(targetName, title, subtitle) {
  const card = document.createElement('div');
  card.className = `manual-lamp-card${targetName === 'ALL' ? ' manual-lamp-card-all' : ''}`;

  const header = document.createElement('div');
  header.className = 'manual-lamp-header';
  header.innerHTML = `<strong>${title}</strong><span>${subtitle}</span>`;

  const buttons = document.createElement('div');
  buttons.className = 'buttons grid-buttons compact-grid';
  [
    ['RED', 'red', 'Красный'],
    ['YELLOW', 'yellow', 'Жёлтый'],
    ['GREEN', 'green', 'Зелёный'],
    ['BLUE', 'blue', 'Синий'],
    ['OFF', 'off', 'Выключить']
  ].forEach(([command, colorClass, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn ${colorClass}`;
    button.textContent = label;
    button.addEventListener('click', () => sendCommand(command, targetName));
    buttons.appendChild(button);
  });

  card.appendChild(header);
  card.appendChild(buttons);
  return card;
}

function renderMiniSegment(label, active, color) {
  return `<span class="mini-segment ${color} ${active ? 'active' : ''}">${label}</span>`;
}

function renderPrograms() {
  dom.builtinPrograms.innerHTML = '';
  Object.entries(state.programs).forEach(([programKey, meta]) => {
    const card = document.createElement('div');
    card.className = 'program-item';

    const title = document.createElement('div');
    title.className = 'program-item-title';
    title.innerHTML = `<strong>${meta.name || programKey}</strong><span>${programKey}</span>`;

    const actions = document.createElement('div');
    actions.className = 'buttons compact';

    const runButton = document.createElement('button');
    runButton.type = 'button';
    runButton.className = 'btn';
    runButton.textContent = 'Запустить';
    runButton.addEventListener('click', () => runBuiltinProgram(programKey));

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn off';
    editButton.textContent = 'В редактор';
    editButton.addEventListener('click', () => loadProgramIntoEditor(programKey));

    actions.appendChild(runButton);
    actions.appendChild(editButton);
    card.appendChild(title);
    card.appendChild(actions);
    dom.builtinPrograms.appendChild(card);
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

function syncDebugButton() {
  document.getElementById('toggle-debug').textContent = debugEnabled ? 'DEBUG ON' : 'DEBUG OFF';
}

async function toggleDebug() {
  debugEnabled = !debugEnabled;
  const mode = debugEnabled ? 'on' : 'off';
  await fetch(`/api/logs/debug/${mode}`, { method: 'POST' });
  localStorage.setItem(STORAGE_KEYS.debug, debugEnabled ? 'on' : 'off');
  syncDebugButton();
}

function restoreLocalState() {
  const savedLamp = localStorage.getItem(STORAGE_KEYS.selectedLamp);

  if (savedLamp) {
    state.selectedLamp = savedLamp;
  }
  restoreProgramEditorMeta();
  renderBuiltProgram();
}

function restoreProgramEditorMeta() {
  const rawValue = localStorage.getItem(STORAGE_KEYS.programEditorMeta);
  if (!rawValue) {
    return;
  }

  try {
    const parsed = JSON.parse(rawValue);
    dom.standardProgramKey.value = typeof parsed.key === 'string' ? parsed.key : '';
    dom.standardProgramName.value = typeof parsed.name === 'string' ? parsed.name : '';
  } catch (_error) {
    dom.standardProgramKey.value = '';
    dom.standardProgramName.value = '';
  }
}

function persistProgramEditorMeta() {
  localStorage.setItem(STORAGE_KEYS.programEditorMeta, JSON.stringify({
    key: dom.standardProgramKey.value,
    name: dom.standardProgramName.value
  }));
}

function readDraftMap(storageKey) {
  const rawValue = localStorage.getItem(storageKey);
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function writeDraftMap(storageKey, value) {
  localStorage.setItem(storageKey, JSON.stringify(value));
}

function getDraftTarget() {
  return state.selectedLamp || 'ALL';
}

function persistBuiltProgram() {
  const drafts = readDraftMap(STORAGE_KEYS.builtProgram);
  drafts[getDraftTarget()] = state.builtProgram;
  writeDraftMap(STORAGE_KEYS.builtProgram, drafts);
}

function persistCurrentDrafts() {
  const target = getDraftTarget();

  const builtDrafts = readDraftMap(STORAGE_KEYS.builtProgram);
  builtDrafts[target] = state.builtProgram;
  writeDraftMap(STORAGE_KEYS.builtProgram, builtDrafts);

  const customDrafts = readDraftMap(STORAGE_KEYS.customProgram);
  customDrafts[target] = dom.customProgram.value;
  writeDraftMap(STORAGE_KEYS.customProgram, customDrafts);

  const phaseDrafts = readDraftMap(STORAGE_KEYS.phaseProgram);
  phaseDrafts[target] = dom.phaseProgram.value;
  writeDraftMap(STORAGE_KEYS.phaseProgram, phaseDrafts);
}

function loadDraftsForSelection() {
  const target = getDraftTarget();
  const builtDrafts = readDraftMap(STORAGE_KEYS.builtProgram);
  const customDrafts = readDraftMap(STORAGE_KEYS.customProgram);
  const phaseDrafts = readDraftMap(STORAGE_KEYS.phaseProgram);

  state.builtProgram = Array.isArray(builtDrafts[target]) ? builtDrafts[target] : [...DEFAULT_DRAFTS.builtProgram];
  dom.customProgram.value = typeof customDrafts[target] === 'string' ? customDrafts[target] : DEFAULT_DRAFTS.customProgram;
  dom.phaseProgram.value = typeof phaseDrafts[target] === 'string' ? phaseDrafts[target] : DEFAULT_DRAFTS.phaseProgram;
  restoreProgramEditorMeta();
  renderBuiltProgram();
}

function persistSelectedLamp() {
  localStorage.setItem(STORAGE_KEYS.selectedLamp, state.selectedLamp || 'ALL');
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

function toEditableProgramPayload(program) {
  const editableProgram = { ...program };
  delete editableProgram.name;
  return editableProgram;
}

function loadProgramIntoEditor(programKey) {
  const program = state.programs[programKey];
  if (!program) {
    setActionResult(`Стандартная программа ${programKey} не найдена.`, true);
    return;
  }

  dom.standardProgramKey.value = programKey;
  dom.standardProgramName.value = program.name || programKey;
  dom.customProgram.value = JSON.stringify(toEditableProgramPayload(program), null, 2);
  persistProgramEditorMeta();
  persistCurrentDrafts();
  setActionResult(`Программа ${programKey} загружена в JSON-редактор.`, false);
}

function syncEditLampForm() {
  const selectedLamp = state.selectedLamp && state.selectedLamp !== 'ALL'
    ? state.lampMap[state.selectedLamp]
    : null;

  Array.from(dom.editLampForm.elements).forEach((element) => {
    if (element.tagName === 'BUTTON' || element.type === 'button' || element.name) {
      element.disabled = !selectedLamp;
    }
  });

  if (!selectedLamp) {
    dom.editLampForm.reset();
    dom.editLampForm.querySelector('[name="port"]').value = 8888;
    return;
  }

  dom.editLampForm.querySelector('[name="name"]').value = selectedLamp.name;
  dom.editLampForm.querySelector('[name="ip"]').value = selectedLamp.ip;
  dom.editLampForm.querySelector('[name="port"]').value = selectedLamp.port;
}

function getSelectedTarget() {
  if (!state.selectedLamp) {
    throw new Error('Сначала выберите лампу или режим ALL.');
  }
  return state.selectedLamp;
}

function getEditableTarget() {
  const target = getSelectedTarget();
  if (target === 'ALL') {
    throw new Error('Для изменения настроек выберите конкретную лампу.');
  }
  return target;
}

async function sendCommand(command, targetOverride = null) {
  try {
    const target = targetOverride || getSelectedTarget();
    await apiRequest(`/api/lamp/${encodeURIComponent(target)}/command/${encodeURIComponent(command)}`, { method: 'POST' });
    setActionResult(`Команда ${command} отправлена для ${target}. Ожидаем UDP-подтверждение.`, false);
  } catch (error) {
    setActionResult(error.message, true);
  }
}

async function runBuiltinProgram(programKey) {
  try {
    const target = getSelectedTarget();
    await apiRequest(`/api/program/${encodeURIComponent(target)}/${encodeURIComponent(programKey)}`, { method: 'POST' });
    setActionResult(`Стандартная программа ${programKey} запущена для ${target}.`, false);
  } catch (error) {
    setActionResult(error.message, true);
  }
}

async function runCustomProgram() {
  try {
    const target = getSelectedTarget();
    const program = JSON.parse(dom.customProgram.value);
    await apiRequest(`/api/program/custom/${encodeURIComponent(target)}`, {
      method: 'POST',
      body: program
    });
    setActionResult(`JSON-программа запущена для ${target}.`, false);
  } catch (error) {
    setActionResult(error.message, true);
  }
}

async function runPhaseProgram() {
  try {
    const target = getSelectedTarget();
    const phasePayload = JSON.parse(dom.phaseProgram.value);
    await apiRequest(`/api/program/phase/${encodeURIComponent(target)}`, {
      method: 'POST',
      body: phasePayload
    });
    setActionResult(`Таблица фаз запущена для ${target}.`, false);
  } catch (error) {
    setActionResult(error.message, true);
  }
}

async function runBuiltProgram(repeat) {
  try {
    const target = getSelectedTarget();
    await apiRequest(`/api/program/custom/${encodeURIComponent(target)}`, {
      method: 'POST',
      body: {
        repeat,
        steps: state.builtProgram
      }
    });
    setActionResult(`Программа из конструктора запущена для ${target}.`, false);
  } catch (error) {
    setActionResult(error.message, true);
  }
}

async function stopProgram(target = null) {
  try {
    const resolvedTarget = target || getSelectedTarget();
    await apiRequest(`/api/program/stop/${encodeURIComponent(resolvedTarget)}`, { method: 'POST' });
    setActionResult(`Программа остановлена для ${resolvedTarget}.`, false);
  } catch (error) {
    setActionResult(error.message, true);
  }
}

async function submitAddLamp(event) {
  event.preventDefault();
  const formData = new FormData(dom.addLampForm);
  try {
    await apiRequest('/api/lamps', {
      method: 'POST',
      body: {
        name: formData.get('name'),
        ip: formData.get('ip'),
        port: Number(formData.get('port'))
      }
    });
    dom.addLampForm.reset();
    dom.addLampForm.querySelector('[name="port"]').value = 8888;
    setActionResult('Новая лампа добавлена. Ожидается поток состояния от устройства.', false);
  } catch (error) {
    setActionResult(error.message, true);
  }
}


async function submitStandardProgram(event) {
  event.preventDefault();
  try {
    const payload = {
      key: dom.standardProgramKey.value.trim(),
      name: dom.standardProgramName.value.trim(),
      program: JSON.parse(dom.customProgram.value)
    };
    const response = await apiRequest('/api/programs', {
      method: 'POST',
      body: payload
    });
    state.programs = response.programs || state.programs;
    renderPrograms();
    persistProgramEditorMeta();
    setActionResult(`Стандартная программа ${payload.name} сохранена.`, false);
  } catch (error) {
    setActionResult(error.message, true);
  }
}

async function submitEditLamp(event) {
  event.preventDefault();
  try {
    const target = getEditableTarget();
    const formData = new FormData(dom.editLampForm);
    const payload = {
      name: formData.get('name'),
      ip: formData.get('ip'),
      port: Number(formData.get('port'))
    };
    const response = await apiRequest(`/api/lamps/${encodeURIComponent(target)}`, {
      method: 'PUT',
      body: payload
    });
    if (response?.lamp?.name) {
      state.selectedLamp = response.lamp.name;
      persistSelectedLamp();
    }
    setActionResult(`Настройки лампы ${target} обновлены.`, false);
  } catch (error) {
    setActionResult(error.message, true);
  }
}

async function deleteLamp() {
  try {
    const target = getEditableTarget();
    if (!window.confirm(`Удалить лампу ${target}?`)) {
      return;
    }
    await apiRequest(`/api/lamps/${encodeURIComponent(target)}`, { method: 'DELETE' });
    if (state.selectedLamp === target) {
      state.selectedLamp = state.lamps.find((lamp) => lamp.name !== target)?.name || 'ALL';
      persistSelectedLamp();
    }
    setActionResult(`Лампа ${target} удалена.`, false);
  } catch (error) {
    setActionResult(error.message, true);
  }
}

async function apiRequest(url, { method = 'POST', body = null } = {}) {
  const response = await fetch(url, {
    method,
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

function defaultLampState() {
  return {
    red: false,
    blue: false,
    green: false,
    yellow: false,
    source: 'unknown',
    online: false,
    last_seen: null
  };
}

function formatTimestamp(timestamp) {
  return timestamp ? new Date(timestamp * 1000).toLocaleString('ru-RU') : 'нет данных';
}

bootstrapApp();
