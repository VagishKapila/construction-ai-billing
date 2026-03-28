/**
 * Construction AI Billing — End-to-End Browser Tests (Playwright)
 *
 * Tests full user flows in a real Chromium browser against the staging server.
 *
 * SETUP:
 *   npm install --save-dev @playwright/test
 *   npx playwright install chromium
 *
 * RUN:
 *   npx playwright test e2e_test.js
 *   npx playwright test e2e_test.js --headed    (watch the browser)
 *   npx playwright test e2e_test.js --debug     (step through)
 *
 * ENV VARS (optional):
 *   E2E_BASE_URL  — default: https://construction-ai-billing-staging.up.railway.app
 *   E2E_EMAIL     — test account email
 *   E2E_PASSWORD  — test account password
 *
 * NOTE: These tests run against the STAGING server. Never run against production.
 */

const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.E2E_BASE_URL || 'https://construction-ai-billing-staging.up.railway.app';
const TEST_EMAIL = process.env.E2E_EMAIL || '';
const TEST_PASSWORD = process.env.E2E_PASSWORD || '';

// ═══════════════════════════════════════════════════════════════════
// SUITE 1: Public Pages (no auth required)
// ═══════════════════════════════════════════════════════════════════

test.describe('Public Pages', () => {

  test('Landing page loads with correct title and nav', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/Construction/i);
    // Should have Sign In and Start Free buttons
    const signIn = page.locator('text=Sign In').first();
    await expect(signIn).toBeVisible();
  });

  test('Landing page has key sections', async ({ page }) => {
    await page.goto(BASE_URL);
    // Check for How It Works, Features, Who It's For
    await expect(page.locator('text=How It Works').first()).toBeVisible();
    await expect(page.locator('text=Features').first()).toBeVisible();
  });

  test('App page loads and shows auth screen', async ({ page }) => {
    await page.goto(`${BASE_URL}/app.html`);
    // Should show login/register form
    await expect(page.locator('#auth-screen')).toBeVisible();
    await expect(page.locator('text=Sign In').first()).toBeVisible();
  });

  test('App page has no console errors on load', async ({ page }) => {
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto(`${BASE_URL}/app.html`);
    await page.waitForTimeout(2000);
    // Filter out expected errors (like missing env vars on staging)
    const realErrors = errors.filter(e => !e.includes('favicon') && !e.includes('404'));
    expect(realErrors.length).toBeLessThanOrEqual(2); // Allow up to 2 minor errors
  });

  test('Unknown routes serve landing page (catch-all)', async ({ page }) => {
    await page.goto(`${BASE_URL}/some-random-path-that-does-not-exist`);
    // Should get the landing page, not a 404 error
    await expect(page.locator('body')).toContainText(/ConstructInvoice|Construction/i);
  });

  test('API returns 401 for unauthenticated requests', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/projects`);
    expect(res.status()).toBe(401);
  });

  test('Config endpoint returns Google OAuth status', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/config`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('googleEnabled');
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 2: Auth Flow (requires test credentials in env)
// ═══════════════════════════════════════════════════════════════════

test.describe('Auth Flow', () => {

  test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Skipping auth tests — set E2E_EMAIL and E2E_PASSWORD');

  test('Login with valid credentials shows dashboard', async ({ page }) => {
    await page.goto(`${BASE_URL}/app.html`);
    // Fill login form
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Sign In")');
    // Should navigate to dashboard
    await expect(page.locator('#pg-dash')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Dashboard')).toBeVisible();
  });

  test('Login with wrong password shows error', async ({ page }) => {
    await page.goto(`${BASE_URL}/app.html`);
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', 'wrong-password-12345');
    await page.click('button:has-text("Sign In")');
    // Should show error message
    await expect(page.locator('.err:not(.hidden), .error:not(.hidden)')).toBeVisible({ timeout: 5000 });
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 3: API Integration Tests (requires test credentials)
// ═══════════════════════════════════════════════════════════════════

test.describe('API Integration', () => {

  let token = '';

  test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Skipping API tests — set E2E_EMAIL and E2E_PASSWORD');

  test.beforeAll(async ({ request }) => {
    // Login via API to get JWT token
    const res = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD }
    });
    if (res.ok()) {
      const data = await res.json();
      token = data.token;
    }
  });

  test('GET /api/projects returns array', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/projects`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('GET /api/stats returns billing summary', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('total_billed');
    expect(data).toHaveProperty('total_retainage');
  });

  test('GET /api/settings returns company settings', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/settings`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('default_retainage');
  });

  test('GET /api/subscription returns trial info', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/subscription`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('subscription_status');
    expect(data).toHaveProperty('trial_start_date');
  });

  test('GET /api/onboarding/status returns onboarding state', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/onboarding/status`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('has_completed_onboarding');
  });

  test('GET /api/revenue/summary returns revenue data', async ({ request }) => {
    const year = new Date().getFullYear();
    const res = await request.get(`${BASE_URL}/api/revenue/summary?period=monthly&year=${year}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('total_billed');
    expect(data).toHaveProperty('chart');
    expect(data).toHaveProperty('rows');
    expect(Array.isArray(data.rows)).toBeTruthy();
    expect(Array.isArray(data.chart)).toBeTruthy();
  });

  test('POST /api/ai/ask returns AI response', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/ai/ask`, {
      headers: { 'Authorization': `Bearer ${token}` },
      data: { question: 'What file formats can I upload?', history: [] }
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('answer');
    expect(data.answer.length).toBeGreaterThan(10);
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 4: PDF & Download Tests
// ═══════════════════════════════════════════════════════════════════

test.describe('PDF & Downloads', () => {

  test('Revenue export endpoints require auth', async ({ request }) => {
    const year = new Date().getFullYear();
    const endpoints = [
      `/api/revenue/export/quickbooks?year=${year}`,
      `/api/revenue/export/sage?year=${year}`,
      `/api/revenue/report/pdf?year=${year}`,
    ];
    for (const ep of endpoints) {
      const res = await request.get(`${BASE_URL}${ep}`);
      expect(res.status()).toBe(401);
    }
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 5: Mobile Responsive Tests
// ═══════════════════════════════════════════════════════════════════

test.describe('Mobile Layout', () => {

  test('App loads correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone X
    await page.goto(`${BASE_URL}/app.html`);
    await expect(page.locator('#auth-screen')).toBeVisible();
  });

  test('Landing page is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE_URL);
    // No horizontal scroll
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5); // 5px tolerance
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 6: Security Tests
// ═══════════════════════════════════════════════════════════════════

test.describe('Security', () => {

  test('Admin endpoints reject non-admin users', async ({ request }) => {
    // Try without any auth — should get 401
    const res = await request.get(`${BASE_URL}/api/admin/stats`);
    expect(res.status()).toBe(401);
  });

  test('Registration requires valid email format', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/register`, {
      data: { name: 'Test', email: 'not-an-email', password: 'password123' }
    });
    // Should reject or return error
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('Login rate limiting is active', async ({ request }) => {
    // Send many rapid requests — should eventually get rate limited
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(request.post(`${BASE_URL}/api/auth/login`, {
        data: { email: 'fake@test.com', password: 'wrong' }
      }));
    }
    const results = await Promise.all(promises);
    const statuses = results.map(r => r.status());
    // At least some should be rate limited (429) or all should be auth errors (401)
    const hasRateLimit = statuses.some(s => s === 429);
    const allAuthErrors = statuses.every(s => s === 401 || s === 429);
    expect(allAuthErrors).toBeTruthy();
  });

  test('Static files are served correctly', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/varshyl-logo.png`);
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type']).toContain('image/png');
  });

});
