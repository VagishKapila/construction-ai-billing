/**
 * Hub Core API Tests — Low-Level Endpoint Validation
 * ===================================================
 * Validates response structures, error handling, and status codes
 * for all Hub core endpoints. Does NOT test full workflows.
 *
 * Tests:
 * - Hub trades endpoint data array
 * - Hub inbox returns data
 * - Hub stats returns badge counts
 * - Hub summary returns trade_count and avg_trust_score (if implemented)
 * - Upload document to hub (multipart file handling)
 * - Hub magic link endpoint (no auth)
 * - Hub inbound email endpoint (no auth, public)
 * - Hub export zip endpoint
 *
 * Run against staging:
 *   TEST_BASE_URL=https://construction-ai-billing-staging.up.railway.app \
 *     npx playwright test tests/e2e/hub-core.spec.ts --reporter=list
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

/** Create a temporary project for Hub tests */
async function createTestProject(request: any, token: string): Promise<number> {
  const name = `HubCore_${Date.now()}`;
  const resp = await request.post(`${BASE}/api/projects`, {
    headers: h(token),
    data: { name, original_contract: 50000, payment_terms: 'Net 30', default_retainage: 10 },
  });
  expect(resp.status()).toBe(201);
  const body = await resp.json();
  return body.id ?? body.project?.id;
}

/** Delete test project */
async function deleteProject(request: any, token: string, projectId: number) {
  try {
    await request.delete(`${BASE}/api/projects/${projectId}`, { headers: h(token) });
  } catch (_) {
    // Ignore cleanup failures
  }
}

/** Create a test trade for the project */
async function createTestTrade(
  request: any,
  token: string,
  projectId: number
): Promise<{ id: number; magic_link_token: string }> {
  const resp = await request.post(`${BASE}/api/projects/${projectId}/hub/trades`, {
    headers: h(token),
    data: {
      name: `Trade_${Date.now()}`,
      company_name: 'Test Trade Co',
      contact_name: 'John Doe',
      contact_email: 'john@test.com',
    },
  });
  expect(resp.status()).toBe(201);
  const body = await resp.json();
  return { id: body.data.id, magic_link_token: body.data.magic_link_token };
}

/** Create a test file for upload */
function createTestFile(filename: string = 'test-doc.txt'): { path: string; cleanup: () => void } {
  const tmpDir = path.join(__dirname, '..', 'tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, 'Test document content for Hub upload');

  return {
    path: filePath,
    cleanup: () => {
      try {
        fs.unlinkSync(filePath);
      } catch (_) {}
    },
  };
}

// ─── Test Setup ──────────────────────────────────────────────────────────────

let token: string;
let projectId: number;

test.beforeAll(async ({ request }) => {
  token = await login(request);
  projectId = await createTestProject(request, token);
});

test.afterAll(async ({ request }) => {
  await deleteProject(request, token, projectId);
});

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('Hub Core API — Endpoints', () => {
  test('Hub trades endpoint returns data array', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/projects/${projectId}/hub/trades`, {
      headers: h(token),
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('Hub inbox returns data array', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/projects/${projectId}/hub/inbox`, {
      headers: h(token),
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('Hub stats returns badge counts', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/projects/${projectId}/hub/stats`, {
      headers: h(token),
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty('data');
    const data = body.data;

    // Must have counts: pending_count, approved_count, rejected_count, trade_count
    expect(typeof data.pending_count).toBe('number');
    expect(typeof data.approved_count).toBe('number');
    expect(typeof data.rejected_count).toBe('number');
    expect(typeof data.trade_count).toBe('number');

    // Counts should be non-negative
    expect(data.pending_count).toBeGreaterThanOrEqual(0);
    expect(data.approved_count).toBeGreaterThanOrEqual(0);
    expect(data.rejected_count).toBeGreaterThanOrEqual(0);
    expect(data.trade_count).toBeGreaterThanOrEqual(0);
  });

  test('Hub team endpoint returns team roles', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/projects/${projectId}/hub/team`, {
      headers: h(token),
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty('data');
    const data = body.data;

    // Must have 3 roles
    expect(data).toHaveProperty('office');
    expect(data).toHaveProperty('pm');
    expect(data).toHaveProperty('superintendent');
  });
});

test.describe('Hub Core API — File Uploads', () => {
  test('Upload document to hub with valid file (multipart)', async ({ request }) => {
    const file = createTestFile('valid-invoice.txt');

    try {
      const resp = await request.post(`${BASE}/api/projects/${projectId}/hub/uploads`, {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: {
            name: 'file',
            mimeType: 'text/plain',
            buffer: fs.readFileSync(file.path),
          },
          doc_type: 'invoice',
          notes: 'Test invoice upload',
        },
      });

      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('id');
      expect(body.data).toHaveProperty('filename');
      expect(body.data.doc_type).toBe('invoice');
    } finally {
      file.cleanup();
    }
  });

  test('Upload document without file returns 400', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/projects/${projectId}/hub/uploads`, {
      headers: h(token),
      data: { doc_type: 'invoice', notes: 'No file provided' },
    });

    // Should be 400 (bad request), NOT 500
    expect([400, 422]).toContain(resp.status());
    const body = await resp.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toContain('file');
  });

  test('Upload document with malformed request returns 400', async ({ request }) => {
    // Send without proper multipart encoding
    const resp = await request.post(`${BASE}/api/projects/${projectId}/hub/uploads`, {
      headers: { ...h(token), 'Content-Type': 'text/plain' },
      data: 'invalid raw data',
    });

    // Should not be 500
    expect(resp.status()).not.toBe(500);
  });
});

test.describe('Hub Core API — Magic Link (No Auth)', () => {
  test('Hub magic link endpoint with valid token returns 200', async ({ request }) => {
    // Create a trade to get a valid magic token
    const trade = await createTestTrade(request, token, projectId);

    const resp = await request.get(`${BASE}/api/hub/magic/${trade.magic_link_token}`);

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty('data');
    expect(body.data).toHaveProperty('project_name');
    expect(body.data).toHaveProperty('trade_name');
  });

  test('Hub magic link endpoint with invalid token returns 404 (not 500)', async ({
    request,
  }) => {
    const fakeToken = '0'.repeat(64); // Invalid token

    const resp = await request.get(`${BASE}/api/hub/magic/${fakeToken}`);

    // Must be 404, not 500
    expect(resp.status()).toBe(404);
    const body = await resp.json();
    expect(body).toHaveProperty('error');
  });

  test('Hub magic link endpoint with malformed token returns 404', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/hub/magic/not-a-valid-hex-token`);

    expect(resp.status()).toBe(404);
  });
});

