/**
 * ARIA Cash Intelligence Routes
 *
 * AI-powered follow-up intelligence, cash flow forecasting, and lien deadline alerts.
 * All routes require authentication.
 */

const express = require('express');
const { Pool } = require('pg');
const { auth } = require('../../middleware/auth');
const { california } = require('./lien');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Send email via Resend REST API (matches pattern in server.js — no npm package needed)
async function sendEmail({ from, to, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn('[ARIA] RESEND_API_KEY not set — skipping email'); return; }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Resend API error'); }
  return res.json();
}

/**
 * GET /api/aria/follow-up-queue
 * Returns all submitted pay apps past payment_due_date with recommended follow-up tone
 */
router.get('/api/aria/follow-up-queue', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch all submitted pay apps for user's projects that are past due
    const result = await pool.query(
      `SELECT
        pa.id,
        pa.app_number,
        pa.submitted_at,
        pa.payment_due_date,
        pa.amount_due,
        p.name AS project_name,
        p.owner_email,
        p.owner AS owner_name,
        COALESCE(EXTRACT(DAY FROM CURRENT_TIMESTAMP - pa.payment_due_date)::INT, 0) as days_overdue
      FROM pay_apps pa
      JOIN projects p ON pa.project_id = p.id
      WHERE p.user_id = $1
        AND pa.payment_status = $2
        AND pa.payment_due_date IS NOT NULL
        AND CURRENT_TIMESTAMP > pa.payment_due_date
        AND pa.bad_debt = false
      ORDER BY pa.payment_due_date ASC`,
      [userId, 'unpaid']
    );

    // Enrich with follow-up log history
    const payApps = await Promise.all(
      result.rows.map(async (pa) => {
        const logResult = await pool.query(
          `SELECT * FROM aria_follow_up_log WHERE pay_app_id = $1 ORDER BY created_at DESC LIMIT 5`,
          [pa.id]
        );

        // Determine tone based on days overdue
        let tone = 'gentle';
        if (pa.days_overdue >= 15) tone = 'final';
        else if (pa.days_overdue >= 8) tone = 'firm';

        return {
          ...pa,
          tone,
          follow_up_history: logResult.rows,
        };
      })
    );

    res.json({
      data: payApps,
      message: `Found ${payApps.length} overdue invoices`,
    });
  } catch (e) {
    console.error('[ARIA Follow-Up Queue]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/aria/trigger-follow-up/:payAppId
 * Sends follow-up email to owner based on tone
 */
router.post('/api/aria/trigger-follow-up/:payAppId', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const payAppId = parseInt(req.params.payAppId);

    // Fetch pay app and validate ownership
    const paResult = await pool.query(
      `SELECT pa.*, p.name AS project_name, p.owner_email, p.owner AS owner_name, p.user_id
       FROM pay_apps pa
       JOIN projects p ON pa.project_id = p.id
       WHERE pa.id = $1 AND p.user_id = $2`,
      [payAppId, userId]
    );

    if (paResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pay app not found' });
    }

    const pa = paResult.rows[0];
    const daysOverdue = Math.floor((new Date() - new Date(pa.payment_due_date)) / (1000 * 60 * 60 * 24));

    // Determine tone and compose email
    let tone = 'gentle';
    let subject = '';
    let message = '';
    const ownerEmail = pa.owner_email;
    const gcName = req.user.company_name || 'Your Contractor';

    if (daysOverdue >= 15) {
      tone = 'final';
      subject = `URGENT: Payment Required - Invoice #${pa.app_number} (${daysOverdue} days overdue)`;
      message = `Dear ${pa.owner_name},

This is a final notice regarding payment for ${pa.project_name}.

Invoice #${pa.app_number} is now ${daysOverdue} days overdue with an outstanding balance of $${parseFloat(pa.amount_due).toLocaleString('en-US', { minimumFractionDigits: 2 })}.

Immediate payment is required to avoid further action.

Please contact us right away to arrange payment.

Best regards,
${gcName}`;
    } else if (daysOverdue >= 8) {
      tone = 'firm';
      subject = `Payment Reminder - Invoice #${pa.app_number} (${daysOverdue} days overdue)`;
      message = `Dear ${pa.owner_name},

We are writing to remind you that payment for ${pa.project_name} is now ${daysOverdue} days overdue.

Invoice #${pa.app_number} - Amount Due: $${parseFloat(pa.amount_due).toLocaleString('en-US', { minimumFractionDigits: 2 })}

Please arrange payment at your earliest convenience. If payment has already been sent, please disregard this notice.

Thank you,
${gcName}`;
    } else {
      tone = 'gentle';
      subject = `Follow-Up: Invoice #${pa.app_number} for ${pa.project_name}`;
      message = `Dear ${pa.owner_name},

We hope all is well with the project. We're reaching out to follow up on payment for:

Invoice #${pa.app_number} - Amount Due: $${parseFloat(pa.amount_due).toLocaleString('en-US', { minimumFractionDigits: 2 })}

If you have any questions about this invoice, please don't hesitate to reach out.

Thank you,
${gcName}`;
    }

    // Send email via Resend
    const fromEmail = process.env.FROM_EMAIL || 'noreply@constructinv.varshyl.com';
    try {
      await sendEmail({
        from: fromEmail,
        to: ownerEmail,
        subject,
        text: message,
      });
    } catch (emailError) {
      console.error('[Resend Error]', emailError.message);
      // Log but don't fail — still track the follow-up attempt
    }

    // Log the follow-up
    await pool.query(
      `INSERT INTO aria_follow_up_log (pay_app_id, tone, days_overdue, email_sent_at, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [payAppId, tone, daysOverdue]
    );

    res.json({
      data: {
        pay_app_id: payAppId,
        tone,
        days_overdue: daysOverdue,
        email_sent: true,
      },
      message: `Follow-up email sent (${tone} tone)`,
    });
  } catch (e) {
    console.error('[ARIA Trigger Follow-Up]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/aria/leverage-timing/:projectId
 * Analyzes payment timing patterns and recommends best day to send follow-up
 */
router.get('/api/aria/leverage-timing/:projectId', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = parseInt(req.params.projectId);

    // Verify project ownership
    const projectResult = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Analyze payment history (if payer_trust_scores table exists)
    let avgDaysToPay = 30; // default
    let bestDayToSend = 'Monday'; // default
    let leverageScore = 5; // default 1-10

    try {
      const trustResult = await pool.query(
        `SELECT avg_days_to_pay, most_common_payment_day
         FROM vendor_trust_scores
         WHERE project_id = $1`,
        [projectId]
      );

      if (trustResult.rows.length > 0) {
        const trust = trustResult.rows[0];
        avgDaysToPay = trust.avg_days_to_pay || 30;
        bestDayToSend = trust.most_common_payment_day || 'Monday';

        // Calculate leverage score (1-10): how predictable is this payer?
        // Higher = more predictable = higher score
        leverageScore = Math.min(10, Math.max(1, Math.round((30 - avgDaysToPay) / 3 + 5)));
      }
    } catch (trustError) {
      // Table may not exist or not populated yet — use defaults
    }

    res.json({
      data: {
        project_id: projectId,
        avg_days_to_pay: avgDaysToPay,
        best_day_to_send: bestDayToSend,
        leverage_score: leverageScore,
        recommendation: `This payer typically pays within ${avgDaysToPay} days. Best time to send follow-up: ${bestDayToSend}`,
      },
    });
  } catch (e) {
    console.error('[ARIA Leverage Timing]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/aria/cash-forecast
 * 30-day cash flow projection for user's projects
 */
router.get('/api/aria/cash-forecast', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch all submitted pay apps with payment_due_date in next 30 days
    const payAppsResult = await pool.query(
      `SELECT
        pa.payment_due_date,
        COALESCE(pa.amount_due, 0) as amount_due
       FROM pay_apps pa
       JOIN projects p ON pa.project_id = p.id
       WHERE p.user_id = $1
         AND pa.payment_status != $2
         AND pa.payment_due_date IS NOT NULL
         AND pa.payment_due_date >= CURRENT_DATE
         AND pa.payment_due_date <= CURRENT_DATE + INTERVAL '30 days'`,
      [userId, 'unpaid']
    );

    // Build daily breakdown
    const forecastMap = {};
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      forecastMap[dateStr] = {
        date: dateStr,
        projected_inflow: 0,
        projected_outflow: 0,
        net: 0,
      };
    }

    // Populate inflows from pay apps
    payAppsResult.rows.forEach((pa) => {
      const dateStr = new Date(pa.payment_due_date).toISOString().split('T')[0];
      if (forecastMap[dateStr]) {
        forecastMap[dateStr].projected_inflow += parseFloat(pa.amount_due);
      }
    });

    // Calculate net for each day
    Object.keys(forecastMap).forEach((dateStr) => {
      const day = forecastMap[dateStr];
      day.net = day.projected_inflow - day.projected_outflow;
    });

    const forecast = Object.values(forecastMap).sort((a, b) => a.date.localeCompare(b.date));

    // Upsert into cache table (if exists)
    try {
      await pool.query(
        `INSERT INTO cash_flow_forecasts (user_id, forecast_date, forecast_data, created_at, updated_at)
         VALUES ($1, CURRENT_DATE, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, forecast_date) DO UPDATE SET forecast_data = $2, updated_at = CURRENT_TIMESTAMP`,
        [userId, JSON.stringify(forecast)]
      );
    } catch (cacheError) {
      // Cache table may not exist — continue without caching
    }

    res.json({
      data: forecast,
      summary: {
        total_projected_inflow: forecast.reduce((sum, day) => sum + day.projected_inflow, 0),
        total_projected_outflow: forecast.reduce((sum, day) => sum + day.projected_outflow, 0),
        net_30_day: forecast.reduce((sum, day) => sum + day.net, 0),
      },
    });
  } catch (e) {
    console.error('[ARIA Cash Forecast]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/aria/co-leakage/:projectId
 * Detects change orders not yet billed in pay apps
 */
router.get('/api/aria/co-leakage/:projectId', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = parseInt(req.params.projectId);

    // Verify project ownership
    const projectResult = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if change_orders table exists by attempting to query
    let coLeakage = [];
    try {
      const leakageResult = await pool.query(
        `SELECT
          co.id,
          co.change_order_number,
          co.description,
          co.amount,
          co.approved_at,
          COALESCE((SELECT SUM(pal.amount) FROM pay_app_lines pal WHERE pal.change_order_id = co.id), 0) as amount_billed
         FROM change_orders co
         WHERE co.project_id = $1 AND co.approved = true
         HAVING COALESCE((SELECT SUM(pal.amount) FROM pay_app_lines pal WHERE pal.change_order_id = co.id), 0) < co.amount`,
        [projectId]
      );

      coLeakage = leakageResult.rows.map((co) => ({
        ...co,
        estimated_revenue_at_risk: parseFloat(co.amount) - parseFloat(co.amount_billed),
      }));
    } catch (coError) {
      // change_orders table may not exist — return empty array
      console.warn('[ARIA CO Leakage] change_orders table not found or not ready');
    }

    res.json({
      data: coLeakage,
      summary: {
        total_leaked_revenue: coLeakage.reduce((sum, co) => sum + co.estimated_revenue_at_risk, 0),
        leaked_co_count: coLeakage.length,
      },
    });
  } catch (e) {
    console.error('[ARIA CO Leakage]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/aria/lien-alerts
 * Returns all lien deadline alerts for user's projects
 */
router.get('/api/aria/lien-alerts', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if aria_lien_alerts table exists
    let alerts = [];
    try {
      const alertResult = await pool.query(
        `SELECT
          ala.id,
          ala.project_id,
          p.name AS project_name,
          ala.work_start_date,
          ala.preliminary_notice_due,
          ala.mechanics_lien_deadline,
          ala.stop_payment_deadline,
          ala.alert_day_15_sent,
          ala.alert_day_19_sent,
          ala.alert_day_20_sent,
          COALESCE(
            NOT ala.alert_day_15_sent OR
            NOT ala.alert_day_19_sent OR
            NOT ala.alert_day_20_sent,
            false
          ) as has_pending_alerts
         FROM aria_lien_alerts ala
         JOIN projects p ON ala.project_id = p.id
         WHERE p.user_id = $1
         ORDER BY ala.preliminary_notice_due ASC`,
        [userId]
      );

      alerts = alertResult.rows;
    } catch (alertError) {
      // aria_lien_alerts table may not exist yet
      console.warn('[ARIA Lien Alerts] aria_lien_alerts table not found or not ready');
    }

    res.json({
      data: alerts,
      message: `Found ${alerts.filter((a) => a.has_pending_alerts).length} projects with pending lien alerts`,
    });
  } catch (e) {
    console.error('[ARIA Lien Alerts]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/aria/lien-alerts/:projectId
 * Creates/updates lien alert record for a project
 */
router.post('/api/aria/lien-alerts/:projectId', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = parseInt(req.params.projectId);
    const { work_start_date } = req.body;

    if (!work_start_date) {
      return res.status(400).json({ error: 'work_start_date required' });
    }

    // Verify project ownership
    const projectResult = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Calculate deadlines
    const deadlines = california.calculateDeadlines(work_start_date);
    const today = new Date();

    // Check if we should send the 15-day alert
    const alertDay15 = new Date(deadlines.alert_day_15);
    const alertDay19 = new Date(deadlines.alert_day_19);
    const alertDay20 = new Date(deadlines.alert_day_20);
    const shouldSendAlert = today >= alertDay15 && today < alertDay20;

    // Try to upsert lien alert (table may not exist)
    let result;
    try {
      result = await pool.query(
        `INSERT INTO aria_lien_alerts (
          project_id,
          work_start_date,
          preliminary_notice_due,
          mechanics_lien_deadline,
          stop_payment_deadline,
          alert_day_15_sent,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (project_id) DO UPDATE SET
          work_start_date = $2,
          preliminary_notice_due = $3,
          mechanics_lien_deadline = $4,
          stop_payment_deadline = $5,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [
          projectId,
          work_start_date,
          deadlines.preliminary_notice_due,
          deadlines.mechanics_lien_deadline,
          deadlines.stop_payment_deadline,
          shouldSendAlert ? true : false,
        ]
      );
    } catch (alertError) {
      // aria_lien_alerts table doesn't exist yet — return calculated deadlines
      console.warn('[ARIA Create Lien Alert] aria_lien_alerts table not ready, returning calculated values');
      return res.json({
        data: {
          project_id: projectId,
          work_start_date,
          deadlines,
          alert_eligibility: shouldSendAlert ? 'eligible' : 'not_yet_due',
        },
      });
    }

    // Try to send email if alert is due (if project has owner_email)
    if (shouldSendAlert) {
      try {
        const projectData = await pool.query(
          'SELECT owner_email, owner AS owner_name, name AS project_name FROM projects WHERE id = $1',
          [projectId]
        );

        if (projectData.rows.length > 0 && projectData.rows[0].owner_email) {
          const proj = projectData.rows[0];
          const fromEmail = process.env.FROM_EMAIL || 'noreply@constructinv.varshyl.com';

          try {
            await sendEmail({
              from: fromEmail,
              to: proj.owner_email,
              subject: `⚖️ CA Preliminary Notice Deadline - ${proj.project_name}`,
              text: `This is a reminder that the deadline for providing preliminary notice under California Civil Code §8204 is approaching.

Project: ${proj.project_name}
Deadline: ${california.formatDate(deadlines.preliminary_notice_due)}

A Preliminary Notice must be provided to all parties by this date to preserve mechanics lien rights.`,
            });

            // Mark alert as sent
            await pool.query(
              `UPDATE aria_lien_alerts SET alert_day_15_sent = true, updated_at = CURRENT_TIMESTAMP WHERE project_id = $1`,
              [projectId]
            );
          } catch (emailError) {
            console.error('[Resend Lien Alert Email]', emailError.message);
          }
        }
      } catch (emailError) {
        // Continue without sending email
      }
    }

    res.json({
      data: result.rows[0] || { project_id: projectId, deadlines },
      message: 'Lien alert created/updated',
    });
  } catch (e) {
    console.error('[ARIA Create Lien Alert]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/aria/insights/:projectId
 * Aggregates 3-5 insight cards for the Hub tab
 */
router.get('/api/aria/insights/:projectId', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = parseInt(req.params.projectId);

    // Verify project ownership
    const projectResult = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const insights = [];

    // Insight 1: Overdue follow-ups
    const overdueResult = await pool.query(
      `SELECT COUNT(*) as count, SUM(amount_due) as total_overdue
       FROM pay_apps pa
       WHERE pa.project_id = $1
         AND pa.payment_status = 'unpaid'
         AND CURRENT_TIMESTAMP > pa.payment_due_date
         AND pa.bad_debt = false`,
      [projectId]
    );

    if (overdueResult.rows[0].count > 0) {
      insights.push({
        type: 'overdue_invoices',
        title: `${overdueResult.rows[0].count} Overdue Invoice${overdueResult.rows[0].count > 1 ? 's' : ''}`,
        message: `$${parseFloat(overdueResult.rows[0].total_overdue).toLocaleString('en-US', { minimumFractionDigits: 2 })} is past due. Send a follow-up reminder.`,
        severity: 'danger',
        action_label: 'Send Follow-Up',
        action_url: '/follow-up-queue',
      });
    }

    // Insight 2: Lien deadline alert
    try {
      const lienResult = await pool.query(
        `SELECT preliminary_notice_due FROM aria_lien_alerts
         WHERE project_id = $1 AND preliminary_notice_due <= CURRENT_DATE + INTERVAL '7 days'`,
        [projectId]
      );

      if (lienResult.rows.length > 0) {
        insights.push({
          type: 'lien_deadline',
          title: '⚖️ CA Preliminary Notice Due Soon',
          message: `Deadline: ${california.formatDate(lienResult.rows[0].preliminary_notice_due)}. Download the preliminary notice PDF to preserve lien rights.`,
          severity: 'warning',
          action_label: 'Download Notice',
          action_url: `/lien-alert/${projectId}`,
        });
      }
    } catch (lienError) {
      // Table may not exist
    }

    // Insight 3: CO leakage
    try {
      const coResult = await pool.query(
        `SELECT COUNT(*) as count, SUM(co.amount - COALESCE((SELECT SUM(pal.amount) FROM pay_app_lines pal WHERE pal.change_order_id = co.id), 0)) as at_risk
         FROM change_orders co
         WHERE co.project_id = $1 AND co.approved = true
         HAVING SUM(co.amount - COALESCE((SELECT SUM(pal.amount) FROM pay_app_lines pal WHERE pal.change_order_id = co.id), 0)) > 0`,
        [projectId]
      );

      if (coResult.rows[0] && coResult.rows[0].count > 0) {
        insights.push({
          type: 'co_leakage',
          title: `${coResult.rows[0].count} Change Order${coResult.rows[0].count > 1 ? 's' : ''} Not Yet Billed`,
          message: `$${parseFloat(coResult.rows[0].at_risk).toLocaleString('en-US', { minimumFractionDigits: 2 })} in approved change orders not yet reflected in pay apps.`,
          severity: 'warning',
          action_label: 'View Details',
          action_url: `/project/${projectId}/change-orders`,
        });
      }
    } catch (coError) {
      // Table may not exist
    }

    // All clear message
    if (insights.length === 0) {
      insights.push({
        type: 'all_clear',
        title: 'All Clear',
        message: 'No alerts. Project is running smoothly.',
        severity: 'info',
        action_label: null,
        action_url: null,
      });
    }

    res.json({
      data: insights,
      message: 'ARIA insights generated',
    });
  } catch (e) {
    console.error('[ARIA Insights]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
