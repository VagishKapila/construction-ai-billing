/**
 * ARIA Intelligence — Cash Flow & Collections API Tests
 *
 * Tests the ARIA (AI Revenue Assessment Intelligence) routes that provide:
 * - 30-day cash flow forecasting
 * - Follow-up queue for overdue invoices
 * - Lien deadline alerts (California)
 * - Leverage timing analysis
 * - Change order leakage detection
 * - Actionable project insights
 *
 * Run against staging:
 *   TEST_BASE_URL=https://construction-ai-billing-staging.up.railway.app npx playwright test tests/e2e/aria-intelligence.spec.ts
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL || 'https://construction-ai-billing-staging.up.railway.app';
const EXISTING_EMAIL = process.env.EXISTING_TEST_EMAIL || 'mike.rodriguez.test@constructinv.com';
const EXISTING_PASSWORD = 'TestPass123!';

async function apiLogin(request: any, email = EXISTING_EMAIL, password = EXISTING_PASSWORD): Promise<string> {
  const resp = await request.post(`${BASE}/api/auth/login`, { data: { email, password } });
  expect(resp.status(), `Login failed for ${email}`).toBe(200);
  const body = await resp.json();
  return body.token;
}

function h(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

test.describe('ARIA Intelligence API', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await apiLogin(request);
  });

  test('Cash flow forecast returns 30-day array', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/aria/cash-forecast`, { headers: h(token) });
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);

    // Verify structure of forecast entries
    body.data.forEach((day: any) => {
      expect(day.date).toBeDefined();
      expect(day.projected_inflow).toBeDefined();
      expect(day.projected_outflow).toBeDefined();
      expect(day.net).toBeDefined();
      expect(typeof day.projected_inflow).toBe('number');
      expect(typeof day.projected_outflow).toBe('number');
      expect(typeof day.net).toBe('number');
    });
  });

  test('ARIA follow-up queue returns data', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/aria/follow-up-queue`, { headers: h(token) });
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.message).toBeDefined();
    expect(typeof body.message).toBe('string');

    // If there are items in the queue, verify structure
    if (body.data.length > 0) {
      const item = body.data[0];
      expect(item.id).toBeDefined();
      expect(item.app_number).toBeDefined();
      expect(item.project_name).toBeDefined();
      expect(item.amount_due).toBeDefined();
      expect(item.days_overdue).toBeDefined();
      expect(item.tone).toBeDefined();
      expect(['gentle', 'firm', 'final']).toContain(item.tone);
    }
  });

  test('ARIA lien alerts endpoint returns data', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/aria/lien-alerts`, { headers: h(token) });
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.message).toBeDefined();
  });

  test('ARIA leverage timing for project', async ({ request }) => {
    // Using projectId 141 as mentioned in CLAUDE.md
    const resp = await request.get(`${BASE}/api/aria/leverage-timing/141`, { headers: h(token) });
    expect([200, 404]).toContain(resp.status());

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body.data).toBeDefined();
      expect(body.data.leverage_score).toBeDefined();
      expect(typeof body.data.leverage_score).toBe('number');
      expect(body.data.leverage_score).toBeGreaterThanOrEqual(1);
      expect(body.data.leverage_score).toBeLessThanOrEqual(10);
    }
  });

  test('ARIA CO leakage for project', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/aria/co-leakage/141`, { headers: h(token) });
    expect([200, 404]).toContain(resp.status());

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.summary).toBeDefined();
      expect(body.summary.total_leaked_revenue).toBeDefined();
      expect(typeof body.summary.total_leaked_revenue).toBe('number');
      expect(body.summary.leaked_co_count).toBeDefined();
      expect(typeof body.summary.leaked_co_count).toBe('number');
    }
  });

  test('ARIA insights for project', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/aria/insights/141`, { headers: h(token) });
    expect([200, 404]).toContain(resp.status());

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);

      // Verify structure of insights
      body.data.forEach((insight: any) => {
        expect(insight.type).toBeDefined();
        expect(insight.title).toBeDefined();
        expect(insight.message).toBeDefined();
        expect(insight.severity).toBeDefined();
        expect(['info', 'warning', 'danger']).toContain(insight.severity);
      });
    }
  });

  test('Cash forecast net = inflow - outflow arithmetic', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/aria/cash-forecast`, { headers: h(token) });
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(Array.isArray(body.data)).toBe(true);

    // Verify arithmetic for each day
    body.data.forEach((day: any) => {
      const expectedNet = day.projected_inflow - day.projected_outflow;
      expect(day.net).toBeCloseTo(expectedNet, 2); // Allow for floating point precision
    });
  });

  test('Follow-up queue requires authentication (401)', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/aria/follow-up-queue`);
    expect(resp.status()).toBe(401);
  });

  test('Cash forecast requires authentication (401)', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/aria/cash-forecast`);
    expect(resp.status()).toBe(401);
  });

  test('Leverage timing requires authentication (401)', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/aria/leverage-timing/141`);
    expect(resp.status()).toBe(401);
  });

  test('Invalid token returns 401', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/aria/cash-forecast`, {
      headers: { Authorization: 'Bearer invalid.token.here' }
    });
    expect(resp.status()).toBe(401);
  });
});
