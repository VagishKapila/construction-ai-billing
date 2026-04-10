'use strict';
const express = require('express');
const router = express.Router();
const { auth } = require('../../middleware/auth');
const db = require('../../../db');
const hubService = require('./hub.service');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'uploads');

// ENDPOINT 1: GET /api/projects/:id/hub/summary
router.get('/api/projects/:id/hub/summary', auth, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    if (!projectId || isNaN(projectId)) return res.status(400).json({ data: null, error: 'Invalid project ID' });
    const summary = await hubService.getHubSummary(projectId);
    res.json({ data: summary, error: null });
  } catch (err) {
    console.error('[Hub2] summary error:', err);
    res.status(500).json({ data: null, error: 'Failed to get hub summary' });
  }
});

// ENDPOINT 2: POST /api/hub/join-code/validate (no auth)
router.post('/api/hub/join-code/validate', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string') return res.status(400).json({ data: null, error: 'Code required' });
    const joinCode = await hubService.validateJoinCode(code.toUpperCase().trim());
    if (!joinCode) return res.status(404).json({ data: null, error: 'Invalid or expired join code' });
    res.json({ data: {
      project_address: joinCode.project_address,
      project_name: joinCode.project_name,
      gc_company: joinCode.gc_company,
      trade_type: joinCode.trade_type
    }, error: null });
  } catch (err) {
    console.error('[Hub2] join-code validate error:', err);
    res.status(500).json({ data: null, error: 'Validation failed' });
  }
});

// ENDPOINT 3: POST /api/hub/join-code/register (no auth)
router.post('/api/hub/join-code/register', async (req, res) => {
  try {
    const { code, company_name, email, password, trade_type } = req.body;
    if (!code || !email || !password || !company_name) {
      return res.status(400).json({ data: null, error: 'code, email, password, company_name required' });
    }
    if (password.length < 8) return res.status(400).json({ data: null, error: 'Password must be at least 8 characters' });

    const joinCode = await hubService.validateJoinCode(code.toUpperCase().trim());
    if (!joinCode) return res.status(404).json({ data: null, error: 'Invalid or expired join code' });

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows[0]) return res.status(409).json({ data: null, error: 'Email already registered. Please log in.' });

    const hash = await bcrypt.hash(password, 12);
    const newUser = await db.query(
      `INSERT INTO users (email, password_hash, company_name, user_role, company_trade, joined_via_code, email_verified, created_at)
       VALUES ($1, $2, $3, 'sub', $4, $5, true, NOW()) RETURNING id, email, company_name`,
      [email.toLowerCase(), hash, company_name, trade_type || joinCode.trade_type || null, code.toUpperCase()]
    );

    await db.query(
      'UPDATE project_join_codes SET used_at = NOW(), used_by = $1 WHERE code = $2',
      [newUser.rows[0].id, code.toUpperCase()]
    );

    const token = jwt.sign(
      { id: newUser.rows[0].id, email: newUser.rows[0].email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ data: { user: newUser.rows[0], token, project_id: joinCode.project_id }, error: null });
  } catch (err) {
    console.error('[Hub2] join-code register error:', err);
    res.status(500).json({ data: null, error: 'Registration failed' });
  }
});

// ENDPOINT 4: POST /api/projects/:id/hub/bulk-approve
router.post('/api/projects/:id/hub/bulk-approve', auth, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const { upload_ids } = req.body;
    if (!Array.isArray(upload_ids) || upload_ids.length === 0) {
      return res.status(400).json({ data: null, error: 'upload_ids array required' });
    }
    const ids = upload_ids.map(id => parseInt(id)).filter(id => !isNaN(id));
    const result = await db.query(
      `UPDATE hub_uploads SET status = 'approved', reviewed_at = NOW(), reviewed_by = $1
       WHERE id = ANY($2::int[]) AND project_id = $3 RETURNING id`,
      [req.user.id, ids, projectId]
    );
    res.json({ data: { approved_count: result.rows.length, ids: result.rows.map(r => r.id) }, error: null, message: `${result.rows.length} documents approved` });
  } catch (err) {
    console.error('[Hub2] bulk-approve error:', err);
    res.status(500).json({ data: null, error: 'Bulk approve failed' });
  }
});

// ENDPOINT 5: GET /api/projects/:id/hub/export-zip
router.get('/api/projects/:id/hub/export-zip', auth, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    let archiver;
    try { archiver = require('archiver'); } catch(e) {
      return res.status(500).json({ data: null, error: 'archiver not installed. Run: npm install archiver' });
    }
    const files = await hubService.getFilesForZip(projectId);
    const archive = archiver('zip', { zlib: { level: 9 } });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="project-${projectId}-hub-export.zip"`);
    archive.pipe(res);
    for (const file of files) {
      const filePath = path.join(UPLOADS_DIR, file.filename);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: `${file.trade_name}/${file.original_name || file.filename}` });
      }
    }
    archive.finalize();
  } catch (err) {
    console.error('[Hub2] export-zip error:', err);
    res.status(500).json({ data: null, error: 'ZIP export failed' });
  }
});

// ENDPOINT 6: POST /api/projects/:id/hub/close-out
router.post('/api/projects/:id/hub/close-out', auth, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    await db.query(
      'INSERT INTO hub_close_out_events (project_id, triggered_by, status) VALUES ($1, $2, $3)',
      [projectId, req.user.id, 'pending']
    );
    res.json({ data: { initiated: true }, error: null, message: 'Close-out initiated. ZIP will be emailed when ready.' });
  } catch (err) {
    console.error('[Hub2] close-out error:', err);
    res.status(500).json({ data: null, error: 'Close-out failed' });
  }
});

// ENDPOINT 7: GET /api/hub/sub-dashboard
router.get('/api/hub/sub-dashboard', auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT hu.*, pt.name as trade_name, p.address as project_address, p.name as project_name
      FROM hub_uploads hu
      JOIN project_trades pt ON pt.id = hu.trade_id
      JOIN projects p ON p.id = hu.project_id
      WHERE hu.uploaded_by_email = $1 OR pt.contact_email = $1
      ORDER BY hu.created_at DESC LIMIT 50
    `, [req.user.email]);
    res.json({ data: result.rows, error: null });
  } catch (err) {
    console.error('[Hub2] sub-dashboard error:', err);
    res.status(500).json({ data: null, error: 'Failed to load sub dashboard' });
  }
});

