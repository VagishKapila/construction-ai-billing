/**
 * ConstructInvoice AI — Project Hub Routes (Phase 1)
 *
 * Trade management, document upload, approval workflow, and magic links.
 * All authenticated routes verify project ownership.
 * All file uploads saved to /app/uploads/ with hub_ prefix.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const { pool } = require('../../db');
const { auth } = require('../middleware/auth');
const { upload, rejectFile } = require('../middleware/fileValidation');
const { logEvent } = require('../lib/logEvent');

// Helper: generate secure token for magic links
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Helper: slugify trade name for email alias
function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// Helper: verify project ownership
async function verifyProjectOwnership(projectId, userId) {
  const result = await pool.query(
    'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
    [projectId, userId]
  );
  return result.rows.length > 0;
}

// ════════════════════════════════════════════════════════════════════════════
// TRADE MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════

// GET /api/projects/:id/hub/trades — List all trades for a project
router.get('/api/projects/:id/hub/trades', auth, async (req, res) => {
  try {
    const projectId = req.params.id;

    // Verify ownership
    const isOwner = await verifyProjectOwnership(projectId, req.user.id);
    if (!isOwner) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await pool.query(
      `SELECT id, project_id, name, company_name, contact_name, contact_email,
              magic_link_token, email_alias, status, invite_sent_at, created_at
       FROM project_trades
       WHERE project_id = $1
       ORDER BY created_at DESC`,
      [projectId]
    );

    res.json({ data: result.rows });
  } catch (e) {
    console.error('[HUB GET trades]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/projects/:id/hub/trades — Add a new trade
router.post('/api/projects/:id/hub/trades', auth, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { name, company_name, contact_name, contact_email } = req.body;

    // Validate required field
    if (!name) {
      return res.status(400).json({ error: 'Trade name is required' });
    }

    // Verify ownership
    const isOwner = await verifyProjectOwnership(projectId, req.user.id);
    if (!isOwner) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Generate magic link token and email alias
    const magicToken = generateToken();
    const emailSlug = slugify(name);
    const emailAlias = `${emailSlug}-${projectId}@hub.constructinv.com`;

    const result = await pool.query(
      `INSERT INTO project_trades(project_id, name, company_name, contact_name, contact_email,
                                  magic_link_token, email_alias, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, 'active')
       RETURNING *`,
      [projectId, name, company_name || null, contact_name || null, contact_email || null, magicToken, emailAlias]
    );

    await logEvent(req.user.id, 'hub_trade_added', {
      project_id: projectId,
      trade_id: result.rows[0].id,
      trade_name: name
    });

    res.json({ data: result.rows[0] });
  } catch (e) {
    console.error('[HUB POST trades]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/projects/:id/hub/trades/:tradeId — Update a trade
router.put('/api/projects/:id/hub/trades/:tradeId', auth, async (req, res) => {
  try {
    const projectId = req.params.id;
    const tradeId = req.params.tradeId;
    const { name, company_name, contact_name, contact_email } = req.body;

    // Verify ownership
    const isOwner = await verifyProjectOwnership(projectId, req.user.id);
    if (!isOwner) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Verify trade belongs to project
    const tradeCheck = await pool.query(
      'SELECT id FROM project_trades WHERE id = $1 AND project_id = $2',
      [tradeId, projectId]
    );
    if (tradeCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    const result = await pool.query(
      `UPDATE project_trades
       SET name = COALESCE($1, name),
           company_name = COALESCE($2, company_name),
           contact_name = COALESCE($3, contact_name),
           contact_email = COALESCE($4, contact_email)
       WHERE id = $5
       RETURNING *`,
      [name, company_name, contact_name, contact_email, tradeId]
    );

    await logEvent(req.user.id, 'hub_trade_updated', {
      project_id: projectId,
      trade_id: tradeId
    });

    res.json({ data: result.rows[0] });
  } catch (e) {
    console.error('[HUB PUT trades]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// DOCUMENT INBOX & UPLOADS
// ════════════════════════════════════════════════════════════════════════════

// GET /api/projects/:id/hub/inbox — List all uploads for a project
router.get('/api/projects/:id/hub/inbox', auth, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { status = 'all', doc_type } = req.query;

    // Verify ownership
    const isOwner = await verifyProjectOwnership(projectId, req.user.id);
    if (!isOwner) {
      return res.status(404).json({ error: 'Project not found' });
    }

    let query = `
      SELECT hu.*, pt.name as trade_name, pt.company_name
      FROM hub_uploads hu
      LEFT JOIN project_trades pt ON pt.id = hu.trade_id
      WHERE hu.project_id = $1
    `;
    const params = [projectId];

    if (status !== 'all') {
      query += ` AND hu.status = $${params.length + 1}`;
      params.push(status);
    }

    if (doc_type) {
      query += ` AND hu.doc_type = $${params.length + 1}`;
      params.push(doc_type);
    }

    query += ' ORDER BY hu.created_at DESC';

    const result = await pool.query(query, params);

    res.json({ data: result.rows });
  } catch (e) {
    console.error('[HUB GET inbox]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/projects/:id/hub/uploads — Upload a document
router.post('/api/projects/:id/hub/uploads', auth, upload.single('file'), async (req, res) => {
  try {
    const projectId = req.params.id;
    const { trade_id, doc_type = 'other', amount, notes, uploaded_by } = req.body;

    // Verify file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Verify ownership
    const isOwner = await verifyProjectOwnership(projectId, req.user.id);
    if (!isOwner) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Project not found' });
    }

    // Verify trade exists if provided
    if (trade_id) {
      const tradeCheck = await pool.query(
        'SELECT id FROM project_trades WHERE id = $1 AND project_id = $2',
        [trade_id, projectId]
      );
      if (tradeCheck.rows.length === 0) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Trade not found' });
      }
    }

    // Rename file with hub_ prefix
    const newFilename = `hub_${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;
    const newPath = path.join('uploads', newFilename);
    fs.renameSync(req.file.path, newPath);

    const result = await pool.query(
      `INSERT INTO hub_uploads(project_id, trade_id, filename, original_name, file_size,
                               mime_type, doc_type, amount, source, uploaded_by, notes, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'web_app', $9, $10, 'pending')
       RETURNING *`,
      [
        projectId,
        trade_id || null,
        newFilename,
        req.file.originalname,
        req.file.size,
        req.file.mimetype,
        doc_type,
        amount || null,
        uploaded_by || 'You',
        notes || null
      ]
    );

    await logEvent(req.user.id, 'hub_upload_created', {
      project_id: projectId,
      upload_id: result.rows[0].id,
      doc_type: doc_type,
      file_size: req.file.size
    });

    res.json({ data: result.rows[0] });
  } catch (e) {
    console.error('[HUB POST uploads]', e.message);
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    res.status(500).json({ error: e.message });
  }
});

// GET /api/projects/:id/hub/uploads/:uploadId — Get single upload with comments
router.get('/api/projects/:id/hub/uploads/:uploadId', auth, async (req, res) => {
  try {
    const projectId = req.params.id;
    const uploadId = req.params.uploadId;

    // Verify ownership
    const isOwner = await verifyProjectOwnership(projectId, req.user.id);
    if (!isOwner) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const uploadResult = await pool.query(
      `SELECT hu.*, pt.name as trade_name, pt.company_name
       FROM hub_uploads hu
       LEFT JOIN project_trades pt ON pt.id = hu.trade_id
       WHERE hu.id = $1 AND hu.project_id = $2`,
      [uploadId, projectId]
    );

    if (uploadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    const commentsResult = await pool.query(
      `SELECT id, upload_id, user_id, author_name, text, is_rfi_reply, is_rejection, created_at
       FROM hub_comments
       WHERE upload_id = $1
       ORDER BY created_at ASC`,
      [uploadId]
    );

    const upload = uploadResult.rows[0];
    res.json({ data: { ...upload, comments: commentsResult.rows } });
  } catch (e) {
    console.error('[HUB GET upload]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/projects/:id/hub/uploads/:uploadId — Update status (approve/reject)
router.put('/api/projects/:id/hub/uploads/:uploadId', auth, async (req, res) => {
  try {
    const projectId = req.params.id;
    const uploadId = req.params.uploadId;
    const { action, rejection_reason } = req.body;

    // Verify ownership
    const isOwner = await verifyProjectOwnership(projectId, req.user.id);
    if (!isOwner) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get the upload
    const uploadResult = await pool.query(
      'SELECT * FROM hub_uploads WHERE id = $1 AND project_id = $2',
      [uploadId, projectId]
    );

    if (uploadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    const upload = uploadResult.rows[0];

    if (action === 'approve') {
      const result = await pool.query(
        `UPDATE hub_uploads
         SET status = 'approved', approved_by = $1, approved_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [req.user.id, uploadId]
      );

      await logEvent(req.user.id, 'hub_upload_approved', {
        project_id: projectId,
        upload_id: uploadId
      });

      res.json({ data: result.rows[0] });
    } else if (action === 'reject') {
      if (!rejection_reason) {
        return res.status(400).json({ error: 'rejection_reason is required' });
      }

      // Mark original as rejected
      const updateResult = await pool.query(
        `UPDATE hub_uploads
         SET status = 'rejected', rejection_reason = $1
         WHERE id = $2
         RETURNING *`,
        [rejection_reason, uploadId]
      );

      // Create rejection comment
      await pool.query(
        `INSERT INTO hub_comments(upload_id, user_id, author_name, text, is_rejection)
         VALUES($1, $2, $3, $4, true)`,
        [uploadId, req.user.id, 'System', rejection_reason]
      );

      // Create re-upload slot (new upload with parent_upload_id set)
      const newUploadResult = await pool.query(
        `INSERT INTO hub_uploads(project_id, trade_id, filename, original_name, file_size,
                                 mime_type, doc_type, amount, parent_upload_id, status, source,
                                 uploaded_by, notes, version)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11, $12,
                (SELECT COALESCE(MAX(version), 1) + 1 FROM hub_uploads WHERE parent_upload_id = $9 OR id = $9))
         RETURNING *`,
        [
          upload.project_id,
          upload.trade_id,
          upload.filename,
          upload.original_name,
          upload.file_size,
          upload.mime_type,
          upload.doc_type,
          upload.amount,
          uploadId,
          'web_app',
          upload.uploaded_by,
          `Re-upload after rejection: ${rejection_reason}`
        ]
      );

      await logEvent(req.user.id, 'hub_upload_rejected', {
        project_id: projectId,
        upload_id: uploadId,
        reupload_slot_id: newUploadResult.rows[0].id
      });

      res.json({ data: updateResult.rows[0], reupload_slot: newUploadResult.rows[0] });
    } else {
      res.status(400).json({ error: 'action must be "approve" or "reject"' });
    }
  } catch (e) {
    console.error('[HUB PUT upload status]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/projects/:id/hub/uploads/:uploadId/comment — Add a comment
router.post('/api/projects/:id/hub/uploads/:uploadId/comment', auth, async (req, res) => {
  try {
    const projectId = req.params.id;
    const uploadId = req.params.uploadId;
    const { text, is_rfi_reply = false } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    // Verify ownership
    const isOwner = await verifyProjectOwnership(projectId, req.user.id);
    if (!isOwner) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Verify upload exists
    const uploadCheck = await pool.query(
      'SELECT id FROM hub_uploads WHERE id = $1 AND project_id = $2',
      [uploadId, projectId]
    );
    if (uploadCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    const result = await pool.query(
      `INSERT INTO hub_comments(upload_id, user_id, author_name, text, is_rfi_reply)
       VALUES($1, $2, $3, $4, $5)
       RETURNING *`,
      [uploadId, req.user.id, req.user.name || 'Unknown', text, is_rfi_reply]
    );

    await logEvent(req.user.id, 'hub_comment_created', {
      project_id: projectId,
      upload_id: uploadId,
      is_rfi_reply: is_rfi_reply
    });

    res.json({ data: result.rows[0] });
  } catch (e) {
    console.error('[HUB POST comment]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/projects/:id/hub/uploads/:uploadId/download — Download the file
router.get('/api/projects/:id/hub/uploads/:uploadId/download', auth, async (req, res) => {
  try {
    const projectId = req.params.id;
    const uploadId = req.params.uploadId;

    // Verify ownership
    const isOwner = await verifyProjectOwnership(projectId, req.user.id);
    if (!isOwner) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await pool.query(
      'SELECT filename, original_name FROM hub_uploads WHERE id = $1 AND project_id = $2',
      [uploadId, projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    const { filename, original_name } = result.rows[0];
    const filePath = path.join('uploads', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.download(filePath, original_name);
  } catch (e) {
    console.error('[HUB GET download]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// TEAM ROLES (3 fixed roles per project)
// ════════════════════════════════════════════════════════════════════════════

// GET /api/projects/:id/hub/team — Get team roles for project
router.get('/api/projects/:id/hub/team', auth, async (req, res) => {
  try {
    const projectId = req.params.id;

    // Verify ownership
    const isOwner = await verifyProjectOwnership(projectId, req.user.id);
    if (!isOwner) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await pool.query(
      `SELECT role, user_id FROM hub_team_roles WHERE project_id = $1`,
      [projectId]
    );

    // Build object with roles
    const teamRoles = {
      office: null,
      pm: null,
      superintendent: null
    };

    result.rows.forEach(row => {
      if (teamRoles.hasOwnProperty(row.role)) {
        teamRoles[row.role] = row.user_id;
      }
    });

    res.json({ data: teamRoles });
  } catch (e) {
    console.error('[HUB GET team]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/projects/:id/hub/team — Upsert team roles
router.put('/api/projects/:id/hub/team', auth, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { office, pm, superintendent } = req.body;

    // Verify ownership
    const isOwner = await verifyProjectOwnership(projectId, req.user.id);
    if (!isOwner) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const roles = { office, pm, superintendent };

    // Upsert each role
    for (const [role, userId] of Object.entries(roles)) {
      if (userId === null) {
        // Delete if set to null
        await pool.query(
          'DELETE FROM hub_team_roles WHERE project_id = $1 AND role = $2',
          [projectId, role]
        );
      } else {
        // Upsert
        await pool.query(
          `INSERT INTO hub_team_roles(project_id, user_id, role)
           VALUES($1, $2, $3)
           ON CONFLICT (project_id, role) DO UPDATE SET user_id = $2`,
          [projectId, userId, role]
        );
      }
    }

    await logEvent(req.user.id, 'hub_team_updated', {
      project_id: projectId
    });

    res.json({ data: roles });
  } catch (e) {
    console.error('[HUB PUT team]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// MAGIC LINKS (NO AUTH — Sub-facing)
// ════════════════════════════════════════════════════════════════════════════

// GET /api/hub/magic/:token — Get hub info for a trade (no auth required)
router.get('/api/hub/magic/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const tradeResult = await pool.query(
      `SELECT pt.id, pt.project_id, pt.name, pt.company_name, p.name as project_name
       FROM project_trades pt
       JOIN projects p ON p.id = pt.project_id
       WHERE pt.magic_link_token = $1 AND pt.status = 'active'`,
      [token]
    );

    if (tradeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Magic link not found or expired' });
    }

    const trade = tradeResult.rows[0];

    // Get uploads for this trade
    const uploadsResult = await pool.query(
      `SELECT id, filename, original_name, doc_type, status, amount, created_at
       FROM hub_uploads
       WHERE trade_id = $1
       ORDER BY created_at DESC`,
      [trade.id]
    );

    res.json({
      data: {
        trade_id: trade.id,
        project_id: trade.project_id,
        project_name: trade.project_name,
        trade_name: trade.name,
        company_name: trade.company_name,
        uploads: uploadsResult.rows
      }
    });
  } catch (e) {
    console.error('[HUB GET magic]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/hub/magic/:token/upload — Sub uploads a document via magic link
router.post('/api/hub/magic/:token/upload', upload.single('file'), async (req, res) => {
  try {
    const { token } = req.params;
    const { doc_type = 'other', amount, notes } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Verify magic link token
    const tradeResult = await pool.query(
      `SELECT id, project_id FROM project_trades
       WHERE magic_link_token = $1 AND status = 'active'`,
      [token]
    );

    if (tradeResult.rows.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Magic link not found or expired' });
    }

    const trade = tradeResult.rows[0];
    const uploadedBy = req.body.company_name || 'Anonymous Sub';

    // Rename file with hub_ prefix
    const newFilename = `hub_${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;
    const newPath = path.join('uploads', newFilename);
    fs.renameSync(req.file.path, newPath);

    const result = await pool.query(
      `INSERT INTO hub_uploads(project_id, trade_id, filename, original_name, file_size,
                               mime_type, doc_type, amount, source, uploaded_by, notes, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'magic_link', $9, $10, 'pending')
       RETURNING *`,
      [
        trade.project_id,
        trade.id,
        newFilename,
        req.file.originalname,
        req.file.size,
        req.file.mimetype,
        doc_type,
        amount || null,
        uploadedBy,
        notes || null
      ]
    );

    await logEvent(null, 'hub_magic_upload', {
      project_id: trade.project_id,
      upload_id: result.rows[0].id,
      trade_id: trade.id,
      doc_type: doc_type
    });

    res.json({ data: result.rows[0], message: 'Upload received. Awaiting approval.' });
  } catch (e) {
    console.error('[HUB POST magic upload]', e.message);
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// HUB STATS (for sidebar badge)
// ════════════════════════════════════════════════════════════════════════════

// GET /api/projects/:id/hub/stats — Get hub stats for a project
router.get('/api/projects/:id/hub/stats', auth, async (req, res) => {
  try {
    const projectId = req.params.id;

    // Verify ownership
    const isOwner = await verifyProjectOwnership(projectId, req.user.id);
    if (!isOwner) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM hub_uploads WHERE project_id = $1 AND status = 'pending')::int as pending_count,
         (SELECT COUNT(*) FROM hub_uploads WHERE project_id = $1 AND status = 'approved')::int as approved_count,
         (SELECT COUNT(*) FROM hub_uploads WHERE project_id = $1 AND status = 'rejected')::int as rejected_count,
         (SELECT COUNT(*) FROM project_trades WHERE project_id = $1 AND status = 'active')::int as trade_count`,
      [projectId]
    );

    res.json({ data: result.rows[0] });
  } catch (e) {
    console.error('[HUB GET stats]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
