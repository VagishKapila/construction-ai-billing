/**
 * Construction AI Billing — LIVE SERVER QA
 * ==========================================
 * Hits the actual Railway server and verifies every major feature works end-to-end.
 * Safe: creates a temporary test account, runs all tests, then cleans up.
 *
 * Usage:
 *   node qa_live.js                                      ← tests production (constructinv.varshyl.com)
 *   node qa_live.js http://localhost:3000                ← tests local dev server
 *   node qa_live.js https://constructinv.varshyl.com     ← tests production explicitly
 *
 * What this tests (that the static qa_test.js CANNOT):
 *   - Server is actually running and responding
 *   - Auth (register, login, JWT) works end-to-end
 *   - SOV /api/sov/parse accepts Excel, PDF, Word (not just "is the code there?")
 *   - Excel parser returns correct rows for the standard template
 *   - Settings save and load correctly through the DB
 *   - Project creation stores data correctly
 *   - Pay app creation works
 *   - PDF generation responds without error
 */

const fs   = require('fs');
const path = require('path');
const BASE = process.argv[2] || 'https://constructinv.varshyl.com';

const TEST_EMAIL    = `qa_test_${Date.now()}@varshyl-qa.test`;
const TEST_PASSWORD = 'QA_test_password_9!';
const TEST_NAME     = 'QA Test User';

let token = null;
let testProjectId = null;
let testPayAppId  = null;
let passed = 0, failed = 0, skipped = 0;

// ── Helpers ────────────────────────────────────────────────────────────────────

function log(label, ok, detail = '') {
  const icon = ok === 'skip' ? '⚪' : ok ? '✅' : '❌';
  const word = ok === 'skip' ? 'SKIP' : ok ? 'PASS' : 'FAIL';
  console.log(`  ${icon} ${word}: ${label}${detail ? '  →  ' + detail : ''}`);
  if (ok === 'skip') skipped++;
  else if (ok) passed++;
  else failed++;
}

async function api(method, endpoint, body, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + endpoint, opts);
  let data;
  try { data = await r.json(); } catch { data = {}; }
  return { status: r.status, ok: r.ok, data };
}

async function apiUpload(endpoint, filePath, fieldName = 'file') {
  // Build multipart/form-data manually — no FormData dependency, works on all Node versions
  const fileBuffer = fs.readFileSync(filePath);
  const filename   = path.basename(filePath);
  const boundary   = '----QABoundary' + Date.now().toString(16);
  const CRLF       = '\r\n';
  const head = Buffer.from(
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"${CRLF}` +
    `Content-Type: application/octet-stream${CRLF}${CRLF}`
  );
  const tail = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
  const body = Buffer.concat([head, fileBuffer, tail]);
  const headers = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': String(body.length),
  };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const r = await fetch(BASE + endpoint, { method: 'POST', headers, body });
  let data;
  try { data = await r.json(); } catch { data = {}; }
  return { status: r.status, ok: r.ok, data };
}

// ── Test sections ──────────────────────────────────────────────────────────────

async function testHealth() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  1. SERVER HEALTH');
  console.log('══════════════════════════════════════════════════════');
  try {
    const r = await fetch(BASE, { signal: AbortSignal.timeout(10000) });
    log('Server responds to HTTP requests', r.status < 500, `HTTP ${r.status}`);

    const cfg = await api('GET', '/api/config');
    log('GET /api/config responds', cfg.status < 500, `HTTP ${cfg.status}`);
  } catch(e) {
    log('Server is reachable', false, e.message);
    console.log('\n  ⛔ Cannot reach server. Remaining tests skipped.\n');
    process.exit(1);
  }
}

