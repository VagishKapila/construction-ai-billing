/**
 * API CONTRACT TESTS
 * ==================
 * Verifies that API response shapes don't change unexpectedly.
 *
 * These tests record the SHAPE of critical API responses (which keys exist,
 * what types they are) and fail if the shape changes. They don't care about
 * the exact values — only the structure.
 *
 * Why this matters: Silent API shape changes break the frontend without any
 * error, because JavaScript happily accepts undefined instead of a missing field.
 * Example: if `amount_due` is renamed to `amountDue`, every pay app would show $0
 * but no error would be thrown.
 *
 * Run: TEST_BASE_URL=https://... npx playwright test tests/e2e/api-contracts.spec.ts
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL || 'https://construction-ai-billing-staging.up.railway.app';
const EMAIL = process.env.EXISTING_TEST_EMAIL || 'mike.rodriguez.test@constructinv.com';
const PASSWORD = 'TestPass123!';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function login(request: any): Promise<string> {
  const r = await request.post(`${BASE}/api/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  const body = await r.json();
  return body.token;
}

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// Shape validator: verifies all required keys exist and have expected types
function assertShape(obj: any, shape: Record<string, string>, label: string) {
  for (const [key, expectedType] of Object.entries(shape)) {
    const actualType = obj[key] === null ? 'null' : typeof obj[key];
    const valid = actualType === expectedType || obj[key] === null;

    if (!valid) {
      throw new Error(
        `[${label}] Field "${key}": expected ${expectedType}, got ${actualType} (value: ${JSON.stringify(obj[key])})`
      );
    }
  }
}

// ─── Contract definitions ─────────────────────────────────────────────────────

// These are the REQUIRED fields that must always be present in API responses.
// If a field is removed or renamed, the contract test fails BEFORE it breaks production.

const USER_CONTRACT = {
  id: 'number',
  email: 'string',
  name: 'string',
  // Trial/subscription fields (added in Rev 3)
  subscription_status: 'string',
  plan_type: 'string',
};

const PROJECT_CONTRACT = {
  id: 'number',
  name: 'string',
  original_contract: 'string',   // stored as numeric string by PostgreSQL
  default_retainage: 'string',
  status: 'string',              // 'active' | 'completed'
  user_id: 'number',
};

const PAY_APP_CONTRACT = {
  id: 'number',
  project_id: 'number',
  app_number: 'number',
  period_label: 'string',
  status: 'string',              // 'draft' | 'submitted'
  is_retainage_release: 'boolean',
  // amount_due may be null before submission
};

const PAY_APP_LINE_CONTRACT = {
  id: 'number',
  pay_app_id: 'number',
  sov_line_id: 'number',
  prev_pct: 'string',
  this_pct: 'string',
  retainage_pct: 'string',
  stored_materials: 'string',
  // from join:
  description: 'string',
  scheduled_value: 'string',
};

const CHANGE_ORDER_CONTRACT = {
  id: 'number',
  pay_app_id: 'number',
  co_number: 'number',
  description: 'string',
  amount: 'string',
  status: 'string',              // 'active' | 'pending' | 'void' | 'voided'
};

const SETTINGS_CONTRACT = {
  // Fields that must exist in company settings response
  company_name: 'string',
  default_retainage: 'string',
  default_payment_terms: 'string',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

let token: string;
let projectId: number;
let payAppId: number;

test.describe.serial('API Contract Tests', () => {

  test('Setup: authenticate', async ({ request }) => {
    token = await login(request);
    expect(token).toBeTruthy();
  });

  // ── User profile contract ───────────────────────────────────────────────────

  test('User profile response shape', async ({ request }) => {
    // User data comes from login response as { token, user: {...} }
    const loginR = await request.post(`${BASE}/api/auth/login`, {
      data: { email: EMAIL, password: PASSWORD },
    });
    const body = await loginR.json();
    expect(body.token, 'Login must return a token').toBeTruthy();
    expect(body.user, 'Login must return a user object').toBeTruthy();

    assertShape(body.user, USER_CONTRACT, 'User');
    console.log(`  User contract OK — id:${body.user.id} plan:${body.user.plan_type}`);
  });

  // ── Project contract ────────────────────────────────────────────────────────

  test('Projects list — each project has required fields', async ({ request }) => {
    const r = await request.get(`${BASE}/api/projects`, {
      headers: headers(token),
    });
    expect(r.status()).toBe(200);
    const projects = await r.json();
    expect(Array.isArray(projects)).toBe(true);

    if (projects.length > 0) {
      assertShape(projects[0], PROJECT_CONTRACT, 'Project');
      projectId = projects[0].id;
      console.log(`  Verified project contract on project ${projectId}`);
    } else {
      console.log('  No projects found — skipping project field check');
    }
  });

  // ── Pay app contract ────────────────────────────────────────────────────────

  test('Pay app detail — has required fields including lines array', async ({ request }) => {
    if (!projectId) { console.log('  No project — skipping'); return; }

    // Get pay apps for first project
    const projR = await request.get(`${BASE}/api/projects/${projectId}/payapps`, {
      headers: headers(token),
    });
    if (projR.status() !== 200) { console.log('  No pay apps — skipping'); return; }

    const payApps = await projR.json();
    if (!payApps.length) { console.log('  No pay apps — skipping'); return; }

    payAppId = payApps[0].id;

    // Get pay app detail (includes lines)
    const r = await request.get(`${BASE}/api/payapps/${payAppId}`, {
      headers: headers(token),
    });
    expect(r.status()).toBe(200);
    const pa = await r.json();

    assertShape(pa, PAY_APP_CONTRACT, 'PayApp');

    // CRITICAL: must have lines array (frontend depends on this)
    expect(Array.isArray(pa.lines), 'pay app must have lines array').toBe(true);

    if (pa.lines.length > 0) {
      assertShape(pa.lines[0], PAY_APP_LINE_CONTRACT, 'PayAppLine');
      console.log(`  Verified pay app contract on payApp ${payAppId} with ${pa.lines.length} lines`);
    }
  });

  // ── Pay app line critical fields ────────────────────────────────────────────

  test('Pay app lines — CO math fields all present (no silent undefined)', async ({ request }) => {
    if (!payAppId) { console.log('  No pay app — skipping'); return; }

    const r = await request.get(`${BASE}/api/payapps/${payAppId}`, {
      headers: headers(token),
    });
    const pa = await r.json();
    const lines = pa.lines || [];

    for (const line of lines) {
      // These fields are used in G702 math — undefined = silent $0
      const mathFields = ['scheduled_value', 'prev_pct', 'this_pct', 'retainage_pct', 'stored_materials'];
      for (const field of mathFields) {
        expect(
          line[field] !== undefined,
          `Line ${line.id}: "${field}" is undefined — G702 math will silently use $0`
        ).toBe(true);
      }
    }
    console.log(`  All ${lines.length} lines have required math fields`);
  });

  // ── Change order contract ───────────────────────────────────────────────────

  test('Change orders — have status field (void filter depends on it)', async ({ request }) => {
    if (!projectId) { console.log('  No project — skipping'); return; }

    const r = await request.get(`${BASE}/api/projects/${projectId}/change-orders`, {
      headers: headers(token),
    });
    if (r.status() !== 200) { console.log('  No COs endpoint — skipping'); return; }

    const cos = await r.json();
    if (!Array.isArray(cos) || cos.length === 0) {
      console.log('  No change orders — skipping contract check');
      return;
    }

    for (const co of cos) {
      assertShape(co, CHANGE_ORDER_CONTRACT, 'ChangeOrder');

      // CRITICAL: status must be one of the known values (void filter depends on this)
      const validStatuses = ['active', 'pending', 'void', 'voided', 'approved', 'rejected'];
      expect(
        validStatuses.includes(co.status),
        `CO ${co.id}: status "${co.status}" is not a recognized value — void filter may not work`
      ).toBe(true);
    }
    console.log(`  Verified CO contract on ${cos.length} change orders`);
  });

  // ── Settings contract ───────────────────────────────────────────────────────

  test('Company settings — has required fields', async ({ request }) => {
    const r = await request.get(`${BASE}/api/settings`, {
      headers: headers(token),
    });
    expect(r.status()).toBe(200);
    const settings = await r.json();

    assertShape(settings, SETTINGS_CONTRACT, 'CompanySettings');
    console.log(`  Settings contract OK — company: "${settings.company_name || '(not set)'}"`);
  });

  // ── PDF endpoint returns PDF, not HTML ────────────────────────────────────

  test('PDF endpoint contract — returns application/pdf NOT text/html', async ({ request }) => {
    if (!payAppId) { console.log('  No pay app — skipping'); return; }

    const r = await request.get(`${BASE}/api/payapps/${payAppId}/pdf`, {
      headers: headers(token),
    });
    expect(r.status()).toBe(200);
    const ct = r.headers()['content-type'];

    expect(ct, `PDF endpoint returned: ${ct}`).toContain('application/pdf');
    expect(ct, 'PDF endpoint returned HTML instead of PDF').not.toContain('text/html');

    const body = await r.body();
    const magic = body.slice(0, 4).toString('ascii');
    expect(magic, `Response does not start with %PDF — got: ${magic}`).toBe('%PDF');
    console.log(`  PDF contract OK for payApp ${payAppId}`);
  });

  // ── Reconciliation endpoint contract ──────────────────────────────────────

  test('Reconciliation — has balance and status fields', async ({ request }) => {
    if (!projectId) { console.log('  No project — skipping'); return; }

    const r = await request.get(`${BASE}/api/projects/${projectId}/reconciliation`, {
      headers: headers(token),
    });
    if (r.status() !== 200) { console.log('  Reconciliation endpoint returned non-200'); return; }

    const rec = await r.json();

    // Top-level fields
    const requiredTopLevel = ['original_contract', 'total_change_orders', 'adjusted_contract', 'invoices', 'summary'];
    for (const field of requiredTopLevel) {
      expect(rec[field] !== undefined, `Reconciliation missing top-level field: "${field}"`).toBe(true);
    }
    // Summary sub-object fields
    const summary = rec.summary || {};
    const requiredSummary = ['total_billed', 'total_retainage_held', 'total_work_completed', 'is_fully_reconciled'];
    for (const field of requiredSummary) {
      expect(summary[field] !== undefined, `Reconciliation summary missing field: "${field}"`).toBe(true);
    }
    expect(Array.isArray(rec.invoices), 'invoices must be an array').toBe(true);
    console.log(`  Reconciliation contract OK — is_fully_reconciled: ${summary.is_fully_reconciled}`);
  });
});
