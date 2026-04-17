/* global window, document */
(function () {
  const listEl = document.getElementById('tab-list');
  const menuBtn = document.getElementById('session-menu-btn');
  let openMenu = null;

  const state = {
    sessions: new Map(),     // id -> { id, name, state }
    activeId: null,
    onSelect: () => {},
    onClose: () => {},
    onRename: () => {},
    onKillAll: () => {},
    onRestartAllExited: () => {},
    onForgetAllExited: () => {},
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function render() {
    listEl.innerHTML = '';
    for (const s of state.sessions.values()) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `tab${s.id === state.activeId ? ' active' : ''}`;
      el.dataset.sessionId = s.id;
      el.setAttribute('role', 'tab');
      el.title = 'Double-click or right-click to rename';
      el.innerHTML = `
        <span class="status-dot ${s.state || ''}"></span>
        <span class="tab-name">${escapeHtml(s.name)}</span>
        <span class="tab-close" title="Close">×</span>
      `;
      el.onclick = (e) => {
        if (e.target.classList.contains('tab-close')) {
          state.onClose(s.id);
        } else {
          state.onSelect(s.id);
        }
      };
      el.ondblclick = (e) => {
        if (e.target.classList.contains('tab-close')) return;
        e.preventDefault();
        startRename(s.id, el);
      };
      el.oncontextmenu = (e) => {
        if (e.target.classList.contains('tab-close')) return;
        e.preventDefault();
        startRename(s.id, el);
      };
      listEl.appendChild(el);
    }
  }

  function startRename(id, el) {
    const s = state.sessions.get(id);
    if (!s) return;
    const nameEl = el.querySelector('.tab-name');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = s.name;
    input.className = 'tab-rename';
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    const commit = (save) => {
      if (save) state.onRename(id, input.value);
      render();
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(true); }
      else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
    };
    input.onblur = () => commit(true);
  }

  function closeBulkMenu() {
    if (!openMenu) return;
    openMenu.remove();
    openMenu = null;
    menuBtn?.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onOutsideClick, true);
    document.removeEventListener('keydown', onMenuKey, true);
  }

  function onOutsideClick(e) {
    if (!openMenu) return;
    if (openMenu.contains(e.target) || e.target === menuBtn) return;
    closeBulkMenu();
  }

  function onMenuKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeBulkMenu(); }
  }

  function countsBySide() {
    let running = 0, exited = 0;
    for (const s of state.sessions.values()) {
      if (s.state === 'exited') exited++;
      else running++;
    }
    return { running, exited };
  }

  function openBulkMenu() {
    if (openMenu) { closeBulkMenu(); return; }
    const { running, exited } = countsBySide();
    const tabbar = menuBtn.parentElement;
    const menu = document.createElement('div');
    menu.className = 'tab-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
      <button class="tab-menu-item" data-action="kill"    ${running === 0 ? 'disabled' : ''}>Kill ${running} running</button>
      <button class="tab-menu-item" data-action="restart" ${exited  === 0 ? 'disabled' : ''}>Restart ${exited} exited</button>
      <button class="tab-menu-item" data-action="forget"  ${exited  === 0 ? 'disabled' : ''}>Close ${exited} exited</button>
    `;
    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-menu-item');
      if (!btn || btn.hasAttribute('disabled')) return;
      const action = btn.dataset.action;
      closeBulkMenu();
      if (action === 'kill') state.onKillAll();
      else if (action === 'restart') state.onRestartAllExited();
      else if (action === 'forget') state.onForgetAllExited();
    });
    tabbar.appendChild(menu);
    openMenu = menu;
    menuBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('mousedown', onOutsideClick, true);
    document.addEventListener('keydown', onMenuKey, true);
  }

  if (menuBtn) menuBtn.addEventListener('click', openBulkMenu);

  function keyHandler(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      cycle(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === 'w' || e.key === 'W') {
      if (state.activeId) {
        e.preventDefault();
        state.onClose(state.activeId);
      }
      return;
    }
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= 9) {
      const ids = [...state.sessions.keys()];
      const target = ids[n - 1];
      if (target) {
        e.preventDefault();
        state.onSelect(target);
      }
    }
  }

  function cycle(dir) {
    const ids = [...state.sessions.keys()];
    if (!ids.length) return;
    const cur = ids.indexOf(state.activeId);
    const next = ids[(cur + dir + ids.length) % ids.length];
    state.onSelect(next);
  }

  // Horizontal wheel scroll over the tab list
  listEl.addEventListener('wheel', (e) => {
    if (e.deltaY !== 0) {
      listEl.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, { passive: false });

  window.addEventListener('keydown', keyHandler);

  window.__clauditorTabBar = {
    init(callbacks) { Object.assign(state, callbacks); },
    upsert(session) {
      state.sessions.set(session.id, {
        id: session.id,
        name: session.name,
        state: session.state || 'running',
      });
      render();
    },
    remove(id) { state.sessions.delete(id); render(); },
    setActive(id) { state.activeId = id; render(); scrollIntoView(id); },
    setState(id, st) {
      const s = state.sessions.get(id);
      if (s) { s.state = st; render(); }
    },
    setName(id, name) {
      const s = state.sessions.get(id);
      if (s) { s.name = name; render(); }
    },
    getIds() { return [...state.sessions.keys()]; },
  };

  function scrollIntoView(id) {
    const el = listEl.querySelector(`[data-session-id="${id}"]`);
    if (el?.scrollIntoView) el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }
})();
