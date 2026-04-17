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

    // The renderer's onCreated handler auto-selects the first session when activeId is null.
    // Wait for it to become the active session rather than clicking the list item.
    await window.waitForFunction(
      () => window.__clauditorTest?.getActiveId() !== null,
      null,
      { timeout: 2000 }
    );

    // The xterm canvas/element should be mounted under #terminal-container.
    await expect(window.locator('#terminal-container .xterm-mount')).toHaveCount(1);

    // Wait for the fake CLI banner to land in the xterm buffer.
    await window.waitForFunction(
      () => (window.__clauditorTest?.getActiveTermBuffer() || '').includes('FAKE-CLAUDE READY'),
      null,
      { timeout: 5000 }
    );

    // Cleanly exit the session.
    await window.evaluate((id) => window.clauditor.write(id, '__exit__\r\n'), session.id);
  } finally {
    await electronApp.close();
  }
});
