/**
 * Project Hub Phase 1 — E2E API Tests
 * =====================================
 * Tests the complete magic-link → upload → approve flow.
 *
 * Prerequisites:
 *   - Staging environment running with Hub tables in DB
 *   - Test user: mike.rodriguez.test@constructinv.com / TestPass123!
 *
 * Run against staging:
 *   TEST_BASE_URL=https://construction-ai-billing-staging.up.railway.app \
 *     npx playwright test tests/e2e/hub-phase1.spec.ts --reporter=list
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE = process.env.TEST_BASE_URL || 'https://construction-ai-billing-staging.up.railway.app';
const EMAIL = process.env.EXISTING_TEST_EMAIL || 'mike.rodriguez.test@constructinv.com';
const PASSWORD = 'TestPass123!';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function login(request: any): Promise<string> {
  const resp = await request.post(`${BASE}/api/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(resp.status(), `Login failed for ${EMAIL}`).toBe(200);
  const body = await resp.json();
  return body.token;
}

function h(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/** Create a temporary project for Hub tests, return its ID */
async function createTestProject(request: any, token: string): Promise<number> {
  const name = `HubTest_${Date.now()}`;
  const resp = await request.post(`${BASE}/api/projects`, {
    headers: h(token),
    data: { name, original_contract: 50000, payment_terms: 'Net 30', default_retainage: 10 },
  });
  expect(resp.status(), 'Create test project for Hub').toBe(200);
  const body = await resp.json();
  return body.id ?? body.project?.id;
}

/** Clean up test project after test */
async function deleteProject(request: any, token: string, projectId: number) {
  await request.delete(`${BASE}/api/projects/${projectId}`, { headers: h(token) });
}

// ─── Hub Phase 1: Trade Management ───────────────────────────────────────────

test.describe('Hub: Trade Management', () => {
  test('create trade returns 201 with magic_link_token', async ({ request }) => {
    const token = await login(request);
    const projectId = await createTestProject(request, token);

    const resp = await request.post(`${BASE}/api/projects/${projectId}/hub/trades`, {
      headers: h(token),
      data: {
        name: 'Electrical',
        company_name: 'Bright Spark Electric',
        contact_name: 'Joe Volt',
        contact_email: 'joe@brightsparkelectric.com',
      },
    });
    expect(resp.status(), 'POST hub/trades should be 201').toBe(201);
    const body = await resp.json();
    expect(body.data).toBeDefined();
    expect(body.data.name).toBe('Electrical');
    expect(body.data.magic_link_token).toBeTruthy();
    expect(body.data.magic_link_token.length).toBe(64); // 32 bytes hex = 64 chars
    expect(body.data.email_alias).toContain('@hub.constructinv.com');

    await deleteProject(request, token, projectId);
  });

  test('list trades returns array for project', async ({ request }) => {
    const token = await login(request);
    const projectId = await createTestProject(request, token);

    // Add a trade first
    await request.post(`${BASE}/api/projects/${projectId}/hub/trades`, {
      headers: h(token),
      data: { name: 'Plumbing', company_name: 'Pro Plumb Inc' },
    });

    const resp = await request.get(`${BASE}/api/projects/${projectId}/hub/trades`, {
      headers: h(token),
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]).toHaveProperty('magic_link_token');

    await deleteProject(request, token, projectId);
  });

  test('creating trade without name returns 400', async ({ request }) => {
    const token = await login(request);
    const projectId = await createTestProject(request, token);

    const resp = await request.post(`${BASE}/api/projects/${projectId}/hub/trades`, {
      headers: h(token),
      data: { company_name: 'No Name Corp' }, // missing name
    });
    expect(resp.status()).toBe(400);

    await deleteProject(request, token, projectId);
  });
});

// ─── Hub Phase 1: Magic Link Flow (no auth) ───────────────────────────────────

