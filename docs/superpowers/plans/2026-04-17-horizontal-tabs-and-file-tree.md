# Horizontal Tabs + Per-Session File Tree — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move session selection from a left sidebar to a horizontal tab bar under the rail, and repurpose the sidebar as a per-session file explorer (search + tree + activity panel) that highlights files Claude has modified this session and is touching right now.

**Architecture:** Main process gains `FileWatcher` (chokidar per session) and `FileActivityService` (state from `pre-tool-use` / `post-tool-use` hook payloads, keyed by session ID). Renderer is split into `tabbar.js`, `sidebar.js`, and pure `tree.js` view logic. IPC surface gains `listTree` / `onTreeEvent` / `getActivitySnapshot` / `onActivityDelta`.

**Tech Stack:** Electron 33, Node.js, Playwright (unit/pty/e2e projects), chokidar (new), xterm.js. Tests use `@playwright/test` runner with three projects configured in `playwright.config.js` — `unit`, `pty`, `e2e`.

**Reference:** Spec `docs/superpowers/specs/2026-04-17-horizontal-tabs-and-file-tree-design.md`.

**Global conventions:**
- Paths in test code use `path.join` / `os.tmpdir()` — do not hard-code platform separators.
- Run unit tests with `npx playwright test --project=unit`, pty with `--project=pty`, e2e with `--project=e2e`.
- Commit after every green step cluster (Red-Green-Commit).
- Existing tests must stay green. If a test breaks because it touched the old DOM, migrate it as part of the same task — do not skip it.

---

## Task 1: Add chokidar dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install chokidar**

Run:
```bash
npm install --save chokidar@^3.6.0
```

- [ ] **Step 2: Verify it imports from a Node REPL**

Run:
```bash
node -e "const c = require('chokidar'); console.log(typeof c.watch);"
```

Expected: prints `function`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add chokidar for per-session file watching"
```

---

## Task 2: `FileWatcher` module — test first

**Files:**
- Create: `src/main/file-watcher.js`
- Create: `tests/unit/file-watcher.test.js`

This module watches one directory per session, emits add/unlink/change events tagged with the session id, and lazy-lists subtrees on demand. No hook awareness here — pure filesystem.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/file-watcher.test.js`:

```js
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FileWatcher } = require('../../src/main/file-watcher.js');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'clauditor-fw-'));
}

function waitFor(predicate, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('timed out'));
      setTimeout(tick, 20);
    };
    tick();
  });
}

test('lists top-level entries, applies default ignore list', async () => {
  const root = tmpDir();
  fs.writeFileSync(path.join(root, 'a.js'), '');
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.writeFileSync(path.join(root, 'node_modules', 'ignored.js'), '');

  const fw = new FileWatcher();
  await fw.create('s1', root);
  const entries = await fw.list('s1', '.');
  const names = entries.map((e) => e.name).sort();
  expect(names).toEqual(['a.js', 'src']);
  await fw.destroy('s1');
});

test('emits add event when a file appears', async () => {
  const root = tmpDir();
  const fw = new FileWatcher();
  const events = [];
  fw.on('event', (sid, ev) => events.push({ sid, ...ev }));
  await fw.create('s1', root);

  fs.writeFileSync(path.join(root, 'new.js'), 'hi');

  await waitFor(() => events.some((e) => e.type === 'add' && e.path.endsWith('new.js')));
  await fw.destroy('s1');
});

test('list returns dirs before files, alphabetical within kind', async () => {
  const root = tmpDir();
  fs.writeFileSync(path.join(root, 'z.txt'), '');
  fs.writeFileSync(path.join(root, 'a.txt'), '');
  fs.mkdirSync(path.join(root, 'bdir'));
  fs.mkdirSync(path.join(root, 'adir'));

  const fw = new FileWatcher();
  await fw.create('s1', root);
  const entries = await fw.list('s1', '.');
  expect(entries.map((e) => e.name)).toEqual(['adir', 'bdir', 'a.txt', 'z.txt']);
  await fw.destroy('s1');
});

test('destroy stops further events', async () => {
  const root = tmpDir();
  const fw = new FileWatcher();
  const events = [];
  fw.on('event', (_sid, ev) => events.push(ev));
  await fw.create('s1', root);
  await fw.destroy('s1');
  fs.writeFileSync(path.join(root, 'late.js'), '');
  await new Promise((r) => setTimeout(r, 200));
  expect(events.find((e) => e.path?.endsWith('late.js'))).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test --project=unit tests/unit/file-watcher.test.js`
Expected: FAIL — `Cannot find module '../../src/main/file-watcher.js'`.

- [ ] **Step 3: Implement `FileWatcher`**

Create `src/main/file-watcher.js`:

