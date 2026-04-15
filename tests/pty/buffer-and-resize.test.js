const { test, expect } = require('@playwright/test');
const path = require('path');
const os = require('os');

const FAKE = process.platform === 'win32'
  ? path.resolve(__dirname, '..', 'fixtures', 'fake-claude.cmd')
  : path.resolve(__dirname, '..', 'fixtures', 'fake-claude.js');

let mgr = null;

test.beforeEach(() => {
  process.env.CLAUDITOR_CLI_OVERRIDE = FAKE;
  delete require.cache[require.resolve('../../src/main/pty-manager.js')];
});

test.afterEach(() => {
  try { mgr?.killAll(); } catch {}
  mgr = null;
  delete process.env.CLAUDITOR_CLI_OVERRIDE;
});

test('buffer is capped at MAX_BUFFER (1 MiB)', async () => {
  const { PTYManager } = require('../../src/main/pty-manager.js');
  mgr = new PTYManager({ token: 't' });
  const session = mgr.spawn({ cwd: os.tmpdir(), cols: 80, rows: 24 });
  await sleep(200);
  for (let i = 0; i < 5; i++) mgr.write(session.id, '__big__\r\n');
  await sleep(500);
  expect(mgr.getBuffer(session.id).length).toBeLessThanOrEqual(1024 * 1024);
});

test('resize does not throw on live session', async () => {
  const { PTYManager } = require('../../src/main/pty-manager.js');
  mgr = new PTYManager({ token: 't' });
  const session = mgr.spawn({ cwd: os.tmpdir(), cols: 80, rows: 24 });
  await sleep(100);
  expect(() => mgr.resize(session.id, 120, 40)).not.toThrow();
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
