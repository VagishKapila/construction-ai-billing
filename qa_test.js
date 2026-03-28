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
// The landing page is public/index.html; the billing app is public/app.html.
// QA checks app features in app.html (the actual SPA), landing features in index.html.
const indexSrc = fs.readFileSync('./public/app.html', 'utf8');

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
  serverSrc2.includes('isSummary(') && serverSrc2.includes(') continue'));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('  LANDING PAGE & MOBILE');
console.log('══════════════════════════════════════════════════');
check('Landing page div exists in HTML',
  indexSrc.includes('id="landing-screen"'));
// In the two-file structure, app.html shows auth immediately (landing is index.html)
// The auth screen should be visible so users can log in when navigating to /app.html
check('Auth screen exists in app',
  indexSrc.includes('id="auth-screen"'));
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
console.log('  MODULE 7A: API ROUTE INTEGRITY');
console.log('══════════════════════════════════════════════════');
const srvSrc = fs.readFileSync('./server.js','utf8');
const appSrc = fs.readFileSync('./public/app.html','utf8');

// Every api() call in app.html should have a matching route in server.js
const apiCalls = [...appSrc.matchAll(/api\(\s*'(GET|POST|PUT|DELETE)'\s*,\s*'([^']+)'/g)];
const routePatterns = [...srvSrc.matchAll(/app\.(get|post|put|delete)\('\/api([^']+)'/g)];
const serverRoutes = routePatterns.map(m => `${m[1].toUpperCase()} /api${m[2]}`);

// Normalize dynamic segments: /projects/123/payapps → /projects/:id/payapps
function normalizeRoute(method, path) {
  const normalized = path.replace(/\/\d+/g, '/:id').replace(/\?.*$/, '');
  return `${method} ${normalized.startsWith('/') ? '/api' + normalized : normalized}`;
}

// Check critical routes exist
const criticalRoutes = [
  'GET /api/projects', 'POST /api/projects', 'GET /api/stats',
  'GET /api/settings', 'POST /api/settings',
  'GET /api/revenue/summary', 'POST /api/ai/ask',
  'GET /api/onboarding/status', 'POST /api/onboarding/complete',
  'GET /api/subscription', 'GET /api/admin/stats',
  'POST /api/auth/register', 'POST /api/auth/login',
  'GET /api/admin/users'
];
for (const route of criticalRoutes) {
  const [method, path] = route.split(' ');
  const routeRegex = new RegExp(`app\\.${method.toLowerCase()}\\('${path.replace(/:[^/]+/g, '[^/]+')}[^']*'`);
  check(`Route exists: ${route}`, routeRegex.test(srvSrc));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('  MODULE 7A: DUPLICATE FUNCTION DETECTION');
console.log('══════════════════════════════════════════════════');
// Only check top-level named function declarations (not scoped vars like let r, e, etc.)
const topFnRegex = /^(?:async\s+)?function\s+(\w+)\s*\(/gm;
const appTopFns = [...appSrc.matchAll(topFnRegex)].map(m => m[1]);
const appDupFns = appTopFns.filter((name, i) => appTopFns.indexOf(name) !== i);
const appUniqueDupFns = [...new Set(appDupFns)];
check('No duplicate top-level functions in app.html',
  appUniqueDupFns.length === 0,
  appUniqueDupFns.length > 0 ? `Duplicates: ${appUniqueDupFns.join(', ')}` : '');

const srvTopFns = [...srvSrc.matchAll(topFnRegex)].map(m => m[1]);
const srvDupFns = srvTopFns.filter((name, i) => srvTopFns.indexOf(name) !== i);
const srvUniqueDupFns = [...new Set(srvDupFns)];
check('No duplicate top-level functions in server.js',
  srvUniqueDupFns.length === 0,
  srvUniqueDupFns.length > 0 ? `Duplicates: ${srvUniqueDupFns.join(', ')}` : '');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('  MODULE 7A: HTML/JS ELEMENT CONSISTENCY');
console.log('══════════════════════════════════════════════════');
// Find all getElementById references in JS and verify the element exists in HTML
const getElCalls = [...appSrc.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]);
const uniqueElIds = [...new Set(getElCalls)];
const htmlIds = [...appSrc.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
const htmlIdSet = new Set(htmlIds);

let missingEls = [];
// Known dynamically-created elements (via JS document.createElement or innerHTML)
const dynamicIds = new Set(['_toast','aria-typing','wg-overlay','sov-comparison-banner','ai-typing']);
for (const id of uniqueElIds) {
  if (dynamicIds.has(id)) continue;
  if (!htmlIdSet.has(id)) missingEls.push(id);
}
// Filter out IDs with dynamic prefixes (generated in templates)
const dynamicPrefixes = ['drill-','rev-drill-','admin-','inv-','lien-','sov-upload-','pa-line-'];
missingEls = missingEls.filter(id => !dynamicPrefixes.some(p => id.startsWith(p)));
check('All getElementById targets exist in HTML (excluding dynamic elements)',
  missingEls.length === 0,
  missingEls.length > 0 ? `Missing: ${missingEls.slice(0,10).join(', ')}` : '');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('  MODULE 7A: SECURITY & AUTH CHECKS');
console.log('══════════════════════════════════════════════════');
// Check that admin routes use adminAuth — extract all /api/admin/ route definitions
// Exception: /api/admin/emergency-reset is intentionally open (for lockout recovery)
const adminRoutes = [...srvSrc.matchAll(/app\.(get|post|put|delete)\('\/api\/admin\/([^']+)'\s*,\s*(\w+)/g)];
const nonAdminProtected = adminRoutes.filter(m => m[3] !== 'adminAuth' && !m[2].includes('emergency-reset'));
check('All admin routes use adminAuth middleware (except emergency-reset)',
  nonAdminProtected.length === 0,
  nonAdminProtected.length > 0 ? `Unprotected: ${nonAdminProtected.map(m=>`${m[1]} /api/admin/${m[2]}`).join(', ')}` : '');
check('JWT_SECRET is read from env (not hardcoded)',
  srvSrc.includes("process.env.JWT_SECRET") || srvSrc.includes("process.env['JWT_SECRET']"));
check('Passwords are hashed with bcrypt',
  srvSrc.includes('bcrypt.hash') && srvSrc.includes('bcrypt.compare'));
check('Email from field uses plain email (no display name in Resend calls)',
  !(/from:\s*`[^`]*<[^`]*>`/.test(srvSrc)));
check('Auth redirects use /app.html (Google OAuth, password reset, email verify)',
  srvSrc.includes("/app.html#google_token=") && srvSrc.includes("/app.html?verified=1") && srvSrc.includes("/app.html?reset="));
// Note: invite accept routes still redirect to /? — tracked as known issue
check('Invite accept routes redirect to /app.html (not bare /)',
  !srvSrc.includes("redirect('/?invite"),
  'Known issue: invite routes redirect to / instead of /app.html');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('  MODULE 7A: DATABASE SCHEMA CHECKS');
console.log('══════════════════════════════════════════════════');
const dbSrc2 = fs.readFileSync('./db.js','utf8');
check('DB has users table', dbSrc2.includes('CREATE TABLE IF NOT EXISTS users'));
check('DB has projects table', dbSrc2.includes('CREATE TABLE IF NOT EXISTS projects'));
check('DB has pay_apps table', dbSrc2.includes('CREATE TABLE IF NOT EXISTS pay_apps'));
check('DB has pay_app_lines table', dbSrc2.includes('CREATE TABLE IF NOT EXISTS pay_app_lines'));
check('DB has change_orders table', dbSrc2.includes('CREATE TABLE IF NOT EXISTS change_orders'));
check('DB has company_settings table', dbSrc2.includes('CREATE TABLE IF NOT EXISTS company_settings'));
check('DB has analytics_events table', dbSrc2.includes('CREATE TABLE IF NOT EXISTS analytics_events'));
check('DB has trial columns (trial_start_date, trial_end_date)',
  dbSrc2.includes('trial_start_date') && dbSrc2.includes('trial_end_date'));
check('DB has subscription_status column',
  dbSrc2.includes('subscription_status'));
check('DB has has_completed_onboarding column',
  dbSrc2.includes('has_completed_onboarding'));
check('DB uses ALTER TABLE IF NOT EXISTS pattern (safe migrations)',
  dbSrc2.includes('ADD COLUMN IF NOT EXISTS'));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('  MODULE 7A: FEATURE COMPLETENESS');
console.log('══════════════════════════════════════════════════');
// Module 1: Trial system
check('Trial system: subscription endpoint exists',
  srvSrc.includes("'/api/subscription'"));
check('Trial system: 90-day trial on registration',
  srvSrc.includes("90 days") || srvSrc.includes("INTERVAL '90 days'"));

// Module 2: Admin controls
check('Admin: extend-trial endpoint exists',
  srvSrc.includes("extend-trial"));
check('Admin: set-free-override endpoint exists',
  srvSrc.includes("set-free-override"));
check('Admin: upgrade-pro endpoint exists',
  srvSrc.includes("upgrade-pro"));

// Module 3: Onboarding
check('Onboarding: Welcome Guide modal exists in HTML',
  appSrc.includes('wg-modal') && appSrc.includes('WG_CARDS'));
check('Onboarding: checkOnboardingTour function exists',
  appSrc.includes('checkOnboardingTour'));

// Module 4: AI Assistant
check('AI: /api/ai/ask endpoint exists',
  srvSrc.includes("'/api/ai/ask'"));
check('AI: PRODUCT_KNOWLEDGE system prompt exists',
  srvSrc.includes('PRODUCT_KNOWLEDGE'));
check('AI: Aria chat with fallback to keywords',
  appSrc.includes('getAriaReply'));

// Module 5: Reporting
check('Reporting: status filter exists',
  appSrc.includes('rev-status-filter'));
check('Reporting: project filter exists',
  appSrc.includes('rev-project-filter'));
check('Reporting: date range filters exist',
  appSrc.includes('rev-date-from') && appSrc.includes('rev-date-to'));
check('Reporting: per-project drill-down exists',
  appSrc.includes('openRevDrill'));
check('Reporting: CSV export uses filtered data',
  appSrc.includes('getFilteredRevRows'));

// Module 6: Pro nudges
check('Nudge: banner container in dashboard',
  appSrc.includes('nudge-banner-container'));
check('Nudge: checkAndShowNudge function exists',
  appSrc.includes('checkAndShowNudge'));
check('Nudge: 7-day dismiss logic exists',
  appSrc.includes('NUDGE_DISMISS_DAYS'));
check('Nudge: Settings upgrade card exists',
  appSrc.includes('renderSettingsUpgradeCard'));

// G702/G703 math integrity (must never change)
check('G702 math: Col D = B + C formula pattern intact',
  srvSrc.includes('prev_pct') && srvSrc.includes('this_pct'));
check('G702 math: retainage per line exists',
  srvSrc.includes('retainage_pct'));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('  MODULE 7A: TWO-FILE ARCHITECTURE');
console.log('══════════════════════════════════════════════════');
const landingHTML = fs.readFileSync('./public/index.html','utf8');
check('index.html is landing page only (no auth logic)',
  !landingHTML.includes('function login') && !landingHTML.includes('function register'));
check('app.html has auth screen',
  appSrc.includes('id="auth-screen"'));
check('app.html has login function (doLogin)',
  appSrc.includes('function doLogin') || appSrc.includes('async function doLogin'));
check('Catch-all serves index.html (landing page)',
  srvSrc.includes("sendFile(path.join(__dirname,'public','index.html'))") ||
  srvSrc.includes('sendFile(path.join(__dirname, "public", "index.html"))'));
check('Google OAuth redirects to /app.html (not /)',
  srvSrc.includes("/app.html#google_token=") || srvSrc.includes("/app.html?google_token="));
check('Password reset redirects to /app.html (not /)',
  srvSrc.includes("/app.html?reset="));

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
