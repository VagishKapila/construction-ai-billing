const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../lib/db');
const { auth, JWT_SECRET } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { fetchEmail } = require('../services/email');
const { logEvent } = require('../lib/logEvent');

// ── Helper functions ──────────────────────────────────────────────────
function generateToken() {
  return require('crypto').randomBytes(32).toString('hex');
}

function verifyEmailHtml(name, url) {
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
    <h2 style="color:#2563eb">Welcome to Construction AI Billing</h2>
    <p>Hi ${name},</p>
    <p>Please verify your email address to keep your account in good standing.</p>
    <a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0">Verify my email →</a>
    <p style="color:#888;font-size:12px">This link expires in 48 hours. If you didn't sign up, you can ignore this email.</p>
  </div>`;
}

async function sendVerificationEmail(email, name, token) {
  const verifyUrl = `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/verify/${token}`;
  const apiKey    = process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || 'noreply@varshyl.com';
  if (!apiKey) {
    console.log(`[DEV] Verify email for ${email}: ${verifyUrl}`);
    return; // dev mode — just log it
  }
  try {
    // Supports both Resend (preferred) and SendGrid
    const isResend = !!process.env.RESEND_API_KEY;
    const payload  = isResend
      ? { from: fromEmail, to: [email], subject: 'Verify your email — Construction AI Billing',
          html: verifyEmailHtml(name, verifyUrl) }
      : { personalizations:[{to:[{email}]}], from:{email:fromEmail},
          subject:'Verify your email — Construction AI Billing',
          content:[{type:'text/html',value:verifyEmailHtml(name,verifyUrl)}] };
    const resp = await fetchEmail(isResend ? 'https://api.resend.com/emails' : 'https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', Authorization:`Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      console.error(`[Email] Resend API error ${resp.status}: ${errBody}`);
    } else {
      console.log(`[Email] Verification email sent to ${email}`);
    }
  } catch(e) { console.error('Email send failed:', e.message); }
}

// ── Auth routes ───────────────────────────────────────────────────────

router.post('/register', authLimiter, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name||!email||!password) return res.status(400).json({error:'All fields required'});
  if (password.length < 8) return res.status(400).json({error:'Password must be at least 8 characters'});
  try {
    const hash  = await bcrypt.hash(password, 10);
    const vTok  = generateToken();
    const r = await pool.query(
      'INSERT INTO users(name,email,password_hash,verification_token,verification_sent_at,trial_start_date,trial_end_date,subscription_status,plan_type) VALUES($1,$2,$3,$4,NOW(),NOW(),NOW()+INTERVAL \'90 days\',\'trial\',\'free_trial\') RETURNING id,name,email,email_verified,trial_start_date,trial_end_date,subscription_status,plan_type',
      [name, email, hash, vTok]
    );
    const tok = jwt.sign({id:r.rows[0].id,email:email},JWT_SECRET,{expiresIn:'30d'});
    await logEvent(r.rows[0].id, 'user_registered', { email, method: 'email' });
    // Send verification email (non-blocking — don't fail registration if email fails)
    sendVerificationEmail(email, name, vTok).catch(e => console.error('Verify email error:', e.message));
    res.json({token:tok,user:{...r.rows[0],email_verified:false,trial_start_date:r.rows[0].trial_start_date,trial_end_date:r.rows[0].trial_end_date,subscription_status:r.rows[0].subscription_status,plan_type:r.rows[0].plan_type,has_completed_onboarding:false}});
  } catch(e) {
    if(e.code==='23505') return res.status(400).json({error:'Email already registered'});
    console.error('[API Error]', e.message); res.status(500).json({error:'Internal server error'});
  }
});

