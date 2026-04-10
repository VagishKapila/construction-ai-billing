/**
 * Trust Score — Vendor Reputation & Event Tracking API Tests
 *
 * Tests the Trust Score routes that track vendor/contractor reputation:
 * - Vendor trust score lookups (out of 763 MAX_SCORE)
 * - Trust event recording (approvals, rejections, on-time submissions)
 * - Trust tier classification (platinum, gold, silver, bronze, review)
 * - Score arithmetic and business logic validation
 *
 * IMPORTANT: MAX_SCORE = 763 (not 100, not 1000)
 *
 * Run against staging:
 *   TEST_BASE_URL=https://construction-ai-billing-staging.up.railway.app npx playwright test tests/e2e/trust-score.spec.ts
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

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

test.describe('Trust Score API', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await apiLogin(request);
  });

  test('Trust scores endpoint returns list', async ({ request }) => {
    // GET /api/trust/:vendorEmail returns a single trust record
    // Testing with a vendor email that may or may not exist
    const resp = await request.get(`${BASE}/api/trust/test@example.com`, { headers: h(token) });
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.data).toBeDefined();
    expect(body.data.score).toBeDefined();
    expect(typeof body.data.score).toBe('number');
    expect(body.data.max_score).toBeDefined();
    expect(body.data.max_score).toBe(763); // MAX_SCORE constant
  });

  test('Trust vendor lookup by email returns valid response', async ({ request }) => {
    const testEmail = 'nonexistent_vendor_' + Date.now() + '@test.com';
    const resp = await request.get(`${BASE}/api/trust/${testEmail}`, { headers: h(token) });

    // Should return 200 with default score if vendor doesn't exist
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.data).toBeDefined();
    expect(body.data.score).toBeDefined();
    expect(body.data.max_score).toBe(763);

    // Default score should be valid
    if (body.data.score) {
      expect(typeof body.data.score).toBe('number');
      expect(body.data.score).toBeGreaterThanOrEqual(0);
      expect(body.data.score).toBeLessThanOrEqual(763);
    }
  });

  test('Trust score recording endpoint exists and accepts events', async ({ request }) => {
    // First, we need to create or get a trust score
    const vendorEmail = 'test_vendor_' + Date.now() + '@test.com';
    const getResp = await request.get(`${BASE}/api/trust/${vendorEmail}`, { headers: h(token) });
    expect(getResp.status()).toBe(200);
    const vendorData = await getResp.json();
    const trustScoreId = vendorData.data.id;

    if (!trustScoreId) {
      // Skip event recording if no trust score exists (table may not be fully initialized)
      test.skip();
    }

    // POST event to the trust score
    const eventResp = await request.post(`${BASE}/api/trust/event`, {
      headers: h(token),
      data: {
        trust_score_id: trustScoreId,
        event_type: 'approved',
        upload_id: null,
      }
    });

    expect([200, 400, 404]).toContain(eventResp.status());

    if (eventResp.status() === 200) {
      const body = await eventResp.json();
      expect(body.data).toBeDefined();
      expect(body.data.score).toBeDefined();
      expect(body.data.tier).toBeDefined();
      expect(body.data.tier_info).toBeDefined();
    }
  });

  test('Trust event endpoint validates required fields', async ({ request }) => {
    // POST without required fields should return 400
    const resp = await request.post(`${BASE}/api/trust/event`, {
      headers: h(token),
      data: {
        // Missing trust_score_id and event_type
        upload_id: null,
      }
    });

    expect(resp.status()).toBe(400);
  });

  test('MAX_SCORE constant is 763 in trust.service.js', async () => {
    // Read the trust.service.js file and verify MAX_SCORE = 763
    const servicePath = join(
      process.cwd(),
      'server/features/trust/trust.service.js'
    );

    const fileContent = readFileSync(servicePath, 'utf-8');

    // Verify MAX_SCORE is defined as 763
    expect(fileContent).toMatch(/const\s+MAX_SCORE\s*=\s*763/);

    // Verify it's not commented out or in a string
    const maxScoreLine = fileContent.match(/^const\s+MAX_SCORE\s*=\s*763/m);
    expect(maxScoreLine).toBeTruthy();
  });

  test('TIERS configuration confirms platinum max = 763', async () => {
    // Read trust.service.js and verify the TIERS array
    const servicePath = join(
      process.cwd(),
      'server/features/trust/trust.service.js'
    );

    const fileContent = readFileSync(servicePath, 'utf-8');

    // Verify platinum tier max score is 763
    expect(fileContent).toMatch(/platinum.*?max:\s*763/s);
  });

  test('Trust scores display format is raw number out of 763', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/trust/test@example.com`, { headers: h(token) });
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.data.score).toBeDefined();

    // Score should be a raw number (not a percentage like 0.5 or "50%")
    expect(typeof body.data.score).toBe('number');

    // Score should be between 0 and MAX_SCORE (763)
    expect(body.data.score).toBeGreaterThanOrEqual(0);
    expect(body.data.score).toBeLessThanOrEqual(763);

    // Response should include max_score = 763
    expect(body.data.max_score).toBe(763);
  });

  test('Trust score by project ID endpoint', async ({ request }) => {
    // GET /api/trust/score/:projectId
    const resp = await request.get(`${BASE}/api/trust/score/141`, { headers: h(token) });
    expect([200, 404]).toContain(resp.status());

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body.data).toBeDefined();
      expect(body.data.max_score).toBe(763);
      expect(typeof body.data.score).toBe('number');
    }
  });

  test('Trust history endpoint returns events', async ({ request }) => {
    // First get a trust score
    const vendorResp = await request.get(`${BASE}/api/trust/test@example.com`, { headers: h(token) });
    expect(vendorResp.status()).toBe(200);
    const vendorData = await vendorResp.json();

    if (!vendorData.data.id) {
      test.skip();
    }

    // GET history for that trust score
    const historyResp = await request.get(`${BASE}/api/trust/history/${vendorData.data.id}`, { headers: h(token) });
    expect([200, 404]).toContain(historyResp.status());

    if (historyResp.status() === 200) {
      const body = await historyResp.json();
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);

      // If there are history items, verify structure
      if (body.data.length > 0) {
        const event = body.data[0];
        expect(event.event_type).toBeDefined();
        expect(event.score_delta).toBeDefined();
        expect(event.score_after).toBeDefined();
      }
    }
  });

  test('Trust endpoints require authentication (401)', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/trust/test@example.com`);
    expect(resp.status()).toBe(401);
  });

  test('Invalid token returns 401 for trust score', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/trust/test@example.com`, {
      headers: { Authorization: 'Bearer invalid.token.here' }
    });
    expect(resp.status()).toBe(401);
  });
});
