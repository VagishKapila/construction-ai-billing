/**
 * stripe-payout-dashboard/jobs/sync-balances.js
 * Module 2 — Balance Sync Cron Job
 *
 * Runs every 6 hours.
 * For every connected account in DB:
 *   - fetches live balance from Stripe
 *   - fetches last 5 payouts
 *   - updates stripe_connected_accounts
 *   - raises payout_delayed alert if balance > $0 and last payout > 3 days ago
 *
 * Can also be called manually via POST /payout-dashboard/sync
 */
'use strict';

const Stripe   = require('stripe');
const cron     = require('node-cron');
const { pool } = require('../db');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ── Helper: create alert (dedup) ──────────────────────────────────────────
async function createAlert(accountId, alertType, message) {
  const existing = await pool.query(
    'SELECT id FROM stripe_payout_alerts WHERE account_id=$1 AND alert_type=$2 AND resolved=FALSE',
    [accountId, alertType]
  );
  if (existing.rows.length > 0) return;
  await pool.query(
    'INSERT INTO stripe_payout_alerts (account_id, alert_type, message) VALUES ($1,$2,$3)',
    [accountId, alertType, message]
  );
}

async function resolveAlert(accountId, alertType) {
  await pool.query(
    'UPDATE stripe_payout_alerts SET resolved=TRUE, resolved_at=NOW() WHERE account_id=$1 AND alert_type=$2 AND resolved=FALSE',
    [accountId, alertType]
  );
}

// ── Core sync for a single account ───────────────────────────────────────
async function syncAccount(accountId) {
  try {
    // Fetch live balance
    const balance = await stripe.balance.retrieve({ stripeAccount: accountId });
    const availableUSD = (balance.available.find(b => b.currency === 'usd')?.amount || 0) / 100;
    const pendingUSD   = (balance.pending.find(b => b.currency === 'usd')?.amount   || 0) / 100;

    // Fetch last 5 payouts
    const payouts = await stripe.payouts.list({ limit: 5 }, { stripeAccount: accountId });
    const lastPayout = payouts.data[0] || null;

    const lastPayoutAmount = lastPayout ? lastPayout.amount / 100 : null;
    const lastPayoutStatus = lastPayout ? lastPayout.status       : null;
    const lastPayoutDate   = lastPayout && lastPayout.arrival_date
      ? new Date(lastPayout.arrival_date * 1000).toISOString()
      : null;

    // Update DB
    await pool.query(`
      UPDATE stripe_connected_accounts SET
        available_balance  = $1,
        pending_balance    = $2,
        last_payout_amount = COALESCE($3, last_payout_amount),
        last_payout_date   = COALESCE($4::timestamptz, last_payout_date),
        last_payout_status = COALESCE($5, last_payout_status),
        last_synced_at     = NOW(),
        updated_at         = NOW()
      WHERE account_id = $6
    `, [availableUSD, pendingUSD, lastPayoutAmount, lastPayoutDate, lastPayoutStatus, accountId]);

    // ── Alert logic ────────────────────────────────────────────────────
    // 1. Balance > $0 but last payout was more than 3 days ago (or never)
    if (availableUSD > 0) {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const lastPayoutOld = !lastPayout ||
        (lastPayout.arrival_date && new Date(lastPayout.arrival_date * 1000) < threeDaysAgo);

      if (lastPayoutOld) {
        await createAlert(
          accountId,
          'payout_delayed',
          `Account ${accountId} has $${availableUSD.toFixed(2)} available but no payout in 3+ days. ` +
          (lastPayout
            ? `Last payout: $${lastPayoutAmount.toFixed(2)} on ${lastPayoutDate?.split('T')[0] || 'unknown'} (status: ${lastPayoutStatus}).`
            : 'No payouts have ever been made on this account.')
        );
      } else {
        await resolveAlert(accountId, 'payout_delayed');
      }
    } else {
      await resolveAlert(accountId, 'payout_delayed');
    }

    // 2. Most recent payout failed
    if (lastPayout && lastPayout.status === 'failed') {
      await createAlert(
        accountId,
        'payout_failed',
        `Latest payout ${lastPayout.id} of $${lastPayoutAmount.toFixed(2)} failed` +
        (lastPayout.failure_message ? `: ${lastPayout.failure_message}` : '.')
      );
    } else if (lastPayout && lastPayout.status === 'paid') {
      await resolveAlert(accountId, 'payout_failed');
    }

    console.log(`[BalanceSync] ${accountId}: available=$${availableUSD.toFixed(2)} pending=$${pendingUSD.toFixed(2)} lastPayout=${lastPayoutStatus || 'none'}`);
    return { accountId, availableUSD, pendingUSD, lastPayoutStatus, ok: true };

  } catch (err) {
    console.error(`[BalanceSync] Failed for ${accountId}:`, err.message);
    return { accountId, ok: false, error: err.message };
  }
}

// ── Sync all accounts ─────────────────────────────────────────────────────
async function syncAllAccounts() {
  console.log('[BalanceSync] Starting full sync…');
  const start = Date.now();

  const { rows } = await pool.query(
    'SELECT account_id FROM stripe_connected_accounts WHERE payouts_enabled=TRUE ORDER BY account_id'
  );

  if (rows.length === 0) {
    console.log('[BalanceSync] No payouts-enabled accounts found in DB.');
    return { synced: 0, results: [] };
  }

  // Run sequentially to avoid Stripe rate limits
  const results = [];
  for (const row of rows) {
    const result = await syncAccount(row.account_id);
    results.push(result);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const ok      = results.filter(r => r.ok).length;
  const failed  = results.filter(r => !r.ok).length;
  console.log(`[BalanceSync] Complete: ${ok} synced, ${failed} failed in ${elapsed}s`);
  return { synced: ok, failed, results, elapsed };
}

// ── Schedule cron: every 6 hours ─────────────────────────────────────────
function startCron() {
  // "0 */6 * * *" = top of every 6th hour (midnight, 6am, noon, 6pm)
  cron.schedule('0 */6 * * *', async () => {
    console.log('[BalanceSync] Cron triggered (6-hour interval)');
    await syncAllAccounts();
  }, {
    timezone: 'America/New_York',
  });
  console.log('[BalanceSync] Cron scheduled — runs every 6 hours');
}

module.exports = { syncAllAccounts, syncAccount, startCron };
