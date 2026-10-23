// TS-05 — Tabs & TerminalHost mount invariant
//
// TC-401 is the regression test for the "duplicate Claude banner" bug —
// proves TerminalHosts are display:none-hidden and identity-stable across
// tab switches. Best-guess selectors: dragAndDrop, button[data-action="close"].

import { browser, $, $$, expect } from '@wdio/globals';
import { launchApp } from '../helpers/app.js';
import { SEL } from '../helpers/selectors.js';
import { scenarios, Scenario } from '../helpers/fakeClaude.js';
import { makeRepo, cleanup as cleanFs } from '../helpers/fs.js';

describe('TS-05 — Tabs & TerminalHost mount', () => {
  let repo: string;
  before(() => {
    repo = makeRepo('empty');
  });
  after(() => cleanFs(repo));

  async function newSession(): Promise<string> {
    await $(SEL.newSessionBtn).click();
    await $('input[name="cwd"]').setValue(repo);
    await $('button:has-text("Confirm")').click();
    return browser.execute(
      () =>
        document
          .querySelector('[data-tab-id][data-active="true"]')
          ?.getAttribute('data-tab-id') ?? '',
    );
  }

  // TC-401
  it('TC-401 preserves scrollback and host identity across tab switches', async () => {
    const longScenario = new Scenario().stdout(
      0,
      'Claude Code v2.1.113-fake\n',
    );
    for (let i = 1; i <= 200; i++) longScenario.stdout(i, `A${i}\n`);
    const app = await launchApp({
      fakeScenarioPath: longScenario.writeToTmp(),
    });
    const a = await newSession();
    await new Promise((r) => setTimeout(r, 500));
    const b = await newSession();
    await $(`[data-tab-id="${a}"]`).click();
    const idA = await browser.execute(
      (id: string) =>
        document.querySelector(`[data-terminal-host="${id}"]`)?.id ?? '',
      a,
    );
    const lastLineA = await browser.execute((id: string) => {
      const host = document.querySelector(
        `[data-terminal-host="${id}"]`,
      ) as any;
      const t = host?.__xterm;
      if (!t) return '';
      return (
        t.buffer.active.getLine(t.buffer.active.cursorY - 1)
          ?.translateToString(true)
          ?.trim() ?? ''
      );
    }, a);
    expect(lastLineA).toBe('A200');
    await $(`[data-tab-id="${b}"]`).click();
    await $(`[data-tab-id="${a}"]`).click();
    const idA2 = await browser.execute(
      (id: string) =>
        document.querySelector(`[data-terminal-host="${id}"]`)?.id ?? '',
      a,
    );
    expect(idA2).toBe(idA);
    const visibleHosts = await browser.execute(
      () =>
        Array.from(document.querySelectorAll('[data-terminal-host]')).filter(
          (el) => getComputedStyle(el as Element).display !== 'none',
        ).length,
    );
    expect(visibleHosts).toBe(1);
    await app.cleanup();
  });

  // TC-402
  it('TC-402 persists drag-reordered tab order across relaunch', async () => {
    const app = await launchApp({
      fakeScenarioPath: scenarios.idle().writeToTmp(),
    });
    const a = await newSession();
    const b = await newSession();
    const c = await newSession();
    const tabC = await $(`[data-tab-id="${c}"]`);
    const tabA = await $(`[data-tab-id="${a}"]`);
    await tabC.dragAndDrop(tabA);
    let order = await browser.execute(() =>
      Array.from(document.querySelectorAll('[data-tab-id]')).map((e) =>
        e.getAttribute('data-tab-id'),
      ),
    );
    expect(order).toEqual([c, a, b]);
    await app.cleanup();
    const app2 = await launchApp({
      homeOverride: app.home,
      dataOverride: app.data,
    });
    order = await browser.execute(() =>
      Array.from(document.querySelectorAll('[data-tab-id]')).map((e) =>
        e.getAttribute('data-tab-id'),
      ),
    );
    expect(order).toEqual([c, a, b]);
    await app2.cleanup();
  });

  // TC-403
  it('TC-403 closes a tab on middle-click and shifts focus to neighbor', async () => {
    const app = await launchApp({
      fakeScenarioPath: scenarios.idle().writeToTmp(),
    });
    const a = await newSession();
    const b = await newSession();
    await newSession(); // c
    await $(`[data-tab-id="${b}"]`).click();
    const tabB = await $(`[data-tab-id="${b}"]`);
    await tabB.click({ button: 'middle' });
    await browser.waitUntil(
      async () => !(await $(`[data-tab-id="${b}"]`).isExisting()),
      { timeout: 2000 },
    );
    const active = await browser.execute(
      () =>
        document
          .querySelector('[data-tab-id][data-active="true"]')
          ?.getAttribute('data-tab-id') ?? '',
    );
    expect(active).toBe(a);
    await app.cleanup();
  });
});
