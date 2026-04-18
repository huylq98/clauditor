import { test, expect } from '@playwright/test';

/**
 * Open the capabilities sheet via the Command Palette ("Browse capabilities").
 *
 * Note on Ctrl+Shift+S: Chromium intercepts this key combo as "Save Page As"
 * before the page's capture-phase listener can handle it. The Command Palette
 * path is the canonical alternative and exercises the same store action
 * (useCapabilitiesStore.openSheet).
 *
 * Note on search filter: cmdk v1 filters by item value (text content) so
 * typing "capabilities" should match "Browse capabilities". If the palette
 * returns "No results", open the palette without filtering and scroll to the
 * item instead.
 */
async function openCapabilitiesSheet(page: import('@playwright/test').Page) {
  await page.keyboard.press('Control+K');
  await expect(page.getByPlaceholder(/Type a command/i)).toBeVisible();
  await page.getByText('Browse capabilities').click();
  await expect(page.getByTestId('capabilities-list')).toBeVisible();
}

test.describe('capabilities sheet', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
  });

  test('opens via command palette and shows mock items', async ({ page }) => {
    await openCapabilitiesSheet(page);
    await expect(page.getByTestId('capability-row')).toHaveCount(2);
  });

  test('search filters the list', async ({ page }) => {
    await openCapabilitiesSheet(page);
    await page.getByTestId('capabilities-search').fill('demo');
    await expect(page.getByTestId('capability-row')).toHaveCount(1);
  });

  test('toggling a kind pill filters the list', async ({ page }) => {
    await openCapabilitiesSheet(page);
    // Mock has one skill + one mcpserver. Disable the mcpserver pill.
    await page.getByTestId('kind-pill-mcpserver').click();
    await expect(page.getByTestId('capability-row')).toHaveCount(1);
  });

  test('Escape closes the sheet', async ({ page }) => {
    await openCapabilitiesSheet(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('capabilities-list')).not.toBeVisible();
  });

  // Clipboard permissions are unreliable in headless Chromium. Marked fixme
  // until a reliable cross-platform approach is confirmed.
  test.fixme('copy invocation writes to clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openCapabilitiesSheet(page);
    await page.getByTestId('capability-row').first().hover();
    await page.getByTestId('copy-demo').click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe('/demo');
  });
});
