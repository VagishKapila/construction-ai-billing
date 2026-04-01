const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const { pool } = require('../../db');
const { auth, adminAuth, requireStripe } = require('../middleware/auth');
const { stripe } = require('../services/stripe');
const { fetchEmail } = require('../services/email');
const { logEvent } = require('../lib/logEvent');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

// ── Helper: is this email in the admin whitelist? ─────────────────────────────
function isAdminEmail(email) {
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
  return adminEmails.includes((email || '').toLowerCase());
}

// ── Admin: test email deliverability ──────────────────────────────────────────
router.post('/test-email', adminAuth, async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'to email required' });
  const apiKey    = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || 'noreply@varshyl.com';
  const appUrl    = process.env.APP_URL || 'https://constructinv.varshyl.com';
  if (!apiKey) return res.status(503).json({ error: 'RESEND_API_KEY not set', env: { FROM_EMAIL: fromEmail, APP_URL: appUrl } });
  try {
    const resp = await fetchEmail('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: 'Email Test — Construction AI Billing',
        html: `<div style="font-family:sans-serif;padding:24px"><h2>Email is working!</h2><p>Sent from: <b>${fromEmail}</b><br>App URL: ${appUrl}<br>Time: ${new Date().toISOString()}</p></div>`,
      }),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('[Test Email] Resend error:', resp.status, JSON.stringify(body));
      return res.status(resp.status).json({ error: 'Resend rejected', status: resp.status, detail: body, from: fromEmail });
    }
    console.log('[Test Email] Sent OK to', to);
    res.json({ ok: true, id: body.id, from: fromEmail, to, appUrl });
  } catch(e) {
    console.error('[Test Email] fetch failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [users, projects, payapps, events, recentErrors, slowReqs, topEvents, dailySignups, featureUsage, pipeline, totalBilled, billedByMonth, subscriptionStats] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '7 days') as last7 FROM users`),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '7 days') as last7 FROM projects`),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='submitted') as submitted, COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '7 days') as last7 FROM pay_apps`),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '24 hours') as last24h FROM analytics_events`),
      pool.query(`SELECT event, meta, created_at FROM analytics_events WHERE event='server_error' ORDER BY created_at DESC LIMIT 20`),
      pool.query(`SELECT meta->>'path' as path, AVG((meta->>'ms')::int) as avg_ms, COUNT(*) as hits FROM analytics_events WHERE event='slow_request' AND created_at > NOW()-INTERVAL '7 days' GROUP BY path ORDER BY avg_ms DESC LIMIT 10`),
      pool.query(`SELECT event, COUNT(*) as count FROM analytics_events WHERE created_at > NOW()-INTERVAL '30 days' GROUP BY event ORDER BY count DESC LIMIT 15`),
      pool.query(`SELECT DATE(created_at) as day, COUNT(*) as signups FROM analytics_events WHERE event='user_registered' AND created_at > NOW()-INTERVAL '30 days' GROUP BY day ORDER BY day`),
      pool.query(`SELECT event, COUNT(*) as count FROM analytics_events WHERE event IN ('payapp_created','payapp_submitted','pdf_downloaded','project_created','payapp_lines_saved') AND created_at > NOW()-INTERVAL '30 days' GROUP BY event ORDER BY count DESC`),
      pool.query(`SELECT COALESCE(SUM(scheduled_value), 0) as pipeline, COUNT(DISTINCT project_id) as project_count FROM sov_lines`),
      pool.query(`SELECT COALESCE(SUM(amount_due), 0) as total_billed, COUNT(*) as count FROM pay_apps WHERE status IN ('submitted','approved','paid') AND deleted_at IS NULL`),
      pool.query(`SELECT TO_CHAR(DATE_TRUNC('month', COALESCE(submitted_at, created_at)), 'Mon YYYY') as month, DATE_TRUNC('month', COALESCE(submitted_at, created_at)) as month_dt, COALESCE(SUM(amount_due), 0) as billed FROM pay_apps WHERE status IN ('submitted','approved','paid') AND deleted_at IS NULL GROUP BY month_dt, month ORDER BY month_dt DESC LIMIT 12`),
      pool.query(`SELECT
        COUNT(*) FILTER (WHERE subscription_status='trial') as trial_users,
        COUNT(*) FILTER (WHERE subscription_status='active') as pro_users,
        COUNT(*) FILTER (WHERE subscription_status='free_override') as free_override_users,
        COUNT(*) FILTER (WHERE subscription_status='canceled') as canceled_users,
        COUNT(*) FILTER (WHERE subscription_status='trial' AND trial_end_date < NOW()) as expired_trials,
        COUNT(*) FILTER (WHERE subscription_status='trial' AND trial_end_date BETWEEN NOW() AND NOW()+INTERVAL '7 days') as expiring_this_week
      FROM users`),
    ]);
    const pipelineTotal = parseFloat(pipeline.rows[0].pipeline) || 0;
    const billedTotal   = parseFloat(totalBilled.rows[0].total_billed) || 0;
    const projectCount  = parseInt(pipeline.rows[0].project_count) || 0;
    const avgContract   = projectCount > 0 ? Math.round(pipelineTotal / projectCount) : 0;
    res.json({
      users:       users.rows[0],
      projects:    projects.rows[0],
      payapps:     payapps.rows[0],
      events:      events.rows[0],
      recentErrors,
      slowRequests:  slowReqs.rows,
      topEvents:     topEvents.rows,
      dailySignups:  dailySignups.rows,
      featureUsage:  featureUsage.rows,
      revenue: {
        pipeline:     pipelineTotal,
        total_billed: billedTotal,
        avg_contract: avgContract,
        billed_by_month: billedByMonth.rows.reverse(),
      },
      subscriptions: subscriptionStats.rows[0] || {},
    });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// Chart: pay app creation count by month (last 12 months)
