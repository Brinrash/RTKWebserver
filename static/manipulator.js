const STORAGE = {
  selectedManipulator: 'manipulator_selected_id',
  selectedLamp: 'manipulator_selected_lamp',
  packetDraft: 'manipulator_packet_draft',
  comboDraft: 'manipulator_combo_json',
  uiTab: 'manipulator_active_tab',
  workDraft: 'manipulator_work_zone_draft',
};

const state = {
  socket: null,
  selectedManipulatorId: localStorage.getItem(STORAGE.selectedManipulator) || '',
  manipulators: [],
  lamps: [],
  zones: [],
  rules: [],
  axes: 5,
  currentM1: null,
  currentM2: null,
  currentZone: 'outside',
  programRunning: false,
  lampTarget: localStorage.getItem(STORAGE.selectedLamp) || 'ALL',
  recordTelemetry: true,
  packet: { angle: 180, distance: 220, head_angle: 0, lifted: 0, marker: 1, gripper: 0 },
  workDraft: [null, null, null, null],
};

const dom = {
  selector: document.getElementById('manipulator-selector'),
  online: document.getElementById('manipulator-online'),
  telemetryLog: document.getElementById('telemetry-log'),
  result: document.getElementById('manipulator-result'),
  preview: document.getElementById('manipulator-packet-preview'),
  targetPill: document.getElementById('manipulator-target'),
  packetForm: document.getElementById('manipulator-packet-form'),
  packetFields: document.getElementById('manipulator-packet-fields'),
  editForm: document.getElementById('manipulator-edit-form'),
  deleteBtn: document.getElementById('manipulator-delete-btn'),
  comboForm: document.getElementById('combo-program-form'),
  comboJson: document.getElementById('combo-program-json'),
  name: document.getElementById('edit-manip-name'),
  host: document.getElementById('edit-manip-host'),
  port: document.getElementById('edit-manip-port'),
  telemetryPort: document.getElementById('edit-manip-telemetry-port'),
  protocol: document.getElementById('edit-manip-protocol'),
  axes: document.getElementById('edit-manip-axes'),
  zoneForm: document.getElementById('zone-form'),
  zonesList: document.getElementById('zones-list'),
  lampSelector: document.getElementById('automation-lamp-selector'),
  ruleForm: document.getElementById('automation-rule-form'),
  rulesList: document.getElementById('rules-list'),
};

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Request failed');
  return payload;
}

function setResult(text, isError = false) {
  if (!dom.result) return;
  dom.result.textContent = text;
  dom.result.classList.remove('error', 'success');
  dom.result.classList.add(isError ? 'error' : 'success');
}

function appendManipulatorLog(text) {
  if (!state.recordTelemetry || !dom.telemetryLog) return;
  const line = document.createElement('div');
  line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  dom.telemetryLog.prepend(line);
  while (dom.telemetryLog.children.length > 300) dom.telemetryLog.removeChild(dom.telemetryLog.lastChild);
}

function renderTelemetry(data) {
  const axes = Number(data.axes || state.axes || 5);
  const angles = data.angles || [];
  state.currentM1 = angles.length > 0 ? Number(angles[0]) : state.currentM1;
  state.currentM2 = angles.length > 1 ? Number(angles[1]) : state.currentM2;
  renderCurrentStatus();
  for (let i = 1; i <= 6; i += 1) {
    const visible = i <= axes;
    ['a', 't', 'l'].forEach((prefix) => {
      const el = document.getElementById(`${prefix}${i}`);
      if (el) {
        const values = (prefix === 'a' ? data.angles : prefix === 't' ? data.temperatures : data.loads) || [];
        el.textContent = values[i - 1] ?? 0;
        el.closest('tr').hidden = !visible;
      }
    });
  }
  if (dom.online) {
    dom.online.textContent = data.online ? 'ONLINE' : 'OFFLINE';
    dom.online.classList.toggle('online', Boolean(data.online));
    dom.online.classList.toggle('offline', !data.online);
  }
}

