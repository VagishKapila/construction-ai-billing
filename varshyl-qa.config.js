/**
 * varshyl-qa.config.js — construction-ai-billing
 * ─────────────────────────────────────────────────
 * Project-specific QA configuration for ConstructInvoice AI.
 * Loaded automatically by qa_test.js, arch-sanity.js, and mutation-watchdog.js
 */
'use strict';
const fs = require('fs');

module.exports = {
  // ── Identity ────────────────────────────────────────────────────────────────
  projectName:    'construction-ai-billing',
  serverEntry:    'server/index.js',       // actual Node entry point
  routeMountFile: 'server/app.js',         // where all app.use('/api/...') calls live
  stagingUrl:     'https://construction-ai-billing-staging.up.railway.app',
  hasReact:       true,
  clientDir:      'client',

  // ── Critical Formulas ────────────────────────────────────────────────────────
  // These must exist in the LIVE route files — not just in the legacy server.js.
  // arch-sanity.js and qa_test.js (MODULE 9) will verify each one.
  criticalFormulas: [
    // CO Math — the formulas that caused the "fixed wrong file" bug
    {
      file:     'server/routes/payApps.js',
      pattern:  "filter\\(c=>c\\.status!=='void'&&c\\.status!=='voided'\\)",
      label:    'payApps.js: CO void filter (must appear in all 3 routes: HTML, PDF, email)',
      minCount: 3,
    },
    {
      file:     'server/routes/payApps.js',
      pattern:  'Math\\.max\\(0,earned-tPrevCert\\)\\+tCO',
      label:    'payApps.js: due formula includes +tCO (H = F - G + approved COs)',
      minCount: 3,
    },
    {
      file:     'server/routes/payApps.js',
      pattern:  'pa\\.is_retainage_release \\? parseFloat\\(pa\\.amount_due',
      label:    'payApps.js: retainage-release ternary guards all 3 routes',
      minCount: 3,
    },
    // G702 math in legacy server.js (kept for completeness)
    {
      file:     'server.js',
      pattern:  'earned\\s*-\\s*tPrevCert',
      label:    'server.js: H formula exists (legacy route)',
      minCount: 1,
    },
    // Auth & security
    {
      file:     'server/middleware/auth.js',
      pattern:  'jwt\\.verify',
      label:    'auth middleware uses jwt.verify',
      minCount: 1,
    },
    // Trial gate
    {
      file:     'server/middleware/trialGate.js',
      pattern:  'subscription_status',
      label:    'trialGate.js checks subscription_status',
      minCount: 1,
    },
    // Stripe webhook signature verification
    {
      file:     'server/routes/webhook.js',
      pattern:  'constructEvent|stripe\\.webhooks',
      label:    'webhook.js verifies Stripe signature',
      minCount: 1,
    },
  ],

  // ── Mutations ────────────────────────────────────────────────────────────────
  // 4 mutations that proved qa_test.js has the right coverage (April 2026)
  mutations: [
    {
      label:   'Mutation 1: CO void filter removed from payApps.js',
      file:    'server/routes/payApps.js',
      find:    /filter\(c=>c\.status!=='void'&&c\.status!=='voided'\)\.reduce\(\(s,c\)=>s\+parseFloat\(c\.amount\|\|0\),0\)/,
      replace: 'reduce((s,c)=>s+parseFloat(c.amount||0),0)',
      expectQaToFail: true,
    },
    {
      label:   'Mutation 2: +tCO removed from due formula in payApps.js',
      file:    'server/routes/payApps.js',
      find:    /Math\.max\(0,earned-tPrevCert\)\+tCO/,
      replace: 'Math.max(0,earned-tPrevCert)',
      expectQaToFail: true,
    },
    {
      label:   'Mutation 3: retainage-release guard removed from payApps.js',
      file:    'server/routes/payApps.js',
      find:    /pa\.is_retainage_release \? parseFloat\(pa\.amount_due\|\|0\) : Math\.max\(0,earned-tPrevCert\)\+tCO/,
      replace: 'Math.max(0,earned-tPrevCert)+tCO',
      expectQaToFail: true,
    },
    {
      label:   'Mutation 4: CO void filter removed from legacy server.js',
      file:    'server.js',
      find:    /filter\(c=>c\.status!=='void'&&c\.status!=='voided'\)/,
      replace: 'filter(c=>true)',
      expectQaToFail: true,
    },
  ],

  // ── Extra Static Checks ──────────────────────────────────────────────────────
  checks: [
    {
      label: 'Logo file is under 100KB',
      test:  () => {
        try { return fs.statSync('public/varshyl-logo.png').size < 100_000; }
        catch (_) { return true; }
      },
      hint: 'Compress with Pillow: python3 -c "from PIL import Image; img=Image.open(...)"',
    },
    {
      label: 'Two-file architecture: server redirects use /app.html not /',
      test:  () => {
        const src = fs.existsSync('server.js') ? fs.readFileSync('server.js', 'utf8') : '';
        const appSrc = fs.existsSync('server/app.js') ? fs.readFileSync('server/app.js', 'utf8') : '';
        const all = src + appSrc;
        // Should NOT have res.redirect('/') — should always redirect to /app.html
        return !all.match(/res\.redirect\(['"]\/['"]\)/) &&
               !all.match(/res\.redirect\(['"]\/\?/);
      },
      hint: "Always redirect to /app.html, never to '/' or '/?'",
    },
    {
      label: 'FROM_EMAIL is plain email (no display name format)',
      test:  () => {
        const src = [
          fs.existsSync('server.js') ? fs.readFileSync('server.js', 'utf8') : '',
          fs.existsSync('server/routes/payApps.js') ? fs.readFileSync('server/routes/payApps.js', 'utf8') : '',
        ].join('');
        // Should not have "Name <email>" pattern in from: field
        return !src.match(/from:\s*`[^`]+<[^>]+>`/);
      },
      hint: 'Resend requires plain email in from: — no display name',
    },
    {
      label: 'ADMIN_EMAILS middleware protects admin routes',
      test:  () => {
        const src = fs.existsSync('server/routes/admin-extended.js')
          ? fs.readFileSync('server/routes/admin-extended.js', 'utf8') : '';
        return src.includes('adminAuth');
      },
      hint: 'All admin-extended routes must use adminAuth middleware',
    },
    {
      label: 'SQL INTERVAL uses parameterized format (no string interpolation)',
      test:  () => {
        const src = fs.existsSync('server/routes/admin-extended.js')
          ? fs.readFileSync('server/routes/admin-extended.js', 'utf8') : '';
        // Should NOT have INTERVAL '${days} days' (injection risk)
        return !src.match(/INTERVAL\s+'?\$\{/);
      },
      hint: "Use ($1 || ' days')::INTERVAL — not INTERVAL '${days} days'",
    },
  ],
};
