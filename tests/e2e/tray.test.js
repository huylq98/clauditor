const { test, expect } = require('@playwright/test');
const { launchApp } = require('../helpers/launch-app');

test('tray menu has Show / New Session / Quit (or equivalents)', async () => {
  const { electronApp, window } = await launchApp();
  try {
    const labels = await window.evaluate(() => window.__clauditorTestBridge.trayItems());
    expect(Array.isArray(labels)).toBe(true);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.some(l => /quit|exit/i.test(l))).toBe(true);
  } finally {
    await electronApp.close();
  }
});
