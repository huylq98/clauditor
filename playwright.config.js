const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  projects: [
    { name: 'unit', testMatch: /unit\/.*\.test\.js/ },
    { name: 'pty',  testMatch: /pty\/.*\.test\.js/ },
    { name: 'e2e',  testMatch: /e2e\/.*\.test\.js/ },
  ],
});
