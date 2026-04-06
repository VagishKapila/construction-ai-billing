/**
 * Trial Service Layer — Handle trial/subscription business logic
 * Separates concerns: database queries, Stripe API calls, calculation logic
 */

const { pool } = require('../../db');

/**
 * Get trial status for a user
 * @param {number} userId
 * @returns {Promise<{trial_start_date, trial_end_date, subscription_status, plan_type, days_remaining, is_expired, is_blocked}>}
 */
async function getTrialStatus(userId) {
  try {
    const r = await pool.query(
      `SELECT trial_start_date, trial_end_date, subscription_status, plan_type
       FROM users WHERE id = $1`,
      [userId]
    );

    if (!r.rows[0]) {
      return {
        error: 'User not found',
        is_blocked: false,
        days_remaining: 0,
        is_expired: true
      };
    }

    const user = r.rows[0];
    const now = new Date();
    const trial_end = new Date(user.trial_end_date);
    const days_remaining = Math.max(0, Math.ceil((trial_end - now) / (1000 * 60 * 60 * 24)));
    const is_expired = now > trial_end;

    // User is blocked if:
    // - Trial is expired AND subscription_status is 'trial' (not upgraded to pro/free_override)
    const is_blocked = is_expired && user.subscription_status === 'trial';

    return {
      trial_start_date: user.trial_start_date,
      trial_end_date: user.trial_end_date,
      subscription_status: user.subscription_status,
      plan_type: user.plan_type,
      days_remaining,
      is_expired,
      is_blocked
    };
  } catch (e) {
    console.error('[Trial Service] getTrialStatus error:', e.message);
    throw e;
  }
}

/**
 * Check if trial has expired
 * @param {object} user - user object with trial_end_date
 * @returns {boolean}
 */
function isTrialExpired(user) {
  if (!user || !user.trial_end_date) return false;
  return new Date() > new Date(user.trial_end_date);
}

/**
 * Gate check: can user perform an action?
 * Blocked actions during trial expiry:
 * - create_project
 * - create_pay_app
 * - send_email
 * - generate_pdf
 * - sign_lien_waiver
 *
 * @param {number} userId
 * @param {string} action - action key (see list above)
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
async function canPerformAction(userId, action) {
  try {
    const r = await pool.query(
      `SELECT subscription_status, trial_end_date FROM users WHERE id = $1`,
      [userId]
    );

    if (!r.rows[0]) {
      return { allowed: false, reason: 'User not found' };
    }

    const user = r.rows[0];
    const isExpired = isTrialExpired(user);
    const isOnTrial = user.subscription_status === 'trial';

    // If trial expired and still on trial status, block action
    if (isExpired && isOnTrial) {
      const blockedActions = [
        'create_project',
        'create_pay_app',
        'send_email',
        'generate_pdf',
        'sign_lien_waiver'
      ];

      if (blockedActions.includes(action)) {
        return {
          allowed: false,
          reason: 'Your 90-day trial has ended. Upgrade to Pro ($40/month) to continue.'
        };
      }
    }

    return { allowed: true };
  } catch (e) {
    console.error('[Trial Service] canPerformAction error:', e.message);
    throw e;
  }
}

/**
 * Create Stripe Subscription for Pro upgrade
 * Creates or updates Stripe Customer, then creates Subscription at $40/month
 *
 * @param {number} userId
 * @param {string} email
 * @param {string} stripeSecretKey
 * @param {string} stripePriceId - Stripe Price ID for $40/month plan
 * @returns {Promise<{stripe_customer_id, stripe_subscription_id, url, client_secret}>}
 */
async function createProSubscription(userId, email, stripeSecretKey, stripePriceId) {
  try {
    const Stripe = require('stripe');
    const stripe = new Stripe(stripeSecretKey);

    // Get user's current Stripe customer ID if exists
    const userR = await pool.query(
      `SELECT stripe_customer_id FROM users WHERE id = $1`,
      [userId]
    );
    const user = userR.rows[0];
    let customerId = user?.stripe_customer_id;

    // Create or get Stripe Customer
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { user_id: userId }
      });
      customerId = customer.id;
      await pool.query(
        `UPDATE users SET stripe_customer_id = $1 WHERE id = $2`,
        [customerId, userId]
      );
    }

    // Create Checkout Session for subscription
    // User pays once, then automatic billing each month
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: stripePriceId,
          quantity: 1
        }
      ],
      mode: 'subscription',
      success_url: `${process.env.BASE_URL || 'https://constructinv.varshyl.com'}/settings?subscription=success`,
      cancel_url: `${process.env.BASE_URL || 'https://constructinv.varshyl.com'}/settings?subscription=canceled`,
      metadata: { user_id: userId }
    });

    return {
      stripe_customer_id: customerId,
      url: session.url,
      session_id: session.id
    };
  } catch (e) {
    console.error('[Trial Service] createProSubscription error:', e.message);
    throw e;
  }
}

