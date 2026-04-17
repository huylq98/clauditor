const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');

const STATE_PRIORITY = ['awaiting_permission', 'awaiting_user', 'running', 'idle', 'exited'];

function mostUrgent(states) {
  const values = Object.values(states);
  for (const s of STATE_PRIORITY) if (values.includes(s)) return s;
  return 'idle';
}

class TrayController {
  constructor({ onShow, onNewSession, onFocusSession, onQuit, iconPath }) {
    this.onShow = onShow;
    this.onNewSession = onNewSession;
    this.onFocusSession = onFocusSession;
    this.onQuit = onQuit;
    this.iconPath = iconPath;
    this.tray = null;
    this.sessions = [];
    this.states = {};
  }

  start() {
    const img = nativeImage.createFromPath(this.iconPath);
    this.tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
    this.tray.setToolTip('Clauditor');
    this.tray.on('click', () => this.onShow?.());
    this.render();
  }

  update(sessions, states) {
    this.sessions = sessions;
    this.states = states;
    this.render();
  }

  render() {
    if (!this.tray) return;
    const urgent = mostUrgent(this.states);
    this.tray.setToolTip(`Clauditor — ${summary(this.states)}`);

    const sessionItems = this.sessions.map((s) => ({
      label: `${dot(this.states[s.id])}  ${s.name} — ${this.states[s.id] || 'unknown'}`,
      click: () => this.onFocusSession?.(s.id),
    }));

    const menu = Menu.buildFromTemplate([
      { label: 'Show Dashboard', click: () => this.onShow?.() },
      { type: 'separator' },
      { label: `Status: ${urgent}`, enabled: false },
      ...(sessionItems.length ? sessionItems : [{ label: 'No sessions', enabled: false }]),
      { type: 'separator' },
      { label: 'New Session', click: () => this.onNewSession?.() },
      { label: 'Quit', click: () => this.onQuit?.() },
    ]);
    this._menuLabels = [
      'Show Dashboard',
      'Status: ' + urgent,
      ...(sessionItems.length ? sessionItems.map(i => i.label) : ['No sessions']),
      'New Session',
      'Quit',
    ];
    this.tray.setContextMenu(menu);
  }

  menuLabels() {
    return this._menuLabels || [];
  }

  destroy() {
    this.tray?.destroy();
  }
}

function dot(state) {
  switch (state) {
    case 'running': return '🟢';
    case 'awaiting_user': return '🟡';
    case 'awaiting_permission': return '🔴';
    case 'idle': return '⚪';
    case 'exited': return '⚫';
    default: return '·';
  }
}

function summary(states) {
  const counts = {};
  for (const s of Object.values(states)) counts[s] = (counts[s] || 0) + 1;
  const parts = Object.entries(counts).map(([k, v]) => `${v} ${k}`);
  return parts.length ? parts.join(', ') : 'no sessions';
}

module.exports = { TrayController };
