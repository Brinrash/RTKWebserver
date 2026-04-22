:root {
  color-scheme: dark;
  --bg-start: #020617;
  --bg: #0f172a;
  --panel: rgba(15, 23, 42, 0.88);
  --panel-2: #1e293b;
  --panel-3: rgba(2, 6, 23, 0.9);
  --panel-4: #020617;
  --border: #334155;
  --border-strong: #475569;
  --text: #e2e8f0;
  --muted: #94a3b8;
  --outline: #38bdf8;
  --shadow: rgba(2, 6, 23, 0.35);
  --green: #16a34a;
  --red: #dc2626;
  --blue: #2563eb;
  --yellow: #ca8a04;
}

html[data-theme="light"] {
  color-scheme: light;
  --bg-start: #f3f7ff;
  --bg: #dbeafe;
  --panel: rgba(255, 255, 255, 0.98);
  --panel-2: #ffffff;
  --panel-3: #eef4ff;
  --panel-4: #f8fbff;
  --border: #93b4e3;
  --border-strong: #5b84c4;
  --text: #0b1f3a;
  --muted: #35537f;
  --outline: #1d4ed8;
  --shadow: rgba(76, 124, 191, 0.25);
}

html[data-theme="light"] .log-panel {
  background: #f1f5ff;
  border-color: #9db8e3;
}

html[data-theme="light"] .log-line {
  border-bottom-color: rgba(91, 132, 196, 0.35);
}

html[data-theme="light"] .log-info { color: #0f6d3f; }
html[data-theme="light"] .log-debug { color: #1e40af; }
html[data-theme="light"] .log-error { color: #b91c1c; }

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: Arial, sans-serif;
  background: linear-gradient(180deg, var(--bg-start) 0%, var(--bg) 100%);
  color: var(--text);
  transition: background 0.2s ease, color 0.2s ease;
}

.container {
  max-width: 1240px;
  margin: 0 auto;
  padding: 24px;
}

.page-header,
.section-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.layout-two-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 18px;
  margin-bottom: 16px;
  box-shadow: 0 12px 40px var(--shadow);
}

.hint,
.selection-summary,
.label,
.lamp-ip {
  color: var(--muted);
}

.status-pill {
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--panel-2);
}

.status-pill.online { border-color: #166534; color: #86efac; }
.status-pill.offline { border-color: #7f1d1d; color: #fca5a5; }

.page-nav {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.page-nav a {
  color: var(--text);
  text-decoration: none;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--panel-2);
}

.page-nav a.active {
  border-color: var(--outline);
  color: var(--text);
}

.theme-toggle {
  min-width: 150px;
}

.quick-command-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.manipulator-target-form {
  align-items: end;
}

.meta-card {
  background: var(--panel-3);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 6px;
}

.lamp-selector {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}

.lamp-button,
.btn,
select,
input,
textarea {
  border-radius: 10px;
  border: 1px solid var(--border);
}

.lamp-button {
  background: var(--panel-2);
  color: var(--text);
  padding: 14px;
  cursor: pointer;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lamp-button.selected { outline: 2px solid #38bdf8; }
.lamp-button.online { border-color: #166534; }
.lamp-button.offline { border-color: #7f1d1d; }
.lamp-name { font-weight: 700; }

.buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.compact { align-items: center; }
.grid-buttons { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
.top-gap { margin-top: 12px; }

.btn,
button,
select,
input,
textarea {
  background: var(--panel-2);
  color: var(--text);
  padding: 10px 14px;
}

.btn,
button {
  cursor: pointer;
}

button:disabled,
input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn.red { background: rgba(220, 38, 38, 0.25); }
.btn.blue { background: rgba(37, 99, 235, 0.25); }
.btn.green { background: rgba(22, 163, 74, 0.25); }
.btn.yellow { background: rgba(202, 138, 4, 0.25); }
.btn.off { background: rgba(100, 116, 139, 0.3); }

.segments {
  display: grid;
  grid-template-columns: repeat(4, minmax(120px, 1fr));
  gap: 12px;
}

.segment {
  text-align: center;
  padding: 18px 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel-2) 40%, var(--border-strong));
  border: 1px solid var(--border-strong);
  font-weight: 700;
  transition: transform 0.15s ease, opacity 0.15s ease;
  opacity: 0.45;
}

.segment.active {
  opacity: 1;
  transform: translateY(-2px);
}

.segment.red.active { background: var(--red); }
.segment.blue.active { background: var(--blue); }
.segment.green.active { background: var(--green); }
.segment.yellow.active { background: var(--yellow); }

.meta-grid,
.form-grid,
.builder-grid {
  display: grid;
  gap: 12px;
}

.meta-grid { margin-top: 14px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.form-grid { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); align-items: end; }
.builder-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
label { display: grid; gap: 6px; }

.program-form {
  display: grid;
  gap: 12px;
}

.program-list {
  display: grid;
  gap: 12px;
}

.program-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--panel-3);
}

.program-item-title {
  display: grid;
  gap: 4px;
}

.program-item-title span {
  color: var(--muted);
  font-size: 0.9rem;
}

.lamp-settings-form {
  align-items: stretch;
}

.settings-actions {
  align-items: end;
}

.all-manual-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.manual-lamp-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--panel-3);
}

.manual-lamp-card-all {
  border-color: rgba(56, 189, 248, 0.6);
  box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.15);
}

