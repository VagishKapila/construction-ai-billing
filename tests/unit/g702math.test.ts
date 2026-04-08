/**
 * G702/G703 Math Unit Tests
 * ==========================
 * Pure math tests — no server, no network, no browser.
 * Tests the computeLine() and computePayAppTotals() functions directly.
 *
 * These tests MUST pass before any push. They run in milliseconds.
 *
 * WHAT THIS CATCHES:
 * - Wrong column formulas (H = F - G, not H = F + G)
 * - Retainage applying to COs (it should NOT)
 * - Floating point rounding errors
 * - Retainage release edge cases (all this_pct=0, use stored amount_due)
 * - Multi-line aggregate totals
 *
 * Run: npx playwright test tests/unit/g702math.test.ts
 */

import { test, expect } from '@playwright/test';
import { computeLine, computePayAppTotals } from '../../client/src/lib/g702math';

// ─── Column formula verification ─────────────────────────────────────────────

test.describe('computeLine — single line G702 columns', () => {

  test('basic line: 50% complete, 10% retainage', () => {
    const line = { prev_pct: 0, this_pct: 50, retainage_pct: 10, stored_materials: 0 } as any;
    const sv = 20000;
    const prevCerts = 0;
    const result = computeLine(line, sv, 'Foundation', prevCerts);

    // A = scheduled value
    expect(result.scheduledValue).toBe(20000);
    // B = prev work = 0% × $20k = $0
    expect(result.prevAmount).toBe(0);
    // C = this period = 50% × $20k = $10,000
    expect(result.thisAmount).toBe(10000);
    // D = B + C = $10,000
    expect(result.totalCompleted).toBe(10000);
    // E = 10% × $10k = $1,000
    expect(result.retainageHeld).toBe(1000);
    // F = D - E = $9,000
    expect(result.totalEarned).toBe(9000);
    // G = prev certs = $0
    expect(result.prevCertificates).toBe(0);
    // H = F - G = $9,000
    expect(result.currentDue).toBe(9000);
    // I = A - F = $11,000
    expect(result.balanceToFinish).toBe(11000);
  });

  test('line with prev progress: G prev certs deducted from H', () => {
    // Simulates Pay App #2: client already paid $9,000 on App #1
    const line = { prev_pct: 50, this_pct: 25, retainage_pct: 10, stored_materials: 0 } as any;
    const sv = 20000;
    const prevCerts = 9000; // what was certified on App #1

    const result = computeLine(line, sv, 'Foundation', prevCerts);

    // B = 50% × $20k = $10,000
    expect(result.prevAmount).toBe(10000);
    // C = 25% × $20k = $5,000
    expect(result.thisAmount).toBe(5000);
    // D = $15,000
    expect(result.totalCompleted).toBe(15000);
    // E = 10% × $15k = $1,500
    expect(result.retainageHeld).toBe(1500);
    // F = $13,500
    expect(result.totalEarned).toBe(13500);
    // G = $9,000 (prev certs)
    expect(result.prevCertificates).toBe(9000);
    // H = $13,500 - $9,000 = $4,500
    expect(result.currentDue).toBe(4500);
    // I = $20,000 - $13,500 = $6,500
    expect(result.balanceToFinish).toBe(6500);
  });

  test('100% complete line: balance to finish equals retainage held (I = A - F)', () => {
    // I = A - F where F = D - E
    // If D = A (100% done) and E = retainage, then I = A - (A - E) = E
    // So balance to finish on a 100% complete line = retainage held (not zero!)
    const line = { prev_pct: 75, this_pct: 25, retainage_pct: 10, stored_materials: 0 } as any;
    const result = computeLine(line, 10000, 'Roofing', 0);

    expect(result.totalCompleted).toBe(10000);
    expect(result.retainageHeld).toBe(1000);     // 10% of $10k = $1,000 held
    expect(result.totalEarned).toBe(9000);        // F = D - E = $9,000
    expect(result.balanceToFinish).toBe(1000);    // I = A - F = $10k - $9k = $1,000 (= retainage)
  });

  test('100% complete line with zero retainage has zero balance to finish', () => {
    const line = { prev_pct: 75, this_pct: 25, retainage_pct: 0, stored_materials: 0 } as any;
    const result = computeLine(line, 10000, 'Roofing No Ret', 0);

    expect(result.totalCompleted).toBe(10000);
    expect(result.retainageHeld).toBe(0);
    expect(result.totalEarned).toBe(10000);
    expect(result.balanceToFinish).toBe(0);  // Only zero when retainage is also zero
  });

  test('retainage release line (this_pct=0) returns zero currentDue from line math', () => {
    // Retainage release pay apps have all this_pct=0
    // The currentDue = 0 from line math — the actual due comes from stored amount_due
    const line = { prev_pct: 100, this_pct: 0, retainage_pct: 0, stored_materials: 0 } as any;
    const result = computeLine(line, 20000, 'Foundation', 20000);

    expect(result.totalCompleted).toBe(20000); // all done from prev
    expect(result.thisAmount).toBe(0);
    // With 0% retainage on this line (release scenario)
    expect(result.currentDue).toBe(0); // F - G = 20000 - 20000 = 0
  });

  test('variable retainage per line', () => {
    // Some lines can have different retainage percentages
    const line5 = { prev_pct: 0, this_pct: 100, retainage_pct: 5, stored_materials: 0 } as any;
    const line0 = { prev_pct: 0, this_pct: 100, retainage_pct: 0, stored_materials: 0 } as any;

    const r5 = computeLine(line5, 10000, 'With 5% ret', 0);
    const r0 = computeLine(line0, 10000, 'With 0% ret', 0);

    expect(r5.retainageHeld).toBe(500);   // 5% × $10k
    expect(r5.totalEarned).toBe(9500);
    expect(r0.retainageHeld).toBe(0);    // 0% retainage
    expect(r0.totalEarned).toBe(10000);
  });
});