function initSocket() {
  state.socket = io();
  state.socket.on('manipulator_log', (data) => {
    if (data.manipulator_id === state.selectedManipulatorId) appendManipulatorLog(data.packet);
  });
  state.socket.on('manipulator_state', (data) => {
    const incomingId = data.id || data.manipulator_id;
    if (!state.selectedManipulatorId || incomingId === state.selectedManipulatorId) renderTelemetry(data);
  });
  state.socket.on('automation_state', (data) => {
    if (data.manipulator_id === state.selectedManipulatorId) renderAutomationState(data);
  });
}

function getTargetPayload() {
  return { manipulator_id: state.selectedManipulatorId };
}

function savePacketDraft() {
  localStorage.setItem(STORAGE.packetDraft, JSON.stringify({ axes: state.axes, packet: state.packet }));
}

function loadDrafts() {
  try {
    const draft = JSON.parse(localStorage.getItem(STORAGE.packetDraft) || '{}');
    if (draft.packet) state.packet = { ...state.packet, ...draft.packet };
  } catch (error) { console.warn(error); }
  try {
    const workDraft = JSON.parse(localStorage.getItem(STORAGE.workDraft) || '[]');
    if (Array.isArray(workDraft) && workDraft.length === 4) state.workDraft = workDraft;
  } catch (error) { console.warn(error); }
  const comboDraft = localStorage.getItem(STORAGE.comboDraft);
  if (comboDraft && dom.comboJson) dom.comboJson.value = comboDraft;
}

function packetPreviewPayload() {
  if (state.axes === 6) {
    return `g:${state.packet.angle}:${state.packet.distance}:${state.packet.head_angle}:${state.packet.lifted}:${state.packet.gripper}`;
  }
  return `p:${state.packet.angle}:${state.packet.distance}:${state.packet.lifted}:0#`;
}

function renderPacketFields() {
  if (!dom.packetFields) return;
  const fields = state.axes === 6
    ? [['angle', 'Угол поворота'], ['distance', 'Расстояние'], ['head_angle', 'Угол поворота головы'], ['lifted', 'Поднят / опущен (0/1)'], ['gripper', 'Захват закрыт / открыт (0/1)']]
    : [['angle', 'Угол поворота'], ['distance', 'Расстояние'], ['lifted', 'Поднят / опущен (0/1)']];
  dom.packetFields.innerHTML = fields.map(([key, label]) => `
    <label>${label}<input data-packet-field="${key}" type="number" value="${state.packet[key] ?? 0}" /></label>
  `).join('');
  dom.packetFields.querySelectorAll('[data-packet-field]').forEach((input) => {
    input.addEventListener('input', () => {
      state.packet[input.dataset.packetField] = Number(input.value || 0);
      updatePacketPreview();
      savePacketDraft();
    });
  });
  updatePacketPreview();
}

function updatePacketPreview() {
  if (dom.preview) dom.preview.textContent = packetPreviewPayload();
}

async function sendShortCommand(command) {
  await apiRequest('/api/manipulator/command', { method: 'POST', body: { command, ...getTargetPayload() } });
  setResult(`Команда ${command} отправлена`);
}

async function sendPacket() {
  const body = state.axes === 6
    ? { angle: state.packet.angle, distance: state.packet.distance, head_angle: state.packet.head_angle, lifted: state.packet.lifted, gripper: state.packet.gripper, ...getTargetPayload() }
    : { angle: state.packet.angle, distance: state.packet.distance, lifted: state.packet.lifted, ...getTargetPayload() };
  const response = await apiRequest('/api/manipulator/packet', { method: 'POST', body });
  setResult(`Позиционная команда отправлена: ${response.payload}`);
}

