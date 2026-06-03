const STORAGE = {
  selectedManipulator: 'manipulator_selected_id',
  selectedLamp: 'manipulator_selected_lamp',
  packetDraft: 'manipulator_packet_draft',
  comboDraft: 'manipulator_combo_json',
  uiTab: 'manipulator_active_tab',
};

const state = {
  socket: null,
  selectedManipulatorId: localStorage.getItem(STORAGE.selectedManipulator) || '',
  manipulators: [],
  zones: [],
  rules: [],
  axes: 5,
  recordTelemetry: true,
  packet: { angle: 180, distance: 220, marker: 1, gripper: 0, a1: 180, a2: 220, a3: 0, a4: 0, a5: 0 },
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
  const comboDraft = localStorage.getItem(STORAGE.comboDraft);
  if (comboDraft && dom.comboJson) dom.comboJson.value = comboDraft;
}

function packetPreviewPayload() {
  if (state.axes === 6) {
    return `p:${state.packet.a1}:${state.packet.a2}:${state.packet.a3}:${state.packet.a4}:${state.packet.a5}:${state.packet.marker}#`;
  }
  return `p:${state.packet.angle}:${state.packet.distance}:${state.packet.marker}:${state.packet.gripper}#`;
}

function renderPacketFields() {
  if (!dom.packetFields) return;
  const fields = state.axes === 6
    ? [['a1', 'A1 / angle'], ['a2', 'A2 / distance'], ['a3', 'A3'], ['a4', 'A4'], ['a5', 'A5'], ['marker', 'Marker']]
    : [['angle', 'Angle'], ['distance', 'Distance'], ['marker', 'Marker'], ['gripper', 'Gripper']];
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
    ? { a1: state.packet.a1, a2: state.packet.a2, a3: state.packet.a3, a4: state.packet.a4, a5: state.packet.a5, marker: state.packet.marker, gripper: state.packet.gripper, ...getTargetPayload() }
    : { angle: state.packet.angle, distance: state.packet.distance, marker: state.packet.marker, gripper: state.packet.gripper, ...getTargetPayload() };
  const response = await apiRequest('/api/manipulator/packet', { method: 'POST', body });
  setResult(`Позиционная команда отправлена: ${response.payload}`);
}

async function loadManipulators() {
  const payload = await apiRequest('/api/manipulators');
  state.manipulators = payload.manipulators || [];
  if (!state.manipulators.length) return;
  const previous = state.selectedManipulatorId;
  dom.selector.innerHTML = state.manipulators.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
  state.selectedManipulatorId = state.manipulators.some((m) => m.id === previous) ? previous : state.manipulators[0].id;
  dom.selector.value = state.selectedManipulatorId;
  await onManipulatorSelect();
}

async function onManipulatorSelect() {
  state.selectedManipulatorId = dom.selector.value;
  localStorage.setItem(STORAGE.selectedManipulator, state.selectedManipulatorId);
  const response = await apiRequest(`/api/manipulators/${encodeURIComponent(state.selectedManipulatorId)}`);
  const manip = response.manipulator;
  state.axes = Number(manip.axes || 5);
  if (dom.name) dom.name.value = manip.name || '';
  if (dom.host) dom.host.value = manip.host || '';
  if (dom.port) dom.port.value = manip.command_port || 8888;
  if (dom.telemetryPort) dom.telemetryPort.value = manip.telemetry_port || 9090;
  if (dom.protocol) dom.protocol.value = manip.protocol || 'udp';
  if (dom.axes) dom.axes.value = String(state.axes);
  if (dom.targetPill) dom.targetPill.textContent = `${manip.name} • ${manip.host}:${manip.command_port} • ${state.axes} осей`;
  renderPacketFields();
  await Promise.all([loadZones(), loadRules()]);
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

function renderZones() {
  if (!dom.zonesList) return;
  dom.zonesList.innerHTML = state.zones.map((zone, index) => `
    <div class="program-item">
      <div><strong>${zone.name}</strong><br><span class="hint">angle ${zone.angle_min}…${zone.angle_max}, distance ${zone.distance_min}…${zone.distance_max}</span></div>
      <div class="buttons"><button class="btn secondary" data-zone-edit="${index}">Редактировать</button><button class="btn off" data-zone-delete="${index}">Удалить</button></div>
    </div>
  `).join('') || '<p class="hint">Зоны пока не созданы.</p>';
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
    const key = state.axes === 6 && btn.dataset.axisStep === 'angle' ? 'a1' : state.axes === 6 ? 'a2' : btn.dataset.axisStep;
    state.packet[key] = Number(state.packet[key] || 0) + Number(btn.dataset.step || 0);
    renderPacketFields();
    savePacketDraft();
  }));
  dom.packetForm?.addEventListener('submit', async (event) => { event.preventDefault(); try { await sendPacket(); } catch (error) { setResult(error.message, true); } });
  dom.selector?.addEventListener('change', onManipulatorSelect);

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
      await loadManipulators();
      setResult('Манипулятор добавлен');
    } catch (error) { setResult(error.message, true); }
  });
  dom.editForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await apiRequest(`/api/manipulators/${encodeURIComponent(state.selectedManipulatorId)}`, { method: 'PUT', body: editPayload() }); await loadManipulators(); setResult('Манипулятор сохранён'); } catch (error) { setResult(error.message, true); }
  });
  dom.deleteBtn?.addEventListener('click', async () => {
    try { await apiRequest(`/api/manipulators/${encodeURIComponent(state.selectedManipulatorId)}`, { method: 'DELETE' }); state.selectedManipulatorId = ''; await loadManipulators(); setResult('Манипулятор удалён'); } catch (error) { setResult(error.message, true); }
  });
}

function editPayload() {
  return { name: dom.name.value, host: dom.host.value, command_port: Number(dom.port.value), telemetry_port: Number(dom.telemetryPort.value), protocol: dom.protocol.value, axes: Number(dom.axes.value) };
}

function bindZonesAndRules() {
  dom.zoneForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const index = document.getElementById('zone-index').value;
    const zone = { name: document.getElementById('zone-name').value.trim(), angle_min: Number(document.getElementById('zone-angle-min').value), angle_max: Number(document.getElementById('zone-angle-max').value), distance_min: Number(document.getElementById('zone-distance-min').value), distance_max: Number(document.getElementById('zone-distance-max').value) };
    if (index === '') state.zones.push(zone); else state.zones[Number(index)] = zone;
    document.getElementById('zone-index').value = '';
    dom.zoneForm.reset();
    await saveZones();
  });
  document.getElementById('zone-reset')?.addEventListener('click', () => { document.getElementById('zone-index').value = ''; dom.zoneForm.reset(); });
  dom.zonesList?.addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-zone-edit]');
    const del = event.target.closest('[data-zone-delete]');
    if (edit) {
      const index = Number(edit.dataset.zoneEdit); const zone = state.zones[index];
      document.getElementById('zone-index').value = index;
      document.getElementById('zone-name').value = zone.name;
      document.getElementById('zone-angle-min').value = zone.angle_min;
      document.getElementById('zone-angle-max').value = zone.angle_max;
      document.getElementById('zone-distance-min').value = zone.distance_min;
      document.getElementById('zone-distance-max').value = zone.distance_max;
    }
    if (del) { state.zones.splice(Number(del.dataset.zoneDelete), 1); await saveZones(); }
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
