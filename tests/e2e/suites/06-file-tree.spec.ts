// TS-06 — File tree & watcher
//
// Selectors: [data-testid^="file-row-"], [data-testid="file-tree-scroll"],
// [data-testid^="palette-recent-"] are best-guess. The makeRepo('large')
// helper from Phase 1 generates 1000 files under <repo>/big/.

import { browser, $, expect } from '@wdio/globals';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../helpers/app.js';
import { SEL } from '../helpers/selectors.js';
import { scenarios } from '../helpers/fakeClaude.js';
import { makeRepo, cleanup as cleanFs } from '../helpers/fs.js';

describe('TS-06 — File tree', () => {
  // TC-501
  it('TC-501 reflects file create/delete within debounce window', async () => {
    const repo = makeRepo('empty');
    const app = await launchApp({
      fakeScenarioPath: scenarios.idle().writeToTmp(),
    });
    try {
      await $(SEL.newSessionBtn).click();
      await $('input[name="cwd"]').setValue(repo);
      await $('button:has-text("Confirm")').click();
      expect(await $('[data-testid="file-row-new.txt"]').isExisting()).toBe(
        false,
      );
      writeFileSync(join(repo, 'new.txt'), '');
      await $('[data-testid="file-row-new.txt"]').waitForDisplayed({
        timeout: 500,
      });
      unlinkSync(join(repo, 'new.txt'));
      await browser.waitUntil(
        async () =>
          !(await $('[data-testid="file-row-new.txt"]').isExisting()),
        { timeout: 500 },
      );
    } finally {
      await app.cleanup();
      cleanFs(repo);
    }
  });

  // TC-502
  it('TC-502 virtualizes a 1000-file folder within budget', async () => {
    const repo = makeRepo('large');
    const app = await launchApp({
      fakeScenarioPath: scenarios.idle().writeToTmp(),
    });
    try {
      await $(SEL.newSessionBtn).click();
      await $('input[name="cwd"]').setValue(repo);
      await $('button:has-text("Confirm")').click();
      const t0 = Date.now();
      await $('[data-testid="file-row-big"]').click();
      const renderedRows = await browser.execute(
        () =>
          document.querySelectorAll('[data-testid^="file-row-f"]').length,
      );
      expect(Date.now() - t0).toBeLessThanOrEqual(300);
      expect(renderedRows).toBeLessThanOrEqual(60);
      await browser.execute(() => {
        const list = document.querySelector(
          '[data-testid="file-tree-scroll"]',
        ) as HTMLElement | null;
        if (list) list.scrollTop = list.scrollHeight;
      });
      await $('[data-testid="file-row-f1000.txt"]').waitForDisplayed({
        timeout: 1000,
      });
    } finally {
      await app.cleanup();
      cleanFs(repo);
    }
  });

  // TC-503
  it('TC-503 persists and surfaces recent CWDs in MRU order', async () => {
    const a = makeRepo('empty');
    const b = makeRepo('empty');
    const c = makeRepo('empty');
    const app = await launchApp({
      fakeScenarioPath: scenarios.idle().writeToTmp(),
    });
    try {
      for (const d of [a, b, c]) {
        await $(SEL.newSessionBtn).click();
        await $('input[name="cwd"]').setValue(d);
        await $('button:has-text("Confirm")').click();
        const id = await browser.execute(
          () =>
            document
              .querySelector('[data-tab-id][data-active="true"]')
              ?.getAttribute('data-tab-id') ?? '',
        );
        await $(`[data-tab-id="${id}"] button[data-action="close"]`).click();
      }
      await app.cleanup();
      const app2 = await launchApp({
        homeOverride: app.home,
        dataOverride: app.data,
      });
      try {
        await browser.keys(['Control', 'k']);
        const items = await browser.execute(() =>
          Array.from(
            document.querySelectorAll('[data-testid^="palette-recent-"]'),
          ).map((e) => e.textContent?.trim() ?? ''),
        );
        expect(items[0]).toContain(c);
        expect(items[1]).toContain(b);
        expect(items[2]).toContain(a);
      } finally {
        await app2.cleanup();
      }
    } finally {
      cleanFs(a, b, c);
    }
  });
});
