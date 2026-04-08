/**
 * ARCHITECTURE SANITY TEST
 * ========================
 * Catches the "fixed the wrong file" class of bug.
 *
 * Background (April 2026): CO math fix was applied to the monolithic server.js
 * but the live server uses server/routes/payApps.js. The bug went undetected
 * because tests were checking patterns in the wrong file.
 *
 * This test:
 * 1. Reads server/app.js to discover which route files are actually mounted
 * 2. For each pay-app-related route file, verifies critical formulas exist
 * 3. Fails with a precise message telling you WHICH file is missing WHICH formula
 *
 * Run: node tests/arch/arch-sanity.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅  ${label}`);
  } else {
    failed++;
    failures.push({ label, detail });
    console.log(`  ❌  ${label}`);
    if (detail) console.log(`      → ${detail}`);
  }
}

// ─── Step 1: Parse server/app.js to find live route files ────────────────────

console.log('\n[1] Discovering live route files from server/app.js...\n');

const appJs = fs.readFileSync(path.join(ROOT, 'server', 'app.js'), 'utf8');

// Extract all require('./routes/...') calls
const routeRequires = [...appJs.matchAll(/require\(['"]\.\/routes\/(\w+)['"]\)/g)]
  .map(m => m[1]);

const uniqueRoutes = [...new Set(routeRequires)];
console.log(`  Found ${uniqueRoutes.length} route files mounted in server/app.js:`);
uniqueRoutes.forEach(r => console.log(`    - server/routes/${r}.js`));

// Verify all referenced route files actually exist
console.log('\n[2] Verifying all route files exist on disk...\n');
uniqueRoutes.forEach(routeName => {
  const filePath = path.join(ROOT, 'server', 'routes', `${routeName}.js`);
  check(
    `server/routes/${routeName}.js exists`,
    fs.existsSync(filePath),
    `Missing file: ${filePath}`
  );
});

// ─── Step 2: Critical formula checks per route file ──────────────────────────

console.log('\n[3] Checking critical CO math formulas in pay-app routes...\n');

// Routes that handle pay app generation (HTML, PDF, email, Puppeteer)
// These MUST contain the CO math formulas
const PAY_APP_GENERATION_ROUTES = ['payApps'];

// Routes that handle change order data but don't generate G702 output
// These only need the void filter on list endpoints
const CO_AWARE_ROUTES = ['payApps', 'projects'];

const CRITICAL_FORMULAS = [
  {
    id: 'void_filter',
    description: 'tCO filters void/voided change orders',
    pattern: "status!=='void'&&c.status!=='voided'",
    appliesTo: PAY_APP_GENERATION_ROUTES,
    reason: 'Without this, voided COs inflate H (current payment due)',
  },
  {
    id: 'tco_in_due',
    description: 'due formula includes +tCO (CO amounts added to H at full value)',
    pattern: 'Math.max(0,earned-tPrevCert)+tCO',
    appliesTo: PAY_APP_GENERATION_ROUTES,
    reason: 'Without this, change orders appear in B but are missing from H',
  },
  {
    id: 'retainage_release_check',
    description: 'due formula handles retainage-release pay apps',
    pattern: 'pa.is_retainage_release',
    appliesTo: PAY_APP_GENERATION_ROUTES,
    reason: 'Retainage-release pay apps use stored amount_due, not computed value',
  },
];

for (const routeName of PAY_APP_GENERATION_ROUTES) {
  const filePath = path.join(ROOT, 'server', 'routes', `${routeName}.js`);
  if (!fs.existsSync(filePath)) continue;

  const content = fs.readFileSync(filePath, 'utf8');

  for (const formula of CRITICAL_FORMULAS) {
    if (!formula.appliesTo.includes(routeName)) continue;

    const occurrences = (content.match(new RegExp(formula.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

    check(
      `server/routes/${routeName}.js — "${formula.description}" (found ${occurrences}x)`,
      occurrences > 0,
      `MISSING: ${formula.pattern}\n      Reason: ${formula.reason}`
    );
  }
}

// ─── Step 3: Verify monolithic server.js is NOT the entry point ──────────────

console.log('\n[4] Verifying server entry point (must NOT be monolithic server.js)...\n');

const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const startScript = pkgJson.scripts?.start || '';
const nixToml = fs.existsSync(path.join(ROOT, 'nixpacks.toml'))
  ? fs.readFileSync(path.join(ROOT, 'nixpacks.toml'), 'utf8')
  : '';
const railwayToml = fs.existsSync(path.join(ROOT, 'railway.toml'))
  ? fs.readFileSync(path.join(ROOT, 'railway.toml'), 'utf8')
  : '';

// The server MUST start via server/index.js (the modular entrypoint)
const startCmd = railwayToml.match(/startCommand\s*=\s*"([^"]+)"/)?.[1] || startScript;
check(
  `Server entry point is server/index.js (not monolithic server.js)`,
  startCmd.includes('server/index.js') || startCmd.includes('server\\index.js'),
  `Start command is "${startCmd}" — if it's "node server.js", fixes to server/routes/* won't be live`
);

// ─── Step 4: CO math in server.js and server/routes/payApps.js must agree ────

console.log('\n[5] Checking formula parity between server.js and server/routes/payApps.js...\n');

const legacyServerJs = path.join(ROOT, 'server.js');
const activeRouteFile = path.join(ROOT, 'server', 'routes', 'payApps.js');

if (fs.existsSync(legacyServerJs) && fs.existsSync(activeRouteFile)) {
  const legacyContent = fs.readFileSync(legacyServerJs, 'utf8');
  const activeContent = fs.readFileSync(activeRouteFile, 'utf8');

  for (const formula of CRITICAL_FORMULAS) {
    const inLegacy = legacyContent.includes(formula.pattern);
    const inActive = activeContent.includes(formula.pattern);

    check(
      `Formula parity: "${formula.description}" in both server.js AND payApps.js`,
      inLegacy && inActive,
      !inLegacy
        ? `MISSING from server.js (legacy file — less critical but should match)`
        : `MISSING from server/routes/payApps.js (LIVE file — this WILL cause bugs in production)`
    );
  }
}

// ─── Step 5: Verify G702 math formulas in client-side lib ────────────────────

console.log('\n[6] Checking client-side G702 math library...\n');

const g702Lib = path.join(ROOT, 'client', 'src', 'lib', 'g702math.ts');
if (fs.existsSync(g702Lib)) {
  const g702Content = fs.readFileSync(g702Lib, 'utf8');

  const clientFormulas = [
    { desc: 'computeLine function exists', pattern: 'computeLine' },
    { desc: 'computePayAppTotals function exists', pattern: 'computePayAppTotals' },
    { desc: 'retainage calculation (comp * retPct)', pattern: 'retPct' },
    { desc: 'balance to finish (A - D + E)', pattern: 'scheduledValue' },
  ];

  for (const f of clientFormulas) {
    check(
      `client/src/lib/g702math.ts — ${f.desc}`,
      g702Content.includes(f.pattern),
      `Pattern not found: "${f.pattern}"`
    );
  }
} else {
  check('client/src/lib/g702math.ts exists', false, `File not found: ${g702Lib}`);
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(60));
console.log(`Architecture Sanity: Total ${passed + failed}  |  ✅ ${passed}  |  ❌ ${failed}`);
console.log('─'.repeat(60));

if (failures.length > 0) {
  console.log('\n⛔ FAILURES — DO NOT PUSH:\n');
  failures.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f.label}`);
    if (f.detail) console.log(`     ${f.detail}`);
  });
  console.log('');
  process.exit(1);
} else {
  console.log('\n🎉 Architecture is clean — all critical formulas are in the live route files.\n');
  process.exit(0);
}
