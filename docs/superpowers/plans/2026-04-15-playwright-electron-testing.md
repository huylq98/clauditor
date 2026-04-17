# Playwright + Electron Testing Harness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a layered automated test suite (unit / E2E / PTY) for Clauditor that runs headlessly via `npm test` and emits machine-readable results.

**Architecture:** Single runner — `@playwright/test` — drives all three layers. E2E tests launch the real Electron app via Playwright's `_electron` API. PTY tests exercise `PTYManager` directly against a deterministic fake CLI binary. Unit tests import `state-engine.js` and `hook-server.js` as plain Node modules. A minimal env-var override lets the PTY swap the real `claude` binary for the fake. A test-only `window.__clauditorTest` hook (gated by `CLAUDITOR_TEST=1`) lets E2E tests read xterm buffer contents.

**Tech Stack:** `@playwright/test`, `playwright._electron`, Node ≥ 18, existing Electron 33 + xterm 5 stack. No new runtime dependencies.

**Note on commits:** The repo is not currently a git repo. Commit steps in this plan are *optional*. Run `git init` first if you want them to work; otherwise skip the commit steps and proceed.

---

## File Map

**Create:**
- `playwright.config.js` — single config covering all three projects
- `tests/fixtures/fake-claude.js` — deterministic stand-in for the `claude` CLI
- `tests/fixtures/fake-claude.cmd` — Windows wrapper that invokes `node fake-claude.js`
- `tests/helpers/launch-app.js` — wraps `_electron.launch()` with test env wiring
- `tests/helpers/xterm-read.js` — `page.evaluate` helpers to read xterm buffer
- `tests/unit/state-engine.test.js` — unit tests for `StateEngine`
- `tests/unit/hook-server.test.js` — unit tests for `HookServer`
- `tests/pty/spawn-and-write.test.js` — PTY integration via fake CLI
- `tests/pty/buffer-and-resize.test.js` — buffer cap + resize semantics
- `tests/e2e/launch.test.js` — app boots + window renders
- `tests/e2e/session-lifecycle.test.js` — spawn / write / read / kill via UI
- `tests/e2e/tray.test.js` — tray menu structure (no click)
- `.gitignore` (if missing) entry for `test-results/`

**Modify:**
- `package.json` — add `@playwright/test` devDep + scripts
- `src/main/pty-manager.js` — honor `CLAUDITOR_CLI_OVERRIDE` env var
- `src/main/index.js` — when `CLAUDITOR_TEST=1`, set `show: false` on `BrowserWindow` and skip `maximize()`
- `src/preload/preload.js` — when `CLAUDITOR_TEST=1`, expose `__clauditorTest` IPC bridge
- `src/renderer/renderer.js` — install `window.__clauditorTest` accessors when bridge is present

---

## Task 1: Add Playwright dependency and npm scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Edit `package.json` to add devDependency and scripts**

In the `devDependencies` block, add:
```json
"@playwright/test": "^1.49.0"
```

In the `scripts` block, replace the existing scripts with:
```json
"start": "electron .",
"dist": "electron-builder",
"test": "playwright test",
"test:unit": "playwright test --project=unit",
"test:pty": "playwright test --project=pty",
"test:e2e": "playwright test --project=e2e"
```

- [ ] **Step 2: Install dependencies, skipping browser downloads**

Run (from repo root):
```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
```

On Windows cmd: `set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 && npm install`. On PowerShell: `$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1; npm install`.

Expected: `node_modules/@playwright/test/` exists. No Chromium download.

- [ ] **Step 3: Verify Playwright runner is reachable**

Run: `npx playwright --version`
Expected: prints a version like `Version 1.49.x`.

- [ ] **Step 4: (Optional) Commit**

```bash
git add package.json package-lock.json && git commit -m "test: add @playwright/test devDep and scripts"
```

---

## Task 2: Write failing top-level Playwright config

**Files:**
- Create: `playwright.config.js`

- [ ] **Step 1: Create `playwright.config.js`**

