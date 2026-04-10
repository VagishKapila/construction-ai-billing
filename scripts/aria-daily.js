'use strict';
/**
 * scripts/aria-daily.js
 *
 * ARIA Cash Intelligence — Daily Batch Job for ConstructInvoice AI.
 * Runs every morning at 7:00 AM via Railway CRON.
 *
 * What it does (in order):
 *  1. Check-and-alert: California lien deadline warnings for all active projects
 *  2. CO leakage detection: Flag approved change orders not yet billed
 *  3. Follow-up emails: Send overdue invoice reminders at correct tone/timing
 *  4. Trust score updates: Refresh vendor trust scores based on recent payment activity
 *  5. Cash flow forecasts: Rebuild 30-day projections for all active GCs
 *  6. Daily summary email to ALERT_EMAIL
 *
 * Run via: node scripts/aria-daily.js
 * Or scheduled via Railway CRON.
 */

require('dotenv').config();
const { pool } = require('../db');

const ALERT_EMAIL = process.env.ALERT_EMAIL   || 'vaakapila@gmail.com';
const FROM_EMAIL  = process.env.FROM_EMAIL    || 'billing@varshyl.com';
const RESEND_KEY  = process.env.RESEND_API_KEY;
const BASE_URL    = process.env.BASE_URL      || 'https://constructinv.varshyl.com';

// ── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const addDays = (date, days) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };
const isoDate = (d) => new Date(d).toISOString().split('T')[0];

async function sendEmail(to, subject, text, html) {
  if (!RESEND_KEY) {
    console.warn('[aria-daily] RESEND_API_KEY not set — skipping email to', to);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, text, ...(html ? { html } : {}) }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    console.error('[aria-daily] Resend error to', to, ':', e.message || res.status);
    return false;
  }
  return true;
}

// ── Step 1: California Lien Deadline Alerts ──────────────────────────────────
// Check all active projects in aria_lien_alerts where preliminary notice is
// within the 15–20 day window and alert hasn't been sent yet.

async function runLienAlerts() {
  const stats = { checked: 0, alerted: 0, errors: 0 };

  let alerts;
  try {
    const result = await pool.query(`
      SELECT
        ala.id,
        ala.project_id,
        ala.work_start_date,
        ala.preliminary_notice_due,
        ala.mechanics_lien_deadline,
        ala.stop_payment_deadline,
        ala.alert_day_15_sent,
        ala.alert_day_19_sent,
        ala.alert_day_20_sent,
        ala.dismissed_at,
        p.name  AS project_name,
        p.owner_email,
        p.owner AS owner_name,
        u.email AS gc_email,
        COALESCE(cs.company_name, u.name) AS gc_company
      FROM aria_lien_alerts ala
      JOIN projects p      ON p.id = ala.project_id
      JOIN users u         ON u.id = p.user_id
      LEFT JOIN company_settings cs ON cs.user_id = u.id
      WHERE ala.dismissed_at IS NULL
        AND p.status = 'active'
      ORDER BY ala.preliminary_notice_due ASC
    `);
    alerts = result.rows;
  } catch (e) {
    console.warn('[aria-daily] aria_lien_alerts table not ready — skipping lien step:', e.message);
    return stats;
  }

  stats.checked = alerts.length;
  const today = new Date();

  for (const alert of alerts) {
    try {
      const noticeDate = new Date(alert.preliminary_notice_due);
      const daysUntil  = Math.round((noticeDate - today) / 86400000);

      // Three alert windows: 15, 5, 1 days before deadline
      const shouldAlert15 = !alert.alert_day_15_sent && daysUntil <= 15 && daysUntil > 5;
      const shouldAlert5  = !alert.alert_day_19_sent  && daysUntil <= 5  && daysUntil > 1;
      const shouldAlert1  = !alert.alert_day_20_sent  && daysUntil <= 1;

      const alertField = shouldAlert1 ? 'alert_day_20_sent'
                       : shouldAlert5 ? 'alert_day_19_sent'
                       : shouldAlert15 ? 'alert_day_15_sent'
                       : null;

      if (!alertField) continue;

      const urgency  = shouldAlert1 ? '🚨 URGENT — 1 day left' : shouldAlert5 ? '⚠️ 5 days left' : '📅 15 days left';
      const subject  = `${urgency}: CA Prelim Notice Deadline — ${alert.project_name}`;
      const bodyText = `ARIA Cash Intelligence — California Lien Alert

Project: ${alert.project_name}
Preliminary Notice Deadline: ${isoDate(alert.preliminary_notice_due)} (${daysUntil} day${daysUntil !== 1 ? 's' : ''} away)
Mechanics Lien Deadline:     ${isoDate(alert.mechanics_lien_deadline)}
Stop Payment Deadline:       ${isoDate(alert.stop_payment_deadline)}

Action required: File California Preliminary Notice (Cal. Civ. Code §8204) before the deadline to preserve mechanics lien rights.

Project dashboard: ${BASE_URL}/app.html`;

      // Send to GC's email
      const sent = await sendEmail(alert.gc_email, subject, bodyText);

      if (sent) {
        await pool.query(
          `UPDATE aria_lien_alerts SET ${alertField} = true, updated_at = NOW() WHERE id = $1`,
          [alert.id]
        );
        stats.alerted++;
        console.log(`[aria-daily] Lien alert sent for project ${alert.project_id} → ${alert.gc_email} (${daysUntil}d left)`);
      }
    } catch (e) {
      stats.errors++;
      console.error(`[aria-daily] Lien alert error for project ${alert.project_id}:`, e.message);
    }
  }

  return stats;
}

