/**
 * Construction AI Billing — Full E2E Test Suite
 * Tests against: https://constructinv.varshyl.com (prod) or staging
 *
 * Set TEST_BASE_URL environment variable before running.
 * Default: https://construction-ai-billing-staging.up.railway.app
 *
 * Usage:
 *   TEST_BASE_URL=https://constructinv.varshyl.com npx playwright test construction-billing.spec.ts
 */

import { test, expect, Page } from '@playwright/test';
import * as path from 'path';

const BASE = process.env.TEST_BASE_URL || 'https://construction-ai-billing-staging.up.railway.app';
const APP = `${BASE}/app.html`;

// Test credentials (staging only — do NOT use prod credentials here)
const TEST_EMAIL = process.env.TEST_USER_EMAIL || `e2e+${Date.now()}@test.constructinv.com`;
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'TestE2E_Pass123!';
const EXISTING_EMAIL = process.env.EXISTING_TEST_EMAIL || 'mike.rodriguez.test@constructinv.com';
const EXISTING_PASSWORD = 'TestPass123!';

// ============================================================================
// HELPERS
// ============================================================================

async function login(page: Page, email = EXISTING_EMAIL, password = EXISTING_PASSWORD) {
  await page.goto(APP);
  await page.waitForLoadState('networkidle');

  // App might show landing or auth screen
  const signInBtn = page.getByRole('button', { name: /sign in/i }).first();
  if (await signInBtn.isVisible()) {
    await signInBtn.click();
  }

  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();

  // Wait for app to load
  await page.waitForURL(/app\.html/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

async function getAuthToken(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('token'));
}

// ============================================================================
// SMOKE TESTS — Quick health check
// ============================================================================

test.describe('Smoke Tests', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/ConstructInvoice|Varshyl/i);
    // Landing page should have sign in + get started
    await expect(page.getByRole('link', { name: /sign in|get started/i }).first()).toBeVisible();
  });

  test('app.html loads login screen', async ({ page }) => {
    await page.goto(APP);
    await page.waitForLoadState('networkidle');
    // Should show auth or be redirected to login
    const hasSignIn = await page.getByText(/sign in|log in|welcome/i).first().isVisible();
    expect(hasSignIn).toBe(true);
  });

  test('API health — settings endpoint requires auth', async ({ page }) => {
    const response = await page.goto(`${BASE}/api/settings`);
    expect(response?.status()).toBe(401);
  });

  test('pay.html is accessible without auth', async ({ page }) => {
    // pay.html is public — should load without crashing (even with invalid token)
    const response = await page.goto(`${BASE}/pay/invalid-token-test`);
    // Should return 200 (the page itself loads), or redirect to app
    expect([200, 302, 404]).toContain(response?.status());
  });
});

// ============================================================================
// AUTH FLOWS
// ============================================================================

