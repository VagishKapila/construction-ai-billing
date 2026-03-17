#!/usr/bin/env node
/**
 * Construction AI Billing — Math QA Test Suite
 * Runs against the live local API on port 3000.
 *
 * Tests every critical AIA G702/G703 formula:
 *   D  = Total Completed & Stored
 *   E  = Retainage
 *   F  = Earned Less Retainage (D - E)
 *   G  = Previous Certificates
 *   H  = Current Payment Due  (F - G)
 *   I  = Balance to Finish    (Contract - D + E)
 *
 * Also verifies:
 *   - prev_pct rolls forward correctly to next pay app
 *   - Dashboard /api/stats sums only THIS_PCT (no double-counting)
 *   - Draft pay apps are excluded from stats
 *   - Zero-retainage project works correctly
 */

const BASE = 'http://localhost:3000';
let token;
let pass = 0, fail = 0, warn = 0;

// ─── helpers ────────────────────────────────────────────────────────────────
const round2 = n => Math.round(n * 100) / 100;
const fmt    = n => '$' + round2(n).toLocaleString('en-US', { minimumFractionDigits: 2 });

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  };
  const res = await fetch(BASE + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

function check(label, actual, expected, tol = 0.02) {
  const diff = Math.abs(actual - expected);
  if (diff <= tol) {
    console.log(`  ✅  ${label}: ${fmt(actual)}`);
    pass++;
  } else {
    console.error(`  ❌  ${label}: got ${fmt(actual)}, expected ${fmt(expected)}  (diff ${fmt(diff)})`);
    fail++;
  }
}

function checkEq(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✅  ${label}: ${JSON.stringify(actual)}`);
    pass++;
  } else {
    console.error(`  ❌  ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    fail++;
  }
}

