/**
 * Construction AI Billing — Full E2E API Test Suite
 * Uses Playwright request fixture (pure HTTP — no browser required).
 *
 * Run against staging:
 *   TEST_BASE_URL=https://construction-ai-billing-staging.up.railway.app npx playwright test tests/e2e/construction-billing.spec.ts
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

test.describe('Smoke Tests', () => {
  test('landing page returns 200', async ({ request }) => {
    const resp = await request.get(BASE);
    expect(resp.status()).toBe(200);
  });
  test('app.html returns 200', async ({ request }) => {
    const resp = await request.get(`${BASE}/app.html`);
    expect(resp.status()).toBe(200);
  });
  test('settings requires auth (401)', async ({ request }) => {
    expect((await request.get(`${BASE}/api/settings`)).status()).toBe(401);
  });
  test('projects requires auth (401)', async ({ request }) => {
    expect((await request.get(`${BASE}/api/projects`)).status()).toBe(401);
  });
  test('payments requires auth (401)', async ({ request }) => {
    expect((await request.get(`${BASE}/api/payments`)).status()).toBe(401);
  });
});

test.describe('Authentication', () => {
  test('valid login returns token', async ({ request }) => {
    const token = await apiLogin(request);
    expect(token.length).toBeGreaterThan(20);
  });
  test('wrong password returns 401', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/auth/login`, { data: { email: EXISTING_EMAIL, password: 'WrongPass!' } });
    expect(resp.status()).toBe(401);
  });
  test('token grants access to settings', async ({ request }) => {
    const token = await apiLogin(request);
    expect((await request.get(`${BASE}/api/settings`, { headers: h(token) })).status()).toBe(200);
  });
  test('invalid token returns 401', async ({ request }) => {
    expect((await request.get(`${BASE}/api/settings`, { headers: { Authorization: 'Bearer fake.token.here' } })).status()).toBe(401);
  });
});

test.describe('Projects CRUD', () => {
  test('GET /api/projects returns array', async ({ request }) => {
    const token = await apiLogin(request);
    const resp = await request.get(`${BASE}/api/projects`, { headers: h(token) });
    expect(resp.status()).toBe(200);
    expect(Array.isArray(await resp.json())).toBe(true);
  });

  test('create + delete project lifecycle', async ({ request }) => {
    const token = await apiLogin(request);
    const name = `E2E_${Date.now()}`;
    const createResp = await request.post(`${BASE}/api/projects`, {
      headers: h(token),
      data: { name, original_contract: 100000, payment_terms: 'Net 30', default_retainage: 10 },
    });
    expect(createResp.status()).toBe(201);
    const proj = await createResp.json();
    expect(proj.name).toBe(name);
    expect(proj.id).toBeTruthy();
    // Delete
    const del = await request.delete(`${BASE}/api/projects/${proj.id}`, { headers: h(token) });
    expect([200, 204]).toContain(del.status());
    // No longer in list
    const list = await (await request.get(`${BASE}/api/projects`, { headers: h(token) })).json();
    expect(list.find((p: any) => p.id === proj.id)).toBeUndefined();
  });
});

test.describe('Pay Applications', () => {
  let projectId: number;
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await apiLogin(request);
    const proj = await (await request.post(`${BASE}/api/projects`, {
      headers: h(token),
      data: { name: `PayApp_${Date.now()}`, original_contract: 50000, default_retainage: 10 },
    })).json();
    projectId = proj.id;
    await request.post(`${BASE}/api/projects/${projectId}/sov`, {
      headers: h(token),
      data: { lines: [
        { description: 'Foundation', scheduled_value: 20000 },
        { description: 'Framing',    scheduled_value: 20000 },
        { description: 'Roofing',    scheduled_value: 10000 },
      ]},
    });
  });

  test.afterAll(async ({ request }) => {
    if (projectId && token)
      await request.delete(`${BASE}/api/projects/${projectId}`, { headers: h(token) });
  });

  test('create pay app', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/projects/${projectId}/payapps`, {
      headers: h(token), data: { period_label: 'E2E Test Period' },
    });
    expect(resp.status()).toBe(200);
    const pa = await resp.json();
    expect(pa.id).toBeTruthy();
    expect(pa.app_number).toBe(1);
  });

  test('PDF download returns application/pdf NOT text/html', async ({ request }) => {
    const payApps = await (await request.get(`${BASE}/api/projects/${projectId}/payapps`, { headers: h(token) })).json();
    expect(payApps.length).toBeGreaterThan(0);
    const resp = await request.get(`${BASE}/api/payapps/${payApps[0].id}/pdf`, { headers: h(token) });
    expect(resp.status()).toBe(200);
    const ct = resp.headers()['content-type'];
    expect(ct, 'PDF route returned HTML — regression!').toContain('application/pdf');
    expect(ct).not.toContain('text/html');
  });

  test('pay app detail includes 3 lines matching SOV upload', async ({ request }) => {
    // Lines are embedded in GET /api/payapps/:id — no separate lines endpoint
    const payApps = await (await request.get(`${BASE}/api/projects/${projectId}/payapps`, { headers: h(token) })).json();
    expect(payApps.length).toBeGreaterThan(0);
    const detail = await (await request.get(`${BASE}/api/payapps/${payApps[0].id}`, { headers: h(token) })).json();
    expect(Array.isArray(detail.lines)).toBe(true);
    expect(detail.lines.length).toBe(3);
  });
});

test.describe('Settings — no field wipe', () => {
  test('saving company name preserves contact fields', async ({ request }) => {
    const token = await apiLogin(request);
    await request.post(`${BASE}/api/settings`, { headers: h(token), data: {
      company_name: 'E2E Co', contact_name: 'John E2E', contact_phone: '555-0100', contact_email: 'j@e2e.com',
      default_payment_terms: 'Net 30', default_retainage: 10,
    }});
    await request.post(`${BASE}/api/settings`, { headers: h(token), data: {
      company_name: 'Updated Co', default_payment_terms: 'Net 30', default_retainage: 10,
    }});
    const s = await (await request.get(`${BASE}/api/settings`, { headers: h(token) })).json();
    expect(s.company_name).toBe('Updated Co');
    expect(s.contact_name).toBe('John E2E');
    expect(s.contact_phone).toBe('555-0100');
  });

  test('saving contact info preserves company name', async ({ request }) => {
    const token = await apiLogin(request);
    await request.post(`${BASE}/api/settings`, { headers: h(token), data: {
      company_name: 'ABC Contractors', default_payment_terms: 'Net 30', default_retainage: 10,
    }});
    await request.post(`${BASE}/api/settings`, { headers: h(token), data: {
      contact_name: 'Jane', contact_phone: '555-9', contact_email: 'j@abc.com',
    }});
    const s = await (await request.get(`${BASE}/api/settings`, { headers: h(token) })).json();
    expect(s.company_name).toBe('ABC Contractors');
    expect(s.contact_name).toBe('Jane');
  });
});

test.describe('Change Orders', () => {
  let projectId: number; let token: string;
  test.beforeAll(async ({ request }) => {
    token = await apiLogin(request);
    // Create project + pay app — COs require an existing pay app (they link to a pay app)
    projectId = (await (await request.post(`${BASE}/api/projects`, {
      headers: h(token), data: { name: `CO_${Date.now()}`, original_contract: 100000 },
    })).json()).id;
    // Must create a pay app first — CO POST attaches to latest pay app
    await request.post(`${BASE}/api/projects/${projectId}/payapps`, {
      headers: h(token), data: { period_label: 'CO Test Period' },
    });
  });
  test.afterAll(async ({ request }) => {
    if (projectId) await request.delete(`${BASE}/api/projects/${projectId}`, { headers: h(token) });
  });

  test('new CO is active, has co_number, correct amount', async ({ request }) => {
    const co = await (await request.post(`${BASE}/api/projects/${projectId}/change-orders`, {
      headers: h(token), data: { description: 'Extra work', amount: 5000 },
    })).json();
    expect(co.status).toBe('active');
    expect(co.co_number).toBeTruthy();
    expect(Number(co.amount)).toBe(5000);
  });

  test('voided CO excluded from active total', async ({ request }) => {
    // Create CO as active first (the projects route always creates as active)
    const bigCo = await (await request.post(`${BASE}/api/projects/${projectId}/change-orders`, {
      headers: h(token), data: { description: 'Void me', amount: 99999 },
    })).json();

    // Now void it via PUT /api/changeorders/:id
    await request.put(`${BASE}/api/changeorders/${bigCo.id}`, {
      headers: h(token),
      data: { description: bigCo.description, amount: bigCo.amount, status: 'void' },
    });

    // Fetch and filter — voided CO should not add to active sum
    const cos = await (await request.get(`${BASE}/api/projects/${projectId}/change-orders`, { headers: h(token) })).json();
    const voidedCo = cos.find((c: any) => c.id === bigCo.id);
    expect(voidedCo?.status).toBe('void');

    const activeTotal = cos.filter((c: any) => c.status !== 'void' && c.status !== 'voided')
                           .reduce((s: number, c: any) => s + Number(c.amount), 0);
    // Active total must not include the $99,999 voided CO
    expect(activeTotal).toBeLessThan(99999);
  });
});

test.describe('Job Complete / Reopen', () => {
  let projectId: number; let token: string;
  test.beforeAll(async ({ request }) => {
    token = await apiLogin(request);
    projectId = (await (await request.post(`${BASE}/api/projects`, {
      headers: h(token), data: { name: `Complete_${Date.now()}`, original_contract: 50000 },
    })).json()).id;
  });
  test.afterAll(async ({ request }) => {
    if (projectId) await request.delete(`${BASE}/api/projects/${projectId}`, { headers: h(token) });
  });

  test('complete returns JSON with status=completed', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/projects/${projectId}/complete`, { headers: h(token), data: {} });
    expect(resp.headers()['content-type']).toContain('application/json');
    expect(resp.status()).toBe(200);
    expect((await resp.json()).status).toBe('completed');
  });

  test('reopen returns JSON with status=active', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/projects/${projectId}/reopen`, { headers: h(token), data: {} });
    expect(resp.status()).toBe(200);
    expect((await resp.json()).status).toBe('active');
  });
});

test.describe('Reconciliation', () => {
  test('endpoint returns valid shape', async ({ request }) => {
    const token = await apiLogin(request);
    const projects = await (await request.get(`${BASE}/api/projects`, { headers: h(token) })).json();
    if (!projects.length) { console.log('  skip — no projects'); return; }
    const resp = await request.get(`${BASE}/api/projects/${projects[0].id}/reconciliation`, { headers: h(token) });
    expect(resp.status()).toBe(200);
    const data = await resp.json();
    expect(data.summary).toBeDefined();
    expect(typeof data.summary.total_billed).toBe('number');
    expect(typeof data.summary.is_fully_reconciled).toBe('boolean');
  });
});
