/**
 * stripe-payout-dashboard/webhooks/stripe-webhook.js
 * Module 1 — Webhook Listener
 *
 * Handles all Stripe payout-related events and persists them to DB.
 * Endpoint: POST /stripe-webhooks/payout-events
 */
'use strict';

const express  = require('express');
const router   = express.Router();
const Stripe   = require('stripe');
const { pool } = require('../db');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ── Helper: upsert a connected account row from any Stripe account object ──
async function upsertConnectedAccount(acct) {
  const bank = acct.external_accounts?.data?.[0] || null;
  await pool.query(`
    INSERT INTO stripe_connected_accounts
      (account_id, email, business_name, charges_enabled, payouts_enabled,
       bank_last4, bank_routing, bank_name, payout_schedule, payout_delay_days,
       onboarding_complete, last_synced_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
    ON CONFLICT (account_id) DO UPDATE SET
      email               = COALESCE(EXCLUDED.email, stripe_connected_accounts.email),
      business_name       = COALESCE(EXCLUDED.business_name, stripe_connected_accounts.business_name),
      charges_enabled     = EXCLUDED.charges_enabled,
      payouts_enabled     = EXCLUDED.payouts_enabled,
      bank_last4          = COALESCE(EXCLUDED.bank_last4, stripe_connected_accounts.bank_last4),
      bank_routing        = COALESCE(EXCLUDED.bank_routing, stripe_connected_accounts.bank_routing),
      bank_name           = COALESCE(EXCLUDED.bank_name, stripe_connected_accounts.bank_name),
      payout_schedule     = EXCLUDED.payout_schedule,
      payout_delay_days   = EXCLUDED.payout_delay_days,
      onboarding_complete = EXCLUDED.onboarding_complete,
      last_synced_at      = NOW(),
      updated_at          = NOW()
  `, [
    acct.id,
    acct.email || null,
    acct.business_profile?.name || acct.settings?.dashboard?.display_name || null,
    acct.charges_enabled,
    acct.payouts_enabled,
    bank?.last4 || null,
    bank?.routing_number || null,
    bank?.bank_name || null,
    acct.settings?.payouts?.schedule?.interval || 'daily',
    acct.settings?.payouts?.schedule?.delay_days || 2,
    acct.details_submitted && acct.charges_enabled,
  ]);
}

// ── Helper: record a raw event into the event log ──────────────────────────
async function recordEvent(eventId, eventType, connectedAccountId, amount, currency, status, failureMessage, metadata, rawEvent) {
  await pool.query(`
    INSERT INTO stripe_payout_events
      (event_id, event_type, connected_account_id, amount, currency, status, failure_message, metadata, raw_event)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (event_id) DO NOTHING
  `, [
    eventId,
    eventType,
    connectedAccountId || null,
    amount   != null ? amount / 100 : null,   // cents → dollars
    currency || 'usd',
    status   || null,
    failureMessage || null,
    JSON.stringify(metadata || {}),
    JSON.stringify(rawEvent),
  ]);
}

// ── Helper: update last payout fields on the connected account ─────────────
async function updateLastPayout(accountId, payoutObj) {
  const amount    = (payoutObj.amount || 0) / 100;
  const status    = payoutObj.status;
  const arrivalTs = payoutObj.arrival_date
    ? new Date(payoutObj.arrival_date * 1000).toISOString()
    : null;

  await pool.query(`
    UPDATE stripe_connected_accounts
    SET last_payout_amount = $1,
        last_payout_date   = COALESCE($2::timestamptz, last_payout_date),
        last_payout_status = $3,
        updated_at         = NOW()
    WHERE account_id = $4
  `, [amount, arrivalTs, status, accountId]);
}

// ── Helper: create a payout alert ──────────────────────────────────────────
async function createAlert(accountId, alertType, message) {
  // Avoid duplicate active alerts of the same type for the same account
  const existing = await pool.query(
    'SELECT id FROM stripe_payout_alerts WHERE account_id=$1 AND alert_type=$2 AND resolved=FALSE',
    [accountId, alertType]
  );
  if (existing.rows.length > 0) return; // already exists
  await pool.query(
    'INSERT INTO stripe_payout_alerts (account_id, alert_type, message) VALUES ($1,$2,$3)',
    [accountId, alertType, message]
  );
  console.log(`[PayoutAlert] Created ${alertType} alert for ${accountId}`);
}

// ── Helper: auto-resolve alerts when the condition clears ─────────────────
async function resolveAlert(accountId, alertType) {
  await pool.query(
    'UPDATE stripe_payout_alerts SET resolved=TRUE, resolved_at=NOW() WHERE account_id=$1 AND alert_type=$2 AND resolved=FALSE',
    [accountId, alertType]
  );
}

