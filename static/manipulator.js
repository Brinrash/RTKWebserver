const state = {
  socket: null,
  selectedManipulatorId: '',
  manipulators: [],
  axes: 5,
  recordTelemetry: true,
};

const dom = {

  selector:
    document.getElementById(
      'manipulator-selector'
    ),

  online:
    document.getElementById(
      'manipulator-online'
    ),

  telemetryLog:
    document.getElementById(
      'telemetry-log'
    ),

  result:
    document.getElementById(
      'manipulator-result'
    ),

  preview:
    document.getElementById(
      'manipulator-packet-preview'
    ),

  targetPill:
    document.getElementById(
      'manipulator-target'
    ),

  packetForm:
    document.getElementById(
      'manipulator-packet-form'
    ),

  packetFields:
    document.getElementById(
      'manipulator-packet-fields'
    ),

  editForm:
    document.getElementById(
      'manipulator-edit-form'
    ),

  deleteBtn:
    document.getElementById(
      'manipulator-delete-btn'
    ),

  comboForm:
    document.getElementById(
      'combo-program-form'
    ),

  host:
    document.getElementById(
      'edit-manip-host'
    ),

  port:
    document.getElementById(
      'edit-manip-port'
    ),

  telemetryPort:
    document.getElementById(
      'edit-manip-telemetry-port'
    ),

  protocol:
    document.getElementById(
      'edit-manip-protocol'
    )
};


async function apiRequest(
  url,
  options = {}
){

  const response = await fetch(
    url,
    {
      method:
        options.method || 'GET',

      headers: {
        'Content-Type':
          'application/json'
      },

      body:
        options.body
          ? JSON.stringify(
              options.body
            )
          : undefined
    }
  );

  const payload =
    await response.json();

  if (!response.ok) {

    throw new Error(
      payload.error ||
      'Request failed'
    );
  }

  return payload;
}


function setResult(
  text,
  isError = false
){

  if (!dom.result) return;

  dom.result.textContent =
    text;

  dom.result.classList.remove(
    'error',
    'success'
  );

  dom.result.classList.add(
    isError
      ? 'error'
      : 'success'
  );
}


function appendManipulatorLog(
  text
){

  if (!state.recordTelemetry){
    return;
  }

  if (!dom.telemetryLog) return;

  const line =
    document.createElement('div');

  line.textContent =
    `[${new Date().toLocaleTimeString()}] ${text}`;

  dom.telemetryLog.prepend(
    line
  );

  while (
    dom.telemetryLog.children.length > 300
  ) {

    dom.telemetryLog.removeChild(
      dom.telemetryLog.lastChild
    );
  }
}

function renderTelemetry(
  data
){

  console.log(
    'MANIPULATOR STATE',
    data
  );

  const axes =
    Number(
      data.axes ||
      state.axes ||
      5
    );

  for (
    let i = 1;
    i <= axes;
    i++
  ){

    const a =
      document.getElementById(
        `a${i}`
      );

    const t =
      document.getElementById(
        `t${i}`
      );

    const l =
      document.getElementById(
        `l${i}`
      );

    if (a){

      a.textContent =
        (data.angles || [])[i - 1] ?? 0;
    }

    if (t){

      t.textContent =
        (data.temperatures || [])[i - 1] ?? 0;
    }

    if (l){

      l.textContent =
        (data.loads || [])[i - 1] ?? 0;
    }
  }

  if (dom.online){

    dom.online.textContent =
      data.online
        ? 'ONLINE'
        : 'OFFLINE';

    dom.online.classList.remove(
      'online',
      'offline'
    );

    dom.online.classList.add(
      data.online
        ? 'online'
        : 'offline'
    );
  }
}


function initSocket(){

  state.socket = io();

  state.socket.on(
    'connect',
    () => {

      console.log(
        'SOCKET CONNECT'
      );
    }
  );

  state.socket.on(
    'disconnect',
    () => {

      console.log(
        'SOCKET DISCONNECT'
      );
    }
  );

  state.socket.on(
    'manipulator_log',
    (data) => {

      if (
        data.manipulator_id ===
        state.selectedManipulatorId
      ){

        appendManipulatorLog(
          data.packet
        );
      }
    }
  );

  state.socket.on(
    'manipulator_state',
    (data) => {


      const incomingId =
        data.id ||
        data.manipulator_id;

      console.log(
        'incoming:',
        incomingId,
        'selected:',
        state.selectedManipulatorId
      );

      if (
        !state.selectedManipulatorId ||
        incomingId === state.selectedManipulatorId
      ){

        renderTelemetry(
          data
        );
      }
    }
  );
}


