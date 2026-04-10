'use strict';
/**
 * scripts/payment-health-check.js
 *
 * Daily payment health monitor for ConstructInvoice AI.
 * Checks for stuck payments, missed webhooks, and subscription gaps.
 * Run via: node scripts/payment-health-check.js
 * Or scheduled via Railway CRON or package.json script.
 *
 * Sends summary email to ALERT_EMAIL (default: vaakapila@gmail.com) via Resend.
 */

require('dotenv').config();
const { pool } = require('../db');

const ALERT_EMAIL   = process.env.ALERT_EMAIL   || 'vaakapila@gmail.com';
const FROM_EMAIL    = process.env.FROM_EMAIL     || 'billing@varshyl.com';
const RESEND_KEY    = process.env.RESEND_API_KEY;
const BASE_URL      = process.env.BASE_URL       || 'https://constructinv.varshyl.com';

// ── Helpers ────────────────────────────────────────────────────────────────

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const age = (ts) => Math.round((Date.now() - new Date(ts).getTime()) / 60000); // minutes ago

async function sendAlert(subject, bodyText, bodyHtml) {
  if (!RESEND_KEY) {
    console.warn('[health-check] RESEND_API_KEY not set — skipping email alert');
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({ from: FROM_EMAIL, to: ALERT_EMAIL, subject, text: bodyText, html: bodyHtml }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    console.error('[health-check] Resend error:', e.message || res.status);
  } else {
    console.log('[health-check] Alert email sent →', ALERT_EMAIL);
  }
}

// ── Check 1: Payments stuck in 'pending' > 3 hours (ACH issue) ────────────

async function checkStuckACH() {
  const result = await pool.query(`
    SELECT
      p.id,
      p.payment_status,
      p.amount,
      p.stripe_session_id,
      p.created_at,
      pa.app_number,
      proj.name AS project_name,
      proj.owner_email,
      u.email AS gc_email
    FROM payments p
    JOIN pay_apps pa   ON pa.id = p.pay_app_id
    JOIN projects proj ON proj.id = pa.project_id
    JOIN users u       ON u.id = proj.user_id
    WHERE p.payment_status = 'pending'
      AND p.created_at < NOW() - INTERVAL '3 hours'
    ORDER BY p.created_at ASC
  `);
  return result.rows;
}

// ── Check 2: Early pay requests stuck in 'processing' > 2 hours ───────────

async function checkStuckEarlyPay() {
  const result = await pool.query(`
    SELECT
      epr.id,
      epr.status,
      epr.amount,
      epr.fee_amount,
      epr.created_at,
      pt.name  AS trade_name,
      proj.name AS project_name,
      u.email  AS gc_email
    FROM early_payment_requests epr
    JOIN project_trades pt ON pt.id = epr.trade_id
    JOIN projects proj     ON proj.id = epr.project_id
    JOIN users u           ON u.id = proj.user_id
    WHERE epr.status = 'processing'
      AND epr.created_at < NOW() - INTERVAL '2 hours'
    ORDER BY epr.created_at ASC
  `);
  return result.rows;
}

// ── Check 3: Subscription webhook missed ──────────────────────────────────
// Users who have a stripe_subscription_id but subscription_status is still 'trial'
// (Stripe invoice.paid webhook may have been missed)

async function checkMissedSubscriptionWebhooks() {
  const result = await pool.query(`
    SELECT
      id,
      email,
      subscription_status,
      stripe_subscription_id,
      stripe_customer_id,
      trial_end_date,
      created_at
    FROM users
    WHERE stripe_subscription_id IS NOT NULL
      AND subscription_status IN ('trial', 'free_override')
    ORDER BY created_at DESC
    LIMIT 20
  `);
  return result.rows;
}

// ── Check 4: Trials that expired with no upgrade attempt ─────────────────

async function checkExpiredTrials() {
  const result = await pool.query(`
    SELECT
      id, email, trial_end_date, subscription_status,
      stripe_customer_id,
      (SELECT COUNT(*) FROM projects WHERE user_id = users.id) AS project_count,
      (SELECT COUNT(*) FROM pay_apps pa JOIN projects p ON p.id = pa.project_id WHERE p.user_id = users.id) AS pay_app_count
    FROM users
    WHERE subscription_status = 'trial'
      AND trial_end_date < NOW()
    ORDER BY trial_end_date ASC
    LIMIT 50
  `);
  return result.rows;
}

// ── Check 5: Daily payment volume (24h summary) ───────────────────────────

async function getDailyPaymentSummary() {
  const result = await pool.query(`
    SELECT
      COUNT(*)                                   AS total_payments,
      COUNT(*) FILTER (WHERE payment_status = 'succeeded') AS succeeded,
      COUNT(*) FILTER (WHERE payment_status = 'pending')   AS pending,
      COUNT(*) FILTER (WHERE payment_status = 'failed')    AS failed,
      COALESCE(SUM(amount) FILTER (WHERE payment_status = 'succeeded'), 0) AS total_amount
    FROM payments
    WHERE created_at > NOW() - INTERVAL '24 hours'
  `);
  return result.rows[0];
}

// ── Check 6: Weekly metrics snapshot ─────────────────────────────────────

async function getWeeklyMetrics() {
  const [users, pro, hubDocs, trustDist, lienAlerts, earlyPay] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS count FROM users WHERE created_at > NOW() - INTERVAL '7 days'`),
    pool.query(`SELECT COUNT(*) AS count FROM users WHERE subscription_status = 'active'`),
    pool.query(`SELECT COUNT(*) AS count FROM hub_uploads WHERE created_at > NOW() - INTERVAL '7 days'`),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE score BETWEEN 0   AND 152) AS bronze,
        COUNT(*) FILTER (WHERE score BETWEEN 153 AND 381) AS silver,
        COUNT(*) FILTER (WHERE score BETWEEN 382 AND 572) AS gold,
        COUNT(*) FILTER (WHERE score BETWEEN 573 AND 763) AS platinum
      FROM vendor_trust_scores
    `),
    pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE dismissed_at IS NOT NULL) AS dismissed FROM aria_lien_alerts`),
    pool.query(`
      SELECT
        COUNT(*)                                           AS total_requests,
        COUNT(*) FILTER (WHERE status = 'approved')        AS approved,
        COUNT(*) FILTER (WHERE status = 'rejected')        AS rejected,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE status = 'approved') /
          NULLIF(COUNT(*) FILTER (WHERE status IN ('approved','rejected')), 0),
          1
        ) AS completion_rate_pct
      FROM early_payment_requests
      WHERE created_at > NOW() - INTERVAL '7 days'
    `),
  ]);

  return {
    newUsers:      parseInt(users.rows[0].count),
    proUsers:      parseInt(pro.rows[0].count),
    hubDocs:       parseInt(hubDocs.rows[0].count),
    trustDist:     trustDist.rows[0],
    lienAlerts:    lienAlerts.rows[0],
    earlyPayStats: earlyPay.rows[0],
  };
}

// ── Build report & send ────────────────────────────────────────────────────

async function run() {
  console.log('[health-check] Starting payment health check…', new Date().toISOString());

  let issues = [];
  let warnings = [];

  // Run all checks in parallel
  const [stuckACH, stuckEarlyPay, missedWebhooks, expiredTrials, dailySummary, weeklyMetrics] =
    await Promise.all([
      checkStuckACH().catch(e => { console.error('[health-check] stuckACH error:', e.message); return []; }),
      checkStuckEarlyPay().catch(e => { console.error('[health-check] stuckEarlyPay error:', e.message); return []; }),
      checkMissedSubscriptionWebhooks().catch(e => { console.error('[health-check] missedWebhooks error:', e.message); return []; }),
      checkExpiredTrials().catch(e => { console.error('[health-check] expiredTrials error:', e.message); return []; }),
      getDailyPaymentSummary().catch(e => { console.error('[health-check] dailySummary error:', e.message); return {}; }),
      getWeeklyMetrics().catch(e => { console.error('[health-check] weeklyMetrics error:', e.message); return {}; }),
    ]);

  // Classify findings
  if (stuckACH.length > 0) {
    issues.push(`🚨 ${stuckACH.length} ACH payment(s) stuck in 'pending' > 3h — may need Stripe manual investigation`);
    stuckACH.forEach(p =>
      issues.push(`   └─ Payment ${p.id} · ${fmt(p.amount)} · App #${p.app_number} · ${age(p.created_at)} min old · ${p.gc_email}`)
    );
  }

  if (stuckEarlyPay.length > 0) {
    issues.push(`🚨 ${stuckEarlyPay.length} early pay request(s) stuck in 'processing' > 2h`);
    stuckEarlyPay.forEach(r =>
      issues.push(`   └─ Request ${r.id} · ${fmt(r.amount)} · ${r.trade_name} · ${age(r.created_at)} min old · ${r.gc_email}`)
    );
  }

  if (missedWebhooks.length > 0) {
    warnings.push(`⚠️  ${missedWebhooks.length} user(s) have stripe_subscription_id but status is still 'trial' — possible missed webhook`);
    missedWebhooks.slice(0, 5).forEach(u =>
      warnings.push(`   └─ ${u.email} · sub: ${u.stripe_subscription_id} · trial ends ${u.trial_end_date?.toISOString?.()?.slice(0,10) ?? 'unknown'}`)
    );
  }

  if (expiredTrials.length > 0) {
    warnings.push(`⚠️  ${expiredTrials.length} trial(s) expired without upgrading`);
  }

  // Daily summary
  const dailyLine = `📊 Last 24h: ${dailySummary.total_payments || 0} payments — ✅ ${dailySummary.succeeded || 0} succeeded · ⏳ ${dailySummary.pending || 0} pending · ❌ ${dailySummary.failed || 0} failed · ${fmt(dailySummary.total_amount)} processed`;

  // Weekly metrics
  const weeklyLines = weeklyMetrics.newUsers !== undefined ? [
    `📈 Weekly Metrics (last 7 days):`,
    `   New users: ${weeklyMetrics.newUsers} · Pro subscribers: ${weeklyMetrics.proUsers}`,
    `   Hub docs uploaded: ${weeklyMetrics.hubDocs}`,
    `   Trust tiers: 🥉 ${weeklyMetrics.trustDist?.bronze || 0} Bronze · 🥈 ${weeklyMetrics.trustDist?.silver || 0} Silver · 🥇 ${weeklyMetrics.trustDist?.gold || 0} Gold · 💎 ${weeklyMetrics.trustDist?.platinum || 0} Platinum`,
    `   Lien alerts: ${weeklyMetrics.lienAlerts?.total || 0} total · ${weeklyMetrics.lienAlerts?.dismissed || 0} dismissed`,
    `   Early pay (7d): ${weeklyMetrics.earlyPayStats?.total_requests || 0} requests · ${weeklyMetrics.earlyPayStats?.approved || 0} approved · ${weeklyMetrics.earlyPayStats?.completion_rate_pct || 0}% completion rate`,
  ] : [];

  // Build report
  const hasIssues = issues.length > 0;
  const subject = hasIssues
    ? `🚨 ConstructInvoice AI — ${issues.length} Payment Issue(s) Detected`
    : `✅ ConstructInvoice AI — Payment Health OK (${new Date().toLocaleDateString('en-US')})`;

  const reportLines = [
    `ConstructInvoice AI — Payment Health Check`,
    `Generated: ${new Date().toISOString()}`,
    `Environment: ${BASE_URL}`,
    ``,
    ...(hasIssues ? ['── ISSUES (action required) ──', ...issues, ''] : ['── STATUS: All systems healthy ──', '']),
    ...(warnings.length > 0 ? ['── WARNINGS ──', ...warnings, ''] : []),
    '── DAILY SUMMARY ──',
    dailyLine,
    '',
    ...weeklyLines,
    '',
    `── END OF REPORT ──`,
    `View admin dashboard: ${BASE_URL}/app.html`,
  ];

  const bodyText = reportLines.join('\n');
  const bodyHtml = `<pre style="font-family:monospace;font-size:13px;line-height:1.6">${bodyText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>`;

  console.log('\n' + reportLines.join('\n'));

  // Only send email if issues found, or if it's a weekly run (Monday)
  const isMonday = new Date().getDay() === 1;
  if (hasIssues || warnings.length > 0 || isMonday) {
    await sendAlert(subject, bodyText, bodyHtml);
  } else {
    console.log('[health-check] No issues and not Monday — skipping email (all good)');
  }

  return { issues: issues.length, warnings: warnings.length };
}

// ── Entry point ────────────────────────────────────────────────────────────

run()
  .then(({ issues, warnings }) => {
    console.log(`[health-check] Done — ${issues} issues, ${warnings} warnings`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('[health-check] Fatal error:', err);
    process.exit(1);
  });
