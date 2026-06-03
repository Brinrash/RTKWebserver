const STORAGE = {
  scenarios: 'constructor_scenarios'
};

const state = {
  lamps: [],
  steps: [],
  scenarios: {},
  running: false,
  stopRequested: false,
  manipulatorDefaults: { host: '', port: '', protocol: 'udp', manipulator_id: '' },
  manipulators: []
};

const dom = {
  status: document.getElementById('constructor-status'),
  result: document.getElementById('constructor-result'),
  stepForm: document.getElementById('scenario-step-form'),
  deviceType: document.getElementById('step-device-type'),
  target: document.getElementById('step-target'),
  action: document.getElementById('step-action'),
  fields: document.getElementById('step-fields'),
  delay: document.getElementById('step-delay'),
  steps: document.getElementById('scenario-steps'),
  preview: document.getElementById('scenario-json-preview'),
  scenarioName: document.getElementById('scenario-name'),
  savedScenarios: document.getElementById('saved-scenarios'),
  saveScenario: document.getElementById('save-scenario'),
  deleteScenario: document.getElementById('delete-scenario'),
  runScenario: document.getElementById('run-scenario'),
  stopScenario: document.getElementById('stop-scenario'),
  clearSteps: document.getElementById('clear-steps')
};


function bootstrap() {
  bindEvents();
  restoreScenarios();
  loadConfig();
}

function bindEvents() {
  dom.deviceType.addEventListener('change', renderStepControls);
  dom.target.addEventListener('change', renderStepControls);
  dom.action.addEventListener('change', renderStepFields);
  dom.stepForm.addEventListener('submit', addStep);
  dom.clearSteps.addEventListener('click', () => {
    state.steps = [];
    renderSteps();
  });

  dom.saveScenario.addEventListener('click', saveScenario);
  dom.deleteScenario.addEventListener('click', deleteScenario);
  dom.savedScenarios.addEventListener('change', loadScenarioFromSelect);

  dom.runScenario.addEventListener('click', runScenario);
  dom.stopScenario.addEventListener('click', () => {
    state.stopRequested = true;
    setStatus('Остановка после текущего шага...');
  });
}

async function loadConfig() {
  try {
    const [bootstrapResponse, manipulatorResponse, manipulatorsResponse] = await Promise.all([
      fetch('/api/bootstrap'),
      fetch('/api/manipulator/config'),
      fetch('/api/manipulators')
    ]);

    const bootstrapPayload = await bootstrapResponse.json();
    const manipulatorConfig = await manipulatorResponse.json();
    const manipulatorItems = (await manipulatorsResponse.json()).manipulators || [];

    state.lamps = (bootstrapPayload.lamps || []).map((lamp) => lamp.name);
    state.manipulators = manipulatorItems;
    state.manipulatorDefaults = {
      host: manipulatorConfig.default_host || '',
      port: manipulatorConfig.default_port || '',
      protocol: manipulatorConfig.default_protocol || 'udp',
      manipulator_id: manipulatorItems[0]?.id || ''
    };

    renderStepControls();
    renderSavedScenarioOptions();
    setStatus('Конструктор готов');
  } catch (_error) {
    setResult('Не удалось загрузить конфигурацию устройств.', true);
    setStatus('Ошибка загрузки');
  }
}

function renderStepControls() {
  renderTargets();
  renderActions();
  renderStepFields();
}

function renderTargets() {
    if (dom.deviceType.value === 'lamp') {

    const options = [
      '<option value="ALL">ALL (все лампы)</option>',
      ...state.lamps.map(
        lamp => `<option value="${lamp}">${lamp}</option>`
      )
    ];

    dom.target.innerHTML = options.join('');
    return;
  }
    if (dom.deviceType.value === 'wait') {

      const options = state.manipulators.map(
        (item) =>
          `<option value="${item.id}">
            ${item.name}
          </option>`
      );

      dom.target.innerHTML =
        options.join('');

      return;
    }

  const options = state.manipulators.map((item) => `<option value="${item.id}">${item.name}</option>`);
  dom.target.innerHTML = options.join('') || '<option value="">Манипуляторов нет</option>';
}