test.describe('Hub: Magic Link', () => {
  test('GET magic link returns project name and trade info', async ({ request }) => {
    const token = await login(request);
    const projectId = await createTestProject(request, token);

    // Create a trade to get magic link token
    const tradeResp = await request.post(`${BASE}/api/projects/${projectId}/hub/trades`, {
      headers: h(token),
      data: { name: 'Concrete', company_name: 'SoCal Concrete Co' },
    });
    const { magic_link_token } = (await tradeResp.json()).data;

    // Access magic link without auth
    const resp = await request.get(`${BASE}/api/hub/magic/${magic_link_token}`);
    expect(resp.status(), 'Magic link GET should be public').toBe(200);
    const body = await resp.json();
    expect(body.data).toBeDefined();
    // API returns snake_case field names
    expect(body.data).toHaveProperty('project_name');
    expect(body.data.trade_name).toBe('Concrete');

    await deleteProject(request, token, projectId);
  });

  test('invalid magic link token returns 404', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/hub/magic/000000000000000000000000000000000000000000000000000000000000dead`);
    expect(resp.status()).toBe(404);
  });
});

// ─── Hub Phase 1: Upload → Approve Flow ──────────────────────────────────────

test.describe('Hub: Upload → Approve Flow (critical path)', () => {
  test('magic link → upload → approve → confirm in inbox', async ({ request }) => {
    const token = await login(request);
    const projectId = await createTestProject(request, token);

    // Step 1: Create trade
    const tradeResp = await request.post(`${BASE}/api/projects/${projectId}/hub/trades`, {
      headers: h(token),
      data: { name: 'Plumbing', company_name: 'Test Plumbing Co', contact_email: 'sub@plumbing.com' },
    });
    expect(tradeResp.status()).toBe(201);
    const { id: tradeId, magic_link_token } = (await tradeResp.json()).data;

    // Step 2: Upload via magic link (no auth — simulates sub portal)
    const pdfPath = path.join(__dirname, '../fixtures/test-invoice.pdf');
    expect(fs.existsSync(pdfPath), 'Test PDF fixture must exist').toBe(true);

    const uploadResp = await request.post(`${BASE}/api/hub/magic/${magic_link_token}/upload`, {
      multipart: {
        file: {
          name: 'test-invoice.pdf',
          mimeType: 'application/pdf',
          buffer: fs.readFileSync(pdfPath),
        },
        doc_type: 'invoice',
        amount: '15000',
        notes: 'E2E test invoice upload',
      },
    });
    expect(uploadResp.status(), 'Magic link upload should be 201').toBe(201);
    const uploadBody = await uploadResp.json();
    expect(uploadBody.data).toBeDefined();
    expect(uploadBody.data.status).toBe('pending');
    expect(uploadBody.data.doc_type).toBe('invoice');
    const uploadId = uploadBody.data.id;

    // Step 3: Approve upload as GC (authenticated)
    const approveResp = await request.put(
      `${BASE}/api/projects/${projectId}/hub/uploads/${uploadId}`,
      {
        headers: h(token),
        data: { status: 'approved' },
      }
    );
    expect(approveResp.status(), 'Approve upload should be 200').toBe(200);
    const approveBody = await approveResp.json();
    expect(approveBody.data.status).toBe('approved');

    // Step 4: Confirm approved upload appears in inbox
    const inboxResp = await request.get(`${BASE}/api/projects/${projectId}/hub/inbox`, {
      headers: h(token),
    });
    expect(inboxResp.status()).toBe(200);
    const inboxBody = await inboxResp.json();
    expect(Array.isArray(inboxBody.data)).toBe(true);
    const approvedDoc = inboxBody.data.find((u: any) => u.id === uploadId);
    expect(approvedDoc, 'Approved upload should appear in inbox').toBeDefined();
    expect(approvedDoc.status).toBe('approved');

    await deleteProject(request, token, projectId);
  });

  test('upload rejected: missing file returns 400', async ({ request }) => {
    const token = await login(request);
    const projectId = await createTestProject(request, token);

    const tradeResp = await request.post(`${BASE}/api/projects/${projectId}/hub/trades`, {
      headers: h(token),
      data: { name: 'Drywall' },
    });
    const { magic_link_token } = (await tradeResp.json()).data;

    const resp = await request.post(`${BASE}/api/hub/magic/${magic_link_token}/upload`, {
      multipart: { doc_type: 'invoice' }, // no file
    });
    expect(resp.status()).toBe(400);

    await deleteProject(request, token, projectId);
  });
});

// ─── Hub Phase 1: Auth Boundaries ────────────────────────────────────────────

test.describe('Hub: Auth Boundaries', () => {
  test('hub/trades requires auth', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/projects/1/hub/trades`);
    expect(resp.status()).toBe(401);
  });

  test('hub/inbox requires auth', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/projects/1/hub/inbox`);
    expect(resp.status()).toBe(401);
  });

  test('hub/uploads approve requires auth', async ({ request }) => {
    const resp = await request.put(`${BASE}/api/projects/1/hub/uploads/999`, {
      data: { status: 'approved' },
    });
    expect(resp.status()).toBe(401);
  });

  test('hub stats requires auth', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/projects/1/hub/stats`);
    expect(resp.status()).toBe(401);
  });

  test('hub magic link GET is public (no auth)', async ({ request }) => {
    // Dead token → 404 (not 401) confirms no auth check on public endpoint
    const resp = await request.get(
      `${BASE}/api/hub/magic/0000000000000000000000000000000000000000000000000000000000000000`
    );
    expect(resp.status()).not.toBe(401);
  });
});

// ─── Hub Phase 1: Hub Stats ───────────────────────────────────────────────────

test.describe('Hub: Stats endpoint', () => {
  test('GET hub/stats returns counts for project', async ({ request }) => {
    const token = await login(request);
    const projectId = await createTestProject(request, token);

    const resp = await request.get(`${BASE}/api/projects/${projectId}/hub/stats`, {
      headers: h(token),
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.data).toBeDefined();
    // Stats endpoint returns: pending_count, approved_count, rejected_count, trade_count
    expect(typeof body.data.pending_count).toBe('number');
    expect(typeof body.data.approved_count).toBe('number');
    expect(typeof body.data.trade_count).toBe('number');

    await deleteProject(request, token, projectId);
  });
});