// ── Step 2: CO Leakage Detection ─────────────────────────────────────────────
// Find approved change orders across all active projects where amount billed
// is less than the approved amount. Log summary for daily email.

async function runCOLeakageDetection() {
  const stats = { projects_scanned: 0, leakage_found: 0, total_at_risk: 0 };

  let rows;
  try {
    const result = await pool.query(`
      SELECT
        co.id,
        co.project_id,
        co.amount,
        co.description,
        COALESCE(
          (SELECT SUM(pal.amount)
           FROM pay_app_lines pal
           WHERE pal.change_order_id = co.id), 0
        ) AS amount_billed,
        p.name      AS project_name,
        u.email     AS gc_email,
        u.id        AS user_id
      FROM change_orders co
      JOIN projects p ON p.id = co.project_id
      JOIN users u    ON u.id = p.user_id
      WHERE co.approved = true
        AND p.status = 'active'
      ORDER BY co.project_id, co.id
    `);
    rows = result.rows;
  } catch (e) {
    console.warn('[aria-daily] change_orders table not ready — skipping CO leakage step:', e.message);
    return stats;
  }

  const projectIds = [...new Set(rows.map(r => r.project_id))];
  stats.projects_scanned = projectIds.length;

  for (const row of rows) {
    const atRisk = parseFloat(row.amount) - parseFloat(row.amount_billed);
    if (atRisk > 0.01) {
      stats.leakage_found++;
      stats.total_at_risk += atRisk;
    }
  }

  if (stats.leakage_found > 0) {
    console.log(`[aria-daily] CO leakage: ${stats.leakage_found} COs with ${fmt(stats.total_at_risk)} at risk across ${stats.projects_scanned} projects`);
  }

  return stats;
}

// ── Step 3: Follow-Up Emails for Overdue Invoices ────────────────────────────
// Send collection follow-up emails at the right cadence:
//  - 1-7 days overdue: gentle tone
//  - 8-14 days overdue: firm tone
//  - 15+ days overdue: final tone
// Respects the log — won't re-send if already sent today.