/**
 * Handle Stripe subscription webhook events
 * Updates subscription_status and plan_type based on payment/subscription lifecycle
 *
 * @param {object} event - Stripe webhook event
 * @returns {Promise<{processed: boolean, message: string}>}
 */
async function handleSubscriptionWebhook(event) {
  try {
    const { type, data } = event;

    if (type === 'invoice.paid') {
      // Subscription payment succeeded
      const invoice = data.object;
      const customerId = invoice.customer;

      const userR = await pool.query(
        `SELECT id FROM users WHERE stripe_customer_id = $1`,
        [customerId]
      );

      if (userR.rows[0]) {
        const userId = userR.rows[0].id;
        await pool.query(
          `UPDATE users
           SET subscription_status = $1, plan_type = $2
           WHERE id = $3`,
          ['active', 'pro', userId]
        );
        console.log('[Trial Webhook] User', userId, 'subscription activated (invoice.paid)');
        return { processed: true, message: 'Subscription activated' };
      }
    }

    if (type === 'invoice.payment_failed') {
      // Subscription payment failed
      const invoice = data.object;
      const customerId = invoice.customer;

      const userR = await pool.query(
        `SELECT id FROM users WHERE stripe_customer_id = $1`,
        [customerId]
      );

      if (userR.rows[0]) {
        const userId = userR.rows[0].id;
        await pool.query(
          `UPDATE users
           SET subscription_status = $1
           WHERE id = $2`,
          ['past_due', userId]
        );
        console.log('[Trial Webhook] User', userId, 'subscription past_due (invoice.payment_failed)');
        return { processed: true, message: 'Subscription marked past_due' };
      }
    }

    if (type === 'customer.subscription.deleted') {
      // Subscription canceled
      const subscription = data.object;
      const customerId = subscription.customer;

      const userR = await pool.query(
        `SELECT id FROM users WHERE stripe_customer_id = $1`,
        [customerId]
      );

      if (userR.rows[0]) {
        const userId = userR.rows[0].id;
        await pool.query(
          `UPDATE users
           SET subscription_status = $1, plan_type = NULL
           WHERE id = $2`,
          ['canceled', userId]
        );
        console.log('[Trial Webhook] User', userId, 'subscription canceled');
        return { processed: true, message: 'Subscription canceled' };
      }
    }

    if (type === 'customer.subscription.updated') {
      // Subscription status changed (e.g., active → past_due)
      const subscription = data.object;
      const customerId = subscription.customer;
      const status = subscription.status; // 'active', 'past_due', 'cancelled', etc.

      const userR = await pool.query(
        `SELECT id FROM users WHERE stripe_customer_id = $1`,
        [customerId]
      );

      if (userR.rows[0]) {
        const userId = userR.rows[0].id;
        // Map Stripe status to our subscription_status
        const mappedStatus =
          status === 'active' ? 'active' :
          status === 'past_due' ? 'past_due' :
          status === 'canceled' || status === 'cancelled' ? 'canceled' :
          status === 'trialing' ? 'active' :
          'active';

        await pool.query(
          `UPDATE users
           SET subscription_status = $1
           WHERE id = $2`,
          [mappedStatus, userId]
        );
        console.log('[Trial Webhook] User', userId, 'subscription updated to', mappedStatus);
        return { processed: true, message: `Subscription updated to ${mappedStatus}` };
      }
    }

    return { processed: false, message: 'Event type not handled' };
  } catch (e) {
    console.error('[Trial Service] handleSubscriptionWebhook error:', e.message);
    throw e;
  }
}

module.exports = {
  getTrialStatus,
  isTrialExpired,
  canPerformAction,
  createProSubscription,
  handleSubscriptionWebhook
};
