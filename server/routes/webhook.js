const express = require('express');
const router = express.Router();

const { pool } = require('../../db');
const { stripe } = require('../services/stripe');
const { logEvent } = require('../lib/logEvent');

// ── Stripe Webhook (handles payment success/failure) ────────────────────────
router.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
      console.warn('[Stripe Webhook] No webhook secret — accepting unverified event (dev only)');
    }
  } catch(e) { console.error('[Webhook Verify Error]', e.message); return res.status(400).send('Webhook Error'); }

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      const payAppId = parseInt(session.metadata?.pay_app_id);
      const paymentToken = session.metadata?.payment_token;
      const method = session.metadata?.method;
      if (!payAppId) return res.json({ received: true });
      const amountPaid = (session.amount_total || 0) / 100;
      // For CC: subtract processing fee to get actual pay app amount
      let actualAmount = amountPaid;
      if (method === 'card') {
        // Total includes processing fee; back out our fee to get pay app amount
        const payAppAmount = (await pool.query('SELECT amount FROM payments WHERE stripe_checkout_session_id=$1', [session.id])).rows[0]?.amount;
        if (payAppAmount) actualAmount = parseFloat(payAppAmount);
      }
      // For ACH: checkout.session.completed fires first with payment_status='unpaid' (processing).
      // checkout.session.async_payment_succeeded fires later when ACH clears.
      // Only mark payment as 'succeeded' when actually paid.
      const isACH = method === 'ach';
      const sessionPaid = session.payment_status === 'paid';
      const isAsyncSuccess = event.type === 'checkout.session.async_payment_succeeded';
      if (!isACH || isAsyncSuccess || sessionPaid) {
        // Update payment record to succeeded
        await pool.query(
          `UPDATE payments SET payment_status='succeeded', stripe_payment_intent_id=$1, paid_at=NOW(), payer_email=COALESCE(NULLIF(payer_email,''),$2)
           WHERE stripe_checkout_session_id=$3`,
          [session.payment_intent, session.customer_details?.email || '', session.id]
        );
      } else {
        // ACH checkout completed but payment still processing — keep as pending
        await pool.query(
          `UPDATE payments SET stripe_payment_intent_id=$1, payer_email=COALESCE(NULLIF(payer_email,''),$2)
           WHERE stripe_checkout_session_id=$3`,
          [session.payment_intent, session.customer_details?.email || '', session.id]
        );
        console.log(`[Payment] ACH payment initiated for PA#${payAppId} — waiting for bank confirmation`);
      }
      // Update pay app totals — calculate totalDue from line items if amount_due not set
      const currentPaid = (await pool.query('SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE pay_app_id=$1 AND payment_status=\'succeeded\'', [payAppId])).rows[0].total;
      const pa = (await pool.query('SELECT amount_due FROM pay_apps WHERE id=$1', [payAppId])).rows[0];
      let totalDue = parseFloat(pa?.amount_due) || 0;
      // If amount_due not snapshotted, calculate from line items (G702 math)
      if (totalDue <= 0) {
        const linesResult = await pool.query(
          `SELECT pal.*, sl.scheduled_value FROM pay_app_lines pal
           JOIN sov_lines sl ON pal.sov_line_id=sl.id WHERE pal.pay_app_id=$1`, [payAppId]);
        linesResult.rows.forEach(l => {
          const sv = parseFloat(l.scheduled_value) || 0;
          const prevP = parseFloat(l.prev_pct) || 0;
          const thisP = parseFloat(l.this_pct) || 0;
          const retP = parseFloat(l.retainage_pct) || 10;
          const d2 = sv * (prevP + thisP) / 100;
          const e2 = d2 * retP / 100;
          const f2 = d2 - e2;
          const g2 = sv * prevP / 100 * (1 - retP / 100);
          totalDue += (f2 - g2);
        });
        // Snapshot it for future lookups
        if (totalDue > 0) await pool.query('UPDATE pay_apps SET amount_due=$1 WHERE id=$2', [totalDue.toFixed(2), payAppId]);
      }
      const paidNum = parseFloat(currentPaid);
      const newStatus = paidNum >= totalDue && totalDue > 0 ? 'paid' : paidNum > 0 ? 'partial' : 'unpaid';
      await pool.query(
        'UPDATE pay_apps SET amount_paid=$1, payment_status=$2, payment_received=$3, payment_received_at=CASE WHEN $2=\'paid\' THEN NOW() ELSE payment_received_at END WHERE id=$4',
        [paidNum, newStatus, newStatus === 'paid', payAppId]
      );
      // Log event
      const userId = (await pool.query('SELECT user_id FROM payments WHERE stripe_checkout_session_id=$1', [session.id])).rows[0]?.user_id;
      if (userId) await logEvent(userId, 'payment_received', { pay_app_id: payAppId, amount: actualAmount, method, total_paid: paidNum });
      console.log(`[Payment] ${event.type}: ${method} $${actualAmount} for PA#${payAppId} (total paid: $${paidNum}, status: ${newStatus})`);
    }
    // Handle async ACH payment failure
    if (event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object;
      const payAppId = parseInt(session.metadata?.pay_app_id);
      await pool.query(
        "UPDATE payments SET payment_status='failed', failed_at=NOW(), failure_reason='ACH bank transfer failed' WHERE stripe_checkout_session_id=$1",
        [session.id]
      );
      if (payAppId) {
        await pool.query("UPDATE pay_apps SET payment_status='unpaid' WHERE id=$1 AND payment_status != 'paid'", [payAppId]);
      }
      console.log(`[Payment] ACH payment FAILED for PA#${payAppId}`);
    }
    if (event.type === 'checkout.session.expired' || event.type === 'payment_intent.payment_failed') {
      const session = event.data.object;
      const sessionId = session.id || session.metadata?.checkout_session_id;
      await pool.query("UPDATE payments SET payment_status='failed', failed_at=NOW(), failure_reason=$1 WHERE stripe_checkout_session_id=$2",
        [event.type === 'payment_intent.payment_failed' ? (session.last_payment_error?.message || 'Payment failed') : 'Session expired', sessionId]);
    }

    // ── Subscription lifecycle events ──────────────────────────────────────
    if (event.type === 'invoice.paid') {
      const invoice = event.data.object;
      const customerId = invoice.customer;
      const subscriptionId = invoice.subscription;
      if (customerId && subscriptionId) {
        const userRow = (await pool.query('SELECT id FROM users WHERE stripe_customer_id=$1', [customerId])).rows[0];
        if (userRow) {
          await pool.query(
            "UPDATE users SET subscription_status='active', plan_type='pro', stripe_subscription_id=$1 WHERE id=$2",
            [subscriptionId, userRow.id]
          );
          console.log(`[Subscription] User ${userRow.id} → active (invoice paid: ${invoice.id})`);
        }
      }
    }
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      const customerId = invoice.customer;
      if (customerId) {
        const userRow = (await pool.query('SELECT id FROM users WHERE stripe_customer_id=$1', [customerId])).rows[0];
        if (userRow) {
          await pool.query("UPDATE users SET subscription_status='past_due' WHERE id=$1", [userRow.id]);
          console.log(`[Subscription] User ${userRow.id} → past_due (invoice payment failed)`);
        }
      }
    }
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      if (customerId) {
        const userRow = (await pool.query('SELECT id FROM users WHERE stripe_customer_id=$1', [customerId])).rows[0];
        if (userRow) {
          await pool.query("UPDATE users SET subscription_status='canceled', plan_type='free_trial' WHERE id=$1", [userRow.id]);
          console.log(`[Subscription] User ${userRow.id} → canceled`);
        }
      }
    }
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      if (customerId && subscription.status === 'active') {
        const userRow = (await pool.query('SELECT id FROM users WHERE stripe_customer_id=$1', [customerId])).rows[0];
        if (userRow) {
          await pool.query(
            "UPDATE users SET subscription_status='active', plan_type='pro', stripe_subscription_id=$1 WHERE id=$2",
            [subscription.id, userRow.id]
          );
        }
      }
    }
  } catch(e) { console.error('[Webhook Processing Error]', e.message); }
  res.json({ received: true });
});

module.exports = router;
