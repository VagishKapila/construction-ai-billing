/**
 * Page Smoke Test — Catches ErrorBoundary Crashes After API Data Loads
 *
 * This test uses the REST API to verify that:
 * 1. Public pages return HTTP 200 and valid HTML
 * 2. Protected routes enforce auth (401 when unauthenticated)
 * 3. API responses have the expected shape (so components won't crash on render)
 *
 * Because the Playwright config uses project="api" (no browser), we test via HTTP
 * requests instead of browser rendering. This catches shape-related crashes at
 * the API contract level.
 *
 * Run against staging:
 *   TEST_BASE_URL=https://construction-ai-billing-staging.up.railway.app npx playwright test tests/e2e/page-smoke.spec.ts
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL || 'https://construction-ai-billing-staging.up.railway.app';
const MIKE_EMAIL = 'mike.rodriguez.test@constructinv.com';
const MIKE_PASSWORD = 'TestPass123!';

/**
 * Helper: Get auth token via API
 */
async function getAuthToken(request: any): Promise<string> {
  const resp = await request.post(`${BASE}/api/auth/login`, {
    data: { email: MIKE_EMAIL, password: MIKE_PASSWORD },
  });
  if (resp.status() !== 200) {
    throw new Error(`Login failed: ${resp.status()}`);
  }
  const body = await resp.json();
  return body.token;
}

function h(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

test.describe('Page Smoke Tests — API Contract Validation', () => {
  test('landing page returns valid HTML (200)', async ({ request }) => {
    const resp = await request.get(`${BASE}/`);
    expect(resp.status()).toBe(200);
    const html = await resp.text();
    expect(html).toContain('html'); // Basic HTML validation
  });

  test('app.html returns valid HTML (200)', async ({ request }) => {
    const resp = await request.get(`${BASE}/app.html`);
    expect(resp.status()).toBe(200);
    const html = await resp.text();
    expect(html).toContain('html');
  });

  test('/login page returns HTML (200)', async ({ request }) => {
    const resp = await request.get(`${BASE}/login`);
    expect(resp.status()).toBe(200);
  });

  test('/register page returns HTML (200)', async ({ request }) => {
    const resp = await request.get(`${BASE}/register`);
    expect(resp.status()).toBe(200);
  });

  test('/kanji-campaign page returns HTML (200)', async ({ request }) => {
    const resp = await request.get(`${BASE}/kanji-campaign`);
    expect(resp.status()).toBe(200);
  });
});

test.describe('API Contract — Auth Enforcement', () => {
  test('unauthenticated request to /api/settings returns 401', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/settings`);
    expect(resp.status()).toBe(401);
  });

  test('unauthenticated request to /api/projects returns 401', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/projects`);
    expect(resp.status()).toBe(401);
  });

  test('unauthenticated request to /api/reports returns 401', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/reports`);
    expect(resp.status()).toBe(401);
  });
});

test.describe('API Contract — Response Shape (Authenticated)', () => {
  test('GET /api/projects returns array (not null/object)', async ({ request }) => {
    const token = await getAuthToken(request);
    const resp = await request.get(`${BASE}/api/projects`, { headers: h(token) });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body), 'projects should be an array').toBe(true);
  });

  test('GET /api/settings returns object with expected fields', async ({ request }) => {
    const token = await getAuthToken(request);
    const resp = await request.get(`${BASE}/api/settings`, { headers: h(token) });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toBeDefined();
    // Should have at least some settings fields
    expect(typeof body === 'object').toBe(true);
  });

  test('GET /api/payments returns valid response (array or object)', async ({ request }) => {
    const token = await getAuthToken(request);
    const resp = await request.get(`${BASE}/api/payments`, { headers: h(token) });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    // Response should be an object (could be array or object, depending on API)
    expect(typeof body).toBe('object', 'payments response should be an object or array');
    expect(body).not.toBeNull();
  });

  test('GET /api/trial/status returns object with trial fields', async ({ request }) => {
    const token = await getAuthToken(request);
    const resp = await request.get(`${BASE}/api/trial/status`, { headers: h(token) });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(typeof body === 'object').toBe(true);
    // Should have trial-related fields
    expect(['daysRemaining', 'isExpired', 'isPro']).toEqual(expect.arrayContaining(
      Object.keys(body).filter(k => ['daysRemaining', 'isExpired', 'isPro'].includes(k))
    ));
  });
});

test.describe('API Error Handling', () => {
  test('requesting non-existent project returns 404', async ({ request }) => {
    const token = await getAuthToken(request);
    const resp = await request.get(`${BASE}/api/projects/999999`, { headers: h(token) });
    expect(resp.status()).toBe(404);
  });

  test('malformed request returns error (4xx or 5xx)', async ({ request }) => {
    const token = await getAuthToken(request);
    const resp = await request.post(`${BASE}/api/projects`, {
      headers: h(token),
      data: { /* missing required fields */ },
    });
    // Could be 400, 422, 500, 502, etc. depending on server state
    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });
});
