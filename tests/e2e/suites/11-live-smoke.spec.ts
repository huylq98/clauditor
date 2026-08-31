// TS-11 — Live smoke (real claude CLI)
//
// Gated by ANTHROPIC_API_KEY + CLAUDITOR_E2E_LIVE=1. Skips otherwise.
// Only runs when the e2e-live workflow dispatches it (Task 23 of Phase 3).

import { browser, $, expect } from '@wdio/globals';
import { launchApp } from '../helpers/app.js';
import { SEL } from '../helpers/selectors.js';
import { makeRepo, cleanup as cleanFs } from '../helpers/fs.js';

describe('TS-11 — Live smoke (real claude CLI)', () => {
  before(function () {
    if (
      !process.env.ANTHROPIC_API_KEY ||
      process.env.CLAUDITOR_E2E_LIVE !== '1'
    ) {
      this.skip();
    }
  });

  // TC-1001
  it('TC-1001 completes a real prompt round-trip', async () => {
    const repo = makeRepo('empty');
    const app = await launchApp({ fakeScenarioPath: undefined });
    try {
      const hasSetter = await browser.execute(
        () =>
          typeof (window as any).__test__?.setClaudeBinary === 'function',
      );
      if (hasSetter) {
        await browser.executeAsync(async (done: () => void) => {
          await (window as any).__test__.setClaudeBinary('claude');
          done();
        });
      }
      await $(SEL.newSessionBtn).click();
      await $('input[name="cwd"]').setValue(repo);
      await $('button:has-text("Confirm")').click();
      const id = await browser.execute(
        () =>
          document
            .querySelector('[data-tab-id][data-active="true"]')
            ?.getAttribute('data-tab-id') ?? '',
      );
      await $(SEL.region.terminal).click();
      await browser.keys('say only the word ready'.split(''));
      await browser.keys(['Enter']);
      await browser.waitUntil(
        async () =>
          (await browser.executeAsync<string | null, [string]>(
            async (sid: string, done: (v: string | null) => void) =>
              done(await (window as any).__test__.dumpFsm(sid)),
            id,
          )) === 'Running',
        { timeout: 5000 },
      );
      await browser.waitUntil(
        async () => {
          const txt = await browser.execute((sid: string) => {
            const host = document.querySelector(
              `[data-terminal-host="${sid}"]`,
            ) as any;
            return (
              host?.__xterm?.buffer?.active
                ?.getLine(host.__xterm.buffer.active.cursorY)
                ?.translateToString(true) ?? ''
            );
          }, id);
          return /ready/i.test(String(txt));
        },
        { timeout: 30_000 },
      );
      await browser.waitUntil(
        async () =>
          (await browser.executeAsync<string | null, [string]>(
            async (sid: string, done: (v: string | null) => void) =>
              done(await (window as any).__test__.dumpFsm(sid)),
            id,
          )) === 'Idle',
        { timeout: 35_000 },
      );
    } finally {
      await app.cleanup();
      cleanFs(repo);
    }
  });
});
