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
