const STORAGE_KEYS = {
  host: 'manipulator_host',
  port: 'manipulator_port',
  protocol: 'manipulator_protocol'
};

const dom = {
  host: document.getElementById('manipulator-host'),
  port: document.getElementById('manipulator-port'),
  protocol: document.getElementById('manipulator-protocol'),
  selector: document.getElementById('manipulator-selector'),
  online: document.getElementById('manipulator-online'),
  telemetryLog: document.getElementById('telemetry-log'),
  result: document.getElementById('manipulator-result'),
  preview: document.getElementById('manipulator-packet-preview'),
  targetPill: document.getElementById('manipulator-target'),
  packetForm: document.getElementById('manipulator-packet-form'),
  packetFields: document.getElementById('manipulator-packet-fields'),
  createForm: document.getElementById('manipulator-create-form')
};

const state = { socket: null, selectedManipulatorId: '', manipulators: [], axes: 5 };

function getTargetPayload() { return { manipulator_id: state.selectedManipulatorId, host: dom.host.value.trim(), port: Number(dom.port.value), protocol: dom.protocol.value }; }
function setResult(message, isError=false){ dom.result.textContent = message; dom.result.classList.toggle('error', !!isError); }

function renderPacketFields() {
  if (state.axes === 6) {
    dom.packetFields.innerHTML = ['1','2','3','4','5'].map((n)=>`<label>A${n}<input id="m-a${n}" type="number" value="0" required /></label>`).join('') + `<label>Маркер<select id="m-marker"><option value="0">0</option><option value="1">1</option></select></label>`;
  } else {
    dom.packetFields.innerHTML = `<label>Угол<input id="m-angle" type="number" required /></label><label>Дистанция<input id="m-distance" type="number" required /></label><label>Маркер<select id="m-marker"><option value="0">0</option><option value="1">1</option></select></label>`;
  }
  updatePreview();
}

function updatePreview() {
  const marker = document.getElementById('m-marker')?.value || '0';
  if (state.axes === 6) {
    const values = [1,2,3,4,5].map((n)=>document.getElementById(`m-a${n}`)?.value || '0');
    dom.preview.textContent = `p:${values.join(':')}:${marker}#`;
  } else {
    dom.preview.textContent = `p:${document.getElementById('m-angle')?.value || '?'}:${document.getElementById('m-distance')?.value || '?'}:${marker}:0#`;
  }
}

async function loadManipulators() {
  const payload = await apiRequest('/api/manipulators');
  state.manipulators = payload.manipulators || [];
  dom.selector.innerHTML = state.manipulators.map((m)=>`<option value="${m.id}">${m.name} (${m.axes} осей)</option>`).join('');
  if (!state.manipulators.length) return;
  state.selectedManipulatorId = state.manipulators[0].id;
  dom.selector.value = state.selectedManipulatorId;
  await onManipulatorSelect();
}

async function onManipulatorSelect() {
  state.selectedManipulatorId = dom.selector.value;
  const item = await apiRequest(`/api/manipulators/${encodeURIComponent(state.selectedManipulatorId)}`);
  const manip = item.manipulator;
  state.axes = Number(manip.axes || 5);
  dom.host.value = manip.host || '';
  dom.port.value = String(manip.command_port || '');
  dom.protocol.value = manip.protocol || 'udp';
  dom.targetPill.textContent = `${manip.name} • ${state.axes} осей • ${dom.host.value}:${dom.port.value}`;
  renderPacketFields();
  await apiRequest('/api/manipulator/telemetry/start', { method: 'POST', body: getTargetPayload() });
  await refreshTelemetry();
  setInterval(
  refreshTelemetry,
  1000
);
}

async function submitPacket(event) {
  event.preventDefault();
  const body = { ...getTargetPayload() };
  body.marker = Number(document.getElementById('m-marker').value || 0);
  if (state.axes === 6) {
    body.a1 = Number(document.getElementById('m-a1').value || 0);
    body.a2 = Number(document.getElementById('m-a2').value || 0);
    body.a3 = Number(document.getElementById('m-a3').value || 0);
    body.a4 = Number(document.getElementById('m-a4').value || 0);
    body.a5 = Number(document.getElementById('m-a5').value || 0);
  } else {
    body.angle = Number(document.getElementById('m-angle').value || 0);
    body.distance = Number(document.getElementById('m-distance').value || 0);
    body.dummy = 0;
  }
  const response = await apiRequest('/api/manipulator/packet', { method: 'POST', body });
  setResult(`Пакет ${response.payload} отправлен.`, false);
}

async function refreshTelemetry(){ if(!state.selectedManipulatorId) return; const payload = await apiRequest(`/api/manipulator/state?manipulator_id=${encodeURIComponent(state.selectedManipulatorId)}`); renderTelemetry(payload); }
function renderTelemetry(data){

  console.log(
    'Telemetry RX:',
    data
  );

  const axes = Math.max(
    5,
    Number(state.axes || 5)
  );

  for(let i = 1; i <= axes; i++){

    const a = document.getElementById(`a${i}`);
    const t = document.getElementById(`t${i}`);
    const l = document.getElementById(`l${i}`);

    if(a){

      a.textContent =
        (data.angles || [])[i - 1] ?? '-';
    }

    if(t){

      t.textContent =
        (data.temperatures || [])[i - 1] ?? '-';
    }

    if(l){

      l.textContent =
        (data.loads || [])[i - 1] ?? '-';
    }
  }

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
function appendManipulatorLog(text){ const div=document.createElement('div'); div.textContent=`[${new Date().toLocaleTimeString()}] ${text}`; dom.telemetryLog.prepend(div); while(dom.telemetryLog.children.length>300){ dom.telemetryLog.removeChild(dom.telemetryLog.lastChild);} }

async function createManipulator(event){
  event.preventDefault();
  const body = {
    name: document.getElementById('new-manip-name').value.trim(),
    host: document.getElementById('new-manip-host').value.trim(),
    command_port: Number(document.getElementById('new-manip-port').value),
    telemetry_port: 9090,
    protocol: document.getElementById('new-manip-protocol').value,
    axes: Number(document.getElementById('new-manip-axes').value)
  };
  await apiRequest('/api/manipulators', { method: 'POST', body });
  setResult('Манипулятор создан.', false);
  await loadManipulators();
}

async function apiRequest(url,{method='GET',body=null}={}){ const response=await fetch(url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):null}); const payload=await response.json().catch(()=>({})); if(!response.ok) throw new Error(payload.error||`Ошибка ${response.status}`); return payload; }

function bind(){ dom.selector.addEventListener('change', onManipulatorSelect); dom.packetForm.addEventListener('submit', submitPacket); dom.packetForm.addEventListener('input', updatePreview); dom.createForm?.addEventListener('submit', createManipulator); document.querySelectorAll('[data-manipulator-command]').forEach((btn)=>btn.addEventListener('click', async ()=>{ const r=await apiRequest('/api/manipulator/command',{method:'POST',body:{command:btn.dataset.manipulatorCommand,...getTargetPayload()}}); setResult(`Команда ${r.payload} отправлена`, false);})); }
function initSocket(){ state.socket=io(); state.socket.on('manipulator_log',(data)=>{ if(data.manipulator_id===state.selectedManipulatorId) appendManipulatorLog(data.packet); }); state.socket.on('manipulator_state',(data)=>{ if(data.manipulator_id===state.selectedManipulatorId) renderTelemetry(data); }); }

(async function bootstrap(){ bind(); initSocket(); await loadManipulators(); })();
