import { browser, $ } from '@wdio/globals';
import { makeTmpHome, makeTmpDataDir, cleanup } from './fs.js';
import { applyDeterminism } from './determinism.js';

export interface LaunchOpts {
  fakeScenarioPath?: string;
  homeOverride?: string;
  dataOverride?: string;
  idleMs?: number;
  stopMs?: number;
  port?: number;
}

export interface AppHandle {
  home: string;
  data: string;
  port: number;
  cleanup: () => Promise<void>;
}

let nextPort = 47000;

export async function launchApp(opts: LaunchOpts = {}): Promise<AppHandle> {
  const home = opts.homeOverride ?? makeTmpHome();
  const data = opts.dataOverride ?? makeTmpDataDir();
  const port = opts.port ?? nextPort++;
  await browser.reloadSession({
    'tauri:options': {
      application: process.env.CLAUDITOR_BINARY,
      env: {
        CLAUDITOR_TEST_HOME: home,
        CLAUDITOR_TEST_DATA: data,
        CLAUDITOR_TEST_PORT: String(port),
        CLAUDITOR_TEST_IDLE_MS: opts.idleMs ? String(opts.idleMs) : '',
        CLAUDITOR_TEST_STOP_MS: opts.stopMs ? String(opts.stopMs) : '',
        CLAUDITOR_FAKE_BIN: process.env.CLAUDITOR_FAKE_BIN,
        CLAUDITOR_FAKE_SCENARIO: opts.fakeScenarioPath ?? '',
        HOME: home,
        USERPROFILE: home,
      },
    },
  } as any);
  await browser.setWindowSize(1920, 1080);
  await browser.setWindowRect(0, 0, 1920, 1080);
  await browser.waitUntil(async (): Promise<boolean> => (await $('header').isExisting()), { timeout: 5000 });
  await applyDeterminism();
  return {
    home, data, port,
    cleanup: async () => { cleanup(home, data); },
  };
}
