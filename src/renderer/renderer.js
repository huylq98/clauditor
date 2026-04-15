/* global Terminal, FitAddon, WebLinksAddon, WebglAddon */

const api = window.clauditor;

const sessions = new Map();
let activeId = null;

const listEl = document.getElementById('session-list');
const cwdLabel = document.getElementById('cwd-label');
const statePill = document.getElementById('state-pill');
const killBtn = document.getElementById('kill-btn');
const termContainer = document.getElementById('terminal-container');
const aggregateEl = document.getElementById('aggregate');
const newBtn = document.getElementById('new-session');

function createTerminal() {
  const term = new Terminal({
    fontFamily: '"Cascadia Code", "Cascadia Mono", "Consolas", "Menlo", monospace',
    fontSize: 13,
    theme: { background: '#11111b', foreground: '#cdd6f4', cursor: '#f5e0dc' },
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
    return true;
  } catch (e) {
    console.warn('webgl renderer unavailable, falling back to DOM:', e);
    return false;
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
  renderList();
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
  renderList();
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

function renderList() {
  listEl.innerHTML = '';
  for (const s of sessions.values()) {
    const li = document.createElement('li');
    li.className = `session-item${s.id === activeId ? ' active' : ''}`;
    li.innerHTML = `
      <span class="status-dot ${s.state}"></span>
      <span class="session-meta">
        <span class="session-name">${escapeHtml(s.name)}</span>
        <span class="session-cwd">${escapeHtml(s.cwd)}</span>
      </span>
    `;
    li.onclick = () => selectSession(s.id);
    li.ondblclick = (e) => { e.stopPropagation(); startRename(s.id, li); };
    listEl.appendChild(li);
  }
  renderAggregate();
}

function renderAggregate() {
  const counts = {};
  for (const s of sessions.values()) counts[s.state] = (counts[s.state] || 0) + 1;
  const parts = Object.entries(counts).map(([k, v]) => `${v} ${k}`);
  aggregateEl.textContent = parts.length ? parts.join(' · ') : 'No sessions';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function probeDims() {
  // Pre-create a hidden, sized terminal element to measure cols/rows
  // for the about-to-spawn session.
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

newBtn.onclick = async () => {
  const { cols, rows } = probeDims();
  const s = await api.createSession({ cols, rows });
  if (s) {
    const entry = ensureSession(s);
    selectSession(entry.id);
  }
};

killBtn.onclick = async () => {
  if (!activeId) return;
  const s = sessions.get(activeId);
  if (!s) return;
  if (s.state === 'exited') {
    const created = await api.createSession({ cwd: s.cwd, name: s.name });
    if (created) {
      const oldEntry = sessions.get(activeId);
      if (oldEntry?.el) oldEntry.el.remove();
      sessions.delete(activeId);
      const entry = ensureSession(created);
      selectSession(entry.id);
    }
  } else {
    api.killSession(activeId);
  }
};

function startRename(id, li) {
  const s = sessions.get(id);
  if (!s) return;
  const nameEl = li.querySelector('.session-name');
  if (!nameEl) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = s.name;
  input.className = 'session-rename';
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  const commit = async (save) => {
    if (save) {
      const updated = await api.renameSession(id, input.value);
      if (updated) s.name = updated.name;
    }
    renderList();
  };
  input.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(true); }
    else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
  };
  input.onblur = () => commit(true);
}

const sidebarEl = document.getElementById('sidebar');
const toggleBtn = document.getElementById('sidebar-toggle');
const COLLAPSE_THRESHOLD = 1100;
let userPinned = null; // null=auto, true=expanded, false=collapsed

function applySidebarState() {
  const wantCollapsed = userPinned === null
    ? window.innerWidth < COLLAPSE_THRESHOLD
    : !userPinned;
  sidebarEl.classList.toggle('collapsed', wantCollapsed);
  toggleBtn.textContent = wantCollapsed ? '»' : '«';
}

toggleBtn.onclick = () => {
  userPinned = sidebarEl.classList.contains('collapsed');
  applySidebarState();
  refit();
};

function refit() {
  const s = sessions.get(activeId);
  if (s) requestAnimationFrame(() => s.fit.fit());
}

window.addEventListener('resize', () => {
  applySidebarState();
  refit();
});

applySidebarState();

api.onCreated((s) => {
  const entry = ensureSession(s);
  if (!activeId) selectSession(entry.id);
});

api.onData((id, chunk) => {
  const s = sessions.get(id);
  if (s && s.hydrated) s.term.write(chunk);
});

api.onState((id, state) => {
  const s = sessions.get(id);
  if (!s) return;
  s.state = state;
  renderList();
  if (id === activeId) updatePill(state);
});

api.onExit((id) => {
  const s = sessions.get(id);
  if (!s) return;
  s.state = 'exited';
  renderList();
  if (id === activeId) updatePill('exited');
});

api.onRenamed((updated) => {
  const s = sessions.get(updated.id);
  if (!s) return;
  s.name = updated.name;
  renderList();
});

api.onFocus((id) => { if (id && sessions.has(id)) selectSession(id); });
api.onNewSessionRequest(() => newBtn.click());

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
    getSessions: () => Array.from(sessions.values()).map(({ term, fit, el, ...rest }) => rest),
    getActiveId: () => activeId,
  };
}
