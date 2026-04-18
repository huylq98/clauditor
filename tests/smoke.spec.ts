import { test, expect } from '@playwright/test';

/**
 * Browser-only smoke tests — run against the Vite dev server.
 * The app falls back to its mock backend when `__TAURI_INTERNALS__` is absent.
 *
 * These tests are the "is the UI even rendering" canary. Tauri-specific
 * behavior (real PTYs, OS dialogs, tray) is covered by `tauri-driver` tests
 * run against the packaged binary.
 */

test('renders shell + empty state', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  const pageErrors: Error[] = [];
  page.on('pageerror', (e) => pageErrors.push(e));

  await page.goto('http://localhost:1420', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Capture state regardless of outcome
  await page.screenshot({ path: 'tests/artifacts/initial.png', fullPage: true });

  // Core shell elements
  await expect(page.locator('header')).toBeVisible();
  await expect(page.locator('footer')).toBeVisible();
  await expect(page.getByText('Clauditor').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /No active session/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /New session/i }).first()).toBeVisible();

  // No unhandled runtime errors
  expect(pageErrors, `page errors:\n${pageErrors.map((e) => e.message).join('\n')}`).toEqual(
    [],
  );
  expect(
    consoleErrors.filter((e) => !e.includes('React DevTools')),
    `console errors:\n${consoleErrors.join('\n')}`,
  ).toEqual([]);
});

test('command palette opens on Ctrl+K', async ({ page }) => {
  await page.goto('http://localhost:1420', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+K');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'tests/artifacts/palette.png', fullPage: true });
  await expect(
    page.getByPlaceholder(/Type a command or search a session/i),
  ).toBeVisible();
});

test('creates a mock session via palette', async ({ page }) => {
  // Set up a prompt handler for the mock backend's cwd prompt
  page.on('dialog', (d) => d.accept('C:\\Users\\demo\\playwright-repo'));

  await page.goto('http://localhost:1420', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  // Click the "New session" button in empty state
  await page.getByRole('button', { name: /New session/i }).first().click();
  await page.waitForTimeout(400);

  await page.screenshot({ path: 'tests/artifacts/session-created.png', fullPage: true });

  // Tab should show, sidebar should un-empty
  await expect(page.locator('[data-tab-id]').first()).toBeVisible();
});