router.get('/chart/payapp-activity', adminAuth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') as month,
             DATE_TRUNC('month', created_at) as month_dt,
             COUNT(*) as count
      FROM pay_apps
      WHERE created_at > NOW() - INTERVAL '12 months'
        AND deleted_at IS NULL
      GROUP BY month_dt, month
      ORDER BY month_dt ASC
    `);
    res.json(r.rows);
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// Chart: pipeline vs billed by user (top 10 by pipeline)
router.get('/chart/pipeline-by-user', adminAuth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.name, u.email,
             COALESCE(SUM(sl.scheduled_value), 0) as pipeline,
             COALESCE(SUM(pa.amount_due) FILTER (WHERE pa.status IN ('submitted','approved','paid') AND pa.deleted_at IS NULL), 0) as billed
      FROM users u
      LEFT JOIN projects p ON p.user_id = u.id
      LEFT JOIN sov_lines sl ON sl.project_id = p.id
      LEFT JOIN pay_apps pa ON pa.project_id = p.id
      GROUP BY u.id, u.name, u.email
      HAVING COALESCE(SUM(sl.scheduled_value), 0) > 0
      ORDER BY pipeline DESC
      LIMIT 10
    `);
    res.json(r.rows);
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/errors', adminAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT event, meta, created_at FROM analytics_events WHERE event IN ('server_error','login_failed') ORDER BY created_at DESC LIMIT 100`
    );
    res.json(r.rows);
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/errors', adminAuth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM analytics_events WHERE event IN ('server_error','login_failed','slow_request')`);
    await logEvent(req.user.id, 'admin_errors_cleared', {});
    res.json({ ok: true });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/users', adminAuth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id, u.name, u.email, u.created_at,
        u.email_verified, u.blocked, u.google_id,
        u.trial_start_date, u.trial_end_date, u.subscription_status, u.plan_type,
        COUNT(DISTINCT p.id) as project_count,
        COUNT(DISTINCT pa.id) as payapp_count,
        COUNT(DISTINCT pa.id) FILTER (WHERE pa.status='submitted') as submitted_count,
        MAX(ae.created_at) as last_active
      FROM users u
      LEFT JOIN projects p ON p.user_id = u.id
      LEFT JOIN pay_apps pa ON pa.project_id = p.id
      LEFT JOIN analytics_events ae ON ae.user_id = u.id
      GROUP BY u.id ORDER BY u.created_at DESC LIMIT 200
    `);
    res.json(r.rows);
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ── SUPER ADMIN: User management ────────────────────────────────────────────
router.post('/users/:id/block', adminAuth, async (req, res) => {
  const { reason } = req.body;
  const target = (await pool.query('SELECT email FROM users WHERE id=$1', [req.params.id])).rows[0];
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (isAdminEmail(target.email))
    return res.status(403).json({ error: 'Admin accounts cannot be blocked.' });
  await pool.query('UPDATE users SET blocked=TRUE, blocked_reason=$1 WHERE id=$2', [reason||'Blocked by admin', req.params.id]);
  await logEvent(req.user.id, 'admin_user_blocked', { target_user_id: parseInt(req.params.id), reason });
  res.json({ ok: true });
});

router.post('/users/:id/unblock', adminAuth, async (req, res) => {
  await pool.query('UPDATE users SET blocked=FALSE, blocked_reason=NULL WHERE id=$1', [req.params.id]);
  await logEvent(req.user.id, 'admin_user_unblocked', { target_user_id: parseInt(req.params.id) });
  res.json({ ok: true });
});

router.post('/users/:id/verify-email', adminAuth, async (req, res) => {
  await pool.query('UPDATE users SET email_verified=TRUE, verification_token=NULL WHERE id=$1', [req.params.id]);
  await logEvent(req.user.id, 'admin_email_verified', { target_user_id: parseInt(req.params.id) });
  res.json({ ok: true });
});

// ── Admin: resend verification email to any user ─────────────────────────────
router.post('/users/:id/resend-verification', adminAuth, async (req, res) => {
  try {
    const user = (await pool.query('SELECT id, email, name, email_verified FROM users WHERE id=$1', [req.params.id])).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.email_verified) return res.json({ ok: true, message: 'Already verified' });
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query('UPDATE users SET verification_token=$1, verification_sent_at=NOW() WHERE id=$2', [token, user.id]);
    // Note: sendVerificationEmail is called from server.js scope
    res.json({ ok: true });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Admin: reset any user's password directly (no email needed) ─────────────
router.post('/users/:id/reset-password', adminAuth, async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const user = (await pool.query('SELECT id, email, name FROM users WHERE id=$1', [req.params.id])).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash=$1, reset_token=NULL, reset_token_sent_at=NULL WHERE id=$2', [hash, req.params.id]);
    await logEvent(req.user.id, 'admin_password_reset', { target_user_id: parseInt(req.params.id), target_email: user.email });
    const tok = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, email: user.email, token: tok });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ── SUBSCRIPTION & TRIAL STATUS ──────────────────────────────────────────────
router.get('/subscription', auth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT trial_start_date, trial_end_date, subscription_status, plan_type, stripe_customer_id FROM users WHERE id=$1',
      [req.user.id]
    );
    const user = r.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    const now = new Date();
    const trialEnd = user.trial_end_date ? new Date(user.trial_end_date) : null;
    const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd - now) / (1000*60*60*24))) : 0;
    const trialExpired = trialEnd ? now > trialEnd : false;
    const isAdmin = isAdminEmail(req.user.email);
    res.json({
      trial_start_date: user.trial_start_date,
      trial_end_date: user.trial_end_date,
      subscription_status: isAdmin ? 'active' : user.subscription_status,
      plan_type: isAdmin ? 'pro' : user.plan_type,
      days_left: daysLeft,
      trial_expired: isAdmin ? false : trialExpired,
      is_admin: isAdmin,
      has_stripe: !!user.stripe_customer_id
    });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Stripe Subscription Billing ($40/month Pro plan) ────────────────────────

// One-time setup: create the Stripe Product + Price (admin only, idempotent)
router.post('/setup-subscription-product', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const existing = (await pool.query("SELECT value FROM app_settings WHERE key='subscription_price_id'")).rows[0];
    if (existing?.value) {
      try {
        const price = await stripe.prices.retrieve(existing.value);
        return res.json({ message: 'Subscription product already exists', price_id: existing.value, product_id: price.product, amount: price.unit_amount, interval: price.recurring?.interval });
      } catch(e) { /* price was deleted, recreate below */ }
    }
    const product = await stripe.products.create({
      name: 'ConstructInvoice AI Pro',
      description: 'Full access to ConstructInvoice AI — G702/G703 pay apps, lien waivers, payment collection, AI assistant, and more.',
      metadata: { app: 'constructinvoice', tier: 'pro' }
    });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: 4000,
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { app: 'constructinvoice', tier: 'pro' }
    });
    await pool.query(
      "INSERT INTO app_settings(key,value) VALUES('subscription_price_id',$1) ON CONFLICT(key) DO UPDATE SET value=$1",
      [price.id]
    );
    await pool.query(
      "INSERT INTO app_settings(key,value) VALUES('subscription_product_id',$1) ON CONFLICT(key) DO UPDATE SET value=$1",
      [product.id]
    );
    console.log(`[Stripe] Created subscription product ${product.id} with price ${price.id} ($40/month)`);
    res.json({ message: 'Subscription product created', product_id: product.id, price_id: price.id, amount: 4000, interval: 'month' });
  } catch(e) { console.error('[Stripe Setup Error]', e.message); res.status(500).json({ error: e.message }); }
});

// Get subscription price ID (used by frontend to create checkout)
router.get('/subscription/price', auth, async (req, res) => {
  try {
    const r = (await pool.query("SELECT value FROM app_settings WHERE key='subscription_price_id'")).rows[0];
    if (!r?.value) return res.status(404).json({ error: 'Subscription not configured. Admin must run setup first.' });
    res.json({ price_id: r.value, amount: 4000, currency: 'usd', interval: 'month' });
  } catch(e) { res.status(500).json({ error: 'Internal error' }); }
});

// Create a Stripe Checkout Session for subscription
router.post('/subscription/checkout', auth, requireStripe, async (req, res) => {
  try {
    const priceRow = (await pool.query("SELECT value FROM app_settings WHERE key='subscription_price_id'")).rows[0];
    if (!priceRow?.value) return res.status(400).json({ error: 'Subscription price not configured. Admin must run setup first.' });
    const user = (await pool.query('SELECT id, email, name, stripe_customer_id FROM users WHERE id=$1', [req.user.id])).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { user_id: String(user.id), app: 'constructinvoice' }
      });
      customerId = customer.id;
      await pool.query('UPDATE users SET stripe_customer_id=$1 WHERE id=$2', [customerId, user.id]);
    }
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceRow.value, quantity: 1 }],
      success_url: `${baseUrl}/app.html?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/app.html?subscription=cancelled`,
      metadata: { user_id: String(user.id), app: 'constructinvoice' },
      subscription_data: {
        metadata: { user_id: String(user.id), app: 'constructinvoice' }
      }
    });
    console.log(`[Subscription] Checkout session created for user ${user.id} (${user.email})`);
    res.json({ checkout_url: session.url, session_id: session.id });
  } catch(e) { console.error('[Subscription Checkout Error]', e.message); res.status(500).json({ error: e.message }); }
});

// Create Stripe Customer Portal session (manage subscription, cancel, update payment)
router.post('/subscription/portal', auth, requireStripe, async (req, res) => {
  try {
    const user = (await pool.query('SELECT stripe_customer_id FROM users WHERE id=$1', [req.user.id])).rows[0];
    if (!user?.stripe_customer_id) return res.status(400).json({ error: 'No active subscription found' });
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${baseUrl}/app.html#settings`,
    });
    res.json({ portal_url: session.url });
  } catch(e) { console.error('[Portal Error]', e.message); res.status(500).json({ error: e.message }); }
});

