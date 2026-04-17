/* global Terminal, FitAddon, WebLinksAddon, WebglAddon */

const api = window.clauditor;
const tabBar = window.__clauditorTabBar;
const sidebar = window.__clauditorSidebar;

const sessions = new Map();
let activeId = null;

const cwdLabel = document.getElementById('cwd-label');
const statePill = document.getElementById('state-pill');
const killBtn = document.getElementById('kill-btn');
const termContainer = document.getElementById('terminal-container');
const aggregateEl = document.getElementById('aggregate');
const newBtn = document.getElementById('new-session');

sidebar.init({
  listTree: api.listTree,
  getActivitySnapshot: api.getActivitySnapshot,
});
tabBar.init({
  onSelect: (id) => selectSession(id),
  onClose: (id) => closeSession(id),
  onRename: (id, name) => api.renameSession(id, name),
});

function createTerminal() {
  const term = new Terminal({
    fontFamily: '"JetBrains Mono", "Cascadia Mono", "Consolas", "Menlo", monospace',
    fontSize: 13,
    theme: {
      background: '#0b0c10', foreground: '#ece4d2',
      cursor: '#ff5a36', cursorAccent: '#0b0c10',
      selectionBackground: 'rgba(255, 90, 54, 0.28)',
      black: '#141519', red: '#ff5a36', green: '#a3c966', yellow: '#e8b04d',
      blue: '#8fb3c5', magenta: '#c99ad3', cyan: '#7dc2c4', white: '#ece4d2',
      brightBlack: '#66625a', brightRed: '#ff7858', brightGreen: '#b5d97d',
      brightYellow: '#f0c268', brightBlue: '#a6c6d5', brightMagenta: '#d6aee0',
      brightCyan: '#95d2d4', brightWhite: '#faf3e3',
    },
    cursorBlink: true,
    scrollback: 10000,
    allowProposedApi: true,
    smoothScrollDuration: 0,
    macOptionIsMeta: true,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon.WebLinksAddon());
  return { term, fit };
}

function tryEnableWebgl(term) {
  try {
    const webgl = new WebglAddon.WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    term.loadAddon(webgl);
  } catch (e) {
    console.warn('webgl renderer unavailable:', e);
  }
}

function ensureSession(s) {
  if (sessions.has(s.id)) return sessions.get(s.id);
  const { term, fit } = createTerminal();
  const el = document.createElement('div');
  el.className = 'xterm-mount';
  el.style.height = '100%';
  el.style.display = 'none';
  termContainer.appendChild(el);
  term.open(el);
  tryEnableWebgl(term);

  term.onData((data) => api.write(s.id, data));
  term.onResize(({ cols, rows }) => api.resize(s.id, cols, rows));

  const entry = { ...s, state: s.state || 'running', term, fit, el };
  sessions.set(s.id, entry);
  tabBar.upsert(entry);
  sidebar.addSession(entry.id);
  renderAggregate();
  return entry;
}

async function selectSession(id) {
  activeId = id;
  for (const [sid, s] of sessions) {
    s.el.style.display = sid === id ? 'block' : 'none';
  }
  const s = sessions.get(id);
  if (!s) {
    cwdLabel.textContent = 'No session';
    statePill.className = 'pill';
    statePill.textContent = '—';
    killBtn.disabled = true;
    tabBar.setActive(null);
    await sidebar.setActive(null);
    return;
  }
  cwdLabel.textContent = s.cwd;
  updatePill(s.state);
  if (!s.hydrated) {
    const buf = await api.getBuffer(id);
    if (buf) s.term.write(buf);
    s.hydrated = true;
  }
  requestAnimationFrame(() => { s.fit.fit(); s.term.focus(); });
  tabBar.setActive(id);
  await sidebar.setActive(id);
}

function updatePill(state) {
  statePill.className = `pill ${state || ''}`;
  statePill.textContent = state || '—';
  if (state === 'exited') {
    killBtn.textContent = 'Restart';
    killBtn.disabled = false;
    killBtn.classList.add('restart');
  } else {
    killBtn.textContent = 'Kill';
    killBtn.disabled = !state;
    killBtn.classList.remove('restart');
  }
}

function renderAggregate() {
  const counts = {};
  for (const s of sessions.values()) counts[s.state] = (counts[s.state] || 0) + 1;
  const parts = Object.entries(counts).map(([k, v]) => `${v} ${k}`);
  aggregateEl.textContent = parts.length ? parts.join(' · ') : 'No sessions';
}

function probeDims() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;width:100%;height:100%;';
  termContainer.appendChild(probe);
  const t = new Terminal({ fontFamily: '"Cascadia Code", "Consolas", monospace', fontSize: 13 });
  const fit = new FitAddon.FitAddon();
  t.loadAddon(fit);
  t.open(probe);
  let dims;
  try { dims = fit.proposeDimensions(); } catch {}
  t.dispose();
  probe.remove();
  return dims && dims.cols ? { cols: dims.cols, rows: dims.rows } : { cols: 180, rows: 45 };
}

