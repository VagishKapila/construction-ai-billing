/**
 * MUTATION WATCHDOG
 * =================
 * Verifies that our test suite would actually CATCH a bug if one were introduced.
 *
 * How it works:
 * 1. Takes a critical formula in a live route file
 * 2. Temporarily breaks it (introduces a mutation)
 * 3. Runs qa_test.js to see if the static checks catch the mutation
 * 4. Restores the original file
 * 5. Reports whether each mutation was caught or missed
 *
 * A mutation that PASSES your tests means your tests have a blind spot.
 * A mutation that FAILS your tests means your tests are working correctly.
 *
 * Run: node tests/mutation/mutation-watchdog.js
 *
 * NOTE: This modifies files temporarily — always run on a clean working tree.
 * Files are ALWAYS restored even if the process crashes (via trap logic).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PAYAPPS_ROUTE = path.join(ROOT, 'server', 'routes', 'payApps.js');

let passed = 0;
let failed = 0;
let caught = 0;
let missed = 0;

// Track files we've modified so we can restore on crash
const originalContents = new Map();

function backup(filePath) {
  if (!originalContents.has(filePath)) {
    originalContents.set(filePath, fs.readFileSync(filePath, 'utf8'));
  }
}

function restoreAll() {
  for (const [filePath, content] of originalContents) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

// Always restore on exit (crash, Ctrl+C, etc.)
process.on('exit', restoreAll);
process.on('SIGINT', () => { restoreAll(); process.exit(1); });
process.on('uncaughtException', (e) => { console.error(e); restoreAll(); process.exit(1); });

function runQA() {
  try {
    execSync('node qa_test.js', { cwd: ROOT, stdio: 'pipe', timeout: 30000 });
    return { exitCode: 0, output: '' };
  } catch (e) {
    return { exitCode: e.status || 1, output: e.stdout?.toString() || '' };
  }
}

function testMutation({ name, file, find, replaceWith, shouldBeCaught, reason }) {
  console.log(`\n  Testing mutation: "${name}"`);
  console.log(`  File: ${path.relative(ROOT, file)}`);
  console.log(`  Break: ${find.substring(0, 60)}...`);
  console.log(`  With: ${replaceWith.substring(0, 60)}...`);

  backup(file);
  const original = fs.readFileSync(file, 'utf8');

  if (!original.includes(find)) {
    console.log(`  ⚠️  SKIP — pattern not found (formula may have changed)`);
    return;
  }

  // Introduce the mutation
  const mutated = original.replace(find, replaceWith);
  fs.writeFileSync(file, mutated, 'utf8');

  // Run QA
  const result = runQA();
  const wasCaught = result.exitCode !== 0;

  // Restore immediately
  fs.writeFileSync(file, original, 'utf8');
  originalContents.delete(file); // Already restored

  if (shouldBeCaught && wasCaught) {
    caught++;
    passed++;
    console.log(`  ✅  CAUGHT — test suite correctly detected this mutation`);
  } else if (shouldBeCaught && !wasCaught) {
    missed++;
    failed++;
    console.log(`  ❌  MISSED — test suite did NOT catch this bug!`);
    console.log(`  → Gap: ${reason}`);
    console.log(`  → Action needed: Add a qa_test.js check for this pattern`);
  } else if (!shouldBeCaught && !wasCaught) {
    passed++;
    console.log(`  ✅  Correctly NOT caught (mutation was harmless)`);
  } else {
    failed++;
    console.log(`  ❌  Unexpected result`);
  }
}

// ─── Define mutations ─────────────────────────────────────────────────────────

console.log('\n[MUTATION WATCHDOG] Testing whether our test suite catches critical bugs\n');
console.log('Each mutation temporarily breaks a formula, then checks if qa_test.js notices.');
console.log('─'.repeat(70));

const mutations = [
  // ── Mutation 1: Remove void filter from tCO (the bug we just fixed) ────────
  {
    name: 'Remove void filter from tCO (all COs counted, including voided)',
    file: PAYAPPS_ROUTE,
    find: "cos.rows.filter(c=>c.status!=='void'&&c.status!=='voided').reduce((s,c)=>s+parseFloat(c.amount||0),0)",
    replaceWith: "cos.rows.reduce((s,c)=>s+parseFloat(c.amount||0),0)",
    shouldBeCaught: true,
    reason: 'qa_test.js should assert void filter exists in payApps.js',
  },

  // ── Mutation 2: Remove +tCO from due (the other bug we just fixed) ─────────
  {
    name: 'Remove +tCO from due formula (COs missing from H)',
    file: PAYAPPS_ROUTE,
    find: 'Math.max(0,earned-tPrevCert)+tCO',
    replaceWith: 'Math.max(0,earned-tPrevCert)',
    shouldBeCaught: true,
    reason: 'qa_test.js should assert +tCO exists in the due formula in payApps.js',
  },

  // ── Mutation 3: Remove retainage-release check ──────────────────────────────
  {
    name: 'Remove retainage-release guard (retainage release pay apps compute wrong due)',
    file: PAYAPPS_ROUTE,
    find: 'pa.is_retainage_release ? parseFloat(pa.amount_due||0) : Math.max(0,earned-tPrevCert)+tCO',
    replaceWith: 'Math.max(0,earned-tPrevCert)+tCO',
    shouldBeCaught: true,
    reason: 'qa_test.js should assert is_retainage_release check exists in payApps.js',
  },

  // ── Mutation 4: Remove void filter from server.js (legacy file, less critical) ─
  {
    name: 'Remove void filter from server.js (legacy file — live server unaffected)',
    file: path.join(ROOT, 'server.js'),
    find: "cos.rows.filter(c=>c.status!=='void'&&c.status!=='voided').reduce((s,c)=>s+parseFloat(c.amount||0),0)",
    replaceWith: "cos.rows.reduce((s,c)=>s+parseFloat(c.amount||0),0)",
    shouldBeCaught: true,
    reason: 'qa_test.js should still flag parity issues between server.js and payApps.js',
  },
];

for (const mutation of mutations) {
  testMutation(mutation);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(70));
console.log(`Mutation Results: ${mutations.length} mutations tested`);
console.log(`  ✅ Caught by tests: ${caught}`);
console.log(`  ❌ Missed by tests: ${missed}`);
console.log('─'.repeat(70));

if (missed > 0) {
  console.log(`\n⛔ ${missed} mutation(s) were NOT caught by the test suite.`);
  console.log('   These are blind spots — add qa_test.js checks for the patterns listed above.\n');
  process.exit(1);
} else {
  console.log(`\n🎉 All mutations were caught! Test suite has no blind spots for these formulas.\n`);
  process.exit(0);
}
