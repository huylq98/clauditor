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

test('spawned PTY emits banner and echoes writes', async () => {
  const { PTYManager } = require('../../src/main/pty-manager.js');
  mgr = new PTYManager({ token: 't' });
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
