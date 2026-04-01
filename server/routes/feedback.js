const express = require('express');
const router = express.Router();

const { pool } = require('../../db');
const { auth, adminAuth } = require('../middleware/auth');
const { upload, rejectFile, MIME_SCREENSHOT } = require('../middleware/fileValidation');
const { logEvent } = require('../lib/logEvent');
const { fetchEmail } = require('../services/email');

// POST /api/support/request (public endpoint — no auth needed)
router.post('/api/support/request', async (req, res) => {
  const { email, name, issue } = req.body;
  if (!email || !issue) return res.status(400).json({ error: 'Email and issue description required' });
  try {
    await logEvent(null, 'support_request', { email, name: name || '', issue: issue.slice(0, 500) });
    // Notify admin via email
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.FROM_EMAIL || 'noreply@varshyl.com';
    const adminEmail = (process.env.ADMIN_EMAILS || '').split(',')[0].trim() || 'vaakapila@gmail.com';
    if (apiKey) {
      await fetchEmail('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: fromEmail,
          to: [adminEmail],
          subject: `Support Request — ${email}`,
          html: `<div style="font-family:sans-serif;padding:24px">
            <h2>Support Request</h2>
            <p><b>From:</b> ${name || 'Unknown'} &lt;${email}&gt;</p>
            <p><b>Issue:</b></p>
            <blockquote style="border-left:3px solid #2563eb;padding-left:12px;color:#334155">${issue}</blockquote>
            <p style="margin-top:24px"><a href="${process.env.APP_URL || 'https://constructinv.varshyl.com'}/?admin=1" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Open Admin Dashboard</a></p>
          </div>`
        })
      }).catch(e => console.error('[Support email]', e.message));
    }
    res.json({ ok: true });
  } catch(e) {
    console.error('[API Error]', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/feedback (with optional screenshot)
router.post('/api/feedback', auth, upload.single('screenshot'), async (req, res) => {
  const { category, message, page_context } = req.body;
  if (!message && !req.file) return res.status(400).json({ error: 'Message or screenshot required' });
  if (rejectFile(req, res, MIME_SCREENSHOT, 'screenshot')) return;
  try {
    const screenshotFilename = req.file ? req.file.filename : null;
    const r = await pool.query(
      'INSERT INTO feedback(user_id,category,message,screenshot_filename,page_context) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [req.user.id, category || 'other', message || null, screenshotFilename, page_context || null]
    );
    await logEvent(req.user.id, 'feedback_submitted', { category: category || 'other' });
    res.json({ ok: true, id: r.rows[0].id });
  } catch(e) {
    console.error('[API Error]', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/feedback (admin only)
router.get('/api/admin/feedback', adminAuth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT f.*, u.name as user_name, u.email as user_email
      FROM feedback f
      LEFT JOIN users u ON u.id = f.user_id
      ORDER BY f.created_at DESC
      LIMIT 200
    `);
    res.json(r.rows);
  } catch(e) {
    console.error('[API Error]', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