// Delete own account (used by qa_live.js cleanup — cascades via FK to all user data)
router.delete('/account', auth, async (req, res) => {
  await pool.query('DELETE FROM users WHERE id=$1', [req.user.id]);
  res.json({ ok: true });
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  try {
    const r = await pool.query('SELECT * FROM users WHERE email=$1',[email]);
    const user = r.rows[0];
    if(!user||!(await bcrypt.compare(password,user.password_hash))) {
      await logEvent(null, 'login_failed', { email });
      return res.status(401).json({error:'Invalid email or password'});
    }
    if(user.blocked) return res.status(403).json({error:'Your account has been suspended. Please contact support.'});
    const tok = jwt.sign({id:user.id,email:email},JWT_SECRET,{expiresIn:'30d'});
    await logEvent(user.id, 'user_login', { method: 'email' });
    res.json({token:tok,user:{id:user.id,name:user.name,email:user.email,email_verified:user.email_verified,trial_start_date:user.trial_start_date,trial_end_date:user.trial_end_date,subscription_status:user.subscription_status,plan_type:user.plan_type,has_completed_onboarding:user.has_completed_onboarding}});
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({error:'Internal server error'}); }
});

// ── Forgot password — sends a reset link via email ──────────────────────────
router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    const r = await pool.query('SELECT id, name, email FROM users WHERE email=$1', [email.toLowerCase().trim()]);
    // Always respond OK — never reveal whether email exists (security best practice)
    if (!r.rows[0]) return res.json({ ok: true });
    const user = r.rows[0];
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    await pool.query(
      'UPDATE users SET reset_token=$1, reset_token_sent_at=NOW() WHERE id=$2',
      [resetToken, user.id]
    );
    const appUrl = process.env.APP_URL || 'https://constructinv.varshyl.com';
    const resetUrl = `${appUrl}/reset-password?reset=${resetToken}`;
    const apiKey   = process.env.RESEND_API_KEY;
    const fromEmail = process.env.FROM_EMAIL || 'noreply@varshyl.com';
    if (!apiKey) {
      console.log(`[DEV] Password reset for ${email}: ${resetUrl}`);
    } else {
      const resp = await fetchEmail('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: fromEmail,
          to: [user.email],
          subject: 'Reset your password — Construction AI Billing',
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
            <h2 style="color:#2563eb">Reset your password</h2>
            <p>Hi ${user.name},</p>
            <p>We received a request to reset your password for your Construction AI Billing account.</p>
            <p style="margin:24px 0">
              <a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
                Reset Password
              </a>
            </p>
            <p style="color:#64748b;font-size:13px">This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email — your password won't change.</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
            <p style="color:#94a3b8;font-size:11px">Construction AI Billing · <a href="${appUrl}" style="color:#94a3b8">${appUrl}</a></p>
          </div>`,
        }),
      });
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        console.error(`[Reset Email] Resend error ${resp.status}: ${errBody}`);
      } else {
        console.log(`[Reset Email] Sent to ${user.email}`);
      }
    }
    await logEvent(user.id, 'password_reset_requested', { email: user.email });
    res.json({ ok: true });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Reset password — validates token and saves new password ─────────────────
router.post('/reset-password', authLimiter, async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and new password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const r = await pool.query(
      `SELECT id, email, name FROM users
       WHERE reset_token=$1 AND reset_token_sent_at > NOW() - INTERVAL '1 hour'`,
      [token]
    );
    if (!r.rows[0]) return res.status(400).json({ error: 'This reset link has expired or is invalid. Please request a new one.' });
    const user = r.rows[0];
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'UPDATE users SET password_hash=$1, reset_token=NULL, reset_token_sent_at=NULL WHERE id=$2',
      [hash, user.id]
    );
    // Issue a fresh JWT so they're logged in immediately after reset
    const tok = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    await logEvent(user.id, 'password_reset_completed', { email: user.email });
    res.json({ ok: true, token: tok, user: { id: user.id, name: user.name, email: user.email } });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Public config (PostHog key, Google client ID — safe to expose) ─────────
router.get('/config', (req, res) => {
  res.json({
    posthogKey:     process.env.POSTHOG_KEY     || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  });
});

// ── Google OAuth 2.0 (no passport needed — plain fetch) ────────────────────
router.get('/google', (req, res) => {
  const clientId    = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/google/callback`;
  if (!clientId) return res.status(500).json({ error: 'Google OAuth not configured' });
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'email profile',
    access_type:   'online',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/login?auth_error=google_denied');
  try {
    const redirectUri = `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/google/callback`;
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri, grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error('No access token from Google');
    // Get user profile
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const profile = await profileRes.json();
    if (!profile.email) throw new Error('Could not get email from Google');
    // Find or create user
    let user = (await pool.query('SELECT * FROM users WHERE google_id=$1 OR email=$2', [profile.id, profile.email])).rows[0];
    if (user) {
      // Link google_id if signing in via Google for the first time
      if (!user.google_id) {
        await pool.query('UPDATE users SET google_id=$1, email_verified=TRUE WHERE id=$2', [profile.id, user.id]);
      }
      if (user.blocked) return res.redirect('/login?auth_error=account_blocked');
    } else {
      // New user via Google — auto-verified
      const r = await pool.query(
        'INSERT INTO users(name,email,password_hash,google_id,email_verified,trial_start_date,trial_end_date,subscription_status,plan_type) VALUES($1,$2,$3,$4,TRUE,NOW(),NOW()+INTERVAL \'90 days\',\'trial\',\'free_trial\') RETURNING *',
        [(profile.name || profile.email.split('@')[0]).replace(/[^\x00-\x7F]/g, '').trim() || profile.email.split('@')[0], profile.email, '', profile.id]
      );
      user = r.rows[0];
      await logEvent(user.id, 'user_registered', { email: user.email, method: 'google' });
    }
    await logEvent(user.id, 'user_login', { method: 'google' });
    // Include name + email_verified in the Google JWT — frontend decodes this directly
    const tok = jwt.sign({ id: user.id, email: user.email, name: user.name, email_verified: user.email_verified }, JWT_SECRET, { expiresIn: '30d' });
    // Use URL fragment (#) instead of query string — fragments are NOT sent to servers
    res.redirect(`/dashboard#google_token=${tok}`);
  } catch(e) {
    console.error('Google OAuth error:', e.message);
    res.redirect('/login?auth_error=google_failed');
  }
});

