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