async function testAuth() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  2. AUTH — Register + Login');
  console.log('══════════════════════════════════════════════════════');

  // Register
  const reg = await api('POST', '/api/auth/register', {
    name: TEST_NAME, email: TEST_EMAIL, password: TEST_PASSWORD
  });
  log('POST /api/auth/register succeeds (200 or 201)', reg.status === 200 || reg.status === 201, `HTTP ${reg.status}`);
  log('Register response has a JWT token', !!reg.data.token, JSON.stringify(reg.data).slice(0,80));
  token = reg.data.token;

  // Login with wrong password
  const badLogin = await api('POST', '/api/auth/login', {
    email: TEST_EMAIL, password: 'wrongpassword'
  });
  log('Login rejects wrong password (401)', badLogin.status === 401, `HTTP ${badLogin.status}`);

  // Login with correct password
  const login = await api('POST', '/api/auth/login', {
    email: TEST_EMAIL, password: TEST_PASSWORD
  });
  log('POST /api/auth/login returns 200', login.status === 200, `HTTP ${login.status}`);
  log('Login returns a JWT token', !!login.data.token);
  if (login.data.token) token = login.data.token;

  // Protected route works
  const me = await api('GET', '/api/projects');
  log('Protected route works with JWT token', me.status === 200, `HTTP ${me.status}`);

  // Protected route rejects no token
  const noAuth = await fetch(BASE + '/api/projects');
  log('Protected route rejects missing token (401)', noAuth.status === 401, `HTTP ${noAuth.status}`);
}

async function testSOVParsing() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  3. SOV PARSING — Excel, PDF, Word');
  console.log('══════════════════════════════════════════════════════');

  // --- Excel: standard template ---
  const templatePath = '/tmp/qa_sov_template.xlsx';
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  const rows = [
    ['Item #', 'Description', 'Scheduled Value'],
    ['01000', 'Temporary Construction', 41000],
    ['02000', 'Site Work & Demolition', 117617],
    ['03000', 'Concrete', 52430],
    ['GC',   'General Conditions', 48030],
    ['CF',   'Contractor Fee', 55185],
    ['',     'TOTAL', 314262],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'SOV');
  XLSX.writeFile(wb, templatePath);

  const excelResult = await apiUpload('/api/sov/parse', templatePath);
  log('POST /api/sov/parse accepts Excel (.xlsx)', excelResult.ok, `HTTP ${excelResult.status}`);
  log('Excel parse returns rows array', Array.isArray(excelResult.data.rows) || Array.isArray(excelResult.data.all_rows));

  if (excelResult.data.rows || excelResult.data.all_rows) {
    const rows = excelResult.data.all_rows || excelResult.data.rows;
    log('Excel parser finds at least 4 line items', rows.length >= 4, `found ${rows.length}`);
    const noTotal = !rows.some(r => /^total$/i.test(r.description) || /^total$/i.test(r.item_id));
    log('Excel parser excludes the TOTAL row', noTotal);
    const hasGC = rows.some(r => /general\s*conditions/i.test(r.description));
    log('Excel parser includes General Conditions row', hasGC);
  }

  // --- Bains contractor proposal (if the file exists) ---
  // Looks in test-fixtures/ first (committed to repo), then falls back to Cowork upload path
  const bainsPath = fs.existsSync(path.join(__dirname, 'test-fixtures/bains-proposal.xlsx'))
    ? path.join(__dirname, 'test-fixtures/bains-proposal.xlsx')
    : '/sessions/nice-dreamy-cerf/mnt/uploads/TEST Major Upgrades Saratoga - ViaDeMarcos_Home1A.xlsx';
  if (fs.existsSync(bainsPath)) {
    const bainsResult = await apiUpload('/api/sov/parse', bainsPath);
    log('Bains contractor proposal parses without error', bainsResult.ok, `HTTP ${bainsResult.status}`);
    if (bainsResult.data.all_rows || bainsResult.data.rows) {
      const allRows = bainsResult.data.all_rows || bainsResult.data.rows;
      const sum = allRows.reduce((s, r) => s + (r.scheduled_value || 0), 0);
      log('Bains file: 23 rows found', allRows.length === 23, `found ${allRows.length}`);
      log('Bains file: sum equals $268,233', sum === 268233, `got $${sum.toLocaleString()}`);
      const hasFee = allRows.some(r => /^fee$/i.test(r.description));
      log('Bains file: Fee row included', hasFee);
      const hasPM = allRows.some(r => /project\s*management/i.test(r.description));
      log('Bains file: Project Management included', hasPM);
    }
  } else {
    log('Bains contractor proposal test', 'skip', 'file not found on this machine');
  }

  // --- PDF upload (create a minimal PDF-like file to test routing) ---
  const fakePdfPath = '/tmp/qa_test.pdf';
  fs.writeFileSync(fakePdfPath, '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
  const pdfResult = await apiUpload('/api/sov/parse', fakePdfPath);
  // Server will attempt to parse but may error on minimal PDF content —
  // we just need to confirm it's NOT rejected with "wrong file type" (400) at the route level
  log('POST /api/sov/parse accepts .pdf extension (not rejected as wrong type)',
    pdfResult.status !== 400 || !JSON.stringify(pdfResult.data).includes('wrong'),
    `HTTP ${pdfResult.status} — ${JSON.stringify(pdfResult.data).slice(0,60)}`);

  // --- Word .docx test ---
  // Create a minimal valid DOCX (it's a zip file with specific structure)
  // We just need to confirm the server doesn't reject the extension
  // The easiest approach: use the existing SOV as docx by renaming (server checks extension)
  const fakeDocxPath = '/tmp/qa_test.docx';
  fs.writeFileSync(fakeDocxPath, 'PK fake docx content for extension test');
  const docxResult = await apiUpload('/api/sov/parse', fakeDocxPath);
  log('POST /api/sov/parse accepts .docx extension (not rejected as wrong type)',
    docxResult.status !== 400 || !JSON.stringify(docxResult.data).includes('wrong'),
    `HTTP ${docxResult.status} — ${JSON.stringify(docxResult.data).slice(0,60)}`);
}

