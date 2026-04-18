import { test, expect } from '@playwright/test';

test.describe('Settings dialog', () => {
  test('opens via Ctrl+, and shows all three tabs', async ({ page }) => {
    await page.goto('http://localhost:1420', { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+Comma');
    await expect(page.getByRole('tab', { name: 'Appearance' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Shortcuts' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Hooks' })).toBeVisible();
  });

  test('theme toggle flips data-theme attribute on html', async ({ page }) => {
    await page.goto('http://localhost:1420', { waitUntil: 'networkidle' });
    await page.keyboard.press('Control+Comma');
    // Theme buttons are cards with swatch + label text; use getByText to find them
    await page.getByText('Light', { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByText('Dark', { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('rebinding a shortcut takes effect in the current session', async ({ page }) => {
    // NOTE: full persistence across reload requires the real Rust backend (api.setPreferences
    // writes to disk); mock state resets on page reload, so we only verify the rebind is
    // reflected in the UI within the same session.
    await page.goto('http://localhost:1420', { waitUntil: 'networkidle' });
    await page.keyboard.press('Control+Comma');
    await page.getByRole('tab', { name: 'Shortcuts' }).click();

    // Find the 'Toggle sidebar' row (span → label div → row div) and scroll into view
    // Structure: row > label-div > span[Toggle sidebar] | row > buttons-div > button
    const row = page.getByText('Toggle sidebar', { exact: true }).locator('../..');
    await row.scrollIntoViewIfNeeded();
    // Click the chord button (first button in the row) to start capture
    await row.getByRole('button').first().click();
    await page.keyboard.press('Control+Shift+Y');
    await page.waitForTimeout(100);

    // The chord button should now display the newly bound key
    await expect(row.getByRole('button').first()).toContainText(/Y/i);
  });
});