// ENDPOINT 8: POST /api/hub/inbound-email (no auth — Cloudflare webhook)
router.post('/api/hub/inbound-email', async (req, res) => {
  try {
    const { to, from, subject } = req.body;
    if (!to) return res.status(400).json({ data: null, error: 'Missing to address' });
    const alias = to.split('@')[0];
    const trade = await db.query(
      'SELECT * FROM project_trades WHERE email_alias = $1',
      [to.toLowerCase()]
    );
    if (!trade.rows[0]) return res.status(404).json({ data: null, error: 'No trade found for alias' });
    await db.query(
      `INSERT INTO hub_uploads (project_id, trade_id, doc_type, source, filename, original_name, status, uploaded_by_email)
       VALUES ($1, $2, 'other', 'email_ingest', $3, $4, 'pending', $5)`,
      [trade.rows[0].project_id, trade.rows[0].id, `email_${Date.now()}`, subject || 'Email document', from || 'unknown']
    );
    res.json({ data: { received: true }, error: null });
  } catch (err) {
    console.error('[Hub2] inbound-email error:', err);
    res.status(500).json({ data: null, error: 'Email ingestion failed' });
  }
});

// ENDPOINT 9: GET /api/projects/:id/hub/trades/:tradeId/score
router.get('/api/projects/:id/hub/trades/:tradeId/score', auth, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const result = await db.query(
      'SELECT * FROM vendor_trust_scores WHERE project_id = $1 ORDER BY id DESC LIMIT 1',
      [projectId]
    );
    res.json({ data: result.rows[0] || { score: 500, tier: 'silver', max_score: 763 }, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: 'Failed to get trust score' });
  }
});

// ENDPOINT 10: POST /api/projects/:id/hub/trades/:tradeId/early-pay-override
router.post('/api/projects/:id/hub/trades/:tradeId/early-pay-override', auth, async (req, res) => {
  try {
    const tradeId = parseInt(req.params.tradeId);
    const { enabled } = req.body;
    await db.query(
      'UPDATE project_trades SET gc_early_pay_override = $1 WHERE id = $2',
      [!!enabled, tradeId]
    );
    res.json({ data: { enabled: !!enabled }, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: 'Failed to update early pay override' });
  }
});

// ENDPOINT 11: GET /api/hub/vendor-matches/:sovLineId
router.get('/api/hub/vendor-matches/:sovLineId', auth, async (req, res) => {
  try {
    const sovLine = await db.query('SELECT description FROM sov_lines WHERE id = $1', [parseInt(req.params.sovLineId)]);
    if (!sovLine.rows[0]) return res.status(404).json({ data: null, error: 'SOV line not found' });
    const desc = sovLine.rows[0].description;
    const vendors = await db.query(
      `SELECT * FROM vendor_address_book
       WHERE owner_id = $1 AND (LOWER(trade_type) ILIKE $2 OR LOWER(company_name) ILIKE $2)
       LIMIT 5`,
      [req.user.id, `%${desc.substring(0, 15).toLowerCase()}%`]
    );
    res.json({ data: vendors.rows, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: 'Vendor match failed' });
  }
});

// ENDPOINT 12: POST /api/hub/vendor-book/import
router.post('/api/hub/vendor-book/import', auth, async (req, res) => {
  try {
    const { vendors } = req.body;
    if (!Array.isArray(vendors) || vendors.length === 0) {
      return res.status(400).json({ data: null, error: 'vendors array required' });
    }
    let imported = 0;
    for (const v of vendors) {
      if (!v.company_name) continue;
      await db.query(
        `INSERT INTO vendor_address_book (owner_id, company_name, contact_name, email, phone, trade_type, import_source)
         VALUES ($1, $2, $3, $4, $5, $6, 'ai_import')
         ON CONFLICT (owner_id, email) DO UPDATE SET company_name=EXCLUDED.company_name, updated_at=NOW()`,
        [req.user.id, v.company_name, v.contact_name||null, v.email||null, v.phone||null, v.trade_type||null]
      );
      imported++;
    }
    res.status(201).json({ data: { imported }, error: null, message: `${imported} vendors imported` });
  } catch (err) {
    console.error('[Hub2] vendor import error:', err);
    res.status(500).json({ data: null, error: 'Import failed' });
  }
});

module.exports = router;
