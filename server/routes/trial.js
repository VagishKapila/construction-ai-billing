/**
 * Trial & Subscription Routes
 * Handles trial status and Pro upgrade
 * Module 1: Trial & Subscription System
 *
 * Note: Subscription webhooks are handled by server/routes/webhook.js
 * (which has Stripe signature verification). No duplicate handler here.
 */

const express = require('express');
const { pool } = require('../../db');
const trialService = require('../services/trial');
const { logEvent } = require('../lib/logEvent');

const router = express.Router();

/**
 * GET /api/trial/status
 * Returns trial status, days remaining, subscription info, is_blocked flag
 * Works with or without auth token (anonymous gets default response)
 */
router.get('/status', async (req, res) => {
  try {
    // If no token, return anonymous (no trial)
    if (!req.user) {
      return res.json({
        trial_start_date: null,
        trial_end_date: null,
        subscription_status: 'none',
        plan_type: null,
        days_remaining: 0,
        is_expired: true,
        is_blocked: false,
        authenticated: false
      });
    }

    const status = await trialService.getTrialStatus(req.user.id);

    // If user has free_override or active subscription, not blocked
    if (status.subscription_status === 'free_override' || status.subscription_status === 'active') {
      status.is_blocked = false;
    }

    res.json({
      ...status,
      authenticated: true,
      message: status.is_blocked
        ? 'Your 90-day trial has ended. Upgrade to Pro ($40/month) to continue.'
        : null
    });
  } catch (e) {
    console.error('[Trial API] /status error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/trial/upgrade
 * Create Stripe Checkout session for $40/month Pro subscription
 * Protected: auth required (applied in server/app.js)
 */
router.post('/upgrade', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    if (!process.env.STRIPE_PRO_PRICE_ID) {
      return res.status(500).json({ error: 'Pro subscription price not configured. Contact admin.' });
    }

    // Get user email
    const userR = await pool.query(
      `SELECT id, email FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (!userR.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userR.rows[0];

    // Create Stripe Checkout session
    const result = await trialService.createProSubscription(
      user.id,
      user.email,
      process.env.STRIPE_SECRET_KEY,
      process.env.STRIPE_PRO_PRICE_ID
    );

    await logEvent(user.id, 'upgrade_initiated', { session_id: result.session_id });

    res.json({
      ok: true,
      session_id: result.session_id,
      url: result.url,
      message: 'Stripe Checkout session created'
    });
  } catch (e) {
    console.error('[Trial API] /upgrade error:', e.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

module.exports = {
  router
};