async function runFollowUpEmails() {
  const stats = { evaluated: 0, sent: 0, skipped: 0, errors: 0 };

  // Fetch all overdue, unpaid pay apps that aren't bad debt
  let payApps;
  try {
    const result = await pool.query(`
      SELECT
        pa.id,
        pa.app_number,
        pa.amount_due,
        pa.payment_due_date,
        pa.submitted_at,
        EXTRACT(DAY FROM NOW() - pa.payment_due_date)::INT AS days_overdue,
        p.name      AS project_name,
        p.owner_email,
        p.owner     AS owner_name,
        p.user_id,
        u.email     AS gc_email,
        COALESCE(cs.company_name, u.name) AS gc_company
      FROM pay_apps pa
      JOIN projects p      ON p.id = pa.project_id
      JOIN users u         ON u.id = p.user_id
      LEFT JOIN company_settings cs ON cs.user_id = u.id
      WHERE pa.payment_status = 'unpaid'
        AND pa.bad_debt = false
        AND pa.payment_due_date IS NOT NULL
        AND NOW() > pa.payment_due_date
        AND pa.amount_due > 0
      ORDER BY pa.payment_due_date ASC
    `);
    payApps = result.rows;
  } catch (e) {
    console.error('[aria-daily] Follow-up query failed:', e.message);
    return stats;
  }

  stats.evaluated = payApps.length;

  for (const pa of payApps) {
    try {
      const daysOverdue = pa.days_overdue || 0;

      // Determine tone thresholds
      let tone, minDaysSinceLast;
      if (daysOverdue >= 15) {
        tone = 'final';
        minDaysSinceLast = 7; // re-send final every 7 days max
      } else if (daysOverdue >= 8) {
        tone = 'firm';
        minDaysSinceLast = 5; // re-send firm every 5 days max
      } else {
        tone = 'gentle';
        minDaysSinceLast = 3; // re-send gentle every 3 days max
      }

      // Check if already sent recently
      let recentLog;
      try {
        const logResult = await pool.query(`
          SELECT created_at FROM aria_follow_up_log
          WHERE pay_app_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `, [pa.id]);
        recentLog = logResult.rows[0];
      } catch (e) {
        // aria_follow_up_log may not exist — allow send
        recentLog = null;
      }

      if (recentLog) {
        const daysSinceLast = Math.floor((Date.now() - new Date(recentLog.created_at).getTime()) / 86400000);
        if (daysSinceLast < minDaysSinceLast) {
          stats.skipped++;
          continue;
        }
      }

      // Only send if owner email exists
      if (!pa.owner_email) {
        stats.skipped++;
        continue;
      }

      // Compose email based on tone
      const amtFmt = fmt(pa.amount_due);
      let subject, bodyText;

      if (tone === 'final') {
        subject = `FINAL NOTICE: Payment Required — ${pa.project_name} Invoice #${pa.app_number}`;
        bodyText = `Dear ${pa.owner_name || 'Project Owner'},

This is a final notice regarding outstanding payment for ${pa.project_name}.

Invoice #${pa.app_number}
Amount Due:  ${amtFmt}
Due Date:    ${isoDate(pa.payment_due_date)}
Days Overdue: ${daysOverdue}

Immediate payment is required. Please contact us today to arrange payment or discuss a resolution.

${pa.gc_company}
${pa.gc_email}`;
      } else if (tone === 'firm') {
        subject = `Payment Reminder — ${pa.project_name} Invoice #${pa.app_number} (${daysOverdue} days past due)`;
        bodyText = `Dear ${pa.owner_name || 'Project Owner'},

We are following up on payment for ${pa.project_name}.

Invoice #${pa.app_number}
Amount Due:  ${amtFmt}
Due Date:    ${isoDate(pa.payment_due_date)}
Days Past Due: ${daysOverdue}

Please arrange payment at your earliest convenience. If payment has already been sent, please disregard this notice.

Thank you,
${pa.gc_company}
${pa.gc_email}`;
      } else {
        subject = `Follow-Up: Invoice #${pa.app_number} for ${pa.project_name}`;
        bodyText = `Dear ${pa.owner_name || 'Project Owner'},

We're following up on the invoice for ${pa.project_name}.

Invoice #${pa.app_number}
Amount Due: ${amtFmt}
Due Date:   ${isoDate(pa.payment_due_date)}

If you have any questions about this invoice, please don't hesitate to reach out.

Thank you,
${pa.gc_company}
${pa.gc_email}`;
      }

      const sent = await sendEmail(pa.owner_email, subject, bodyText);

      if (sent) {
        // Log the follow-up
        try {
          await pool.query(`
            INSERT INTO aria_follow_up_log (pay_app_id, tone, days_overdue, email_sent_at, created_at)
            VALUES ($1, $2, $3, NOW(), NOW())
          `, [pa.id, tone, daysOverdue]);
        } catch (logErr) {
          // aria_follow_up_log table may not exist — non-fatal
          console.warn('[aria-daily] Could not log follow-up:', logErr.message);
        }
        stats.sent++;
        console.log(`[aria-daily] Follow-up sent (${tone}) → ${pa.owner_email} for pay app ${pa.id} (${daysOverdue}d overdue)`);
      }
    } catch (e) {
      stats.errors++;
      console.error(`[aria-daily] Follow-up error for pay app ${pa.id}:`, e.message);
    }
  }

  return stats;
}

// ── Step 4: Trust Score Updates ───────────────────────────────────────────────
// Refresh vendor trust scores based on recent payment behavior.
// For each trade in active projects, recalculate based on:
//  - Payment speed (on-time vs late vs very-late)
//  - Recent approval/rejection history
// This is a lightweight re-score (not a full rebuild) — just applies recent events.

