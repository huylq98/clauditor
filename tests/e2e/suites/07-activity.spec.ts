// TS-07 — Activity panel
//
// Uses postHook + dumpFsm to drive activity rows; selector
// [data-testid="activity-row"] with optional data-tool-name attribute.

import { browser, $, $$, expect } from '@wdio/globals';
import { launchApp } from '../helpers/app.js';
import { SEL } from '../helpers/selectors.js';
import { scenarios } from '../helpers/fakeClaude.js';
import { postHook } from '../helpers/hooks.js';
import { makeRepo, cleanup as cleanFs } from '../helpers/fs.js';

describe('TS-07 — Activity panel', () => {
  let repo: string;
  let app: Awaited<ReturnType<typeof launchApp>>;

  before(async () => {
    repo = makeRepo('empty');
    app = await launchApp({ fakeScenarioPath: scenarios.idle().writeToTmp() });
  });

  after(async () => {
    await app.cleanup();
    cleanFs(repo);
  });

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

  // TC-601
  it('TC-601 aggregates 5 ordered tool-call rows', async () => {
    await newSession();
    await postHook({ event: 'UserPromptSubmit' });
    const tools = ['Read', 'Edit', 'Bash', 'Grep', 'Glob'];
    for (const t of tools) {
      await postHook({ event: 'PreToolUse', toolName: t });
      await new Promise((r) => setTimeout(r, 100));
      await postHook({ event: 'PostToolUse' });
    }
    const rows = await $$('[data-testid="activity-row"]');
    expect(rows.length).toBe(5);
    const names = await browser.execute(() =>
      Array.from(document.querySelectorAll('[data-testid="activity-row"]')).map(
        (e) => e.getAttribute('data-tool-name') ?? '',
      ),
    );
    expect(names).toEqual(tools);
  });

  // TC-602
  it('TC-602 scopes activity panel to the active session only', async () => {
    const a = await newSession();
    for (let i = 0; i < 3; i++) {
      await postHook({ event: 'PreToolUse', toolName: 'Bash' });
      await postHook({ event: 'PostToolUse' });
    }
    const b = await newSession();
    await postHook({ event: 'PreToolUse', toolName: 'Read' });
    await postHook({ event: 'PostToolUse' });
    await $(`[data-tab-id="${a}"]`).click();
    expect((await $$('[data-testid="activity-row"]')).length).toBe(3);
    await $(`[data-tab-id="${b}"]`).click();
    expect((await $$('[data-testid="activity-row"]')).length).toBe(1);
  });
});
