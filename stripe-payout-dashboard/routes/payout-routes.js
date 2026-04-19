/**
 * stripe-payout-dashboard/routes/payout-routes.js
 * Module 3 — API Routes
 *
 * All routes are admin-protected.
 * Mount in main app as: app.use('/', payoutRoutes)
 * Or standalone: app.use('/', payoutRoutes)
 */
'use strict';

const express             = require('express');
const router              = express.Router();
const Stripe              = require('stripe');
const { pool }            = require('../db');
const { syncAllAccounts, syncAccount } = require('../jobs/sync-balances');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ── Load admin auth from main app (path relative to construction-ai-billing root)
let adminAuth;
try {
  adminAuth = require('../../server/middleware/auth').adminAuth;
} catch {
  // Standalone mode fallback — simple token check
  adminAuth = (req, res, next) => {
    const token = req.headers['x-admin-token'] || req.query.admin_token;
    if (token && token === process.env.PAYOUT_DASHBOARD_SECRET) return next();
    // Also accept same JWT format as main app when standalone
    const jwt = require('jsonwebtoken');
    const bearerToken = (req.headers.authorization || '').split(' ')[1];
    if (!bearerToken) return res.status(401).json({ error: 'Admin auth required' });
    try {
      const user   = jwt.verify(bearerToken, process.env.JWT_SECRET || 'change-this-secret');
      const admins = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
      if (!admins.includes(user.email?.toLowerCase())) return res.status(403).json({ error: 'Admin only' });
      req.user = user;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}

// ── GET /payout-dashboard/accounts ────────────────────────────────────────
// List all connected accounts with status summary
router.get('/payout-dashboard/accounts', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        sca.*,
        (SELECT COUNT(*) FROM stripe_payout_alerts spa WHERE spa.account_id=sca.account_id AND spa.resolved=FALSE) AS open_alert_count
      FROM stripe_connected_accounts sca
      ORDER BY sca.available_balance DESC, sca.updated_at DESC
    `);
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    console.error('[PayoutRoutes] GET /accounts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /payout-dashboard/accounts/:id ────────────────────────────────────
// Single account detail (DB + live Stripe data)
router.get('/payout-dashboard/accounts/:id', adminAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM stripe_connected_accounts WHERE account_id=$1',
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Account not found' });

    // Fetch live Stripe account details
    let liveAccount = null;
    try {
      liveAccount = await stripe.accounts.retrieve(id);
    } catch (e) {
      console.warn(`[PayoutRoutes] Could not fetch live account ${id}:`, e.message);
    }

    const alerts = await pool.query(
      'SELECT * FROM stripe_payout_alerts WHERE account_id=$1 ORDER BY created_at DESC LIMIT 20',
      [id]
    );

    res.json({
      data: {
        db:     rows[0],
        live:   liveAccount,
        alerts: alerts.rows,
      }
    });
  } catch (err) {
    console.error(`[PayoutRoutes] GET /accounts/${id} error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /payout-dashboard/accounts/:id/payouts ────────────────────────────
// Payout history for a specific account (last 50)
router.get('/payout-dashboard/accounts/:id/payouts', adminAuth, async (req, res) => {
  const { id }    = req.params;
  const limit     = Math.min(parseInt(req.query.limit || '50'), 100);
  try {
    // Fetch from Stripe directly for accuracy
    const payouts = await stripe.payouts.list({ limit }, { stripeAccount: id });
    const formatted = payouts.data.map(p => ({
      id:             p.id,
      amount:         p.amount / 100,
      currency:       p.currency,
      status:         p.status,
      method:         p.method,
      arrival_date:   p.arrival_date ? new Date(p.arrival_date * 1000).toISOString().split('T')[0] : null,
      created:        new Date(p.created * 1000).toISOString(),
      failure_message: p.failure_message || null,
      failure_code:   p.failure_code    || null,
    }));
    res.json({ data: formatted, account_id: id });
  } catch (err) {
    console.error(`[PayoutRoutes] GET /accounts/${id}/payouts error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /payout-dashboard/accounts/:id/balance ────────────────────────────
// Live balance check for a specific account
router.get('/payout-dashboard/accounts/:id/balance', adminAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const balance = await stripe.balance.retrieve({ stripeAccount: id });
    const usdAvail = balance.available.find(b => b.currency === 'usd') || { amount: 0 };
    const usdPend  = balance.pending.find(b => b.currency === 'usd')   || { amount: 0 };

    // Update DB with fresh values
    await pool.query(
      'UPDATE stripe_connected_accounts SET available_balance=$1, pending_balance=$2, last_synced_at=NOW() WHERE account_id=$3',
      [usdAvail.amount / 100, usdPend.amount / 100, id]
    );

    res.json({
      account_id: id,
      available:  usdAvail.amount / 100,
      pending:    usdPend.amount  / 100,
      all:        balance,
      synced_at:  new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[PayoutRoutes] GET /accounts/${id}/balance error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /payout-dashboard/alerts ──────────────────────────────────────────
// All unresolved alerts
router.get('/payout-dashboard/alerts', adminAuth, async (req, res) => {
  try {
    const showResolved = req.query.resolved === 'true';
    const { rows } = await pool.query(`
      SELECT spa.*, sca.email, sca.business_name
      FROM stripe_payout_alerts spa
      LEFT JOIN stripe_connected_accounts sca ON sca.account_id = spa.account_id
      WHERE spa.resolved = $1
      ORDER BY spa.created_at DESC
      LIMIT 100
    `, [showResolved]);
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    console.error('[PayoutRoutes] GET /alerts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /payout-dashboard/alerts/:id/resolve ─────────────────────────────
// Mark an alert as resolved
router.post('/payout-dashboard/alerts/:id/resolve', adminAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE stripe_payout_alerts SET resolved=TRUE, resolved_at=NOW(), resolved_by=$1 WHERE id=$2 RETURNING *',
      [req.user?.email || 'admin', parseInt(id)]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Alert not found' });
    res.json({ data: result.rows[0], message: 'Alert resolved' });
  } catch (err) {
    console.error(`[PayoutRoutes] POST /alerts/${id}/resolve error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /payout-dashboard/transfers ───────────────────────────────────────
// All platform transfers (from stripe_transfers_log + live Stripe)
router.get('/payout-dashboard/transfers', adminAuth, async (req, res) => {
  try {
    const limit      = Math.min(parseInt(req.query.limit || '20'), 100);
    const fromStripe = req.query.source !== 'db';

    if (fromStripe) {
      // Live from Stripe API
      const transfers = await stripe.transfers.list({ limit });
      const formatted = transfers.data.map(t => ({
        id:                 t.id,
        amount:             t.amount / 100,
        currency:           t.currency,
        destination:        t.destination,
        destination_name:   t.destination_payment || null,
        transfer_group:     t.transfer_group || null,
        description:        t.description    || null,
        created:            new Date(t.created * 1000).toISOString(),
        metadata:           t.metadata,
      }));
      res.json({ source: 'stripe', data: formatted, count: formatted.length });
    } else {
      // From local DB log
      const { rows } = await pool.query(
        'SELECT * FROM stripe_transfers_log ORDER BY stripe_created_at DESC LIMIT $1',
        [limit]
      );
      res.json({ source: 'db', data: rows, count: rows.length });
    }
  } catch (err) {
    console.error('[PayoutRoutes] GET /transfers error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /payout-dashboard/sync ───────────────────────────────────────────
// Manual trigger to sync all connected account balances
router.post('/payout-dashboard/sync', adminAuth, async (req, res) => {
  try {
    const accountId = req.body?.account_id;
    let result;

    if (accountId) {
      result = await syncAccount(accountId);
    } else {
      result = await syncAllAccounts();
    }

    res.json({ message: 'Sync complete', result });
  } catch (err) {
    console.error('[PayoutRoutes] POST /sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /payout-dashboard/events ──────────────────────────────────────────
// Recent webhook events (for debugging)
router.get('/payout-dashboard/events', adminAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50'), 200);
    const type  = req.query.type || null;

    const query = type
      ? 'SELECT id,event_id,event_type,connected_account_id,amount,currency,status,failure_message,created_at FROM stripe_payout_events WHERE event_type=$1 ORDER BY created_at DESC LIMIT $2'
      : 'SELECT id,event_id,event_type,connected_account_id,amount,currency,status,failure_message,created_at FROM stripe_payout_events ORDER BY created_at DESC LIMIT $1';

    const params = type ? [type, limit] : [limit];
    const { rows } = await pool.query(query, params);
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    console.error('[PayoutRoutes] GET /events error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