async function loadManipulators() {
  const payload = await apiRequest('/api/manipulators');
  state.manipulators = payload.manipulators || [];
  if (!state.manipulators.length) return;
  const previous = state.selectedManipulatorId;
  const selectedStillExists = state.manipulators.some((m) => m.id === previous);
  const nextSelected = selectedStillExists ? previous : state.manipulators[0].id;
  const selectedChanged = nextSelected !== previous;
  dom.selector.innerHTML = state.manipulators.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
  state.selectedManipulatorId = nextSelected;
  dom.selector.value = state.selectedManipulatorId;
  if (selectedChanged || !state.editDirty) {
    await onManipulatorSelect({ preserveEditForm: !selectedChanged && state.editDirty });
  } else {
    updateTargetPillFromInventory();
  }
}

async function onManipulatorSelect(options = {}) {
  state.selectedManipulatorId = dom.selector.value;
  localStorage.setItem(STORAGE.selectedManipulator, state.selectedManipulatorId);
  const response = await apiRequest(`/api/manipulators/${encodeURIComponent(state.selectedManipulatorId)}`);
  const manip = response.manipulator;
  state.axes = Number(manip.axes || 5);
  if (!options.preserveEditForm) {
    if (dom.name) dom.name.value = manip.name || '';
    if (dom.host) dom.host.value = manip.host || '';
    if (dom.port) dom.port.value = manip.command_port || 8888;
    if (dom.telemetryPort) dom.telemetryPort.value = manip.telemetry_port || 9090;
    if (dom.protocol) dom.protocol.value = manip.protocol || 'udp';
    if (dom.axes) dom.axes.value = String(state.axes);
    state.editDirty = false;
  }
  if (dom.targetPill) dom.targetPill.textContent = `${manip.name} • ${manip.host}:${manip.command_port} • ${state.axes} осей`;
  renderPacketFields();
  await Promise.all([loadZones(), loadRules(), loadAutomationState(), loadLamps()]);
}

function updateTargetPillFromInventory() {
  const manip = state.manipulators.find((item) => item.id === state.selectedManipulatorId);
  if (manip && dom.targetPill) {
    dom.targetPill.textContent = `${manip.name} • ${manip.host}:${manip.command_port} • ${manip.axes || state.axes} осей`;
  }
}

async function loadZones() {
  if (!state.selectedManipulatorId) return;
  const payload = await apiRequest(`/api/manipulator/zones/${encodeURIComponent(state.selectedManipulatorId)}`);
  state.zones = payload.zones || [];
  renderZones();
}

async function saveZones() {
  await apiRequest(`/api/manipulator/zones/${encodeURIComponent(state.selectedManipulatorId)}`, { method: 'POST', body: { zones: state.zones } });
  renderZones();
  setResult('Зоны сохранены');
}

async function loadAutomationState() {
  if (!state.selectedManipulatorId) return;
  const payload = await apiRequest(`/api/automation/state/${encodeURIComponent(state.selectedManipulatorId)}`);
  renderAutomationState(payload);
}

function renderAutomationState(data) {
  state.currentM1 = data.current_m1 ?? state.currentM1;
  state.currentM2 = data.current_m2 ?? state.currentM2;
  state.currentZone = data.current_zone || 'outside';
  state.programRunning = Boolean(data.program_running);
  state.lampTarget = data.lamp_target || state.lampTarget || 'ALL';
  localStorage.setItem(STORAGE.selectedLamp, state.lampTarget);
  renderCurrentStatus();
  renderLampSelector();
}

function renderCurrentStatus() {
  const pairs = [
    ['current-m1', state.currentM1 ?? '—'],
    ['current-m2', state.currentM2 ?? '—'],
    ['current-zone', state.currentZone],
    ['program-running', String(state.programRunning)],
    ['zones-current-m1', state.currentM1 ?? '—'],
    ['zones-current-m2', state.currentM2 ?? '—'],
    ['zones-current-zone', state.currentZone],
    ['zones-program-running', String(state.programRunning)],
    ['automation-current-m1', state.currentM1 ?? '—'],
    ['automation-current-m2', state.currentM2 ?? '—'],
    ['automation-current-zone', state.currentZone],
    ['automation-program-running', String(state.programRunning)],
  ];
  pairs.forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });
}