```js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  projects: [
    { name: 'unit', testMatch: /unit\/.*\.test\.js/ },
    { name: 'pty',  testMatch: /pty\/.*\.test\.js/ },
    { name: 'e2e',  testMatch: /e2e\/.*\.test\.js/ },
  ],
});
```

- [ ] **Step 2: Run the runner against an empty test tree**

Run: `npx playwright test --list`
Expected: prints `Listing tests: ... Total: 0 tests` (no errors). If it errors about missing test dir, create an empty `tests/` directory and rerun.

- [ ] **Step 3: (Optional) Commit**

```bash
git add playwright.config.js && git commit -m "test: add playwright config with three projects"
```

---

## Task 3: Build the fake CLI fixture

**Files:**
- Create: `tests/fixtures/fake-claude.js`
- Create: `tests/fixtures/fake-claude.cmd`

- [ ] **Step 1: Create `tests/fixtures/fake-claude.js`**

```js
#!/usr/bin/env node
// Deterministic stand-in for the `claude` CLI used by tests.
// - Prints a banner on start.
// - Echoes each line of stdin back, prefixed with "ECHO: ".
// - Recognizes control tokens:
//     __exit__   -> exit 0
//     __crash__  -> exit 7
//     __big__    -> emit 256 KB of 'x' followed by a newline
process.stdout.write('FAKE-CLAUDE READY\r\n');

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).replace(/\r$/, '');
    buf = buf.slice(nl + 1);
    if (line === '__exit__') process.exit(0);
    if (line === '__crash__') process.exit(7);
    if (line === '__big__') {
      process.stdout.write('x'.repeat(256 * 1024) + '\r\n');
      continue;
    }
    process.stdout.write(`ECHO: ${line}\r\n`);
  }
});

process.stdin.on('end', () => process.exit(0));
```

- [ ] **Step 2: Create `tests/fixtures/fake-claude.cmd` (Windows wrapper)**

```
@echo off
node "%~dp0fake-claude.js" %*
```

This exists because `@lydell/node-pty` on Windows expects an executable path; invoking `.js` directly via shebang doesn't work on Windows. Tests on POSIX use `fake-claude.js` directly; tests on Windows use `fake-claude.cmd`.

- [ ] **Step 3: Smoke-test the fake CLI manually**

Run (POSIX): `node tests/fixtures/fake-claude.js <<< "hello"`
Run (Windows): `echo hello | node tests\fixtures\fake-claude.js`
Expected output:
```
FAKE-CLAUDE READY
ECHO: hello
```

- [ ] **Step 4: (Optional) Commit**

```bash
git add tests/fixtures && git commit -m "test: add deterministic fake-claude fixture"
```

---

## Task 4: Wire `pty-manager.js` to honor `CLAUDITOR_CLI_OVERRIDE`

**Files:**
- Modify: `src/main/pty-manager.js:11-31` (`resolveClaude`)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/pty-override.test.js`:
```js
const { test, expect } = require('@playwright/test');