// Admin: update subscription price (change amount)
router.post('/update-subscription-price', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const { amount } = req.body;
    if (!amount || amount < 1) return res.status(400).json({ error: 'Amount must be at least $1' });
    const productRow = (await pool.query("SELECT value FROM app_settings WHERE key='subscription_product_id'")).rows[0];
    if (!productRow?.value) return res.status(400).json({ error: 'No subscription product exists. Run setup first.' });
    const price = await stripe.prices.create({
      product: productRow.value,
      unit_amount: Math.round(amount * 100),
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { app: 'constructinvoice', tier: 'pro' }
    });
    const oldPriceRow = (await pool.query("SELECT value FROM app_settings WHERE key='subscription_price_id'")).rows[0];
    if (oldPriceRow?.value) {
      try { await stripe.prices.update(oldPriceRow.value, { active: false }); } catch(e) {}
    }
    await pool.query("UPDATE app_settings SET value=$1 WHERE key='subscription_price_id'", [price.id]);
    console.log(`[Stripe] Updated subscription price to $${amount}/month (${price.id})`);
    res.json({ message: `Price updated to $${amount}/month`, price_id: price.id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: Stripe webhook management (SDK-only, no dashboard needed) ─────────
const REQUIRED_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.deleted',
  'customer.subscription.updated',
  'payment_intent.payment_failed'
];

router.get('/stripe/list-webhooks', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 20 });
    res.json(endpoints.data.map(ep => ({
      id: ep.id,
      url: ep.url,
      status: ep.status,
      enabled_events: ep.enabled_events,
      api_version: ep.api_version,
      created: new Date(ep.created * 1000).toISOString()
    })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/stripe/create-webhook', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const { url } = req.body;
    const targetUrl = url || `${process.env.BASE_URL || `${req.protocol}://${req.get('host')}`}/api/stripe/webhook`;
    const existing = await stripe.webhookEndpoints.list({ limit: 20 });
    const found = existing.data.find(ep => ep.url === targetUrl && ep.status === 'enabled');
    if (found) {
      return res.json({ message: 'Webhook already exists', id: found.id, url: found.url, secret: '(already created — check Railway env)', events: found.enabled_events });
    }
    const endpoint = await stripe.webhookEndpoints.create({
      url: targetUrl,
      enabled_events: REQUIRED_WEBHOOK_EVENTS,
      description: 'ConstructInvoice AI — payments + subscriptions',
      metadata: { app: 'constructinvoice', created_by: 'admin_sdk' }
    });
    console.log(`[Stripe] Webhook endpoint created: ${endpoint.id} → ${targetUrl}`);
    res.json({ message: 'Webhook created', id: endpoint.id, url: endpoint.url, secret: endpoint.secret, events: endpoint.enabled_events });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/stripe/delete-webhook', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const { webhook_id } = req.body;
    if (!webhook_id) return res.status(400).json({ error: 'webhook_id required' });
    await stripe.webhookEndpoints.del(webhook_id);
    console.log(`[Stripe] Webhook endpoint deleted: ${webhook_id}`);
    res.json({ message: 'Webhook deleted', id: webhook_id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Comprehensive Stripe setup verification
router.get('/stripe/verify-setup', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const checks = {};
    const account = await stripe.accounts.retrieve();
    checks.account = { id: account.id, name: account.settings?.dashboard?.display_name, country: account.country, charges: account.charges_enabled, payouts: account.payouts_enabled };
    checks.mode = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test') ? 'TEST' : 'LIVE';
    const prodRow = (await pool.query("SELECT value FROM app_settings WHERE key='subscription_product_id'")).rows[0];
    const priceRow = (await pool.query("SELECT value FROM app_settings WHERE key='subscription_price_id'")).rows[0];
    checks.subscription = { product_id: prodRow?.value || 'NOT SET', price_id: priceRow?.value || 'NOT SET' };
    if (priceRow?.value) {
      try {
        const price = await stripe.prices.retrieve(priceRow.value);
        checks.subscription.amount = price.unit_amount / 100;
        checks.subscription.currency = price.currency;
        checks.subscription.interval = price.recurring?.interval;
        checks.subscription.active = price.active;
      } catch(e) { checks.subscription.error = 'Price not found in Stripe: ' + e.message; }
    }
    const endpoints = await stripe.webhookEndpoints.list({ limit: 20 });
    checks.webhooks = endpoints.data.map(ep => ({ id: ep.id, url: ep.url, status: ep.status, events: ep.enabled_events.length }));
    checks.webhook_secret_configured = !!process.env.STRIPE_WEBHOOK_SECRET;
    const connectedAccounts = (await pool.query('SELECT COUNT(*) FROM connected_accounts WHERE account_status=$1', ['active'])).rows[0].count;
    checks.connected_accounts = parseInt(connectedAccounts);
    const issues = [];
    if (!prodRow?.value) issues.push('No subscription product — run setup-subscription-product');
    if (!priceRow?.value) issues.push('No subscription price — run setup-subscription-product');
    if (checks.webhooks.length === 0) issues.push('No webhook endpoints configured');
    if (!process.env.STRIPE_WEBHOOK_SECRET) issues.push('STRIPE_WEBHOOK_SECRET env var not set');
    if (!process.env.BASE_URL) issues.push('BASE_URL env var not set (needed for payment links)');
    checks.ready = issues.length === 0;
    checks.issues = issues;
    res.json(checks);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── Admin: End-to-End Stripe Test Harness ────────────────────────────────────
// Creates test GC accounts, projects, pay apps, and verifies money flow.
// ALL endpoints are admin-only. Used in TEST mode only.
// ══════════════════════════════════════════════════════════════════════════════

// Create a test GC user + Stripe Express connected account + onboarding link
router.post('/test/create-test-gc', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  const isTest = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test');
  if (!isTest) return res.status(403).json({ error: 'Test endpoints only work in Stripe TEST mode' });
  try {
    const { name, email, company_name } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'name and email required' });
    let userId;
    const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (existing.rows[0]) {
      userId = existing.rows[0].id;
    } else {
      const hash = await bcrypt.hash('TestPass123!', 10);
      const r = await pool.query(
        `INSERT INTO users(name,email,password_hash,email_verified,trial_start_date,trial_end_date,subscription_status,plan_type)
         VALUES($1,$2,$3,TRUE,NOW(),NOW()+INTERVAL '90 days','trial','free_trial') RETURNING id`,
        [name, email, hash]
      );
      userId = r.rows[0].id;
    }
    if (company_name) {
      await pool.query(
        `INSERT INTO company_settings(user_id, company_name) VALUES($1,$2)
         ON CONFLICT(user_id) DO UPDATE SET company_name=$2`,
        [userId, company_name]
      );
    }
    const existingAcct = await pool.query('SELECT * FROM connected_accounts WHERE user_id=$1', [userId]);
    let accountId;
    if (existingAcct.rows[0]) {
      accountId = existingAcct.rows[0].stripe_account_id;
    } else {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: email,
        business_type: 'company',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
          us_bank_account_ach_payments: { requested: true },
        },
        metadata: { user_id: String(userId), platform: 'constructinvoice', test: 'true' },
      });
      accountId = account.id;
      await pool.query(
        'INSERT INTO connected_accounts(user_id, stripe_account_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET stripe_account_id=$2',
        [userId, accountId]
      );
      await pool.query('UPDATE users SET stripe_connect_id=$1 WHERE id=$2', [accountId, userId]);
    }
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/app.html#payments_setup=refresh`,
      return_url: `${baseUrl}/app.html#payments_setup=complete`,
      type: 'account_onboarding',
    });
    const acct = await stripe.accounts.retrieve(accountId);
    res.json({
      message: 'Test GC created',
      user_id: userId,
      email: email,
      password: 'TestPass123!',
      stripe_account_id: accountId,
      charges_enabled: acct.charges_enabled,
      payouts_enabled: acct.payouts_enabled,
      onboarding_url: link.url,
      note: 'Open onboarding_url in browser. In test mode, click "Use test data" to auto-fill all fields.'
    });
  } catch(e) {
    console.error('[Test Create GC]', e.message);
    if (e.code === '23505') return res.status(400).json({ error: 'Email already exists — use a different email or the existing user' });
    res.status(500).json({ error: e.message });
  }
});