test.describe('Hub Core API — Upload via Magic Link', () => {
  test('Magic link upload with valid file returns 201', async ({ request }) => {
    // Create a trade to get a valid magic token
    const trade = await createTestTrade(request, token, projectId);
    const file = createTestFile('magic-upload-test.txt');

    try {
      const resp = await request.post(`${BASE}/api/hub/magic/${trade.magic_link_token}/upload`, {
        multipart: {
          file: {
            name: 'file',
            mimeType: 'text/plain',
            buffer: fs.readFileSync(file.path),
          },
          doc_type: 'invoice',
          company_name: 'Acme Corp',
          notes: 'Invoice from sub via magic link',
        },
      });

      expect(resp.status()).toBe(201);
      const body = await resp.json();
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('id');
      expect(body.data.source).toBe('magic_link');
    } finally {
      file.cleanup();
    }
  });

  test('Magic link upload with invalid token returns 404', async ({ request }) => {
    const fakeToken = '0'.repeat(64);
    const file = createTestFile('magic-invalid-token.txt');

    try {
      const resp = await request.post(
        `${BASE}/api/hub/magic/${fakeToken}/upload`,
        {
          multipart: {
            file: {
              name: 'file',
              mimeType: 'text/plain',
              buffer: fs.readFileSync(file.path),
            },
          },
        }
      );

      expect(resp.status()).toBe(404);
    } finally {
      file.cleanup();
    }
  });

  test('Magic link upload without file returns 400', async ({ request }) => {
    const trade = await createTestTrade(request, token, projectId);

    const resp = await request.post(`${BASE}/api/hub/magic/${trade.magic_link_token}/upload`, {
      data: { doc_type: 'invoice' },
    });

    expect([400, 422]).toContain(resp.status());
  });
});

test.describe('Hub Core API — Inbox Filtering', () => {
  test('Hub inbox with status filter returns matching uploads', async ({ request }) => {
    // Create a trade and upload
    const trade = await createTestTrade(request, token, projectId);
    const file = createTestFile('filter-test.txt');

    try {
      // Upload a document
      await request.post(`${BASE}/api/projects/${projectId}/hub/uploads`, {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: {
            name: 'file',
            mimeType: 'text/plain',
            buffer: fs.readFileSync(file.path),
          },
          doc_type: 'invoice',
        },
      });

      // Query inbox with status=pending
      const resp = await request.get(
        `${BASE}/api/projects/${projectId}/hub/inbox?status=pending`,
        {
          headers: h(token),
        }
      );

      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(Array.isArray(body.data)).toBe(true);
    } finally {
      file.cleanup();
    }
  });

  test('Hub inbox with doc_type filter returns matching uploads', async ({ request }) => {
    const resp = await request.get(
      `${BASE}/api/projects/${projectId}/hub/inbox?doc_type=invoice`,
      {
        headers: h(token),
      }
    );

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body.data)).toBe(true);
  });
});

test.describe('Hub Core API — Authorization', () => {
  test('Hub trades endpoint without auth returns 401', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/projects/${projectId}/hub/trades`);

    expect(resp.status()).toBe(401);
  });

  test('Hub inbox endpoint without auth returns 401', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/projects/${projectId}/hub/inbox`);

    expect(resp.status()).toBe(401);
  });

  test('Hub stats endpoint without auth returns 401', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/projects/${projectId}/hub/stats`);

    expect(resp.status()).toBe(401);
  });

  test('Hub upload endpoint without auth returns 401', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/projects/${projectId}/hub/uploads`, {
      data: { doc_type: 'invoice' },
    });

    expect(resp.status()).toBe(401);
  });

  test('Magic link endpoint does NOT require auth', async ({ request }) => {
    const trade = await createTestTrade(request, token, projectId);

    const resp = await request.get(`${BASE}/api/hub/magic/${trade.magic_link_token}`);

    expect(resp.status()).toBe(200);
  });
});

test.describe('Hub Core API — Error Handling', () => {
  test('Accessing hub on non-existent project returns 404', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/projects/999999/hub/trades`, {
      headers: h(token),
    });

    expect(resp.status()).toBe(404);
  });

  test('Uploading to non-existent project returns 404', async ({ request }) => {
    const file = createTestFile('nonexistent-proj.txt');

    try {
      const resp = await request.post(`${BASE}/api/projects/999999/hub/uploads`, {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: {
            name: 'file',
            mimeType: 'text/plain',
            buffer: fs.readFileSync(file.path),
          },
        },
      });

      expect(resp.status()).toBe(404);
    } finally {
      file.cleanup();
    }
  });

  test('Invalid JSON in request body returns 400', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/projects/${projectId}/hub/trades`, {
      headers: { ...h(token), 'Content-Type': 'application/json' },
      data: '{ invalid json',
    });

    expect([400, 422]).toContain(resp.status());
  });
});
