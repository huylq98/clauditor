import { test, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * UI/UX review pass — captures key app states as PNGs so a reviewer (human or
 * LLM) can evaluate typography, spacing, color, state presentation, and
 * interaction affordances without launching the app. Runs against the mock
 * backend in browser mode, so native Tauri chrome + real PTYs are out of
 * scope — those are covered by tauri-driver tests.
 */

const ART = 'tests/artifacts/review';

test.beforeAll(() => {
  fs.mkdirSync(ART, { recursive: true });
});

async function shot(page: Page, name: string, description: string) {
  const file = path.join(ART, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await fs.promises.writeFile(
    path.join(ART, `${name}.md`),
    `# ${name}\n\n${description}\n`,
  );
}

async function newSession(page: Page, cwd = 'C:\\Users\\demo\\project') {
  page.once('dialog', (d) => d.accept(cwd));
  const btn = page.getByRole('button', { name: /New session/i }).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
  } else {
    await page.keyboard.press('Control+T');
  }
  await page.waitForTimeout(300);
}

test.describe('UI review', () => {
  test('01 — empty state', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await shot(
      page,
      '01-empty-state',
      'Fresh load — no sessions. Evaluates: logo, empty-state card (icon, headline, hint copy, CTA), sidebar emptiness copy, status-bar "No sessions" text.',
    );
  });

  test('02 — command palette open', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+K');
    await page.waitForTimeout(250);
    await shot(
      page,
      '02-palette-open',
      'Palette at ⌘K. Evaluates: overlay, backdrop, action list grouping, keyboard hint badges, input placeholder, selected item highlight, dialog shadow/elevation.',
    );
  });

  test('03 — palette filtered', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+K');
    await page.waitForTimeout(150);
    await page
      .getByPlaceholder(/Type a command/i)
      .fill('kill');
    await page.waitForTimeout(150);
    await shot(
      page,
      '03-palette-filtered',
      'Palette filtered to "kill". Evaluates: cmdk fuzzy-match behavior, highlight on matching item, empty-group hiding.',
    );
  });

  test('04 — one session', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    await newSession(page, 'C:\\Users\\demo\\auth-service');
    await page.waitForTimeout(400);
    await shot(
      page,
      '04-one-session',
      'Single session running. Evaluates: tab appearance, active-tab underline, state dot color, status-bar pill + cwd, terminal mount, kill button styling, sidebar header (name + cwd in mono).',
    );
  });

  test('05 — three sessions', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    await newSession(page, 'C:\\Users\\demo\\auth-service');
    await newSession(page, 'C:\\Users\\demo\\billing-api');
    await newSession(page, 'C:\\Users\\demo\\growthbook-admin');
    await page.waitForTimeout(500);
    await shot(
      page,
      '05-three-sessions',
      'Three sessions, last one active. Evaluates: tab spacing, overflow behavior, active vs inactive contrast, dot-color distribution across states (mock cycles states every 6s).',
    );
  });

  test('06 — sidebar collapsed', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    await newSession(page);
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+B');
    await page.waitForTimeout(250);
    await shot(
      page,
      '06-sidebar-collapsed',
      'Sidebar collapsed via ⌘B. Evaluates: collapsed rail width, expand button affordance, how much more horizontal space the terminal gets.',
    );
  });

  test('07 — palette session jump', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    await newSession(page, 'C:\\Users\\demo\\alpha');
    await newSession(page, 'C:\\Users\\demo\\beta');
    await newSession(page, 'C:\\Users\\demo\\gamma');
    await page.waitForTimeout(400);
    await page.keyboard.press('Control+K');
    await page.waitForTimeout(200);
    await page
      .getByPlaceholder(/Type a command/i)
      .fill('beta');
    await page.waitForTimeout(200);
    await shot(
      page,
      '07-palette-jump',
      'Palette filtered to "beta" — showing one matched session. Evaluates: session-line hint (Ctrl+N), cwd description style, match relevance.',
    );
  });

  test('08 — long tab names + overflow', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    // Create enough sessions to force the tab bar to overflow
    for (let i = 0; i < 10; i += 1) {
      await newSession(page, `C:\\\\projects\\\\super-long-repo-name-${i}`);
    }
    await page.waitForTimeout(600);
    await shot(
      page,
      '08-tab-overflow',
      'Ten sessions forcing horizontal scroll in tab bar. Evaluates: tab truncation, overflow scroller UX, close-button visibility on non-active tabs.',
    );
  });

  test('09 — terminal focus after type', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    await newSession(page);
    await page.waitForTimeout(500);
    const terminal = page.locator('.xterm').first();
    await terminal.click();
    await page.keyboard.type('ls -la src/');
    await page.waitForTimeout(200);
    await shot(
      page,
      '09-terminal-typed',
      'Mock terminal after user typing. Evaluates: xterm font rendering, cursor style, accent color (cursor matches brand ember), line-height, contrast.',
    );
  });

  test('10 — confirm kill dialog', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    await newSession(page);
    await page.waitForTimeout(400);
    // Click the tab's close × button — triggers the Radix AlertDialog
    await page.locator('[data-tab-id] button[aria-label^="Close"]').first().click();
    await page.waitForSelector('role=dialog', { timeout: 2000 });
    await page.waitForTimeout(150);
    await shot(
      page,
      '10-kill-confirm',
      'Radix AlertDialog before killing. Evaluates: dialog chrome, copy quality, danger variant on the "Kill session" button, overlay backdrop.',
    );
    // Dismiss via Cancel so the session survives for other tests
    await page.getByRole('button', { name: /Cancel/i }).click();
  });
});
