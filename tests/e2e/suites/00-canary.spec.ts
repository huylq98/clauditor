import { browser, $, expect } from '@wdio/globals';
import { launchApp } from '../helpers/app.js';
import { SEL } from '../helpers/selectors.js';
import { scenarios } from '../helpers/fakeClaude.js';

describe('Canary — harness boots and exposes test seams', () => {
  let app: Awaited<ReturnType<typeof launchApp>>;

  before(async () => {
    app = await launchApp({ fakeScenarioPath: scenarios.idle().writeToTmp() });
  });

  after(async () => {
    await app.cleanup();
  });

  it('renders the shell and exposes window.__test__', async () => {
    await expect($(SEL.region.titlebar)).toBeDisplayed();
    await expect($(SEL.region.statusbar)).toBeDisplayed();

    const port = await browser.executeAsync<number, []>(async (done: (v: number) => void) => {
      done(await (window as any).__test__.hookPort());
    });
    expect(port).toBe(app.port);

    const token = await browser.executeAsync<string, []>(async (done: (v: string) => void) => {
      done(await (window as any).__test__.hookToken());
    });
    expect(token).toMatch(/^[0-9a-f]{48}$/);
  });
});
