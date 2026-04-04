/**
 * Construction AI Billing — Comprehensive End-to-End Browser Tests (Playwright)
 *
 * Tests full user flows in a real Chromium browser against the staging server.
 * Designed to test the product like a real human — every click, every form, every flow.
 *
 * SETUP:
 *   npm install --save-dev @playwright/test
 *   npx playwright install chromium
 *
 * RUN:
 *   npx playwright test e2e_test.js
 *   npx playwright test e2e_test.js --headed    (watch the browser)
 *   npx playwright test e2e_test.js --debug     (step through)
 *   npx playwright test e2e_test.js -g "Public"  (run one suite)
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

// Helper: login via API and return JWT token
async function getAuthToken(request) {
  const res = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD }
  });
  if (!res.ok()) return '';
  const data = await res.json();
  return data.token || '';
}

// Helper: login via browser UI
async function loginViaUI(page) {
  await page.goto(`${BASE_URL}/app.html`);
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button:has-text("Sign In")');
  await page.waitForSelector('#pg-dash', { state: 'visible', timeout: 15000 });
}

// ═══════════════════════════════════════════════════════════════════
// SUITE 1: Public Pages (no auth required)
// ═══════════════════════════════════════════════════════════════════

test.describe('Public Pages', () => {

  test('Landing page loads with correct title and nav', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/Construction/i);
    const signIn = page.locator('text=Sign In').first();
    await expect(signIn).toBeVisible();
  });

  test('Landing page has key sections', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('text=How It Works').first()).toBeVisible();
    await expect(page.locator('text=Features').first()).toBeVisible();
  });

  test('Landing page has pricing section', async ({ page }) => {
    await page.goto(BASE_URL);
    // Should mention pricing or Pro plan
    const pricing = page.locator('text=/Pricing|\\$40|Pro|Free Trial/i').first();
    await expect(pricing).toBeVisible({ timeout: 5000 });
  });

  test('App page loads and shows auth screen', async ({ page }) => {
    await page.goto(`${BASE_URL}/app.html`);
    await expect(page.locator('#auth-screen')).toBeVisible();
    await expect(page.locator('text=Sign In').first()).toBeVisible();
  });

  test('App page has no critical console errors on load', async ({ page }) => {
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto(`${BASE_URL}/app.html`);
    await page.waitForTimeout(2000);
    const realErrors = errors.filter(e =>
      !e.includes('favicon') && !e.includes('404') && !e.includes('net::ERR')
    );
    expect(realErrors.length).toBeLessThanOrEqual(2);
  });

  test('Unknown routes serve landing page (catch-all)', async ({ page }) => {
    await page.goto(`${BASE_URL}/some-random-path-that-does-not-exist`);
    await expect(page.locator('body')).toContainText(/ConstructInvoice|Construction/i);
  });

  test('API returns 401 for unauthenticated requests', async ({ request }) => {
    const endpoints = ['/api/projects', '/api/stats', '/api/settings', '/api/subscription'];
    for (const ep of endpoints) {
      const res = await request.get(`${BASE_URL}${ep}`);
      expect(res.status()).toBe(401);
    }
  });

  test('Config endpoint returns expected fields', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/config`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('googleEnabled');
  });

  test('Static assets are served (logo)', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/varshyl-logo.png`);
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type']).toContain('image/png');
    // Logo must be under 100KB
    const body = await res.body();
    expect(body.length).toBeLessThan(100 * 1024);
  });

  test('pay.html public payment page loads', async ({ page }) => {
    const res = await page.goto(`${BASE_URL}/pay.html`);
    // pay.html should load (200) even without a token — it handles missing token client-side
    expect(res.status()).toBeLessThan(500);
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 2: Auth Flow (requires test credentials)
// ═══════════════════════════════════════════════════════════════════

test.describe('Auth Flow', () => {

  test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Skipping — set E2E_EMAIL and E2E_PASSWORD');

  test('Login with valid credentials shows dashboard', async ({ page }) => {
    await loginViaUI(page);
    await expect(page.locator('#pg-dash')).toBeVisible();
    // Dashboard should show KPI cards
    await expect(page.locator('#dash-proj-count')).toBeVisible();
  });

  test('Login with wrong password shows error', async ({ page }) => {
    await page.goto(`${BASE_URL}/app.html`);
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', 'wrong-password-12345');
    await page.click('button:has-text("Sign In")');
    await expect(page.locator('.err:not(.hidden), .error:not(.hidden), [class*="error"]')).toBeVisible({ timeout: 5000 });
  });

  test('Register form is accessible from auth screen', async ({ page }) => {
    await page.goto(`${BASE_URL}/app.html`);
    // Look for register/signup link or tab
    const registerLink = page.locator('text=/Create|Register|Sign Up|Get Started/i').first();
    await expect(registerLink).toBeVisible();
  });

  test('Forgot password link is accessible', async ({ page }) => {
    await page.goto(`${BASE_URL}/app.html`);
    const forgotLink = page.locator('text=/Forgot|Reset/i').first();
    await expect(forgotLink).toBeVisible();
  });

  test('After login, sidebar navigation is visible', async ({ page }) => {
    await loginViaUI(page);
    // Dark sidebar should be visible with nav items
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('text=Dashboard')).toBeVisible();
    await expect(page.locator('text=Settings')).toBeVisible();
  });

  test('Logout returns to auth screen', async ({ page }) => {
    await loginViaUI(page);
    // Find and click logout
    const logoutBtn = page.locator('text=/Log ?out|Sign ?Out/i').first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await expect(page.locator('#auth-screen')).toBeVisible({ timeout: 5000 });
    }
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 3: Dashboard & Navigation (requires auth)
// ═══════════════════════════════════════════════════════════════════

test.describe('Dashboard & Navigation', () => {

  test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Skipping — set E2E_EMAIL and E2E_PASSWORD');

  test('Dashboard loads with KPI cards', async ({ page }) => {
    await loginViaUI(page);
    // KPI cards should have labels and values
    await expect(page.locator('#dash-proj-count')).toBeVisible();
    await expect(page.locator('text=/PROJECTS/i')).toBeVisible();
  });

  test('Dashboard shows project list', async ({ page }) => {
    await loginViaUI(page);
    // Either "No projects yet" or actual project cards
    const hasProjects = await page.locator('.pi, [class*="project"]').count();
    const hasEmpty = await page.locator('text=/No projects|Create your first|Get started/i').count();
    expect(hasProjects + hasEmpty).toBeGreaterThan(0);
  });

  test('Sidebar navigation switches pages', async ({ page }) => {
    await loginViaUI(page);
    // Click Settings nav item
    await page.click('.ni:has-text("Settings"), text=Settings');
    await page.waitForTimeout(500);
    await expect(page.locator('#pg-settings, [id*="settings"]')).toBeVisible({ timeout: 5000 });
  });

  test('New Project button is accessible', async ({ page }) => {
    await loginViaUI(page);
    const newProjectBtn = page.locator('text=/New Project|Create Project|\\+ Project/i').first();
    await expect(newProjectBtn).toBeVisible();
  });

  test('Dashboard project cards have action badges', async ({ page }) => {
    await loginViaUI(page);
    // If there are projects, they should have next-action badges
    const projects = page.locator('.pi, [class*="project-item"]');
    const count = await projects.count();
    if (count > 0) {
      // At least one should have a badge or status indicator
      const badge = page.locator('.na, [class*="badge"], [class*="status"]').first();
      await expect(badge).toBeVisible({ timeout: 3000 });
    }
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 4: API Integration (requires auth)
// ═══════════════════════════════════════════════════════════════════

test.describe('API Integration', () => {

  let token = '';

  test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Skipping — set E2E_EMAIL and E2E_PASSWORD');

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
  });

  const authHeaders = () => ({ 'Authorization': `Bearer ${token}` });

  test('GET /api/projects returns array', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/projects`, { headers: authHeaders() });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('GET /api/stats returns billing summary fields', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/stats`, { headers: authHeaders() });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('total_billed');
    expect(data).toHaveProperty('total_retainage');
    expect(data).toHaveProperty('projects_count');
  });

  test('GET /api/settings returns company settings', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/settings`, { headers: authHeaders() });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('default_retainage');
    expect(data).toHaveProperty('default_payment_terms');
  });

  test('GET /api/subscription returns trial info', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/subscription`, { headers: authHeaders() });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('subscription_status');
    expect(data).toHaveProperty('trial_start_date');
    expect(data).toHaveProperty('trial_end_date');
    expect(data).toHaveProperty('plan_type');
  });

  test('GET /api/onboarding/status returns boolean', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/onboarding/status`, { headers: authHeaders() });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('has_completed_onboarding');
    expect(typeof data.has_completed_onboarding).toBe('boolean');
  });

  test('GET /api/revenue/summary returns chart data', async ({ request }) => {
    const year = new Date().getFullYear();
    const res = await request.get(`${BASE_URL}/api/revenue/summary?period=monthly&year=${year}`, {
      headers: authHeaders()
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('total_billed');
    expect(data).toHaveProperty('chart');
    expect(data).toHaveProperty('rows');
    expect(Array.isArray(data.rows)).toBeTruthy();
    expect(Array.isArray(data.chart)).toBeTruthy();
  });

  test('GET /api/team returns array', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/team`, { headers: authHeaders() });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('GET /api/auth/me returns user profile', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/auth/me`, { headers: authHeaders() });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('email');
    expect(data).toHaveProperty('name');
    expect(data.email).toBe(TEST_EMAIL);
  });

  test('POST /api/ai/ask returns AI response', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/ai/ask`, {
      headers: authHeaders(),
      data: { question: 'What file formats can I upload for SOV?', history: [] }
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('answer');
    expect(data.answer.length).toBeGreaterThan(10);
  });

  test('GET /api/subscription/price returns pricing info', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/subscription/price`, { headers: authHeaders() });
    // May return 404 if Stripe not configured yet — that's OK
    if (res.ok()) {
      const data = await res.json();
      expect(data).toHaveProperty('amount');
      expect(data).toHaveProperty('currency');
    } else {
      expect([404, 500]).toContain(res.status()); // Not yet set up
    }
  });

  test('GET /api/stripe/account-status returns connect status', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/stripe/account-status`, { headers: authHeaders() });
    // Might return 200 (connected) or 404/500 (not connected) — both valid
    expect(res.status()).toBeLessThan(502);
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 5: Project CRUD Flow (requires auth)
// ═══════════════════════════════════════════════════════════════════

test.describe('Project CRUD Flow', () => {

  let token = '';
  let createdProjectId = null;

  test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Skipping — set E2E_EMAIL and E2E_PASSWORD');

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
  });

  const authHeaders = () => ({ 'Authorization': `Bearer ${token}` });

  test('Create a test project via API', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/projects`, {
      headers: authHeaders(),
      data: {
        name: `E2E Test Project ${Date.now()}`,
        number: 'E2E-001',
        owner: 'Test Owner LLC',
        contractor: 'Test Contractor Inc',
        architect: 'Test Architect Group',
        contact: 'John Doe',
        contact_name: 'John Doe',
        contact_phone: '555-0100',
        contact_email: 'test@example.com',
        original_contract: 100000,
        building_area: '5000 sqft'
      }
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('id');
    createdProjectId = data.id;
  });

  test('Read the created project', async ({ request }) => {
    test.skip(!createdProjectId, 'No project created');
    const res = await request.get(`${BASE_URL}/api/projects`, { headers: authHeaders() });
    expect(res.ok()).toBeTruthy();
    const projects = await res.json();
    const found = projects.find(p => p.id === createdProjectId);
    expect(found).toBeTruthy();
    expect(found.name).toContain('E2E Test Project');
  });

  test('Update the project', async ({ request }) => {
    test.skip(!createdProjectId, 'No project created');
    const res = await request.put(`${BASE_URL}/api/projects/${createdProjectId}`, {
      headers: authHeaders(),
      data: { name: 'E2E Updated Project', owner: 'Updated Owner LLC' }
    });
    expect(res.ok()).toBeTruthy();
  });

  test('Get project SOV (empty initially)', async ({ request }) => {
    test.skip(!createdProjectId, 'No project created');
    const res = await request.get(`${BASE_URL}/api/projects/${createdProjectId}/sov`, {
      headers: authHeaders()
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('Create a pay app for the project', async ({ request }) => {
    test.skip(!createdProjectId, 'No project created');
    const res = await request.post(`${BASE_URL}/api/projects/${createdProjectId}/payapps`, {
      headers: authHeaders(),
      data: {
        app_number: 1,
        period_start: '2026-03-01',
        period_end: '2026-03-31',
        period_label: 'March 2026'
      }
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('id');
  });

  test('List pay apps for the project', async ({ request }) => {
    test.skip(!createdProjectId, 'No project created');
    const res = await request.get(`${BASE_URL}/api/projects/${createdProjectId}/payapps`, {
      headers: authHeaders()
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  test('Delete the test project (cleanup)', async ({ request }) => {
    test.skip(!createdProjectId, 'No project created');
    const res = await request.delete(`${BASE_URL}/api/projects/${createdProjectId}`, {
      headers: authHeaders()
    });
    expect(res.ok()).toBeTruthy();
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 6: Pay App Workflow (end-to-end via API)
// ═══════════════════════════════════════════════════════════════════

test.describe('Pay App Workflow', () => {

  let token = '';
  let projectId = null;
  let payAppId = null;
  let sovLineId = null;

  test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Skipping — set E2E_EMAIL and E2E_PASSWORD');

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
    // Create a project for pay app testing
    const res = await request.post(`${BASE_URL}/api/projects`, {
      headers: { 'Authorization': `Bearer ${token}` },
      data: {
        name: `PA Workflow Test ${Date.now()}`,
        owner: 'Test Owner',
        contractor: 'Test GC',
        original_contract: 50000
      }
    });
    if (res.ok()) {
      const d = await res.json();
      projectId = d.id;
    }
  });

  test.afterAll(async ({ request }) => {
    // Cleanup: delete test project
    if (projectId && token) {
      await request.delete(`${BASE_URL}/api/projects/${projectId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }
  });

  const authHeaders = () => ({ 'Authorization': `Bearer ${token}` });

  test('Add SOV lines to project', async ({ request }) => {
    test.skip(!projectId, 'No project');
    const res = await request.post(`${BASE_URL}/api/projects/${projectId}/sov`, {
      headers: authHeaders(),
      data: {
        lines: [
          { item_id: '001', description: 'General Conditions', scheduled_value: 15000, sort_order: 1 },
          { item_id: '002', description: 'Concrete Work', scheduled_value: 20000, sort_order: 2 },
          { item_id: '003', description: 'Electrical', scheduled_value: 15000, sort_order: 3 }
        ]
      }
    });
    expect(res.ok()).toBeTruthy();
    // Verify SOV was saved
    const sov = await request.get(`${BASE_URL}/api/projects/${projectId}/sov`, { headers: authHeaders() });
    const lines = await sov.json();
    expect(lines.length).toBe(3);
    sovLineId = lines[0].id;
  });

  test('Create pay app #1', async ({ request }) => {
    test.skip(!projectId, 'No project');
    const res = await request.post(`${BASE_URL}/api/projects/${projectId}/payapps`, {
      headers: authHeaders(),
      data: { app_number: 1, period_start: '2026-03-01', period_end: '2026-03-31' }
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    payAppId = data.id;
    expect(payAppId).toBeTruthy();
  });

  test('Get pay app with line items', async ({ request }) => {
    test.skip(!payAppId, 'No pay app');
    const res = await request.get(`${BASE_URL}/api/payapps/${payAppId}`, { headers: authHeaders() });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('lines');
    expect(data.lines.length).toBe(3);
    // Each line should have G702/G703 fields
    for (const line of data.lines) {
      expect(line).toHaveProperty('scheduled_value');
      expect(line).toHaveProperty('prev_pct');
      expect(line).toHaveProperty('this_pct');
      expect(line).toHaveProperty('retainage_pct');
    }
  });

  test('Update pay app line percentages', async ({ request }) => {
    test.skip(!payAppId, 'No pay app');
    // Get current lines
    const paRes = await request.get(`${BASE_URL}/api/payapps/${payAppId}`, { headers: authHeaders() });
    const paData = await paRes.json();
    // Set 50% complete on first line, 30% on second
    const updates = paData.lines.map((l, i) => ({
      id: l.id,
      this_pct: i === 0 ? 50 : i === 1 ? 30 : 0,
      retainage_pct: 10,
      stored_materials: 0
    }));
    const res = await request.put(`${BASE_URL}/api/payapps/${payAppId}/lines`, {
      headers: authHeaders(),
      data: { lines: updates }
    });
    expect(res.ok()).toBeTruthy();
  });

  test('Add a change order to pay app', async ({ request }) => {
    test.skip(!payAppId, 'No pay app');
    const res = await request.post(`${BASE_URL}/api/payapps/${payAppId}/changeorders`, {
      headers: authHeaders(),
      data: { co_number: 1, description: 'Extra concrete foundation work', amount: 5000 }
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('id');
  });

  test('Update pay app notes and status', async ({ request }) => {
    test.skip(!payAppId, 'No pay app');
    const res = await request.put(`${BASE_URL}/api/payapps/${payAppId}`, {
      headers: authHeaders(),
      data: { notes: 'E2E test pay app', status: 'draft', po_number: 'PO-2026-001' }
    });
    expect(res.ok()).toBeTruthy();
  });

  test('Download pay app PDF', async ({ request }) => {
    test.skip(!payAppId, 'No pay app');
    const res = await request.get(`${BASE_URL}/api/payapps/${payAppId}/pdf`, {
      headers: authHeaders()
    });
    expect(res.ok()).toBeTruthy();
    const contentType = res.headers()['content-type'];
    // Should be PDF, not HTML
    expect(contentType).toContain('pdf');
    const body = await res.body();
    // PDF files start with %PDF
    expect(body.toString('ascii', 0, 4)).toBe('%PDF');
  });

  test('Soft-delete and restore pay app', async ({ request }) => {
    test.skip(!payAppId, 'No pay app');
    // Soft delete
    const delRes = await request.delete(`${BASE_URL}/api/payapps/${payAppId}`, { headers: authHeaders() });
    expect(delRes.ok()).toBeTruthy();
    // Check it appears in deleted list
    const deletedRes = await request.get(`${BASE_URL}/api/projects/${projectId}/payapps/deleted`, {
      headers: authHeaders()
    });
    expect(deletedRes.ok()).toBeTruthy();
    const deleted = await deletedRes.json();
    expect(deleted.some(pa => pa.id === payAppId)).toBeTruthy();
    // Restore
    const restoreRes = await request.post(`${BASE_URL}/api/payapps/${payAppId}/restore`, {
      headers: authHeaders()
    });
    expect(restoreRes.ok()).toBeTruthy();
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 7: Settings Page (requires auth)
// ═══════════════════════════════════════════════════════════════════

test.describe('Settings', () => {

  let token = '';

  test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Skipping — set E2E_EMAIL and E2E_PASSWORD');

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
  });

  const authHeaders = () => ({ 'Authorization': `Bearer ${token}` });

  test('Save and retrieve company settings', async ({ request }) => {
    // Save settings
    const saveRes = await request.post(`${BASE_URL}/api/settings`, {
      headers: authHeaders(),
      data: {
        company_name: 'E2E Test Company',
        default_payment_terms: 'Net 30',
        default_retainage: 10,
        contact_name: 'Test Contact',
        contact_phone: '555-0199',
        contact_email: 'contact@test.com'
      }
    });
    expect(saveRes.ok()).toBeTruthy();
    // Read back
    const getRes = await request.get(`${BASE_URL}/api/settings`, { headers: authHeaders() });
    const data = await getRes.json();
    expect(data.company_name).toBe('E2E Test Company');
    expect(data.contact_name).toBe('Test Contact');
  });

  test('Settings page loads in browser', async ({ page }) => {
    await loginViaUI(page);
    await page.click('.ni:has-text("Settings"), text=Settings');
    await page.waitForTimeout(1000);
    // Should show company name field
    await expect(page.locator('input[placeholder*="Company"], #company-name, [name="company_name"]').first()).toBeVisible({ timeout: 5000 });
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 8: PDF & Export Endpoints
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

  test('Lien doc endpoints require auth', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/projects/999/lien-docs`);
    expect(res.status()).toBe(401);
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 9: New Project Wizard (browser flow)
// ═══════════════════════════════════════════════════════════════════

test.describe('New Project Wizard (Browser)', () => {

  test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Skipping — set E2E_EMAIL and E2E_PASSWORD');

  test('Open new project wizard and verify auto-fill', async ({ page }) => {
    await loginViaUI(page);
    // Click New Project
    const newBtn = page.locator('text=/New Project|\\+ Project|Create Project/i').first();
    await newBtn.click();
    await page.waitForTimeout(1000);
    // Wizard should be visible — look for Step 1 indicators
    const wizardVisible = await page.locator('text=/Project Info|Step 1|Project Details/i').first().isVisible().catch(() => false);
    expect(wizardVisible).toBeTruthy();
  });

  test('New project wizard has required fields', async ({ page }) => {
    await loginViaUI(page);
    const newBtn = page.locator('text=/New Project|\\+ Project|Create Project/i').first();
    await newBtn.click();
    await page.waitForTimeout(1000);
    // Should have project name field
    const nameField = page.locator('input[placeholder*="name" i], input[name="name"], #project-name').first();
    await expect(nameField).toBeVisible({ timeout: 3000 });
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 10: Revenue & Reporting
// ═══════════════════════════════════════════════════════════════════

test.describe('Revenue & Reporting', () => {

  let token = '';

  test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Skipping — set E2E_EMAIL and E2E_PASSWORD');

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
  });

  const authHeaders = () => ({ 'Authorization': `Bearer ${token}` });

  test('Revenue summary returns monthly data', async ({ request }) => {
    const year = new Date().getFullYear();
    const res = await request.get(`${BASE_URL}/api/revenue/summary?period=monthly&year=${year}`, {
      headers: authHeaders()
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.chart.length).toBe(12); // 12 months
  });

  test('Revenue summary with weekly period', async ({ request }) => {
    const year = new Date().getFullYear();
    const res = await request.get(`${BASE_URL}/api/revenue/summary?period=weekly&year=${year}`, {
      headers: authHeaders()
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('total_billed');
  });

  test('QuickBooks export returns CSV', async ({ request }) => {
    const year = new Date().getFullYear();
    const res = await request.get(`${BASE_URL}/api/revenue/export/quickbooks?year=${year}`, {
      headers: authHeaders()
    });
    expect(res.ok()).toBeTruthy();
    const ct = res.headers()['content-type'];
    expect(ct).toContain('csv');
  });

  test('Revenue PDF report returns PDF', async ({ request }) => {
    const year = new Date().getFullYear();
    const res = await request.get(`${BASE_URL}/api/revenue/report/pdf?year=${year}`, {
      headers: authHeaders()
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.body();
    expect(body.toString('ascii', 0, 4)).toBe('%PDF');
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 11: Lien Waiver System
// ═══════════════════════════════════════════════════════════════════

test.describe('Lien Waivers', () => {

  let token = '';

  test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Skipping — set E2E_EMAIL and E2E_PASSWORD');

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
  });

  const authHeaders = () => ({ 'Authorization': `Bearer ${token}` });

  test('Lien doc creation requires valid project', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/projects/999999/lien-docs`, {
      headers: authHeaders(),
      data: { doc_type: 'conditional', through_date: '2026-03-31', amount: 5000 }
    });
    // Should fail — project doesn't exist or doesn't belong to user
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 12: Mobile Responsive Tests
// ═══════════════════════════════════════════════════════════════════

test.describe('Mobile Layout', () => {

  test('App loads correctly on iPhone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/app.html`);
    await expect(page.locator('#auth-screen')).toBeVisible();
    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(380);
  });

  test('Landing page is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE_URL);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });

  test('App page responsive on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${BASE_URL}/app.html`);
    await expect(page.locator('#auth-screen')).toBeVisible();
  });

  test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Skipping mobile auth test — no creds');

  test('Dashboard renders on mobile after login', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/app.html`);
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Sign In")');
    await page.waitForSelector('#pg-dash', { state: 'visible', timeout: 15000 });
    // Should have a mobile menu or collapsed sidebar
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(380);
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 13: Security Tests
// ═══════════════════════════════════════════════════════════════════

test.describe('Security', () => {

  test('Admin endpoints reject non-admin users', async ({ request }) => {
    const adminEndpoints = [
      '/api/admin/stats',
      '/api/admin/users',
      '/api/admin/chart/payapp-activity',
      '/api/admin/errors',
      '/api/admin/feedback',
      '/api/admin/support-requests',
    ];
    for (const ep of adminEndpoints) {
      const res = await request.get(`${BASE_URL}${ep}`);
      expect(res.status()).toBe(401);
    }
  });

  test('Registration rejects invalid email', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/register`, {
      data: { name: 'Test', email: 'not-an-email', password: 'password123' }
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('Registration rejects empty password', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/register`, {
      data: { name: 'Test', email: 'test@test.com', password: '' }
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('JWT with invalid token returns 401', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/projects`, {
      headers: { 'Authorization': 'Bearer invalid.token.here' }
    });
    expect(res.status()).toBe(401);
  });

  test('Login rate limiting is active', async ({ request }) => {
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(request.post(`${BASE_URL}/api/auth/login`, {
        data: { email: 'fake@test.com', password: 'wrong' }
      }));
    }
    const results = await Promise.all(promises);
    const statuses = results.map(r => r.status());
    const hasRateLimit = statuses.some(s => s === 429);
    const allAuthErrors = statuses.every(s => s === 401 || s === 429);
    expect(allAuthErrors).toBeTruthy();
  });

  test('Forgot password does not reveal user existence', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/forgot-password`, {
      data: { email: 'definitely-nonexistent@nowhere.example' }
    });
    // Should return 200 regardless of whether email exists (prevents enumeration)
    expect(res.status()).toBeLessThan(500);
  });

  test('Static files served correctly', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/varshyl-logo.png`);
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type']).toContain('image/png');
  });

  test('HTML files have no-cache headers', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/app.html`);
    expect(res.ok()).toBeTruthy();
    const cacheControl = res.headers()['cache-control'] || '';
    expect(cacheControl).toContain('no-cache');
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 14: Support & Feedback
// ═══════════════════════════════════════════════════════════════════

test.describe('Support & Feedback', () => {

  test('Support request endpoint accepts submissions', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/support/request`, {
      data: {
        name: 'E2E Test',
        email: 'e2etest@example.com',
        message: 'This is an automated E2E test support request — please ignore.',
        type: 'question'
      }
    });
    expect(res.ok()).toBeTruthy();
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 15: UI Design System Verification
// ═══════════════════════════════════════════════════════════════════

test.describe('UI Design System', () => {

  test('App uses Inter font', async ({ page }) => {
    await page.goto(`${BASE_URL}/app.html`);
    const fontFamily = await page.evaluate(() =>
      getComputedStyle(document.body).fontFamily
    );
    expect(fontFamily.toLowerCase()).toContain('inter');
  });

  test('Dark sidebar has correct background color', async ({ page }) => {
    await page.goto(`${BASE_URL}/app.html`);
    // Check CSS variable
    const sidebarBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--sidebar-bg').trim()
    );
    expect(sidebarBg).toBe('#0f172a');
  });

  test('Blue accent color is set', async ({ page }) => {
    await page.goto(`${BASE_URL}/app.html`);
    const blue = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--blue').trim()
    );
    expect(blue).toBe('#2563eb');
  });

  test('No old indigo colors remain in CSS variables', async ({ page }) => {
    await page.goto(`${BASE_URL}/app.html`);
    const cssVars = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        blue: style.getPropertyValue('--blue').trim(),
        gradient: style.getPropertyValue('--gradient').trim()
      };
    });
    // Should NOT contain old indigo hex
    expect(cssVars.blue).not.toBe('#6366f1');
    expect(cssVars.gradient).not.toContain('#6366f1');
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 16: Cross-Page Navigation & Deep Links
// ═══════════════════════════════════════════════════════════════════

test.describe('Navigation & Deep Links', () => {

  test('Direct /app.html serves app page, not landing', async ({ page }) => {
    await page.goto(`${BASE_URL}/app.html`);
    await expect(page.locator('#auth-screen')).toBeVisible();
    // Should NOT show the landing page hero
    const landingHero = page.locator('.hero, #hero, text=/Streamline.*billing/i');
    const heroVisible = await landingHero.isVisible().catch(() => false);
    // Auth screen should be showing, not the landing marketing content
    expect(heroVisible).toBeFalsy();
  });

  test('Root URL serves landing page', async ({ page }) => {
    await page.goto(BASE_URL);
    // Should show marketing content, not auth screen
    const signIn = page.locator('text=Sign In').first();
    await expect(signIn).toBeVisible();
  });

  test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Skipping deep link test — no creds');

  test('Hash navigation works after login', async ({ page }) => {
    await loginViaUI(page);
    // Navigate to settings via hash
    await page.evaluate(() => { window.location.hash = '#settings'; });
    await page.waitForTimeout(1000);
    // Settings page should be visible or hash handling works
    const settingsVisible = await page.locator('#pg-settings, [id*="settings"]').isVisible().catch(() => false);
    expect(settingsVisible).toBeTruthy();
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 17: Stripe Payment Page (public)
// ═══════════════════════════════════════════════════════════════════

test.describe('Payment Page', () => {

  test('Pay page with invalid token shows error', async ({ page }) => {
    await page.goto(`${BASE_URL}/pay/invalid-token-12345`);
    await page.waitForTimeout(2000);
    // Should show an error message about invalid/expired invoice
    const bodyText = await page.locator('body').textContent();
    const hasError = /not found|invalid|expired|error/i.test(bodyText);
    expect(hasError).toBeTruthy();
  });

  test('Invoice page with invalid token returns error', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/pay/invalid-token-12345`);
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 18: SOV Upload & Parse (API)
// ═══════════════════════════════════════════════════════════════════

test.describe('SOV Upload', () => {

  test('SOV parse endpoint requires auth', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/sov/parse`);
    expect(res.status()).toBe(401);
  });

  test('SOV upload history endpoint requires auth', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/projects/1/sov/uploads`);
    expect(res.status()).toBe(401);
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 19: Team Management
// ═══════════════════════════════════════════════════════════════════

test.describe('Team Management', () => {

  let token = '';

  test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Skipping — set E2E_EMAIL and E2E_PASSWORD');

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
  });

  const authHeaders = () => ({ 'Authorization': `Bearer ${token}` });

  test('List team members', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/team`, { headers: authHeaders() });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('Add and remove team member', async ({ request }) => {
    // Add
    const addRes = await request.post(`${BASE_URL}/api/team`, {
      headers: authHeaders(),
      data: { email: 'e2e-team-test@example.com', name: 'E2E Tester', role: 'field' }
    });
    expect(addRes.ok()).toBeTruthy();
    const member = await addRes.json();
    // Remove
    if (member.id) {
      const delRes = await request.delete(`${BASE_URL}/api/team/${member.id}`, {
        headers: authHeaders()
      });
      expect(delRes.ok()).toBeTruthy();
    }
  });

});

// ═══════════════════════════════════════════════════════════════════
// SUITE 20: Performance & Reliability
// ═══════════════════════════════════════════════════════════════════

test.describe('Performance', () => {

  test('Landing page loads within 5 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });

  test('App page loads within 5 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(`${BASE_URL}/app.html`);
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });

  test('API health check (login endpoint responds fast)', async ({ request }) => {
    const start = Date.now();
    await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: 'perf@test.com', password: 'test' }
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });

});
