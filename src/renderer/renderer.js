/* global Terminal, FitAddon, WebLinksAddon */

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
    fontFamily: 'Menlo, Consolas, monospace',
    fontSize: 13,
    theme: { background: '#11111b', foreground: '#cdd6f4', cursor: '#f5e0dc' },
    cursorBlink: true,
    scrollback: 10000,
    allowProposedApi: true,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon.WebLinksAddon());
  return { term, fit };
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
  killBtn.disabled = s.state === 'exited';

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

newBtn.onclick = async () => {
  const s = await api.createSession();
  if (s) {
    const entry = ensureSession(s);
    selectSession(entry.id);
  }
};

killBtn.onclick = () => { if (activeId) api.killSession(activeId); };

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

window.addEventListener('resize', () => {
  const s = sessions.get(activeId);
  if (s) s.fit.fit();
});

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
  if (id === activeId) {
    updatePill(state);
    killBtn.disabled = state === 'exited';
  }
});

api.onExit((id) => {
  const s = sessions.get(id);
  if (!s) return;
  s.state = 'exited';
  renderList();
  if (id === activeId) { updatePill('exited'); killBtn.disabled = true; }
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
