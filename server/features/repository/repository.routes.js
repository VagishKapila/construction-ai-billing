'use strict';
const express = require('express');
const router = express.Router();
const { auth } = require('../../middleware/auth');
const { pool } = require('../../../db');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', '..', 'uploads');

// ENDPOINT 1: GET /api/projects/:id/repository
// Returns all hub_uploads for a project with trade info, grouped by doc_type
router.get('/api/projects/:id/repository', auth, async (req, res) => {
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

    // Get all hub_uploads with trade info
    const uploads = await pool.query(
      `SELECT
        hu.id, hu.filename, hu.original_name, hu.doc_type, hu.status,
        hu.source, hu.uploaded_by, hu.approved_at, hu.created_at,
        hu.rejection_reason, hu.amount,
        pt.name as trade_name, pt.id as trade_id
      FROM hub_uploads hu
      LEFT JOIN project_trades pt ON hu.trade_id = pt.id
      WHERE hu.project_id = $1
      ORDER BY hu.created_at DESC`,
      [projectId]
    );

    // Group by doc_type and count by status
    const grouped = {};
    const byStatus = { pending: 0, approved: 0, rejected: 0 };

    uploads.rows.forEach(row => {
      if (!grouped[row.doc_type]) {
        grouped[row.doc_type] = [];
      }
      grouped[row.doc_type].push(row);
      if (row.status) byStatus[row.status]++;
    });

    const summary = {
      total: uploads.rows.length,
      approved: byStatus.approved,
      pending: byStatus.pending,
      rejected: byStatus.rejected,
      by_type: Object.keys(grouped).reduce((acc, type) => {
        acc[type] = grouped[type].length;
        return acc;
      }, {})
    };

    res.json({ data: { uploads: uploads.rows, summary, grouped }, error: null });
  } catch (err) {
    console.error('[Repository] repository error:', err);
    res.status(500).json({ data: null, error: err.message, message: 'Failed to fetch repository' });
  }
});

// ENDPOINT 2: GET /api/projects/:id/repository/download/:uploadId
// Streams a file from the uploads directory to the client
router.get('/api/projects/:id/repository/download/:uploadId', auth, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const uploadId = parseInt(req.params.uploadId);

    if (!projectId || isNaN(projectId) || !uploadId || isNaN(uploadId)) {
      return res.status(400).json({ error: 'Invalid project ID or upload ID' });
    }

    // Verify user owns project
    const project = await pool.query('SELECT id, user_id FROM projects WHERE id = $1', [projectId]);
    if (!project.rows[0] || project.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Get upload record
    const upload = await pool.query(
      'SELECT filename, original_name FROM hub_uploads WHERE id = $1 AND project_id = $2',
      [uploadId, projectId]
    );
    if (!upload.rows[0]) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    const { filename, original_name } = upload.rows[0];
    const filePath = path.join(UPLOADS_DIR, filename);

    // Verify file exists and is within UPLOADS_DIR (security)
    const resolvedPath = path.resolve(filePath);
    const resolvedUploadsDir = path.resolve(UPLOADS_DIR);
    if (!resolvedPath.startsWith(resolvedUploadsDir)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Set download header
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(original_name || filename)}"`);
    res.download(filePath, original_name || filename);
  } catch (err) {
    console.error('[Repository] download error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ENDPOINT 3: POST /api/projects/:id/close-out
// Close-out trigger — creates ZIP with all approved documents
router.post('/api/projects/:id/close-out', auth, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ data: null, error: 'Invalid project ID', message: 'Project ID required' });
    }

    // Verify user owns project
    const projectRes = await pool.query(
      'SELECT id, user_id, status FROM projects WHERE id = $1',
      [projectId]
    );
    if (!projectRes.rows[0] || projectRes.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ data: null, error: 'Forbidden', message: 'You do not have access to this project' });
    }

    // Validate: all SOV lines 100% billed
    const sovCheck = await pool.query(
      `SELECT COUNT(*) as count FROM sov_lines
       WHERE project_id = $1 AND work_completed < scheduled_value`,
      [projectId]
    );
    if (sovCheck.rows[0].count > 0) {
      return res.status(400).json({
        data: null,
        error: 'Incomplete work',
        message: 'All SOV lines must be 100% complete before close-out. Incomplete lines found.'
      });
    }

    // Validate: at least one unconditional lien waiver per trade
    const trades = await pool.query(
      'SELECT DISTINCT trade_id FROM hub_uploads WHERE project_id = $1 AND trade_id IS NOT NULL',
      [projectId]
    );

    for (const trade of trades.rows) {
      const lienCheck = await pool.query(
        `SELECT COUNT(*) as count FROM hub_uploads
         WHERE project_id = $1 AND trade_id = $2 AND doc_type = 'lien_waiver'
         AND notes LIKE '%unconditional%' AND status = 'approved'`,
        [projectId, trade.trade_id]
      );
      if (lienCheck.rows[0].count === 0) {
        const tradeName = await pool.query(
          'SELECT name FROM project_trades WHERE id = $1',
          [trade.trade_id]
        );
        return res.status(400).json({
          data: null,
          error: 'Missing lien waiver',
          message: `Unconditional lien waiver required from ${tradeName.rows[0]?.name || 'trade'}. Please ensure all trades have submitted approved unconditional lien waivers before close-out.`
        });
      }
    }

    // Get all approved hub_uploads
    const uploads = await pool.query(
      `SELECT id, filename, original_name FROM hub_uploads
       WHERE project_id = $1 AND status = 'approved'
       ORDER BY created_at ASC`,
      [projectId]
    );

    // Create ZIP
    const timestamp = Date.now();
    const zipFilename = `closeout-${projectId}-${timestamp}.zip`;
    const zipPath = path.join(UPLOADS_DIR, zipFilename);

    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    let filesAdded = 0;
    for (const upload of uploads.rows) {
      const filePath = path.join(UPLOADS_DIR, upload.filename);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: upload.original_name || upload.filename });
        filesAdded++;
      }
    }

    await archive.finalize();

    // Wait for stream to finish
    await new Promise((resolve, reject) => {
      output.on('finish', resolve);
      output.on('error', reject);
      archive.on('error', reject);
    });

    // Insert close-out event record
    const closeoutRes = await pool.query(
      `INSERT INTO hub_close_out_events (project_id, zip_filename, docs_included, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, zip_filename, docs_included, created_at`,
      [projectId, zipFilename, filesAdded]
    );

    // Update project status to completed if not already
    await pool.query(
      `UPDATE projects SET status = 'completed', completed_at = NOW()
       WHERE id = $1 AND status != 'completed'`,
      [projectId]
    );

    const downloadUrl = `/api/projects/${projectId}/repository/download-closeout/${closeoutRes.rows[0].id}`;

    res.json({
      data: {
        zip_filename: zipFilename,
        download_url: downloadUrl,
        docs_included: filesAdded,
        pay_apps_included: 0, // Could be enhanced to include pay apps
        created_at: closeoutRes.rows[0].created_at
      },
      error: null
    });
  } catch (err) {
    console.error('[Repository] close-out error:', err);
    res.status(500).json({ data: null, error: err.message, message: 'Failed to create close-out package' });
  }
});

