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
  savedTargets: document.getElementById('manipulator-saved-targets'),
  saveTargetButton: document.getElementById('save-manipulator-target'),
  packetForm: document.getElementById('manipulator-packet-form'),
  angle: document.getElementById('manipulator-angle'),
  distance: document.getElementById('manipulator-distance'),
  marker: document.getElementById('manipulator-marker'),
  result: document.getElementById('manipulator-result'),
  preview: document.getElementById('manipulator-packet-preview'),
  targetPill: document.getElementById('manipulator-target'),
  limits: document.getElementById('manipulator-limits')
};

const state = {
  limits: null,
  targets: []
};

function bootstrap() {
  bindEvents();
  fetchConfig();
}

function bindEvents() {
  dom.targetForm.addEventListener('input', handleTargetFormChange);
  dom.savedTargets.addEventListener('change', handleSelectSavedTarget);
  dom.saveTargetButton.addEventListener('click', saveCurrentTarget);

  dom.packetForm.addEventListener('submit', submitPacket);
  dom.angle.addEventListener('input', handlePacketDraftChange);
  dom.distance.addEventListener('input', handlePacketDraftChange);
  dom.marker.addEventListener('change', handlePacketDraftChange);

  document.querySelectorAll('[data-manipulator-command]').forEach((button) => {
    button.addEventListener('click', () => sendShortCommand(button.dataset.manipulatorCommand));
  });

  document.querySelectorAll('[data-axis-step]').forEach((button) => {
    button.addEventListener('click', () => {
      stepPacketField(button.dataset.axisStep, Number(button.dataset.step || 0));
    });
  });
}

async function fetchConfig() {
  try {
    const response = await fetch('/api/manipulator/config');
    const config = await response.json();
    state.limits = config.limits || {};
    restoreForm(config);
    restoreTargets();
    renderLimits();
    updatePreview();
    updateTargetPill();
  } catch (_error) {
    setResult('Не удалось загрузить конфигурацию манипулятора.', true);
  }
}

function restoreForm(config) {
  dom.host.value = localStorage.getItem(STORAGE_KEYS.host) || config.default_host || '';
  dom.port.value = localStorage.getItem(STORAGE_KEYS.port) || config.default_port || '';
  dom.protocol.value = localStorage.getItem(STORAGE_KEYS.protocol) || config.default_protocol || 'udp';
  dom.angle.value = localStorage.getItem(STORAGE_KEYS.angle) || state.limits.min_rot || '';
  dom.distance.value = localStorage.getItem(STORAGE_KEYS.distance) || state.limits.min_dist || '';
  dom.marker.value = localStorage.getItem(STORAGE_KEYS.marker) || '0';
}

function restoreTargets() {
  const raw = localStorage.getItem(STORAGE_KEYS.targets);
  try {
    state.targets = raw ? JSON.parse(raw) : [];
  } catch (_error) {
    state.targets = [];
  }
  renderSavedTargets();
}

function renderSavedTargets() {
  const options = ['<option value="">Выберите сохранённую цель</option>'];
  state.targets.forEach((target, index) => {
    options.push(`<option value="${index}">${target.host}:${target.port} (${target.protocol.toUpperCase()})</option>`);
  });
  dom.savedTargets.innerHTML = options.join('');
}

function handleTargetFormChange() {
  persistTarget();
  updateTargetPill();
}

function handlePacketDraftChange() {
  persistPacketDraft();
  updatePreview();
}

function handleSelectSavedTarget() {
  const index = Number(dom.savedTargets.value);
  if (!Number.isInteger(index) || index < 0 || !state.targets[index]) {
    return;
  }

  const target = state.targets[index];
  dom.host.value = target.host;
  dom.port.value = target.port;
  dom.protocol.value = target.protocol;

  persistTarget();
  updateTargetPill();
  setResult(`Активная цель: ${target.host}:${target.port} (${target.protocol.toUpperCase()})`, false);
}

function saveCurrentTarget() {
  const target = {
    host: dom.host.value.trim(),
    port: dom.port.value.trim(),
    protocol: dom.protocol.value
  };

  if (!target.host || !target.port) {
    setResult('Введите host и порт перед сохранением.', true);
    return;
  }

  const exists = state.targets.some((item) => item.host === target.host && item.port === target.port && item.protocol === target.protocol);
  if (exists) {
    setResult('Такая цель уже есть в списке.', true);
    return;
  }

  state.targets.push(target);
  localStorage.setItem(STORAGE_KEYS.targets, JSON.stringify(state.targets));
  renderSavedTargets();
  setResult(`Сохранена цель ${target.host}:${target.port}.`, false);
}

function stepPacketField(fieldName, step) {
  const input = fieldName === 'angle' ? dom.angle : dom.distance;
  const current = Number(input.value || 0);
  input.value = String(current + step);
  enforceLimits();
  handlePacketDraftChange();
}

function enforceLimits() {
  if (!state.limits) {
    return;
  }

  const angle = Number(dom.angle.value);
  const distance = Number(dom.distance.value);

  if (!Number.isNaN(angle)) {
    dom.angle.value = String(clamp(angle, Number(state.limits.min_rot), Number(state.limits.max_rot)));
  }

  if (!Number.isNaN(distance)) {
    dom.distance.value = String(clamp(distance, Number(state.limits.min_dist), Number(state.limits.max_dist)));
  }
}

function clamp(value, min, max) {
  if (Number.isNaN(min) || Number.isNaN(max)) {
    return value;
  }
  return Math.max(min, Math.min(max, value));
}

function getTargetPayload() {
  return {
    host: dom.host.value.trim(),
    port: Number(dom.port.value),
    protocol: dom.protocol.value
  };
}

function persistTarget() {
  localStorage.setItem(STORAGE_KEYS.host, dom.host.value);
  localStorage.setItem(STORAGE_KEYS.port, dom.port.value);
  localStorage.setItem(STORAGE_KEYS.protocol, dom.protocol.value);
}

function persistPacketDraft() {
  localStorage.setItem(STORAGE_KEYS.angle, dom.angle.value);
  localStorage.setItem(STORAGE_KEYS.distance, dom.distance.value);
  localStorage.setItem(STORAGE_KEYS.marker, dom.marker.value);
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
    ['Минимальный угол', state.limits.min_rot],
    ['Максимальный угол', state.limits.max_rot],
    ['Минимальная дистанция', state.limits.min_dist],
    ['Максимальная дистанция', state.limits.max_dist],
    ['Высота захвата', state.limits.cargo_pos_z],
    ['Высота над грузом', state.limits.above_cargo_z]
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
    setResult(`Команда ${response.payload} отправлена на ${response.host}:${response.port}.`, false);
  } catch (error) {
    setResult(error.message, true);
  }
}

async function submitPacket(event) {
  event.preventDefault();
  enforceLimits();
  persistTarget();
  persistPacketDraft();

  try {
    const response = await apiRequest('/api/manipulator/packet', {
      method: 'POST',
      body: {
        angle: Number(dom.angle.value),
        distance: Number(dom.distance.value),
        marker: Number(dom.marker.value),
        ...getTargetPayload()
      }
    });
    updatePreview();
    setResult(`Пакет ${response.payload} отправлен на ${response.host}:${response.port}.`, false);
  } catch (error) {
    setResult(error.message, true);
  }
}

async function apiRequest(url, { method = 'GET', body = null } = {}) {
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

function setResult(message, isError) {
  dom.result.textContent = message;
  dom.result.classList.toggle('error', Boolean(isError));
  dom.result.classList.toggle('ok', !isError);
}

bootstrap();
