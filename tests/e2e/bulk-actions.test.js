const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launchApp } = require('../helpers/launch-app');

test('bulk: kill all, restart all, forget all round-trip', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clauditor-bulk-'));
  const cwds = [
    fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-cwd-')),
    fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-cwd-')),
    fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-cwd-')),
  ];
  const extraEnv = {
    CLAUDITOR_USER_DATA: userDataDir,
    CLAUDITOR_HOOK_PORT: '31285',
  };

  const { electronApp, window } = await launchApp(extraEnv);
  try {
    // Create 3 sessions.
    const created = [];
    for (let i = 0; i < 3; i++) {
      const s = await window.evaluate(async (cwd) => {
        return window.clauditor.createSession({ cwd, name: 'bulk-' + cwd.slice(-6), cols: 80, rows: 24 });
      }, cwds[i]);
      created.push(s);
    }
    await window.waitForFunction(
      () => (window.__clauditorTest?.getSessions() || []).length === 3,
      null,
      { timeout: 5000 }
    );

    // Kill all. Expect three exited tabs, same ids.
    await window.evaluate(() => window.clauditor.killAllSessions());
    await window.waitForFunction(
      () => {
        const ss = window.__clauditorTest?.getSessions() || [];
        return ss.length === 3 && ss.every((s) => s.state === 'exited');
      },
      null,
      { timeout: 10000 }
    );

    // Restart all. Expect three running tabs, same ids.
    await window.evaluate(() => window.clauditor.restartAllExitedSessions({ cols: 80, rows: 24 }));
    await window.waitForFunction(
      () => {
        const ss = window.__clauditorTest?.getSessions() || [];
        return ss.length === 3 && ss.every((s) => s.state !== 'exited');
      },
      null,
      { timeout: 10000 }
    );

    // Exit all via __exit__ so Playwright can close cleanly after forget.
    for (const s of created) {
      await window.evaluate((id) => window.clauditor.write(id, '__exit__\r\n'), s.id);
    }
    await window.waitForFunction(
      () => {
        const ss = window.__clauditorTest?.getSessions() || [];
        return ss.length === 3 && ss.every((s) => s.state === 'exited');
      },
      null,
      { timeout: 10000 }
    );

    // Forget all. Expect zero tabs, empty persisted store.
    await window.evaluate(() => window.clauditor.forgetAllExitedSessions());
    await window.waitForFunction(
      () => (window.__clauditorTest?.getSessions() || []).length === 0,
      null,
      { timeout: 5000 }
    );
    const raw = fs.readFileSync(path.join(userDataDir, 'sessions.json'), 'utf8');
    expect(JSON.parse(raw).sessions).toHaveLength(0);
  } finally {
    await electronApp.close().catch(() => {});
  }
});
