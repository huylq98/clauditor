import { test, expect } from '@playwright/test';

/**
 * Auto-updater banner smoke tests — run against the Vite dev server with the
 * browser mock backend. `window.__MOCK_UPDATE__` is the override handle wired
 * in `src/lib/mock.ts`; set it via `page.addInitScript` before the SPA loads.
 */

test.describe('UpdateBanner', () => {
  test('no banner when the mock says we are up to date', async ({ page }) => {
    await page.goto('http://localhost:1420', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await expect(page.getByText(/is available\./)).toHaveCount(0);
    await expect(page.getByText(/Downloading update/)).toHaveCount(0);
  });

  test('banner appears and Install click advances beyond the "available" state', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __MOCK_UPDATE__?: unknown }).__MOCK_UPDATE__ = {
        available: true,
        version: '99.0.0',
        body: 'Mock release notes',
      };
    });
    await page.goto('http://localhost:1420', { waitUntil: 'networkidle' });

    const availableText = page.getByText(/Clauditor 99\.0\.0 is available\./);
    await expect(availableText).toBeVisible();

    await page.getByRole('button', { name: 'Install' }).click();

    // The available-state text must go away after install is clicked; the banner
    // will then be in one of: downloading (transient), ready, or error.
    await expect(availableText).toBeHidden({ timeout: 5000 });
    // And must NOT be in the error state — absence is the real success signal.
    await expect(page.getByText(/Update failed:/)).toHaveCount(0);
  });

  test('dismiss hides the banner for the rest of the session', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __MOCK_UPDATE__?: unknown }).__MOCK_UPDATE__ = {
        available: true,
        version: '99.0.0',
      };
    });
    await page.goto('http://localhost:1420', { waitUntil: 'networkidle' });
    await expect(page.getByText(/Clauditor 99\.0\.0 is available\./)).toBeVisible();

    await page.getByRole('button', { name: /Dismiss update notification/ }).click();
    await expect(page.getByText(/Clauditor 99\.0\.0 is available\./)).toBeHidden();
  });
});
