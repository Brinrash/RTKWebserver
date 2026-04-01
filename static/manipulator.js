const STORAGE_KEYS = {
  host: 'manipulator_host',
  port: 'manipulator_port',
  protocol: 'manipulator_protocol',
  angle: 'manipulator_angle',
  distance: 'manipulator_distance',
  marker: 'manipulator_marker',
  targets: 'manipulator_targets'
};

const dom = {
  targetForm: document.getElementById('manipulator-target-form'),
  host: document.getElementById('manipulator-host'),
  port: document.getElementById('manipulator-port'),
  protocol: document.getElementById('manipulator-protocol'),
  packetForm: document.getElementById('manipulator-packet-form'),
  angle: document.getElementById('manipulator-angle'),
  distance: document.getElementById('manipulator-distance'),
  marker: document.getElementById('manipulator-marker'),
  result: document.getElementById('manipulator-result'),
  preview: document.getElementById('manipulator-packet-preview'),
  targetPill: document.getElementById('manipulator-target'),
  limits: document.getElementById('manipulator-limits'),
  manipulatorTelemetry: document.getElementById('manipulator-telemetry'),
  palletizerTelemetry: document.getElementById('palletizer-telemetry'),
  terminalLights: document.getElementById('remote-terminal-lights'),
  traffic1: document.getElementById('traffic-lights-1'),
  traffic2: document.getElementById('traffic-lights-2'),
  savedTargets: document.getElementById('manipulator-saved-targets'),
  addTargetButton: document.getElementById('add-manipulator-target')
};

const state = {
  limits: null,
  targets: []
};

function bootstrap() {
  bindEvents();
  renderStaticWidgets();
  fetchConfig();
}

function bindEvents() {
  dom.targetForm.addEventListener('input', () => {
    persistTargetSettings();
    updateTargetPill();
    updatePreview();
  });

  dom.savedTargets.addEventListener('change', handleTargetSelect);
  dom.addTargetButton.addEventListener('click', addCurrentTarget);

  dom.packetForm.addEventListener('submit', submitPacket);
  dom.angle.addEventListener('input', () => {
    persistPacketDraft();
    updatePreview();
  });
  dom.distance.addEventListener('input', () => {
    persistPacketDraft();
    updatePreview();
  });
  dom.marker.addEventListener('change', () => {
    persistPacketDraft();
    updatePreview();
  });

  document.querySelectorAll('[data-manipulator-command]').forEach((button) => {
    button.addEventListener('click', () => sendShortCommand(button.dataset.manipulatorCommand));
  });

  document.querySelectorAll('[data-axis-step]').forEach((button) => {
    button.addEventListener('click', () => {
      const field = button.dataset.axisStep === 'angle' ? dom.angle : dom.distance;
      const delta = Number(button.dataset.step || 0);
      const current = Number(field.value || 0);
      field.value = String(current + delta);
      persistPacketDraft();
      updatePreview();
    });
  });

  document.querySelectorAll('[data-toolbar-action]').forEach((button) => {
    button.addEventListener('click', () => handleToolbarAction(button.dataset.toolbarAction));
  });
}

function handleToolbarAction(action) {
  if (action === 'reload') {
    fetchConfig();
    setResult('Настройки обновлены.', false);
    return;
  }

  if (action === 'toggle-preview') {
    dom.preview.classList.toggle('hidden');
    return;
  }

  if (action === 'toggle-limits') {
    dom.limits.classList.toggle('hidden');
  }
}

function renderStaticWidgets() {
  renderTelemetry(dom.manipulatorTelemetry, [
    ['Motor_1', 'Motor_2', 'Motor_3', 'Motor_4', 'Motor_5', 'Motor_6'],
    ['Load_1', 'Load_2', 'Load_3', 'Load_4', 'Load_5', 'Load_6'],
    ['Temp_1', 'Temp_2', 'Temp_3', 'Temp_4', 'Temp_5', 'Temp_6']
  ]);

  renderTelemetry(dom.palletizerTelemetry, [
    ['Motor_1', 'Motor_2', 'Motor_3', 'Motor_4', 'Motor_5'],
    ['Load_1', 'Load_2', 'Load_3', 'Load_4', 'Load_5'],
    ['Temp_1', 'Temp_2', 'Temp_3', 'Temp_4', 'Temp_5']
  ]);

  dom.terminalLights.innerHTML = ['L1', 'L2', 'L3', 'L4']
    .map((name) => `<div><div class="label">${name}</div><div class="signal-box"></div></div>`)
    .join('');

  const lampTemplate = ['L1', 'L2', 'L3', 'L4']
    .map((name) => `<div><div class="label">${name}</div><div class="lamp-box"></div></div>`)
    .join('');

  dom.traffic1.innerHTML = lampTemplate;
  dom.traffic2.innerHTML = lampTemplate;
}

function renderTelemetry(container, rows) {
  container.innerHTML = rows
    .map((row) => `
      <div class="telemetry-row" style="grid-template-columns: repeat(${row.length}, minmax(0, 1fr));">
        ${row.map((label) => `<div class="telemetry-cell">${label}<br>0</div>`).join('')}
      </div>
    `)
    .join('');
}