```js
const { EventEmitter } = require('events');
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');

const DEFAULT_IGNORES = ['.git', 'node_modules', 'dist', 'build', '.next', '.cache', 'out'];

class FileWatcher extends EventEmitter {
  constructor() {
    super();
    this.watchers = new Map(); // sid -> { root, watcher, ignores }
  }

  async create(sid, root) {
    if (this.watchers.has(sid)) await this.destroy(sid);
    const ignores = this._buildIgnores(root);
    const watcher = chokidar.watch(root, {
      ignored: (p) => this._shouldIgnore(p, root, ignores),
      ignoreInitial: true,
      depth: Infinity,
      awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
    });
    watcher.on('add', (p) => this.emit('event', sid, { type: 'add', path: p }));
    watcher.on('change', (p) => this.emit('event', sid, { type: 'change', path: p }));
    watcher.on('unlink', (p) => this.emit('event', sid, { type: 'unlink', path: p }));
    watcher.on('addDir', (p) => { if (p !== root) this.emit('event', sid, { type: 'addDir', path: p }); });
    watcher.on('unlinkDir', (p) => this.emit('event', sid, { type: 'unlinkDir', path: p }));
    this.watchers.set(sid, { root, watcher, ignores });
    await new Promise((res) => watcher.on('ready', res));
  }

  async destroy(sid) {
    const entry = this.watchers.get(sid);
    if (!entry) return;
    this.watchers.delete(sid);
    await entry.watcher.close();
  }

  async list(sid, relPath) {
    const entry = this.watchers.get(sid);
    if (!entry) return [];
    const abs = path.resolve(entry.root, relPath || '.');
    let dirents;
    try {
      dirents = await fs.promises.readdir(abs, { withFileTypes: true });
    } catch {
      return [];
    }
    return dirents
      .filter((d) => !this._shouldIgnore(path.join(abs, d.name), entry.root, entry.ignores))
      .map((d) => ({ name: d.name, dir: d.isDirectory() }))
      .sort((a, b) => {
        if (a.dir !== b.dir) return a.dir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  _buildIgnores(root) {
    const set = new Set(DEFAULT_IGNORES);
    const gi = path.join(root, '.gitignore');
    try {
      const text = fs.readFileSync(gi, 'utf8');
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#') || line.startsWith('!')) continue;
        const normalized = line.replace(/^\/+|\/+$/g, '');
        if (normalized && !normalized.includes('/') && !normalized.includes('*')) {
          set.add(normalized);
        }
      }
    } catch {}
    return set;
  }

  _shouldIgnore(abs, root, ignores) {
    if (abs === root) return false;
    const rel = path.relative(root, abs);
    if (!rel || rel.startsWith('..')) return false;
    const segments = rel.split(path.sep);
    return segments.some((seg) => ignores.has(seg));
  }
}

module.exports = { FileWatcher, DEFAULT_IGNORES };
```

- [ ] **Step 4: Run tests until green**

Run: `npx playwright test --project=unit tests/unit/file-watcher.test.js`
Expected: PASS 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/main/file-watcher.js tests/unit/file-watcher.test.js
git commit -m "feat(main): FileWatcher — per-session chokidar wrapper"
```

---

## Task 3: Extend `hook-server.js` to emit file-activity events

The existing hook-server dispatches hook names to the state engine. Add a second side-effect: when tool hooks carry a `file_path`, emit a `file-activity` event on the server so a downstream service can subscribe.

**Files:**
- Modify: `src/main/hook-server.js`
- Modify: `tests/unit/hook-server.test.js`

- [ ] **Step 1: Add a failing test for file-activity emission**

Append to `tests/unit/hook-server.test.js`:

```js
test('emits file-activity for pre-tool-use Edit with file_path', async () => {
  engine.register('s1');
  const events = [];
  server.on('file-activity', (ev) => events.push(ev));
  const res = await post('/hook/pre-tool-use', {
    clauditor_ppid: 4242,
    tool_name: 'Edit',
    tool_input: { file_path: '/tmp/project/src/app.js' },
  }, { 'X-Clauditor-Token': 'secret' });
  expect(res.status).toBe(200);
  expect(events).toEqual([{
    sid: 's1', tool: 'Edit', phase: 'pre', path: '/tmp/project/src/app.js',
  }]);
});

test('emits file-activity for post-tool-use Write', async () => {
  engine.register('s1');
  const events = [];
  server.on('file-activity', (ev) => events.push(ev));
  await post('/hook/post-tool-use', {
    clauditor_ppid: 4242,
    tool_name: 'Write',
    tool_input: { file_path: '/tmp/x.js' },
  }, { 'X-Clauditor-Token': 'secret' });
  expect(events).toEqual([{
    sid: 's1', tool: 'Write', phase: 'post', path: '/tmp/x.js',
  }]);
});

test('ignores tools without file_path', async () => {
  engine.register('s1');
  const events = [];
  server.on('file-activity', (ev) => events.push(ev));
  await post('/hook/pre-tool-use', {
    clauditor_ppid: 4242, tool_name: 'Bash', tool_input: { command: 'ls' },
  }, { 'X-Clauditor-Token': 'secret' });
  expect(events).toEqual([]);
});

test('ignores file-activity when ppid does not match', async () => {
  engine.register('s1');
  const events = [];
  server.on('file-activity', (ev) => events.push(ev));
  await post('/hook/pre-tool-use', {
    clauditor_ppid: 9999, tool_name: 'Edit', tool_input: { file_path: '/x' },
  }, { 'X-Clauditor-Token': 'secret' });
  expect(events).toEqual([]);
});
```

- [ ] **Step 2: Run tests and watch them fail**

Run: `npx playwright test --project=unit tests/unit/hook-server.test.js`
Expected: the four new tests FAIL (no `file-activity` listener fires).

- [ ] **Step 3: Make `HookServer` an `EventEmitter` and emit on tool hooks**

Edit `src/main/hook-server.js`:

Replace the top of the file and the `class HookServer` declaration. Full updated file:

```js
const express = require('express');
const bodyParser = require('body-parser');
const { EventEmitter } = require('events');

const PORT = 27182;
const ACTIVITY_TOOLS = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

