(function bootstrapSettingsMenu() {
  const modal = document.getElementById('global-settings-modal');
  const form = document.getElementById('global-settings-form');
  if (!modal || !form) {
    return;
  }

  const dom = {
    theme: document.getElementById('settings-theme'),
    serverHost: document.getElementById('settings-server-host'),
    serverPort: document.getElementById('settings-server-port'),
    udpHost: document.getElementById('settings-udp-host'),
    udpPort: document.getElementById('settings-udp-port'),
    manipHost: document.getElementById('settings-manip-host'),
    manipPort: document.getElementById('settings-manip-port'),
    manipProtocol: document.getElementById('settings-manip-protocol'),
    hint: document.getElementById('settings-save-hint')
  };

  document.querySelectorAll('[data-settings-open]').forEach((button) => {
    button.addEventListener('click', openModal);
  });

  document.querySelectorAll('[data-settings-close]').forEach((button) => {
    button.addEventListener('click', closeModal);
  });

  form.addEventListener('submit', submitSettings);

  async function openModal() {
    modal.classList.remove('hidden');
    await loadSettings();
  }

  function closeModal() {
    modal.classList.add('hidden');
  }

  async function loadSettings() {
    try {
      dom.theme.value = document.documentElement.dataset.theme || 'dark';
      const response = await fetch('/api/system/settings');
      const payload = await response.json();
      const settings = payload.settings || {};

      dom.serverHost.value = settings.server_host || '';
      dom.serverPort.value = settings.server_port || '';
      dom.udpHost.value = settings.udp_listen_host || '';
      dom.udpPort.value = settings.udp_listen_port || '';
      dom.manipHost.value = settings.manipulator_default_host || '';
      dom.manipPort.value = settings.manipulator_default_port || '';
      dom.manipProtocol.value = settings.manipulator_default_protocol || 'udp';
      dom.hint.textContent = 'Изменения server/udp host+port применятся после перезапуска сервера.';
    } catch (_error) {
      dom.hint.textContent = 'Не удалось загрузить настройки.';
    }
  }

  async function submitSettings(event) {
    event.preventDefault();
    try {
      if (typeof applyTheme === 'function') {
        applyTheme(dom.theme.value);
      }

      const payload = {
        server_host: dom.serverHost.value.trim(),
        server_port: Number(dom.serverPort.value),
        udp_listen_host: dom.udpHost.value.trim(),
        udp_listen_port: Number(dom.udpPort.value),
        manipulator_default_host: dom.manipHost.value.trim(),
        manipulator_default_port: Number(dom.manipPort.value),
        manipulator_default_protocol: dom.manipProtocol.value
      };

      const response = await fetch('/api/system/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || `Ошибка ${response.status}`);
      }

      dom.hint.textContent = 'Настройки сохранены. Для server/udp параметров нужен перезапуск сервера.';
    } catch (error) {
      dom.hint.textContent = error.message;
    }
  }
})();
