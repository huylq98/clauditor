import { defineConfig, devices } from '@playwright/test';

/** Config for the capabilities spec — forces a fresh dev server so HMR stale state cannot mask new features. */
export default defineConfig({
  testDir: './tests',
  testMatch: 'capabilities.spec.ts',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:1421',
    trace: 'off',
    screenshot: 'only-on-failure',
    viewport: { width: 1400, height: 900 },
  },
  webServer: {
    command: 'npm run dev -- --port 1421 --strictPort',
    url: 'http://localhost:1421',
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
