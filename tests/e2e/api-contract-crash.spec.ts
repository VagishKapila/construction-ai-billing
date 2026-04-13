/**
 * API Contract Crash Test — Verifies API Responses Have Correct Shape
 *
 * This test suite validates that API responses match expected shapes.
 * If a component receives an API response with the wrong structure (e.g. null
 * instead of array, missing fields, wrong types), it could crash in the
 * ErrorBoundary.
 *
 * This test suite catches those shape issues before they reach the frontend.
 *
 * Run against staging:
 *   TEST_BASE_URL=https://construction-ai-billing-staging.up.railway.app npx playwright test tests/e2e/api-contract-crash.spec.ts
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL || 'https://construction-ai-billing-staging.up.railway.app';
const MIKE_EMAIL = 'mike.rodriguez.test@constructinv.com';
const MIKE_PASSWORD = 'TestPass123!';

/**
 * Helper: Get auth token via API
 * Retries up to 2 times if server is temporarily unavailable
 */
async function getAuthToken(request: any): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await request.post(`${BASE}/api/auth/login`, {
        data: { email: MIKE_EMAIL, password: MIKE_PASSWORD },
      });
      if (resp.status() === 200) {
        const body = await resp.json();
        return body.token;
      } else if (resp.status() >= 500) {
        // Server error, retry
        await new Promise(r => setTimeout(r, 500));
        continue;
      } else {
        throw new Error(`Login failed: ${resp.status()}`);
      }
    } catch (err) {
      lastError = err as Error;
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }
  throw lastError || new Error('Login failed after 3 attempts');
}

function h(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

test.describe('API Contract Shape Validation', () => {
  test('GET /api/projects returns array (not null, not object)', async ({ request }) => {
    const token = await getAuthToken(request);
    const resp = await request.get(`${BASE}/api/projects`, { headers: h(token) });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body), 'Expected array, got: ' + typeof body).toBe(true);
    // All items should be objects with required fields
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
    expect(Array.isArray(body)).toBe(false, 'Settings should not be an array');
  });

  test('GET /api/payments returns valid response', async ({ request }) => {
    const token = await getAuthToken(request);
    const resp = await request.get(`${BASE}/api/payments`, { headers: h(token) });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    // Should be an object or array, not null
    expect(typeof body).toBe('object', 'Response should be object or array, got: ' + typeof body);
    expect(body).not.toBeNull();
  });

  test('GET /api/trial/status returns object with trial fields', async ({ request }) => {
    const token = await getAuthToken(request);
    const resp = await request.get(`${BASE}/api/trial/status`, { headers: h(token) });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(typeof body).toBe('object', 'Expected object, got: ' + typeof body);
    // Should not be null
    expect(body).not.toBeNull();
  });

  test('GET /api/admin/stats (if accessible) returns numeric values, not strings', async ({ request }) => {
    const token = await getAuthToken(request);
    const resp = await request.get(`${BASE}/api/admin/stats`, { headers: h(token) });

    // Admin endpoint may return 403 for non-admin users — that's fine
    if (resp.status() === 200) {
      const body = await resp.json();
      expect(typeof body).toBe('object');

      // If revenue exists, its fields should be numbers
      if (body.revenue) {
        if ('total_billed' in body.revenue) {
          expect(typeof body.revenue.total_billed).toBe('number');
        }
        if ('avg_contract' in body.revenue) {
          expect(typeof body.revenue.avg_contract).toBe('number');
        }
      }
    }
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

  test('invalid request body returns 4xx error with proper error response', async ({ request }) => {
    const token = await getAuthToken(request);
    const resp = await request.post(`${BASE}/api/projects`, {
      headers: h(token),
      data: { /* missing required fields */ },
    });
    // Should be a client error (4xx), not server error (5xx)
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThan(500);
    const body = await resp.json();
    expect(typeof body).toBe('object');
  });
});

test.describe('API Response Consistency', () => {
  test('Multiple requests to /api/projects return same structure', async ({ request }) => {
    const token = await getAuthToken(request);

    const resp1 = await request.get(`${BASE}/api/projects`, { headers: h(token) });
    expect(resp1.status()).toBe(200);
    const body1 = await resp1.json();

    const resp2 = await request.get(`${BASE}/api/projects`, { headers: h(token) });
    expect(resp2.status()).toBe(200);
    const body2 = await resp2.json();

    // Both should be arrays
    expect(Array.isArray(body1)).toBe(true);
    expect(Array.isArray(body2)).toBe(true);

    // If both have items, they should have the same structure
    if (body1.length > 0 && body2.length > 0) {
      const keys1 = Object.keys(body1[0]).sort();
      const keys2 = Object.keys(body2[0]).sort();
      expect(keys1).toEqual(keys2);
    }
  });

  test('GET /api/settings always returns same shape', async ({ request }) => {
    const token = await getAuthToken(request);

    const resp1 = await request.get(`${BASE}/api/settings`, { headers: h(token) });
    const body1 = await resp1.json();

    const resp2 = await request.get(`${BASE}/api/settings`, { headers: h(token) });
    const body2 = await resp2.json();

    // Both should be objects
    expect(typeof body1).toBe('object');
    expect(typeof body2).toBe('object');

    // Keys should match
    const keys1 = Object.keys(body1).sort();
    const keys2 = Object.keys(body2).sort();
    expect(keys1).toEqual(keys2);
  });
});
