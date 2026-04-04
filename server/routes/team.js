const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const { pool } = require('../../db');
const { auth } = require('../middleware/auth');
const { logEvent } = require('../lib/logEvent');
const { fetchEmail } = require('../services/email');

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function sendTeamInviteEmail(toEmail, toName, inviter, token) {
  const apiKey = process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || 'noreply@varshyl.com';
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  if (!apiKey) {
    console.log(`[DEV] Team invite for ${toEmail}: ${appUrl}/api/auth/accept-invite/${token}`);
    return;
  }
  const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
    <h2 style="color:#2563eb">You've been invited to Construction AI Billing</h2>
    <p>Hi ${toName},</p>
    <p>${inviter.name} (${inviter.email}) has added you to their team on Construction AI Billing.</p>
    <a href="${appUrl}/api/auth/accept-invite/${token}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0">Accept Invitation →</a>
    <p style="color:#888;font-size:12px">If you didn't expect this invitation, you can ignore this email.</p>
  </div>`;
  const isResend = !!process.env.RESEND_API_KEY;
  const payload = isResend
    ? { from: fromEmail, to: [toEmail], subject: `${inviter.name} invited you to Construction AI Billing`, html }
    : {
      personalizations: [{ to: [{ email: toEmail }] }], from: { email: fromEmail },
      subject: `${inviter.name} invited you to Construction AI Billing`,
      content: [{ type: 'text/html', value: html }]
    };
  await fetchEmail(isResend ? 'https://api.resend.com/emails' : 'https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
}

// GET /api/team
router.get('/api/team', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM team_members WHERE owner_user_id=$1 ORDER BY created_at', [req.user.id]);
  res.json(r.rows);
});

// POST /api/team
router.post('/api/team', auth, async (req, res) => {
  const { email, name, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const validRoles = ['admin', 'accountant', 'executive', 'pm', 'field'];
  if (role && !validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  try {
    const inviteToken = generateToken();
    const r = await pool.query(
      'INSERT INTO team_members(owner_user_id,email,name,role,invite_token) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [req.user.id, email, name || null, role || 'field', inviteToken]
    );
    // Send invite email (non-blocking)
    const inviter = (await pool.query('SELECT name,email FROM users WHERE id=$1', [req.user.id])).rows[0];
    sendTeamInviteEmail(email, name || email, inviter, inviteToken).catch(e => console.error('Invite email error:', e.message));
    await logEvent(req.user.id, 'team_member_invited', { email, role: role || 'field' });
    res.json(r.rows[0]);
  } catch(e) {
    if (e.code === '23505') return res.status(400).json({ error: 'This email is already on your team' });
    console.error('[API Error]', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/team/:id
router.put('/api/team/:id', auth, async (req, res) => {
  const { name, role } = req.body;
  const r = await pool.query(
    'UPDATE team_members SET name=COALESCE($1,name), role=COALESCE($2,role) WHERE id=$3 AND owner_user_id=$4 RETURNING *',
    [name || null, role || null, req.params.id, req.user.id]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(r.rows[0]);
});

// DELETE /api/team/:id
router.delete('/api/team/:id', auth, async (req, res) => {
  const r = await pool.query('DELETE FROM team_members WHERE id=$1 AND owner_user_id=$2 RETURNING *', [req.params.id, req.user.id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
  await logEvent(req.user.id, 'team_member_removed', { email: r.rows[0].email });
  res.json({ ok: true });
});

// Accept team invite — sets invite_accepted=true on the team_members row
router.get('/api/auth/accept-invite/:token', async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE team_members SET invite_accepted=TRUE
       WHERE invite_token=$1 AND invite_accepted=FALSE
         AND created_at > NOW() - INTERVAL '7 days'
       RETURNING *`,
      [req.params.token]
    );
    if (!r.rows[0]) return res.redirect('/login?invite_error=invalid_or_expired');
    res.redirect('/dashboard?invite_accepted=1');
  } catch(e) {
    res.redirect('/login?invite_error=server');
  }
});

module.exports = router;
