/**
 * stripe-payout-dashboard/index.js
 * Main entry point — wires all modules together.
 *
 * INTEGRATION MODE (add to main app's server/app.js):
 *   const payoutDashboard = require('./stripe-payout-dashboard');
 *   payoutDashboard.init(app);
 *
 * STANDALONE MODE:
 *   node stripe-payout-dashboard/index.js
 */
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express       = require('express');
const path          = require('path');
const webhookRouter = require('./webhooks/stripe-webhook');
const payoutRoutes  = require('./routes/payout-routes');
const { startCron } = require('./jobs/sync-balances');
const { pool }      = require('./db');

/**
 * Init function — call this from the main app.
 * @param {express.Application} app
 * @param {{ startCronJob?: boolean }} opts
 */
function init(app, opts = {}) {
  const { startCronJob = true } = opts;

  // ── Webhook endpoint (raw body required for Stripe signature verification)
  app.use('/stripe-webhooks', webhookRouter);

  // ── Admin API routes
  app.use('/', payoutRoutes);

  // ── Serve standalone UI (accessible at /payout-dashboard)
  app.use('/payout-dashboard/ui', express.static(path.join(__dirname, 'ui')));
  app.get('/payout-dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'ui', 'index.html'));
  });

  // ── Start cron job
  if (startCronJob) {
    startCron();
  }

  console.log('[PayoutDashboard] Initialized');
  console.log('[PayoutDashboard] Webhook endpoint: POST /stripe-webhooks/payout-events');
  console.log('[PayoutDashboard] Dashboard UI:     GET  /payout-dashboard');
  console.log('[PayoutDashboard] API:              GET  /payout-dashboard/accounts');
}

// ── Standalone mode ───────────────────────────────────────────────────────
async function runStandalone() {
  // Run DB migration first
  await runMigration();

  const app  = express();
  const PORT = process.env.PAYOUT_DASHBOARD_PORT || 3001;

  app.use(express.json());

  // CORS for standalone dev
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  init(app, { startCronJob: true });

  app.listen(PORT, () => {
    console.log(`[PayoutDashboard] Running standalone on http://localhost:${PORT}`);
    console.log(`[PayoutDashboard] Dashboard UI: http://localhost:${PORT}/payout-dashboard`);
  });
}

// ── Auto-run migration (idempotent) ──────────────────────────────────────
async function runMigration() {
  const fs  = require('fs');
  const sql = fs.readFileSync(path.join(__dirname, 'setup.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('[PayoutDashboard] DB migration complete (idempotent — safe to re-run)');
  } catch (err) {
    console.error('[PayoutDashboard] Migration error:', err.message);
    throw err;
  }
}

// ── Exports ───────────────────────────────────────────────────────────────
module.exports = { init, runMigration };

// Run standalone if called directly
if (require.main === module) {
  runStandalone().catch(err => {
    console.error('[PayoutDashboard] Fatal startup error:', err);
    process.exit(1);
  });
}