test('resolveClaude returns CLAUDITOR_CLI_OVERRIDE when set', () => {
  const original = process.env.CLAUDITOR_CLI_OVERRIDE;
  process.env.CLAUDITOR_CLI_OVERRIDE = '/tmp/fake-path-xyz';
  // Force a fresh require so the module-level cache doesn't poison the test
  delete require.cache[require.resolve('../../src/main/pty-manager.js')];
  const mod = require('../../src/main/pty-manager.js');
  // resolveClaude is private; expose via spawn? Easier: read via a tiny probe.
  // We assert by spawning with an unreachable cwd and catching the error,
  // which includes the resolved path in its message.
  try {
    new mod.PTYManager({ token: 't' }).spawn({ cwd: process.cwd() });
  } catch (err) {
    expect(err.message).toContain('/tmp/fake-path-xyz');
    return;
  } finally {
    if (original === undefined) delete process.env.CLAUDITOR_CLI_OVERRIDE;
    else process.env.CLAUDITOR_CLI_OVERRIDE = original;
  }
  throw new Error('expected spawn to throw');
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx playwright test --project=unit tests/unit/pty-override.test.js`
Expected: FAIL — the spawn either succeeds (resolving real `claude`) or the error message does not mention the override path.

- [ ] **Step 3: Implement the override**

In `src/main/pty-manager.js`, modify `resolveClaude()` to add this as the FIRST check inside the function (before `if (cachedClaude) return cachedClaude;`):

```js
function resolveClaude() {
  if (process.env.CLAUDITOR_CLI_OVERRIDE) return process.env.CLAUDITOR_CLI_OVERRIDE;
  if (cachedClaude) return cachedClaude;
  // ... rest unchanged
```

The override is checked first (and not cached) so tests can change it between runs.

- [ ] **Step 4: Run the test again**

Run: `npx playwright test --project=unit tests/unit/pty-override.test.js`
Expected: PASS.

- [ ] **Step 5: (Optional) Commit**

```bash
git add src/main/pty-manager.js tests/unit/pty-override.test.js
git commit -m "feat(pty): honor CLAUDITOR_CLI_OVERRIDE for tests"
```

---

## Task 5: PTY integration test — spawn and echo

**Files:**
- Create: `tests/pty/spawn-and-write.test.js`

- [ ] **Step 1: Write the failing test**

**Note on CRLF:** Tests write `\r\n` (not bare `\n`) because xterm.js sends `\r` for Enter in production, and Windows ConPTY + cmd.exe require `\r` to commit a line. The fake CLI strips trailing `\r` so both line endings parse correctly on the fake side, but only `\r\n` reliably triggers PTY line discipline on Windows.

```js
const { test, expect } = require('@playwright/test');
const path = require('path');
const os = require('os');

const FAKE = process.platform === 'win32'
  ? path.resolve(__dirname, '..', 'fixtures', 'fake-claude.cmd')
  : path.resolve(__dirname, '..', 'fixtures', 'fake-claude.js');

test.beforeEach(() => {
  process.env.CLAUDITOR_CLI_OVERRIDE = FAKE;
  delete require.cache[require.resolve('../../src/main/pty-manager.js')];
});
test.afterEach(() => { delete process.env.CLAUDITOR_CLI_OVERRIDE; });

test('spawned PTY emits banner and echoes writes', async () => {
  const { PTYManager } = require('../../src/main/pty-manager.js');
  const mgr = new PTYManager({ token: 't' });
  const chunks = [];
  mgr.on('data', (_id, chunk) => chunks.push(chunk));
  const session = mgr.spawn({ cwd: os.tmpdir(), cols: 80, rows: 24 });

  await waitFor(() => chunks.join('').includes('FAKE-CLAUDE READY'), 3000);
  mgr.write(session.id, 'hello world\r\n');
  await waitFor(() => chunks.join('').includes('ECHO: hello world'), 3000);

  mgr.write(session.id, '__exit__\r\n');
  await waitFor(() => mgr.list().length === 0, 3000);
});

async function waitFor(pred, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (pred()) return;
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error('waitFor timeout');
}
```

- [ ] **Step 2: Run the test and confirm it passes**

Run: `npx playwright test --project=pty tests/pty/spawn-and-write.test.js`
Expected: PASS. (If FAIL, confirm fake CLI runs manually first per Task 3 Step 3.)

- [ ] **Step 3: (Optional) Commit**

```bash
git add tests/pty/spawn-and-write.test.js
git commit -m "test(pty): cover spawn, banner, write/echo, clean exit"
```

---

## Task 6: PTY integration test — buffer cap and resize

**Files:**
- Create: `tests/pty/buffer-and-resize.test.js`

- [ ] **Step 1: Write the failing test**

**Note on CRLF:** Tests write `\r\n` (not bare `\n`) because xterm.js sends `\r` for Enter in production, and Windows ConPTY + cmd.exe require `\r` to commit a line. The fake CLI strips trailing `\r` so both line endings parse correctly on the fake side, but only `\r\n` reliably triggers PTY line discipline on Windows.

```js
const { test, expect } = require('@playwright/test');
const path = require('path');
const os = require('os');

const FAKE = process.platform === 'win32'
  ? path.resolve(__dirname, '..', 'fixtures', 'fake-claude.cmd')
  : path.resolve(__dirname, '..', 'fixtures', 'fake-claude.js');

test.beforeEach(() => {
  process.env.CLAUDITOR_CLI_OVERRIDE = FAKE;
  delete require.cache[require.resolve('../../src/main/pty-manager.js')];
});
test.afterEach(() => { delete process.env.CLAUDITOR_CLI_OVERRIDE; });

test('buffer is capped at MAX_BUFFER (1 MiB)', async () => {
  const { PTYManager } = require('../../src/main/pty-manager.js');
  const mgr = new PTYManager({ token: 't' });
  const session = mgr.spawn({ cwd: os.tmpdir(), cols: 80, rows: 24 });
  // Trigger 5 large writes (256 KB each) → 1.25 MiB total
  await sleep(200);
  for (let i = 0; i < 5; i++) mgr.write(session.id, '__big__\r\n');
  await sleep(500);
  expect(mgr.getBuffer(session.id).length).toBeLessThanOrEqual(1024 * 1024);
  mgr.kill(session.id);
});

test('resize does not throw on live session', async () => {
  const { PTYManager } = require('../../src/main/pty-manager.js');
  const mgr = new PTYManager({ token: 't' });
  const session = mgr.spawn({ cwd: os.tmpdir(), cols: 80, rows: 24 });
  await sleep(100);
  expect(() => mgr.resize(session.id, 120, 40)).not.toThrow();
  mgr.kill(session.id);
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test --project=pty tests/pty/buffer-and-resize.test.js`
Expected: PASS.

- [ ] **Step 3: (Optional) Commit**

```bash
git add tests/pty/buffer-and-resize.test.js
git commit -m "test(pty): cover buffer cap and resize"
```

---

## Task 7: Unit test — `StateEngine` register / hook transitions

**Files:**
- Create: `tests/unit/state-engine.test.js`

- [ ] **Step 1: Write the failing test**

```js
const { test, expect } = require('@playwright/test');
const { StateEngine } = require('../../src/main/state-engine.js');

test('register sets state to running', () => {
  const e = new StateEngine();
  e.register('s1');
  expect(e.get('s1')).toBe('running');
});

test('notification hook moves to awaiting_permission', () => {
  const e = new StateEngine();
  e.register('s1');
  e.handleHook('s1', 'notification');
  expect(e.get('s1')).toBe('awaiting_permission');
});

test('post-tool-use hook returns state to running', () => {
  const e = new StateEngine();
  e.register('s1');
  e.handleHook('s1', 'notification');
  e.handleHook('s1', 'post-tool-use');
  expect(e.get('s1')).toBe('running');
});

test('markExited emits change and sets exited', () => {
  const e = new StateEngine();
  e.register('s1');
  const events = [];
  e.on('change', (id, next, prev) => events.push({ id, next, prev }));
  e.markExited('s1');
  expect(e.get('s1')).toBe('exited');
  expect(events).toContainEqual({ id: 's1', next: 'exited', prev: 'running' });
});

test('handleHook on unknown id is a no-op', () => {
  const e = new StateEngine();
  expect(() => e.handleHook('ghost', 'stop')).not.toThrow();
  expect(e.get('ghost')).toBeUndefined();
});

test('stop hook leads to awaiting_user after grace period', async () => {
  const e = new StateEngine();
  e.register('s1');
  e.handleHook('s1', 'stop');
  expect(e.get('s1')).toBe('running'); // immediately
  await new Promise(r => setTimeout(r, 1700)); // > STOP_GRACE_MS (1500)
  expect(e.get('s1')).toBe('awaiting_user');
});
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test --project=unit tests/unit/state-engine.test.js`
Expected: PASS (all 6 tests). This is characterization — the implementation already exists.

- [ ] **Step 3: (Optional) Commit**

```bash
git add tests/unit/state-engine.test.js
git commit -m "test(unit): cover StateEngine transitions"
```

---

## Task 8: Unit test — `HookServer` token check and routing

**Files:**
- Create: `tests/unit/hook-server.test.js`

- [ ] **Step 1: Write the failing test**

```js
const { test, expect } = require('@playwright/test');
const http = require('http');
const { HookServer, PORT } = require('../../src/main/hook-server.js');
const { StateEngine } = require('../../src/main/state-engine.js');

let server, engine;

test.beforeEach(async () => {
  engine = new StateEngine();
  server = new HookServer({ token: 'secret', stateEngine: engine });
  await server.start();
});
test.afterEach(async () => { await server.stop(); });

function post(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: PORT, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

test('rejects request without token', async () => {
  const res = await post('/hook/stop', {});
  expect(res.status).toBe(403);
});

test('accepts request with correct token and routes to engine', async () => {
  engine.register('s1');
  const res = await post('/hook/notification', { clauditor_session_id: 's1' },
    { 'X-Clauditor-Token': 'secret' });
  expect(res.status).toBe(200);
  expect(engine.get('s1')).toBe('awaiting_permission');
});

test('health endpoint also requires token', async () => {
  const res = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: '/health' }, (r) => {
      let d = ''; r.on('data', (c) => d += c); r.on('end', () => resolve({ status: r.statusCode }));
    }).on('error', reject);
  });
  expect(res.status).toBe(403);
});
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test --project=unit tests/unit/hook-server.test.js`
Expected: PASS (all 3 tests).

- [ ] **Step 3: (Optional) Commit**

```bash
git add tests/unit/hook-server.test.js
git commit -m "test(unit): cover HookServer auth and routing"
```

---

## Task 9: Add test-mode flags to main process and preload

**Files:**
- Modify: `src/main/index.js:29-52` (`createWindow`)
- Modify: `src/preload/preload.js`
- Modify: `src/renderer/renderer.js`

- [ ] **Step 1: Modify `createWindow()` in `src/main/index.js`**

Replace the body of `createWindow()` with:
```js
function createWindow() {
  const isTest = process.env.CLAUDITOR_TEST === '1';
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 900,
    minWidth: 900,
    minHeight: 500,
    title: 'Clauditor',
    backgroundColor: '#1e1e2e',
    show: !isTest,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  if (!isTest) mainWindow.once('ready-to-show', () => mainWindow.maximize());
  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}
```

Effect: when `CLAUDITOR_TEST=1`, the window is created hidden and not maximized. Production behavior unchanged.

- [ ] **Step 2: Modify `src/preload/preload.js` to expose a test bridge**

Append at the end of the file (before the closing `});` of `exposeInMainWorld`, add a comma and):

Replace the existing file with:
```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clauditor', {
  listSessions: () => ipcRenderer.invoke('sessions:list'),
  createSession: (opts) => ipcRenderer.invoke('sessions:create', opts || {}),
  killSession: (id) => ipcRenderer.invoke('sessions:kill', id),
  renameSession: (id, name) => ipcRenderer.invoke('sessions:rename', id, name),
  write: (id, data) => ipcRenderer.invoke('sessions:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.invoke('sessions:resize', id, cols, rows),
  getBuffer: (id) => ipcRenderer.invoke('sessions:buffer', id),

  onCreated: (cb) => ipcRenderer.on('session:created', (_e, s) => cb(s)),
  onData: (cb) => ipcRenderer.on('session:data', (_e, id, chunk) => cb(id, chunk)),
  onState: (cb) => ipcRenderer.on('session:state', (_e, id, state) => cb(id, state)),
  onExit: (cb) => ipcRenderer.on('session:exit', (_e, id, code) => cb(id, code)),
  onRenamed: (cb) => ipcRenderer.on('session:renamed', (_e, s) => cb(s)),
  onFocus: (cb) => ipcRenderer.on('session:focus', (_e, id) => cb(id)),
  onNewSessionRequest: (cb) => ipcRenderer.on('ui:new-session', () => cb()),
});

