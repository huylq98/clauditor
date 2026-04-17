/* global window, document */
(function () {
  const { flattenTree } = window.__clauditorTree;
  const searchInput = document.getElementById('tree-filter');
  const treeEl = document.getElementById('file-tree');
  const emptyEl = document.getElementById('tree-empty');
  const activityToggle = document.getElementById('activity-toggle');
  const activitySection = document.getElementById('sidebar-activity');
  const activityLog = document.getElementById('activity-log');

  const perSession = new Map(); // sid -> { children, expanded, query, modified, created, touching, log }
  let activeId = null;
  let api = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function blankState() {
    return {
      children: {},
      expanded: new Set(),
      query: '',
      modified: new Set(),
      created: new Set(),
      touching: new Set(),
      log: [],
    };
  }

  async function ensureState(sid) {
    if (perSession.has(sid)) return perSession.get(sid);
    const st = blankState();
    perSession.set(sid, st);
    const [rootChildren, snap] = await Promise.all([
      api.listTree(sid, '.'),
      api.getActivitySnapshot(sid),
    ]);
    st.children['.'] = rootChildren || [];
    if (snap) {
      st.modified = new Set(snap.modified);
      st.created = new Set(snap.created);
      st.touching = new Set(snap.touching);
      st.log = snap.log.slice();
    }
    return st;
  }

  async function loadChildren(sid, relPath) {
    const st = perSession.get(sid);
    if (!st) return;
    if (st.children[relPath]) return;
    st.children[relPath] = (await api.listTree(sid, relPath)) || [];
  }

  function renderTree() {
    if (!activeId) { treeEl.innerHTML = ''; emptyEl.style.display = 'block'; return; }
    emptyEl.style.display = 'none';
    const st = perSession.get(activeId);
    if (!st) { treeEl.innerHTML = ''; return; }
    const nodes = flattenTree({ children: st.children, expanded: st.expanded, query: st.query });
    treeEl.innerHTML = '';
    for (const n of nodes) {
      const li = document.createElement('li');
      li.className = 'tree-node';
      if (!n.dir) {
        if (st.touching.has(n.path)) li.classList.add('touching');
        if (st.created.has(n.path)) li.classList.add('created');
        else if (st.modified.has(n.path)) li.classList.add('modified');
      }
      li.style.paddingLeft = `${8 + n.depth * 12}px`;
      li.dataset.path = n.path;
      li.dataset.dir = n.dir ? '1' : '0';
      const glyph = n.dir
        ? (st.expanded.has(n.path) ? '▾' : '▸')
        : (st.created.has(n.path) ? '+' : st.modified.has(n.path) ? '●' : '·');
      li.innerHTML = `<span class="tree-glyph">${glyph}</span><span class="tree-name">${escapeHtml(n.name)}</span>`;
      li.onclick = () => onNodeClick(n);
      li.ondblclick = () => { if (!n.dir && api.revealPath) api.revealPath(activeId, n.path); };
      treeEl.appendChild(li);
    }
  }

  async function onNodeClick(n) {
    const st = perSession.get(activeId);
    if (!st) return;
    if (n.dir) {
      if (st.expanded.has(n.path)) st.expanded.delete(n.path);
      else { st.expanded.add(n.path); await loadChildren(activeId, n.path); }
      renderTree();
    }
  }

  function renderActivity() {
    if (!activeId) { activityLog.innerHTML = ''; return; }
    const st = perSession.get(activeId);
    if (!st) { activityLog.innerHTML = ''; return; }
    activityLog.innerHTML = '';
    for (const entry of st.log) {
      const li = document.createElement('li');
      const ts = new Date(entry.ts);
      const hms = ts.toTimeString().slice(0, 8);
      li.innerHTML = `<span class="act-time">${hms}</span><span class="act-kind act-${entry.kind}">${entry.kind}</span><span class="act-path">${escapeHtml(entry.path)}</span>`;
      li.onclick = () => revealInTree(entry.path);
      activityLog.appendChild(li);
    }
  }

  function revealInTree(absPath) {
    // Best-effort: look for a matching tree node by suffix match on the data-path.
    // The tree stores relative paths; activity paths are absolute. Match on tail.
    const nodes = treeEl.querySelectorAll('.tree-node');
    for (const n of nodes) {
      const p = n.dataset.path || '';
      if (absPath.endsWith(p)) {
        n.scrollIntoView({ block: 'center' });
        n.classList.add('flash');
        setTimeout(() => n.classList.remove('flash'), 1000);
        return;
      }
    }
  }

  searchInput.addEventListener('input', () => {
    if (!activeId) return;
    const st = perSession.get(activeId);
    if (!st) return;
    st.query = searchInput.value;
    renderTree();
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { searchInput.value = ''; searchInput.dispatchEvent(new Event('input')); }
  });

  activityToggle.addEventListener('click', () => {
    const collapsed = activitySection.classList.toggle('collapsed');
    activityToggle.setAttribute('aria-expanded', String(!collapsed));
    activityToggle.querySelector('.activity-arrow').textContent = collapsed ? '▸' : '▾';
  });

  function applyDelta(sid, d) {
    const st = perSession.get(sid);
    if (!st) return;
    if (d.type === 'touching-start') st.touching.add(d.path);
    else if (d.type === 'touching-end') st.touching.delete(d.path);
    else if (d.type === 'modified') { st.modified.add(d.path); st.log.unshift({ ts: Date.now(), kind: d.kind || 'edit', path: d.path }); }
    else if (d.type === 'created')  { st.created.add(d.path); st.modified.delete(d.path); }
    else if (d.type === 'deleted')  { st.modified.delete(d.path); st.created.delete(d.path); st.log.unshift({ ts: Date.now(), kind: 'delete', path: d.path }); }
    if (st.log.length > 20) st.log.length = 20;
    if (sid === activeId) { renderTree(); renderActivity(); }
  }

  async function applyTreeEvent(sid, ev) {
    const st = perSession.get(sid);
    if (!st) return;
    // Reload the parent dir from disk for simplicity — cheap, fine for small listings.
    const parent = dirOf(ev.path, st);
    if (parent !== null) {
      st.children[parent] = (await api.listTree(sid, parent)) || [];
      if (sid === activeId) renderTree();
    }
  }

  function dirOf(absPath, st) {
    // Best-effort: the tree root isn't stored here, so always reload root on any event for v1.
    return '.';
  }

  window.__clauditorSidebar = {
    init(apiImpl) { api = apiImpl; },
    async setActive(sid) {
      activeId = sid;
      if (sid) await ensureState(sid);
      searchInput.value = (sid && perSession.get(sid)?.query) || '';
      renderTree();
      renderActivity();
    },
    async addSession(sid) { await ensureState(sid); },
    removeSession(sid) {
      perSession.delete(sid);
      if (activeId === sid) { activeId = null; renderTree(); renderActivity(); }
    },
    applyDelta,
    applyTreeEvent,
  };
})();
