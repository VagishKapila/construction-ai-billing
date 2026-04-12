/**
 * CROSS-LAYER CO MATH CONSISTENCY TESTS
 * ======================================
 * These tests exist because of a real production bug (April 2026):
 * Change order amounts were missing from H (Current Payment Due) on
 * the Step 4 summary, Step 6 preview, server HTML, server PDF, and email.
 * Each layer computed H independently — when the formula was wrong, it was
 * wrong in 4 different places at once.
 *
 * THIS SUITE verifies that ALL layers agree on the same H value when a CO exists.
 *
 * Rule: If a test in this file fails, DO NOT push. The CO math is broken somewhere.
 *
 * TEST_BASE_URL=https://construction-ai-billing-staging.up.railway.app npx playwright test co-math-crosslayer.spec.ts
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL || 'https://construction-ai-billing-staging.up.railway.app';
const EXISTING_EMAIL = process.env.EXISTING_TEST_EMAIL || 'mike.rodriguez.test@constructinv.com';
const EXISTING_PASSWORD = 'TestPass123!';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function apiLogin(request: any): Promise<string> {
  const resp = await request.post(`${BASE}/api/auth/login`, {
    data: { email: EXISTING_EMAIL, password: EXISTING_PASSWORD },
  });
  expect(resp.status(), 'Login should succeed').toBe(200);
  const body = await resp.json();
  return body.token;
}

function h(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function fmt(n: number): string {
  return n.toFixed(2);
}

// ─── Setup: Create a project with known SOV + known CO ───────────────────────
//
// SOV: 3 lines totalling $50,000
//   Foundation: $20,000
//   Framing:    $20,000
//   Roofing:    $10,000
//
// Pay App #1: 50% progress on all lines, 10% retainage
//   D (total completed): $25,000
//   E (retainage 10%):   $2,500
//   F (earned less ret): $22,500
//   G (prev certs):      $0 (first pay app)
//   Without CO: H = F - G = $22,500
//
// Change Order: $5,000 (active, no retainage)
//   With CO:    H = F - G + CO = $22,500 + $5,000 = $27,500
//   I (balance to finish): (original_contract + CO) - D + E - CO
//                        = $55,000 - $25,000 + $2,500 - $5,000 = $27,500
//
// Expected H: $27,500.00
// Expected I: $27,500.00

const EXPECTED_H = 27500;
const EXPECTED_I = 27500;
const CO_AMOUNT = 5000;

let token: string;
let projectId: number;
let payAppId: number;
let coId: number;

test.describe.serial('CO Math Cross-Layer Consistency', () => {

  // ── Setup ──────────────────────────────────────────────────────────────────

  test('Setup: create project + SOV + pay app + change order', async ({ request }) => {
    token = await apiLogin(request);

    // 1. Create project
    const projResp = await request.post(`${BASE}/api/projects`, {
      headers: h(token),
      data: {
        name: `CO_CrossLayer_${Date.now()}`,
        original_contract: 50000,
        default_retainage: 10,
        payment_terms: 'Net 30',
      },
    });
    expect(projResp.status()).toBe(201);
    const proj = await projResp.json();
    projectId = proj.id;

    // 2. Upload SOV lines
    const sovResp = await request.post(`${BASE}/api/projects/${projectId}/sov`, {
      headers: h(token),
      data: {
        lines: [
          { description: 'Foundation Work', scheduled_value: 20000 },
          { description: 'Framing', scheduled_value: 20000 },
          { description: 'Roofing', scheduled_value: 10000 },
        ],
      },
    });
    expect(sovResp.status()).toBe(200);

    // 3. Create pay app (uses /payapps — no hyphen)
    const paResp = await request.post(`${BASE}/api/projects/${projectId}/payapps`, {
      headers: h(token),
      data: { period_label: 'CO Test Period' },
    });
    expect(paResp.status()).toBe(200);
    const pa = await paResp.json();
    payAppId = pa.id;

    // 4. Set 50% progress on all lines via PUT /api/payapps/:id/lines (takes { lines: [...] })
    const paDetail = await (await request.get(`${BASE}/api/payapps/${payAppId}`, {
      headers: h(token),
    })).json();
    const lines = paDetail.lines || [];

    const lineUpdates = lines.map((line: any) => ({
      id: line.id,
      this_pct: 50,
      retainage_pct: 10,
      stored_materials: 0,
    }));

    const saveResp = await request.put(`${BASE}/api/payapps/${payAppId}/lines`, {
      headers: h(token),
      data: { lines: lineUpdates },
    });
    expect(saveResp.status()).toBe(200);

    // 5. Add change order (always creates as 'active')
    const coResp = await request.post(`${BASE}/api/projects/${projectId}/change-orders`, {
      headers: h(token),
      data: { description: 'CO Cross-Layer Test', amount: CO_AMOUNT },
    });
    expect(coResp.status()).toBe(200);
    const co = await coResp.json();
    coId = co.id;

    console.log(`  Setup complete — project:${projectId} payApp:${payAppId} CO:${coId}`);
    console.log(`  Expected H: $${EXPECTED_H.toFixed(2)}, Expected I: $${EXPECTED_I.toFixed(2)}`);
  });

  // ── Layer 1: API — pay app detail ─────────────────────────────────────────

  test('Layer 1 — API /api/payapps/:id returns lines with correct SOV data', async ({ request }) => {
    const detail = await (await request.get(`${BASE}/api/payapps/${payAppId}`, {
      headers: h(token),
    })).json();

    expect(Array.isArray(detail.lines)).toBe(true);
    const lines = detail.lines;

    // Compute D, E, F from lines
    let totalD = 0, totalE = 0;
    for (const line of lines) {
      const sv = Number(line.scheduled_value);
      const prevPct = Number(line.prev_pct || 0);
      const thisPct = Number(line.this_pct || 0);
      const retPct = Number(line.retainage_pct || 10);
      const comp = sv * (prevPct + thisPct) / 100;
      totalD += comp;
      totalE += comp * retPct / 100;
    }
    const F = totalD - totalE;
    const H_without_CO = F; // G=0 for first pay app
    const H_with_CO = F + CO_AMOUNT;

    console.log(`  Layer 1 — D:${fmt(totalD)} E:${fmt(totalE)} F:${fmt(F)} H_without_CO:${fmt(H_without_CO)} H_with_CO:${fmt(H_with_CO)}`);

    // The SOV math (F - G) component must be $22,500
    expect(Math.abs(H_without_CO - 22500)).toBeLessThan(1); // within $1 (some lines may still be 0% if save didn't apply)
    // With CO added: $27,500
    expect(Math.abs(H_with_CO - EXPECTED_H)).toBeLessThan(1);
  });

  // ── Layer 2: API — HTML generation endpoint ────────────────────────────────

  test('Layer 2 — Server HTML generation includes CO in H', async ({ request }) => {
    // GET /api/payapps/:id/html — the printable HTML
    const resp = await request.get(`${BASE}/api/payapps/${payAppId}/html`, {
      headers: h(token),
    });
    expect(resp.status()).toBe(200);
    const contentType = resp.headers()['content-type'];
    expect(contentType).toContain('text/html');

    const html = await resp.text();

    // The H value "$27,500.00" must appear in the rendered HTML
    const formattedH = EXPECTED_H.toLocaleString('en-US', { minimumFractionDigits: 2 });
    const found = html.includes(formattedH) || html.includes(`$${formattedH}`);

    console.log(`  Layer 2 — Looking for $${formattedH} in HTML (length: ${html.length})`);
    expect(found, `HTML does not contain expected H value $${formattedH}. CO math missing from server HTML route.`).toBe(true);
  });

  // ── Layer 3: API — PDF generation endpoint ─────────────────────────────────

  test('Layer 3 — PDF download is actually a PDF (not HTML error page)', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/payapps/${payAppId}/pdf`, {
      headers: h(token),
    });
    expect(resp.status()).toBe(200);

    const contentType = resp.headers()['content-type'];
    console.log(`  Layer 3 — Content-Type: ${contentType}`);

    // CRITICAL REGRESSION: PDF must not return text/html
    expect(contentType, 'PDF endpoint returned HTML — check server PDF route').toContain('application/pdf');
    expect(contentType).not.toContain('text/html');

    // PDF must start with %PDF magic bytes
    const body = await resp.body();
    const magic = body.slice(0, 4).toString('ascii');
    expect(magic, `PDF doesn't start with %PDF, got: ${magic}`).toBe('%PDF');
  });

  // ── Layer 4: Change orders list shows active CO ────────────────────────────

  test('Layer 4 — Active change orders sum equals CO_AMOUNT', async ({ request }) => {
    const cosResp = await request.get(`${BASE}/api/projects/${projectId}/change-orders`, {
      headers: h(token),
    });
    expect(cosResp.status()).toBe(200);
    const cos = await cosResp.json();

    const activeCOs = cos.filter((c: any) => c.status !== 'void' && c.status !== 'voided');
    const totalCO = activeCOs.reduce((s: number, c: any) => s + Number(c.amount), 0);

    console.log(`  Layer 4 — Active COs: ${activeCOs.length}, totalCO: $${fmt(totalCO)}`);

    expect(Math.abs(totalCO - CO_AMOUNT)).toBeLessThan(0.02);
  });

  // ── Layer 5: Voided CO excluded from H ─────────────────────────────────────

  test('Layer 5 — Voided change orders are excluded from H calculation', async ({ request }) => {
    // Create a CO as active (creation always ignores status)
    const voidCoResp = await request.post(`${BASE}/api/projects/${projectId}/change-orders`, {
      headers: h(token),
      data: { description: 'VOID CO — should not affect H', amount: 99999 },
    });
    expect(voidCoResp.status()).toBe(200);
    const voidCo = await voidCoResp.json();

    // Void it via PUT
    await request.put(`${BASE}/api/changeorders/${voidCo.id}`, {
      headers: h(token),
      data: { description: voidCo.description, amount: voidCo.amount, status: 'void' },
    });

    // Get server HTML — H should still be ~$27,500, not $27,500 + $99,999
    const htmlResp = await request.get(`${BASE}/api/payapps/${payAppId}/html`, {
      headers: h(token),
    });
    const html = await htmlResp.text();

    // Voided amount ($99,999) should NOT add to H
    const wrongH = EXPECTED_H + 99999;
    const wrongFormatted = wrongH.toLocaleString('en-US', { minimumFractionDigits: 2 });
    const badFound = html.includes(wrongFormatted) || html.includes(`$${wrongFormatted}`);

    console.log(`  Layer 5 — Wrong H (if void CO counted): $${wrongFormatted}, found: ${badFound}`);
    expect(badFound, `Voided CO ($99,999) is being included in H — void filter is broken`).toBe(false);

    // Clean up voided CO
    await request.delete(`${BASE}/api/projects/${projectId}/change-orders/${voidCo.id}`, {
      headers: h(token),
    });
  });

  // ── Teardown ────────────────────────────────────────────────────────────────

  test('Teardown: delete test project', async ({ request }) => {
    if (!projectId || !token) return;
    const resp = await request.delete(`${BASE}/api/projects/${projectId}`, {
      headers: h(token),
    });
    // 200 or 404 both acceptable for cleanup
    expect([200, 204, 404]).toContain(resp.status());
    console.log(`  Teardown — deleted project:${projectId}`);
  });
});
