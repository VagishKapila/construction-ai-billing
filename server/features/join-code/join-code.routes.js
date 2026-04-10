'use strict';
const express = require('express');
const router = express.Router();
const { auth } = require('../../middleware/auth');
const { pool: db } = require('../../../db');
const crypto = require('crypto');

// POST /api/projects/:id/join-code — GC generates join code for a project
router.post('/api/projects/:id/join-code', auth, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    if (!projectId || isNaN(projectId)) return res.status(400).json({ data: null, error: 'Invalid project ID' });
    const { trade_type, expires_days } = req.body;

    const project = await db.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, req.user.id]
    );
    if (!project.rows[0]) return res.status(404).json({ data: null, error: 'Project not found' });

    const address = project.rows[0].address || 'PRJ';
    const slug = address.replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 3).padEnd(3, 'X');
    const year = new Date().getFullYear();
    const random = crypto.randomBytes(2).toString('hex').toUpperCase();
    const code = `${slug}-${year}-${random}`;

    const expiresAt = expires_days ? new Date(Date.now() + parseInt(expires_days) * 86400000) : null;

    const result = await db.query(
      `INSERT INTO project_join_codes (project_id, code, trade_type, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [projectId, code, trade_type || null, req.user.id, expiresAt]
    );

    const baseUrl = process.env.BASE_URL || 'https://constructinv.varshyl.com';
    const joinUrl = `${baseUrl}/join.html?code=${code}`;

    res.status(201).json({ data: { ...result.rows[0], join_url: joinUrl }, error: null });
  } catch (err) {
    console.error('[JoinCode] generate error:', err);
    res.status(500).json({ data: null, error: 'Failed to generate join code' });
  }
});

// GET /api/projects/:id/join-codes — list all join codes for a project
router.get('/api/projects/:id/join-codes', auth, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const result = await db.query(
      `SELECT jc.*, u.email as used_by_email, u.company_name as used_by_company
       FROM project_join_codes jc
       LEFT JOIN users u ON u.id = jc.used_by
       WHERE jc.project_id = $1 AND jc.created_by = $2
       ORDER BY jc.created_at DESC`,
      [projectId, req.user.id]
    );
    res.json({ data: result.rows, error: null });
  } catch (err) {
    console.error('[JoinCode] list error:', err);
    res.status(500).json({ data: null, error: 'Failed to list join codes' });
  }
});

// DELETE /api/join-codes/:code — deactivate a join code
router.delete('/api/join-codes/:code', auth, async (req, res) => {
  try {
    await db.query(
      'UPDATE project_join_codes SET is_active = false WHERE code = $1 AND created_by = $2',
      [req.params.code, req.user.id]
    );
    res.json({ data: { deactivated: true }, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: 'Failed to deactivate code' });
  }
});

module.exports = router;
