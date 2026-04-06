/**
 * Extended Admin Routes — Super Admin Controls for Trial System
 * Module 2: Super Admin Controls
 * Extends existing admin.js with trial management, subscription control, and manual interventions
 *
 * All routes are protected by adminAuth middleware
 */

const express = require('express');
const { pool } = require('../../db');
const { adminAuth } = require('../middleware/auth');
const { logEvent } = require('../lib/logEvent');

const router = express.Router();

/**
 * GET /api/admin/trial-stats
 * Trial & subscription system KPIs
 */
router.get('/trial-stats', adminAuth, async (req, res) => {
  try {
    const [trialStats, expiringTrials, mrrData, conversionData] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(CASE WHEN subscription_status = 'trial' AND plan_type = 'free_trial' THEN 1 END) as trial_users,
          COUNT(CASE WHEN subscription_status = 'active' AND plan_type = 'pro' THEN 1 END) as pro_users,
          COUNT(CASE WHEN subscription_status = 'free_override' THEN 1 END) as free_override_users,
          COUNT(CASE WHEN subscription_status = 'canceled' THEN 1 END) as canceled_users,
          COUNT(CASE WHEN subscription_status = 'past_due' THEN 1 END) as past_due_users
        FROM users
      `),
      pool.query(`
        SELECT COUNT(*) as count
        FROM users
        WHERE subscription_status = 'trial'
          AND trial_end_date >= NOW()
          AND trial_end_date <= NOW() + INTERVAL '7 days'
      `),
      pool.query(`
        SELECT
          COUNT(*) as active_subscriptions,
          COALESCE(COUNT(*) * 40, 0) as mrr
        FROM users
        WHERE subscription_status = 'active' AND plan_type = 'pro'
      `),
      pool.query(`
        SELECT
          COUNT(CASE WHEN subscription_status = 'trial' THEN 1 END) as trial_count,
          COUNT(CASE WHEN subscription_status = 'active' AND plan_type = 'pro' THEN 1 END) as pro_count
        FROM users
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `)
    ]);

    const stats = trialStats.rows[0];
    const expiring = expiringTrials.rows[0];
    const mrr = mrrData.rows[0];
    const conversion = conversionData.rows[0];

    const conversionRate = parseInt(conversion.trial_count) > 0
      ? ((parseInt(conversion.pro_count) / parseInt(conversion.trial_count)) * 100).toFixed(2)
      : 0;

    res.json({
      ok: true,
      user_counts: {
        trial_users: parseInt(stats.trial_users),
        pro_users: parseInt(stats.pro_users),
        free_override_users: parseInt(stats.free_override_users),
        canceled_users: parseInt(stats.canceled_users),
        past_due_users: parseInt(stats.past_due_users),
        total_users: parseInt(stats.trial_users) + parseInt(stats.pro_users) + parseInt(stats.free_override_users)
      },
      trial_expiry: {
        expiring_this_week: parseInt(expiring.count)
      },
      revenue: {
        mrr: parseFloat(mrr.mrr) || 0,
        active_subscriptions: parseInt(mrr.active_subscriptions)
      },
      metrics: {
        conversion_rate_30d: parseFloat(conversionRate),
        trial_to_pro_last_30d: parseInt(conversion.pro_count)
      }
    });
  } catch (e) {
    console.error('[Admin Trial Stats] error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/users/:id/extend-trial
 * Extend a user's trial end date by X days
 * Body: { days: 7 }
 */
router.post('/users/:id/extend-trial', adminAuth, async (req, res) => {
  try {
    const days = parseInt(req.body.days) || 7;
    const userId = parseInt(req.params.id);

    if (days < 1 || days > 365) {
      return res.status(400).json({ error: 'days must be between 1 and 365' });
    }

    // Use parameterized interval — safe from SQL injection
    const r = await pool.query(
      `UPDATE users
       SET trial_end_date = COALESCE(trial_end_date, NOW()) + ($1 || ' days')::INTERVAL
       WHERE id = $2
       RETURNING id, email, trial_end_date, subscription_status`,
      [days.toString(), userId]
    );

    if (!r.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = r.rows[0];

    await logEvent(req.user.id, 'admin_trial_extended', {
      target_user_id: userId,
      target_email: user.email,
      extended_by_days: days,
      new_trial_end_date: user.trial_end_date
    });

    res.json({
      ok: true,
      user,
      message: `Trial extended by ${days} days for ${user.email}`
    });
  } catch (e) {
    console.error('[Admin Trial Extend] error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/users/:id/set-free-override
 * Manually set user to free_override (waive payment indefinitely)
 */
router.post('/users/:id/set-free-override', adminAuth, async (req, res) => {
  try {
    const { reason = 'Admin override' } = req.body;
    const userId = parseInt(req.params.id);

    const r = await pool.query(
      `UPDATE users
       SET subscription_status = $1, plan_type = $2
       WHERE id = $3
       RETURNING id, email, subscription_status, plan_type`,
      ['free_override', 'free_override', userId]
    );

    if (!r.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = r.rows[0];

    await logEvent(req.user.id, 'admin_free_override', {
      target_user_id: userId,
      target_email: user.email,
      reason
    });

    res.json({
      ok: true,
      user,
      message: `${user.email} set to free_override`
    });
  } catch (e) {
    console.error('[Admin Free Override] error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/users/:id/upgrade-to-pro
 * Manually upgrade user to Pro
 */
router.post('/users/:id/upgrade-to-pro', adminAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const r = await pool.query(
      `UPDATE users
       SET subscription_status = $1, plan_type = $2
       WHERE id = $3
       RETURNING id, email, subscription_status, plan_type`,
      ['active', 'pro', userId]
    );

    if (!r.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = r.rows[0];

    await logEvent(req.user.id, 'admin_manual_upgrade', {
      target_user_id: userId,
      target_email: user.email
    });

    res.json({
      ok: true,
      user,
      message: `${user.email} upgraded to Pro`
    });
  } catch (e) {
    console.error('[Admin Manual Upgrade] error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/users/:id/reset-to-trial
 * Reset user back to a fresh 90-day trial
 */
router.post('/users/:id/reset-to-trial', adminAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const r = await pool.query(
      `UPDATE users
       SET trial_start_date = NOW(),
           trial_end_date = NOW() + INTERVAL '90 days',
           subscription_status = $1,
           plan_type = $2,
           stripe_subscription_id = NULL
       WHERE id = $3
       RETURNING id, email, trial_start_date, trial_end_date, subscription_status`,
      ['trial', 'free_trial', userId]
    );

    if (!r.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = r.rows[0];

    await logEvent(req.user.id, 'admin_trial_reset', {
      target_user_id: userId,
      target_email: user.email,
      new_trial_end_date: user.trial_end_date
    });

    res.json({
      ok: true,
      user,
      message: `${user.email} reset to 90-day trial`
    });
  } catch (e) {
    console.error('[Admin Trial Reset] error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/users/:id/send-email
 * Send manual email to a user
 * Body: { subject, html }
 */
router.post('/users/:id/send-email', adminAuth, async (req, res) => {
  try {
    const { subject, html } = req.body;
    const userId = parseInt(req.params.id);

    if (!subject || !html) {
      return res.status(400).json({ error: 'subject and html required' });
    }

    const userR = await pool.query(
      `SELECT id, email FROM users WHERE id = $1`,
      [userId]
    );

    if (!userR.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userR.rows[0];

    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.FROM_EMAIL || 'noreply@varshyl.com';

    if (!apiKey) {
      return res.status(503).json({ error: 'RESEND_API_KEY not configured' });
    }

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [user.email],
        subject,
        html
      })
    });

    const body = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      console.error('[Admin Email] Resend error:', resp.status, body);
      return res.status(resp.status).json({ error: 'Failed to send email', detail: body });
    }

    await logEvent(req.user.id, 'admin_email_sent', {
      target_user_id: userId,
      target_email: user.email,
      subject,
      resend_id: body.id
    });

    res.json({
      ok: true,
      email_id: body.id,
      to: user.email,
      subject,
      message: `Email sent to ${user.email}`
    });
  } catch (e) {
    console.error('[Admin Email] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