function renderActions() {
    if (dom.deviceType.value === 'lamp') {

    dom.action.innerHTML = `
      <option value="command">Команда</option>
      <option value="state">Состояние</option>
    `;

    return;
  }
  if (dom.deviceType.value === 'wait') {

    dom.action.innerHTML = `
      <option value="position">
        Положение достигнуто
      </option>
    `;

    return;
  }

  dom.action.innerHTML = `
    <option value="short">Короткая команда</option>
    <option value="packet">Позиционный пакет</option>
  `;
}

function renderStepFields() {
  const deviceType = dom.deviceType.value;
  const action = dom.action.value;
  if (deviceType === 'wait') {

    dom.fields.innerHTML = `
      <label>
        Ось
        <input
          id="wait-axis"
          type="number"
          min="1"
          max="6"
          value="1"
        />
      </label>
  
      <label>
        Цель
        <input
          id="wait-target"
          type="number"
          value="180"
        />
      </label>
  
      <label>
        Допуск
        <input
          id="wait-tolerance"
          type="number"
          value="5"
        />
      </label>
  
      <label>
        Таймаут (сек)
        <input
          id="wait-timeout"
          type="number"
          value="15"
        />
      </label>
    `;

    return;
  }
  if (deviceType === 'lamp' && action === 'command') {
    dom.fields.innerHTML = `
      <label>Команда
        <select id="field-lamp-command">
          <option value="RED">RED</option>
          <option value="YELLOW">YELLOW</option>
          <option value="GREEN">GREEN</option>
          <option value="BLUE">BLUE</option>
          <option value="OFF">OFF</option>
        </select>
      </label>
    `;
    return;
  }

  if (deviceType === 'lamp' && action === 'state') {
    dom.fields.innerHTML = `
      <label><input id="field-state-red" type="checkbox" /> Красный</label>
      <label><input id="field-state-yellow" type="checkbox" /> Жёлтый</label>
      <label><input id="field-state-green" type="checkbox" /> Зелёный</label>
      <label><input id="field-state-blue" type="checkbox" /> Синий</label>
    `;
    return;
  }

  if (deviceType === 'manipulator' && action === 'short') {
    dom.fields.innerHTML = `
      <label>Команда
        <select id="field-manip-short">
          <option value="1">1 — Центр</option>
          <option value="2">2 — Боковая</option>
          <option value="3">3 — Расслабить</option>
          <option value="r">r — Старт телеметрии</option>
          <option value="s">s — Стоп телеметрии</option>
        </select>
      </label>
    `;
    return;
  }

  if (deviceType === "manipulator" && action === "telemetry") {
    dom.fields.innerHTML = `<label>Действие<select id="field-manip-telemetry"><option value="start">start</option><option value="stop">stop</option></select></label>`;
    return;
  }
  if (deviceType === 'manipulator' && action === 'packet') {
    const selected = state.manipulators.find((m) => m.id === dom.target.value);
    const axes = Number(selected?.axes || 5);
    if (axes === 6) {
      dom.fields.innerHTML = `
      <label>Угол поворота<input id="field-manip-angle" type="number" value="0" /></label>
      <label>Расстояние<input id="field-manip-distance" type="number" value="0" /></label>
      <label>Угол поворота головы<input id="field-manip-head-angle" type="number" value="0" /></label>
      <label>Поднят / опущен<select id="field-manip-lifted"><option value="0">0</option><option value="1">1</option></select></label>
      <label>Захват закрыт / открыт<select id="field-manip-gripper"><option value="0">0</option><option value="1">1</option></select></label>`;
      return;
    }
  }
  dom.fields.innerHTML = `
    <label>Угол
      <input id="field-manip-angle" type="number" value="0" />
    </label>
    <label>Дистанция
      <input id="field-manip-distance" type="number" value="0" />
    </label>
    <label>Маркер
      <select id="field-manip-marker">
        <option value="0">0</option>
        <option value="1">1</option>
      </select>
    </label>
  `;
}

