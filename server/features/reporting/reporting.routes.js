'use strict';
const express = require('express');
const router = express.Router();
const { auth } = require('../../middleware/auth');
const { pool } = require('../../../db');

// ENDPOINT 1: GET /api/projects/:id/hub-reports
// Returns reporting data for a project
router.get('/api/projects/:id/hub-reports', auth, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ data: null, error: 'Invalid project ID', message: 'Project ID required' });
    }

    // Verify user owns project
    const project = await pool.query('SELECT id, user_id FROM projects WHERE id = $1', [projectId]);
    if (!project.rows[0] || project.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ data: null, error: 'Forbidden', message: 'You do not have access to this project' });
    }

    // Get documents by trade
    const docsByTrade = await pool.query(
      `SELECT pt.name as trade_name, COUNT(hu.id) as count
       FROM project_trades pt
       LEFT JOIN hub_uploads hu ON pt.id = hu.trade_id
       WHERE pt.project_id = $1
       GROUP BY pt.id, pt.name
       ORDER BY count DESC`,
      [projectId]
    );

    // Get rejection reasons (from vendor_trust_events)
    const rejectionReasons = await pool.query(
      `SELECT rejection_category as category, COUNT(*) as count
       FROM vendor_trust_events
       WHERE event_type = 'rejected'
       AND upload_id IN (SELECT id FROM hub_uploads WHERE project_id = $1)
       GROUP BY rejection_category
       ORDER BY count DESC`,
      [projectId]
    );

    // Get trust score history for last 90 days
    const trustScoreHistory = await pool.query(
      `SELECT
        vte.created_at::DATE as date,
        vts.score_current as score,
        pt.name as trade_name
       FROM vendor_trust_events vte
       JOIN vendor_trust_scores vts ON vte.vendor_trust_score_id = vts.id
       JOIN project_trades pt ON vts.trade_id = pt.id
       WHERE pt.project_id = $1
       AND vte.created_at >= NOW() - INTERVAL '90 days'
       ORDER BY date ASC, pt.name ASC`,
      [projectId]
    );

    // Get summary stats
    const allUploads = await pool.query(
      `SELECT status, COUNT(*) as count FROM hub_uploads
       WHERE project_id = $1
       GROUP BY status`,
      [projectId]
    );

    const summaryByStatus = {};
    let totalDocs = 0;
    allUploads.rows.forEach(row => {
      summaryByStatus[row.status] = parseInt(row.count);
      totalDocs += parseInt(row.count);
    });

    const totalTrades = await pool.query(
      'SELECT COUNT(DISTINCT id) as count FROM project_trades WHERE project_id = $1',
      [projectId]
    );

    const summary = {
      total_docs: totalDocs,
      approved: summaryByStatus.approved || 0,
      pending: summaryByStatus.pending || 0,
      rejected: summaryByStatus.rejected || 0,
      total_trades: parseInt(totalTrades.rows[0].count)
    };

    res.json({
      data: {
        docs_by_trade: docsByTrade.rows,
        rejection_reasons: rejectionReasons.rows,
        trust_score_history: trustScoreHistory.rows,
        summary
      },
      error: null
    });
  } catch (err) {
    console.error('[Reporting] hub-reports error:', err);
    res.status(500).json({ data: null, error: err.message, message: 'Failed to fetch hub reports' });
  }
});

// ENDPOINT 2: GET /api/projects/:id/hub-reports/export
// Export report as CSV
router.get('/api/projects/:id/hub-reports/export', auth, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Verify user owns project
    const project = await pool.query('SELECT id, user_id FROM projects WHERE id = $1', [projectId]);
    if (!project.rows[0] || project.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Get all hub_uploads
    const uploads = await pool.query(
      `SELECT
        pt.name as trade,
        hu.doc_type,
        hu.original_name as filename,
        hu.status,
        hu.uploaded_at,
        hu.approved_at,
        hu.rejection_reason as rejection_category
       FROM hub_uploads hu
       LEFT JOIN project_trades pt ON hu.trade_id = pt.id
       WHERE hu.project_id = $1
       ORDER BY hu.created_at DESC`,
      [projectId]
    );

    // Build CSV
    const headers = ['Trade', 'Document Type', 'Filename', 'Status', 'Uploaded At', 'Approved At', 'Rejection Reason'];
    const rows = uploads.rows.map(row => [
      row.trade || 'N/A',
      row.doc_type || 'other',
      row.filename || '',
      row.status || 'pending',
      row.uploaded_at ? new Date(row.uploaded_at).toISOString() : '',
      row.approved_at ? new Date(row.approved_at).toISOString() : '',
      row.rejection_category || ''
    ]);

    // Escape CSV values
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csv = [
      headers.map(escapeCsv).join(','),
      ...rows.map(row => row.map(escapeCsv).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="hub-report-${projectId}-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[Reporting] export error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