async function runTrustScoreUpdates() {
  const stats = { updated: 0, errors: 0 };

  // Find trades with recent payment activity (last 24 hours)
  let recentPayments;
  try {
    const result = await pool.query(`
      SELECT
        pa.id           AS pay_app_id,
        pa.project_id,
        pa.payment_due_date,
        pa.payment_status,
        pa.amount_paid,
        EXTRACT(DAY FROM NOW() - pa.payment_due_date)::INT AS days_late,
        vts.id          AS trust_score_id,
        vts.score       AS current_score
      FROM pay_apps pa
      JOIN projects p         ON p.id = pa.project_id
      JOIN vendor_trust_scores vts ON vts.project_id = pa.project_id
      WHERE pa.payment_status = 'succeeded'
        AND pa.updated_at >= NOW() - INTERVAL '24 hours'
      ORDER BY pa.project_id
    `);
    recentPayments = result.rows;
  } catch (e) {
    console.warn('[aria-daily] Trust score update query failed:', e.message);
    return stats;
  }

  const MAX_SCORE = 763;

  for (const payment of recentPayments) {
    try {
      const daysLate = payment.days_late || 0;

      // Score delta: on-time = +10, 1-7 days late = +2, 8-14 days late = -5, 15+ days late = -15
      let delta = 0;
      if (daysLate <= 0) delta = 10;
      else if (daysLate <= 7) delta = 2;
      else if (daysLate <= 14) delta = -5;
      else delta = -15;

      const newScore = Math.max(0, Math.min(MAX_SCORE, payment.current_score + delta));

      // Determine new tier
      let tier;
      if      (newScore >= 573) tier = 'platinum';
      else if (newScore >= 382) tier = 'gold';
      else if (newScore >= 153) tier = 'silver';
      else if (newScore >= 1)   tier = 'bronze';
      else                      tier = 'review';

      await pool.query(`
        UPDATE vendor_trust_scores
        SET score = $1, tier = $2, last_updated_at = NOW()
        WHERE id = $3
      `, [newScore, tier, payment.trust_score_id]);

      stats.updated++;
    } catch (e) {
      stats.errors++;
      console.error(`[aria-daily] Trust score update error for trust_id ${payment.trust_score_id}:`, e.message);
    }
  }

  if (stats.updated > 0) {
    console.log(`[aria-daily] Trust scores updated: ${stats.updated} records`);
  }

  return stats;
}

// ── Step 5: Rebuild Cash Flow Forecasts ───────────────────────────────────────
// For every active GC, calculate their 30-day incoming cash projection
// from submitted, unpaid pay apps and upsert into cash_flow_forecasts table.
// Runs daily so forecasts are always fresh for the dashboard.

async function runCashFlowForecasts() {
  const stats = { users_processed: 0, errors: 0 };

  // Get all active GCs (users with at least one active project)
  let users;
  try {
    const result = await pool.query(`
      SELECT DISTINCT u.id, u.email
      FROM users u
      JOIN projects p ON p.user_id = u.id
      WHERE p.status = 'active'
    `);
    users = result.rows;
  } catch (e) {
    console.error('[aria-daily] Cash flow forecast user query failed:', e.message);
    return stats;
  }

  for (const user of users) {
    try {
      // Fetch all upcoming unpaid pay apps for this user
      const paResult = await pool.query(`
        SELECT
          pa.payment_due_date,
          COALESCE(pa.amount_due, 0) AS amount_due
        FROM pay_apps pa
        JOIN projects p ON pa.project_id = p.id
        WHERE p.user_id = $1
          AND pa.payment_status = 'unpaid'
          AND pa.bad_debt = false
          AND pa.payment_due_date IS NOT NULL
          AND pa.payment_due_date >= CURRENT_DATE
          AND pa.payment_due_date <= CURRENT_DATE + INTERVAL '30 days'
      `, [user.id]);

      // Build 30-day daily map
      const forecastMap = {};
      const today = new Date();
      for (let i = 0; i < 30; i++) {
        const d = addDays(today, i);
        const key = isoDate(d);
        forecastMap[key] = { date: key, projected_inflow: 0, projected_outflow: 0, net: 0 };
      }

      // Populate inflows
      paResult.rows.forEach(pa => {
        const key = isoDate(pa.payment_due_date);
        if (forecastMap[key]) {
          forecastMap[key].projected_inflow += parseFloat(pa.amount_due);
        }
      });

      // Calculate net per day
      Object.values(forecastMap).forEach(day => {
        day.net = day.projected_inflow - day.projected_outflow;
      });

      const forecast = Object.values(forecastMap).sort((a, b) => a.date.localeCompare(b.date));

      // Upsert into cache table
      try {
        await pool.query(`
          INSERT INTO cash_flow_forecasts (user_id, forecast_date, forecast_data, created_at, updated_at)
          VALUES ($1, CURRENT_DATE, $2, NOW(), NOW())
          ON CONFLICT (user_id, forecast_date)
          DO UPDATE SET forecast_data = $2, updated_at = NOW()
        `, [user.id, JSON.stringify(forecast)]);
      } catch (cacheErr) {
        // Table may not exist — non-fatal, continue
      }

      stats.users_processed++;
    } catch (e) {
      stats.errors++;
      console.error(`[aria-daily] Cash flow forecast error for user ${user.id}:`, e.message);
    }
  }

  if (stats.users_processed > 0) {
    console.log(`[aria-daily] Cash flow forecasts rebuilt for ${stats.users_processed} GCs`);
  }

  return stats;
}