if (process.env.CLAUDITOR_TEST === '1') {
  contextBridge.exposeInMainWorld('__clauditorTestBridge', { enabled: true });
}
```

- [ ] **Step 3: Modify `src/renderer/renderer.js` to install test accessors**

Add at the very end of the file:
```js
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
```

The destructuring strips non-serializable objects (`term`, `fit`, `el`) so the result can cross the IPC boundary cleanly.

- [ ] **Step 4: Smoke-check that production behavior is unchanged**

Run: `npm start`
Expected: Clauditor launches normally with a visible, maximized window. `window.__clauditorTest` is `undefined` in DevTools console.

Then: kill it (Ctrl+C) before moving on.

- [ ] **Step 5: (Optional) Commit**

```bash
git add src/main/index.js src/preload/preload.js src/renderer/renderer.js
git commit -m "feat: expose CLAUDITOR_TEST hook for hidden window + xterm buffer access"
```

---

## Task 10: E2E helper — launch wrapper

**Files:**
- Create: `tests/helpers/launch-app.js`

- [ ] **Step 1: Create the helper**

```js
const path = require('path');
const { _electron: electron } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FAKE = process.platform === 'win32'
  ? path.resolve(REPO_ROOT, 'tests', 'fixtures', 'fake-claude.cmd')
  : path.resolve(REPO_ROOT, 'tests', 'fixtures', 'fake-claude.js');