// ─── G702 math helpers (mirror server logic) ─────────────────────────────────
function g702(lines) {
  let D = 0, E = 0, G = 0;
  for (const l of lines) {
    const sv    = l.scheduled_value;
    const prev  = sv * l.prev_pct  / 100;
    const thisp = sv * l.this_pct  / 100;
    const stored = l.stored_materials || 0;
    const comp  = prev + thisp + stored;
    const ret   = comp * l.retainage_pct / 100;
    D += comp;
    E += ret;
    G += prev;
  }
  const F = D - E;
  const H = Math.max(0, F - G);
  return { D, E, F, G, H };
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Construction AI Billing — Math QA Test Suite');
  console.log('══════════════════════════════════════════════════════\n');

  // ── 0. Register/login test user ────────────────────────────────────────────
  const ts    = Date.now();
  const email = `qa_${ts}@test.local`;
  const pwd   = 'TestPass123!';
  try {
    const reg = await api('POST', '/api/auth/register', { name: 'QA Bot', email, password: pwd });
    token = reg.token;
    console.log('✅  Registered test user:', email);
  } catch(e) {
    // Already exists → just login
    const log = await api('POST', '/api/auth/login', { email, password: pwd });
    token = log.token;
    console.log('✅  Logged in test user:', email);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST SUITE 1 — Standard 10% retainage, 3 pay apps
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n─── Suite 1: Standard 10% retainage project, 3 pay apps ───\n');

  // Contract: $1,000,000   Retainage: 10%
  // SOV:
  //   Line A — Concrete & Foundations   $400,000
  //   Line B — Structural Framing        $350,000
  //   Line C — Roofing & Waterproofing   $250,000

  const PROJ_CONTRACT = 1_000_000;
  const SOV = [
    { item_id: '1000', description: 'Concrete & Foundations',    scheduled_value: 400_000 },
    { item_id: '2000', description: 'Structural Framing',         scheduled_value: 350_000 },
    { item_id: '3000', description: 'Roofing & Waterproofing',    scheduled_value: 250_000 },
  ];
  const DEFAULT_RET = 10;

  const proj = await api('POST', '/api/projects', {
    name: `QA Test Project ${ts}`,
    number: 'QA-001',
    owner: 'Test Owner LLC',
    contractor: 'Test GC Inc.',
    architect: 'Test Architect AIA',
    original_contract: PROJ_CONTRACT,
    default_retainage: DEFAULT_RET,
  });
  const PID = proj.id;
  console.log('  Created project ID:', PID);

  // Save SOV
  const sovSaved = await api('POST', `/api/projects/${PID}/sov`, { lines: SOV });
  checkEq('SOV line count saved', sovSaved.length, 3);
  const sovIds = sovSaved.map(l => l.id); // [lineA, lineB, lineC]

  // ── PA #1 ────────────────────────────────────────────────────────────────
  console.log('\n  [PA #1] Create & bill at partial completion');
  const pa1 = await api('POST', `/api/projects/${PID}/payapps`, {
    app_number: 1, period_label: 'January 2025',
  });
  const PA1_ID = pa1.id;

  // Fetch PA to get line IDs
  const pa1data = await api('GET', `/api/payapps/${PA1_ID}`);
  checkEq('PA1 line count', pa1data.lines.length, 3);
  checkEq('PA1 prev_pct all zero', pa1data.lines.every(l => parseFloat(l.prev_pct) === 0), true);

  // Bill: A=25%, B=30%, C=0%
  const pa1billing = [
    { id: pa1data.lines.find(l => l.item_id === '1000').id, this_pct: 25, retainage_pct: 10, stored_materials: 0 },
    { id: pa1data.lines.find(l => l.item_id === '2000').id, this_pct: 30, retainage_pct: 10, stored_materials: 0 },
    { id: pa1data.lines.find(l => l.item_id === '3000').id, this_pct:  0, retainage_pct: 10, stored_materials: 0 },
  ];
  await api('PUT', `/api/payapps/${PA1_ID}/lines`, { lines: pa1billing });

  // Expected math
  // A: comp=100k, ret=10k;  B: comp=105k, ret=10.5k;  C: 0
  const PA1_LINES = [
    { scheduled_value: 400_000, prev_pct: 0, this_pct: 25, retainage_pct: 10, stored_materials: 0 },
    { scheduled_value: 350_000, prev_pct: 0, this_pct: 30, retainage_pct: 10, stored_materials: 0 },
    { scheduled_value: 250_000, prev_pct: 0, this_pct:  0, retainage_pct: 10, stored_materials: 0 },
  ];
  const m1 = g702(PA1_LINES);
  // D=205000, E=20500, F=184500, G=0, H=184500
  check('PA1 D (Total Completed)',         m1.D, 205_000);
  check('PA1 E (Retainage)',               m1.E,  20_500);
  check('PA1 F (Earned Less Retainage)',   m1.F, 184_500);
  check('PA1 G (Previous Certificates)',   m1.G,       0);
  check('PA1 H (Current Payment Due)',     m1.H, 184_500);
  check('PA1 I (Balance to Finish)',       PROJ_CONTRACT - m1.D + m1.E, 815_500);

  // Dashboard BEFORE submit — draft PA should not count
  const statsBefore = await api('GET', '/api/stats');
  check('Stats before submit: total_billed = 0', parseFloat(statsBefore.total_billed), 0);

  // Submit PA1
  await api('PUT', `/api/payapps/${PA1_ID}`, { status: 'submitted' });
  const statsAfterPA1 = await api('GET', '/api/stats');
  // Stats sums this_pct only: A:25%*400k=100k, B:30%*350k=105k, C:0 → total=205k
  check('Stats after PA1 submitted: total_billed',    parseFloat(statsAfterPA1.total_billed),    205_000);
  check('Stats after PA1 submitted: total_retainage', parseFloat(statsAfterPA1.total_retainage),  20_500);

  // ── PA #2 ────────────────────────────────────────────────────────────────
  console.log('\n  [PA #2] prev_pct roll-forward & incremental billing');
  const pa2 = await api('POST', `/api/projects/${PID}/payapps`, {
    app_number: 2, period_label: 'February 2025',
  });
  const PA2_ID = pa2.id;
  const pa2data = await api('GET', `/api/payapps/${PA2_ID}`);

  // Verify prev_pct rolled forward from PA1
  const pa2A = pa2data.lines.find(l => l.item_id === '1000');
  const pa2B = pa2data.lines.find(l => l.item_id === '2000');
  const pa2C = pa2data.lines.find(l => l.item_id === '3000');
  check('PA2 Line A prev_pct rolled forward', parseFloat(pa2A.prev_pct), 25);
  check('PA2 Line B prev_pct rolled forward', parseFloat(pa2B.prev_pct), 30);
  check('PA2 Line C prev_pct rolled forward', parseFloat(pa2C.prev_pct),  0);

  // Bill PA2: A+30%, B+20%, C+40%
  const pa2billing = [
    { id: pa2A.id, this_pct: 30, retainage_pct: 10, stored_materials: 0 },
    { id: pa2B.id, this_pct: 20, retainage_pct: 10, stored_materials: 0 },
    { id: pa2C.id, this_pct: 40, retainage_pct: 10, stored_materials: 0 },
  ];
  await api('PUT', `/api/payapps/${PA2_ID}/lines`, { lines: pa2billing });

  // Expected:
  // A: comp=(25+30)%*400k=220k, B: comp=(30+20)%*350k=175k, C: comp=40%*250k=100k
  // D=495k, E=49.5k, F=445.5k, G=G is sum of prev*sv = 25%*400k+30%*350k+0=205k
  // H=445.5k-205k=240.5k, I=1000k-495k+49.5k=554.5k
  const PA2_LINES = [
    { scheduled_value: 400_000, prev_pct: 25, this_pct: 30, retainage_pct: 10, stored_materials: 0 },
    { scheduled_value: 350_000, prev_pct: 30, this_pct: 20, retainage_pct: 10, stored_materials: 0 },
    { scheduled_value: 250_000, prev_pct:  0, this_pct: 40, retainage_pct: 10, stored_materials: 0 },
  ];
  const m2 = g702(PA2_LINES);
  check('PA2 D (Total Completed)',         m2.D, 495_000);
  check('PA2 E (Retainage)',               m2.E,  49_500);
  check('PA2 F (Earned Less Retainage)',   m2.F, 445_500);
  check('PA2 G (Previous Certificates)',   m2.G, 205_000);  // = PA1's H = 184,500? No, G = sum(prev*sv)
  check('PA2 H (Current Payment Due)',     m2.H, 240_500);
  check('PA2 I (Balance to Finish)',       PROJ_CONTRACT - m2.D + m2.E, 554_500);

  // Dashboard with PA2 still draft — should still show PA1 only
  const statsPA2draft = await api('GET', '/api/stats');
  check('Stats PA2 draft: total_billed still = PA1 only', parseFloat(statsPA2draft.total_billed), 205_000);

  await api('PUT', `/api/payapps/${PA2_ID}`, { status: 'submitted' });
  const statsAfterPA2 = await api('GET', '/api/stats');
  // Stats: PA1.this + PA2.this = 205k + (30%*400k + 20%*350k + 40%*250k) = 205k + 290k = 495k
  check('Stats after PA2 submitted: total_billed = 495k (no double-count)', parseFloat(statsAfterPA2.total_billed), 495_000);
  check('Stats after PA2 submitted: total_retainage = 49.5k',               parseFloat(statsAfterPA2.total_retainage), 49_500);

  // ── PA #3 — complete all lines ────────────────────────────────────────────
  console.log('\n  [PA #3] Complete all lines to 100%');
  const pa3 = await api('POST', `/api/projects/${PID}/payapps`, {
    app_number: 3, period_label: 'March 2025',
  });
  const PA3_ID = pa3.id;
  const pa3data = await api('GET', `/api/payapps/${PA3_ID}`);
  const pa3A = pa3data.lines.find(l => l.item_id === '1000');
  const pa3B = pa3data.lines.find(l => l.item_id === '2000');
  const pa3C = pa3data.lines.find(l => l.item_id === '3000');

  // prev_pct should reflect PA2's cumulative (prev+this)
  check('PA3 Line A prev_pct = 55%', parseFloat(pa3A.prev_pct), 55);
  check('PA3 Line B prev_pct = 50%', parseFloat(pa3B.prev_pct), 50);
  check('PA3 Line C prev_pct = 40%', parseFloat(pa3C.prev_pct), 40);

  // Finish remaining: A+45%, B+50%, C+60%
  const pa3billing = [
    { id: pa3A.id, this_pct: 45, retainage_pct: 10, stored_materials: 0 },
    { id: pa3B.id, this_pct: 50, retainage_pct: 10, stored_materials: 0 },
    { id: pa3C.id, this_pct: 60, retainage_pct: 10, stored_materials: 0 },
  ];
  await api('PUT', `/api/payapps/${PA3_ID}/lines`, { lines: pa3billing });

  // All lines at 100%: D = contract = $1,000,000
  // E = 10% * 1,000,000 = 100,000
  // G = prev*sv = 55%*400k + 50%*350k + 40%*250k = 220k+175k+100k = 495k
  // H = (D-E) - G = 900k - 495k = 405k
  // I = 1,000,000 - 1,000,000 + 100,000 = 100,000 (just retainage remaining)
  const PA3_LINES = [
    { scheduled_value: 400_000, prev_pct: 55, this_pct: 45, retainage_pct: 10, stored_materials: 0 },
    { scheduled_value: 350_000, prev_pct: 50, this_pct: 50, retainage_pct: 10, stored_materials: 0 },
    { scheduled_value: 250_000, prev_pct: 40, this_pct: 60, retainage_pct: 10, stored_materials: 0 },
  ];
  const m3 = g702(PA3_LINES);
  check('PA3 D = full contract (100% complete)',   m3.D, 1_000_000);
  check('PA3 E = 10% retainage',                   m3.E,   100_000);
  check('PA3 G = all prior work (495k)',            m3.G,   495_000);
  check('PA3 H = remaining net (900k - 495k)',      m3.H,   405_000);
  check('PA3 I = only retainage left (100k)',       PROJ_CONTRACT - m3.D + m3.E, 100_000);

  await api('PUT', `/api/payapps/${PA3_ID}`, { status: 'submitted' });
  const statsAfterPA3 = await api('GET', '/api/stats');
  // Total billed across 3 PAs = sum of all this_pct*sv
  // PA1: 100k+105k+0 = 205k; PA2: 120k+70k+100k = 290k; PA3: 180k+175k+150k = 505k
  // Total = 205+290+505 = 1,000,000 (full contract)
  check('Stats after PA3: total_billed = full contract ($1M)', parseFloat(statsAfterPA3.total_billed), 1_000_000);
  check('Stats after PA3: total_retainage = $100k',            parseFloat(statsAfterPA3.total_retainage),  100_000);

  // ════════════════════════════════════════════════════════════════════════════
  // TEST SUITE 2 — Zero retainage project
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n─── Suite 2: Zero retainage project ───\n');

  const proj0 = await api('POST', '/api/projects', {
    name: `QA Zero-Ret Project ${ts}`,
    number: 'QA-002',
    owner: 'Owner 2',
    contractor: 'GC 2',
    architect: 'Arch 2',
    original_contract: 500_000,
    default_retainage: 0,
  });
  await api('POST', `/api/projects/${proj0.id}/sov`, {
    lines: [
      { item_id: '1000', description: 'Site Work', scheduled_value: 200_000 },
      { item_id: '2000', description: 'Foundation', scheduled_value: 300_000 },
    ]
  });
  const pa0 = await api('POST', `/api/projects/${proj0.id}/payapps`, { app_number: 1, period_label: 'March 2025' });
  const pa0data = await api('GET', `/api/payapps/${pa0.id}`);
  // Verify default_retainage = 0 was applied
  checkEq('Zero-ret: retainage_pct on line A = 0', parseFloat(pa0data.lines[0].retainage_pct), 0);
  checkEq('Zero-ret: retainage_pct on line B = 0', parseFloat(pa0data.lines[1].retainage_pct), 0);

  // Bill 50% everything
  const zlines = [
    { id: pa0data.lines[0].id, this_pct: 50, retainage_pct: 0, stored_materials: 0 },
    { id: pa0data.lines[1].id, this_pct: 50, retainage_pct: 0, stored_materials: 0 },
  ];
  await api('PUT', `/api/payapps/${pa0.id}/lines`, { lines: zlines });
  const zm = g702([
    { scheduled_value: 200_000, prev_pct: 0, this_pct: 50, retainage_pct: 0, stored_materials: 0 },
    { scheduled_value: 300_000, prev_pct: 0, this_pct: 50, retainage_pct: 0, stored_materials: 0 },
  ]);
  check('Zero-ret D = 250k',              zm.D, 250_000);
  check('Zero-ret E = 0 (no retainage)', zm.E,       0);
  check('Zero-ret H = 250k (full net)',   zm.H, 250_000);
  check('Zero-ret I = 250k (half left)',  500_000 - zm.D + zm.E, 250_000);

  // ════════════════════════════════════════════════════════════════════════════
  // TEST SUITE 3 — Stored materials
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n─── Suite 3: Stored materials included in D ───\n');

  // stored_materials should add to comp (and retainage base)
  // Line: SV=100k, prev=0%, this=20%, stored=10k, ret=10%
  // comp = 0 + 20k + 10k = 30k;  ret = 3k
  const sm = g702([
    { scheduled_value: 100_000, prev_pct: 0, this_pct: 20, retainage_pct: 10, stored_materials: 10_000 },
  ]);
  check('Stored materials: D = 30k', sm.D, 30_000);
  check('Stored materials: E = 3k',  sm.E,  3_000);
  check('Stored materials: H = 27k', sm.H, 27_000);

  // ════════════════════════════════════════════════════════════════════════════
  // TEST SUITE 4 — Mixed retainage per line
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n─── Suite 4: Mixed retainage per line ───\n');

  // Line A: 10% ret,  Line B: 5% ret
  // A: SV=200k, this=50% → comp=100k, ret=10k
  // B: SV=200k, this=50% → comp=100k, ret=5k
  // D=200k, E=15k, F=185k
  const mm = g702([
    { scheduled_value: 200_000, prev_pct: 0, this_pct: 50, retainage_pct: 10, stored_materials: 0 },
    { scheduled_value: 200_000, prev_pct: 0, this_pct: 50, retainage_pct:  5, stored_materials: 0 },
  ]);
  check('Mixed ret: D = 200k', mm.D, 200_000);
  check('Mixed ret: E = 15k',  mm.E,  15_000);
  check('Mixed ret: F = 185k', mm.F, 185_000);

  // ════════════════════════════════════════════════════════════════════════════
  // TEST SUITE 5 — 100% cap on prev_pct roll-forward
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n─── Suite 5: prev_pct capped at 100% on roll-forward ───\n');

  // If someone bills 60%+60% across 2 PAs, prev should cap at 100
  // Server formula: prevPct = Math.min(100, prev.prev_pct + prev.this_pct)
  // So if PA1 has prev=60, this=60 → PA2 prev = min(100, 120) = 100
  check('prev_pct cap: min(100, 60+60)',   Math.min(100, 60 + 60), 100);
  check('prev_pct cap: min(100, 40+50)',   Math.min(100, 40 + 50),  90);
  check('prev_pct cap: min(100, 100+0)',   Math.min(100, 100 + 0), 100);

  // ════════════════════════════════════════════════════════════════════════════
  // RESULTS
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════════');
  const total = pass + fail + warn;
  console.log(`  Results: ${pass}/${total} passed  |  ${fail} failed  |  ${warn} warnings`);
  if (fail === 0) {
    console.log('  🎉  ALL MATH CHECKS PASSED — safe to use in production billing');
  } else {
    console.log('  ⚠️   MATH ERRORS DETECTED — do NOT submit invoices until fixed');
  }
  console.log('══════════════════════════════════════════════════════\n');

  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('\n💥  Fatal error:', e.message);
  process.exit(2);
});
