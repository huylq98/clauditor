const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launchApp } = require('../helpers/launch-app');

const HOOK_PORT = '31182';

test('persists sessions across relaunch and supports restart', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clauditor-e2e-'));
  const sessionCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'clauditor-cwd-'));
  const extraEnv = {
    CLAUDITOR_USER_DATA: userDataDir,
    CLAUDITOR_HOOK_PORT: HOOK_PORT,
  };

  // First launch: create + rename a session, then clean-quit.
  let { electronApp, window } = await launchApp(extraEnv);
  try {
    const session = await window.evaluate(async (cwd) => {
      const s = await window.clauditor.createSession({ cwd, name: 'persisted-alpha', cols: 80, rows: 24 });
      return s;
    }, sessionCwd);
    expect(session).toBeTruthy();

    // Wait for the renderer to register the session.
    await window.waitForFunction(
      (id) => !!window.__clauditorTest?.getSessions().find(s => s.id === id),
      session.id,
      { timeout: 5000 }
    );

    // fake-claude is a test fixture; tell it to exit cleanly via stdin before we
    // quit Electron. Without this, node-pty's TerminateProcess leaves a zombie
    // that makes Playwright's electronApp.close() flaky on Windows (~3/5 fail).
    // This is a fixture concern; production quit path is unaffected.
    await window.evaluate((id) => window.clauditor.write(id, '__exit__\r\n'), session.id);
    await window.waitForFunction(
      (id) => {
        const s = window.__clauditorTest?.getSessions().find(x => x.id === id);
        return s && s.state === 'exited';
      },
      session.id,
      { timeout: 5000 }
    );
  } finally {
    await electronApp.close().catch(() => {});
  }

  // Confirm sessions.json exists.
  const storeFile = path.join(userDataDir, 'sessions.json');
  expect(fs.existsSync(storeFile)).toBe(true);
  const parsed = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  expect(parsed.sessions).toHaveLength(1);
  expect(parsed.sessions[0].name).toBe('persisted-alpha');

  // Second launch: stub should appear.
  ({ electronApp, window } = await launchApp(extraEnv));
  try {
    await window.waitForFunction(
      () => (window.__clauditorTest?.getSessions() || []).length > 0,
      null,
      { timeout: 5000 }
    );
    const sessions = await window.evaluate(() => window.__clauditorTest.getSessions());
    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe('persisted-alpha');
    expect(sessions[0].state).toBe('exited');
  } finally {
    await electronApp.close().catch(() => {});
  }
});