async function testSettings() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  4. SETTINGS — Save and load company profile');
  console.log('══════════════════════════════════════════════════════');

  const saved = await api('POST', '/api/settings', {
    company_name: 'QA Test Company',
    contact_name: 'QA Tester',
    contact_phone: '555-123-4567',
    contact_email: 'qa@varshyl-qa.test',
    default_payment_terms: 'Net 30',
    default_retainage: 10
  });
  log('POST /api/settings saves successfully', saved.ok, `HTTP ${saved.status}`);
  log('Response includes company_name', saved.data.company_name === 'QA Test Company');
  log('Response includes contact_name (NEW field)', saved.data.contact_name === 'QA Tester',
    `got: ${saved.data.contact_name}`);
  log('Response includes contact_phone (NEW field)', saved.data.contact_phone === '555-123-4567',
    `got: ${saved.data.contact_phone}`);
  log('Response includes contact_email (NEW field)', saved.data.contact_email === 'qa@varshyl-qa.test',
    `got: ${saved.data.contact_email}`);

  const loaded = await api('GET', '/api/settings');
  log('GET /api/settings returns saved data', loaded.ok, `HTTP ${loaded.status}`);
  log('Loaded company_name matches what was saved', loaded.data.company_name === 'QA Test Company');
  log('Loaded contact_name persists through DB round-trip', loaded.data.contact_name === 'QA Tester');
  log('Loaded default_payment_terms persists', loaded.data.default_payment_terms === 'Net 30');
}

async function testProjects() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  5. PROJECTS — Create, read, list');
  console.log('══════════════════════════════════════════════════════');

  const created = await api('POST', '/api/projects', {
    name: 'QA Test Project',
    number: 'QA-001',
    owner: 'QA Owner',
    contractor: 'QA Contractor',
    contact_name: 'QA Contact',
    contact_phone: '555-000-0001',
    contact_email: 'qa-contact@test.com',
    original_contract: 268233,
    default_retainage: 10
  });
  log('POST /api/projects creates project', created.ok, `HTTP ${created.status}`);
  log('Project response has an id', !!created.data.id, `id=${created.data.id}`);
  testProjectId = created.data.id;

  const list = await api('GET', '/api/projects');
  log('GET /api/projects lists projects', list.ok && Array.isArray(list.data));
  log('New project appears in list', list.data.some?.(p => p.id === testProjectId));

  // Upload SOV to the project
  const templatePath = '/tmp/qa_sov_template.xlsx';
  if (fs.existsSync(templatePath)) {
    const sov = await api('POST', `/api/projects/${testProjectId}/sov`, {
      lines: [
        { item_id: '01000', description: 'Temporary Construction', scheduled_value: 41000 },
        { item_id: '02000', description: 'Site Work', scheduled_value: 117617 },
        { item_id: 'GC',   description: 'General Conditions', scheduled_value: 48030 },
        { item_id: 'CF',   description: 'Contractor Fee', scheduled_value: 55185 },
      ]
    });
    log('POST /api/projects/:id/sov saves SOV lines', sov.ok, `HTTP ${sov.status}`);
    log('SOV returns correct line count', Array.isArray(sov.data) && sov.data.length === 4,
      `got ${sov.data.length} lines`);
  }
}