function currentTelemetryPoint() {
  if (state.currentM1 === null || state.currentM2 === null || Number.isNaN(state.currentM1) || Number.isNaN(state.currentM2)) {
    throw new Error('Нет текущей телеметрии M1/M2');
  }
  return [Number(state.currentM1), Number(state.currentM2)];
}

function parkingZone() {
  return state.zones.find((zone) => zone.name === 'parking' && zone.type === 'point');
}

function workZone() {
  return state.zones.find((zone) => zone.name === 'work' && zone.type === 'polygon');
}

function upsertZone(zone) {
  const index = state.zones.findIndex((item) => item.name === zone.name);
  if (index === -1) state.zones.push(zone); else state.zones[index] = zone;
}

async function loadLamps() {
  const payload = await apiRequest('/api/lamps');
  state.lamps = payload.lamps || [];
  renderLampSelector();
}

function renderLampSelector() {
  if (!dom.lampSelector) return;
  const options = [{ name: 'ALL' }, ...state.lamps];
  dom.lampSelector.innerHTML = options.map((lamp) => `<option value="${lamp.name}">${lamp.name}</option>`).join('');
  dom.lampSelector.value = state.lampTarget || 'ALL';
}

async function saveLampTarget() {
  if (!state.selectedManipulatorId || !dom.lampSelector) return;
  state.lampTarget = dom.lampSelector.value || 'ALL';
  localStorage.setItem(STORAGE.selectedLamp, state.lampTarget);
  await apiRequest(`/api/automation/lamp-target/${encodeURIComponent(state.selectedManipulatorId)}`, { method: 'POST', body: { lamp_target: state.lampTarget } });
  setResult(`Лампа для манипулятора: ${state.lampTarget}`);
}

function renderZones() {
  if (!dom.zonesList) return;
  const parking = parkingZone();
  const work = workZone();
  if (work?.points?.length === 4) state.workDraft = work.points.map((point) => [...point]);
  const parkingToleranceM1 = document.getElementById('parking-tolerance-m1');
  const parkingToleranceM2 = document.getElementById('parking-tolerance-m2');
  if (parking && parkingToleranceM1) parkingToleranceM1.value = parking.tolerance_m1 ?? 50;
  if (parking && parkingToleranceM2) parkingToleranceM2.value = parking.tolerance_m2 ?? 50;
  const parkingText = parking
    ? `M1=${parking.m1}, M2=${parking.m2}, tolerance=±${parking.tolerance_m1}/${parking.tolerance_m2}`
    : 'Парковка не сохранена';
  const draftText = state.workDraft
    .map((point, index) => `Угол ${index + 1}: ${point ? `[${point[0]}, ${point[1]}]` : 'не задан'}`)
    .join('<br>');
  const workText = work ? draftText : `Рабочая зона не сохранена<br>${draftText}`;
  dom.zonesList.innerHTML = `
    <div class="program-item"><div><strong>parking</strong><br><span class="hint">${parkingText}</span></div><div class="buttons"><button class="btn off" data-zone-delete-name="parking">Удалить</button></div></div>
    <div class="program-item"><div><strong>work</strong><br><span class="hint">${workText}</span></div><div class="buttons"><button class="btn off" data-zone-delete-name="work">Удалить</button></div></div>
  `;
}

async function loadRules() {
  const payload = await apiRequest('/api/automation/rules');
  state.rules = payload.rules || [];
  renderRules();
}

async function saveRules() {
  await apiRequest('/api/automation/rules', { method: 'POST', body: { rules: state.rules } });
  renderRules();
  setResult('Правила автоматизации сохранены');
}

