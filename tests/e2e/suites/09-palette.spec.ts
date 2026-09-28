// TS-09 — Command palette
//
// cmdk renders items as [cmdk-item]. Selectors for shortcut hints
// ([data-testid="palette-item-..."], [data-shortcut-hint]) are best-guess.

import { browser, $, expect } from '@wdio/globals';
import { launchApp } from '../helpers/app.js';
import { SEL } from '../helpers/selectors.js';
import { scenarios } from '../helpers/fakeClaude.js';

describe('TS-09 — Command palette', () => {
  let app: Awaited<ReturnType<typeof launchApp>>;

  before(async () => {
    app = await launchApp({ fakeScenarioPath: scenarios.idle().writeToTmp() });
  });

  after(() => app.cleanup());

  // TC-801
  it('TC-801 ranks "New session" first for "newsess"', async () => {
    await browser.keys(['Control', 'k']);
    await $(SEL.paletteInput).setValue('newsess');
    const first = await $('[cmdk-item]:first-of-type').getText();
    expect(first.toLowerCase()).toContain('new session');
    await browser.keys(['Escape']);
  });

  // TC-802 rebinds palette.open, which mutates persisted keymap state and
  // would bleed into TC-801/803 if run in the same app instance.
  describe('rebind (own launch)', () => {
    let app2: Awaited<ReturnType<typeof launchApp>>;
    before(async () => {
      app2 = await launchApp();
    });
    after(() => app2.cleanup());

    it('TC-802 displays the live keymap in the palette hint', async () => {
      await browser.keys(['Control', ',']);
      await $('button:has-text("Shortcuts")').click();
      await $(
        '[data-testid="shortcut-row-palette.open"] button[data-action="capture"]',
      ).click();
      await browser.keys(['Control', 'Shift', 'p']);
      await $('button:has-text("Save")').click();
      await browser.keys(['Escape']);
      await browser.keys(['Control', 'Shift', 'p']);
      const hint = await $(
        '[data-testid="palette-item-palette.open"] [data-shortcut-hint]',
      ).getText();
      expect(hint).toContain('Shift+P');
      expect(hint).not.toMatch(/^Ctrl\+K$/);
    });
  });

  // TC-803
  it('TC-803 closes silently on Esc without firing a command', async () => {
    const beforeTabs = await browser.execute(
      () => document.querySelectorAll('[data-tab-id]').length,
    );
    await browser.keys(['Control', 'k']);
    await $(SEL.paletteInput).setValue('new');
    await browser.keys(['Escape']);
    await browser.waitUntil(
      async () => !(await $(SEL.paletteInput).isDisplayed()),
      { timeout: 500 },
    );
    expect(
      await browser.execute(
        () => document.querySelectorAll('[data-tab-id]').length,
      ),
    ).toBe(beforeTabs);
  });
});