// ── Get current user (refresh cached data) ──────────────────────────────────
router.get('/me', auth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, name, email, email_verified, trial_start_date, trial_end_date, subscription_status, plan_type, has_completed_onboarding FROM users WHERE id=$1',
      [req.user.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'User not found' });
    // Return flat user object — AuthContext expects response.data to be the User directly
    // (not wrapped in { user: {...} }). Wrapping caused isAdmin=false after page refresh.
    res.json(r.rows[0]);
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Email verification ──────────────────────────────────────────────────────
router.get('/verify/:token', async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE users SET email_verified=TRUE, verification_token=NULL
       WHERE verification_token=$1
         AND verification_sent_at > NOW() - INTERVAL '48 hours'
       RETURNING id,name,email`,
      [req.params.token]
    );
    if (!r.rows[0]) return res.redirect('/login?verify_error=invalid_or_expired_token');
    await logEvent(r.rows[0].id, 'email_verified', {});
    res.redirect('/login?verified=1');
  } catch(e) { res.redirect('/login?verify_error=server_error'); }
});

router.post('/resend-verification', auth, async (req, res) => {
  try {
    const user = (await pool.query('SELECT * FROM users WHERE id=$1', [req.user.id])).rows[0];
    if (!user || user.email_verified) return res.json({ ok: true }); // already verified
    const token = generateToken();
    await pool.query('UPDATE users SET verification_token=$1, verification_sent_at=NOW() WHERE id=$2', [token, user.id]);
    await sendVerificationEmail(user.email, user.name, token);
    res.json({ ok: true });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;