function addStep(event) {
  event.preventDefault();

  const baseStep = {
    deviceType: dom.deviceType.value,
    target: dom.target.value,
    action: dom.action.value,
    delay: Number(dom.delay.value || 0)
  };

  let payload = {};
  if (baseStep.deviceType === 'wait') {

    payload = {

      axis:
        Number(
          document.getElementById(
            'wait-axis'
          ).value
        ),

      target:
        Number(
          document.getElementById(
            'wait-target'
          ).value
        ),

      tolerance:
        Number(
          document.getElementById(
            'wait-tolerance'
          ).value
        ),

      timeout:
        Number(
          document.getElementById(
            'wait-timeout'
          ).value
        )
    };
  }

  if (baseStep.deviceType === 'lamp' && baseStep.action === 'command') {
    payload = { command: document.getElementById('field-lamp-command').value };
  } else if (baseStep.deviceType === 'lamp' && baseStep.action === 'state') {
    payload = {
      red: document.getElementById('field-state-red').checked,
      yellow: document.getElementById('field-state-yellow').checked,
      green: document.getElementById('field-state-green').checked,
      blue: document.getElementById('field-state-blue').checked
    };
  } else if (baseStep.deviceType === 'manipulator' && baseStep.action === 'short') {
    payload = { command: document.getElementById('field-manip-short').value };
  } else if (baseStep.deviceType === 'manipulator' && baseStep.action === 'telemetry') {
    payload = { mode: document.getElementById('field-manip-telemetry').value };
  } else {
    const selected = state.manipulators.find((m) => m.id === baseStep.target);
    if (Number(selected?.axes || 5) === 6) {
      payload = {
        angle: Number(document.getElementById('field-manip-angle').value || 0),
        distance: Number(document.getElementById('field-manip-distance').value || 0),
        head_angle: Number(document.getElementById('field-manip-head-angle').value || 0),
        lifted: Number(document.getElementById('field-manip-lifted').value || 0),
        gripper: Number(document.getElementById('field-manip-gripper').value || 0)
      };
    } else {
      payload = {
        angle: Number(document.getElementById('field-manip-angle').value || 0),
        distance: Number(document.getElementById('field-manip-distance').value || 0),
        marker: Number(document.getElementById('field-manip-marker').value || 0)
      };
    }
  }

state.steps.push({
  ...baseStep,
  payload
});
  renderSteps();
}

function renderSteps() {
  dom.steps.innerHTML = '';

  state.steps.forEach((step, index) => {
    const card = document.createElement('div');
    card.className = 'program-item';
    card.innerHTML = `
      <div class="program-item-title">
        <strong>Шаг ${index + 1}: ${step.deviceType} / ${step.action}</strong>
        <span>${step.target} • delay=${step.delay}s • ${JSON.stringify(step.payload)}</span>
      </div>
      <div class="buttons compact">
        <button type="button" class="btn off" data-remove-step="${index}">Удалить</button>
      </div>
    `;
    dom.steps.appendChild(card);
  });

  dom.steps.querySelectorAll('[data-remove-step]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.removeStep);
      state.steps.splice(index, 1);
      renderSteps();
    });
  });

  dom.preview.textContent = JSON.stringify({ steps: state.steps }, null, 2);
}

function restoreScenarios() {
  try {
    state.scenarios = JSON.parse(localStorage.getItem(STORAGE.scenarios) || '{}');
  } catch (_error) {
    state.scenarios = {};
  }
}

function renderSavedScenarioOptions() {
  const options = ['<option value="">Выберите программу</option>']
    .concat(Object.keys(state.scenarios).map((name) => `<option value="${name}">${name}</option>`));
  dom.savedScenarios.innerHTML = options.join('');
}

function saveScenario() {
  const name = dom.scenarioName.value.trim();
  if (!name) {
    setResult('Введите имя сценария.', true);
    return;
  }

  state.scenarios[name] = { steps: state.steps };
  localStorage.setItem(STORAGE.scenarios, JSON.stringify(state.scenarios));
  renderSavedScenarioOptions();
  setResult(`Сценарий «${name}» сохранён.`, false);
}