test.describe('Authentication', () => {
  test('login with valid credentials', async ({ page }) => {
    await login(page);
    // Should be on app with dashboard visible
    const token = await getAuthToken(page);
    expect(token).toBeTruthy();
    // App should show projects list or dashboard
    await expect(page.getByText(/project|dashboard|new project/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('login with invalid password shows error', async ({ page }) => {
    await page.goto(APP);
    await page.waitForLoadState('networkidle');

    const signInBtn = page.getByRole('button', { name: /sign in/i }).first();
    if (await signInBtn.isVisible()) await signInBtn.click();

    await page.getByPlaceholder(/email/i).fill(EXISTING_EMAIL);
    await page.getByPlaceholder(/password/i).fill('WrongPassword999!');
    await page.getByRole('button', { name: /sign in|log in/i }).click();

    // Should show error message
    await expect(page.getByText(/invalid|incorrect|wrong|failed/i).first()).toBeVisible({ timeout: 5000 });

    // Should NOT have a token
    const token = await getAuthToken(page);
    expect(token).toBeFalsy();
  });

  test('protected API routes reject unauthenticated requests', async ({ page }) => {
    const routes = ['/api/projects', '/api/settings', '/api/payments'];
    for (const route of routes) {
      const response = await page.request.get(`${BASE}${route}`);
      expect(response.status()).toBe(401);
    }
  });

  test('logout clears session', async ({ page }) => {
    await login(page);
    const tokenBefore = await getAuthToken(page);
    expect(tokenBefore).toBeTruthy();

    // Find and click logout
    const logoutBtn = page.getByRole('button', { name: /log out|sign out/i });
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
    } else {
      // Try menu/avatar dropdown
      await page.locator('[data-testid="user-menu"], .user-avatar, .avatar').first().click();
      await page.getByRole('menuitem', { name: /log out|sign out/i }).click();
    }

    // Token should be gone
    const tokenAfter = await getAuthToken(page);
    expect(tokenAfter).toBeFalsy();
  });
});

// ============================================================================
// PROJECTS — CRUD
// ============================================================================

test.describe('Projects', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('can view projects list', async ({ page }) => {
    // After login, projects list should be visible
    await expect(page.getByText(/projects|no projects yet/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('API: GET /api/projects returns array', async ({ page }) => {
    const token = await getAuthToken(page);
    const response = await page.request.get(`${BASE}/api/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('API: POST /api/projects creates project', async ({ page }) => {
    const token = await getAuthToken(page);
    const projectName = `E2E Test Project ${Date.now()}`;

    const response = await page.request.post(`${BASE}/api/projects`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        name: projectName,
        original_contract: 100000,
        payment_terms: 'Net 30',
        default_retainage: 10,
      },
    });

    expect(response.status()).toBe(200);
    const project = await response.json();
    expect(project.name).toBe(projectName);
    expect(project.id).toBeTruthy();

    // Cleanup
    await page.request.delete(`${BASE}/api/projects/${project.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });
});

// ============================================================================
// PAY APPLICATIONS
// ============================================================================

test.describe('Pay Applications', () => {
  let projectId: number;
  let token: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page);
    token = (await getAuthToken(page))!;

    // Create test project
    const resp = await page.request.post(`${BASE}/api/projects`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { name: `PATest_${Date.now()}`, original_contract: 50000 },
    });
    const proj = await resp.json();
    projectId = proj.id;

    // Add SOV lines
    await page.request.post(`${BASE}/api/projects/${projectId}/sov`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        lines: [
          { description: 'Foundation Work', scheduled_value: 15000 },
          { description: 'Framing', scheduled_value: 20000 },
          { description: 'Roofing', scheduled_value: 15000 },
        ],
      },
    });
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!projectId || !token) return;
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.request.delete(`${BASE}/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await context.close();
  });

  test('can create a pay application', async ({ page }) => {
    await login(page);
    const t = await getAuthToken(page);

    const resp = await page.request.post(`${BASE}/api/projects/${projectId}/pay-apps`, {
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      data: { period_label: 'January 2026' },
    });
    expect(resp.status()).toBe(200);
    const pa = await resp.json();
    expect(pa.id).toBeTruthy();
    expect(pa.project_id).toBe(projectId);
  });

  test('PDF download returns PDF content-type, not HTML', async ({ page }) => {
    // This tests the critical regression: PDF returning text/html
    await login(page);
    const t = await getAuthToken(page);

    // Get pay apps for the project
    const resp = await page.request.get(`${BASE}/api/projects/${projectId}/pay-apps`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    expect(resp.status()).toBe(200);
    const payApps = await resp.json();

    if (payApps.length === 0) {
      // Create one
      const paResp = await page.request.post(`${BASE}/api/projects/${projectId}/pay-apps`, {
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        data: { period_label: 'February 2026' },
      });
      payApps.push(await paResp.json());
    }

    const payAppId = payApps[0].id;

    // Download PDF
    const pdfResp = await page.request.get(`${BASE}/api/pay-apps/${payAppId}/pdf`, {
      headers: { Authorization: `Bearer ${t}` },
    });

    expect(pdfResp.status()).toBe(200);
    const contentType = pdfResp.headers()['content-type'];
    // CRITICAL: must be PDF, not HTML
    expect(contentType).toContain('application/pdf');
    expect(contentType).not.toContain('text/html');
  });
});

// ============================================================================
// SETTINGS — REGRESSION: Partial save must not wipe other fields
// ============================================================================

test.describe('Settings — no field wipe regression', () => {
  test('saving company profile does not wipe contact fields', async ({ page }) => {
    await login(page);
    const token = await getAuthToken(page);

    // Set initial state with ALL fields
    const initResp = await page.request.post(`${BASE}/api/settings`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        company_name: 'E2E Test Company',
        contact_name: 'John E2E',
        contact_phone: '555-0100',
        contact_email: 'john@e2etest.com',
        default_payment_terms: 'Net 30',
        default_retainage: 10,
      },
    });
    expect(initResp.status()).toBe(200);

    // Now save ONLY company profile fields (simulates clicking "Save" on just that section)
    const profileOnlyResp = await page.request.post(`${BASE}/api/settings`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        company_name: 'Updated Company Name',
        default_payment_terms: 'Net 30',
        default_retainage: 10,
        // Note: contact fields NOT included — simulating partial save
      },
    });
    expect(profileOnlyResp.status()).toBe(200);

    // Verify contact fields were NOT wiped
    const getResp = await page.request.get(`${BASE}/api/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const settings = await getResp.json();

    expect(settings.company_name).toBe('Updated Company Name');
    // These must still be present — the regression was these getting wiped
    expect(settings.contact_name).toBe('John E2E');
    expect(settings.contact_phone).toBe('555-0100');
    expect(settings.contact_email).toBe('john@e2etest.com');
  });

  test('saving contact info does not wipe company name', async ({ page }) => {
    await login(page);
    const token = await getAuthToken(page);

    // Set company name
    await page.request.post(`${BASE}/api/settings`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { company_name: 'ABC Contractors', default_payment_terms: 'Net 30', default_retainage: 10 },
    });

    // Save only contact info
    const resp = await page.request.post(`${BASE}/api/settings`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { contact_name: 'Jane Smith', contact_phone: '555-9999', contact_email: 'jane@abc.com' },
    });
    expect(resp.status()).toBe(200);

    // Company name should still be there
    const getResp = await page.request.get(`${BASE}/api/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const settings = await getResp.json();
    expect(settings.company_name).toBe('ABC Contractors');
    expect(settings.contact_name).toBe('Jane Smith');
  });
});

// ============================================================================
// CHANGE ORDERS
// ============================================================================

test.describe('Change Orders', () => {
  let projectId: number;
  let token: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page);
    token = (await getAuthToken(page))!;
    const resp = await page.request.post(`${BASE}/api/projects`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { name: `CO_Test_${Date.now()}`, original_contract: 100000 },
    });
    projectId = (await resp.json()).id;
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!projectId || !token) return;
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.request.delete(`${BASE}/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await context.close();
  });

  test('creating change order auto-numbers and defaults to active', async ({ page }) => {
    await login(page);
    const t = await getAuthToken(page);

    const resp = await page.request.post(`${BASE}/api/projects/${projectId}/change-orders`, {
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      data: { description: 'Additional foundation work', amount: 5000 },
    });

    expect(resp.status()).toBe(200);
    const co = await resp.json();

    // Must have a number (regression: was defaulting to pending with no number)
    expect(co.co_number).toBeTruthy();
    expect(typeof co.co_number === 'string' || typeof co.co_number === 'number').toBe(true);

    // Must default to 'active', not 'pending'
    expect(co.status).toBe('active');
    expect(co.amount).toBe(5000);
  });

  test('second change order increments number', async ({ page }) => {
    await login(page);
    const t = await getAuthToken(page);

    const resp1 = await page.request.post(`${BASE}/api/projects/${projectId}/change-orders`, {
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      data: { description: 'First CO', amount: 1000 },
    });
    const co1 = await resp1.json();

    const resp2 = await page.request.post(`${BASE}/api/projects/${projectId}/change-orders`, {
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      data: { description: 'Second CO', amount: 2000 },
    });
    const co2 = await resp2.json();

    // Second CO number should be greater than first
    const num1 = parseInt(String(co1.co_number));
    const num2 = parseInt(String(co2.co_number));
    expect(num2).toBeGreaterThan(num1);
  });
});

// ============================================================================
// RECONCILIATION
// ============================================================================

test.describe('Reconciliation', () => {
  test('reconciliation endpoint returns expected shape', async ({ page }) => {
    await login(page);
    const token = await getAuthToken(page);

    // Get a project
    const projResp = await page.request.get(`${BASE}/api/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const projects = await projResp.json();

    if (projects.length === 0) {
      test.skip(true, 'No projects to test reconciliation against');
      return;
    }

    const projectId = projects[0].id;
    const resp = await page.request.get(`${BASE}/api/projects/${projectId}/reconciliation`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(resp.status()).toBe(200);
    const data = await resp.json();

    // Should have summary object
    expect(data.summary).toBeDefined();
    expect(typeof data.summary.total_billed).toBe('number');
    expect(typeof data.summary.total_paid).toBe('number');
    expect(typeof data.summary.total_outstanding).toBe('number');
    expect(typeof data.summary.is_fully_reconciled).toBe('boolean');

    // Outstanding should equal billed minus paid (within rounding)
    const expected = data.summary.total_billed - data.summary.total_paid;
    const actual = data.summary.total_outstanding;
    expect(Math.abs(actual - expected)).toBeLessThan(0.02); // $0.02 tolerance
  });
});

// ============================================================================
// PROJECT COMPLETE / REOPEN
// ============================================================================

test.describe('Job Complete / Reopen', () => {
  let projectId: number;
  let token: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page);
    token = (await getAuthToken(page))!;
    const resp = await page.request.post(`${BASE}/api/projects`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { name: `Complete_Test_${Date.now()}`, original_contract: 50000 },
    });
    projectId = (await resp.json()).id;
    await context.close();
  });

  test('complete project API returns JSON not HTML', async ({ page }) => {
    // This is the critical regression: endpoint was returning text/html
    await login(page);
    const t = await getAuthToken(page);

    const resp = await page.request.post(`${BASE}/api/projects/${projectId}/complete`, {
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      data: {},
    });

    // Must be JSON, NOT HTML
    const contentType = resp.headers()['content-type'];
    expect(contentType).toContain('application/json');
    expect(contentType).not.toContain('text/html');
    expect(resp.status()).toBe(200);

    const data = await resp.json();
    expect(data.status).toBe('completed');
  });

  test('reopen project works after completing', async ({ page }) => {
    await login(page);
    const t = await getAuthToken(page);

    const resp = await page.request.post(`${BASE}/api/projects/${projectId}/reopen`, {
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      data: {},
    });

    expect(resp.status()).toBe(200);
    const contentType = resp.headers()['content-type'];
    expect(contentType).toContain('application/json');

    const data = await resp.json();
    expect(data.status).toBe('active');
  });
});

// ============================================================================
// MANUAL PAYMENTS
// ============================================================================

test.describe('Manual Payments', () => {
  test('record payment API accepts check payments', async ({ page }) => {
    await login(page);
    const token = await getAuthToken(page);

    // Get a project with a pay app
    const projResp = await page.request.get(`${BASE}/api/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const projects = await projResp.json();
    if (projects.length === 0) {
      test.skip(true, 'No projects available');
      return;
    }

    const projectId = projects[0].id;
    const paResp = await page.request.get(`${BASE}/api/projects/${projectId}/pay-apps`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payApps = await paResp.json();
    if (!payApps || payApps.length === 0) {
      test.skip(true, 'No pay apps available');
      return;
    }

    const payAppId = payApps[0].id;
    const resp = await page.request.post(
      `${BASE}/api/projects/${projectId}/pay-apps/${payAppId}/record-payment`,
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: {
          amount: 1000,
          payment_method: 'check',
          check_number: 'E2E-1234',
          notes: 'E2E test payment',
        },
      }
    );

    // Should succeed
    expect(resp.status()).toBe(200);
    const data = await resp.json();
    expect(data.ok || data.id).toBeTruthy();
  });
});