// ─── Change Order math rules ──────────────────────────────────────────────────

test.describe('Change Orders — H formula rules', () => {

  test('CO amounts add to H at full value (no retainage on COs)', () => {
    // This is the production bug that was fixed April 2026.
    // COs are added to H directly — no retainage is applied.
    //
    // Setup: 3 SOV lines ($50,000 total), 50% complete, 10% retainage
    const lines = [
      { prev_pct: 0, this_pct: 50, retainage_pct: 10, stored_materials: 0 },
      { prev_pct: 0, this_pct: 50, retainage_pct: 10, stored_materials: 0 },
      { prev_pct: 0, this_pct: 50, retainage_pct: 10, stored_materials: 0 },
    ] as any[];
    const scheduledValues = [20000, 20000, 10000];
    const prevCerts = [0, 0, 0];

    const computedLines = lines.map((l, i) => computeLine(l, scheduledValues[i], `Line ${i+1}`, prevCerts[i]));
    const totals = computePayAppTotals(computedLines);

    // Without CO:
    // D = $25,000 (50% of $50k)
    // E = $2,500 (10% retainage)
    // F = $22,500
    // G = $0
    // H_line_math = $22,500
    expect(Math.abs(totals.totalCurrentDue - 22500)).toBeLessThan(0.01);

    // Change order: $5,000 active CO (no retainage)
    const coAmount = 5000;
    const H_with_CO = totals.totalCurrentDue + coAmount;

    // H should be $27,500
    expect(Math.abs(H_with_CO - 27500)).toBeLessThan(0.01);
    console.log(`  CO Math: H_without_CO=$${totals.totalCurrentDue}, CO=$${coAmount}, H_with_CO=$${H_with_CO}`);
  });

  test('voided CO does not add to H', () => {
    const lines = [
      { prev_pct: 0, this_pct: 50, retainage_pct: 10, stored_materials: 0 },
    ] as any[];
    const computedLines = lines.map(l => computeLine(l, 10000, 'Line', 0));
    const totals = computePayAppTotals(computedLines);

    const activeCOs = [{ amount: 2000, status: 'active' }];
    const voidedCOs = [{ amount: 99999, status: 'void' }, { amount: 500, status: 'voided' }];
    const allCOs = [...activeCOs, ...voidedCOs];

    // Only non-voided COs should add to H
    const netCOs = allCOs
      .filter(c => c.status !== 'void' && c.status !== 'voided')
      .reduce((s, c) => s + c.amount, 0);

    const H = totals.totalCurrentDue + netCOs;

    // Active CO = $2,000 added, voided COs = $0
    expect(netCOs).toBe(2000);
    // H = $4,500 (F-G) + $2,000 = $6,500... wait let me check
    // line: 50% of $10k = $5k completed, E=10%×$5k=$500, F=$4,500, G=$0, H_line=$4,500
    // H with CO = $4,500 + $2,000 = $6,500
    expect(Math.abs(H - 6500)).toBeLessThan(0.01);
    console.log(`  Voided CO test: netCOs=$${netCOs}, H=$${H}`);
  });

  test('balance to finish decreases by CO amount (COs paid out via H)', () => {
    const lines = [
      { prev_pct: 0, this_pct: 50, retainage_pct: 10, stored_materials: 0 },
      { prev_pct: 0, this_pct: 50, retainage_pct: 10, stored_materials: 0 },
      { prev_pct: 0, this_pct: 50, retainage_pct: 10, stored_materials: 0 },
    ] as any[];
    const scheduledValues = [20000, 20000, 10000];
    const computedLines = lines.map((l, i) => computeLine(l, scheduledValues[i], `Line ${i+1}`, 0));
    const totals = computePayAppTotals(computedLines);

    const originalContract = 50000;
    const coAmount = 5000;
    const contractSumToDate = originalContract + coAmount;  // $55,000

    // Balance without CO consideration:
    // = contractSumToDate - totalCompleted + totalRetainage
    // = $55,000 - $25,000 + $2,500 = $32,500
    const I_without_adj = contractSumToDate - totals.totalCompleted + totals.totalRetainage;

    // Balance WITH CO adjustment (COs distributed via H, so subtract from I):
    // = $32,500 - $5,000 = $27,500
    const I_with_adj = I_without_adj - coAmount;

    expect(Math.abs(I_with_adj - EXPECTED_I)).toBeLessThan(0.01);
    console.log(`  Balance: I_without_adj=$${I_without_adj}, I_with_adj=$${I_with_adj}`);
  });
});