// ── POST /stripe-webhooks/payout-events ───────────────────────────────────
router.post('/payout-events', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig           = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  // Verify Stripe signature
  try {
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
      if (process.env.NODE_ENV === 'production') {
        console.warn('[PayoutWebhook] WARNING: No webhook secret — running unverified in production!');
      }
    }
  } catch (err) {
    console.error('[PayoutWebhook] Signature verification failed:', err.message);
    return res.status(400).send('Webhook signature error');
  }

  const obj               = event.data.object;
  const connectedAccount  = event.account || obj.account || null; // header from Stripe Connect

  console.log(`[PayoutWebhook] ${event.type} | acct: ${connectedAccount || 'platform'} | id: ${event.id}`);

  try {
    switch (event.type) {

      // ── Transfer: platform → connected account ─────────────────────────
      case 'transfer.created': {
        const t = obj;
        await recordEvent(event.id, event.type, t.destination, t.amount, t.currency, 'created', null, t.metadata, event);
        // Upsert into transfers log
        await pool.query(`
          INSERT INTO stripe_transfers_log
            (transfer_id, destination_account, amount, currency, transfer_group, description, status, metadata, stripe_created_at)
          VALUES ($1,$2,$3,$4,$5,$6,'created',$7,to_timestamp($8))
          ON CONFLICT (transfer_id) DO UPDATE SET status='created', updated_at=NOW()
        `, [
          t.id,
          t.destination,
          t.amount / 100,
          t.currency,
          t.transfer_group || null,
          t.description    || null,
          JSON.stringify(t.metadata || {}),
          t.created,
        ]).catch(() => {}); // table may not have updated_at — silently ignore
        console.log(`[Transfer] Created: ${t.id} → ${t.destination} $${(t.amount/100).toFixed(2)}`);
        break;
      }

      case 'transfer.failed': {
        const t = obj;
        await recordEvent(event.id, event.type, t.destination, t.amount, t.currency, 'failed', 'Transfer failed', t.metadata, event);
        await pool.query(
          "UPDATE stripe_transfers_log SET status='failed' WHERE transfer_id=$1",
          [t.id]
        ).catch(() => {});
        await createAlert(t.destination, 'payout_failed', `Transfer ${t.id} of $${(t.amount/100).toFixed(2)} failed.`);
        console.warn(`[Transfer] FAILED: ${t.id} → ${t.destination}`);
        break;
      }

      // ── Payout: connected account → bank ──────────────────────────────
      case 'payout.created': {
        const p = obj;
        await recordEvent(event.id, event.type, connectedAccount, p.amount, p.currency, 'in_transit', null, p.metadata, event);
        await updateLastPayout(connectedAccount, { ...p, status: 'in_transit' });
        await resolveAlert(connectedAccount, 'payout_delayed'); // payout started — resolve delay alert
        console.log(`[Payout] Created: ${p.id} for ${connectedAccount} $${(p.amount/100).toFixed(2)}`);
        break;
      }

      case 'payout.paid': {
        const p = obj;
        await recordEvent(event.id, event.type, connectedAccount, p.amount, p.currency, 'paid', null, p.metadata, event);
        await updateLastPayout(connectedAccount, { ...p, status: 'paid' });
        await resolveAlert(connectedAccount, 'payout_failed');
        await resolveAlert(connectedAccount, 'payout_delayed');
        // Update available balance (approximate — cron will get exact value)
        await pool.query(
          'UPDATE stripe_connected_accounts SET available_balance = GREATEST(0, available_balance - $1), updated_at=NOW() WHERE account_id=$2',
          [p.amount / 100, connectedAccount]
        );
        console.log(`[Payout] PAID: ${p.id} for ${connectedAccount} $${(p.amount/100).toFixed(2)}`);
        break;
      }

      case 'payout.failed': {
        const p   = obj;
        const msg = p.failure_message || p.failure_code || 'Payout to bank failed';
        await recordEvent(event.id, event.type, connectedAccount, p.amount, p.currency, 'failed', msg, p.metadata, event);
        await updateLastPayout(connectedAccount, { ...p, status: 'failed' });
        await createAlert(
          connectedAccount,
          'payout_failed',
          `Payout ${p.id} of $${(p.amount/100).toFixed(2)} failed: ${msg}`
        );
        console.error(`[Payout] FAILED: ${p.id} for ${connectedAccount} — ${msg}`);
        break;
      }

      // ── Account updated (onboarding, verification, bank change) ───────
      case 'account.updated': {
        const acct = obj;
        // Skip platform account
        if (acct.id === process.env.STRIPE_PLATFORM_ACCOUNT_ID) break;

        await recordEvent(event.id, event.type, acct.id, null, 'usd', null, null, {
          charges_enabled: acct.charges_enabled,
          payouts_enabled: acct.payouts_enabled,
        }, event);

        await upsertConnectedAccount(acct);

        // Alert if bank not connected
        if (!acct.external_accounts?.total_count) {
          await createAlert(acct.id, 'bank_not_connected', `Account ${acct.id} has no bank account connected — payouts will not work.`);
        } else {
          await resolveAlert(acct.id, 'bank_not_connected');
        }

        // Alert if verification required
        const due = [
          ...(acct.requirements?.currently_due || []),
          ...(acct.requirements?.past_due       || []),
        ];
        if (due.length > 0) {
          await createAlert(acct.id, 'verification_required',
            `Account ${acct.id} has pending requirements: ${due.slice(0,5).join(', ')}${due.length>5?' …':'.'}`
          );
        } else {
          await resolveAlert(acct.id, 'verification_required');
        }

        console.log(`[Account] Updated: ${acct.id} charges=${acct.charges_enabled} payouts=${acct.payouts_enabled}`);
        break;
      }

      // ── Capability updated (charges / transfers enabled/disabled) ─────
      case 'capability.updated': {
        const cap    = obj;
        const acctId = cap.account;
        await recordEvent(event.id, event.type, acctId, null, 'usd', cap.status, null, {
          capability: cap.id,
          status: cap.status,
        }, event);

        // Refresh full account info
        if (acctId && acctId !== process.env.STRIPE_PLATFORM_ACCOUNT_ID) {
          try {
            const acct = await stripe.accounts.retrieve(acctId);
            await upsertConnectedAccount(acct);
          } catch (e) {
            console.error(`[Capability] Could not refresh account ${acctId}:`, e.message);
          }
        }
        console.log(`[Capability] ${cap.id}=${cap.status} on ${acctId}`);
        break;
      }

      default:
        console.log(`[PayoutWebhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[PayoutWebhook] Error processing ${event.type}:`, err.message);
    // Still return 200 to prevent Stripe retries for logic errors
  }

  res.json({ received: true });
});

module.exports = router;