function renderRules() {
  if (!dom.rulesList) return;
  dom.rulesList.innerHTML = state.rules.map((rule, index) => {
    const running = Object.prototype.hasOwnProperty.call(rule.when, 'program_running') ? ` И program_running = ${rule.when.program_running}` : '';
    return `<div class="program-item"><div><strong>Если zone = ${rule.when.zone || 'outside'}${running}</strong><br><span class="hint">То lamp_command = ${rule.then.lamp_command}</span></div><div class="buttons"><button class="btn secondary" data-rule-edit="${index}">Редактировать</button><button class="btn off" data-rule-delete="${index}">Удалить</button></div></div>`;
  }).join('') || '<p class="hint">Правила пока не созданы.</p>';
}

function bindTabs() {
  const tabs = document.querySelectorAll('[data-manip-tab]');
  const panels = document.querySelectorAll('[data-manip-panel]');
  const activate = (tab) => {
    tabs.forEach((button) => button.classList.toggle('active', button.dataset.manipTab === tab));
    panels.forEach((panel) => { panel.hidden = panel.dataset.manipPanel !== tab; });
    localStorage.setItem(STORAGE.uiTab, tab);
  };
  tabs.forEach((button) => button.addEventListener('click', () => activate(button.dataset.manipTab)));
  activate(localStorage.getItem(STORAGE.uiTab) || 'control');
}

function bindButtons() {
  document.querySelectorAll('[data-manipulator-command]').forEach((btn) => btn.addEventListener('click', async () => {
    try { await sendShortCommand(btn.dataset.manipulatorCommand); } catch (error) { setResult(error.message, true); }
  }));
  document.querySelectorAll('[data-axis-step]').forEach((btn) => btn.addEventListener('click', () => {
    const key = btn.dataset.axisStep;
    state.packet[key] = Number(state.packet[key] || 0) + Number(btn.dataset.step || 0);
    renderPacketFields();
    savePacketDraft();
  }));
  dom.packetForm?.addEventListener('submit', async (event) => { event.preventDefault(); try { await sendPacket(); } catch (error) { setResult(error.message, true); } });
  dom.selector?.addEventListener('change', () => { state.editDirty = false; onManipulatorSelect(); });
  dom.editForm?.addEventListener('input', () => { state.editDirty = true; });

  document.getElementById('manip-record-toggle')?.addEventListener('click', (event) => {
    state.recordTelemetry = !state.recordTelemetry;
    event.currentTarget.textContent = state.recordTelemetry ? 'RECORD ON' : 'RECORD OFF';
    event.currentTarget.classList.toggle('active', state.recordTelemetry);
  });
  document.getElementById('manip-clear-log')?.addEventListener('click', () => { if (dom.telemetryLog) dom.telemetryLog.innerHTML = ''; });
  document.getElementById('manipulator-create-btn')?.addEventListener('click', async () => {
    try {
      const response = await apiRequest('/api/manipulators', { method: 'POST', body: editPayload() });
      state.selectedManipulatorId = response.manipulator.id;
      state.editDirty = false;
      await loadManipulators();
      setResult('Манипулятор добавлен');
    } catch (error) { setResult(error.message, true); }
  });
  dom.editForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await apiRequest(`/api/manipulators/${encodeURIComponent(state.selectedManipulatorId)}`, { method: 'PUT', body: editPayload() }); state.editDirty = false; await loadManipulators(); setResult('Манипулятор сохранён'); } catch (error) { setResult(error.message, true); }
  });
  dom.deleteBtn?.addEventListener('click', async () => {
    try { await apiRequest(`/api/manipulators/${encodeURIComponent(state.selectedManipulatorId)}`, { method: 'DELETE' }); state.selectedManipulatorId = ''; state.editDirty = false; await loadManipulators(); setResult('Манипулятор удалён'); } catch (error) { setResult(error.message, true); }
  });
}

function editPayload() {
  return { name: dom.name.value, host: dom.host.value, command_port: Number(dom.port.value), telemetry_port: Number(dom.telemetryPort.value), protocol: dom.protocol.value, axes: Number(dom.axes.value) };
}