// ── Step 6: Send daily ARIA summary to admin ─────────────────────────────────

async function sendDailySummary(results) {
  const { lien, co, followUp, trust, forecast } = results;
  const ts = new Date().toISOString();

  const lines = [
    `ARIA Daily Intelligence Report`,
    `Generated: ${ts}`,
    `Environment: ${BASE_URL}`,
    ``,
    `── LIEN ALERTS ─────────────────────────────────────`,
    `  Projects checked:   ${lien.checked}`,
    `  Alerts sent:        ${lien.alerted}`,
    `  Errors:             ${lien.errors}`,
    ``,
    `── CHANGE ORDER LEAKAGE ──────────────────────────────`,
    `  Projects scanned:   ${co.projects_scanned}`,
    `  Leaking COs found:  ${co.leakage_found}`,
    `  Total at risk:      ${fmt(co.total_at_risk)}`,
    ``,
    `── FOLLOW-UP EMAILS ─────────────────────────────────`,
    `  Overdue invoices:   ${followUp.evaluated}`,
    `  Emails sent:        ${followUp.sent}`,
    `  Skipped (cadence):  ${followUp.skipped}`,
    `  Errors:             ${followUp.errors}`,
    ``,
    `── TRUST SCORE UPDATES ──────────────────────────────`,
    `  Scores updated:     ${trust.updated}`,
    `  Errors:             ${trust.errors}`,
    ``,
    `── CASH FLOW FORECASTS ──────────────────────────────`,
    `  GCs processed:      ${forecast.users_processed}`,
    `  Errors:             ${forecast.errors}`,
    ``,
    `── END OF REPORT ────────────────────────────────────`,
    `Admin dashboard: ${BASE_URL}/app.html`,
  ];

  const bodyText = lines.join('\n');
  const bodyHtml = `<pre style="font-family:monospace;font-size:13px;line-height:1.6">${bodyText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;

  const hasActivity = lien.alerted > 0 || followUp.sent > 0 || co.leakage_found > 0;
  const subject = hasActivity
    ? `📊 ARIA Daily — ${followUp.sent} follow-ups sent, ${fmt(co.total_at_risk)} CO at risk`
    : `✅ ARIA Daily — ${new Date().toLocaleDateString('en-US')} All clear`;

  console.log('\n' + bodyText);

  await sendEmail(ALERT_EMAIL, subject, bodyText, bodyHtml);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('[aria-daily] Starting ARIA daily intelligence job…', new Date().toISOString());

  const [lien, co, followUp, trust, forecast] = await Promise.allSettled([
    runLienAlerts(),
    runCOLeakageDetection(),
    runFollowUpEmails(),
    runTrustScoreUpdates(),
    runCashFlowForecasts(),
  ]).then(results =>
    results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      const names = ['lienAlerts', 'coLeakage', 'followUpEmails', 'trustScores', 'cashFlowForecasts'];
      console.error(`[aria-daily] ${names[i]} step failed:`, r.reason?.message || r.reason);
      return { checked: 0, alerted: 0, projects_scanned: 0, leakage_found: 0, total_at_risk: 0,
               evaluated: 0, sent: 0, skipped: 0, updated: 0, users_processed: 0, errors: 1 };
    })
  );

  await sendDailySummary({ lien, co, followUp, trust, forecast });

  return {
    lien_alerts_sent: lien.alerted,
    follow_ups_sent: followUp.sent,
    co_at_risk: co.total_at_risk,
    trust_updates: trust.updated,
    forecasts_built: forecast.users_processed,
  };
}

// ── Entry point ───────────────────────────────────────────────────────────────

run()
  .then((summary) => {
    console.log('[aria-daily] Done:', JSON.stringify(summary));
    process.exit(0);
  })
  .catch((err) => {
    console.error('[aria-daily] Fatal error:', err);
    process.exit(1);
  });
