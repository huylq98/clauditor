import { resolve } from 'node:path';
import { platform } from 'node:os';

const repoRoot = resolve(__dirname, '../..');
const isWindows = platform() === 'win32';

const tauriBinary = isWindows
  ? resolve(repoRoot, 'src-tauri/target/release/clauditor.exe')
  : resolve(repoRoot, 'src-tauri/target/release/clauditor');

const fakeClaude = isWindows
  ? resolve(repoRoot, 'src-tauri/test-fixtures/fake-claude/target/release/fake-claude.exe')
  : resolve(repoRoot, 'src-tauri/test-fixtures/fake-claude/target/release/fake-claude');

export const config: WebdriverIO.Config = {
  runner: 'local',
  port: 4444,
  hostname: '127.0.0.1',
  framework: 'mocha',
  mochaOpts: { ui: 'bdd', timeout: 60_000 },
  reporters: ['spec'],
  logLevel: 'warn',
  specs: ['./suites/**/*.spec.ts'],
  exclude: process.env.CLAUDITOR_E2E_LIVE === '1'
    ? []
    : ['./suites/11-live-smoke.spec.ts'],
  capabilities: [
    {
      'tauri:options': { application: tauriBinary } as Record<string, unknown>,
      browserName: isWindows ? 'webview2' : 'webkit',
    } as WebdriverIO.Capabilities,
  ],
  services: [['tauri-driver' as any, {}] as any],
  beforeSession() {
    process.env.CLAUDITOR_BINARY = process.env.CLAUDITOR_BINARY ?? tauriBinary;
    process.env.CLAUDITOR_FAKE_BIN = process.env.CLAUDITOR_FAKE_BIN ?? fakeClaude;
  },
};