async function loadManipulators(){

  try {

    const payload =
      await apiRequest(
        '/api/manipulators'
      );

    state.manipulators =
      payload.manipulators || [];

    if (!state.manipulators.length){

      return;
    }

    dom.selector.innerHTML =
      state.manipulators
        .map(
          (m) => `
            <option value="${m.id}">
              ${m.name}
            </option>
          `
        )
        .join('');

    state.selectedManipulatorId =
     state.manipulators[0].id;

    dom.selector.value =
      state.selectedManipulatorId;

    await onManipulatorSelect();

  } catch(error){

    console.error(error);

    setResult(
      error.message,
      true
    );
  }
}


async function onManipulatorSelect(){

  try {

    state.selectedManipulatorId =
      dom.selector.value;

    const response =
      await apiRequest(
        `/api/manipulators/${encodeURIComponent(
          state.selectedManipulatorId
        )}`
      );

    const manip =
      response.manipulator;

    state.axes =
      Number(
        manip.axes || 5
      );

    if (dom.host){

      dom.host.value =
        manip.host || '';
    }

    if (dom.port){

      dom.port.value =
        manip.command_port || 8888;
    }

    if (dom.telemetryPort){

      dom.telemetryPort.value =
        manip.telemetry_port || 9090;
    }

    if (dom.protocol){

      dom.protocol.value =
        manip.protocol || 'udp';
    }

    if (dom.targetPill){

      dom.targetPill.textContent =
        `${manip.name} • ${manip.host}:${manip.command_port}`;
    }

  } catch(error){

    console.error(error);

    setResult(
      error.message,
      true
    );
  }
}


function getTargetPayload(){

  return {
    manipulator_id:
      state.selectedManipulatorId
  };
}


async function sendShortCommand(
  command
){

  try {

    await apiRequest(
      '/api/manipulator/command',
      {
        method: 'POST',
        body: {
          command,
          ...getTargetPayload()
        }
      }
    );

    setResult(
      `Команда ${command} отправлена`
    );

  } catch(error){

    console.error(error);

    setResult(
      error.message,
      true
    );
  }
}


function bindButtons(){

  document
    .querySelectorAll(
      '[data-manipulator-command]'
    )
    .forEach((btn) => {

      btn.addEventListener(
        'click',
        async () => {

          await sendShortCommand(
            btn.dataset.manipulatorCommand
          );
        }
      );

    });
const recordBtn =
  document.getElementById(
    'manip-record-toggle'
  );

if (recordBtn){

  recordBtn.addEventListener(
    'click',
    () => {

      state.recordTelemetry =
        !state.recordTelemetry;

      if (state.recordTelemetry){

        recordBtn.textContent =
          'RECORD ON';

        recordBtn.classList.add(
          'active'
        );

      } else {

        recordBtn.textContent =
          'RECORD OFF';

        recordBtn.classList.remove(
          'active'
        );
      }
    }
  );
}

const clearBtn =
  document.getElementById(
    'manip-clear-log'
  );

if (clearBtn){

  clearBtn.addEventListener(
    'click',
    () => {

      if (dom.telemetryLog){

        dom.telemetryLog.innerHTML =
          '';
      }
    }
  );
}
  dom.selector?.addEventListener(
    'change',
    onManipulatorSelect
  );
}
dom.comboForm?.addEventListener(
  'submit',
  async (event) => {

    event.preventDefault();

    try {

      const raw =
        document.getElementById(
          'combo-program-json'
        ).value;

      const steps =
        JSON.parse(raw);

      for (const step of steps){

        if (
          step.type ===
          'manipulator'
        ){

          await apiRequest(
            '/api/manipulator/command',
            {
              method: 'POST',
              body: {
                command: step.command,
                manipulator_id:
                  state.selectedManipulatorId
              }
            }
          );
        }

        if (
          step.type ===
          'lamp'
        ){

          await apiRequest(
            `/api/lamp/${encodeURIComponent(step.lamp)}/command/${encodeURIComponent(step.command)}`,
            {
              method: 'POST',
            }
          );
        }

        if (step.delay){

          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                step.delay * 1000
              )
          );
        }
      }

      setResult(
        'JSON программа выполнена'
      );

    } catch(error){

      console.error(error);

      setResult(
        error.message,
        true
      );
    }
  }
);


async function bootstrap(){

  initSocket();

  bindButtons();

  await loadManipulators();
  setInterval(
  loadManipulators,
  2000
);
}


window.addEventListener(
  'DOMContentLoaded',
  bootstrap
);