async function fetchConfig() {
  const response = await fetch('/api/manipulator/config');
  const config = await response.json();
  state.limits = config.limits || {};
  restoreSettings(config);
  restoreSavedTargets();
  renderLimits();
  updateTargetPill();
  updatePreview();
}

function restoreSettings(config) {
  dom.host.value = localStorage.getItem(STORAGE_KEYS.host) || config.default_host || '';
  dom.port.value = localStorage.getItem(STORAGE_KEYS.port) || config.default_port || '';
  dom.protocol.value = localStorage.getItem(STORAGE_KEYS.protocol) || config.default_protocol || 'udp';
  dom.angle.value = localStorage.getItem(STORAGE_KEYS.angle) || state.limits.min_rot || '';
  dom.distance.value = localStorage.getItem(STORAGE_KEYS.distance) || state.limits.min_dist || '';
  dom.marker.value = localStorage.getItem(STORAGE_KEYS.marker) || '0';
}

function restoreSavedTargets() {
  const rawValue = localStorage.getItem(STORAGE_KEYS.targets);
  try {
    state.targets = rawValue ? JSON.parse(rawValue) : [];
  } catch (_error) {
    state.targets = [];
  }
  renderSavedTargets();
}

function renderSavedTargets() {
  const options = ['<option value="">Сохранённые манипуляторы</option>'];
  state.targets.forEach((target, index) => {
    options.push(`<option value="${index}">${target.host}:${target.port} (${target.protocol.toUpperCase()})</option>`);
  });
  dom.savedTargets.innerHTML = options.join('');
}

function handleTargetSelect() {
  const index = Number(dom.savedTargets.value);
  if (!Number.isInteger(index) || index < 0 || !state.targets[index]) {
    return;
  }
  const target = state.targets[index];
  dom.host.value = target.host;
  dom.port.value = target.port;
  dom.protocol.value = target.protocol;
  persistTargetSettings();
  updateTargetPill();
}

function addCurrentTarget() {
  const target = {
    host: dom.host.value.trim(),
    port: dom.port.value.trim(),
    protocol: dom.protocol.value
  };

  if (!target.host || !target.port) {
    setResult('Чтобы добавить манипулятор, заполните host и порт.', true);
    return;
  }

  const exists = state.targets.some((item) => item.host === target.host && item.port === target.port && item.protocol === target.protocol);
  if (exists) {
    setResult('Такой манипулятор уже добавлен.', true);
    return;
  }

  state.targets.push(target);
  localStorage.setItem(STORAGE_KEYS.targets, JSON.stringify(state.targets));
  renderSavedTargets();
  setResult(`Манипулятор ${target.host}:${target.port} добавлен.`, false);
}

function persistTargetSettings() {
  localStorage.setItem(STORAGE_KEYS.host, dom.host.value);
  localStorage.setItem(STORAGE_KEYS.port, dom.port.value);
  localStorage.setItem(STORAGE_KEYS.protocol, dom.protocol.value);
}

function persistPacketDraft() {
  localStorage.setItem(STORAGE_KEYS.angle, dom.angle.value);
  localStorage.setItem(STORAGE_KEYS.distance, dom.distance.value);
  localStorage.setItem(STORAGE_KEYS.marker, dom.marker.value);
}

function getTargetPayload() {
  return {
    host: dom.host.value.trim(),
    port: Number(dom.port.value),
    protocol: dom.protocol.value
  };
}

function updateTargetPill() {
  dom.targetPill.textContent = `${dom.protocol.value.toUpperCase()} ${dom.host.value || '—'}:${dom.port.value || '—'}`;
}

function updatePreview() {
  dom.preview.textContent = `p:${dom.angle.value || '?'}:${dom.distance.value || '?'}:${dom.marker.value || '?'}#`;
}

function renderLimits() {
  if (!state.limits) {
    dom.limits.innerHTML = '';
    return;
  }

  const items = [
    ['Угол', `${state.limits.min_rot} — ${state.limits.max_rot}`],
    ['Расстояние', `${state.limits.min_dist} — ${state.limits.max_dist}`],
    ['Высота захвата', `${state.limits.cargo_pos_z}`],
    ['Высота над грузом', `${state.limits.above_cargo_z}`]
  ];

  dom.limits.innerHTML = items
    .map(
      ([label, value]) => `
    <div class="meta-card">
      <span class="label">${label}</span>
      <strong>${value}</strong>
    </div>
  `
    )
    .join('');

  dom.angle.min = state.limits.min_rot;
  dom.angle.max = state.limits.max_rot;
  dom.distance.min = state.limits.min_dist;
  dom.distance.max = state.limits.max_dist;
}

async function sendShortCommand(command) {
  try {
    const response = await apiRequest('/api/manipulator/command', {
      method: 'POST',
      body: {
        command,
        ...getTargetPayload()
      }
    });
    setResult(`Команда ${response.payload} отправлена на ${response.host}:${response.port} (${response.protocol.toUpperCase()}).`, false);
  } catch (error) {
    setResult(error.message, true);
  }
}

async function submitPacket(event) {
  event.preventDefault();
  persistTargetSettings();
