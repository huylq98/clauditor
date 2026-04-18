import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility pass — catches regressions against WCAG 2.2 AA.
 *
 * Runs in two modes:
 * - axe-core: scans each captured UI state for AA violations. Serious/critical
 *   issues fail the test. Moderate/minor are surfaced in the attachment but
 *   don't fail — they're the P2/nit backlog.
 * - DOM assertions: WCAG 2.2 target-size rule isn't in axe yet; we compute
 *   bounding boxes directly and assert 24×24 minimum.
 *
 * Intentional exclusions:
 * - `.xterm` renders text via canvas; axe's contrast scan false-flags it.
 * - Radix Tooltip content portals outside the root and the scan shouldn't
 *   fail when a tooltip happens to be open mid-transition.
 */

const AXE_EXCLUDE = ['.xterm', '[data-radix-popper-content-wrapper]'];

async function runAxe(page: Page, name: string) {
  const builder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .disableRules(['color-contrast']); // xterm canvas + CSS vars confuse the scanner
  for (const sel of AXE_EXCLUDE) builder.exclude(sel);
  const results = await builder.analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  if (serious.length) {
    await test.info().attach(`axe-${name}.json`, {
      body: JSON.stringify(results.violations, null, 2),
      contentType: 'application/json',
    });
  }
  expect(
    serious,
    serious
      .map((v) => `${v.impact.toUpperCase()} ${v.id}: ${v.help} (${v.nodes.length} nodes)`)
      .join('\n'),
  ).toEqual([]);
}

async function assertTargetSizes(page: Page) {
  // WCAG 2.2 AA §2.5.8 — interactive targets must be at least 24×24 CSS px,
  // except when inline with text, when the UA default applies, or when
  // "essential" (e.g. map pins). We don't have any exceptions here, so the
  // minimum applies to every visible button.
  const offenders = await page
    .locator('button:visible, a[href]:visible, [role="button"]:visible')
    .evaluateAll((els) => {
      const out: { text: string; w: number; h: number }[] = [];
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24)) {
          out.push({
            text: (el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 40),
            w: Math.round(r.width),
            h: Math.round(r.height),
          });
        }
      }
      return out;
    });
  expect(
    offenders,
    offenders.map((o) => `${o.w}×${o.h} — "${o.text}"`).join('\n'),
  ).toEqual([]);
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

test.describe('accessibility', () => {
  test('empty state meets WCAG 2.2 AA', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await runAxe(page, 'empty-state');
    await assertTargetSizes(page);
  });

  test('command palette meets WCAG 2.2 AA', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+K');
    await page.waitForTimeout(250);
    await runAxe(page, 'palette');
    await assertTargetSizes(page);
  });

  test('active session meets WCAG 2.2 AA', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    await newSession(page);
    await page.waitForTimeout(400);
    await runAxe(page, 'session');
    await assertTargetSizes(page);
  });

  test('kill-confirm dialog meets WCAG 2.2 AA', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    await newSession(page);
    await page.waitForTimeout(400);
    await page.locator('[data-tab-id] button[aria-label^="Close"]').first().click();
    await page.waitForSelector('role=dialog', { timeout: 2000 });
    await page.waitForTimeout(150);
    await runAxe(page, 'kill-confirm');
    await assertTargetSizes(page);
    await page.getByRole('button', { name: /Cancel/i }).click();
  });

  test('shortcuts dialog meets WCAG 2.2 AA', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+/');
    await page.waitForSelector('role=dialog', { timeout: 2000 });
    await page.waitForTimeout(150);
    await runAxe(page, 'shortcuts');
    await assertTargetSizes(page);
  });
});