// ENDPOINT 4: GET /api/projects/:id/close-out/status
// Returns latest close-out event for project if any
router.get('/api/projects/:id/close-out/status', auth, async (req, res) => {
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

    // Get latest close-out event
    const closeout = await pool.query(
      `SELECT id, zip_filename, docs_included, created_at FROM hub_close_out_events
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [projectId]
    );

    if (!closeout.rows[0]) {
      return res.json({ data: null, error: null });
    }

    res.json({ data: closeout.rows[0], error: null });
  } catch (err) {
    console.error('[Repository] close-out status error:', err);
    res.status(500).json({ data: null, error: err.message, message: 'Failed to fetch close-out status' });
  }
});

// ENDPOINT 5: GET /api/projects/:id/repository/download-closeout/:closeoutId
// Download a previously generated close-out ZIP
router.get('/api/projects/:id/repository/download-closeout/:closeoutId', auth, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const closeoutId = parseInt(req.params.closeoutId);

    if (!projectId || isNaN(projectId) || !closeoutId || isNaN(closeoutId)) {
      return res.status(400).json({ error: 'Invalid IDs' });
    }

    // Verify user owns project
    const project = await pool.query('SELECT id, user_id FROM projects WHERE id = $1', [projectId]);
    if (!project.rows[0] || project.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Get close-out record
    const closeout = await pool.query(
      'SELECT zip_filename FROM hub_close_out_events WHERE id = $1 AND project_id = $2',
      [closeoutId, projectId]
    );
    if (!closeout.rows[0]) {
      return res.status(404).json({ error: 'Close-out package not found' });
    }

    const zipPath = path.join(UPLOADS_DIR, closeout.rows[0].zip_filename);

    // Verify file exists and is within UPLOADS_DIR
    const resolvedPath = path.resolve(zipPath);
    const resolvedUploadsDir = path.resolve(UPLOADS_DIR);
    if (!resolvedPath.startsWith(resolvedUploadsDir)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!fs.existsSync(zipPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="closeout-${projectId}.zip"`);
    res.download(zipPath);
  } catch (err) {
    console.error('[Repository] download-closeout error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