function bindZonesAndRules() {
  document.getElementById('remember-parking')?.addEventListener('click', async () => {
    try {
      const [m1, m2] = currentTelemetryPoint();
      upsertZone({
        name: 'parking',
        type: 'point',
        m1,
        m2,
        tolerance_m1: Number(document.getElementById('parking-tolerance-m1')?.value || 50),
        tolerance_m2: Number(document.getElementById('parking-tolerance-m2')?.value || 50),
      });
      await saveZones();
      setResult(`Парковка сохранена: M1=${m1}, M2=${m2}`);
    } catch (error) { setResult(error.message, true); }
  });

  document.querySelectorAll('[data-remember-work-corner]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const [m1, m2] = currentTelemetryPoint();
        const index = Number(button.dataset.rememberWorkCorner);
        state.workDraft[index] = [m1, m2];
        localStorage.setItem(STORAGE.workDraft, JSON.stringify(state.workDraft));
        if (state.workDraft.every(Boolean)) {
          upsertZone({ name: 'work', type: 'polygon', points: state.workDraft.map((point) => [...point]) });
          await saveZones();
          setResult(`Рабочая зона создана. Угол ${index + 1}: M1=${m1}, M2=${m2}`);
        } else {
          renderZones();
          setResult(`Угол ${index + 1} сохранён локально: M1=${m1}, M2=${m2}`);
        }
      } catch (error) { setResult(error.message, true); }
    });
  });

  dom.zonesList?.addEventListener('click', async (event) => {
    const del = event.target.closest('[data-zone-delete-name]');
    if (del) {
      state.zones = state.zones.filter((zone) => zone.name !== del.dataset.zoneDeleteName);
      if (del.dataset.zoneDeleteName === 'work') {
        state.workDraft = [null, null, null, null];
        localStorage.setItem(STORAGE.workDraft, JSON.stringify(state.workDraft));
      }
      await saveZones();
    }
  });

  dom.lampSelector?.addEventListener('change', async () => {
    try { await saveLampTarget(); } catch (error) { setResult(error.message, true); }
  });

  dom.ruleForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const index = document.getElementById('rule-index').value;
    const when = { zone: document.getElementById('rule-zone').value.trim() || 'outside' };
    const running = document.getElementById('rule-running').value;
    if (running !== 'any') when.program_running = running === 'true';
    const rule = { when, then: { lamp_command: document.getElementById('rule-command').value } };
    if (index === '') state.rules.push(rule); else state.rules[Number(index)] = rule;
    document.getElementById('rule-index').value = '';
    dom.ruleForm.reset();
    await saveRules();
  });
  document.getElementById('rule-reset')?.addEventListener('click', () => { document.getElementById('rule-index').value = ''; dom.ruleForm.reset(); });
  dom.rulesList?.addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-rule-edit]');
    const del = event.target.closest('[data-rule-delete]');
    if (edit) {
      const index = Number(edit.dataset.ruleEdit); const rule = state.rules[index];
      document.getElementById('rule-index').value = index;
      document.getElementById('rule-zone').value = rule.when.zone || 'outside';
      document.getElementById('rule-running').value = Object.prototype.hasOwnProperty.call(rule.when, 'program_running') ? String(rule.when.program_running) : 'any';
      document.getElementById('rule-command').value = rule.then.lamp_command;
    }
    if (del) { state.rules.splice(Number(del.dataset.ruleDelete), 1); await saveRules(); }
  });
}

dom.comboJson?.addEventListener('input', () => localStorage.setItem(STORAGE.comboDraft, dom.comboJson.value));
dom.comboForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const program = JSON.parse(dom.comboJson.value);
    await apiRequest('/api/program/combined/run', { method: 'POST', body: { program, ...getTargetPayload() } });
    setResult('JSON программа выполнена');
  } catch (error) { setResult(error.message, true); }
});

async function bootstrap() {
  loadDrafts();
  initSocket();
  bindTabs();
  bindButtons();
  bindZonesAndRules();
  await loadManipulators();
  setInterval(loadManipulators, 5000);
}

window.addEventListener('DOMContentLoaded', bootstrap);