// Create a test project + SOV + pay app for a test GC user, and generate payment link
router.post('/test/create-test-payapp', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const { user_id, project_name, contract_amount, owner_name, owner_email } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    const pName = project_name || 'Test Renovation Project';
    const amount = contract_amount || 85000;
    const oName = owner_name || 'John Smith (Test Owner)';
    const oEmail = owner_email || 'testowner@example.com';
    const proj = await pool.query(
      `INSERT INTO projects(user_id,name,number,owner,owner_email,contractor,original_contract,default_retainage,payment_terms)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [user_id, pName, 'TEST-' + Date.now().toString(36).toUpperCase(), oName, oEmail, 'Test GC Company', amount, 10, 'Net 30']
    );
    const projectId = proj.rows[0].id;
    const sovItems = [
      { item_id: '1', description: 'General Conditions', scheduled_value: Math.round(amount * 0.08) },
      { item_id: '2', description: 'Site Preparation', scheduled_value: Math.round(amount * 0.05) },
      { item_id: '3', description: 'Concrete & Foundation', scheduled_value: Math.round(amount * 0.15) },
      { item_id: '4', description: 'Framing & Structural', scheduled_value: Math.round(amount * 0.20) },
      { item_id: '5', description: 'Electrical', scheduled_value: Math.round(amount * 0.12) },
      { item_id: '6', description: 'Plumbing', scheduled_value: Math.round(amount * 0.10) },
      { item_id: '7', description: 'HVAC', scheduled_value: Math.round(amount * 0.10) },
      { item_id: '8', description: 'Finishes & Paint', scheduled_value: Math.round(amount * 0.08) },
      { item_id: '9', description: 'Landscaping', scheduled_value: Math.round(amount * 0.05) },
      { item_id: '10', description: 'Project Management Fee', scheduled_value: amount - Math.round(amount * 0.93) },
    ];
    const sovTotal = sovItems.reduce((s, l) => s + l.scheduled_value, 0);
    for (const [i, line] of sovItems.entries()) {
      await pool.query(
        'INSERT INTO sov_lines(project_id,item_id,description,scheduled_value,sort_order) VALUES($1,$2,$3,$4,$5)',
        [projectId, line.item_id, line.description, line.scheduled_value, i]
      );
    }
    await pool.query('UPDATE projects SET original_contract=$1 WHERE id=$2', [sovTotal, projectId]);
    const invoiceToken = crypto.randomBytes(24).toString('hex');
    const pa = await pool.query(
      `INSERT INTO pay_apps(project_id,app_number,period_label,period_start,period_end,invoice_token)
       VALUES($1,1,'March 2026','2026-03-01','2026-03-31',$2) RETURNING *`,
      [projectId, invoiceToken]
    );
    const paId = pa.rows[0].id;
    const sovLines = await pool.query('SELECT * FROM sov_lines WHERE project_id=$1 ORDER BY sort_order', [projectId]);
    let totalThisPeriod = 0;
    for (const line of sovLines.rows) {
      const thisPct = 30;
      const sv = parseFloat(line.scheduled_value);
      totalThisPeriod += sv * thisPct / 100;
      await pool.query(
        'INSERT INTO pay_app_lines(pay_app_id,sov_line_id,prev_pct,this_pct,retainage_pct,stored_materials) VALUES($1,$2,$3,$4,$5,$6)',
        [paId, line.id, 0, thisPct, 10, 0]
      );
    }
    const payToken = crypto.randomBytes(24).toString('hex');
    await pool.query('UPDATE pay_apps SET payment_link_token=$1, status=$2 WHERE id=$3', [payToken, 'submitted', paId]);
    const grossThisPeriod = totalThisPeriod;
    const retainage = grossThisPeriod * 0.10;
    const netAfterRetainage = grossThisPeriod - retainage;
    const paymentDue = netAfterRetainage;
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    res.json({
      message: 'Test project + pay app created',
      project_id: projectId,
      project_name: pName,
      pay_app_id: paId,
      sov_total: sovTotal,
      sov_lines: sovItems.length,
      progress_pct: 30,
      gross_this_period: grossThisPeriod,
      retainage_10pct: retainage,
      net_after_retainage: netAfterRetainage,
      payment_due: paymentDue,
      payment_link: `${baseUrl}/pay/${payToken}`,
      payment_token: payToken,
      owner: oName,
      owner_email: oEmail,
      expected_fees: {
        ach: { platform_fee: 25.00, gc_receives: paymentDue - 25.00, owner_pays: paymentDue },
        card: {
          processing_fee: Math.round((paymentDue * 0.033 + 0.40) * 100) / 100,
          owner_pays: Math.round((paymentDue + paymentDue * 0.033 + 0.40) * 100) / 100,
          gc_receives: paymentDue,
          platform_keeps_margin: Math.round(((paymentDue * 0.033 + 0.40) - (paymentDue * 0.029 + 0.30)) * 100) / 100
        }
      }
    });
  } catch(e) {
    console.error('[Test Create PayApp]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Complete reconciliation report — shows ALL money flow with math verification
router.get('/test/reconciliation', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const payments = await pool.query(`
      SELECT p.*, pa.app_number, pa.project_id, pa.payment_link_token,
             pr.name as project_name, pr.owner, u.name as gc_name, u.email as gc_email,
             ca.stripe_account_id
      FROM payments p
      JOIN pay_apps pa ON pa.id = p.pay_app_id
      JOIN projects pr ON pr.id = pa.project_id
      JOIN users u ON u.id = p.user_id
      LEFT JOIN connected_accounts ca ON ca.user_id = p.user_id
      ORDER BY p.created_at DESC
    `);
    const connectedAccts = await pool.query(`
      SELECT ca.*, u.name as gc_name, u.email as gc_email
      FROM connected_accounts ca
      JOIN users u ON u.id = ca.user_id
    `);
    const accountDetails = [];
    for (const acct of connectedAccts.rows) {
      try {
        const stripeAcct = await stripe.accounts.retrieve(acct.stripe_account_id);
        let balance = null;
        try { balance = await stripe.balance.retrieve({ stripeAccount: acct.stripe_account_id }); } catch(e) {}
        accountDetails.push({
          gc_name: acct.gc_name,
          gc_email: acct.gc_email,
          stripe_id: acct.stripe_account_id,
          charges_enabled: stripeAcct.charges_enabled,
          payouts_enabled: stripeAcct.payouts_enabled,
          business_name: stripeAcct.business_profile?.name || stripeAcct.settings?.dashboard?.display_name,
          balance: balance ? {
            available: balance.available.map(b => ({ amount: b.amount / 100, currency: b.currency })),
            pending: balance.pending.map(b => ({ amount: b.amount / 100, currency: b.currency }))
          } : 'Unable to retrieve'
        });
      } catch(e) {
        accountDetails.push({ gc_name: acct.gc_name, stripe_id: acct.stripe_account_id, error: e.message });
      }
    }
    let platformBalance;
    try {
      const bal = await stripe.balance.retrieve();
      platformBalance = {
        available: bal.available.map(b => ({ amount: b.amount / 100, currency: b.currency })),
        pending: bal.pending.map(b => ({ amount: b.amount / 100, currency: b.currency }))
      };
    } catch(e) { platformBalance = { error: e.message }; }
    let recentCharges = [];
    try {
      const charges = await stripe.charges.list({ limit: 20 });
      recentCharges = charges.data.map(c => ({
        id: c.id,
        amount: c.amount / 100,
        fee: c.application_fee_amount ? c.application_fee_amount / 100 : 0,
        net: (c.amount - (c.application_fee_amount || 0)) / 100,
        status: c.status,
        method: c.payment_method_details?.type || 'unknown',
        destination: c.transfer_data?.destination || 'platform',
        created: new Date(c.created * 1000).toISOString(),
        description: c.description
      }));
    } catch(e) { recentCharges = [{ error: e.message }]; }
    let subscriptions = [];
    try {
      const subs = await stripe.subscriptions.list({ limit: 50, status: 'all' });
      subscriptions = subs.data.map(s => ({
        id: s.id,
        customer: s.customer,
        status: s.status,
        amount: s.items.data[0]?.price?.unit_amount / 100,
        interval: s.items.data[0]?.price?.recurring?.interval,
        created: new Date(s.created * 1000).toISOString(),
        current_period_end: new Date(s.current_period_end * 1000).toISOString()
      }));
    } catch(e) {}
    const dbPayments = payments.rows.map(p => ({
      id: p.id,
      pay_app: `#${p.app_number}`,
      project: p.project_name,
      gc: p.gc_name,
      amount: parseFloat(p.amount),
      processing_fee: parseFloat(p.processing_fee || 0),
      platform_fee: parseFloat(p.platform_fee || 0),
      method: p.payment_method,
      payment_status: p.payment_status,
      stripe_session: p.stripe_checkout_session_id,
      connected_account: p.stripe_account_id,
      created: p.created_at
    }));
    const totals = {
      total_payments: dbPayments.length,
      total_amount: dbPayments.reduce((s, p) => s + p.amount, 0),
      total_platform_fees: dbPayments.reduce((s, p) => s + p.platform_fee, 0),
      total_processing_fees: dbPayments.reduce((s, p) => s + p.processing_fee, 0),
      total_subscriptions: subscriptions.length,
      active_subscriptions: subscriptions.filter(s => s.status === 'active').length,
      monthly_subscription_revenue: subscriptions.filter(s => s.status === 'active').reduce((s, sub) => s + (sub.amount || 0), 0)
    };
    res.json({
      summary: totals,
      platform_balance: platformBalance,
      connected_accounts: accountDetails,
      payments: dbPayments,
      stripe_charges: recentCharges,
      subscriptions: subscriptions,
      generated_at: new Date().toISOString()
    });
  } catch(e) {
    console.error('[Reconciliation]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Complete onboarding programmatically in TEST MODE
router.post('/test/complete-onboarding', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  const isTest = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test');
  if (!isTest) return res.status(403).json({ error: 'Only works in Stripe TEST mode' });
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    const user = await pool.query('SELECT name, email FROM users WHERE id=$1', [user_id]);
    if (!user.rows[0]) return res.status(404).json({ error: 'User not found' });
    const company = await pool.query('SELECT company_name FROM company_settings WHERE user_id=$1', [user_id]);
    const userName = user.rows[0]?.name || 'Test User';
    const userEmail = user.rows[0]?.email;
    const companyName = company.rows[0]?.company_name || 'Test Construction Co';
    const nameParts = userName.split(' ');
    const firstName = nameParts[0] || 'Test';
    const lastName = nameParts.slice(1).join(' ') || 'User';
    const existing = await pool.query('SELECT stripe_account_id FROM connected_accounts WHERE user_id=$1', [user_id]);
    if (existing.rows[0]) {
      try { await stripe.accounts.del(existing.rows[0].stripe_account_id); } catch(e) {
        console.log(`[Test] Could not delete old account: ${e.message}`);
      }
      await pool.query('DELETE FROM connected_accounts WHERE user_id=$1', [user_id]);
    }
    const account = await stripe.accounts.create({
      type: 'custom',
      country: 'US',
      email: userEmail,
      business_type: 'individual',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
        us_bank_account_ach_payments: { requested: true },
      },
      business_profile: {
        mcc: '1520',
        name: companyName,
        product_description: 'General contracting and construction services',
        url: 'https://www.example-construction.com',
      },
      individual: {
        first_name: firstName,
        last_name: lastName,
        email: userEmail,
        phone: '+14155552671',
        dob: { day: 1, month: 1, year: 1990 },
        address: { line1: '123 Test Street', city: 'San Francisco', state: 'CA', postal_code: '94105', country: 'US' },
        ssn_last_4: '0000',
        id_number: '000000000',
      },
      tos_acceptance: {
        date: Math.floor(Date.now() / 1000),
        ip: '127.0.0.1',
        service_agreement: 'full',
      },
      metadata: { user_id: String(user_id), platform: 'constructinvoice', test: 'true' },
    });
    const accountId = account.id;
    const person = { id: 'individual_account' };
    await stripe.accounts.createExternalAccount(accountId, {
      external_account: {
        object: 'bank_account',
        country: 'US',
        currency: 'usd',
        routing_number: '110000000',
        account_number: '000123456789',
      },
    });
    await pool.query(
      'INSERT INTO connected_accounts(user_id, stripe_account_id, account_status, charges_enabled, payouts_enabled, business_name, onboarded_at) VALUES($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT(user_id) DO UPDATE SET stripe_account_id=$2, account_status=$3, charges_enabled=$4, payouts_enabled=$5, business_name=$6, onboarded_at=NOW()',
      [user_id, accountId, 'active', true, true, companyName]
    );
    await pool.query('UPDATE users SET stripe_connect_id=$1, payments_enabled=TRUE WHERE id=$2', [accountId, user_id]);
    const acct = await stripe.accounts.retrieve(accountId);
    res.json({
      message: 'Custom account created & fully onboarded',
      stripe_account_id: accountId,
      account_type: 'custom',
      charges_enabled: acct.charges_enabled,
      payouts_enabled: acct.payouts_enabled,
      details_submitted: acct.details_submitted,
      requirements: {
        currently_due: acct.requirements?.currently_due || [],
        past_due: acct.requirements?.past_due || [],
        disabled_reason: acct.requirements?.disabled_reason || null,
      },
      business_name: acct.business_profile?.name,
      person_id: person.id,
      bank_account: 'Test bank ****6789 (routing 110000000)',
      note: 'Custom accounts work identically to Express for payments — same transfer_data, same application_fee routing.'
    });
  } catch(e) {
    console.error('[Test Onboarding]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// List all test GC accounts with their Stripe status
router.get('/test/list-test-gcs', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const gcs = await pool.query(`
      SELECT u.id, u.name, u.email, u.subscription_status, u.plan_type,
             ca.stripe_account_id, ca.charges_enabled, ca.payouts_enabled, ca.account_status, ca.business_name,
             COUNT(DISTINCT pr.id) as project_count,
             COUNT(DISTINCT pa.id) as payapp_count
      FROM users u
      LEFT JOIN connected_accounts ca ON ca.user_id = u.id
      LEFT JOIN projects pr ON pr.user_id = u.id
      LEFT JOIN pay_apps pa ON pa.project_id = pr.id AND pa.deleted_at IS NULL
      GROUP BY u.id, u.name, u.email, u.subscription_status, u.plan_type,
               ca.stripe_account_id, ca.charges_enabled, ca.payouts_enabled, ca.account_status, ca.business_name
      ORDER BY u.created_at DESC
    `);
    const results = [];
    for (const gc of gcs.rows) {
      const entry = { ...gc, project_count: parseInt(gc.project_count), payapp_count: parseInt(gc.payapp_count) };
      if (gc.stripe_account_id) {
        try {
          const acct = await stripe.accounts.retrieve(gc.stripe_account_id);
          entry.stripe_live = {
            charges_enabled: acct.charges_enabled,
            payouts_enabled: acct.payouts_enabled,
            details_submitted: acct.details_submitted,
            business_name: acct.business_profile?.name || acct.settings?.dashboard?.display_name
          };
        } catch(e) { entry.stripe_live = { error: e.message }; }
      }
      results.push(entry);
    }
    res.json(results);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Cleanup: remove test data (test users, projects, pay apps)
router.post('/test/cleanup', adminAuth, async (req, res) => {
  try {
    const { user_ids } = req.body;
    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: 'user_ids array required' });
    }
    for (const uid of user_ids) {
      const ca = await pool.query('SELECT stripe_account_id FROM connected_accounts WHERE user_id=$1', [uid]);
      if (ca.rows[0]?.stripe_account_id) {
        try { await stripe.accounts.del(ca.rows[0].stripe_account_id); } catch(e) {
          console.log(`[Test Cleanup] Could not delete Stripe account ${ca.rows[0].stripe_account_id}: ${e.message}`);
        }
      }
    }
    const placeholders = user_ids.map((_, i) => `$${i + 1}`).join(',');
    const deleted = await pool.query(`DELETE FROM users WHERE id IN (${placeholders}) RETURNING id, email`, user_ids);
    res.json({ message: `Cleaned up ${deleted.rows.length} test users`, deleted: deleted.rows });
  } catch(e) {
    console.error('[Test Cleanup]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Admin: Manage user trials & subscriptions ────────────────────────────────
router.post('/users/:id/extend-trial', adminAuth, async (req, res) => {
  const { days } = req.body;
  if (!days || days < 1 || days > 365) return res.status(400).json({ error: 'Days must be between 1 and 365' });
  try {
    await pool.query(
      'UPDATE users SET trial_end_date = COALESCE(trial_end_date, NOW()) + ($1 || \' days\')::INTERVAL, subscription_status = \'trial\', plan_type = \'free_trial\' WHERE id=$2',
      [days.toString(), req.params.id]
    );
    await logEvent(req.user.id, 'admin_trial_extended', { target_user_id: parseInt(req.params.id), days });
    res.json({ ok: true });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/users/:id/set-free-override', adminAuth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE users SET subscription_status = \'free_override\', plan_type = \'free_override\', trial_end_date = NOW() + INTERVAL \'100 years\' WHERE id=$1',
      [req.params.id]
    );
    await logEvent(req.user.id, 'admin_free_override', { target_user_id: parseInt(req.params.id) });
    res.json({ ok: true });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/users/:id/upgrade-pro', adminAuth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE users SET subscription_status = \'active\', plan_type = \'pro\' WHERE id=$1',
      [req.params.id]
    );
    await logEvent(req.user.id, 'admin_upgrade_pro', { target_user_id: parseInt(req.params.id) });
    res.json({ ok: true });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/users/:id/reset-trial', adminAuth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE users SET trial_start_date = NOW(), trial_end_date = NOW() + INTERVAL \'90 days\', subscription_status = \'trial\', plan_type = \'free_trial\' WHERE id=$1',
      [req.params.id]
    );
    await logEvent(req.user.id, 'admin_trial_reset', { target_user_id: parseInt(req.params.id) });
    res.json({ ok: true });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Admin: list support requests (from analytics_events) ────────────────────
router.get('/support-requests', adminAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, meta AS event_data, created_at FROM analytics_events
       WHERE event = 'support_request'
       ORDER BY created_at DESC LIMIT 100`
    );
    res.json(r.rows);
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/users/:id', adminAuth, async (req, res) => {
  const user = (await pool.query('SELECT email FROM users WHERE id=$1', [req.params.id])).rows[0];
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (isAdminEmail(user.email))
    return res.status(403).json({ error: 'Admin accounts cannot be deleted.' });
  await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  await logEvent(req.user.id, 'admin_user_deleted', { target_email: user.email });
  res.json({ ok: true });
});

// ── AI INSIGHTS (requires ANTHROPIC_API_KEY env var) ───────────────────────
router.post('/ask', adminAuth, async (req, res) => {
  const { question, history = [] } = req.body;
  if (!question) return res.status(400).json({ error: 'Question required' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI insights not configured — set ANTHROPIC_API_KEY in Railway' });
  try {
    const [users, projects, payapps, topEvents, dailySignups, recentErrors, slowReqs] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '7 days') as last7, COUNT(*) FILTER (WHERE email_verified=TRUE) as verified, COUNT(*) FILTER (WHERE blocked=TRUE) as blocked FROM users`),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '7 days') as last7 FROM projects`),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='submitted') as submitted FROM pay_apps`),
      pool.query(`SELECT event, COUNT(*) as count FROM analytics_events WHERE created_at > NOW()-INTERVAL '30 days' GROUP BY event ORDER BY count DESC LIMIT 20`),
      pool.query(`SELECT DATE(created_at) as day, COUNT(*) as signups FROM analytics_events WHERE event='user_registered' AND created_at > NOW()-INTERVAL '14 days' GROUP BY day ORDER BY day`),
      pool.query(`SELECT COUNT(*) as count FROM analytics_events WHERE event='server_error' AND created_at > NOW()-INTERVAL '24 hours'`),
      pool.query(`SELECT meta->>'path' as path, COUNT(*) as hits FROM analytics_events WHERE event='slow_request' AND created_at > NOW()-INTERVAL '7 days' GROUP BY path ORDER BY hits DESC LIMIT 5`),
    ]);

    const context = `
You are the analytics AI for Construction AI Billing — a SaaS product for AIA G702/G703 construction pay applications.

CURRENT DATA SNAPSHOT:
Users: ${users.rows[0].total} total, +${users.rows[0].last7} this week, ${users.rows[0].verified} verified, ${users.rows[0].blocked} blocked
Projects: ${projects.rows[0].total} total, +${projects.rows[0].last7} this week
Pay Apps: ${payapps.rows[0].total} created, ${payapps.rows[0].submitted} submitted
Server errors (last 24h): ${recentErrors.rows[0].count}

TOP EVENTS (last 30 days):
${topEvents.rows.map(r=>`  ${r.event}: ${r.count}`).join('\n')}

DAILY SIGNUPS (last 14 days):
${dailySignups.rows.map(r=>`  ${r.day}: ${r.signups}`).join('\n') || '  No signups yet'}

SLOW ENDPOINTS (last 7 days):
${slowReqs.rows.map(r=>`  ${r.path}: ${r.hits} times`).join('\n') || '  None'}

The product roadmap:
- Phase 1 (current): AIA billing, pay applications, PDF export
- Phase 2 (next): Invoicing, vendor payments, basic P&L
- Phase 3 (future): ACH transfers, money holding, financial powerhouse for contractors

Answer the following question based on this data. Be specific, actionable, and direct. If data is limited (early stage), say so and give advice for what to watch as it grows.
`.trim();

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: context,
        messages: [...(history || []).slice(-20), { role: 'user', content: question }],
      }),
    });
    const aiData = await aiRes.json();
    if (aiData.error) throw new Error(aiData.error.message);
    res.json({ answer: aiData.content?.[0]?.text || 'No response' });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Weekly insight summary ──────────────────────────────────────────────────
router.get('/weekly-insight', adminAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not set' });
  req.body = { question: 'Give me a complete weekly business summary. What is growing, what is slowing, what needs my attention, and what is one thing I should do this week to improve the product or grow the user base? Format as clear sections.' };
  res.redirect('/api/admin/ask');
});

// ── Admin: get feedback ─────────────────────────────────────────────────────
router.get('/feedback', adminAuth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT f.*, u.name as user_name, u.email as user_email
      FROM feedback f
      LEFT JOIN users u ON u.id = f.user_id
      ORDER BY f.created_at DESC
      LIMIT 200
    `);
    res.json(r.rows);
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;