.manual-lamp-header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  color: var(--muted);
}

.compact-grid {
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

.all-lamps-state {
  margin-top: 16px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

.hidden {
  display: none;
}

.mini-lamp-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--panel-3);
}

.mini-lamp-card.expanded {
  padding: 16px;
}

.mini-lamp-card.online {
  border-color: rgba(22, 163, 74, 0.65);
}

.mini-lamp-card.offline {
  border-color: rgba(220, 38, 38, 0.5);
}

.mini-lamp-header,
.mini-lamp-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.9rem;
}

.mini-lamp-meta {
  color: var(--muted);
  margin-top: 10px;
  flex-wrap: wrap;
}

.mini-segments {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.expanded-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.mini-segment {
  text-align: center;
  padding: 10px 6px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--panel-2) 40%, var(--border-strong));
  border: 1px solid var(--border-strong);
  opacity: 0.45;
  font-weight: 700;
}

.expanded-grid .mini-segment {
  padding: 14px 10px;
}

.mini-segment.active {
  opacity: 1;
}

.mini-segment.red.active { background: rgba(220, 38, 38, 0.9); }
.mini-segment.blue.active { background: rgba(37, 99, 235, 0.9); }
.mini-segment.green.active { background: rgba(22, 163, 74, 0.9); }
.mini-segment.yellow.active { background: rgba(202, 138, 4, 0.9); }

textarea,
pre {
  width: 100%;
  background: var(--panel-4);
  min-height: 220px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap;
}

pre {
  margin: 12px 0 0;
  padding: 14px;
}

