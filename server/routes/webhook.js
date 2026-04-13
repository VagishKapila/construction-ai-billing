const express = require('express');
const router = express.Router();

const { pool } = require('../../db');
const { stripe } = require('../services/stripe');
const { logEvent } = require('../lib/logEvent');

// ── Email helper for payment notifications ────────────────────────────────────
async function sendPaymentReceivedEmail({ contractorEmail, contractorName, projectName, appNumber, amount, payerEmail, method }) {
  const fromEmail = process.env.FROM_EMAIL || 'billing@varshyl.com';
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !contractorEmail) return; // Gracefully skip if not configured

  const methodLabel = method === 'ach' ? 'ACH bank transfer' : 'credit/debit card';
  const fmtAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #1A2230; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
        <h1 style="color: #E8622A; margin: 0; font-size: 24px;">💰 Payment Received</h1>
      </div>
      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e0e0e0;">
        <p style="color: #333; font-size: 16px;">Hi ${contractorName || 'there'},</p>
        <p style="color: #333; font-size: 16px;">Great news! A payment has been received for your invoice:</p>
        <div style="background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #666; font-size: 14px;">Project</td><td style="padding: 8px 0; font-weight: bold; color: #333;">${projectName}</td></tr>
            <tr><td style="padding: 8px 0; color: #666; font-size: 14px;">Pay App #</td><td style="padding: 8px 0; font-weight: bold; color: #333;">${appNumber}</td></tr>
            <tr><td style="padding: 8px 0; color: #666; font-size: 14px;">Amount Paid</td><td style="padding: 8px 0; font-weight: bold; color: #1a7c42; font-size: 18px;">${fmtAmount}</td></tr>
            <tr><td style="padding: 8px 0; color: #666; font-size: 14px;">Payment Method</td><td style="padding: 8px 0; color: #333;">${methodLabel}</td></tr>
            ${payerEmail ? `<tr><td style="padding: 8px 0; color: #666; font-size: 14px;">Paid by</td><td style="padding: 8px 0; color: #333;">${payerEmail}</td></tr>` : ''}
          </table>
        </div>
        ${method === 'ach' ? '<p style="color: #666; font-size: 13px; background: #fff3cd; padding: 12px; border-radius: 6px;">⏱ <strong>ACH Transfer:</strong> Funds typically arrive in your Stripe account within 1–2 business days after the bank clears the transfer.</p>' : ''}
        <p style="color: #333; font-size: 14px;">You can view your payment dashboard at <a href="https://constructinv.varshyl.com/payments" style="color: #E8622A;">constructinv.varshyl.com</a></p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
        <p style="color: #999; font-size: 12px; text-align: center;">ConstructInvoice AI — Powered by Varshyl Inc.</p>
      </div>
    </div>
  `;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail,
        to: [contractorEmail],
        subject: `💰 Payment received: ${fmtAmount} for ${projectName} Pay App #${appNumber}`,
        html,
      }),
    });
    console.log(`[Payment Email] Sent to ${contractorEmail} for PA#${appNumber}`);
  } catch (e) {
    console.error('[Payment Email] Failed to send:', e.message);
  }
}

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

      // Send email notification to contractor when payment actually succeeds
      const isPaymentSucceeded = !isACH || isAsyncSuccess || sessionPaid;
      if (isPaymentSucceeded && userId) {
        try {
          // Get contractor email + project/pay app details
          const notifData = await pool.query(
            `SELECT u.email as contractor_email, cs.contact_name, p.name as project_name, pa.app_number
             FROM users u
             JOIN projects p ON p.user_id=u.id
             JOIN pay_apps pa ON pa.id=$1
             LEFT JOIN company_settings cs ON cs.user_id=u.id
             WHERE pa.project_id=p.id AND u.id=$2`,
            [payAppId, userId]
          );
          if (notifData.rows[0]) {
            const { contractor_email, contact_name, project_name, app_number } = notifData.rows[0];
            await sendPaymentReceivedEmail({
              contractorEmail: contractor_email,
              contractorName: contact_name || '',
              projectName: project_name,
              appNumber: app_number,
              amount: actualAmount,
              payerEmail: session.customer_details?.email || '',
              method,
            });
          }
        } catch (emailErr) {
          // Never let email failure break the webhook
          console.error('[Payment Email] Error:', emailErr.message);
        }
      }
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