class HookServer extends EventEmitter {
  constructor({ token, stateEngine, ptyManager }) {
    super();
    this.token = token;
    this.stateEngine = stateEngine;
    this.ptyManager = ptyManager;
    this.app = express();
    this.app.use(bodyParser.json({ limit: '2mb' }));
    this.app.use(bodyParser.text({ type: '*/*', limit: '2mb' }));

    this.app.use((req, res, next) => {
      const t = req.header('X-Clauditor-Token') || req.query.token;
      if (t !== this.token) return res.status(403).json({ error: 'forbidden' });
      next();
    });

    const handle = (hookName) => (req, res) => {
      const payload = typeof req.body === 'string' ? tryParse(req.body) : req.body || {};
      const ppid = Number(payload.clauditor_ppid) || 0;
      const sid = this.ptyManager?.findIdByPid(ppid) || null;
      if (sid) {
        this.stateEngine.handleHook(sid, hookName);
        this._maybeEmitActivity(sid, hookName, payload);
      }
      res.json({ ok: true, sid });
    };

    this.app.post('/hook/user-prompt-submit', handle('user-prompt-submit'));
    this.app.post('/hook/pre-tool-use', handle('pre-tool-use'));
    this.app.post('/hook/post-tool-use', handle('post-tool-use'));
    this.app.post('/hook/stop', handle('stop'));
    this.app.post('/hook/notification', handle('notification'));
    this.app.get('/health', (_req, res) => res.json({ ok: true }));
  }

  _maybeEmitActivity(sid, hookName, payload) {
    if (hookName !== 'pre-tool-use' && hookName !== 'post-tool-use') return;
    const tool = payload.tool_name;
    const filePath = payload.tool_input?.file_path;
    if (!tool || !ACTIVITY_TOOLS.has(tool) || typeof filePath !== 'string') return;
    this.emit('file-activity', {
      sid, tool,
      phase: hookName === 'pre-tool-use' ? 'pre' : 'post',
      path: filePath,
    });
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(PORT, '127.0.0.1', (err) => {
        if (err) reject(err);
        else resolve(PORT);
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) this.server.close(() => resolve());
      else resolve();
    });
  }
}

function tryParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}

module.exports = { HookServer, PORT };
```

- [ ] **Step 4: Run tests and verify green**

Run: `npx playwright test --project=unit tests/unit/hook-server.test.js`
Expected: all tests PASS (old + new).

- [ ] **Step 5: Commit**

```bash
git add src/main/hook-server.js tests/unit/hook-server.test.js
git commit -m "feat(hooks): emit file-activity events from tool hooks"
```

---

## Task 4: `FileActivityService` — test first

Aggregates file-activity events per session into `modified` / `created` / `touching` sets and a 20-entry ring buffer. Clears "touching" on matching post-tool-use or after 3s TTL.

**Files:**
- Create: `src/main/file-activity-service.js`
- Create: `tests/unit/file-activity-service.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/file-activity-service.test.js`:

```js
const { test, expect } = require('@playwright/test');
const { FileActivityService } = require('../../src/main/file-activity-service.js');

function makeSvc(now) {
  const clock = { t: now };
  const svc = new FileActivityService({ now: () => clock.t, ttlMs: 3000, logCap: 20 });
  return { svc, clock };
}

test('register creates empty state', () => {
  const { svc } = makeSvc(0);
  svc.register('s1');
  const snap = svc.snapshot('s1');
  expect(snap).toEqual({ modified: [], created: [], touching: [], log: [] });
});

test('pre-tool-use Edit marks path as touching', () => {
  const { svc } = makeSvc(1000);
  svc.register('s1');
  const deltas = [];
  svc.on('delta', (sid, d) => deltas.push({ sid, ...d }));
  svc.handle({ sid: 's1', tool: 'Edit', phase: 'pre', path: '/a.js' });
  expect(svc.snapshot('s1').touching).toEqual(['/a.js']);
  expect(deltas).toContainEqual({ sid: 's1', type: 'touching-start', path: '/a.js' });
});

test('post-tool-use Write promotes to modified and logs', () => {
  const { svc } = makeSvc(1000);
  svc.register('s1');
  svc.handle({ sid: 's1', tool: 'Write', phase: 'pre', path: '/a.js' });
  svc.handle({ sid: 's1', tool: 'Write', phase: 'post', path: '/a.js' });
  const snap = svc.snapshot('s1');
  expect(snap.modified).toEqual(['/a.js']);
  expect(snap.touching).toEqual([]);
  expect(snap.log.length).toBe(1);
  expect(snap.log[0]).toMatchObject({ kind: 'write', path: '/a.js' });
});

test('touching auto-expires after ttl', () => {
  const { svc, clock } = makeSvc(1000);
  svc.register('s1');
  svc.handle({ sid: 's1', tool: 'Edit', phase: 'pre', path: '/a.js' });
  clock.t = 5000;
  svc.tick();
  expect(svc.snapshot('s1').touching).toEqual([]);
});

test('log is capped at logCap newest-first', () => {
  const { svc, clock } = makeSvc(0);
  const capSvc = new FileActivityService({ now: () => clock.t, ttlMs: 3000, logCap: 3 });
  capSvc.register('s1');
  for (let i = 0; i < 5; i++) {
    clock.t = i;
    capSvc.handle({ sid: 's1', tool: 'Edit', phase: 'post', path: `/f${i}.js` });
  }
  const paths = capSvc.snapshot('s1').log.map((e) => e.path);
  expect(paths).toEqual(['/f4.js', '/f3.js', '/f2.js']);
});

test('unregister clears state', () => {
  const { svc } = makeSvc(0);
  svc.register('s1');
  svc.handle({ sid: 's1', tool: 'Edit', phase: 'post', path: '/a.js' });
  svc.unregister('s1');
  expect(svc.snapshot('s1')).toBeNull();
});

