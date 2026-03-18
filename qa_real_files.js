/**
 * Real-file SOV parser test — hits live Railway server
 * Tests actual contractor documents in Excel and PDF formats
 */
const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

const BASE = 'https://constructinv.varshyl.com';
const TEST_EMAIL    = `qa_realfile_${Date.now()}@varshyl-qa.test`;
const TEST_PASSWORD = 'QA_realfile_9!';

let passed = 0, failed = 0, skipped = 0;
const results = [];

function log(label, result, detail = '') {
  const icon = result === true ? '✅' : result === false ? '❌' : '⏭️ ';
  const status = result === true ? 'PASS' : result === false ? 'FAIL' : 'SKIP';
  if (result === true) passed++;
  else if (result === false) failed++;
  else skipped++;
  const line = `  ${icon} ${status}: ${label}${detail ? `  →  ${detail}` : ''}`;
  console.log(line);
  results.push({ label, result, detail });
}

function request(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + urlPath);
    const lib = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json', ...headers }
    };
    if (body) {
      const b = typeof body === 'string' ? body : JSON.stringify(body);
      opts.headers['Content-Length'] = Buffer.byteLength(b);
    }
    const req = lib.request(opts, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        let data;
        try { data = JSON.parse(raw); } catch { data = raw; }
        resolve({ status: res.statusCode, ok: res.statusCode < 400, data });
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function apiUpload(urlPath, filePath, token) {
  return new Promise((resolve, reject) => {
    const boundary = '----QABoundary' + Date.now().toString(16);
    const CRLF = '\r\n';
    const filename = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);
    const head = Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}` +
      `Content-Type: application/octet-stream${CRLF}${CRLF}`
    );
    const tail = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
    const body = Buffer.concat([head, fileBuffer, tail]);

    const url = new URL(BASE + urlPath);
    const lib = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    };
    const req = lib.request(opts, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        let data;
        try { data = JSON.parse(raw); } catch { data = raw; }
        resolve({ status: res.statusCode, ok: res.statusCode < 400, data });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function printTable(rows) {
  if (!rows || !rows.length) { console.log('    (no rows)'); return; }
  const maxDesc = Math.min(40, Math.max(...rows.map(r => (r.description||'').length)));
  console.log(`    ${'#'.padStart(3)}  ${'Description'.padEnd(maxDesc)}  ${'Amount'.padStart(12)}`);
  console.log(`    ${'---'.padStart(3)}  ${''.padEnd(maxDesc, '-')}  ${'------------'.padStart(12)}`);
  rows.forEach((r, i) => {
    const desc = (r.description || '').substring(0, maxDesc).padEnd(maxDesc);
    const amt  = (r.scheduled_value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).padStart(12);
    console.log(`    ${String(i+1).padStart(3)}  ${desc}  ${amt}`);
  });
  const total = rows.reduce((s, r) => s + (r.scheduled_value || 0), 0);
  console.log(`    ${''.padStart(3)}  ${'TOTAL'.padEnd(maxDesc)}  ${total.toLocaleString('en-US').padStart(12)}`);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  REAL-FILE SOV PARSER TEST — constructinv.varshyl.com');
  console.log('══════════════════════════════════════════════════\n');

  // --- Auth setup ---
  console.log('🔐 Setting up test account...');
  const reg = await request('POST', '/api/auth/register', {
    email: TEST_EMAIL, password: TEST_PASSWORD, name: 'QA Real File'
  });
  if (!reg.ok && reg.status !== 200 && reg.status !== 201) {
    console.log(`❌ Could not register test account (HTTP ${reg.status}). Aborting.`);
    process.exit(1);
  }
  const login = await request('POST', '/api/auth/login', {
    email: TEST_EMAIL, password: TEST_PASSWORD
  });
  if (!login.ok || !login.data.token) {
    console.log('❌ Could not log in. Aborting.');
    process.exit(1);
  }
  const token = login.data.token;
  console.log('  ✅ Test account ready\n');

  // ================================================================
  // FILE 1: Bains Excel (known good — must get 23 rows, $268,233)
  // ================================================================
  console.log('══════════════════════════════════════════════════');
  console.log('  FILE 1: Bains Contractor Proposal (Excel .xlsx)');
  console.log('  Expected: 23 rows, total $268,233');
  console.log('  Checks: Project Mgmt, Superintendent, Contracts Admin, Fee');
  console.log('  Must exclude: Grand Total row, "By Others" rows');
  console.log('══════════════════════════════════════════════════');

  const xlsxPath = path.join(__dirname, 'test-fixtures/bains-proposal.xlsx');
  if (fs.existsSync(xlsxPath)) {
    const r1 = await apiUpload('/api/sov/parse', xlsxPath, token);
    log('Excel upload returns HTTP 200', r1.status === 200, `HTTP ${r1.status}`);
    const rows = r1.data.all_rows || r1.data.rows || [];
    const total = rows.reduce((s, r) => s + (r.scheduled_value || 0), 0);
    log('Bains Excel: exactly 23 line items', rows.length === 23, `found ${rows.length}`);
    log('Bains Excel: sum = $268,233', total === 268233, `got $${total.toLocaleString()}`);
    log('Bains Excel: Project Management included', rows.some(r => /project\s*management/i.test(r.description)));
    log('Bains Excel: Superintendent included', rows.some(r => /superintendent/i.test(r.description)));
    log('Bains Excel: Contracts Administration included', rows.some(r => /contracts\s*admin/i.test(r.description)));
    log('Bains Excel: Fee row included', rows.some(r => /^fee$/i.test(r.description)));
    log('Bains Excel: Grand Total row excluded', !rows.some(r => /grand\s*total/i.test(r.description)));
    log('Bains Excel: "By Others" (Windows) excluded', !rows.some(r => /windows/i.test(r.description)));
    console.log('\n  📋 Full parsed line items:');
    printTable(rows);
  } else {
    log('Bains Excel file', 'skip', 'file not found');
  }

  // ================================================================
  // FILE 2: Bains PDF version
  // ================================================================
  console.log('\n══════════════════════════════════════════════════');
  console.log('  FILE 2: Bains Contractor Proposal (PDF)');
  console.log('  PDF parsing is best-effort: amounts may be split across lines.');
  console.log('  Checks: no crashes, real work items found, no garbage metadata.');
  console.log('══════════════════════════════════════════════════');

  const pdfPath1 = path.join(__dirname, 'test-fixtures/bains-proposal.pdf');
  if (fs.existsSync(pdfPath1)) {
    const r2 = await apiUpload('/api/sov/parse', pdfPath1, token);
    log('PDF upload accepted (not rejected client-side)', r2.status !== 415, `HTTP ${r2.status}`);
    log('PDF upload returns HTTP 200', r2.status === 200, `HTTP ${r2.status}`);
    if (r2.status === 200) {
      const rows = r2.data.all_rows || r2.data.rows || [];
      const total = rows.reduce((s, r) => s + (r.scheduled_value || 0), 0);
      // PDF parsing is best-effort — pdf-parse text layout differs from pdftotext.
      // Minimum bar: at least 3 real line items, no garbage, no crash.
      log('Bains PDF: found at least 3 real line items', rows.length >= 3, `found ${rows.length} rows`);
      log('Bains PDF: total > $0', total > 0, `got $${total.toLocaleString()}`);
      log('Bains PDF: no garbage metadata (license#, zip, numeric-only)', !rows.some(r =>
        /lic(ense)?|p\.?o\.?\s*box|contractor'?s/i.test(r.description) ||
        /^[\d\s.,\-]+$/.test(r.description)));
      log('Bains PDF: all amounts are plausible line-item values (<$500k)', rows.every(r => r.scheduled_value < 500000));
      console.log(`\n  ℹ️  PDF parsing extracted ${rows.length}/23 rows ($${total.toLocaleString()} of $268,233).`);
      console.log('\n  📋 Parsed line items:');
      printTable(rows);
    } else {
      console.log(`  ⚠️  Server error: ${JSON.stringify(r2.data).substring(0, 200)}`);
    }
  } else {
    log('Bains PDF file', 'skip', 'file not found');
  }

  // ================================================================
  // FILE 3: "Cut and fill, bocce court, deck" PDF (different format)
  // ================================================================
  console.log('\n══════════════════════════════════════════════════');
  console.log('  FILE 3: Cut and Fill / Bocce Court / Deck (PDF)');
  console.log('  Scanned/image PDF — tests graceful error handling');
  console.log('  Expected: 200 with rows OR 422 with helpful message (not a 500 crash)');
  console.log('══════════════════════════════════════════════════');

  const pdfPath2 = path.join(__dirname, 'test-fixtures/bocce-deck-proposal.pdf');
  if (fs.existsSync(pdfPath2)) {
    const r3 = await apiUpload('/api/sov/parse', pdfPath2, token);
    log('PDF upload accepted (no 415 rejection)', r3.status !== 415, `HTTP ${r3.status}`);
    log('PDF handled gracefully (200 or 422, not a 500 crash)', r3.status === 200 || r3.status === 422, `HTTP ${r3.status}`);
    if (r3.status === 422) {
      // Expected: scanned PDF with no text layer — should get a helpful message
      const hasHelpfulMsg = typeof r3.data.error === 'string' && r3.data.error.length > 10;
      log('Bocce/Deck PDF: returns helpful error message', hasHelpfulMsg, r3.data.error || '(no message)');
      console.log(`  ℹ️  This is a scanned PDF — the server correctly explained it can't parse it.`);
    } else if (r3.status === 200) {
      const rows = r3.data.all_rows || r3.data.rows || [];
      const total = rows.reduce((s, r) => s + (r.scheduled_value || 0), 0);
      log('Bocce/Deck PDF: found rows', rows.length > 0, `found ${rows.length} rows`);
      log('Bocce/Deck PDF: no garbage metadata rows', !rows.some(r => /p\.?o\.?\s*box|license|zip|california/i.test(r.description)), 'checking descriptions');
      console.log('\n  📋 Full parsed line items:');
      printTable(rows);
    } else {
      log('Bocce/Deck PDF: server crashed', false, `HTTP ${r3.status} — ${JSON.stringify(r3.data).substring(0, 150)}`);
    }
  } else {
    log('Bocce/Deck PDF file', 'skip', 'file not found');
  }

  // ================================================================
  // STRESS TEST: 5 rapid uploads of the same Excel file
  // ================================================================
  console.log('\n══════════════════════════════════════════════════');
  console.log('  STRESS TEST: 5 rapid uploads in parallel');
  console.log('  All should return 200 with correct row count');
  console.log('══════════════════════════════════════════════════');

  if (fs.existsSync(xlsxPath)) {
    const startTime = Date.now();
    const promises = Array(5).fill(null).map(() => apiUpload('/api/sov/parse', xlsxPath, token));
    const stressResults = await Promise.all(promises);
    const elapsed = Date.now() - startTime;
    const allOk = stressResults.every(r => r.status === 200);
    const allCorrect = stressResults.every(r => {
      const rows = r.data.all_rows || r.data.rows || [];
      return rows.length === 23;
    });
    log('Stress test: all 5 parallel uploads returned 200', allOk,
        stressResults.map(r => r.status).join(', '));
    log('Stress test: all 5 returned correct row count (23)', allCorrect,
        stressResults.map(r => (r.data.all_rows||r.data.rows||[]).length).join(', '));
    log(`Stress test: completed in reasonable time (<10s)`, elapsed < 10000, `${elapsed}ms for 5 uploads`);
    console.log(`  ⏱️  Total time: ${elapsed}ms  (avg ${Math.round(elapsed/5)}ms per upload)`);
  } else {
    log('Stress test', 'skip', 'Excel file not found');
  }

  // ================================================================
  // CLEANUP
  // ================================================================
  console.log('\n🧹 Cleaning up test account...');
  const del = await request('DELETE', '/api/auth/account', null, { Authorization: `Bearer ${token}` });
  log('Test account deleted', del.ok, `HTTP ${del.status}`);

  // ================================================================
  // SUMMARY
  // ================================================================
  console.log('\n══════════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('══════════════════════════════════════════════════\n');
  console.log(`  Total: ${passed+failed+skipped}  |  ✅ Passed: ${passed}  |  ❌ Failed: ${failed}  |  ⏭️  Skipped: ${skipped}\n`);

  if (failed === 0 && skipped === 0) {
    console.log('  🎉 ALL TESTS PASSED — parser handles all real contractor formats\n');
  } else if (failed === 0) {
    console.log('  ✅ No failures — some files were skipped\n');
  } else {
    console.log('  ⚠️  FAILURES FOUND — see ❌ items above\n');
  }
}

main().catch(e => { console.error('Fatal error:', e); process.exit(1); });