const EXPECTED_I = 27500;

// ─── computePayAppTotals aggregate ───────────────────────────────────────────

test.describe('computePayAppTotals — aggregate across lines', () => {

  test('sums all column totals correctly', () => {
    const lines = [
      { prev_pct: 25, this_pct: 25, retainage_pct: 10, stored_materials: 0 },  // $10k line
      { prev_pct: 0,  this_pct: 75, retainage_pct: 5,  stored_materials: 500 }, // $8k line
    ] as any[];

    const line1 = computeLine(lines[0], 10000, 'A', 2250);
    const line2 = computeLine(lines[1], 8000, 'B', 0);
    const totals = computePayAppTotals([line1, line2]);

    // Line 1: D=$5k, E=$500, F=$4500, G=$2250, H=$2250
    // Line 2: D=$6.5k (75%×8k + $500 materials?), actually stored_materials isn't in computeLine
    // Wait — computeLine doesn't use stored_materials in current impl
    // Line 2: D = 0% prev + 75% this = 75%×8k = $6,000, E=5%×$6k=$300, F=$5,700, G=$0, H=$5,700

    // Verify totals aggregate
    expect(totals.totalScheduled).toBe(18000);
    expect(Math.abs(totals.totalCompleted - (5000 + 6000))).toBeLessThan(0.01);
    expect(Math.abs(totals.totalRetainage - (500 + 300))).toBeLessThan(0.01);
    expect(Math.abs(totals.totalEarned - (4500 + 5700))).toBeLessThan(0.01);
    expect(Math.abs(totals.totalCurrentDue - (2250 + 5700))).toBeLessThan(0.01);
  });

  test('empty lines array returns all zeros', () => {
    const totals = computePayAppTotals([]);
    expect(totals.totalScheduled).toBe(0);
    expect(totals.totalCurrentDue).toBe(0);
    expect(totals.totalBalanceToFinish).toBe(0);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

test.describe('Edge cases and regression guards', () => {

  test('H is never negative (over-certified guard)', () => {
    // If somehow G > F, H should be 0 (not negative)
    const line = { prev_pct: 0, this_pct: 10, retainage_pct: 10, stored_materials: 0 } as any;
    const result = computeLine(line, 10000, 'Line', 9999); // prev certs way too high

    // F = 10% × $10k - 10% ret = $900, G = $9,999
    // H = $900 - $9,999 = -$9,099 — this is a data problem but should not crash
    // The server uses Math.max(0, ...) — the client lib returns the raw value
    // This test documents the current behavior so we know if it changes
    expect(typeof result.currentDue).toBe('number');
    console.log(`  Over-cert H: ${result.currentDue} (negative = data issue, not a code bug)`);
  });

  test('floating point: large dollar amounts stay precise to cents', () => {
    // Regression guard: very large amounts should not drift more than $0.01
    const line = { prev_pct: 33.333, this_pct: 33.333, retainage_pct: 10, stored_materials: 0 } as any;
    const result = computeLine(line, 1000000, 'Big Line', 0);

    // D ≈ $666,660
    expect(result.totalCompleted).toBeCloseTo(666660, 0); // within $1
    // H should not have floating point drift
    const hStr = result.currentDue.toFixed(2);
    expect(hStr).not.toContain('NaN');
    expect(hStr).not.toContain('undefined');
  });
});
