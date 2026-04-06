/**
 * Collection Intelligence Routes — Module 9
 * Cash flow tracking, outstanding invoices, payer patterns, follow-up scheduling
 *
 * Features:
 * - GET /api/collection/outstanding — all unpaid/partial pay apps with urgency
 * - GET /api/collection/overdue — overdue items with aging buckets
 * - GET /api/collection/forecast — 30-day cash flow projection
 * - GET /api/collection/payer-patterns — analyze each payer's payment history
 * - POST /api/collection/followup/schedule — schedule a follow-up
 * - GET /api/collection/followup-history — follow-up log
 */

const express = require('express');
const { pool } = require('../../db');

const router = express.Router();

/**
 * GET /api/collection/outstanding
 * Returns all unpaid/partial pay apps across all user's projects
 * Includes urgency categorization and days overdue
 */
router.get('/outstanding', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await pool.query(`
      SELECT
        pa.id,
        pa.app_number as pay_app_number,
        pa.amount_due,
        pa.amount_paid,
        pa.payment_due_date,
        pa.payment_status,
        pa.payment_received,
        pa.bad_debt,
        pa.payment_link_token,
        p.name as project_name,
        p.id as project_id,
        p.owner_name,
        p.owner_email,
        CASE
          WHEN pa.payment_due_date < NOW() THEN
            EXTRACT(DAY FROM NOW() - pa.payment_due_date)::INTEGER
          ELSE 0
        END as days_overdue,
        CASE
          WHEN pa.payment_due_date < NOW() THEN 'overdue'
          WHEN pa.payment_due_date <= NOW() + INTERVAL '7 days' THEN 'due_soon'
          ELSE 'current'
        END as urgency
      FROM pay_apps pa
      JOIN projects p ON pa.project_id = p.id
      WHERE p.user_id = $1
        AND pa.submitted_at IS NOT NULL
        AND (pa.payment_status IS NULL OR pa.payment_status NOT IN ('paid'))
        AND (pa.bad_debt IS NULL OR pa.bad_debt = FALSE)
      ORDER BY
        CASE WHEN pa.payment_due_date < NOW() THEN 0 ELSE 1 END,
        days_overdue DESC,
        pa.payment_due_date ASC
    `, [req.user.id]);

    const payApps = result.rows;

    // Calculate summary
    const summary = {
      total_outstanding: payApps.reduce((sum, pa) => sum + (parseFloat(pa.amount_due) || 0), 0),
      total_overdue_count: payApps.filter(pa => pa.urgency === 'overdue').length,
      total_due_soon_count: payApps.filter(pa => pa.urgency === 'due_soon').length,
      oldest_overdue_days: payApps.filter(pa => pa.urgency === 'overdue').length > 0
        ? Math.max(...payApps.filter(pa => pa.urgency === 'overdue').map(pa => pa.days_overdue))
        : 0
    };

    res.json({
      ok: true,
      data: payApps,
      summary
    });
  } catch (e) {
    console.error('[Collection API] /outstanding error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/collection/overdue
 * Returns only overdue items with aging bucket categorization
 * Buckets: 1-14d (Early), 15-30d (Late), 31-60d (Seriously Late), 60+d (Critical)
 */
router.get('/overdue', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await pool.query(`
      SELECT
        pa.id,
        pa.app_number,
        pa.amount_due,
        pa.amount_paid,
        pa.payment_due_date,
        pa.payment_status,
        pa.payment_received,
        pa.bad_debt,
        p.name as project_name,
        p.owner_name,
        p.owner_email,
        EXTRACT(DAY FROM NOW() - pa.payment_due_date)::INTEGER as days_overdue,
        CASE
          WHEN EXTRACT(DAY FROM NOW() - pa.payment_due_date) <= 14 THEN 'early_overdue'
          WHEN EXTRACT(DAY FROM NOW() - pa.payment_due_date) <= 30 THEN 'late'
          WHEN EXTRACT(DAY FROM NOW() - pa.payment_due_date) <= 60 THEN 'seriously_late'
          ELSE 'critical'
        END as aging_bucket,
        CASE
          WHEN EXTRACT(DAY FROM NOW() - pa.payment_due_date) <= 14 THEN '#FCD34D'
          WHEN EXTRACT(DAY FROM NOW() - pa.payment_due_date) <= 30 THEN '#FB923C'
          WHEN EXTRACT(DAY FROM NOW() - pa.payment_due_date) <= 60 THEN '#EF4444'
          ELSE '#7F1D1D'
        END as bucket_color
      FROM pay_apps pa
      JOIN projects p ON pa.project_id = p.id
      WHERE p.user_id = $1
        AND pa.submitted_at IS NOT NULL
        AND pa.payment_due_date < NOW()
        AND (pa.payment_status IS NULL OR pa.payment_status NOT IN ('paid'))
        AND (pa.bad_debt IS NULL OR pa.bad_debt = FALSE)
      ORDER BY days_overdue DESC
    `, [req.user.id]);

    const overdue = result.rows;

    // Group by aging bucket
    const byBucket = {
      early_overdue: [],
      late: [],
      seriously_late: [],
      critical: []
    };

    overdue.forEach(item => {
      byBucket[item.aging_bucket].push(item);
    });

    res.json({
      ok: true,
      data: overdue,
      by_bucket: byBucket,
      summary: {
        total_count: overdue.length,
        total_amount: overdue.reduce((sum, item) => sum + (parseFloat(item.amount_due) || 0), 0),
        earliest_overdue_days: overdue.length > 0 ? overdue[0].days_overdue : 0
      }
    });
  } catch (e) {
    console.error('[Collection API] /overdue error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/collection/forecast
 * 30-day cash flow projection based on submitted pay apps
 */
router.get('/forecast', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Daily forecast for next 30 days
    const result = await pool.query(`
      SELECT
        DATE(pa.payment_due_date) as due_date,
        SUM(pa.amount_due - COALESCE(pa.amount_paid, 0)) as expected_incoming,
        COUNT(*) as invoice_count,
        ARRAY_AGG(DISTINCT p.name) as projects
      FROM pay_apps pa
      JOIN projects p ON pa.project_id = p.id
      WHERE p.user_id = $1
        AND pa.submitted_at IS NOT NULL
        AND pa.payment_due_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
        AND (pa.payment_status IS NULL OR pa.payment_status NOT IN ('paid'))
        AND (pa.bad_debt IS NULL OR pa.bad_debt = FALSE)
      GROUP BY DATE(pa.payment_due_date)
      ORDER BY due_date ASC
    `, [req.user.id]);

    const dailyForecast = result.rows;

    // Get total outstanding
    const totalOutstandingResult = await pool.query(`
      SELECT
        COALESCE(SUM(pa.amount_due - COALESCE(pa.amount_paid, 0)), 0) as total
      FROM pay_apps pa
      JOIN projects p ON pa.project_id = p.id
      WHERE p.user_id = $1
        AND pa.submitted_at IS NOT NULL
        AND (pa.payment_status IS NULL OR pa.payment_status NOT IN ('paid'))
        AND (pa.bad_debt IS NULL OR pa.bad_debt = FALSE)
    `, [req.user.id]);

    const totalOutstanding = parseFloat(
      totalOutstandingResult.rows[0].total || 0
    );

    // Get already overdue amount
    const overdueResult = await pool.query(`
      SELECT
        COALESCE(SUM(pa.amount_due - COALESCE(pa.amount_paid, 0)), 0) as total
      FROM pay_apps pa
      JOIN projects p ON pa.project_id = p.id
      WHERE p.user_id = $1
        AND pa.submitted_at IS NOT NULL
        AND pa.payment_due_date < NOW()
        AND (pa.payment_status IS NULL OR pa.payment_status NOT IN ('paid'))
        AND (pa.bad_debt IS NULL OR pa.bad_debt = FALSE)
    `, [req.user.id]);

    const alreadyOverdue = parseFloat(overdueResult.rows[0].total || 0);

    // Calculate cumulative forecast
    let cumulativeExpected = 0;
    const cumulativeForecast = dailyForecast.map(day => {
      cumulativeExpected += parseFloat(day.expected_incoming) || 0;
      return {
        ...day,
        cumulative_expected: cumulativeExpected
      };
    });

    // Risk flags
    const riskFlags = [];
    if (alreadyOverdue > 0) {
      riskFlags.push(`${alreadyOverdue.toFixed(2)} overdue now — contact owners immediately`);
    }
    if (totalOutstanding > 50000) {
      riskFlags.push('Outstanding balance exceeds $50K — significant cash flow risk');
    }
    if (cumulativeForecast.length === 0) {
      riskFlags.push('No payments expected in next 30 days — ensure upcoming pay apps are submitted');
    }
    const nextWeekForecast = cumulativeForecast.filter(d => {
      const daysUntilDue = Math.ceil((new Date(d.due_date) - new Date()) / (1000 * 60 * 60 * 24));
      return daysUntilDue <= 7;
    });
    if (nextWeekForecast.length === 0 && totalOutstanding > 10000) {
      riskFlags.push('No payments expected within 7 days but have outstanding balance');
    }

    res.json({
      ok: true,
      daily_forecast: cumulativeForecast,
      summary: {
        total_expected_30d: cumulativeExpected,
        already_overdue: alreadyOverdue,
        total_outstanding: totalOutstanding,
        projected_cash_position: cumulativeExpected - alreadyOverdue
      },
      risk_flags: riskFlags
    });
  } catch (e) {
    console.error('[Collection API] /forecast error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/collection/payer-patterns
 * Analyze each unique owner's payment history
 * Returns payment reliability rating
 */
router.get('/payer-patterns', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await pool.query(`
      SELECT
        p.owner_name,
        p.owner_email,
        COUNT(pa.id) as total_invoices,
        COUNT(CASE WHEN pa.payment_received THEN 1 END) as paid_count,
        ROUND(COALESCE(AVG(CASE
          WHEN pa.payment_received AND pa.payment_received_at IS NOT NULL AND pa.payment_due_date IS NOT NULL
          THEN EXTRACT(DAY FROM pa.payment_received_at - pa.payment_due_date)
          END), 0)::NUMERIC, 1) as avg_days_from_due,
        COALESCE(SUM(CASE WHEN pa.payment_received THEN pa.amount_paid ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE
          WHEN NOT COALESCE(pa.payment_received, FALSE) AND pa.bad_debt IS NOT TRUE
          THEN pa.amount_due
          ELSE 0
        END), 0) as currently_owed,
        COUNT(CASE WHEN pa.bad_debt THEN 1 END) as bad_debt_count
      FROM pay_apps pa
      JOIN projects p ON pa.project_id = p.id
      WHERE p.user_id = $1
        AND pa.submitted_at IS NOT NULL
      GROUP BY p.owner_name, p.owner_email
      ORDER BY currently_owed DESC
    `, [req.user.id]);

    const payerPatterns = result.rows.map(payer => {
      let paymentRating = 'new_client';
      if (payer.total_invoices < 2) {
        paymentRating = 'new_client';
      } else if (payer.avg_days_from_due <= 5) {
        paymentRating = 'reliable';
      } else if (payer.avg_days_from_due <= 20) {
        paymentRating = 'slow';
      } else {
        paymentRating = 'very_slow';
      }

      return {
        ...payer,
        payment_rating: paymentRating
      };
    });

    res.json({
      ok: true,
      data: payerPatterns,
      summary: {
        total_payers: payerPatterns.length,
        reliable_count: payerPatterns.filter(p => p.payment_rating === 'reliable').length,
        slow_count: payerPatterns.filter(p => p.payment_rating === 'slow').length,
        very_slow_count: payerPatterns.filter(p => p.payment_rating === 'very_slow').length,
        new_client_count: payerPatterns.filter(p => p.payment_rating === 'new_client').length
      }
    });
  } catch (e) {
    console.error('[Collection API] /payer-patterns error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/collection/followup/schedule
 * Schedule a follow-up for a pay app
 *
 * Body:
 * {
 *   pay_app_id: INTEGER,
 *   scheduled_date: DATE (YYYY-MM-DD),
 *   notes: STRING,
 *   followup_type: 'email_reminder' | 'phone_call' | 'final_notice'
 * }
 */
router.post('/followup/schedule', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { pay_app_id, scheduled_date, notes, followup_type } = req.body;

    // Validate required fields
    if (!pay_app_id || !scheduled_date || !followup_type) {
      return res.status(400).json({
        error: 'Missing required fields: pay_app_id, scheduled_date, followup_type'
      });
    }

    // Validate followup_type
    const validTypes = ['email_reminder', 'phone_call', 'final_notice'];
    if (!validTypes.includes(followup_type)) {
      return res.status(400).json({
        error: `Invalid followup_type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    // Verify scheduled_date is in the future
    const schedDate = new Date(scheduled_date);
    if (schedDate <= new Date()) {
      return res.status(400).json({
        error: 'scheduled_date must be in the future'
      });
    }

    // Verify pay_app belongs to user
    const payAppCheck = await pool.query(`
      SELECT pa.id
      FROM pay_apps pa
      JOIN projects p ON pa.project_id = p.id
      WHERE pa.id = $1 AND p.user_id = $2
    `, [pay_app_id, req.user.id]);

    if (payAppCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Pay app not found or access denied'
      });
    }

    // Insert follow-up
    const result = await pool.query(`
      INSERT INTO payment_followups(
        pay_app_id,
        user_id,
        followup_type,
        scheduled_date,
        notes,
        created_at
      )
      VALUES($1, $2, $3, $4, $5, NOW())
      RETURNING id, pay_app_id, user_id, followup_type, scheduled_date, notes, created_at
    `, [pay_app_id, req.user.id, followup_type, scheduled_date, notes || null]);

    const followup = result.rows[0];

    res.json({
      ok: true,
      data: followup,
      message: 'Follow-up scheduled'
    });
  } catch (e) {
    console.error('[Collection API] /followup/schedule error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/collection/followup-history
 * Returns follow-up log for all pay apps (last 50)
 */
router.get('/followup-history', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await pool.query(`
      SELECT
        pf.id,
        pf.pay_app_id,
        pf.followup_type,
        pf.scheduled_date,
        pf.sent_at,
        pf.response,
        pf.response_at,
        pf.notes,
        pf.created_at,
        pa.app_number,
        p.name as project_name
      FROM payment_followups pf
      JOIN pay_apps pa ON pf.pay_app_id = pa.id
      JOIN projects p ON pa.project_id = p.id
      WHERE pf.user_id = $1
      ORDER BY pf.created_at DESC
      LIMIT 50
    `, [req.user.id]);

    res.json({
      ok: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (e) {
    console.error('[Collection API] /followup-history error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
