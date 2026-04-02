const express = require('express');
const router = express.Router();
const { pool } = require('../../db');
const { auth } = require('../middleware/auth');

// GET /api/stats — Dashboard stats (total billed, retainage, other invoices)
router.get('/api/stats', auth, async (req, res) => {
  try {
    const [billing, otherInv] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(SUM(sl.scheduled_value * pal.this_pct / 100.0), 0)                               AS total_billed,
          COALESCE(SUM(sl.scheduled_value * pal.this_pct / 100.0 * pal.retainage_pct / 100.0), 0)  AS total_retainage
        FROM projects p
        JOIN pay_apps       pa  ON pa.project_id  = p.id
        JOIN pay_app_lines  pal ON pal.pay_app_id  = pa.id
        JOIN sov_lines      sl  ON sl.id           = pal.sov_line_id
        WHERE p.user_id = $1
          AND pa.status = 'submitted'
          AND pa.deleted_at IS NULL
      `, [req.user.id]),
      pool.query(`
        SELECT COUNT(*) AS other_invoice_count,
               COALESCE(SUM(amount), 0) AS other_invoice_total
        FROM other_invoices WHERE user_id=$1 AND deleted_at IS NULL
      `, [req.user.id])
    ]);
    const stats = billing.rows[0] || { total_billed: 0, total_retainage: 0 };
    const oi = otherInv.rows[0] || { other_invoice_count: 0, other_invoice_total: 0 };
    res.json({ ...stats, ...oi });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// GET /api/revenue/summary — Revenue summary with KPIs and charts
router.get('/api/revenue/summary', auth, async (req, res) => {
  try {
    const uid = req.user.id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const period = req.query.period || 'monthly'; // monthly | quarterly | yearly

    const paRes = await pool.query(`
      SELECT pa.id, pa.project_id,
             pa.app_number AS pay_app_number,
             pa.period_end AS period_end,
             pa.status, pa.payment_received,
             p.name AS project_name, p.address, p.job_number,
             p.original_contract AS contract_amount,
             EXTRACT(MONTH   FROM COALESCE(pa.period_end, pa.created_at::date)) AS month,
             EXTRACT(QUARTER FROM COALESCE(pa.period_end, pa.created_at::date)) AS quarter,
             COALESCE((
               SELECT SUM(sl.scheduled_value * pal.this_pct / 100)
               FROM pay_app_lines pal
               JOIN sov_lines sl ON sl.id = pal.sov_line_id
               WHERE pal.pay_app_id = pa.id
             ), 0) AS gross_this,
             COALESCE((
               SELECT SUM(sl.scheduled_value * pal.this_pct / 100
                        - sl.scheduled_value * (pal.prev_pct + pal.this_pct) / 100 * pal.retainage_pct / 100
                        + sl.scheduled_value * pal.prev_pct  / 100 * pal.retainage_pct / 100)
               FROM pay_app_lines pal
               JOIN sov_lines sl ON sl.id = pal.sov_line_id
               WHERE pal.pay_app_id = pa.id
             ), 0) AS amount_due,
             COALESCE((
               SELECT SUM(sl.scheduled_value * (pal.prev_pct + pal.this_pct) / 100 * pal.retainage_pct / 100)
               FROM pay_app_lines pal
               JOIN sov_lines sl ON sl.id = pal.sov_line_id
               WHERE pal.pay_app_id = pa.id
             ), 0) AS retention_held
      FROM pay_apps pa
      JOIN projects p ON p.id = pa.project_id
      WHERE p.user_id = $1
        AND EXTRACT(YEAR FROM COALESCE(pa.period_end, pa.created_at::date)) = $2
        AND pa.deleted_at IS NULL
      ORDER BY COALESCE(pa.period_end, pa.created_at::date) DESC
    `, [uid, year]);

    const rows = paRes.rows;
    const billedRows = rows.filter(r => ['submitted', 'approved', 'paid'].includes(r.status) || r.payment_received);
    const gross_billed = billedRows.reduce((s, r) => s + parseFloat(r.gross_this || 0), 0);
    const total_billed = gross_billed;
    const net_billed = billedRows.reduce((s, r) => s + parseFloat(r.amount_due || 0), 0);
    const total_retention = billedRows.reduce((s, r) => s + parseFloat(r.retention_held || 0), 0);
    const active_projects = new Set(rows.map(r => r.project_name)).size;

    // Build chart buckets
    let chart = [];
    if (period === 'monthly') {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      chart = months.map((label, i) => ({
        label,
        amount: billedRows.filter(r => parseInt(r.month) === i + 1)
                          .reduce((s, r) => s + parseFloat(r.amount_due || 0), 0)
      }));
    } else if (period === 'quarterly') {
      chart = ['Q1', 'Q2', 'Q3', 'Q4'].map((label, i) => ({
        label,
        amount: billedRows.filter(r => parseInt(r.quarter) === i + 1)
                          .reduce((s, r) => s + parseFloat(r.amount_due || 0), 0)
      }));
    } else {
      const yRes = await pool.query(`
        SELECT EXTRACT(YEAR FROM COALESCE(pa.period_end, pa.created_at::date)) AS yr,
               SUM(COALESCE((
                 SELECT SUM(sl.scheduled_value * pal.this_pct / 100
                          - sl.scheduled_value * (pal.prev_pct + pal.this_pct) / 100 * pal.retainage_pct / 100
                          + sl.scheduled_value * pal.prev_pct / 100 * pal.retainage_pct / 100)
                 FROM pay_app_lines pal JOIN sov_lines sl ON sl.id=pal.sov_line_id
                 WHERE pal.pay_app_id=pa.id
               ), 0)) AS amount
        FROM pay_apps pa JOIN projects p ON p.id=pa.project_id
        WHERE p.user_id=$1
          AND pa.status IN ('submitted','approved')
          AND pa.deleted_at IS NULL
        GROUP BY yr ORDER BY yr
      `, [uid]);
      chart = yRes.rows.map(r => ({label: String(parseInt(r.yr)), amount: parseFloat(r.amount) || 0}));
    }

    res.json({total_billed, net_billed, total_retention, active_projects, chart, rows});
  } catch (e) {
    console.error('[Revenue] ERROR:', e.message, '\n', e.stack);
    res.status(500).json({error: 'Internal server error', detail: e.message});
  }
});

// GET /api/reports/pay-apps — Filtered pay apps report
router.get('/api/reports/pay-apps', auth, async (req, res) => {
  try {
    const uid = req.user.id;
    const {project_id, status, date_from, date_to, sort_by, sort_dir} = req.query;
    let where = 'p.user_id=$1 AND pa.deleted_at IS NULL';
    const params = [uid];
    let pIdx = 2;

    if (project_id) {
      where += ` AND pa.project_id=$${pIdx++}`;
      params.push(project_id);
    }

    if (status) {
      if (status === 'paid') {
        where += ' AND pa.payment_received=TRUE';
      } else if (status === 'submitted') {
        where += " AND pa.status='submitted' AND (pa.payment_received IS NULL OR pa.payment_received=FALSE)";
      } else if (status === 'draft') {
        where += " AND pa.status!='submitted'";
      }
    }

    if (date_from) {
      where += ` AND COALESCE(pa.period_end, pa.created_at::date) >= $${pIdx++}`;
      params.push(date_from);
    }

    if (date_to) {
      where += ` AND COALESCE(pa.period_end, pa.created_at::date) <= $${pIdx++}`;
      params.push(date_to);
    }

    const allowedSort = {
      date: 'COALESCE(pa.period_end, pa.created_at::date)',
      project: 'p.name',
      amount: 'gross_this',
      app_number: 'pa.app_number'
    };
    const orderCol = allowedSort[sort_by] || 'COALESCE(pa.period_end, pa.created_at::date)';
    const orderDir = sort_dir === 'asc' ? 'ASC' : 'DESC';

    const r = await pool.query(`
      SELECT pa.id, pa.project_id, pa.app_number, pa.period_label, pa.period_start, pa.period_end,
             pa.status, pa.payment_received, pa.payment_status, pa.submitted_at, pa.created_at,
             p.name AS project_name, p.number AS project_number, p.job_number, p.address,
             p.original_contract, p.owner AS project_owner,
             COALESCE((SELECT SUM(sl.scheduled_value * pal.this_pct / 100)
               FROM pay_app_lines pal JOIN sov_lines sl ON sl.id=pal.sov_line_id WHERE pal.pay_app_id=pa.id), 0) AS gross_this,
             COALESCE((SELECT SUM(sl.scheduled_value * (pal.prev_pct + pal.this_pct) / 100 * pal.retainage_pct / 100)
               FROM pay_app_lines pal JOIN sov_lines sl ON sl.id=pal.sov_line_id WHERE pal.pay_app_id=pa.id), 0) AS retention_held,
             COALESCE((SELECT SUM(
               sl.scheduled_value * pal.this_pct / 100
               - sl.scheduled_value * (pal.prev_pct + pal.this_pct) / 100 * pal.retainage_pct / 100
               + sl.scheduled_value * pal.prev_pct / 100 * pal.retainage_pct / 100)
               FROM pay_app_lines pal JOIN sov_lines sl ON sl.id=pal.sov_line_id WHERE pal.pay_app_id=pa.id), 0) AS amount_due
      FROM pay_apps pa JOIN projects p ON p.id=pa.project_id
      WHERE ${where}
      ORDER BY ${orderCol} ${orderDir}
    `, params);

    // Summary KPIs
    const submitted = r.rows.filter(r => r.status === 'submitted' || r.payment_received);
    const totalBilled = submitted.reduce((s, r) => s + parseFloat(r.gross_this || 0), 0);
    const totalOutstanding = submitted.filter(r => !r.payment_received)
                                      .reduce((s, r) => s + parseFloat(r.amount_due || 0), 0);
    const totalPaid = submitted.filter(r => r.payment_received)
                               .reduce((s, r) => s + parseFloat(r.amount_due || 0), 0);
    const totalRetention = submitted.reduce((s, r) => s + parseFloat(r.retention_held || 0), 0);

    // Monthly chart data
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const chart = months.map((label, i) => ({
      label,
      billed: submitted.filter(r => {
        const d = new Date(r.period_end || r.created_at);
        return d.getMonth() === i;
      }).reduce((s, r) => s + parseFloat(r.amount_due || 0), 0)
    }));

    res.json({
      rows: r.rows,
      summary: {totalBilled, totalOutstanding, totalPaid, totalRetention, count: r.rows.length},
      chart
    });
  } catch (e) {
    console.error('[Reports pay-apps]', e.message);
    res.status(500).json({error: 'Internal server error'});
  }
});

// GET /api/reports/other-invoices — Filtered other invoices report
router.get('/api/reports/other-invoices', auth, async (req, res) => {
  try {
    const uid = req.user.id;
    const {project_id, category, status, date_from, date_to, sort_by, sort_dir} = req.query;
    let where = 'oi.user_id=$1 AND oi.deleted_at IS NULL';
    const params = [uid];
    let pIdx = 2;

    if (project_id) {
      where += ` AND oi.project_id=$${pIdx++}`;
      params.push(project_id);
    }

    if (category) {
      where += ` AND oi.category=$${pIdx++}`;
      params.push(category);
    }

    if (status) {
      where += ` AND oi.status=$${pIdx++}`;
      params.push(status);
    }

    if (date_from) {
      where += ` AND oi.invoice_date >= $${pIdx++}`;
      params.push(date_from);
    }

    if (date_to) {
      where += ` AND oi.invoice_date <= $${pIdx++}`;
      params.push(date_to);
    }

    const allowedSort = {
      date: 'oi.invoice_date',
      project: 'p.name',
      amount: 'oi.amount',
      vendor: 'oi.vendor',
      category: 'oi.category'
    };
    const orderCol = allowedSort[sort_by] || 'oi.invoice_date';
    const orderDir = sort_dir === 'asc' ? 'ASC' : 'DESC';

    const r = await pool.query(`
      SELECT oi.*, p.name AS project_name, p.number AS project_number, p.job_number, p.address
      FROM other_invoices oi JOIN projects p ON p.id=oi.project_id
      WHERE ${where}
      ORDER BY ${orderCol} ${orderDir}
    `, params);

    const totalAmount = r.rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const byCategory = {};
    r.rows.forEach(inv => {
      const c = inv.category || 'other';
      byCategory[c] = (byCategory[c] || 0) + parseFloat(inv.amount || 0);
    });

    res.json({rows: r.rows, summary: {totalAmount, count: r.rows.length, byCategory}});
  } catch (e) {
    console.error('[Reports other-invoices]', e.message);
    res.status(500).json({error: 'Internal server error'});
  }
});

// GET /api/reports/export/csv — Export reports as CSV
router.get('/api/reports/export/csv', auth, async (req, res) => {
  try {
    const uid = req.user.id;
    const {type, project_id, date_from, date_to} = req.query;
    let csvRows = [];

    if (type === 'other-invoices') {
      let where = 'oi.user_id=$1 AND oi.deleted_at IS NULL';
      const params = [uid];
      let pIdx = 2;

      if (project_id) {
        where += ` AND oi.project_id=$${pIdx++}`;
        params.push(project_id);
      }

      if (date_from) {
        where += ` AND oi.invoice_date >= $${pIdx++}`;
        params.push(date_from);
      }

      if (date_to) {
        where += ` AND oi.invoice_date <= $${pIdx++}`;
        params.push(date_to);
      }

      const r = await pool.query(
        `SELECT oi.*, p.name AS project_name FROM other_invoices oi
         JOIN projects p ON p.id=oi.project_id WHERE ${where} ORDER BY oi.invoice_date DESC`,
        params
      );

      csvRows.push(['Invoice #', 'Category', 'Description', 'Vendor', 'Amount', 'Invoice Date', 'Due Date', 'Status', 'Project', 'Notes']);
      r.rows.forEach(inv => {
        csvRows.push([
          inv.invoice_number || '',
          inv.category || '',
          inv.description || '',
          inv.vendor || '',
          inv.amount || 0,
          inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : '',
          inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '',
          inv.status || '',
          inv.project_name || '',
          inv.notes || ''
        ]);
      });
    } else {
      // Pay apps export
      let where = 'p.user_id=$1 AND pa.deleted_at IS NULL';
      const params = [uid];
      let pIdx = 2;

      if (project_id) {
        where += ` AND pa.project_id=$${pIdx++}`;
        params.push(project_id);
      }

      if (date_from) {
        where += ` AND COALESCE(pa.period_end, pa.created_at::date) >= $${pIdx++}`;
        params.push(date_from);
      }

      if (date_to) {
        where += ` AND COALESCE(pa.period_end, pa.created_at::date) <= $${pIdx++}`;
        params.push(date_to);
      }

      const r = await pool.query(`
        SELECT pa.app_number, pa.period_label, pa.period_end, pa.status, pa.payment_received,
               p.name AS project_name, p.job_number,
               COALESCE((SELECT SUM(sl.scheduled_value * pal.this_pct / 100)
                 FROM pay_app_lines pal JOIN sov_lines sl ON sl.id=pal.sov_line_id WHERE pal.pay_app_id=pa.id), 0) AS gross_billed,
               COALESCE((SELECT SUM(sl.scheduled_value * pal.this_pct / 100
                 - sl.scheduled_value * (pal.prev_pct + pal.this_pct) / 100 * pal.retainage_pct / 100
                 + sl.scheduled_value * pal.prev_pct / 100 * pal.retainage_pct / 100)
                 FROM pay_app_lines pal JOIN sov_lines sl ON sl.id=pal.sov_line_id WHERE pal.pay_app_id=pa.id), 0) AS net_due
        FROM pay_apps pa JOIN projects p ON p.id=pa.project_id
        WHERE ${where} ORDER BY COALESCE(pa.period_end, pa.created_at::date) DESC
      `, params);

      csvRows.push(['App #', 'Period', 'Period End', 'Status', 'Payment Received', 'Project', 'Job #', 'Gross Billed', 'Net Due']);
      r.rows.forEach(pa => {
        csvRows.push([
          pa.app_number,
          pa.period_label || '',
          pa.period_end ? new Date(pa.period_end).toLocaleDateString() : '',
          pa.status || '',
          pa.payment_received ? 'Yes' : 'No',
          pa.project_name || '',
          pa.job_number || '',
          parseFloat(pa.gross_billed || 0).toFixed(2),
          parseFloat(pa.net_due || 0).toFixed(2)
        ]);
      });
    }

    const csv = csvRows.map(row => row.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="report_${type || 'pay-apps'}_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (e) {
    console.error('[Reports CSV]', e.message);
    res.status(500).json({error: 'Export failed'});
  }
});

// POST /api/pay-apps/:id/payment-received — Toggle payment received status
router.post('/api/pay-apps/:id/payment-received', auth, async (req, res) => {
  try {
    const {received} = req.body;
    const check = await pool.query(
      `SELECT pa.id FROM pay_apps pa JOIN projects p ON p.id=pa.project_id
       WHERE pa.id=$1 AND p.user_id=$2`,
      [req.params.id, req.user.id]
    );

    if (!check.rows[0]) {
      return res.status(404).json({error: 'Not found'});
    }

    const r = await pool.query(
      `UPDATE pay_apps SET payment_received=$1, payment_received_at=$2 WHERE id=$3 RETURNING *`,
      [!!received, received ? new Date() : null, req.params.id]
    );

    res.json(r.rows[0]);
  } catch (e) {
    console.error('[PaymentReceived]', e.message);
    res.status(500).json({error: 'Internal server error'});
  }
});

// GET /api/revenue/export/quickbooks — Export to QuickBooks IIF format
router.get('/api/revenue/export/quickbooks', auth, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const rows = await fetchRevenueRows(req.user.id, year);
    const billed = rows.filter(r => ['submitted', 'approved', 'paid'].includes(r.status) || r.payment_received);

    const fmtD = d => {
      const dt = new Date(d || Date.now());
      return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}/${dt.getFullYear()}`;
    };
    const fmtA = n => parseFloat(n || 0).toFixed(2);

    let iif = '!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\tCLEAR\tTOPRINT\n';
    iif += '!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\tCLEAR\n';
    iif += '!ENDTRNS\n';

    billed.forEach((r, i) => {
      const date = fmtD(r.period_end);
      const customer = r.project_name || 'Unknown';
      const docNum = `${r.job_number || ''}#${r.app_number}`.trim();
      const memo = `Pay App #${r.app_number} — ${r.project_name}`;
      const amt = fmtA(r.amount_due);
      const negAmt = fmtA(-parseFloat(r.amount_due || 0));

      iif += `TRNS\t${1000 + i}\tINVOICE\t${date}\tAccounts Receivable\t${customer}\t${amt}\t${docNum}\t${memo}\tN\tY\n`;
      iif += `SPL\t${2000 + i}\tINVOICE\t${date}\tConstruction Revenue\t${customer}\t${negAmt}\t${docNum}\t${memo}\tN\n`;
      iif += 'ENDTRNS\n';
    });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="revenue_${year}_quickbooks.iif"`);
    res.send(iif);
  } catch (e) {
    console.error('[QB Export]', e.message);
    res.status(500).json({error: 'Export failed'});
  }
});

// GET /api/revenue/export/sage — Export to Sage 300 CSV format
router.get('/api/revenue/export/sage', auth, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const rows = await fetchRevenueRows(req.user.id, year);
    const billed = rows.filter(r => ['submitted', 'approved', 'paid'].includes(r.status) || r.payment_received);

    const fmtD = d => {
      const dt = new Date(d || Date.now());
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    };
    const fmtA = n => parseFloat(n || 0).toFixed(2);

    const headers = ['CUSTOMER_NO', 'CUSTOMER_NAME', 'DOCUMENT_NO', 'DOCUMENT_DATE', 'DUE_DATE', 'GL_ACCOUNT', 'DESCRIPTION', 'INVOICE_AMOUNT', 'RETAINAGE_AMOUNT', 'JOB_NUMBER'];
    const csvRows = billed.map(r => [
      r.job_number || r.project_name?.replace(/\s/g, '').toUpperCase().slice(0, 10) || 'CUST001',
      r.project_name || '',
      `PA${String(r.app_number).padStart(3, '0')}-${r.job_number || r.id}`,
      fmtD(r.period_end),
      fmtD(r.period_end ? new Date(new Date(r.period_end).getTime() + 30 * 24 * 60 * 60 * 1000) : null),
      '4000-00',
      `Pay App #${r.app_number} - ${r.project_name}`,
      fmtA(r.amount_due),
      fmtA(r.retention_held),
      r.job_number || ''
    ]);

    const csv = [headers, ...csvRows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="revenue_${year}_sage300.csv"`);
    res.send(csv);
  } catch (e) {
    console.error('[Sage Export]', e.message);
    res.status(500).json({error: 'Export failed'});
  }
});

// GET /api/revenue/report/pdf — Annual revenue report PDF (requires puppeteer)
router.get('/api/revenue/report/pdf', auth, async (req, res) => {
  try {
    let puppeteer = null;
    try {
      puppeteer = require('puppeteer');
    } catch (e) {
      return res.status(503).json({error: 'PDF generation unavailable'});
    }

    const year = parseInt(req.query.year) || new Date().getFullYear();
    const rows = await fetchRevenueRows(req.user.id, year);

    const fmtM = n => '$' + parseFloat(n || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    const fmtD = d => d ? new Date(d).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) : '—';

    const billed = rows.filter(r => ['submitted', 'approved', 'paid'].includes(r.status) || r.payment_received);
    const total_billed = billed.reduce((s, r) => s + parseFloat(r.amount_due || 0), 0);
    const total_retention = billed.reduce((s, r) => s + parseFloat(r.retention_held || 0), 0);
    const net_received = total_billed - total_retention;
    const active_projects = new Set(rows.map(r => r.project_name)).size;

    // Monthly chart data
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyAmounts = months.map((_, i) =>
      billed.filter(r => r.period_end && new Date(r.period_end).getMonth() === i)
            .reduce((s, r) => s + parseFloat(r.amount_due || 0), 0)
    );
    const maxAmt = Math.max(...monthlyAmounts, 1);

    const barBars = months.map((m, i) => {
      const h = Math.round((monthlyAmounts[i] / maxAmt) * 80);
      const lbl = monthlyAmounts[i] > 0 ? `$${Math.round(monthlyAmounts[i] / 1000)}k` : '';
      return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;gap:3px">
        <div style="font-size:9px;color:#2563eb;font-weight:600">${lbl}</div>
        <div style="width:100%;height:${h}px;background:linear-gradient(to top,#2563eb,#3b82f6);border-radius:3px 3px 0 0;min-height:${monthlyAmounts[i] > 0 ? 4 : 0}px"></div>
        <div style="font-size:9px;color:#666">${m}</div>
      </div>`;
    }).join('');

    const tableRows = rows.map(r => `
      <tr>
        <td>${r.job_number || '—'}</td>
        <td>${r.project_name || '—'}</td>
        <td>#${r.app_number}</td>
        <td>${fmtD(r.period_end)}</td>
        <td style="text-align:right">${fmtM(r.contract_amount)}</td>
        <td style="text-align:right">${fmtM(r.amount_due)}</td>
        <td style="text-align:right">${fmtM(r.retention_held)}</td>
        <td style="text-align:center"><span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:${r.status === 'submitted' || r.status === 'approved' ? '#d1fae5' : '#fef3c7'};color:${r.status === 'submitted' || r.status === 'approved' ? '#065f46' : '#92400e'}">${r.status || 'draft'}</span></td>
        <td style="text-align:center">${r.payment_received ? '✓' : '—'}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#1a1a2e;padding:32px 40px}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:18px;border-bottom:2px solid #2563eb}
      .co-name{font-size:20px;font-weight:700;color:#2563eb}
      .report-title{font-size:14px;color:#444;margin-top:3px}
      .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px}
      .kpi{background:#f0f6ff;border-radius:8px;padding:14px 16px;border:1px solid #c7dff7}
      .kpi-label{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px}
      .kpi-val{font-size:18px;font-weight:700;color:#2563eb}
      .section-title{font-size:12px;font-weight:700;color:#1a1a2e;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;text-transform:uppercase;letter-spacing:0.05em}
      .chart-wrap{display:flex;align-items:flex-end;gap:6px;height:100px;margin-bottom:24px;padding:0 4px}
      table{width:100%;border-collapse:collapse;font-size:10px}
      th{background:#2563eb;color:#fff;padding:7px 10px;text-align:left;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.04em}
      td{padding:7px 10px;border-bottom:1px solid #f1f5f9}
      tr:nth-child(even) td{background:#f8fafc}
      .footer{margin-top:28px;padding-top:12px;border-top:1px solid #e2e8f0;text-align:center;font-size:9px;color:#999}
    </style></head><body>
    <div class="header">
      <div>
        <div class="co-name">Annual Revenue Report</div>
        <div class="report-title">Fiscal Year ${year} · Generated ${new Date().toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'})}</div>
      </div>
    </div>
    <div class="kpi-row">
      <div class="kpi"><div class="kpi-label">Total Billed</div><div class="kpi-val">${fmtM(total_billed)}</div></div>
      <div class="kpi"><div class="kpi-label">Retention Held</div><div class="kpi-val">${fmtM(total_retention)}</div></div>
      <div class="kpi"><div class="kpi-label">Net Received</div><div class="kpi-val">${fmtM(net_received)}</div></div>
      <div class="kpi"><div class="kpi-label">Active Projects</div><div class="kpi-val">${active_projects}</div></div>
    </div>
    <div class="section-title">Monthly Billing</div>
    <div class="chart-wrap">${barBars}</div>
    <div class="section-title">Pay Application History</div>
    <table>
      <thead><tr><th>Job #</th><th>Project</th><th>Pay App</th><th>Period End</th><th style="text-align:right">Contract</th><th style="text-align:right">Invoice Amt</th><th style="text-align:right">Retention</th><th style="text-align:center">Status</th><th style="text-align:center">Paid</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div class="footer">ConstructInvoice AI · $0 to use — pay it forward instead: feed a child, help a neighbor</div>
    </body></html>`;

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.setContent(html, {waitUntil: 'networkidle0'});
    const pdfBuf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: {top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in'}
    });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="annual_revenue_report_${year}.pdf"`);
    res.send(pdfBuf);
  } catch (e) {
    console.error('[Annual Report]', e.message);
    res.status(500).json({error: 'Report generation failed'});
  }
});

// GET /invoice/:token — Public invoice view (no auth)
router.get('/invoice/:token', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT pa.*, p.name as project_name, p.owner, p.owner_email, p.owner_phone,
             p.contractor, p.architect, p.original_contract, p.number as project_number,
             p.contact_name, p.contact_phone, p.contact_email, p.address,
             pa.payment_due_date, p.job_number,
             cs.company_name, cs.logo_filename, cs.contact_name as co_contact, cs.contact_email as co_email
      FROM pay_apps pa
      JOIN projects p ON p.id = pa.project_id
      LEFT JOIN company_settings cs ON cs.user_id = p.user_id
      WHERE pa.invoice_token = $1
    `, [req.params.token]);

    if (!r.rows[0]) {
      return res.status(404).send('<h2>Invoice not found or link has expired.</h2>');
    }

    const pa = r.rows[0];

    const lines = await pool.query(`
      SELECT sl.description, sl.item_id, sl.scheduled_value,
             pal.prev_pct, pal.this_pct, pal.retainage_pct,
             ROUND(sl.scheduled_value * pal.this_pct / 100, 2) as this_amount,
             ROUND(sl.scheduled_value * (pal.prev_pct + pal.this_pct) / 100, 2) as completed,
             ROUND(sl.scheduled_value * (pal.prev_pct + pal.this_pct) * pal.retainage_pct / 10000, 2) as retainage
      FROM pay_app_lines pal
      JOIN sov_lines sl ON sl.id = pal.sov_line_id
      WHERE pal.pay_app_id = $1 ORDER BY sl.sort_order
    `, [pa.id]);

    const totalDue = parseFloat(pa.amount_due || 0);
    const totalRet = parseFloat(pa.retention_held || 0);
    const fmt = v => '$' + parseFloat(v || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    const dueDate = pa.payment_due_date ? new Date(pa.payment_due_date) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntil = dueDate ? Math.round((dueDate - today) / 86400000) : null;
    const isOverdue = daysUntil !== null && daysUntil < 0;
    const isDueToday = daysUntil === 0;
    const statusColor = isOverdue ? '#dc2626' : isDueToday ? '#d97706' : '#1d4ed8';
    const statusText = isOverdue ? `OVERDUE — ${Math.abs(daysUntil)} DAYS PAST DUE` : isDueToday ? 'DUE TODAY' : dueDate ? `DUE IN ${daysUntil} DAYS` : 'INVOICE';
    const logoUrl = pa.logo_filename ? `/uploads/${pa.logo_filename}` : null;

    const linesHTML = lines.rows.map(l => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b">${l.item_id || ''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px">${l.description}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right">${fmt(l.scheduled_value)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right">${parseFloat(l.prev_pct || 0).toFixed(0)}%</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right;font-weight:600">${parseFloat(l.this_pct || 0).toFixed(0)}%</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right;font-weight:600">${fmt(l.this_amount)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right;color:#94a3b8">${fmt(l.retainage)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Invoice ${pa.app_number}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'-apple-system',BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f3f4f6;padding:20px}
    .container{max-width:900px;margin:0 auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}
    .header{padding:40px;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #e5e7eb}
    .header-left{flex:1}
    .logo{height:50px;margin-bottom:16px}
    .status-badge{display:inline-block;padding:8px 12px;border-radius:6px;background:${statusColor};color:#fff;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-top:12px}
    .header-right{text-align:right}
    .invoice-title{font-size:28px;font-weight:700;color:#1f2937;margin-bottom:4px}
    .invoice-number{font-size:14px;color:#6b7280;margin-bottom:8px}
    .due-status{font-size:14px;color:${statusColor};font-weight:600}
    .content{padding:40px}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:40px}
    .info-group h3{font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px}
    .info-group p{font-size:14px;color:#1f2937;line-height:1.6}
    .line-items{margin-bottom:32px}
    .line-items table{width:100%;border-collapse:collapse}
    .line-items th{background:#f9fafb;padding:12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;border-bottom:2px solid #e5e7eb}
    .line-items td{padding:12px;border-bottom:1px solid #f1f5f9}
    .totals{display:grid;grid-template-columns:1fr 200px;gap:20px;align-items:start;margin-top:32px;border-top:2px solid #e5e7eb;padding-top:20px}
    .totals-table{text-align:right}
    .totals-table tr{display:flex;justify-content:space-between;padding:8px 0;font-size:14px}
    .totals-table tr.total{font-size:16px;font-weight:700;color:#1f2937;border-top:1px solid #e5e7eb;padding-top:12px}
    .pay-button{background:#1d4ed8;color:#fff;padding:16px 24px;border:none;border-radius:6px;font-size:16px;font-weight:600;cursor:pointer;width:100%;text-align:center;text-decoration:none;display:inline-block}
    .footer{background:#f9fafb;padding:32px 40px;text-align:center;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-left">
        ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="logo">` : ''}
        <h1 class="invoice-number">Application #${pa.app_number}</h1>
        <div class="status-badge">${statusText}</div>
      </div>
      <div class="header-right">
        <h1 class="invoice-title">G702/G703</h1>
        <p class="due-status">${fmt(totalDue)} Due</p>
      </div>
    </div>
    <div class="content">
      <div class="info-grid">
        <div>
          <h3>From</h3>
          <p>
            <strong>${pa.company_name || pa.contractor}</strong><br>
            ${pa.co_contact ? pa.co_contact + '<br>' : ''}
            ${pa.co_email ? pa.co_email : ''}
          </p>
        </div>
        <div>
          <h3>Bill To</h3>
          <p>
            <strong>${pa.owner}</strong><br>
            ${pa.project_name}<br>
            ${pa.address || ''}
          </p>
        </div>
      </div>
      <div class="line-items">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Description</th>
              <th style="text-align:right">Scheduled Value</th>
              <th style="text-align:right">Prior %</th>
              <th style="text-align:right">This Period %</th>
              <th style="text-align:right">This Amount</th>
              <th style="text-align:right">Retainage</th>
            </tr>
          </thead>
          <tbody>
            ${linesHTML}
          </tbody>
        </table>
      </div>
      <div class="totals">
        <div></div>
        <div class="totals-table">
          <table style="width:100%">
            <tr><td style="text-align:left">Gross This Period:</td><td style="text-align:right">${fmt(lines.rows.reduce((s, l) => s + parseFloat(l.this_amount || 0), 0))}</td></tr>
            <tr><td style="text-align:left">Less Retainage:</td><td style="text-align:right">−${fmt(totalRet)}</td></tr>
            <tr class="total"><td style="text-align:left">Net Amount Due:</td><td style="text-align:right">${fmt(totalDue)}</td></tr>
          </table>
        </div>
      </div>
    </div>
    <div class="footer">
      Generated by ConstructInvoice AI (constructinv.varshyl.com) on ${new Date().toLocaleDateString()}
    </div>
  </div>
</body>
</html>`;

    res.send(html);
  } catch (e) {
    console.error('[Invoice route error]', e.message);
    res.status(500).send('<h2>Error loading invoice</h2>');
  }
});

// ── Helper function ───────────────────────────────────────────────────────────

async function fetchRevenueRows(uid, year) {
  const r = await pool.query(`
    SELECT pa.id, pa.project_id, pa.app_number, pa.period_end, pa.status,
           pa.payment_received,
           p.name AS project_name, p.address, p.job_number,
           p.original_contract AS contract_amount,
           COALESCE((
             SELECT SUM(sl.scheduled_value * pal.this_pct / 100
                      - sl.scheduled_value * (pal.prev_pct + pal.this_pct) / 100 * pal.retainage_pct / 100
                      + sl.scheduled_value * pal.prev_pct  / 100 * pal.retainage_pct / 100)
             FROM pay_app_lines pal
             JOIN sov_lines sl ON sl.id = pal.sov_line_id
             WHERE pal.pay_app_id = pa.id
           ), 0) AS amount_due,
           COALESCE((
             SELECT SUM(sl.scheduled_value * (pal.prev_pct + pal.this_pct) / 100 * pal.retainage_pct / 100)
             FROM pay_app_lines pal
             JOIN sov_lines sl ON sl.id = pal.sov_line_id
             WHERE pal.pay_app_id = pa.id
           ), 0) AS retention_held
    FROM pay_apps pa
    JOIN projects p ON p.id = pa.project_id
    WHERE p.user_id = $1
      AND EXTRACT(YEAR FROM COALESCE(pa.period_end, pa.created_at::date)) = $2
      AND pa.deleted_at IS NULL
    ORDER BY COALESCE(pa.period_end, pa.created_at::date) DESC
  `, [uid, year]);

  return r.rows;
}

module.exports = router;