.log-panel {
  background: var(--panel-4);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  min-height: 260px;
  max-height: 360px;
  overflow-y: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.log-line { padding: 6px 0; border-bottom: 1px solid rgba(51, 65, 85, 0.4); }
.log-info { color: #86efac; }
.log-debug { color: #93c5fd; }
.log-error { color: #fca5a5; }
.ok { color: #86efac; }
.error { color: #fca5a5; }

@media (max-width: 920px) {
  .layout-two-columns,
  .meta-grid,
  .form-grid,
  .builder-grid,
  .expanded-grid {
    grid-template-columns: 1fr;
  }

  .page-header,
  .section-row,
  .mini-lamp-header,
  .mini-lamp-meta,
  .manual-lamp-header {
    flex-direction: column;
    align-items: stretch;
  }
}

.manipulator-screen {
  max-width: 1380px;
}

.manipulator-toolbar {
  align-items: flex-start;
}

.toolbar-left {
  display: grid;
  gap: 8px;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.scada-grid {
  display: grid;
  grid-template-columns: minmax(560px, 2.2fr) minmax(300px, 1fr) minmax(150px, 0.6fr) minmax(150px, 0.6fr);
  gap: 14px;
  align-items: start;
}

.scada-grid .compact-panel {
  grid-column: 1 / 2;
}

.card.manipulator-panel,
.card.terminal-panel,
.card.traffic-panel {
  overflow: hidden;
}

.terminal-panel,
.traffic-panel,
.telemetry-grid,
.telemetry-row,
.packet-fields,
.axis-main {
  min-width: 0;
}

.manipulator-panel h2,
.terminal-panel h2,
.traffic-panel h2 {
  margin-top: 0;
  text-align: center;
}

.manipulator-content {
  display: grid;
  grid-template-columns: minmax(300px, 1fr) minmax(320px, 1.25fr);
  gap: 16px;
}

.joystick {
  display: grid;
  grid-template-columns: 50px minmax(180px, 1fr) 50px;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.axis-main {
  display: grid;
  gap: 8px;
}

.axis-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.axis-btn,
.axis-side,
.switch {
  border: 1px solid #1d4ed8;
  border-radius: 8px;
  background: linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%);
  color: #e0f2fe;
  font-weight: 700;
  text-align: center;
  padding: 10px 6px;
}

.axis-side {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  min-height: 168px;
}

.packet-fields {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.telemetry-grid {
  display: grid;
  gap: 8px;
}

.telemetry-row {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 4px;
  font-size: 12px;
}

.telemetry-cell {
  border-radius: 4px;
  border: 1px solid #a16207;
  background: linear-gradient(180deg, #65a30d 0%, #4d7c0f 100%);
  color: #fef9c3;
  text-align: center;
  padding: 5px 2px;
  font-weight: 700;
}

.terminal-lights {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 16px;
}

.signal-box,
.lamp-box {
  border: 1px solid var(--border-strong);
  background: var(--panel-4);
  height: 26px;
  border-radius: 4px;
}

.terminal-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: center;
}

.traffic-panel {
  min-height: 256px;
}

.lamp-stack {
  display: grid;
  gap: 12px;
}

.preview-only .axis-btn,
.preview-only .axis-side {
  opacity: 0.85;
}

@media (max-width: 1200px) {
  .scada-grid {
    grid-template-columns: 1fr;
  }

  .scada-grid .compact-panel {
    grid-column: auto;
  }

  .manipulator-content {
    grid-template-columns: 1fr;
  }
}

/* manipulator hotfix layout */
.scada-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 14px;
}

.scada-grid .main-panel {
  grid-column: span 6;
}

.scada-grid .terminal-panel {
  grid-column: span 3;
}

.scada-grid .traffic-panel {
  grid-column: span 2;
  min-width: 140px;
}

.scada-grid .compact-panel {
  grid-column: span 6;
}

.manipulator-content {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(260px, 1fr);
  gap: 14px;
  align-items: start;
}

.joystick,
.axis-main,
.axis-row,
.packet-fields,
.telemetry-grid,
.terminal-panel,
.traffic-panel {
  min-width: 0;
}

.axis-btn,
.axis-side,
.switch,
.btn {
  position: relative;
  z-index: 1;
}

.axis-row-two {
  grid-template-columns: repeat(2, 1fr);
}

.packet-fields {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.traffic-panel h2 {
  font-size: 1.05rem;
  word-break: break-word;
}

#manipulator-saved-targets {
  min-width: 220px;
}

@media (max-width: 1280px) {
  .scada-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .scada-grid .main-panel,
  .scada-grid .terminal-panel,
  .scada-grid .traffic-panel,
  .scada-grid .compact-panel {
    grid-column: auto;
  }

  .manipulator-content {
    grid-template-columns: 1fr;
  }
}

/* --- Manipulator v2 (scoped, non-breaking for lamps page) --- */
.manipulator-v2 {
  max-width: 1240px;
}

.manipulator-v2 .manipulator-topbar {
  align-items: center;
}

.manipulator-v2 .manipulator-main-card h2,
.manipulator-v2 .card h2,
.manipulator-v2 .card h3 {
  margin-top: 0;
}

.manipulator-v2 .manipulator-main-grid {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 16px;
}

.manipulator-v2 .manipulator-block {
  background: var(--panel-3);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  min-width: 0;
}

.manipulator-v2 .manipulator-commands {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.manipulator-v2 .builder-grid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.manipulator-v2 label,
.manipulator-v2 .buttons.align-end {
  min-width: 0;
}

.manipulator-v2 .buttons.align-end {
  align-items: end;
}

.manipulator-v2 .meta-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.manipulator-v2 pre {
  min-height: 84px;
}

.manipulator-v2 input,
.manipulator-v2 select {
  width: 100%;
  max-width: 260px;
  padding: 8px 10px;
}

.manipulator-v2 button {
  width: auto;
  min-width: 120px;
  padding: 8px 12px;
}

.manipulator-v2 .buttons {
  gap: 8px;
}

.manipulator-v2 .quick-command-grid .btn,
.manipulator-v2 .buttons .btn {
  font-size: 0.92rem;
}

.manipulator-v2 .manipulator-secondary-grid {
  align-items: start;
}

@media (max-width: 1000px) {
  .manipulator-v2 .manipulator-main-grid,
  .manipulator-v2 .layout-two-columns,
  .manipulator-v2 .builder-grid,
  .manipulator-v2 .meta-grid,
  .manipulator-v2 .manipulator-commands {
    grid-template-columns: 1fr;
  }

  .manipulator-v2 input,
  .manipulator-v2 select,
  .manipulator-v2 button {
    width: 100%;
    max-width: none;
  }
}


#add-lamp-form button {
  align-self: end;
  min-height: 40px;
}

#manipulator-target-form .buttons.align-end {
  justify-content: flex-start;
  flex-wrap: wrap;
}

#manipulator-target-form .buttons.align-end .btn {
  max-width: 220px;
}


/* brighter light-theme action colors */
html[data-theme="light"] .btn.red { background: #fecaca; border-color: #f87171; color: #7f1d1d; }
html[data-theme="light"] .btn.yellow { background: #fef08a; border-color: #eab308; color: #713f12; }
html[data-theme="light"] .btn.green { background: #bbf7d0; border-color: #4ade80; color: #14532d; }
html[data-theme="light"] .btn.blue { background: #bfdbfe; border-color: #60a5fa; color: #1e3a8a; }
html[data-theme="light"] .btn.off { background: #e2e8f0; border-color: #94a3b8; color: #334155; }
html[data-theme="light"] .segment { border-color: #7aa1d6; }
html[data-theme="light"] .lamp-button.selected { outline-color: #2563eb; }

#manual-color-buttons .btn.active {
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.8), 0 0 0 2px var(--outline);
  transform: translateY(-1px);
}

#manual-mode-switch .btn {
  min-width: 180px;
}

/* constructor page */
.constructor-page .builder-grid {
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
}

.constructor-page #step-fields label {
  background: var(--panel-3);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
}

.constructor-page #scenario-steps .program-item {
  align-items: start;
}

.constructor-page #scenario-json-preview {
  min-height: 140px;
}
