// TS-02 — Session lifecycle FSM
//
// NOTE: Some DOM selectors below are best-guess from the plan and may need
// adjustment after first CI run (e.g. 'button:has-text("New session")',
// 'input[name="cwd"]', 'button:has-text("Confirm")', tab context-menu
// "Restart" action). If a selector fails, patch it in a follow-up commit and
// keep the assertion logic.

import { browser, $, $$, expect } from '@wdio/globals';
import { launchApp } from '../helpers/app.js';
import { SEL } from '../helpers/selectors.js';
import { scenarios } from '../helpers/fakeClaude.js';
import { postHook } from '../helpers/hooks.js';
import { makeRepo, cleanup as cleanFs } from '../helpers/fs.js';
import { killProcess } from '../helpers/pids.js';

async function dumpFsm(id: string): Promise<string | null> {
  return browser.executeAsync<string | null, [string]>(
    async (sid: string, done: (v: string | null) => void) => {
      done(await (window as any).__test__.dumpFsm(sid));
    },
    id,
  );
}

async function listPids(): Promise<number[]> {
  return browser.executeAsync<number[], []>(
    async (done: (v: number[]) => void) => {
      done(await (window as any).__test__.listPids());
    },
  );
}

async function activeSessionId(): Promise<string> {
  return browser.execute(() =>
    document
      .querySelector('[data-tab-id][data-active="true"]')
      ?.getAttribute('data-tab-id') ?? '',
  );
}

async function createSession(cwd: string): Promise<string> {
  await $(SEL.newSessionBtn).click();
  await $('input[name="cwd"]').setValue(cwd);
  await $('button:has-text("Confirm")').click();
  await browser.waitUntil(async () => (await activeSessionId()) !== '', {
    timeout: 3000,
  });
  return activeSessionId();
}

describe('TS-02 — Session lifecycle FSM', () => {
  let repo: string;
  before(() => {
    repo = makeRepo('small');
  });
  after(() => cleanFs(repo));

  // TC-101
  it('TC-101 creates session via empty-state CTA and reaches Idle', async () => {
    const app = await launchApp({
      fakeScenarioPath: scenarios.idle().writeToTmp(),
    });
    const id = await createSession(repo);
    await browser.waitUntil(async () => (await dumpFsm(id)) === 'Idle', {
      timeout: 3000,
    });
    const pids = await listPids();
    expect(pids.length).toBe(1);
    await app.cleanup();
  });

  // TC-102 + TC-103 + TC-104
  it('TC-102/103/104 advance through Running → ToolUse → Running on hooks', async () => {
    const app = await launchApp({
      fakeScenarioPath: scenarios.promptToolStop().writeToTmp(),
    });
    const id = await createSession(repo);
    await browser.waitUntil(async () => (await dumpFsm(id)) === 'Running', {
      timeout: 1000,
    });
    await browser.waitUntil(
      async () => (await dumpFsm(id))?.startsWith('ToolUse') ?? false,
      { timeout: 1000 },
    );
    await browser.waitUntil(async () => (await dumpFsm(id)) === 'Running', {
      timeout: 2000,
    });
    const rows = await $$('[data-testid="activity-row"]');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const lastRowText = await $('[data-testid="activity-row"]:last-child').getText();
    expect(lastRowText).toContain('Bash');
    await app.cleanup();
  });

  // TC-105
  it('TC-105 honors 1500ms stop grace before flipping to Idle', async () => {
    const app = await launchApp({
      fakeScenarioPath: scenarios.idle().writeToTmp(),
    });
    const id = await createSession(repo);
    await postHook({ event: 'UserPromptSubmit' });
    await browser.waitUntil(async () => (await dumpFsm(id)) === 'Running', {
      timeout: 500,
    });
    const t0 = Date.now();
    await postHook({ event: 'Stop' });
    await new Promise((r) => setTimeout(r, 100));
    expect(await dumpFsm(id)).toBe('Stopping');
    const remainingToBoundary = 1500 - (Date.now() - t0) - 1;
    if (remainingToBoundary > 0) await new Promise((r) => setTimeout(r, remainingToBoundary));
    expect(await dumpFsm(id)).toBe('Stopping');
    await new Promise((r) => setTimeout(r, 1700 - (Date.now() - t0)));
    expect(await dumpFsm(id)).toBe('Idle');
    await app.cleanup();
  });

  // TC-106
  it('TC-106 transitions Idle → Asleep at IDLE_TIMEOUT boundary', async () => {
    const app = await launchApp({
      fakeScenarioPath: scenarios.idle().writeToTmp(),
      idleMs: 2000,
    });
    const id = await createSession(repo);
    await browser.waitUntil(async () => (await dumpFsm(id)) === 'Idle', {
      timeout: 2000,
    });
    await new Promise((r) => setTimeout(r, 1900));
    expect(await dumpFsm(id)).toBe('Idle');
    await new Promise((r) => setTimeout(r, 300));
    expect(await dumpFsm(id)).toBe('Asleep');
    const tabClass = await browser.execute(
      (sid: string) =>
        document.querySelector(`[data-tab-id="${sid}"]`)?.className ?? '',
      id,
    );
    expect(tabClass).toMatch(/dim|asleep|inactive/i);
    await app.cleanup();
  });

  // TC-107
  it('TC-107 detects PTY crash and supports restart', async () => {
    const app = await launchApp({
      fakeScenarioPath: scenarios.idle().writeToTmp(),
    });
    const id = await createSession(repo);
    const pids = await listPids();
    killProcess(pids[0]);
    await browser.waitUntil(async () => (await dumpFsm(id)) === 'Crashed', {
      timeout: 2000,
    });
    await $(`[data-tab-id="${id}"] button[data-action="restart"]`).click();
    await browser.waitUntil(async () => (await dumpFsm(id)) === 'Idle', {
      timeout: 3000,
    });
    await app.cleanup();
  });

  // TC-108
  it('TC-108 tolerates stray PostToolUse without prior PreToolUse', async () => {
    const app = await launchApp({
      fakeScenarioPath: scenarios.idle().writeToTmp(),
    });
    const id = await createSession(repo);
    await postHook({ event: 'UserPromptSubmit' });
    await browser.waitUntil(async () => (await dumpFsm(id)) === 'Running', {
      timeout: 500,
    });
    const res = await postHook({ event: 'PostToolUse' });
    expect(res.status).toBe(200);
    expect(await dumpFsm(id)).toBe('Running');
    const rows = await $$('[data-testid="activity-row"]');
    expect(rows.length).toBe(0);
    await app.cleanup();
  });
});
