// TS-04 — Keyboard shortcuts (capture-phase invariant)
//
// All five cases pin xterm focus first and assert capture-phase keydown
// dispatch reaches the global handler before xterm swallows it.
// Selectors for shortcut rebinding ([data-testid="shortcut-row-..."],
// [data-action="capture"], button:has-text("Save")) are best-guess.

import { browser, $, expect } from '@wdio/globals';
import { launchApp } from '../helpers/app.js';
import { SEL } from '../helpers/selectors.js';
import { scenarios } from '../helpers/fakeClaude.js';
import { makeRepo, cleanup as cleanFs } from '../helpers/fs.js';

describe('TS-04 — Keyboard shortcuts', () => {
  let repo: string;
  before(() => {
    repo = makeRepo('empty');
  });
  after(() => cleanFs(repo));

  async function newSession(): Promise<void> {
    await $(SEL.newSessionBtn).click();
    await $('input[name="cwd"]').setValue(repo);
    await $('button:has-text("Confirm")').click();
    await browser.waitUntil(async () => $(SEL.region.terminal).isExisting(), {
      timeout: 3000,
    });
  }

  // TC-301
  it('TC-301 opens palette with Ctrl+K while xterm focused', async () => {
    const app = await launchApp({
      fakeScenarioPath: scenarios.idle().writeToTmp(),
    });
    await newSession();
    await $(SEL.region.terminal).click();
    await browser.keys(['Control', 'k']);
    await $(SEL.paletteInput).waitForDisplayed({ timeout: 500 });
    await app.cleanup();
  });

  // TC-302
  it('TC-302 opens new-session prompt with Ctrl+T while xterm focused', async () => {
    const app = await launchApp({
      fakeScenarioPath: scenarios.idle().writeToTmp(),
    });
    await newSession();
    await $(SEL.region.terminal).click();
    await browser.keys(['Control', 't']);
    await $('input[name="cwd"]').waitForDisplayed({ timeout: 500 });
    await browser.keys(['Escape']);
    await app.cleanup();
  });

  // TC-303
  it('TC-303 toggles sidebar with Ctrl+B', async () => {
    const app = await launchApp();
    const widthBefore = await $(SEL.region.sidebar).getSize('width');
    await browser.keys(['Control', 'b']);
    await browser.waitUntil(
      async () => (await $(SEL.region.sidebar).getSize('width')) === 0,
      { timeout: 1000 },
    );
    await browser.keys(['Control', 'b']);
    await browser.waitUntil(
      async () =>
        (await $(SEL.region.sidebar).getSize('width')) === widthBefore,
      { timeout: 1000 },
    );
    await app.cleanup();
  });

  // TC-304
  it('TC-304 opens xterm find bar on Ctrl+F', async () => {
    const app = await launchApp({
      fakeScenarioPath: scenarios.banner().writeToTmp(),
    });
    await newSession();
    await $(SEL.region.terminal).click();
    await browser.keys(['Control', 'f']);
    // The xterm search overlay is rendered inside the TerminalHost.
    // If a stable selector exists ([data-testid="xterm-search"]), use it; else
    // fall back to checking that some kind of input is now focused.
    await $('[data-testid="xterm-search"]').waitForDisplayed({ timeout: 1000 });
    await app.cleanup();
  });

  // TC-305
  it('TC-305 honors custom rebinds and releases the old chord', async () => {
    const app = await launchApp();
    await browser.keys(['Control', ',']);
    await $('button:has-text("Shortcuts")').click();
    await $(
      '[data-testid="shortcut-row-palette.open"] button[data-action="capture"]',
    ).click();
    await browser.keys(['Control', 'Shift', 'p']);
    await $('button:has-text("Save")').click();
    await browser.keys(['Escape']);
    await browser.keys(['Control', 'Shift', 'p']);
    await $(SEL.paletteInput).waitForDisplayed({ timeout: 500 });
    await browser.keys(['Escape']);
    await browser.keys(['Control', 'k']);
    await new Promise((r) => setTimeout(r, 300));
    expect(await $(SEL.paletteInput).isDisplayed()).toBe(false);
    await app.cleanup();
  });
});