async function closeSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  if (s.state !== 'exited') {
    const ok = window.confirm(`Kill session "${s.name}"?`);
    if (!ok) return;
    api.killSession(id);
    return;
  }
  s.el.remove();
  sessions.delete(id);
  tabBar.remove(id);
  sidebar.removeSession(id);
  if (activeId === id) {
    const first = sessions.keys().next().value || null;
    await selectSession(first);
  }
  renderAggregate();
}

newBtn.onclick = async () => {
  const { cols, rows } = probeDims();
  const s = await api.createSession({ cols, rows });
  if (s) { const entry = ensureSession(s); selectSession(entry.id); }
};

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 't' || e.key === 'T')) {
    e.preventDefault();
    newBtn.click();
  }
});

killBtn.onclick = async () => {
  if (!activeId) return;
  const s = sessions.get(activeId);
  if (!s) return;
  if (s.state === 'exited') {
    const created = await api.createSession({ cwd: s.cwd, name: s.name });
    if (created) {
      const old = sessions.get(activeId);
      if (old?.el) old.el.remove();
      sessions.delete(activeId);
      tabBar.remove(activeId);
      sidebar.removeSession(activeId);
      const entry = ensureSession(created);
      selectSession(entry.id);
    }
  } else {
    api.killSession(activeId);
  }
};

function refit() {
  const s = sessions.get(activeId);
  if (s) requestAnimationFrame(() => s.fit.fit());
}
window.addEventListener('resize', refit);

api.onCreated((s) => { const entry = ensureSession(s); if (!activeId) selectSession(entry.id); });
api.onData((id, chunk) => { const s = sessions.get(id); if (s && s.hydrated) s.term.write(chunk); });
api.onState((id, state) => {
  const s = sessions.get(id);
  if (!s) return;
  s.state = state;
  tabBar.setState(id, state);
  renderAggregate();
  if (id === activeId) updatePill(state);
});
api.onExit((id) => {
  const s = sessions.get(id);
  if (!s) return;
  s.state = 'exited';
  tabBar.setState(id, 'exited');
  renderAggregate();
  if (id === activeId) updatePill('exited');
});
api.onRenamed((updated) => {
  const s = sessions.get(updated.id);
  if (!s) return;
  s.name = updated.name;
  tabBar.setName(updated.id, updated.name);
});
api.onFocus((id) => { if (id && sessions.has(id)) selectSession(id); });
api.onNewSessionRequest(() => newBtn.click());
api.onTreeEvent((sid, ev) => sidebar.applyTreeEvent(sid, ev));
api.onActivityDelta((sid, delta) => sidebar.applyDelta(sid, delta));

(async () => {
  const existing = await api.listSessions();
  for (const s of existing) ensureSession(s);
  if (existing[0]) selectSession(existing[0].id);
})();

if (window.__clauditorTestBridge?.enabled) {
  window.__clauditorTest = {
    getActiveTermBuffer: () => {
      const s = sessions.get(activeId);
      if (!s) return '';
      const buf = s.term.buffer.active;
      const lines = [];
      for (let i = 0; i < buf.length; i++) {
        const line = buf.getLine(i);
        if (line) lines.push(line.translateToString(true));
      }
      return lines.join('\n');
    },
    getSessions: () => Array.from(sessions.values()).map((s) => ({
      id: s.id, name: s.name, cwd: s.cwd, pid: s.pid, state: s.state,
    })),
    getActiveId: () => activeId,
    getTabIds: () => tabBar.getIds(),
    getTreePaths: () => Array.from(document.querySelectorAll('#file-tree .tree-node'))
      .map((li) => ({ path: li.dataset.path, classes: li.className })),
  };
}
