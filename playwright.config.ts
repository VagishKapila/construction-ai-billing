import { defineConfig } from '@playwright/test';

/**
 * Construction AI Billing — Playwright Config
 *
 * Runs API tests against staging or production.
 * Full browser tests require a headed environment (local dev).
 *
 * Usage:
 *   TEST_BASE_URL=https://construction-ai-billing-staging.up.railway.app npx playwright test
 *   TEST_BASE_URL=https://constructinv.varshyl.com npx playwright test
 *
 * RULE: Run BEFORE every push. No exceptions.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,        // sequential — avoids DB conflicts between tests
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30000,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],
  use: {
    baseURL: process.env.TEST_BASE_URL || 'https://construction-ai-billing-staging.up.railway.app',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    extraHTTPHeaders: { 'Accept': 'application/json' },
  },
  projects: [
    {
      name: 'api',
      testMatch: '**/e2e/**/*.spec.ts',
      use: {},   // no browser needed for API tests
    },
    {
      name: 'unit',
      testMatch: '**/unit/**/*.test.ts',
      use: {},
    },
  ],
});
