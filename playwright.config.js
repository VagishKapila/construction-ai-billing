/**
 * Playwright configuration for Construction AI Billing e2e tests.
 *
 * Run: npx playwright test
 * Run headed: npx playwright test --headed
 * Run specific suite: npx playwright test -g "Public Pages"
 */

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  testMatch: ['e2e_test.js', 'visual_regression_test.js'],
  timeout: 30000,
  retries: 1,
  workers: 1, // sequential — tests share state via login
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'test-results' }]
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://construction-ai-billing-staging.up.railway.app',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: { browserName: 'chromium' },
    },
    {
      name: 'Mobile Safari',
      use: {
        browserName: 'webkit',
        viewport: { width: 375, height: 812 },
        isMobile: true,
      },
    },
  ],
});
