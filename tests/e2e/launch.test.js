const { test, expect } = require('@playwright/test');
const { launchApp } = require('../helpers/launch-app');

test('app launches and renderer reaches complete state', async () => {
  const { electronApp, window } = await launchApp();
  try {
    await window.waitForFunction(() => document.readyState === 'complete');

    // Root layout containers from index.html exist
    await expect(window.locator('#session-list')).toBeAttached();
    await expect(window.locator('#terminal-container')).toBeAttached();

    // Test bridge is installed
    const bridgePresent = await window.evaluate(() => !!window.__clauditorTest);
    expect(bridgePresent).toBe(true);
  } finally {
    await electronApp.close();
  }
});
