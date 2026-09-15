// TS-10 — Errors & edge cases
//
// Several cases need __test__ commands not yet exposed
// (setClaudeBinary, failNextStoreWrite). They soft-skip when missing.
// Selectors for toasts, banners are best-guess.

import { browser, $, expect } from '@wdio/globals';
import { launchApp } from '../helpers/app.js';
import { SEL } from '../helpers/selectors.js';
import { scenarios } from '../helpers/fakeClaude.js';
import { writeSettings, makeRepo, cleanup as cleanFs } from '../helpers/fs.js';

describe('TS-10 — Errors & edge cases', () => {
  // TC-901
  it('TC-901 surfaces actionable error when claude binary is missing', async () => {
    const app = await launchApp();
    const repo = makeRepo('empty');
    try {
      const hasSetter = await browser.execute(
        () =>
          typeof (window as any).__test__?.setClaudeBinary === 'function',
      );
      if (!hasSetter) {
        // Soft-skip until setClaudeBinary is exposed.
        return;
      }
      await browser.executeAsync(async (done: () => void) => {
        await (window as any).__test__.setClaudeBinary(
          'C:\\does-not-exist\\claude.exe',
        );
        done();
      });
      await $(SEL.newSessionBtn).click();
      await $('input[name="cwd"]').setValue(repo);
      await $('button:has-text("Confirm")').click();
      await $(
        '[data-testid="toast-error"]:has-text("claude binary not found")',
      ).waitForDisplayed({ timeout: 2000 });
      await expect(
        $('[data-testid="toast-error"] button:has-text("Choose binary")'),
      ).toBeDisplayed();
      expect(
        await browser.execute(
          () => document.querySelectorAll('[data-tab-id]').length,
        ),
      ).toBe(0);
    } finally {
      await app.cleanup();
      cleanFs(repo);
    }
  });

  // TC-902
  it('TC-902 launches with defaults + warning on malformed settings.json', async () => {
    const app = await launchApp();
    writeSettings(app.home, '{not-json');
    await app.cleanup();
    const app2 = await launchApp({
      homeOverride: app.home,
      dataOverride: app.data,
    });
    try {
      await browser.keys(['Control', ',']);
      await $('button:has-text("Hooks")').click();
      await expect(
        $('[data-testid="settings-parse-warning"]'),
      ).toBeDisplayed();
      const sbBottom = await browser.execute(() => {
        const sb = document.querySelector(
          '[data-region="statusbar"]',
        ) as HTMLElement;
        return sb.getBoundingClientRect().bottom;
      });
      const innerHeight = await browser.execute(() => window.innerHeight);
      expect(sbBottom).toBeLessThanOrEqual(innerHeight);
    } finally {
      await app2.cleanup();
    }
  });

  // TC-903
  it('TC-903 preserves in-memory state and recovers when disk frees up', async () => {
    const app = await launchApp({
      fakeScenarioPath: scenarios.idle().writeToTmp(),
    });
    const repo = makeRepo('empty');
    try {
      const hasFailNext = await browser.execute(
        () =>
          typeof (window as any).__test__?.failNextStoreWrite === 'function',
      );
      if (!hasFailNext) {
        // Soft-skip until __test__.failNextStoreWrite is exposed.
        return;
      }
      await browser.executeAsync(async (done: () => void) => {
        await (window as any).__test__.failNextStoreWrite();
        done();
      });
      await $(SEL.newSessionBtn).click();
      await $('input[name="cwd"]').setValue(repo);
      await $('button:has-text("Confirm")').click();
      await $(
        '[data-testid="toast-error"]:has-text("Could not save sessions")',
      ).waitForDisplayed({ timeout: 2000 });
      expect(
        await browser.execute(
          () => document.querySelectorAll('[data-tab-id]').length,
        ),
      ).toBeGreaterThanOrEqual(1);
    } finally {
      await app.cleanup();
      cleanFs(repo);
    }
  });

  // TC-904
  it('TC-904 degrades gracefully when hook port is occupied', async () => {
    const port = 47999;
    const http = await import('node:http');
    const server = http.createServer().listen(port, '127.0.0.1');
    try {
      const app = await launchApp({ port });
      try {
        await expect(
          $('[data-testid="hook-server-degraded-banner"]'),
        ).toBeDisplayed();
        await $(SEL.newSessionBtn).click();
        await $('input[name="cwd"]').setValue('.');
        await $('button:has-text("Confirm")').click();
        const id = await browser.execute(
          () =>
            document
              .querySelector('[data-tab-id][data-active="true"]')
              ?.getAttribute('data-tab-id') ?? '',
        );
        await new Promise((r) => setTimeout(r, 1500));
        const fsm = await browser.executeAsync<string | null, [string]>(
          async (sid: string, done: (v: string | null) => void) =>
            done(await (window as any).__test__.dumpFsm(sid)),
          id,
        );
        expect(['Spawning', 'Idle']).toContain(fsm);
      } finally {
        await app.cleanup();
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
