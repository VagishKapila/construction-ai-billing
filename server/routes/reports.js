/**
 * Reporting Module Routes
 * Filter, sort, and export pay app data; revenue tracking
 * Module 5: Reporting Module
 */

const express = require('express');
const { pool } = require('../../db');

const router = express.Router();

/**
 * Middleware: auth (assumed to be applied in server.js before mounting)
 */

/**
 * GET /api/reports/pay-apps
 * Filter and sort pay apps by project, date range, status
 *
 * Query params:
 * - project_id: INT — filter by project
 * - from: DATE (YYYY-MM-DD) — filter from date
 * - to: DATE (YYYY-MM-DD) — filter to date
 * - status: VARCHAR — 'draft', 'submitted', 'paid'
 * - sort: VARCHAR — 'created_at', 'period_end', 'amount_due', 'status'
 * - order: VARCHAR — 'ASC', 'DESC'
 * - page: INT — pagination (default: 1)
 * - limit: INT — rows per page (default: 20, max: 100)
 */
router.get('/pay-apps', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'No token' });
    }

    const {
      project_id,
      from,
      to,
      status,
      sort = 'created_at',
      order = 'DESC',
      page = 1,
      limit = 20
    } = req.query;

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    // Validate sort/order
    const validSortCols = ['created_at', 'period_end', 'amount_due', 'status', 'app_number'];
    const validOrders = ['ASC', 'DESC'];
    const sortCol = validSortCols.includes(sort) ? sort : 'created_at';
    const orderDir = validOrders.includes((order || '').toUpperCase()) ? order.toUpperCase() : 'DESC';

    // Build WHERE clause dynamically
    let whereConditions = ['p.user_id = $1'];
    let paramIndex = 2;
    const params = [req.user.id];

    if (project_id) {
      whereConditions.push(`p.id = $${paramIndex}`);
      params.push(parseInt(project_id));
      paramIndex++;
    }

    if (from) {
      whereConditions.push(`pa.period_start >= $${paramIndex}`);
      params.push(from);
      paramIndex++;
    }

    if (to) {
      whereConditions.push(`pa.period_end <= $${paramIndex}`);
      params.push(to);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`pa.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    // Also filter out deleted pay apps and test artifacts
    whereConditions.push('pa.deleted_at IS NULL');
    whereConditions.push("p.name NOT LIKE 'HubTest%'");
    whereConditions.push("p.name NOT LIKE 'HubCore%'");
    whereConditions.push("p.name NOT LIKE 'JoinTest%'");
    whereConditions.push("p.name NOT LIKE 'E2E%'");
    whereConditions.push("p.name NOT LIKE 'CO_%'");
    whereConditions.push("p.name NOT LIKE 'Playwright%'");
    whereConditions.push("p.name NOT LIKE 'PayApp%'");
    whereConditions.push("p.name NOT LIKE 'Test Project%'");

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total
       FROM projects p
       JOIN pay_apps pa ON pa.project_id = p.id
       WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Get paginated data
    const paramsCopy = [...params];
    const query = `
      SELECT
        pa.id,
        pa.app_number,
        pa.period_start,
        pa.period_end,
        pa.period_label,
        pa.status,
        pa.amount_due,
        pa.retention_held,
        pa.payment_status,
        pa.amount_paid,
        pa.created_at,
        pa.submitted_at,
        p.id as project_id,
        p.name as project_name,
        p.number as project_number
      FROM projects p
      JOIN pay_apps pa ON pa.project_id = p.id
      WHERE ${whereClause}
      ORDER BY pa.${sortCol} ${orderDir}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    paramsCopy.push(limitNum);
    paramsCopy.push(offset);

    const result = await pool.query(query, paramsCopy);

    res.json({
      ok: true,
      data: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      },
      filters: {
        project_id,
        from,
        to,
        status,
        sort: sortCol,
        order: orderDir
      }
    });
  } catch (e) {
    console.error('[Reports API] /pay-apps error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/reports/summary
 * Revenue summary: total billed this month, total outstanding, total paid
 * Also returns per-project breakdown
 */
router.get('/summary', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'No token' });
    }

    const month = req.query.month || new Date().toISOString().slice(0, 7);

    // Monthly stats
    const monthlyResult = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN pa.status = 'submitted' THEN pa.amount_due ELSE 0 END), 0) as total_billed_month,
        COALESCE(SUM(CASE WHEN pa.payment_status IN ('pending', 'unpaid') THEN pa.amount_due ELSE 0 END), 0) as total_outstanding,
        COALESCE(SUM(CASE WHEN pa.payment_status IN ('partial', 'paid', 'processing') THEN COALESCE(pa.amount_paid, 0) ELSE 0 END), 0) as total_paid,
        COUNT(*) as payapp_count
       FROM projects p
       JOIN pay_apps pa ON pa.project_id = p.id
       WHERE p.user_id = $1
         AND pa.deleted_at IS NULL
         AND TO_CHAR(pa.created_at, 'YYYY-MM') = $2`,
      [req.user.id, month]
    );

    // Per-project breakdown (retention view)
    const projectResult = await pool.query(
      `SELECT
        p.id,
        p.name,
        p.number,
        p.status,
        COALESCE(p.original_contract, 0) as original_contract,
        COALESCE(SUM(sl.scheduled_value), 0) as total_scheduled,
        COALESCE(SUM(sl.scheduled_value * pal.this_pct / 100.0), 0) as total_work_completed,
        COALESCE(SUM(sl.scheduled_value * pal.this_pct / 100.0 * pal.retainage_pct / 100.0), 0) as total_retainage,
        COUNT(DISTINCT pa.id) as payapp_count
       FROM projects p
       LEFT JOIN pay_apps pa ON pa.project_id = p.id AND pa.status = 'submitted' AND pa.deleted_at IS NULL
       LEFT JOIN pay_app_lines pal ON pal.pay_app_id = pa.id
       LEFT JOIN sov_lines sl ON sl.id = pal.sov_line_id
       WHERE p.user_id = $1
         AND p.name NOT ILIKE 'HubTest%'
         AND p.name NOT ILIKE 'HubCore%'
         AND p.name NOT ILIKE 'JoinTest%'
         AND p.name NOT ILIKE 'E2E%'
         AND p.name NOT LIKE 'CO!_%' ESCAPE '!'
         AND p.name NOT ILIKE 'Playwright%'
         AND p.name NOT ILIKE 'PayApp%'
         AND p.name NOT ILIKE 'Test Project%'
       GROUP BY p.id, p.name, p.number, p.status, p.original_contract
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );

    const monthly = monthlyResult.rows[0] || {
      total_billed_month: 0,
      total_outstanding: 0,
      total_paid: 0,
      payapp_count: 0
    };

    res.json({
      ok: true,
      summary: {
        period: month,
        ...monthly
      },
      projects: projectResult.rows,
      message: `Summary for ${month}`
    });
  } catch (e) {
    console.error('[Reports API] /summary error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/reports/export
 * Export pay apps as CSV with same filters as /pay-apps
 */
router.get('/export', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'No token' });
    }

    const {
      project_id,
      from,
      to,
      status,
      sort = 'created_at',
      order = 'DESC'
    } = req.query;

    let whereConditions = ['p.user_id = $1'];
    let paramIndex = 2;
    const params = [req.user.id];

    if (project_id) {
      whereConditions.push(`p.id = $${paramIndex}`);
      params.push(parseInt(project_id));
      paramIndex++;
    }

    if (from) {
      whereConditions.push(`pa.period_start >= $${paramIndex}`);
      params.push(from);
      paramIndex++;
    }

    if (to) {
      whereConditions.push(`pa.period_end <= $${paramIndex}`);
      params.push(to);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`pa.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    whereConditions.push('pa.deleted_at IS NULL');

    const whereClause = whereConditions.join(' AND ');

    const validSortCols = ['created_at', 'period_end', 'amount_due', 'status', 'app_number'];
    const validOrders = ['ASC', 'DESC'];
    const sortCol = validSortCols.includes(sort) ? sort : 'created_at';
    const orderDir = validOrders.includes((order || '').toUpperCase()) ? order.toUpperCase() : 'DESC';

    const result = await pool.query(
      `SELECT
        pa.app_number,
        pa.period_start,
        pa.period_end,
        pa.period_label,
        pa.status,
        pa.amount_due,
        pa.retention_held,
        pa.payment_status,
        pa.amount_paid,
        pa.created_at,
        pa.submitted_at,
        p.name as project_name,
        p.number as project_number
       FROM projects p
       JOIN pay_apps pa ON pa.project_id = p.id
       WHERE ${whereClause}
       ORDER BY pa.${sortCol} ${orderDir}`,
      params
    );

    // Generate CSV
    const headers = [
      'App #',
      'Project',
      'Project #',
      'Period',
      'Period Start',
      'Period End',
      'Status',
      'Amount Due',
      'Retainage Held',
      'Payment Status',
      'Amount Paid',
      'Created At',
      'Submitted At'
    ];

    const rows = result.rows.map(row => [
      row.app_number,
      row.project_name,
      row.project_number,
      row.period_label,
      row.period_start ? row.period_start.toISOString().split('T')[0] : '',
      row.period_end ? row.period_end.toISOString().split('T')[0] : '',
      row.status,
      row.amount_due || '',
      row.retention_held || '',
      row.payment_status,
      row.amount_paid || '',
      row.created_at ? row.created_at.toISOString() : '',
      row.submitted_at ? row.submitted_at.toISOString() : ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row =>
        row.map(cell =>
          typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))
            ? `"${cell.replace(/"/g, '""')}"`
            : cell
        ).join(',')
      )
    ].join('\n');

    const filename = `pay-apps-export-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e) {
    console.error('[Reports API] /export error:', e.message);
    res.status(500).json({ error: 'Export failed' });
  }
});

/**
 * GET /api/stats
 * Dashboard KPI stats for the current user (non-admin version of /admin/stats)
 * Returns: projects count, payapps count, total_billed, outstanding
 */
router.get('/stats', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'No token' });
    }

    const statsResult = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM projects WHERE user_id = $1) as projects,
        (SELECT COUNT(*) FROM pay_apps pa JOIN projects p ON pa.project_id = p.id WHERE p.user_id = $1 AND pa.deleted_at IS NULL) as payapps,
        COALESCE((SELECT SUM(pa.amount_due) FROM pay_apps pa JOIN projects p ON pa.project_id = p.id WHERE p.user_id = $1 AND pa.deleted_at IS NULL AND pa.status IN ('submitted', 'sent', 'approved')), 0) as total_billed,
        COALESCE((SELECT SUM(pa.amount_due) FROM pay_apps pa JOIN projects p ON pa.project_id = p.id WHERE p.user_id = $1 AND pa.deleted_at IS NULL AND pa.status IN ('submitted', 'sent', 'approved') AND COALESCE(pa.payment_status, 'unpaid') NOT IN ('paid', 'partial', 'processing')), 0) as outstanding,
        COALESCE((SELECT SUM(COALESCE(pa.amount_paid, 0)) FROM pay_apps pa JOIN projects p ON pa.project_id = p.id WHERE p.user_id = $1 AND pa.deleted_at IS NULL AND (pa.payment_received = true OR pa.payment_status IN ('paid', 'partial', 'processing'))), 0) as total_paid,
        COALESCE((SELECT SUM(COALESCE(pa.retention_held, 0)) FROM pay_apps pa JOIN projects p ON pa.project_id = p.id WHERE p.user_id = $1 AND pa.deleted_at IS NULL AND pa.status IN ('submitted', 'sent', 'approved')), 0) as total_retention`,
      [req.user.id]
    );

    const row = statsResult.rows[0] || { projects: 0, payapps: 0, total_billed: 0, outstanding: 0, total_paid: 0, total_retention: 0 };

    res.json({
      ok: true,
      data: {
        projects: parseInt(row.projects) || 0,
        payapps: parseInt(row.payapps) || 0,
        total_billed: parseFloat(row.total_billed) || 0,
        outstanding: parseFloat(row.outstanding) || 0,
        total_paid: parseFloat(row.total_paid) || 0,
        total_retention: parseFloat(row.total_retention) || 0
      }
    });
  } catch (e) {
    console.error('[Reports API] /stats error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/reports/trends
 * Monthly billing trend data for charts (last 12 months)
 */
router.get('/trends', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'No token' });
    }

    const result = await pool.query(
      `SELECT
        DATE_TRUNC('month', pa.created_at)::DATE as month,
        TO_CHAR(pa.created_at, 'YYYY-MM') as month_label,
        COUNT(*) as payapp_count,
        COALESCE(SUM(pa.amount_due), 0) as total_billed,
        COALESCE(SUM(pa.amount_paid), 0) as total_paid
       FROM projects p
       JOIN pay_apps pa ON pa.project_id = p.id
       WHERE p.user_id = $1
         AND pa.deleted_at IS NULL
         AND pa.created_at >= NOW() - INTERVAL '12 months'
       GROUP BY DATE_TRUNC('month', pa.created_at), TO_CHAR(pa.created_at, 'YYYY-MM')
       ORDER BY month ASC`,
      [req.user.id]
    );

    res.json({
      ok: true,
      trends: result.rows,
      period: 'Last 12 months'
    });
  } catch (e) {
    console.error('[Reports API] /trends error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