function deleteScenario() {
  const name = dom.savedScenarios.value;
  if (!name || !state.scenarios[name]) {
    setResult('Выберите сценарий для удаления.', true);
    return;
  }

  delete state.scenarios[name];
  localStorage.setItem(STORAGE.scenarios, JSON.stringify(state.scenarios));
  renderSavedScenarioOptions();
  setResult(`Сценарий «${name}» удалён.`, false);
}

function loadScenarioFromSelect() {
  const name = dom.savedScenarios.value;
  if (!name || !state.scenarios[name]) {
    return;
  }

  dom.scenarioName.value = name;
  state.steps = [...(state.scenarios[name].steps || [])];
  renderSteps();
  setResult(`Сценарий «${name}» загружен.`, false);
}

async function runScenario() {
  if (state.running) {
    setResult('Сценарий уже выполняется.', true);
    return;
  }

  if (!state.steps.length) {
    setResult('Добавьте хотя бы один шаг.', true);
    return;
  }

  state.running = true;
  state.stopRequested = false;
  setStatus('Сценарий выполняется...');

  try {
    for (const step of state.steps) {
      if (state.stopRequested) {
        break;
      }
      await executeStep(step);
      if (step.delay > 0) {
        await sleep(step.delay * 1000);
      }
    }

    setResult(state.stopRequested ? 'Сценарий остановлен пользователем.' : 'Сценарий выполнен.', false);
  } catch (error) {
    setResult(error.message, true);
  } finally {
    state.running = false;
    state.stopRequested = false;
    setStatus('Готово');
  }
}

async function executeStep(step) {

  if (step.deviceType === 'wait') {

    const started = Date.now();

    while (true) {

      if (state.stopRequested) {
        throw new Error(
          'Остановлено пользователем'
        );
      }

      const telemetry =
        await apiRequest(
          `/api/manipulator/state?manipulator_id=${encodeURIComponent(
            step.target
          )}`
        );

      const axis =
        Number(
          step.payload.axis
        ) - 1;

      const angle =
        telemetry.angles?.[axis];

      if (
        angle !== undefined &&
        Math.abs(
          angle -
          step.payload.target
        ) <= step.payload.tolerance
      ) {

        return;
      }

      if (
        Date.now() - started >
        step.payload.timeout * 1000
      ) {

        throw new Error(
          `Таймаут ожидания оси ${step.payload.axis}`
        );
      }

      await sleep(100);
    }
}
  if (step.deviceType === 'lamp' && step.action === 'command') {
    await apiRequest(`/api/lamp/${encodeURIComponent(step.target)}/command/${encodeURIComponent(step.payload.command)}`, {
      method: 'POST'
    });
    return;
  }

  if (step.deviceType === 'lamp' && step.action === 'state') {
    await apiRequest(
      `/api/lamp/${encodeURIComponent(step.target)}/state`,
      {
        method: 'POST',
        body: step.payload
      }
    );
    return;
  }

  if (step.deviceType === 'manipulator' && step.action === 'short') {
    await apiRequest('/api/manipulator/command', {
      method: 'POST',
      body: {
        command: step.payload.command,
        ...state.manipulatorDefaults,
        manipulator_id: step.target
      }
    });
    return;
  }

  if (step.deviceType === "manipulator" && step.action === "telemetry") {
    await apiRequest(step.payload.mode === "start" ? "/api/manipulator/telemetry/start" : "/api/manipulator/telemetry/stop", { method: "POST", body: { ...state.manipulatorDefaults, manipulator_id: step.target } });
    return;
  }

  await apiRequest('/api/manipulator/packet', {
    method: 'POST',
    body: {
      angle: step.payload.angle,
      distance: step.payload.distance,
      marker: step.payload.marker,
      head_angle: step.payload.head_angle,
      lifted: step.payload.lifted,
      gripper: step.payload.gripper,
      dummy: 0,
      ...state.manipulatorDefaults,
      manipulator_id: step.target
    }
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
}
