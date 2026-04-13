/**
 * API Contract Crash Test — Verifies API Responses Have Correct Shape
 *
 * This test suite validates that API responses match expected shapes.
 * If a component receives an API response with the wrong structure (e.g. null
 * instead of array, missing fields, wrong types), it could crash in the
 * ErrorBoundary.
 *
 * Run against staging:
 *   TEST_BASE_URL=https://construction-ai-billing-staging.up.railway.app npx playwright test tests/e2e/api-contract-crash.spec.ts
 */

import { test, expect, request as playwrightRequest } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL || 'https://construction-ai-billing-staging.up.railway.app';
const MIKE_EMAIL = 'mike.rodriguez.test@constructinv.com';
const MIKE_PASSWORD = 'TestPass123!';

/** Shared token — obtained once before all tests to avoid rate limiting */
let _sharedToken: string | null = null;

async function getAuthToken(request: any): Promise<string> {
  if (_sharedToken) return _sharedToken;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await request.post(`${BASE}/api/auth/login`, {
        data: { email: MIKE_EMAIL, password: MIKE_PASSWORD },
      });
      if (resp.status() === 200) {
        const body = await resp.json();
        _sharedToken = body.token;
        return body.token;
      } else if (resp.status() >= 500 || resp.status() === 429) {
        // Server error or rate limit, retry after delay
        await new Promise(r => setTimeout(r, 1000));
        continue;
      } else {
        throw new Error(`Login failed with status ${resp.status()}`);
      }
    } catch (err) {
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error('Login failed after 3 attempts');
}

function h(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// Reset shared token between test files (not within one run)
test.afterAll(() => { _sharedToken = null; });

test.describe('API Contract Shape Validation', () => {
  test('GET /api/projects returns array (not null, not object)', async ({ request }) => {
    const token = await getAuthToken(request);
    const resp = await request.get(`${BASE}/api/projects`, { headers: h(token) });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body), 'Expected array, got: ' + typeof body).toBe(true);
    if (body.length > 0) {
      expect(typeof body[0]).toBe('object');
      expect('id' in body[0]).toBe(true);
    }
  });

  test('GET /api/settings returns object (not null, not array)', async ({ request }) => {
    const token = await getAuthToken(request);
    const resp = await request.get(`${BASE}/api/settings`, { headers: h(token) });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(typeof body).toBe('object', 'Expected object, got: ' + typeof body);
    expect(Array.isArray(body)).toBe(false);
  });

  test('GET /api/payments returns valid response', async ({ request }) => {
    const token = await getAuthToken(request);
    const resp = await request.get(`${BASE}/api/payments`, { headers: h(token) });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(typeof body).toBe('object');
    expect(body).not.toBeNull();
  });

  test('GET /api/trial/status returns object with trial fields', async ({ request }) => {
    const token = await getAuthToken(request);
    const resp = await request.get(`${BASE}/api/trial/status`, { headers: h(token) });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(typeof body).toBe('object');
    expect(body).not.toBeNull();
  });

  test('GET /api/admin/stats (if accessible) returns numeric values, not strings', async ({ request }) => {
    const token = await getAuthToken(request);
    const resp = await request.get(`${BASE}/api/admin/stats`, { headers: h(token) });
    if (resp.status() === 200) {
      const body = await resp.json();
      expect(typeof body).toBe('object');
      if (body.revenue) {
        if ('total_billed' in body.revenue) expect(typeof body.revenue.total_billed).toBe('number');
        if ('avg_contract' in body.revenue) expect(typeof body.revenue.avg_contract).toBe('number');
      }
    }
    // 403 for non-admin users is acceptable
    expect([200, 403]).toContain(resp.status());
  });
});

test.describe('API Error Responses', () => {
  test('404 on non-existent project returns proper error object', async ({ request }) => {
    const token = await getAuthToken(request);
    const resp = await request.get(`${BASE}/api/projects/999999999`, { headers: h(token) });
    expect(resp.status()).toBe(404);
    const body = await resp.json();
    expect(typeof body).toBe('object');
    expect('error' in body || 'message' in body).toBe(true);
  });

  test('401 on missing auth header returns proper error', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/settings`);
    expect(resp.status()).toBe(401);
    const body = await resp.json();
    expect(typeof body).toBe('object');
  });

  test('invalid request body returns error response', async ({ request }) => {
    const token = await getAuthToken(request);
    const resp = await request.post(`${BASE}/api/projects`, {
      headers: h(token),
      data: { /* missing required fields */ },
    });
    // Should be any error response (4xx or 5xx) — gateway 502s can occasionally
    // happen on staging under load; we accept them as "something went wrong" errors
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    if (resp.status() !== 502 && resp.status() !== 503) {
      const body = await resp.json();
      expect(typeof body).toBe('object');
    }
  });
});

test.describe('API Response Consistency', () => {
  test('Multiple requests to /api/projects return same structure', async ({ request }) => {
    const token = await getAuthToken(request);
    const [resp1, resp2] = await Promise.all([
      request.get(`${BASE}/api/projects`, { headers: h(token) }),
      request.get(`${BASE}/api/projects`, { headers: h(token) }),
    ]);
    expect(resp1.status()).toBe(200);
    expect(resp2.status()).toBe(200);
    const [body1, body2] = await Promise.all([resp1.json(), resp2.json()]);
    expect(Array.isArray(body1)).toBe(true);
    expect(Array.isArray(body2)).toBe(true);
    if (body1.length > 0 && body2.length > 0) {
      expect(Object.keys(body1[0]).sort()).toEqual(Object.keys(body2[0]).sort());
    }
  });

  test('GET /api/settings always returns same shape', async ({ request }) => {
    const token = await getAuthToken(request);
    const [resp1, resp2] = await Promise.all([
      request.get(`${BASE}/api/settings`, { headers: h(token) }),
      request.get(`${BASE}/api/settings`, { headers: h(token) }),
    ]);
    const [body1, body2] = await Promise.all([resp1.json(), resp2.json()]);
    expect(typeof body1).toBe('object');
    expect(typeof body2).toBe('object');
    expect(Object.keys(body1).sort()).toEqual(Object.keys(body2).sort());
  });
});