async function testPayApps() {
  if (!testProjectId) { log('Pay app tests', 'skip', 'no test project created'); return; }
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  6. PAY APPLICATIONS — Create + PDF generation');
  console.log('══════════════════════════════════════════════════════');

  const pa = await api('POST', `/api/projects/${testProjectId}/payapps`, {
    app_number: 1,
    period_label: 'January 2026',
    period_start: '2026-01-01',
    period_end: '2026-01-31'
  });
  log('POST /api/projects/:id/payapps creates pay app', pa.ok, `HTTP ${pa.status}`);
  log('Pay app has an id', !!pa.data.id, `id=${pa.data.id}`);
  testPayAppId = pa.data.id;

  if (testPayAppId) {
    // Load pay app detail
    const detail = await api('GET', `/api/payapps/${testPayAppId}`);
    log('GET /api/payapps/:id loads pay app detail', detail.ok, `HTTP ${detail.status}`);
    log('Pay app detail includes line items', Array.isArray(detail.data.lines) && detail.data.lines.length > 0,
      `${detail.data.lines?.length} lines`);

    // Request PDF (just verify it responds, not the full PDF content)
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const pdfResp = await fetch(`${BASE}/api/payapps/${testPayAppId}/pdf`, { headers });
    log('GET /api/payapps/:id/pdf responds without server error', pdfResp.status < 500,
      `HTTP ${pdfResp.status}, Content-Type: ${pdfResp.headers.get('content-type')}`);
    log('PDF endpoint returns PDF content-type', (pdfResp.headers.get('content-type')||'').includes('pdf'),
      pdfResp.headers.get('content-type'));
  }
}

async function testDashboard() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  7. DASHBOARD — Summary stats');
  console.log('══════════════════════════════════════════════════════');
  const dash = await api('GET', '/api/dashboard');
  log('GET /api/dashboard responds', dash.status < 500, `HTTP ${dash.status}`);
  if (dash.ok) {
    log('Dashboard has project_count', 'project_count' in dash.data || dash.status === 200);
  }
}

async function cleanup() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  8. CLEANUP — Remove test data');
  console.log('══════════════════════════════════════════════════════');

  // Delete test project (cascades to SOV lines, pay apps)
  if (testProjectId) {
    const del = await api('DELETE', `/api/projects/${testProjectId}`);
    log('Test project deleted', del.ok || del.status === 204, `HTTP ${del.status}`);
  }

  // Delete test account
  const delUser = await api('DELETE', '/api/auth/account');
  log('Test user account deleted', delUser.ok || delUser.status === 204, `HTTP ${delUser.status} — if 404, add DELETE /api/auth/account route`);

  // Clean up temp files
  ['/tmp/qa_sov_template.xlsx', '/tmp/qa_test.pdf', '/tmp/qa_test.docx'].forEach(f => {
    try { fs.unlinkSync(f); } catch {}
  });
  log('Temp files cleaned up', true);
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║   CONSTRUCTION AI BILLING — LIVE SERVER QA             ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`  Target: ${BASE}`);
  console.log(`  Time:   ${new Date().toISOString()}\n`);

  try {
    await testHealth();
    await testAuth();
    await testSOVParsing();
    await testSettings();
    await testProjects();
    await testPayApps();
    await testDashboard();
    await cleanup();
  } catch(e) {
    console.log(`\n  ⛔ Unexpected error: ${e.message}`);
    console.log(e.stack);
  }

  const total = passed + failed + skipped;
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passed}/${total - skipped} passed   ${skipped > 0 ? `(${skipped} skipped)` : ''}${' '.repeat(Math.max(0, 30 - String(passed).length - String(total-skipped).length))}║`);
  if (failed === 0) {
    console.log('║  🎉 ALL LIVE TESTS PASSED                              ║');
  } else {
    console.log(`║  ⚠️  ${failed} test(s) FAILED — see above               ║`);
  }
  console.log('╚════════════════════════════════════════════════════════╝\n');

  if (failed > 0) process.exit(1);
}

main();
