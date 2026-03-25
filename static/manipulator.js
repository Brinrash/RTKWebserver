const STORAGE_KEYS = {
  host: 'manipulator_host',
  port: 'manipulator_port',
  protocol: 'manipulator_protocol',
  angle: 'manipulator_angle',
  distance: 'manipulator_distance',
  marker: 'manipulator_marker'
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
  limits: document.getElementById('manipulator-limits')
};

const state = {
  limits: null
};

function bootstrap() {
  bindEvents();
  fetchConfig();
}

function bindEvents() {
  dom.targetForm.addEventListener('input', () => {
    persistTargetSettings();
    updateTargetPill();
    updatePreview();
  });

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
}

async function fetchConfig() {
  const response = await fetch('/api/manipulator/config');
  const config = await response.json();
  state.limits = config.limits || {};
  restoreSettings(config);
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

  dom.limits.innerHTML = items.map(([label, value]) => `
    <div class="meta-card">
      <span class="label">${label}</span>
      <strong>${value}</strong>
    </div>
  `).join('');

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
    setResult(`Пакет ${response.payload} отправлен на ${response.host}:${response.port} (${response.protocol.toUpperCase()}).`, false);
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