async function launchApp(extraEnv = {}) {
  const electronApp = await electron.launch({
    args: [REPO_ROOT],
    env: {
      ...process.env,
      CLAUDITOR_TEST: '1',
      CLAUDITOR_CLI_OVERRIDE: FAKE,
      ...extraEnv,
    },
    timeout: 20_000,
  });
  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  return { electronApp, window };
}

module.exports = { launchApp };
```

- [ ] **Step 2: No standalone test yet — Task 11 exercises this**

---

## Task 11: E2E — launch smoke test

**Files:**
- Create: `tests/e2e/launch.test.js`

This task implements the **first row** of the spec's "Coverage parity with the prior screenshot workflow" table.

- [ ] **Step 1: Write the failing test**

```js
const { test, expect } = require('@playwright/test');
const { launchApp } = require('../helpers/launch-app');

test('app launches and renderer reaches complete state', async () => {
  const { electronApp, window } = await launchApp();
  try {
    await window.waitForLoadState('domcontentloaded');
    const ready = await window.evaluate(() => document.readyState);
    expect(ready).toBe('complete');

    // Root layout containers from index.html exist
    await expect(window.locator('#session-list')).toBeAttached();
    await expect(window.locator('#terminal-container')).toBeAttached();

    // Test bridge is installed
    const bridgePresent = await window.evaluate(() => !!window.__clauditorTest);
    expect(bridgePresent).toBe(true);
  } finally {
    await electronApp.close();
  }
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test --project=e2e tests/e2e/launch.test.js`
Expected: PASS. If FAIL because `document.readyState` is not yet `complete`, replace `.toBe('complete')` with awaiting `window.waitForFunction(() => document.readyState === 'complete')` first.

- [ ] **Step 3: (Optional) Commit**

```bash
git add tests/helpers tests/e2e/launch.test.js
git commit -m "test(e2e): app launch smoke + test bridge present"
```

---

## Task 12: E2E — session lifecycle (covers prior screenshot rows 2 and 3)

**Files:**
- Create: `tests/e2e/session-lifecycle.test.js`

This task implements the **second and third rows** of the spec's coverage parity table: a session pane mounts, and its xterm buffer contains real content.

- [ ] **Step 1: Write the failing test**

```js
const { test, expect } = require('@playwright/test');
const os = require('os');
const { launchApp } = require('../helpers/launch-app');

test('spawn session via IPC, fake banner appears in xterm buffer', async () => {
  const { electronApp, window } = await launchApp();
  try {
    // Spawn a session by invoking the renderer's API directly with a fixed cwd.
    // This bypasses the dialog (sessions:create with cwd skips showOpenDialog).
    const session = await window.evaluate(async (cwd) => {
      const s = await window.clauditor.createSession({ cwd, name: 'test', cols: 80, rows: 24 });
      return s;
    }, os.tmpdir());

    expect(session).toBeTruthy();
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/);

    // Wait for the renderer to register the session and mount its xterm element.
    await window.waitForFunction(
      (id) => !!window.__clauditorTest?.getSessions().find(s => s.id === id),
      session.id,
      { timeout: 5000 }
    );

    // Make it the active session so getActiveTermBuffer() reads its buffer.
    await window.evaluate((id) => {
      // Click the corresponding list item to activate the session.
      const item = document.querySelector(`[data-session-id="${id}"]`);
      if (item) item.click();
    }, session.id);

    // The xterm canvas/element should be mounted under #terminal-container.
    await expect(window.locator('#terminal-container .xterm-mount')).toHaveCount(1);

    // Wait for the fake CLI banner to land in the xterm buffer.
    await window.waitForFunction(
      () => (window.__clauditorTest?.getActiveTermBuffer() || '').includes('FAKE-CLAUDE READY'),
      null,
      { timeout: 5000 }
    );

    // Cleanly exit the session.
    await window.evaluate((id) => window.clauditor.write(id, '__exit__\n'), session.id);
  } finally {
    await electronApp.close();
  }
});
```

**NOTE on `data-session-id`:** the existing renderer's `renderList()` builds list items but may not set a `data-session-id` attribute. If the test fails at the `.click()` step, add the attribute in `src/renderer/renderer.js` where list items are created (search for `listEl.appendChild` or the list-rendering loop) by setting `el.dataset.sessionId = s.id` on the relevant element. This is a small one-line change required for the test to drive selection deterministically. If the renderer already activates the first session automatically, the click block can be removed entirely — verify by reading `renderList()` first.

- [ ] **Step 2: Run the test**

Run: `npx playwright test --project=e2e tests/e2e/session-lifecycle.test.js`
Expected: PASS. If the fake-banner wait times out, run with `--headed` (`PWDEBUG=1`) and inspect: most likely the renderer hasn't subscribed `term` to incoming `session:data` events for newly-created sessions, or the override env var didn't reach the spawned PTY (verify by adding `console.log(process.env.CLAUDITOR_CLI_OVERRIDE)` to `pty-manager.js` temporarily).

- [ ] **Step 3: (Optional) Commit**

```bash
git add tests/e2e/session-lifecycle.test.js src/renderer/renderer.js
git commit -m "test(e2e): cover session spawn + xterm content (replaces .shot.ps1 workflow)"
```

---

## Task 13: E2E — tray menu structure

**Files:**
- Create: `tests/e2e/tray.test.js`

The system tray cannot be clicked from Playwright (it lives in the OS shell, not the renderer). This test asserts that `TrayController` was constructed and that the underlying menu has the expected items, accessed via a small introspection hook.

- [ ] **Step 1: Add a tiny introspection hook to `src/main/index.js`**

After the `tray.start()` line in `bootstrap()`, append:
```js
if (process.env.CLAUDITOR_TEST === '1') {
  ipcMain.handle('__test:tray-items', () => tray.menuLabels?.() || []);
}
```

Then in `src/main/tray.js`, add a `menuLabels()` method that returns an array of strings — the labels of the top-level menu items it builds. (Read `tray.js` first; if the menu is built with `Menu.buildFromTemplate(template)`, `menuLabels()` should be `() => template.map(i => i.label || i.role || i.type)`.)

- [ ] **Step 2: Add the test bridge entry to preload**

In `src/preload/preload.js`, modify the test bridge block to:
```js
if (process.env.CLAUDITOR_TEST === '1') {
  contextBridge.exposeInMainWorld('__clauditorTestBridge', {
    enabled: true,
    trayItems: () => ipcRenderer.invoke('__test:tray-items'),
  });
}
```

- [ ] **Step 3: Write the test**

```js
const { test, expect } = require('@playwright/test');
const { launchApp } = require('../helpers/launch-app');

test('tray menu has Show / New Session / Quit (or equivalents)', async () => {
  const { electronApp, window } = await launchApp();
  try {
    const labels = await window.evaluate(() => window.__clauditorTestBridge.trayItems());
    expect(Array.isArray(labels)).toBe(true);
    // Loose check — the exact labels live in tray.js. Just assert non-empty + has a Quit-ish item.
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.some(l => /quit|exit/i.test(l))).toBe(true);
  } finally {
    await electronApp.close();
  }
});
```

- [ ] **Step 4: Run the test**

Run: `npx playwright test --project=e2e tests/e2e/tray.test.js`
Expected: PASS.

- [ ] **Step 5: (Optional) Commit**

```bash
git add src/main/index.js src/main/tray.js src/preload/preload.js tests/e2e/tray.test.js
git commit -m "test(e2e): assert tray menu items present"
```

---

## Task 14: Add `.gitignore` entry for test results

**Files:**
- Modify (or create): `.gitignore`

- [ ] **Step 1: Append entries**

If `.gitignore` exists, append:
```
test-results/
playwright-report/
```

If it does not exist, create it with:
```
node_modules/
dist/
test-results/
playwright-report/
```

- [ ] **Step 2: (Optional) Commit**

```bash
git add .gitignore && git commit -m "chore: ignore test-results"
```

---

## Task 15: Run the full suite end-to-end

- [ ] **Step 1: Run everything**

Run: `npm test`
Expected: All projects (`unit`, `pty`, `e2e`) pass. Stdout shows the `list` reporter; `test-results/results.json` is written.

- [ ] **Step 2: Verify the JSON report is parseable**

Run (POSIX): `node -e "console.log(JSON.parse(require('fs').readFileSync('test-results/results.json','utf8')).stats)"`
Run (Windows PowerShell): `node -e "const j = JSON.parse(require('fs').readFileSync('test-results/results.json','utf8')); console.log(j.stats)"`
Expected: prints an object with `expected`, `unexpected`, `flaky`, `skipped`, `duration` keys.

- [ ] **Step 3: Confirm no real-`claude` invocations occurred**

Inspect stdout for any output prefixed with `claude:` or related markers. If you suspect the override leaked, run:
```bash
PLAYWRIGHT_TRACE=on npx playwright test --project=pty
```
and inspect that the PTY's resolved binary points at the fake.

- [ ] **Step 4: (Optional) Final commit**

```bash
git add -A && git commit -m "test: full Playwright harness in place"
```

---

## Self-Review Notes

**Spec coverage check:**
- "Stack: @playwright/test, _electron API" → Tasks 1, 2, 10
- "Layout: tests/{unit,e2e,pty,fixtures,helpers}" → Tasks 3, 5, 6, 7, 8, 10, 11, 12, 13
- "Fake CLI" → Task 3
- "CLAUDITOR_CLI_OVERRIDE in pty-manager.js" → Task 4
- "Test hooks in renderer (`window.__clauditorTest`)" → Task 9
- "Headless behavior (show: false when CLAUDITOR_TEST=1)" → Task 9
- "Running: npm test, test:unit, test:pty, test:e2e" → Task 1
- "Reporter: list + json" → Task 2
- "Coverage parity table — launch / session pane / xterm content" → Tasks 11 (row 1) + 12 (rows 2 & 3)
- "Tray UI tests via main-process API" → Task 13

**Skipped intentionally per spec non-goals:** ANSI replay fixture (`real-claude-output.txt`), opt-in `test:smoke-real` script, CI workflow, coverage reporting. All listed as out-of-scope or follow-ups in the spec; can be added as separate plans.

**No placeholder content; all code blocks complete; method/property names consistent (`getActiveTermBuffer`, `getSessions`, `getActiveId`, `__clauditorTestBridge.enabled`, `__clauditorTestBridge.trayItems`).**
