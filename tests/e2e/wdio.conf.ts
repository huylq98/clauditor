import { resolve } from 'node:path';
import { platform } from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '../..');
const isWindows = platform() === 'win32';

// `pnpm e2e:build:app` runs `tauri build --debug --no-bundle`, which puts the
// binary under target/debug/ (not target/release/).
const tauriBinary = isWindows
  ? resolve(repoRoot, 'src-tauri/target/debug/clauditor.exe')
  : resolve(repoRoot, 'src-tauri/target/debug/clauditor');

const fakeClaude = isWindows
  ? resolve(repoRoot, 'src-tauri/test-fixtures/fake-claude/target/release/fake-claude.exe')
  : resolve(repoRoot, 'src-tauri/test-fixtures/fake-claude/target/release/fake-claude');

let tauriDriver: ChildProcess | null = null;

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
  // tauri-driver is a Cargo binary (a WebDriver server), not a wdio service.
  // Spawn it ourselves; wdio connects to it on port 4444 via standard WebDriver.
  onPrepare: () =>
    new Promise<void>((resolveReady, rejectReady) => {
      tauriDriver = spawn('tauri-driver', [], { stdio: 'inherit' });
      tauriDriver.on('error', rejectReady);
      // Give the driver a moment to bind its port before sessions start.
      setTimeout(resolveReady, 1500);
    }),
  onComplete: () => {
    if (tauriDriver && !tauriDriver.killed) tauriDriver.kill();
  },
  beforeSession() {
    process.env.CLAUDITOR_BINARY = process.env.CLAUDITOR_BINARY ?? tauriBinary;
    process.env.CLAUDITOR_FAKE_BIN = process.env.CLAUDITOR_FAKE_BIN ?? fakeClaude;
  },
};
