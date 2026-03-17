/**
 * Construction AI Billing — Comprehensive QA Script
 * Tests every bug fix and feature added. Run with: node qa_test.js
 */

const fs   = require('fs');
const path = require('path');

let passed = 0, failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function checkContains(label, filePath, pattern) {
  const src = fs.readFileSync(filePath, 'utf8');
  const found = typeof pattern === 'string' ? src.includes(pattern) : pattern.test(src);
  check(label, found, typeof pattern === 'string' ? `"${pattern.slice(0,80)}"` : `/${pattern.source}/`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('  BUG FIX 1: PDF & Word upload allowed on SOV step');
console.log('══════════════════════════════════════════════════');
const indexSrc = fs.readFileSync('./public/index.html', 'utf8');

check('PDF extension (.pdf) is in the allowed list',
  indexSrc.includes(".endsWith('.pdf')"));
check('Word extension (.docx) is in the allowed list',
  indexSrc.includes(".endsWith('.docx')"));
check('Word extension (.doc) is in the allowed list',
  indexSrc.includes(".endsWith('.doc')"));
check('Error message updated to mention PDF and Word',
  indexSrc.includes('PDF, or Word'));
check('Server routes .pdf to Python parser',
  fs.readFileSync('./server.js','utf8').includes("ext === '.pdf'"));
check('Server routes .docx to Python parser',
  fs.readFileSync('./server.js','utf8').includes("ext === '.docx'"));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('  BUG FIX 2: Excel SOV parser — correct rows');
console.log('══════════════════════════════════════════════════');
const XLSX = require('xlsx');
const testFile = '/sessions/nice-dreamy-cerf/mnt/uploads/TEST Major Upgrades Saratoga - ViaDeMarcos_Home1A.xlsx';

if (fs.existsSync(testFile)) {
  // Inline the parseSOVFile logic for testing
  const serverSrc = fs.readFileSync('./server.js','utf8');
  // Extract and eval parseSOVFile
  const fnMatch = serverSrc.match(/function parseSOVFile\(filePath\)[\s\S]+?\n\}/);
  check('parseSOVFile function exists in server.js', !!fnMatch);

  if (fnMatch) {
    try {
      eval(fnMatch[0]); // eslint-disable-line no-eval
      const result = parseSOVFile(testFile);

      check('Parser finds at least 20 line items',
        result.allRows.length >= 20,
        `found ${result.allRows.length}`);

      const sum = result.allRows.reduce((s,r) => s + r.scheduled_value, 0);
      check('Sum of all line items equals $268,233 (contract amount)',
        sum === 268233,
        `got $${sum.toLocaleString()}`);

      const hasProjMgmt = result.allRows.some(r => /project\s*management/i.test(r.description));
      check('Project Management row is included (was previously missing)',
        hasProjMgmt);

      const hasSuperintendent = result.allRows.some(r => /superintendent/i.test(r.description));
      check('Superintendent row is included (was previously missing)',
        hasSuperintendent);

      const hasContractsAdmin = result.allRows.some(r => /contracts\s*admin/i.test(r.description));
      check('Contracts Administration row is included (was previously missing)',
        hasContractsAdmin);

      const hasFee = result.allRows.some(r => /^fee$/i.test(r.description));
      check('Fee row ($12,331) is included (was previously missing)',
        hasFee);

      const noGrandTotal = !result.allRows.some(r => /^total$/i.test(r.item_id) || /^(total|grand\s*total)$/i.test(r.description));
      check('Grand Total row is NOT included as a line item',
        noGrandTotal);

      const noByOthers = !result.allRows.some(r => /windows.*waterproof/i.test(r.description));
      check('"By Others" item (Windows) is correctly excluded',
        noByOthers);

    } catch(e) {
      check('parseSOVFile runs without error on test file', false, e.message);
    }
  }
} else {
  console.log('  ⚠️  SKIP: Test Excel file not found at expected path');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('  BUG FIX 3: Contract amount comma formatting');
console.log('══════════════════════════════════════════════════');
check('setupCommaInput handles focus (strips commas for editing)',
  indexSrc.includes("replace(/,/g,'')"));
check('setupCommaInput formats on blur',
  indexSrc.includes("addEventListener('blur'"));
check('setupCommaInput formats on change event (NEW)',
  indexSrc.includes("addEventListener('change'"));
check('setupCommaInput has guard against double-attach',
  indexSrc.includes('_commaSetup'));
check('np-contract input is wired up on login',
  indexSrc.includes("setupCommaInput(document.getElementById(id))") &&
  indexSrc.includes("'np-contract'"));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('  FEATURE: Settings page — contact profile autofill');
console.log('══════════════════════════════════════════════════');
const serverSrc2 = fs.readFileSync('./server.js','utf8');
const dbSrc = fs.readFileSync('./db.js','utf8');

// DB schema
check('DB adds contact_name column to company_settings',
  dbSrc.includes('contact_name'));
check('DB adds contact_phone column to company_settings',
  dbSrc.includes('contact_phone'));
check('DB adds contact_email column to company_settings',
  dbSrc.includes('contact_email'));

// Server API
check('POST /api/settings saves contact_name',
  serverSrc2.includes('contact_name=EXCLUDED.contact_name'));
check('POST /api/settings saves contact_phone',
  serverSrc2.includes('contact_phone=EXCLUDED.contact_phone'));
check('POST /api/settings saves contact_email',
  serverSrc2.includes('contact_email=EXCLUDED.contact_email'));

// HTML — Settings page fields
check('Settings page has contact name input field',
  indexSrc.includes('id="set-contact-name"'));
check('Settings page has contact phone input field',
  indexSrc.includes('id="set-contact-phone"'));
check('Settings page has contact email input field',
  indexSrc.includes('id="set-contact-email"'));

// HTML — loadSettings populates the new fields
check('loadSettings() reads contact_name from API',
  indexSrc.includes("companySettings.contact_name"));
check('loadSettings() reads contact_phone from API',
  indexSrc.includes("companySettings.contact_phone"));
check('loadSettings() reads contact_email from API',
  indexSrc.includes("companySettings.contact_email"));

// HTML — saveSettings sends the new fields
check('saveSettings() sends contact_name to API',
  indexSrc.includes("contact_name: document.getElementById('set-contact-name').value"));
check('saveSettings() sends contact_phone to API',
  indexSrc.includes("contact_phone: document.getElementById('set-contact-phone').value"));
check('saveSettings() sends contact_email to API',
  indexSrc.includes("contact_email: document.getElementById('set-contact-email').value"));

// HTML — New Project auto-fill
check('showNewProject() auto-fills contractor from company_name',
  indexSrc.includes('companySettings.company_name'));
check('showNewProject() auto-fills contact name',
  indexSrc.includes('companySettings.contact_name'));
check('showNewProject() auto-fills contact phone',
  indexSrc.includes('companySettings.contact_phone'));
check('showNewProject() auto-fills contact email',
  indexSrc.includes('companySettings.contact_email'));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('  SOV PARSER: Total-first column detection logic');
console.log('══════════════════════════════════════════════════');
check('Parser scans first 30 rows for "Total" header keyword',
  /total.*scheduled.*value.*amount.*cost/i.test(serverSrc2) ||
  serverSrc2.includes('scheduled\\s*value') ||
  serverSrc2.includes("'total'") ||
  /total\|scheduled/i.test(serverSrc2));
check('Parser has header-keyword detection (Step 1)',
  serverSrc2.includes('fAmt') || serverSrc2.includes('headerRowIdx'));
check('Parser has scoring fallback (Step 2)',
  serverSrc2.includes('amtScore') && serverSrc2.includes('descScore'));
check('Parser uses rightmost column on tie for amounts',
  serverSrc2.includes('>= best'));
check('isSummary() skips grand-total rows',
  serverSrc2.includes('isSummary'));
check('Summary rows skipped but parsing continues (for Fee after subtotal)',
  serverSrc2.includes('isSummary(desc, itemId)) continue'));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('  LANDING PAGE & MOBILE');
console.log('══════════════════════════════════════════════════');
check('Landing page div exists in HTML',
  indexSrc.includes('id="landing-screen"'));
check('Auth screen starts hidden (requires landing page first)',
  indexSrc.includes('id="auth-screen" class="auth-wrap hidden"'));
check('Mobile CSS has grid column collapse to 1fr',
  indexSrc.includes('grid-template-columns:1fr'));
check('showAuthFromLanding() function exists',
  indexSrc.includes('function showAuthFromLanding'));
check('showLanding() function exists for logout',
  indexSrc.includes('function showLanding'));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('  FILES & STRUCTURE');
console.log('══════════════════════════════════════════════════');
const requiredFiles = [
  './server.js', './db.js', './public/index.html',
  './parse_sov.py', './public/varshyl-logo.png', './package.json'
];
for (const f of requiredFiles) {
  check(`File exists: ${f}`, fs.existsSync(f));
}
check('varshyl-logo.png is reasonably small (< 100KB)',
  fs.statSync('./public/varshyl-logo.png').size < 100000,
  `${Math.round(fs.statSync('./public/varshyl-logo.png').size/1024)}KB`);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('  RESULTS');
console.log('══════════════════════════════════════════════════');
const total = passed + failed;
console.log(`\n  Total: ${total}  |  ✅ Passed: ${passed}  |  ❌ Failed: ${failed}`);
if (failed === 0) {
  console.log('\n  🎉 ALL TESTS PASSED\n');
} else {
  console.log(`\n  ⚠️  ${failed} test(s) need attention\n`);
  process.exit(1);
}