test('ignores activity for unknown session', () => {
  const { svc } = makeSvc(0);
  svc.handle({ sid: 'ghost', tool: 'Edit', phase: 'post', path: '/a.js' });
  expect(svc.snapshot('ghost')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test --project=unit tests/unit/file-activity-service.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the service**

Create `src/main/file-activity-service.js`:

```js
const { EventEmitter } = require('events');

const TOOL_TO_KIND = {
  Read: 'read',
  Write: 'write',
  Edit: 'edit',
  MultiEdit: 'edit',
  NotebookEdit: 'edit',
};

class FileActivityService extends EventEmitter {
  constructor({ now = () => Date.now(), ttlMs = 3000, logCap = 20 } = {}) {
    super();
    this.now = now;
    this.ttlMs = ttlMs;
    this.logCap = logCap;
    this.state = new Map(); // sid -> { modified:Set, created:Set, touching:Map<path, ts>, log:[] }
  }

  register(sid) {
    if (this.state.has(sid)) return;
    this.state.set(sid, {
      modified: new Set(),
      created: new Set(),
      touching: new Map(),
      log: [],
    });
  }

  unregister(sid) {
    this.state.delete(sid);
  }

  snapshot(sid) {
    const s = this.state.get(sid);
    if (!s) return null;
    return {
      modified: [...s.modified],
      created: [...s.created],
      touching: [...s.touching.keys()],
      log: s.log.slice(),
    };
  }

  handle({ sid, tool, phase, path }) {
    const s = this.state.get(sid);
    if (!s) return;
    if (phase === 'pre') {
      s.touching.set(path, this.now());
      this.emit('delta', sid, { type: 'touching-start', path });
      return;
    }
    // post phase
    s.touching.delete(path);
    const kind = TOOL_TO_KIND[tool] || 'edit';
    if (kind === 'read') {
      // Read doesn't change the file — only log it, no modified/created mark.
      this._pushLog(sid, { ts: this.now(), kind, path });
      this.emit('delta', sid, { type: 'touching-end', path });
      return;
    }
    if (!s.modified.has(path) && !s.created.has(path)) {
      // First time we see this path being written — treat as modified unless
      // the fs watcher independently flags it as newly created (handled elsewhere).
      s.modified.add(path);
    }
    this._pushLog(sid, { ts: this.now(), kind, path });
    this.emit('delta', sid, { type: 'modified', path });
    this.emit('delta', sid, { type: 'touching-end', path });
  }

  markCreated(sid, path) {
    const s = this.state.get(sid);
    if (!s) return;
    s.modified.delete(path);
    s.created.add(path);
    this.emit('delta', sid, { type: 'created', path });
  }

  markDeleted(sid, path) {
    const s = this.state.get(sid);
    if (!s) return;
    s.modified.delete(path);
    s.created.delete(path);
    this._pushLog(sid, { ts: this.now(), kind: 'delete', path });
    this.emit('delta', sid, { type: 'deleted', path });
  }

  tick() {
    const cutoff = this.now() - this.ttlMs;
    for (const [sid, s] of this.state) {
      for (const [path, ts] of s.touching) {
        if (ts < cutoff) {
          s.touching.delete(path);
          this.emit('delta', sid, { type: 'touching-end', path });
        }
      }
    }
  }

  _pushLog(sid, entry) {
    const s = this.state.get(sid);
    s.log.unshift(entry);
    if (s.log.length > this.logCap) s.log.length = this.logCap;
  }
}

module.exports = { FileActivityService };
```

- [ ] **Step 4: Run tests until green**

Run: `npx playwright test --project=unit tests/unit/file-activity-service.test.js`
Expected: 7/7 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/file-activity-service.js tests/unit/file-activity-service.test.js
git commit -m "feat(main): FileActivityService — per-session activity state"
```

---

## Task 5: Wire watcher + activity service into `main/index.js` and preload

Glue the new services into the app lifecycle and expose them to the renderer.

**Files:**
- Modify: `src/main/index.js`
- Modify: `src/preload/preload.js`

- [ ] **Step 1: Wire services in `src/main/index.js`**

At the top of `src/main/index.js`, after the existing requires, add:

```js
const { FileWatcher } = require('./file-watcher');
const { FileActivityService } = require('./file-activity-service');
```

Add two module-level vars near `ptyManager` etc:

```js
let fileWatcher = null;
let activityService = null;
let activityTick = null;
```

Inside `bootstrap()`, after `hookServer = new HookServer(...)` but before `await hookServer.start();`, add:

```js
  fileWatcher = new FileWatcher();
  activityService = new FileActivityService();

  fileWatcher.on('event', (sid, ev) => {
    if (ev.type === 'add') activityService.markCreated(sid, ev.path);
    if (ev.type === 'unlink') activityService.markDeleted(sid, ev.path);
    broadcast('tree:event', sid, ev);
  });
  hookServer.on('file-activity', (ev) => activityService.handle(ev));
  activityService.on('delta', (sid, delta) => broadcast('activity:delta', sid, delta));
  activityTick = setInterval(() => activityService.tick(), 500);
```

Inside the existing `ptyManager.on('spawn', ...)` handler, after `stateEngine.register(session.id);` add:

```js
    fileWatcher.create(session.id, session.cwd).catch((err) => {
      console.error('[clauditor] watcher create failed:', err);
    });
    activityService.register(session.id);
```

Inside the existing `ptyManager.on('exit', ...)` handler, after `stateEngine.markExited(id);` add:

```js
    fileWatcher.destroy(id).catch(() => {});
    activityService.unregister(id);
```

Add new IPC handlers near the other `ipcMain.handle(...)` calls:

```js
ipcMain.handle('tree:list', (_e, sid, relPath) => fileWatcher.list(sid, relPath));
ipcMain.handle('activity:snapshot', (_e, sid) => activityService.snapshot(sid));
```

Inside `app.on('before-quit', ...)` try block, after `await hookServer?.stop();` add:

```js
    if (activityTick) clearInterval(activityTick);
    if (fileWatcher) {
      const sids = [...(fileWatcher.watchers?.keys() || [])];
      await Promise.all(sids.map((sid) => fileWatcher.destroy(sid)));
    }
```

- [ ] **Step 2: Extend `src/preload/preload.js`**

Replace the `contextBridge.exposeInMainWorld('clauditor', {...})` block with:

```js
contextBridge.exposeInMainWorld('clauditor', {
  listSessions: () => ipcRenderer.invoke('sessions:list'),
  createSession: (opts) => ipcRenderer.invoke('sessions:create', opts || {}),
  killSession: (id) => ipcRenderer.invoke('sessions:kill', id),
  renameSession: (id, name) => ipcRenderer.invoke('sessions:rename', id, name),
  write: (id, data) => ipcRenderer.invoke('sessions:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.invoke('sessions:resize', id, cols, rows),
  getBuffer: (id) => ipcRenderer.invoke('sessions:buffer', id),

  listTree: (sid, relPath) => ipcRenderer.invoke('tree:list', sid, relPath),
  getActivitySnapshot: (sid) => ipcRenderer.invoke('activity:snapshot', sid),

  onCreated: (cb) => ipcRenderer.on('session:created', (_e, s) => cb(s)),
  onData: (cb) => ipcRenderer.on('session:data', (_e, id, chunk) => cb(id, chunk)),
  onState: (cb) => ipcRenderer.on('session:state', (_e, id, state) => cb(id, state)),
  onExit: (cb) => ipcRenderer.on('session:exit', (_e, id, code) => cb(id, code)),
  onRenamed: (cb) => ipcRenderer.on('session:renamed', (_e, s) => cb(s)),
  onFocus: (cb) => ipcRenderer.on('session:focus', (_e, id) => cb(id)),
  onNewSessionRequest: (cb) => ipcRenderer.on('ui:new-session', () => cb()),
  onTreeEvent: (cb) => ipcRenderer.on('tree:event', (_e, sid, ev) => cb(sid, ev)),
  onActivityDelta: (cb) => ipcRenderer.on('activity:delta', (_e, sid, delta) => cb(sid, delta)),
});
```

- [ ] **Step 3: Smoke-test existing suite still passes**

Run: `npx playwright test --project=unit`
Expected: all unit tests (including hook-server + file-watcher + activity) pass.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.js src/preload/preload.js
git commit -m "feat(main): wire file watcher + activity service into app lifecycle"
```

---

## Task 6: Pure `tree.js` view logic — test first

View logic that takes a list of nodes + a filter query and returns the flat render list. Isolated so it can be unit-tested without the DOM.

**Files:**
- Create: `src/renderer/components/tree.js`
- Create: `tests/unit/tree.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tree.test.js`:

```js
const { test, expect } = require('@playwright/test');
const { fuzzyMatch, flattenTree } = require('../../src/renderer/components/tree.js');

test('fuzzyMatch: exact substring matches', () => {
  expect(fuzzyMatch('routes', 'src/routes.js')).toBe(true);
  expect(fuzzyMatch('rts', 'src/routes.js')).toBe(true); // in-order letters
  expect(fuzzyMatch('xyz', 'src/routes.js')).toBe(false);
});

test('fuzzyMatch: empty query matches everything', () => {
  expect(fuzzyMatch('', 'anything.js')).toBe(true);
});

test('fuzzyMatch: case-insensitive', () => {
  expect(fuzzyMatch('ROUTES', 'src/routes.js')).toBe(true);
});

test('flattenTree: expanded dir children follow parent', () => {
  const nodes = {
    '.': [{ name: 'src', dir: true }, { name: 'pkg.json', dir: false }],
    'src': [{ name: 'app.js', dir: false }],
  };
  const list = flattenTree({ children: nodes, expanded: new Set(['src']), query: '' });
  expect(list.map((n) => n.path)).toEqual(['src', 'src/app.js', 'pkg.json']);
});

test('flattenTree: collapsed dir hides children', () => {
  const nodes = {
    '.': [{ name: 'src', dir: true }],
    'src': [{ name: 'app.js', dir: false }],
  };
  const list = flattenTree({ children: nodes, expanded: new Set(), query: '' });
  expect(list.map((n) => n.path)).toEqual(['src']);
});

test('flattenTree: query auto-expands ancestors of matching files', () => {
  const nodes = {
    '.': [{ name: 'src', dir: true }, { name: 'README.md', dir: false }],
    'src': [{ name: 'app.js', dir: false }, { name: 'util.js', dir: false }],
  };
  const list = flattenTree({ children: nodes, expanded: new Set(), query: 'util' });
  expect(list.map((n) => n.path)).toEqual(['src', 'src/util.js']);
});
```

- [ ] **Step 2: Run test and watch it fail**

Run: `npx playwright test --project=unit tests/unit/tree.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `tree.js`**

Create `src/renderer/components/tree.js`:

```js
function fuzzyMatch(query, text) {
  if (!query) return true;
  const q = query.toLowerCase();
  const s = text.toLowerCase();
  let i = 0;
  for (const ch of s) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
}

function flattenTree({ children, expanded, query }) {
  const out = [];
  const visit = (parentPath, depth) => {
    const kids = children[parentPath] || [];
    for (const kid of kids) {
      const path = parentPath === '.' ? kid.name : `${parentPath}/${kid.name}`;
      if (kid.dir) {
        const isExpanded = expanded.has(path) || hasMatchingDescendant(path, children, query);
        if (isExpanded || !query || fuzzyMatch(query, path)) out.push({ ...kid, path, depth });
        if (isExpanded) visit(path, depth + 1);
      } else {
        if (!query || fuzzyMatch(query, path)) out.push({ ...kid, path, depth });
      }
    }
  };
  visit('.', 0);
  return out;
}

function hasMatchingDescendant(dirPath, children, query) {
  if (!query) return false;
  const stack = [dirPath];
  while (stack.length) {
    const cur = stack.pop();
    const kids = children[cur] || [];
    for (const k of kids) {
      const p = `${cur}/${k.name}`;
      if (fuzzyMatch(query, p)) return true;
      if (k.dir) stack.push(p);
    }
  }
  return false;
}

module.exports = { fuzzyMatch, flattenTree };
if (typeof window !== 'undefined') window.__clauditorTree = { fuzzyMatch, flattenTree };
```

- [ ] **Step 4: Run tests until green**

Run: `npx playwright test --project=unit tests/unit/tree.test.js`
Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/tree.js tests/unit/tree.test.js
git commit -m "feat(renderer): pure tree view logic — fuzzy match + flatten"
```

---

## Task 7: Restructure `index.html`

Rebuild the markup around rail / tabbar / sidebar (search + tree + activity) / main (topbar + terminal + statusbar). The renderer-side wiring comes in Task 9.

**Files:**
- Modify: `src/renderer/index.html`

- [ ] **Step 1: Replace `<body>` contents**

Open `src/renderer/index.html` and replace everything from `<body>` to `</body>` with:

```html
  <body>
    <div id="app">
      <header id="rail">
        <div class="rail-brand">
          <span class="brand-mark">◆</span>
          <span class="brand-name">Clauditor</span>
          <span class="brand-sep">/</span>
          <span class="brand-tag">session manager</span>
        </div>
        <div class="rail-meta">
          <span class="meta-label">active</span>
          <span id="aggregate" class="meta-value">No sessions</span>
        </div>
      </header>

      <nav id="tabbar">
        <div id="tab-list" role="tablist"></div>
        <button id="new-session" title="New session (Ctrl+T)">+ new</button>
      </nav>

      <aside id="sidebar">
        <div id="sidebar-search">
          <span class="search-icon">⌕</span>
          <input id="tree-filter" type="text" placeholder="filter files…" spellcheck="false" />
        </div>
        <div id="sidebar-tree">
          <div class="panel-heading">
            <span class="panel-eyebrow">&sect; 01</span>
            <h2 class="panel-title">Files</h2>
          </div>
          <ul id="file-tree"></ul>
          <div class="sidebar-empty" id="tree-empty">No session selected.</div>
        </div>
        <div id="sidebar-activity" class="collapsed">
          <button id="activity-toggle" aria-expanded="false">
            <span>Activity</span><span class="activity-arrow">▸</span>
          </button>
          <ul id="activity-log"></ul>
        </div>
      </aside>

      <main id="main">
        <header id="topbar">
          <div class="topbar-left">
            <span class="topbar-eyebrow">working directory</span>
            <div id="cwd-label" class="topbar-cwd">No session selected</div>
          </div>
          <div class="topbar-right">
            <span id="state-pill" class="pill">idle</span>
            <button id="kill-btn" disabled>Kill</button>
          </div>
        </header>
        <div id="terminal-container"></div>
        <footer id="statusbar">
          <span class="status-dot-idle"></span>
          <span class="status-label">standby</span>
          <span class="status-sep">·</span>
          <span class="status-hint">Ctrl+1..9 switch tabs · Ctrl+T new · Ctrl+W close</span>
        </footer>
      </main>
    </div>
    <script src="../../node_modules/xterm/lib/xterm.js"></script>
    <script src="../../node_modules/xterm-addon-fit/lib/xterm-addon-fit.js"></script>
    <script src="../../node_modules/xterm-addon-web-links/lib/xterm-addon-web-links.js"></script>
    <script src="../../node_modules/xterm-addon-webgl/lib/xterm-addon-webgl.js"></script>
    <script src="components/tree.js"></script>
    <script src="components/tabbar.js"></script>
    <script src="components/sidebar.js"></script>
    <script src="renderer.js"></script>
  </body>
```

- [ ] **Step 2: Launch the app to confirm DOM shape**

Run: `npm start`

Expected: app launches, shows rail + empty tabbar + sidebar with "No session selected." The terminal area is empty (renderer.js still references old `#session-list` — that's fixed in Task 9). Close the app.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/index.html
git commit -m "feat(renderer): restructure markup for tabs + file-tree sidebar"
```

---

## Task 8: `tabbar.js` component

Self-contained module that owns the tab list, active-state styling, close buttons, overflow scroll, and keyboard shortcuts.

**Files:**
- Create: `src/renderer/components/tabbar.js`

- [ ] **Step 1: Implement the component**

Create `src/renderer/components/tabbar.js`:

```js
/* global window, document */
(function () {
  const listEl = document.getElementById('tab-list');

  const state = {
    sessions: new Map(),     // id -> { id, name, state }
    activeId: null,
    onSelect: () => {},
    onClose: () => {},
    onRename: () => {},
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
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/tabbar.js
git commit -m "feat(renderer): tab bar component (tabs, keyboard, overflow scroll)"
```

---

## Task 9: `sidebar.js` component (search + tree + activity panel)

Owns the sidebar DOM. Each session gets its own tree state (children map + expanded set) plus its own activity snapshot. Switching active session swaps which state is rendered.

**Files:**
- Create: `src/renderer/components/sidebar.js`

- [ ] **Step 1: Implement the component**

Create `src/renderer/components/sidebar.js`:

```js
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
    else if (d.type === 'modified') { st.modified.add(d.path); st.log.unshift({ ts: Date.now(), kind: 'edit', path: d.path }); }
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
    // Best-effort: compute the relative parent. `absPath` is absolute;
    // the tree root isn't stored here, so derive it from any known child:
    // we look for a known key in st.children whose absolute equivalent is a prefix.
    // Simpler: the main process already normalizes events to absolute paths;
    // we don't know the root here, so always reload root on any event for now.
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
```

**Note:** `dirOf` intentionally returns `.` for now. The tree watcher events are rare enough that reloading the root on any event is fine for v1. A real parent-dir calc needs the watcher root, which we can add later if it becomes a perf concern.

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/sidebar.js
git commit -m "feat(renderer): sidebar component (search + tree + activity panel)"
```

---

## Task 10: Rewire `renderer.js` to use the new components

Remove the sidebar-session-list logic, delegate to `tabbar` + `sidebar` modules.

**Files:**
- Modify: `src/renderer/renderer.js`

- [ ] **Step 1: Replace the file**

Overwrite `src/renderer/renderer.js` with:

```js
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
```

- [ ] **Step 2: Run the existing e2e suite**

Run: `npx playwright test --project=e2e`
Expected: `launch.test.js` and `session-lifecycle.test.js` still pass (they probe `#terminal-container` and `window.clauditor`, which are intact). The old `tray.test.js` is unchanged.

If anything fails, fix it before moving on — do not skip.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/renderer.js
git commit -m "feat(renderer): rewire orchestration to tabbar + sidebar components"
```

---

## Task 11: CSS for rail + tabbar + sidebar + overlays

**Files:**
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Update the stylesheet**

The existing `styles.css` uses a CSS grid for `#app`. Read it first to see the current grid template, then:

1. Change the `#app` grid to match the new layout:

```css
#app {
  display: grid;
  grid-template-columns: 260px 1fr;
  grid-template-rows: auto auto 1fr;
  grid-template-areas:
    "rail rail"
    "tabbar tabbar"
    "sidebar main";
  height: 100vh;
  background: #0b0c10;
  color: #ece4d2;
}

#rail { grid-area: rail; }
#tabbar { grid-area: tabbar; }
#sidebar { grid-area: sidebar; }
#main { grid-area: main; }
```

2. Remove the old `#sidebar-header`, `#session-list`, `.session-item`, `.session-rename`, `.sidebar-footer` rule blocks. They're dead code.

3. Add new blocks (append to end of file):

```css
/* ─── Tab bar ─────────────────────────────────────────── */
#tabbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #0f1014;
  border-bottom: 1px solid #2a2d34;
  overflow: hidden;
}
#tab-list {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: thin;
  flex: 1;
  mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 24px), transparent 100%);
}
#tab-list::-webkit-scrollbar { height: 4px; }
.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 8px;
  background: #141519;
  border: 1px solid #2a2d34;
  border-radius: 3px;
  color: #ece4d2;
  font: 500 12px/1 "IBM Plex Sans", system-ui, sans-serif;
  white-space: nowrap;
  cursor: pointer;
}
.tab:hover { background: #1a1d24; }
.tab.active {
  background: #1a1d24;
  border-color: #ff5a36;
  box-shadow: inset 0 -2px 0 0 #ff5a36;
}
.tab-close {
  opacity: 0;
  padding: 0 4px;
  color: #66625a;
  transition: opacity 120ms;
}
.tab:hover .tab-close, .tab.active .tab-close { opacity: 1; }
.tab-close:hover { color: #ff5a36; }
.tab-rename {
  background: #0b0c10;
  color: #ece4d2;
  border: 1px solid #ff5a36;
  border-radius: 2px;
  padding: 1px 4px;
  font: inherit;
  width: 120px;
}
#new-session {
  flex-shrink: 0;
  background: transparent;
  color: #66625a;
  border: 1px dashed #2a2d34;
  border-radius: 3px;
  padding: 3px 10px;
  font: 500 12px "IBM Plex Sans", system-ui, sans-serif;
  cursor: pointer;
}
#new-session:hover { color: #ff5a36; border-color: #ff5a36; }

/* ─── Sidebar search / tree / activity ───────────────── */
#sidebar {
  display: flex;
  flex-direction: column;
  background: #0f1014;
  border-right: 1px solid #2a2d34;
  min-height: 0;
}
#sidebar-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid #2a2d34;
}
#sidebar-search .search-icon { color: #66625a; }
#tree-filter {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #ece4d2;
  font: 400 12px "IBM Plex Sans", system-ui, sans-serif;
}
#tree-filter::placeholder { color: #66625a; }

#sidebar-tree {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  min-height: 0;
}
#sidebar-tree .panel-heading {
  padding: 2px 12px 8px;
  display: flex;
  align-items: baseline;
  gap: 6px;
}
#file-tree {
  list-style: none;
  margin: 0;
  padding: 0;
  font: 400 12px/1.6 "JetBrains Mono", "Consolas", monospace;
}
.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 8px;
  cursor: pointer;
  color: #ece4d2;
  user-select: none;
}
.tree-node:hover { background: #141519; }
.tree-glyph { width: 12px; color: #66625a; flex-shrink: 0; }
.tree-node.modified .tree-glyph { color: #ff5a36; }
.tree-node.created .tree-glyph { color: #a3c966; }
.tree-node.touching { background: rgba(255, 90, 54, 0.08); }
.tree-node.touching .tree-name { font-weight: 600; color: #ff7858; }
.tree-node.flash { animation: flashBg 900ms ease-out; }
@keyframes flashBg {
  0%   { background: rgba(255, 90, 54, 0.35); }
  100% { background: transparent; }
}
.sidebar-empty {
  padding: 14px;
  color: #66625a;
  font-style: italic;
  font-size: 12px;
}

#sidebar-activity {
  border-top: 1px solid #2a2d34;
  flex-shrink: 0;
}
#activity-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
  border: none;
  color: #66625a;
  padding: 6px 12px;
  font: 500 10px "IBM Plex Sans", system-ui, sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
}
#activity-toggle:hover { color: #ece4d2; }
#activity-log {
  list-style: none;
  margin: 0;
  padding: 0 0 8px;
  max-height: 180px;
  overflow-y: auto;
  font: 400 11px/1.5 "JetBrains Mono", "Consolas", monospace;
}
#sidebar-activity.collapsed #activity-log { display: none; }
#activity-log li {
  display: grid;
  grid-template-columns: 60px 44px 1fr;
  gap: 6px;
  padding: 1px 12px;
  color: #a39c8c;
}
.act-kind { text-transform: uppercase; font-size: 9px; }
.act-edit   { color: #e8b04d; }
.act-write  { color: #a3c966; }
.act-read   { color: #8fb3c5; }
.act-delete { color: #ff5a36; }
.act-path { color: #ece4d2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

- [ ] **Step 2: Launch and eyeball**

Run: `npm start`

Expected: tabs along the top, sidebar shows search + tree + activity, terminal fills the right side. Create two sessions, click between tabs, verify the sidebar tree swaps. Close the app.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/styles.css
git commit -m "feat(renderer): styles for tabs, file tree, activity overlays"
```

---

## Task 12: E2E test — tabs + tree + activity overlay

Exercise the end-to-end wiring through Playwright.

**Files:**
- Create: `tests/e2e/tabs-and-tree.test.js`

- [ ] **Step 1: Write the test**

Create `tests/e2e/tabs-and-tree.test.js`:

```js
const { test, expect } = require('@playwright/test');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { launchApp } = require('../helpers/launch-app');

test('two sessions render two tabs, Ctrl+2 switches active', async () => {
  const { electronApp, window } = await launchApp();
  try {
    const cwd1 = fs.mkdtempSync(path.join(os.tmpdir(), 'clauditor-t1-'));
    const cwd2 = fs.mkdtempSync(path.join(os.tmpdir(), 'clauditor-t2-'));

    await window.evaluate((c) => window.clauditor.createSession({ cwd: c, name: 'one', cols: 80, rows: 24 }), cwd1);
    await window.evaluate((c) => window.clauditor.createSession({ cwd: c, name: 'two', cols: 80, rows: 24 }), cwd2);

    await window.waitForFunction(() => window.__clauditorTest?.getTabIds().length === 2, null, { timeout: 5000 });

    await expect(window.locator('#tab-list .tab')).toHaveCount(2);

    await window.keyboard.press('Control+2');
    await window.waitForFunction(() => {
      const ids = window.__clauditorTest.getTabIds();
      return window.__clauditorTest.getActiveId() === ids[1];
    });

    await window.evaluate(() => {
      for (const id of window.__clauditorTest.getSessions().map((s) => s.id)) {
        window.clauditor.write(id, '__exit__\r\n');
      }
    });
  } finally {
    await electronApp.close();
  }
});

test('file created in cwd appears in tree with created overlay', async () => {
  const { electronApp, window } = await launchApp();
  try {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'clauditor-t3-'));
    const session = await window.evaluate((c) => window.clauditor.createSession({
      cwd: c, name: 'tree', cols: 80, rows: 24,
    }), cwd);

    await window.waitForFunction(
      (id) => window.__clauditorTest?.getActiveId() === id,
      session.id, { timeout: 5000 }
    );

    fs.writeFileSync(path.join(cwd, 'hello.js'), '// hi');

    await window.waitForFunction(
      () => window.__clauditorTest.getTreePaths().some((n) => n.path === 'hello.js'),
      null, { timeout: 5000 }
    );

    const nodes = await window.evaluate(() => window.__clauditorTest.getTreePaths());
    const hello = nodes.find((n) => n.path === 'hello.js');
    expect(hello.classes).toContain('created');

    await window.evaluate((id) => window.clauditor.write(id, '__exit__\r\n'), session.id);
  } finally {
    await electronApp.close();
  }
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test --project=e2e tests/e2e/tabs-and-tree.test.js`
Expected: both tests PASS.

If `created` doesn't arrive within the timeout, check that `fileWatcher.create` is called for the spawned session and that `broadcast('tree:event', ...)` + `activityService.markCreated` are wired (Task 5). Do not loosen the test — fix the wiring.

- [ ] **Step 3: Run the full suite**

Run: `npx playwright test`
Expected: all three projects pass (unit + pty + e2e).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/tabs-and-tree.test.js
git commit -m "test(e2e): tabs switch + tree reflects new files with overlay"
```

---

## Self-Review Notes

Coverage:

- Layout (rail + tabbar + sidebar + main) — Task 7 (HTML), Task 11 (CSS).
- Tab behavior (rename, close, state dot, overflow, keyboard) — Task 8, Task 10, Task 11.
- Search — Task 9, Task 11, Task 6 (fuzzy match logic).
- Tree (root = cwd, ignore list, lazy-expand, overlays) — Tasks 2, 6, 9, 11.
- Activity panel — Tasks 4, 9, 11.
- FS watcher wiring — Tasks 2, 5.
- Hook payload parsing — Task 3.
- FileActivityService state machine — Task 4.
- IPC surface — Task 5.
- Testing strategy — Tasks 2, 3, 4, 6, 12.
- Error handling for watcher failures — Task 5 (console.error; tree stays responsive because fileWatcher.list tolerates errors).
- Reveal-in-OS on double-click — the `api.revealPath` call in sidebar.js is defensive (`if (api.revealPath)`); if a future task adds it via `shell.showItemInFolder` in main + preload, it will wire in without renderer changes. Out of scope for v1 per the spec's "File interactions" section; if you want it in v1, add it as Task 11a before shipping.

No placeholders in code steps. All file paths are exact. All test commands match the repo's playwright project setup.

**Explicit carve-outs from spec (v1.1 follow-ups, not blockers for this plan):**

- Right-click context menus on tabs (Rename / Reveal cwd / Kill-Restart / Close) — tab has hover-`×` close and double-click rename; right-click menu is deferred.
- Right-click context menus on tree nodes (Reveal / Copy path / Copy relative path) — `api.revealPath` hook in `sidebar.js` is already defensive, so wiring `shell.showItemInFolder` in main + adding `revealPath` to preload is a small follow-up.
- `.gitignore` parsing is top-level-only (no nested ignore files, no wildcard support, no negations) — matches spec "best-effort" note.
