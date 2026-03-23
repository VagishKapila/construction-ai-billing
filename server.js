require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');
const multer = require('multer');
let puppeteer = null;
try { puppeteer = require('puppeteer'); } catch(e) { console.warn('[PDF] Puppeteer not available, falling back to PDFKit'); }
const path = require('path');
const fs = require('fs');
const { pool, initDB } = require('./db');

// ── Email API helper — wraps fetch with a 10s timeout so a slow Resend call
//    never hangs the entire HTTP request indefinitely ────────────────────────
function fetchEmail(url, opts) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(10000) });
}

// ── Security middleware ────────────────────────────────────────────────────
let helmet, rateLimit;
try { helmet    = require('helmet');           } catch(e) { console.warn('helmet not installed — run: npm install helmet'); }
try { rateLimit = require('express-rate-limit');} catch(e) { console.warn('express-rate-limit not installed — run: npm install express-rate-limit'); }

const app = express();
app.set('trust proxy', 1); // Railway runs behind a load balancer — needed for express-rate-limit
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET env var must be set in production. Exiting.');
    process.exit(1);
  }
  console.warn('WARNING: JWT_SECRET not set — using insecure default (dev only).');
}

// Security headers (helmet) — hides X-Powered-By, adds CSP, HSTS, X-Frame-Options etc.
if (helmet) app.use(helmet({ contentSecurityPolicy: false })); // CSP off to allow inline scripts in SPA

// CORS: Set ALLOWED_ORIGIN env var in Railway (e.g. https://constructinv.varshyl.com)
// Falls back to '*' only in local dev — never ship without the env var set in production
const corsOrigin = process.env.ALLOWED_ORIGIN;
if (!corsOrigin && process.env.NODE_ENV === 'production') {
  console.warn('[SECURITY] WARNING: ALLOWED_ORIGIN is not set in production. Defaulting to wildcard CORS — set this env var immediately.');
}
app.use(cors({ origin: corsOrigin || '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB max per file
});

// ── MIME type whitelists — used to reject unexpected file types on upload ────
const MIME_IMAGE   = ['image/jpeg','image/png','image/gif','image/webp','image/svg+xml'];
const MIME_SOV     = ['application/pdf','application/msword',
                      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                      'application/vnd.ms-excel',
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                      'text/csv','text/plain'];
const MIME_CONTRACT= ['application/pdf','application/msword',
                      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const MIME_ATTACH  = [...MIME_IMAGE, ...MIME_CONTRACT,
                      'application/vnd.ms-excel',
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                      'text/csv','text/plain'];
const MIME_SCREENSHOT = [...MIME_IMAGE];

function rejectFile(req, res, allowedTypes, label) {
  if (!req.file) return false;
  // Check MIME type; also cross-check file extension for extra safety
  if (!allowedTypes.includes(req.file.mimetype)) {
    try { fs.unlinkSync(req.file.path); } catch(_) {}
    res.status(400).json({ error: `Invalid file type for ${label}. Accepted types: ${allowedTypes.join(', ')}` });
    return true;
  }
  return false;
}
const fmt = n => '$' + parseFloat(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

function auth(req, res, next) {
  const token = (req.headers.authorization && req.headers.authorization.split(' ')[1]) || req.query.token;
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch(e) { res.status(401).json({ error: 'Invalid token' }); }
}

// ── Rate limiting on auth endpoints ───────────────────────────────────────
const authLimiter = rateLimit ? rateLimit({
  windowMs: 60 * 1000,       // 1 minute window
  max: 10,                    // max 10 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a minute and try again.' }
}) : (req,res,next) => next(); // no-op if package not installed yet

// ── Analytics event logger ─────────────────────────────────────────────────
async function logEvent(userId, event, meta = {}) {
  try {
    await pool.query(
      'INSERT INTO analytics_events(user_id, event, meta) VALUES($1,$2,$3)',
      [userId || null, event, JSON.stringify(meta)]
    );
  } catch(e) { /* silent — analytics must never crash the app */ }
}

// ── Request timing middleware (logs slow API calls) ───────────────────────
app.use('/api', (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (ms > 2000) { // log anything taking more than 2 seconds
      logEvent(null, 'slow_request', { method: req.method, path: req.path, ms, status: res.statusCode });
    }
    // Log all errors automatically
    if (res.statusCode >= 500) {
      logEvent(null, 'server_error', { method: req.method, path: req.path, ms, status: res.statusCode });
    }
  });
  next();
});

// AUTH
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name||!email||!password) return res.status(400).json({error:'All fields required'});
  if (password.length < 8) return res.status(400).json({error:'Password must be at least 8 characters'});
  try {
    const hash  = await bcrypt.hash(password, 10);
    const vTok  = generateToken();
    const r = await pool.query(
      'INSERT INTO users(name,email,password_hash,verification_token,verification_sent_at) VALUES($1,$2,$3,$4,NOW()) RETURNING id,name,email,email_verified',
      [name, email, hash, vTok]
    );
    const tok = jwt.sign({id:r.rows[0].id,email:email},JWT_SECRET,{expiresIn:'30d'});
    await logEvent(r.rows[0].id, 'user_registered', { email, method: 'email' });
    // Send verification email (non-blocking — don't fail registration if email fails)
    sendVerificationEmail(email, name, vTok).catch(e => console.error('Verify email error:', e.message));
    res.json({token:tok,user:{...r.rows[0],email_verified:false}});
  } catch(e) {
    if(e.code==='23505') return res.status(400).json({error:'Email already registered'});
    console.error('[API Error]', e.message); res.status(500).json({error:'Internal server error'});
  }
});

// Delete own account (used by qa_live.js cleanup — cascades via FK to all user data)
app.delete('/api/auth/account', auth, async (req, res) => {
  await pool.query('DELETE FROM users WHERE id=$1', [req.user.id]);
  res.json({ ok: true });
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
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
    res.json({token:tok,user:{id:user.id,name:user.name,email:user.email,email_verified:user.email_verified}});
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({error:'Internal server error'}); }
});

// ── Forgot password — sends a reset link via email ──────────────────────────
app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
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
    const resetUrl = `${appUrl}/?reset=${resetToken}`;
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
            <h2 style="color:#185FA5">Reset your password</h2>
            <p>Hi ${user.name},</p>
            <p>We received a request to reset your password for your Construction AI Billing account.</p>
            <p style="margin:24px 0">
              <a href="${resetUrl}" style="background:#185FA5;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
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
app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
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

// ── Emergency admin: check or force-reset a user password (ADMIN_SECRET protected) ──
// Used when user is locked out and email is not working.
// Requires ADMIN_SECRET env var to be set on Railway.
app.post('/api/admin/emergency-reset', async (req, res) => {
  const { secret, email, new_password } = req.body;
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || secret !== adminSecret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const r = await pool.query(
      `SELECT id, name, email, email_verified, blocked, created_at,
              length(password_hash) as hash_length
       FROM users WHERE lower(email)=lower($1)`, [email]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'User not found', email });
    const user = r.rows[0];
    // Unblock only (no password change needed)
    if (req.body.action === 'unblock') {
      await pool.query('UPDATE users SET blocked=FALSE, blocked_reason=NULL WHERE id=$1', [user.id]);
      await logEvent(user.id, 'emergency_unblock', { email: user.email });
      return res.json({ ok: true, unblocked: true, user });
    }
    // If new_password provided, reset password AND unblock the account
    if (new_password) {
      if (new_password.length < 8) return res.status(400).json({ error: 'Password must be 8+ characters' });
      const hash = await bcrypt.hash(new_password, 10);
      await pool.query(
        'UPDATE users SET password_hash=$1, reset_token=NULL, blocked=FALSE, blocked_reason=NULL WHERE id=$2',
        [hash, user.id]
      );
      const tok = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
      await logEvent(user.id, 'password_emergency_reset', { email: user.email });
      return res.json({ ok: true, reset: true, unblocked: true, user, token: tok });
    }
    // Otherwise just return account info for diagnosis
    res.json({ ok: true, user });
  } catch(e) { console.error('[Emergency Reset]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Public config (PostHog key, Google client ID — safe to expose) ─────────
app.get('/api/config', (req, res) => {
  res.json({
    posthogKey:     process.env.POSTHOG_KEY     || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  });
});

// ── Email helper (Resend or SendGrid via fetch — no extra npm needed) ───────
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

function verifyEmailHtml(name, url) {
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
    <h2 style="color:#185FA5">Welcome to Construction AI Billing</h2>
    <p>Hi ${name},</p>
    <p>Please verify your email address to keep your account in good standing.</p>
    <a href="${url}" style="display:inline-block;background:#185FA5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0">Verify my email →</a>
    <p style="color:#888;font-size:12px">This link expires in 48 hours. If you didn't sign up, you can ignore this email.</p>
  </div>`;
}

function generateToken() {
  return require('crypto').randomBytes(32).toString('hex');
}

// ── Google OAuth 2.0 (no passport needed — plain fetch) ────────────────────
app.get('/api/auth/google', (req, res) => {
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

app.get('/api/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/app.html?auth_error=google_denied');
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
      if (user.blocked) return res.redirect('/app.html?auth_error=account_blocked');
    } else {
      // New user via Google — auto-verified
      const r = await pool.query(
        'INSERT INTO users(name,email,password_hash,google_id,email_verified) VALUES($1,$2,$3,$4,TRUE) RETURNING *',
        [profile.name || profile.email.split('@')[0], profile.email, '', profile.id]
      );
      user = r.rows[0];
      await logEvent(user.id, 'user_registered', { email: user.email, method: 'google' });
    }
    await logEvent(user.id, 'user_login', { method: 'google' });
    // Include name + email_verified in the Google JWT — frontend decodes this directly
    // (unlike email/password login which returns a separate user object in JSON)
    const tok = jwt.sign({ id: user.id, email: user.email, name: user.name, email_verified: user.email_verified }, JWT_SECRET, { expiresIn: '30d' });
    // Use URL fragment (#) instead of query string — fragments are NOT sent to servers,
    // NOT logged in access logs, and NOT included in Referer headers. This prevents
    // the JWT from leaking through browser history, server logs, or third-party referers.
    res.redirect(`/app.html#google_token=${tok}`);
  } catch(e) {
    console.error('Google OAuth error:', e.message);
    res.redirect('/app.html?auth_error=google_failed');
  }
});

// ── OAuth 2.0 Authorization Server — for Custom GPT / MCP token flow ────────
// Allows external apps (OpenAI Custom GPT, Claude plugins) to get user tokens
// via standard OAuth Authorization Code Flow without the user copying JWT tokens.
//
// Flow:
//   1. GPT redirects user to /oauth/authorize?client_id=...&redirect_uri=...&state=...
//   2. User logs in (if not already), sees consent screen, clicks Approve
//   3. Server redirects to redirect_uri?code=AUTHCODE&state=...
//   4. GPT exchanges code for token: POST /oauth/token {code, client_id, client_secret}
//   5. Server returns {access_token, token_type:"bearer", expires_in}
//   6. GPT uses access_token as Bearer token in API calls
//
// Register clients via OAUTH_CLIENTS env var (JSON array):
//   [{"client_id":"gpt_caib","client_secret":"secret","redirect_uris":["https://chat.openai.com/..."]}]

const OAUTH_CLIENTS = (() => {
  try { return JSON.parse(process.env.OAUTH_CLIENTS || '[]'); } catch { return []; }
})();
// In-memory auth code store — short-lived (10 min). Fine for low-volume use.
// For production: move to Redis or a DB table.
const oauthCodes = new Map(); // code -> {user_id, client_id, expires}

app.get('/oauth/authorize', async (req, res) => {
  const { client_id, redirect_uri, state, response_type } = req.query;
  if (response_type !== 'code') return res.status(400).send('Only response_type=code supported');
  const client = OAUTH_CLIENTS.find(c => c.client_id === client_id);
  if (!client) return res.status(400).send('Unknown client_id');
  if (!client.redirect_uris.includes(redirect_uri)) return res.status(400).send('Invalid redirect_uri');

  // Show consent page — the user logs in via Google or email/password first
  const stateEnc = encodeURIComponent(state || '');
  const rdirEnc  = encodeURIComponent(redirect_uri);
  res.send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize — Construction AI Billing</title>
<style>
  body{font-family:-apple-system,sans-serif;background:#f0f4f8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .box{background:#fff;border-radius:12px;padding:36px 40px;max-width:400px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.12);text-align:center}
  h1{font-size:20px;margin-bottom:8px;color:#1a1a1a}
  .logo{font-size:14px;font-weight:600;color:#185FA5;margin-bottom:24px}
  p{font-size:14px;color:#555;margin-bottom:6px;text-align:left}
  .scope-list{background:#f8fafc;border-radius:8px;padding:14px 18px;text-align:left;font-size:13px;color:#333;margin:16px 0}
  .scope-list li{margin-bottom:4px}
  .client-name{font-weight:600;color:#1a1a1a}
  input{width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;margin:6px 0 14px;box-sizing:border-box}
  .btn{width:100%;padding:11px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;margin-top:6px}
  .btn-primary{background:#185FA5;color:#fff}
  .btn-secondary{background:#f1f5f9;color:#555;margin-top:8px}
  .err{color:#dc2626;font-size:13px;margin-bottom:10px}
</style>
</head>
<body>
<div class="box">
  <div class="logo">Construction AI Billing</div>
  <h1>Authorize Access</h1>
  <p><span class="client-name">${client.name || client_id}</span> is requesting access to your account:</p>
  <ul class="scope-list">
    <li>✓ View your projects and billing data</li>
    <li>✓ Read lien documents and contract intelligence</li>
    <li>✗ Cannot create or modify projects</li>
    <li>✗ Cannot generate or submit documents</li>
  </ul>
  <form method="POST" action="/oauth/authorize-confirm">
    <p><strong>Email</strong></p>
    <input type="email" name="email" placeholder="you@example.com" required autocomplete="email">
    <p><strong>Password</strong></p>
    <input type="password" name="password" placeholder="Your password" required autocomplete="current-password">
    <input type="hidden" name="client_id" value="${client_id}">
    <input type="hidden" name="redirect_uri" value="${redirect_uri}">
    <input type="hidden" name="state" value="${state || ''}">
    <button type="submit" class="btn btn-primary">Approve Access</button>
  </form>
  <form action="/" method="get"><button type="submit" class="btn btn-secondary">Cancel</button></form>
</div>
</body></html>`);
});

app.post('/oauth/authorize-confirm', express.urlencoded({ extended: false }), async (req, res) => {
  const { email, password, client_id, redirect_uri, state } = req.body;
  const client = OAUTH_CLIENTS.find(c => c.client_id === client_id);
  if (!client || !client.redirect_uris.includes(redirect_uri)) return res.status(400).send('Invalid request');

  try {
    const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    const user = r.rows[0];
    if (!user) return res.status(401).send('Invalid credentials');
    const bcrypt = require('bcryptjs');
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).send('Invalid credentials');

    // Generate auth code
    const code = require('crypto').randomBytes(24).toString('hex');
    oauthCodes.set(code, { user_id: user.id, client_id, expires: Date.now() + 10 * 60 * 1000 });

    const sep = redirect_uri.includes('?') ? '&' : '?';
    res.redirect(`${redirect_uri}${sep}code=${code}${state ? '&state=' + encodeURIComponent(state) : ''}`);
  } catch(e) {
    console.error('OAuth confirm error:', e.message);
    res.status(500).send('Server error');
  }
});

app.post('/oauth/token', express.json(), express.urlencoded({ extended: false }), async (req, res) => {
  const { grant_type, code, client_id, client_secret, redirect_uri } = req.body;
  if (grant_type !== 'authorization_code') return res.status(400).json({ error: 'unsupported_grant_type' });

  const client = OAUTH_CLIENTS.find(c => c.client_id === client_id && c.client_secret === client_secret);
  if (!client) return res.status(401).json({ error: 'invalid_client' });

  const entry = oauthCodes.get(code);
  if (!entry || entry.client_id !== client_id || Date.now() > entry.expires) {
    oauthCodes.delete(code);
    return res.status(400).json({ error: 'invalid_grant' });
  }
  oauthCodes.delete(code); // single use

  const user = (await pool.query('SELECT id,email FROM users WHERE id=$1', [entry.user_id])).rows[0];
  if (!user) return res.status(400).json({ error: 'invalid_grant' });

  // Issue a long-lived token (90 days) for programmatic access
  const tok = jwt.sign({ id: user.id, email: user.email, oauth: true }, JWT_SECRET, { expiresIn: '90d' });
  res.json({ access_token: tok, token_type: 'bearer', expires_in: 90 * 24 * 3600 });
});

// ── Email verification ──────────────────────────────────────────────────────
app.get('/api/auth/verify/:token', async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE users SET email_verified=TRUE, verification_token=NULL
       WHERE verification_token=$1
         AND verification_sent_at > NOW() - INTERVAL '48 hours'
       RETURNING id,name,email`,
      [req.params.token]
    );
    if (!r.rows[0]) return res.redirect('/?verify_error=invalid_or_expired_token');
    await logEvent(r.rows[0].id, 'email_verified', {});
    res.redirect('/?verified=1');
  } catch(e) { res.redirect('/?verify_error=server_error'); }
});

app.post('/api/auth/resend-verification', auth, async (req, res) => {
  try {
    const user = (await pool.query('SELECT * FROM users WHERE id=$1', [req.user.id])).rows[0];
    if (!user || user.email_verified) return res.json({ ok: true }); // already verified
    const token = generateToken();
    await pool.query('UPDATE users SET verification_token=$1, verification_sent_at=NOW() WHERE id=$2', [token, user.id]);
    await sendVerificationEmail(user.email, user.name, token);
    res.json({ ok: true });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ── DASHBOARD STATS — single query for all billing totals
app.get('/api/stats', auth, async (req,res) => {
  try {
    const r = await pool.query(`
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
    `, [req.user.id]);
    res.json(r.rows[0] || { total_billed: 0, total_retainage: 0 });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// PROJECTS
app.get('/api/projects', auth, async (req,res) => {
  const r = await pool.query('SELECT * FROM projects WHERE user_id=$1 ORDER BY created_at DESC',[req.user.id]);
  res.json(r.rows);
});

app.post('/api/projects', auth, async (req,res) => {
  const {name,number,owner,owner_email,owner_phone,contractor,architect,contact,contact_name,contact_phone,contact_email,building_area,original_contract,contract_date,est_date,default_retainage} = req.body;
  const retPct = (default_retainage !== undefined && default_retainage !== null) ? parseFloat(default_retainage) : 10;
  const r = await pool.query(
    `INSERT INTO projects(user_id,name,number,owner,owner_email,owner_phone,contractor,architect,contact,contact_name,contact_phone,contact_email,building_area,original_contract,contract_date,est_date,default_retainage)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [req.user.id,name,number,owner,owner_email||null,owner_phone||null,contractor,architect,contact,contact_name,contact_phone,contact_email,building_area,original_contract,contract_date||null,est_date||null,retPct]
  );
  await logEvent(req.user.id, 'project_created', { project_id: r.rows[0].id, contract_value: original_contract });
  res.json(r.rows[0]);
});

app.put('/api/projects/:id', auth, async (req,res) => {
  const {name,number,owner,contractor,architect,contact,building_area,original_contract,contract_date} = req.body;
  const r = await pool.query(
    'UPDATE projects SET name=$1,number=$2,owner=$3,contractor=$4,architect=$5,contact=$6,building_area=$7,original_contract=$8,contract_date=$9 WHERE id=$10 AND user_id=$11 RETURNING *',
    [name,number,owner,contractor,architect,contact,building_area,original_contract,contract_date,req.params.id,req.user.id]
  );
  res.json(r.rows[0]);
});

app.delete('/api/projects/:id', auth, async (req,res) => {
  await pool.query('DELETE FROM projects WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);
  res.json({ok:true});
});

// SOV
app.get('/api/projects/:id/sov', auth, async (req,res) => {
  const r = await pool.query('SELECT * FROM sov_lines WHERE project_id=$1 ORDER BY sort_order',[req.params.id]);
  res.json(r.rows);
});

app.post('/api/projects/:id/sov', auth, async (req,res) => {
  const {lines} = req.body;
  await pool.query('DELETE FROM sov_lines WHERE project_id=$1',[req.params.id]);
  for(const [i,line] of lines.entries()) {
    await pool.query(
      'INSERT INTO sov_lines(project_id,item_id,description,scheduled_value,sort_order) VALUES($1,$2,$3,$4,$5)',
      [req.params.id,line.item_id,line.description,line.scheduled_value,i]
    );
  }
  // Auto-sync original_contract with the SOV total so G702 always matches G703
  const sovTotal = lines.reduce((s,l)=>s+parseFloat(l.scheduled_value||0),0);
  await pool.query('UPDATE projects SET original_contract=$1 WHERE id=$2 AND user_id=$3',[sovTotal,req.params.id,req.user.id]);
  const r = await pool.query('SELECT * FROM sov_lines WHERE project_id=$1 ORDER BY sort_order',[req.params.id]);
  res.json(r.rows);
});

// Sync original_contract to match SOV total (fixes existing projects with wrong contract sum)
app.post('/api/projects/:id/sync-contract', auth, async (req,res) => {
  const sov = await pool.query('SELECT scheduled_value FROM sov_lines WHERE project_id=$1',[req.params.id]);
  if(!sov.rows.length) return res.status(400).json({error:'No SOV lines found for this project'});
  const total = sov.rows.reduce((s,r)=>s+parseFloat(r.scheduled_value||0),0);
  const updated = await pool.query(
    'UPDATE projects SET original_contract=$1 WHERE id=$2 AND user_id=$3 RETURNING *',
    [total,req.params.id,req.user.id]
  );
  if(!updated.rows[0]) return res.status(404).json({error:'Project not found'});
  await logEvent(req.user.id,'contract_synced',{project_id:parseInt(req.params.id),new_total:total});
  res.json({ok:true,original_contract:total,project:updated.rows[0]});
});

// PAY APPS
app.get('/api/projects/:id/payapps', auth, async (req,res) => {
  // Exclude soft-deleted pay apps from the normal listing
  const r = await pool.query('SELECT * FROM pay_apps WHERE project_id=$1 AND deleted_at IS NULL ORDER BY app_number',[req.params.id]);
  res.json(r.rows);
});

app.post('/api/projects/:id/payapps', auth, async (req,res) => {
  const {period_label,period_start,period_end,app_number} = req.body;
  const invoiceToken = require('crypto').randomBytes(24).toString('hex');
  const pa = await pool.query(
    'INSERT INTO pay_apps(project_id,app_number,period_label,period_start,period_end,invoice_token) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.params.id,app_number,period_label,period_start,period_end,invoiceToken]
  );
  const paId = pa.rows[0].id;
  const sovLines = await pool.query('SELECT * FROM sov_lines WHERE project_id=$1 ORDER BY sort_order',[req.params.id]);
  // Fetch project's default retainage (falls back to 10 if column not yet present)
  const projRes = await pool.query('SELECT default_retainage FROM projects WHERE id=$1',[req.params.id]);
  const projDefaultRet = projRes.rows[0] ? parseFloat(projRes.rows[0].default_retainage ?? 10) : 10;
  const prevLines = await pool.query(
    'SELECT pal.* FROM pay_app_lines pal JOIN pay_apps p ON p.id=pal.pay_app_id WHERE p.project_id=$1 AND p.app_number=$2',
    [req.params.id,app_number-1]
  );
  const prevMap = {};
  prevLines.rows.forEach(r => prevMap[r.sov_line_id]=r);
  for(const line of sovLines.rows) {
    const prev = prevMap[line.id];
    const prevPct = prev ? Math.min(100, parseFloat(prev.prev_pct)+parseFloat(prev.this_pct)) : 0;
    const retPct = prev ? parseFloat(prev.retainage_pct) : projDefaultRet;
    await pool.query(
      'INSERT INTO pay_app_lines(pay_app_id,sov_line_id,prev_pct,this_pct,retainage_pct,stored_materials) VALUES($1,$2,$3,$4,$5,$6)',
      [paId,line.id,prevPct,0,retPct,0]
    );
  }
  await logEvent(req.user.id, 'payapp_created', { project_id: parseInt(req.params.id), app_number });
  res.json(pa.rows[0]);
});

app.get('/api/payapps/:id', auth, async (req,res) => {
  const pa = await pool.query(
    'SELECT pa.*,p.name as project_name,p.owner,p.contractor,p.architect,p.contact,p.contact_name,p.contact_phone,p.contact_email,p.original_contract,p.number as project_number,p.building_area,p.id as project_id,p.contract_date,p.payment_terms FROM pay_apps pa JOIN projects p ON p.id=pa.project_id WHERE pa.id=$1 AND p.user_id=$2 AND pa.deleted_at IS NULL',
    [req.params.id, req.user.id]
  );
  if(!pa.rows[0]) return res.status(404).json({error:'Not found'});
  const lines = await pool.query(
    'SELECT pal.*,sl.item_id,sl.description,sl.scheduled_value,sl.sort_order FROM pay_app_lines pal JOIN sov_lines sl ON sl.id=pal.sov_line_id WHERE pal.pay_app_id=$1 ORDER BY sl.sort_order',
    [req.params.id]
  );
  const cos = await pool.query('SELECT * FROM change_orders WHERE pay_app_id=$1 ORDER BY co_number',[req.params.id]);
  const atts = await pool.query('SELECT * FROM attachments WHERE pay_app_id=$1 ORDER BY uploaded_at',[req.params.id]);
  res.json({...pa.rows[0],lines:lines.rows,change_orders:cos.rows,attachments:atts.rows});
});

app.put('/api/payapps/:id', auth, async (req,res) => {
  const {period_label,period_start,period_end,status,architect_certified,architect_name,architect_date,notes} = req.body;
  // Boolean fields need explicit undefined check — false is valid but falsy
  const distOwner    = req.body.dist_owner    !== undefined ? req.body.dist_owner    : null;
  const distArchitect= req.body.dist_architect!== undefined ? req.body.dist_architect: null;
  const distContractor=req.body.dist_contractor!==undefined ? req.body.dist_contractor:null;

  // ── Security: prevent reverting a submitted PA back to draft ──────────────
  if (status && status !== 'submitted') {
    const cur = await pool.query(
      'SELECT status FROM pay_apps WHERE id=$1 AND project_id IN (SELECT id FROM projects WHERE user_id=$2)',
      [req.params.id, req.user.id]
    );
    if (cur.rows[0]?.status === 'submitted') {
      return res.status(409).json({ error: 'A submitted pay application cannot be reverted. Contact support if needed.' });
    }
  }

  // COALESCE prevents partial updates from nuking fields not included in the request
  const r = await pool.query(
    `UPDATE pay_apps SET
      period_label    = COALESCE($1,  period_label),
      period_start    = COALESCE($2,  period_start),
      period_end      = COALESCE($3,  period_end),
      status          = COALESCE($4,  status),
      architect_certified = COALESCE($5, architect_certified),
      architect_name  = COALESCE($6,  architect_name),
      architect_date  = COALESCE($7,  architect_date),
      notes           = COALESCE($8,  notes),
      dist_owner      = COALESCE($11, dist_owner),
      dist_architect  = COALESCE($12, dist_architect),
      dist_contractor = COALESCE($13, dist_contractor)
     WHERE id=$9 AND project_id IN (SELECT id FROM projects WHERE user_id=$10)
     RETURNING *`,
    [period_label||null, period_start||null, period_end||null,
     status||null, architect_certified||null, architect_name||null,
     architect_date||null, notes||null,
     req.params.id, req.user.id,
     distOwner, distArchitect, distContractor]
  );
  if(!r.rows[0]) return res.status(404).json({error:'Not found'});
  if (status === 'submitted') {
    await logEvent(req.user.id, 'payapp_submitted', { pay_app_id: parseInt(req.params.id) });
    // Snapshot amount_due and retention_held using correct column names
    try {
      const snap = await pool.query(`
        SELECT
          SUM(sl.scheduled_value * pal.this_pct / 100
              - sl.scheduled_value * (pal.prev_pct + pal.this_pct) / 100 * pal.retainage_pct / 100
              + sl.scheduled_value * pal.prev_pct / 100 * pal.retainage_pct / 100) AS amount_due,
          SUM(sl.scheduled_value * (pal.prev_pct + pal.this_pct) / 100 * pal.retainage_pct / 100) AS retention_held
        FROM pay_app_lines pal
        JOIN sov_lines sl ON sl.id = pal.sov_line_id
        WHERE pal.pay_app_id=$1`, [req.params.id]);
      if (snap.rows[0]) {
        await pool.query(
          'UPDATE pay_apps SET amount_due=$1, retention_held=$2 WHERE id=$3',
          [snap.rows[0].amount_due||0, snap.rows[0].retention_held||0, req.params.id]
        );
      }
    } catch(snapErr) { console.error('[Snap amount_due]', snapErr.message); }

    // Auto-calculate payment_due_date from project payment_terms (e.g. "Net 30" → today + 30 days)
    try {
      const projR = await pool.query(
        'SELECT payment_terms FROM projects WHERE id IN (SELECT project_id FROM pay_apps WHERE id=$1)',
        [req.params.id]
      );
      if (projR.rows[0]?.payment_terms) {
        const terms = projR.rows[0].payment_terms.toString().toLowerCase().trim();
        let daysToAdd = 30; // sensible default
        if (terms === 'due on receipt' || terms === 'due on demand') {
          daysToAdd = 0;
        } else {
          const m = terms.match(/net\s*(\d+)/);
          if (m) daysToAdd = parseInt(m[1]);
        }
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + daysToAdd);
        await pool.query(
          'UPDATE pay_apps SET payment_due_date=$1 WHERE id=$2',
          [dueDate.toISOString().split('T')[0], req.params.id]
        );
      }
    } catch(dueErr) { console.error('[Auto due date]', dueErr.message); }

    // Auto-generate unconditional final waiver lien release (non-blocking)
    try {
      // Only create if one doesn't already exist for this pay app
      const lienCheck = await pool.query(
        'SELECT id FROM lien_documents WHERE pay_app_id=$1', [req.params.id]
      );
      if (!lienCheck.rows[0]) {
        const projData = await pool.query(
          `SELECT p.*, cs.company_name, cs.logo_filename, cs.contact_name
           FROM projects p
           LEFT JOIN company_settings cs ON cs.user_id = p.user_id
           WHERE p.id IN (SELECT project_id FROM pay_apps WHERE id=$1)`,
          [req.params.id]
        );
        if (projData.rows[0]) {
          const proj = projData.rows[0];
          const paRow = await pool.query('SELECT amount_due, period_end, app_number, period_label FROM pay_apps WHERE id=$1', [req.params.id]);
          const pa = paRow.rows[0] || {};
          const lienAmount = parseFloat(pa.amount_due || 0);
          const through_date = pa.period_end
            ? new Date(pa.period_end).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0];
          const signatory_name = proj.contact_name || proj.company_name || proj.contractor || 'Contractor';
          const jurisdiction = proj.jurisdiction || 'california';
          const pay_app_ref = `Pay App #${pa.app_number}${pa.period_label ? ' — ' + pa.period_label : ''}`;

          const fname = `lien_unconditional_final_${req.params.id}_${Date.now()}.pdf`;
          const fpath = path.join(__dirname, 'uploads', fname);
          const signedAt = new Date();

          await generateLienDocPDF({
            fpath, doc_type: 'unconditional_final_waiver', project: proj,
            through_date, amount: lienAmount,
            maker_of_check: proj.owner || '',
            check_payable_to: proj.company_name || proj.contractor || '',
            signatory_name, signatory_title: null,
            signedAt, ip: req.ip || 'auto', jurisdiction, pay_app_ref
          });
          await pool.query(
            `INSERT INTO lien_documents(project_id, pay_app_id, doc_type, filename, jurisdiction,
               through_date, amount, maker_of_check, check_payable_to,
               signatory_name, signatory_title, signed_at, signatory_ip)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [proj.id, parseInt(req.params.id), 'unconditional_final_waiver', fname, jurisdiction,
             through_date, lienAmount, proj.owner||null, proj.company_name||proj.contractor||null,
             signatory_name, null, signedAt, req.ip || 'auto']
          );
          await logEvent(req.user.id, 'lien_auto_generated', { pay_app_id: parseInt(req.params.id) });
        }
      }
    } catch(lienErr) { console.error('[Auto lien release]', lienErr.message); }
  }
  res.json(r.rows[0]);
});

// ── Soft-delete a pay app (moves to trash, never permanently destroyed) ───────
// Query param: ?cascade=true → also deletes all subsequent pay apps in the same project
app.delete('/api/payapps/:id', auth, async (req, res) => {
  try {
    const cascade = req.query.cascade === 'true';

    // Verify ownership and get app_number + project_id
    const target = await pool.query(
      `SELECT pa.id, pa.app_number, pa.project_id, pa.status
       FROM pay_apps pa
       JOIN projects p ON p.id = pa.project_id
       WHERE pa.id=$1 AND p.user_id=$2 AND pa.deleted_at IS NULL`,
      [req.params.id, req.user.id]
    );
    if (!target.rows[0]) return res.status(404).json({ error: 'Pay application not found or already deleted' });

    const { app_number, project_id } = target.rows[0];

    // Check for subsequent non-deleted pay apps that depend on this one
    const subsequent = await pool.query(
      `SELECT id, app_number, period_label, status
       FROM pay_apps
       WHERE project_id=$1 AND app_number > $2 AND deleted_at IS NULL
       ORDER BY app_number`,
      [project_id, app_number]
    );

    // If there are subsequent pay apps and cascade not requested, return a warning
    if (subsequent.rows.length > 0 && !cascade) {
      return res.status(409).json({
        warning: true,
        message: `Pay App #${app_number} has ${subsequent.rows.length} subsequent application${subsequent.rows.length > 1 ? 's' : ''} that depend on it for their "Previous Billing" totals.`,
        subsequent: subsequent.rows.map(r => ({ id: r.id, app_number: r.app_number, period_label: r.period_label, status: r.status })),
        target: { id: target.rows[0].id, app_number }
      });
    }

    // Delete the target + all subsequent if cascade
    const toDelete = [target.rows[0].id, ...subsequent.rows.map(r => r.id)];
    await pool.query(
      `UPDATE pay_apps SET deleted_at=NOW(), deleted_by=$1 WHERE id = ANY($2::int[])`,
      [req.user.id, toDelete]
    );

    for (const pid of toDelete) {
      await logEvent(req.user.id, 'payapp_deleted', { pay_app_id: pid, cascade: toDelete.length > 1 });
    }

    res.json({
      ok: true,
      deleted_count: toDelete.length,
      app_numbers: [app_number, ...subsequent.rows.map(r => r.app_number)]
    });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Restore a soft-deleted pay app ───────────────────────────────────────────
app.post('/api/payapps/:id/restore', auth, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE pay_apps SET deleted_at=NULL, deleted_by=NULL
       WHERE id=$1
         AND project_id IN (SELECT id FROM projects WHERE user_id=$2)
         AND deleted_at IS NOT NULL
       RETURNING id, app_number`,
      [req.params.id, req.user.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Pay application not found or not deleted' });
    await logEvent(req.user.id, 'payapp_restored', { pay_app_id: parseInt(req.params.id) });
    res.json({ ok: true, id: r.rows[0].id, app_number: r.rows[0].app_number });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Get deleted pay apps for a project (trash history, last 1 year) ──────────
app.get('/api/projects/:id/payapps/deleted', auth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT pa.id, pa.app_number, pa.period_label, pa.amount_due, pa.retention_held,
              pa.deleted_at, pa.status,
              u.name as deleted_by_name
       FROM pay_apps pa
       JOIN projects p ON p.id = pa.project_id
       LEFT JOIN users u ON u.id = pa.deleted_by
       WHERE pa.project_id=$1
         AND p.user_id=$2
         AND pa.deleted_at IS NOT NULL
         AND pa.deleted_at > NOW() - INTERVAL '1 year'
       ORDER BY pa.deleted_at DESC`,
      [req.params.id, req.user.id]
    );
    res.json(r.rows);
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.put('/api/payapps/:id/lines', auth, async (req,res) => {
  // Verify ownership before updating any lines
  const own = await pool.query(
    'SELECT pa.id, pa.status FROM pay_apps pa JOIN projects p ON p.id=pa.project_id WHERE pa.id=$1 AND p.user_id=$2',
    [req.params.id, req.user.id]
  );
  if(!own.rows[0]) return res.status(403).json({error:'Forbidden'});
  if(own.rows[0].status === 'submitted') return res.status(409).json({error:'Cannot edit lines on a submitted pay application.'});

  const {lines} = req.body;

  // ── Input validation: pct values must be 0–100, amounts non-negative ──────
  for(const line of lines) {
    const thisPct = parseFloat(line.this_pct);
    const retPct  = parseFloat(line.retainage_pct);
    const stored  = parseFloat(line.stored_materials || 0);
    if(isNaN(thisPct) || thisPct < 0 || thisPct > 100)
      return res.status(400).json({ error: `this_pct must be 0–100 (got ${line.this_pct})` });
    if(isNaN(retPct) || retPct < 0 || retPct > 100)
      return res.status(400).json({ error: `retainage_pct must be 0–100 (got ${line.retainage_pct})` });
    if(isNaN(stored) || stored < 0)
      return res.status(400).json({ error: `stored_materials must be 0 or positive (got ${line.stored_materials})` });
  }

  for(const line of lines) {
    await pool.query(
      'UPDATE pay_app_lines SET this_pct=$1,retainage_pct=$2,stored_materials=$3 WHERE id=$4 AND pay_app_id=$5',
      [line.this_pct,line.retainage_pct,line.stored_materials||0,line.id,req.params.id]
    );
  }
  await logEvent(req.user.id, 'payapp_lines_saved', { pay_app_id: parseInt(req.params.id), line_count: lines.length });
  res.json({ok:true});
});

// CHANGE ORDERS
app.post('/api/payapps/:id/changeorders', auth, async (req,res) => {
  // Verify user owns this pay app before adding change orders
  const own = await pool.query(
    'SELECT pa.id FROM pay_apps pa JOIN projects p ON p.id=pa.project_id WHERE pa.id=$1 AND p.user_id=$2',
    [req.params.id, req.user.id]
  );
  if (!own.rows[0]) return res.status(403).json({ error: 'Forbidden' });
  const {co_number,description,amount,status} = req.body;
  const r = await pool.query(
    'INSERT INTO change_orders(pay_app_id,co_number,description,amount,status) VALUES($1,$2,$3,$4,$5) RETURNING *',
    [req.params.id,co_number,description,amount,status||'pending']
  );
  res.json(r.rows[0]);
});

app.put('/api/changeorders/:id', auth, async (req,res) => {
  const own = await pool.query(
    'SELECT co.id FROM change_orders co JOIN pay_apps pa ON pa.id=co.pay_app_id JOIN projects p ON p.id=pa.project_id WHERE co.id=$1 AND p.user_id=$2',
    [req.params.id, req.user.id]
  );
  if(!own.rows[0]) return res.status(403).json({error:'Forbidden'});
  const {description,amount,status} = req.body;
  const r = await pool.query(
    'UPDATE change_orders SET description=$1,amount=$2,status=$3 WHERE id=$4 RETURNING *',
    [description,amount,status,req.params.id]
  );
  res.json(r.rows[0]);
});

app.delete('/api/changeorders/:id', auth, async (req,res) => {
  const own = await pool.query(
    'SELECT co.id FROM change_orders co JOIN pay_apps pa ON pa.id=co.pay_app_id JOIN projects p ON p.id=pa.project_id WHERE co.id=$1 AND p.user_id=$2',
    [req.params.id, req.user.id]
  );
  if(!own.rows[0]) return res.status(403).json({error:'Forbidden'});
  await pool.query('DELETE FROM change_orders WHERE id=$1',[req.params.id]);
  res.json({ok:true});
});

// ATTACHMENTS
app.post('/api/payapps/:id/attachments', auth, upload.single('file'), async (req,res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  // Verify user owns this pay app before attaching files
  const own = await pool.query(
    'SELECT pa.id FROM pay_apps pa JOIN projects p ON p.id=pa.project_id WHERE pa.id=$1 AND p.user_id=$2',
    [req.params.id, req.user.id]
  );
  if (!own.rows[0]) {
    try { fs.unlinkSync(req.file.path); } catch(_) {}
    return res.status(403).json({ error: 'Forbidden' });
  }
  // MIME type whitelist for attachments
  const allowedMime = ['application/pdf','image/jpeg','image/png','image/gif','image/webp',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv'];
  if (!allowedMime.includes(req.file.mimetype)) {
    try { fs.unlinkSync(req.file.path); } catch(_) {}
    return res.status(400).json({ error: 'File type not allowed. Accepted: PDF, images, Word, Excel, CSV.' });
  }
  const {originalname,filename,size,mimetype} = req.file;
  const r = await pool.query(
    'INSERT INTO attachments(pay_app_id,filename,original_name,file_size,mime_type) VALUES($1,$2,$3,$4,$5) RETURNING *',
    [req.params.id,filename,originalname,size,mimetype]
  );
  res.json(r.rows[0]);
});

app.delete('/api/attachments/:id', auth, async (req,res) => {
  const own = await pool.query(
    'SELECT a.filename FROM attachments a JOIN pay_apps pa ON pa.id=a.pay_app_id JOIN projects p ON p.id=pa.project_id WHERE a.id=$1 AND p.user_id=$2',
    [req.params.id, req.user.id]
  );
  if(!own.rows[0]) return res.status(403).json({error:'Forbidden'});
  await pool.query('DELETE FROM attachments WHERE id=$1',[req.params.id]);
  const fp = path.join(__dirname,'uploads',own.rows[0].filename);
  if(fs.existsSync(fp)) fs.unlinkSync(fp);
  res.json({ok:true});
});

// SOV PARSE — Human-first logic:
//   1. Find column whose HEADER says "Total" / "Amount" / "Scheduled Value" → amount column
//   2. Find column whose HEADER says "Description" / "Scope" / "Work" → desc column
//   3. If headers don't match, fall back to scoring (most numeric / most text cells)
//   4. Parse every data row that has both a description AND an amount > $0
//   5. Skip grand-total / subtotal summary rows (don't include them as line items)
function parseSOVFile(filePath) {
  const XLSX = require('xlsx');
  // Local helper to normalize summary row descriptions (subtotal/total/balance) to standard keys.
  // Defined inside parseSOVFile so it's available when QA test evals this function in isolation.
  function _xlsSummaryLabel(text) {
    const s = String(text).replace(/\s*[$\d,\.]+.*$/, '').trim().toLowerCase().replace(/\s+/g,' ');
    if (/sub[\s-]?total/.test(s))   return 'subtotal';
    if (/balance[\s-]?due/.test(s)) return 'balance_due';
    if (/amount[\s-]?paid/.test(s)) return 'amount_paid';
    if (/grand/.test(s))            return 'total';
    if (/^total/.test(s))           return 'total';
    return s.replace(/[^a-z0-9_]/g,'_').slice(0,30);
  }
  const workbook = XLSX.readFile(filePath);

  // Prefer Summary sheet
  let sheetName = workbook.SheetNames[0];
  for (const name of workbook.SheetNames) {
    if (/summary/i.test(name)) { sheetName = name; break; }
  }

  const worksheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  const nCols = json.reduce((m, r) => Math.max(m, r.length), 0);

  // ── Step 1: Scan first 30 rows for a header row with BOTH "Total" + "Description"
  // Require BOTH columns to be found before committing — a row with only "TOTAL COST"
  // is a section title, not a real header. Keep scanning until we find a row that has
  // both an amount header AND a description header in the same row.
  let headerRowIdx = -1, iAmt = -1, iDesc = -1, iItem = -1;
  let bestPartialRow = -1, bestPartialAmt = -1, bestPartialDesc = -1, bestPartialItem = -1;

  for (let ri = 0; ri < Math.min(json.length, 30); ri++) {
    const row = json[ri];
    let fAmt = -1, fDesc = -1, fItem = -1;
    for (let ci = 0; ci < row.length; ci++) {
      const h = String(row[ci]||'').trim();
      if (!h) continue;
      if (/^(total|scheduled\s*value|amount|cost|value|price|bid\s*total|contract\s*value)/i.test(h) && fAmt < 0) fAmt = ci;
      if (/^(description|scope|work|item\s*desc|name|trade|section\s*desc)/i.test(h) && fDesc < 0) fDesc = ci;
      if (/^(item\s*#?|sect(ion)?|no\.?|code|csi)/i.test(h) && fItem < 0) fItem = ci;
    }
    // Prefer a row that has BOTH amount + description headers
    if (fAmt >= 0 && fDesc >= 0) {
      headerRowIdx = ri; iAmt = fAmt; iDesc = fDesc;
      if (fItem >= 0) iItem = fItem;
      break;
    }
    // Track best partial match (only amount OR only description) as a fallback
    if ((fAmt >= 0 || fDesc >= 0) && bestPartialRow < 0) {
      bestPartialRow = ri; bestPartialAmt = fAmt; bestPartialDesc = fDesc; bestPartialItem = fItem;
    }
  }
  // Fall back to partial match if no row had both
  if (headerRowIdx < 0 && bestPartialRow >= 0) {
    headerRowIdx = bestPartialRow;
    if (bestPartialAmt  >= 0) iAmt  = bestPartialAmt;
    if (bestPartialDesc >= 0) iDesc = bestPartialDesc;
    if (bestPartialItem >= 0) iItem = bestPartialItem;
  }

  // ── Step 2a: Desc scoring first (needed to anchor cost code detection) ────────
  const descScore = new Array(nCols).fill(0);
  const amtScore  = new Array(nCols).fill(0);
  for (const row of json) {
    for (let ci = 0; ci < row.length; ci++) {
      const cell = String(row[ci]||'').trim();
      if (!cell || cell.length < 2) continue;
      const n = parseFloat(cell.replace(/[$,\s]/g,''));
      if (cell.length > 5 && (isNaN(n) || /[a-zA-Z]/.test(cell))) descScore[ci]++;
      else if (!isNaN(n) && n > 50) amtScore[ci]++;
    }
  }
  if (iDesc < 0) {
    const maxD = Math.max(...descScore);
    iDesc = maxD > 0 ? descScore.indexOf(maxD) : 1;
  }

  // ── Step 2b: Pre-detect cost code columns — only LEFT of description column ──
  // Cost codes (CSI 4-6 digit ints like 01000, 23000) are ALWAYS to the left of
  // descriptions. Amounts are ALWAYS to the right. This prevents 4-digit dollar
  // amounts (e.g. $6,003) from being misidentified as cost codes.
  const costCodeCols = new Set();
  const descAnchor = iDesc >= 0 ? iDesc : Math.floor(nCols / 2);
  for (let ci = 0; ci < descAnchor; ci++) {
    let total = 0, codeCount = 0;
    for (const row of json) {
      const v = String(row[ci]||'').trim();
      if (!v) continue;
      total++;
      if (/^\d{4,6}$/.test(v)) codeCount++;
    }
    if (total > 3 && codeCount / total >= 0.6) costCodeCols.add(ci);
  }

  // ── Step 2c: Amount scoring — exclude known cost code columns ────────────────
  if (iAmt < 0) {
    // Re-score amounts excluding cost code cols; rightmost highest-count col wins
    const amtScore2 = new Array(nCols).fill(0);
    for (const row of json) {
      for (let ci = 0; ci < row.length; ci++) {
        if (ci === iDesc || costCodeCols.has(ci)) continue;
        const cell = String(row[ci]||'').trim();
        if (!cell || cell.length < 2) continue;
        const n = parseFloat(cell.replace(/[$,\s]/g,''));
        if (!isNaN(n) && n > 50) amtScore2[ci]++;
      }
    }
    let best = 0;
    for (let ci = 0; ci < nCols; ci++) {
      if (ci === iDesc || costCodeCols.has(ci)) continue;
      if (amtScore2[ci] >= best) { best = amtScore2[ci]; iAmt = ci; }
    }
  }
  if (iItem < 0) {
    // Prefer a detected cost code column; fall back to column before description
    for (const ci of costCodeCols) {
      if (ci !== iAmt && ci !== iDesc) { iItem = ci; break; }
    }
    if (iItem < 0) { iItem = iDesc > 0 ? iDesc - 1 : 0; }
    if (iItem === iAmt) iItem = 0;
  }

  if (iAmt < 0) {
    return { headers: ['Item #','Description','Scheduled Value'], sheetName, allRows: [], parentRows: [], iItem, iDesc, iAmt };
  }

  // ── Step 3: Parse data rows — skip summary/total rows, collect line items ───
  const xlsSummary = {};  // captures subtotal/total rows as metadata
  const isSummary = (desc, itemId, amt) => {
    const isSum = /^(total|subtotal|grand\s*total|total\s+project|total\s+bid|total\s+cost)/i.test(desc) ||
                  /^(total|subtotal|grand\s*total)$/i.test(itemId);
    if (isSum && !isNaN(amt) && amt > 0) {
      // Prefer itemId for label when it looks like a summary keyword (e.g. "TOTAL"), else use desc
      const labelText = /^(total|subtotal|grand)/i.test(itemId) ? itemId : (desc || itemId);
      const key = _xlsSummaryLabel(labelText);
      xlsSummary[key] = Math.round(amt * 100) / 100;
    }
    return isSum;
  };

  const isHeaderLabel = (desc) =>
    /^(section|description|item|scope|no\.|#|trade|work\s*item|csi)/i.test(desc);

  // ── Step 3: First pass — collect ALL candidate rows (including both section headers
  //   and their sub-items) so that section-header detection can see the full picture.
  //   Amounts of 0 / "By Others" are still excluded.  Dedup happens after filtering.

  const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
  const rawRows  = [];                   // ordered, includes section headers

  for (let ri = startRow; ri < json.length; ri++) {
    const row    = json[ri];
    const desc   = String(row[iDesc]||'').trim();
    const itemId = String(row[iItem]||'').trim();
    const rawAmt = String(row[iAmt] ||'').replace(/[$,\s]/g,'');
    const amt    = Math.round(parseFloat(rawAmt));

    if (!desc || desc.length < 2) continue;
    if (isHeaderLabel(desc)) continue;
    if (isSummary(desc, itemId, parseFloat(rawAmt))) continue;  // skip Grand Total rows; capture as summary metadata
    if (isNaN(amt) || amt <= 0) continue;   // skip "By Others", blank amounts

    // isParent: ends-in-000 CSI division codes, short alpha codes (GC/GL), or blank code
    const isParent = /000$/.test(itemId) || /^[A-Z]{1,5}$/.test(itemId) || itemId === '';
    rawRows.push({ item_id: itemId, description: desc, scheduled_value: amt, is_parent: isParent });
  }

  // ── Post-process 1: detect & remove CSI section-header rows ──────────────────
  // A row is a section header if:
  //   (a) its code ends in "000" (e.g. 01000, 02000, 153000), AND
  //   (b) the rows that immediately follow it — up to (but not including) the
  //       next "000"-ending row — sum to approximately its own amount (±5%).
  // This handles files that list both a division total and its individual line items.
  // Files where "000" codes are standalone items (no matching sub-item sum) are unaffected.
  const sectionHeaderIndices = new Set();
  for (let i = 0; i < rawRows.length; i++) {
    const code = rawRows[i].item_id;
    if (!/^\d{4,6}$/.test(code) || !/000$/.test(code)) continue;  // only "000" numeric codes

    // Sum rows between this "000" row and the next "000"-ending row
    let subSum = 0;
    let hasSubRows = false;
    for (let j = i + 1; j < rawRows.length; j++) {
      const nextCode = rawRows[j].item_id;
      if (/^\d{4,6}$/.test(nextCode) && /000$/.test(nextCode)) break;  // stop at next "000" row
      subSum += rawRows[j].scheduled_value;
      hasSubRows = true;
    }

    // If sub-items sum to ≈ section header amount (within 5%), this is a section header
    const headerAmt = rawRows[i].scheduled_value;
    if (hasSubRows && headerAmt > 0 && Math.abs(subSum - headerAmt) / headerAmt <= 0.05) {
      sectionHeaderIndices.add(i);
    }
  }

  const filteredRows = rawRows.filter((_, i) => !sectionHeaderIndices.has(i));

  // ── Post-process 2: dedup by (description + amount) on the filtered rows ─────
  // Two rows with the same description AND same amount are true duplicates (drop the
  // second). Two rows with the same description but different amounts are separate
  // scopes (e.g. two "Demo" items at different prices) — keep both.
  const seen = new Set();
  const allRows = filteredRows.filter(row => {
    const key = row.description.toLowerCase() + '|' + row.scheduled_value;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const parentRows = allRows.filter(r => r.is_parent);

  return { headers: ['Item #','Description','Scheduled Value'], sheetName, allRows, parentRows, iItem, iDesc, iAmt, summary: xlsSummary };
}

// ── Node.js PDF/DOCX SOV parser (replaces Python parse_sov.py) ─────────────────
// Parses contractor estimate PDFs and Word docs into line items.
// Uses pdf-parse (PDF) and mammoth (DOCX) — pure JS, no Python needed.

// Lines to skip entirely — boilerplate, not scope or money
// NOTE: tax / overhead / company overhead are NOT skipped — they are real billable line items
const SKIP_RE = /^(\*|•|·|–|—|-{2,})|^(terms|signature|page \d|note[:\s]|excludes|it is an honor|we thank|sincerely|dear |http|www\.)/i;
// Financial summary rows: captured as metadata, NOT added as line items
const SUMMARY_RE = /^(subtotal|sub[\s\-]total|grand[\s\-]total|total[\s\-]amount|balance[\s\-]due|amount[\s\-]paid|amount[\s\-]due|total[\s\(\$\-]|total\s*$)/i;
function extractSummaryLabel(line) {
  const s = line.replace(/\s*\$[\d,]+(?:\.\d{1,2})?.*$/, '').trim().toLowerCase().replace(/\s+/g,' ');
  if (/sub[\s-]?total/.test(s))   return 'subtotal';
  if (/balance[\s-]?due/.test(s)) return 'balance_due';
  if (/amount[\s-]?paid/.test(s)) return 'amount_paid';
  if (/amount[\s-]?due/.test(s))  return 'amount_due';
  if (/grand/.test(s))            return 'total';
  if (/^total/.test(s))           return 'total';
  return s.replace(/[^a-z0-9_]/g,'_').slice(0,30);
}
// Skip metadata lines: license numbers, addresses, dates — not work items
const SKIP_META_RE = /\b(lic(ense)?(\s*#|\s+no\.?)?|p\.?o\.?\s*box|phone|fax|e[\-]?mail|zip|contractor'?s)\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2},?\s*\d{4}/i;

function extractAmounts(text) {
  // First try $X,XXX.XX format (explicit dollar sign)
  const dollarMatches = (text.match(/\$[\d,]+(?:\.\d{1,2})?/g) || [])
    .map(m => parseFloat(m.replace(/[$,]/g, '')));
  if (dollarMatches.length) return dollarMatches;
  // Fallback: comma-formatted numbers at end of line (e.g. "Painting - Interior  18,913")
  // Requires X,XXX comma grouping — filters out zip codes, years, license plate numbers
  const bareMatches = (text.match(/\b(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)\s*$/g) || [])
    .map(m => parseFloat(m.trim().replace(/,/g, '')))
    .filter(n => n >= 100 && n <= 500000); // realistic single line-item range
  return bareMatches;
}

function cleanDesc(s) {
  return s
    .replace(/^[\*\•\-–—·]+\s*/, '')  // leading bullets
    .replace(/^\d{4,6}\s+/, '')        // strip leading CSI/item code ("11300 " → "")
    .replace(/^\d{5}(?=[A-Za-z])/, '') // strip concatenated 5-digit code ("95600Tile" → "Tile")
    .replace(/\s+/g, ' ')
    .trim();
}

function rowsFromLines(lines) {
  // Pre-process: many contractor PDFs put description on one line, amount on the next.
  // Merge "line with no amount" + "next line that is just a $amount" into a single line.
  // IMPORTANT: only merge onto lines that would NOT be skipped by SKIP_RE/SKIP_META_RE,
  // otherwise e.g. "$12,331" merges onto "TOTAL" and the Fee row is lost.
  const merged = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const isJustDollarAmt = /^\$[\d,]+(?:\.\d{1,2})?$/.test(line);
    if (isJustDollarAmt && merged.length > 0) {
      const prev = merged[merged.length - 1];
      const prevWouldBeSkipped = SKIP_RE.test(prev) || SKIP_META_RE.test(prev);
      if (!prevWouldBeSkipped && !extractAmounts(prev).length) {
        merged[merged.length - 1] = prev + ' ' + line;
        continue;
      }
    }
    merged.push(line);
  }

  const rows = [];
  const summary = {};
  const seen = new Set();
  let counter = 1000;
  let pendingDesc = null; // for PDFs where description is on one line, "CODE $amount" on the next
  for (const raw of merged) {
    const line = raw.trim();
    if (line.length < 5) { pendingDesc = null; continue; }
    // Capture financial summary rows as metadata (subtotal, total, balance due, etc.)
    if (SUMMARY_RE.test(line)) {
      const amts = extractAmounts(line);
      if (amts.length) summary[extractSummaryLabel(line)] = Math.round(amts[amts.length-1] * 100) / 100;
      pendingDesc = null;
      continue;
    }
    if (SKIP_RE.test(line)) { pendingDesc = null; continue; }
    if (SKIP_META_RE.test(line)) { pendingDesc = null; continue; }
    const amounts = extractAmounts(line);
    if (!amounts.length) {
      // No dollar amount — save as pending description in case next line has a "CODE $amount" pattern
      const candidate = cleanDesc(line.replace(/\s*\$[\d,]+(?:\.\d{1,2})?.*$/, '').trim());
      pendingDesc = (candidate.length >= 4 && !/^[\d\s.,\-]+$/.test(candidate)) ? candidate : null;
      continue;
    }
    const total = amounts[amounts.length - 1];
    if (total <= 0) { pendingDesc = null; continue; }
    // Description = everything before the amount (strip trailing $X,XXX or bare X,XXX)
    let desc = cleanDesc(
      line.replace(/\s*\$[\d,]+(?:\.\d{1,2})?.*$/, '')
          .replace(/\s+\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\s*$/, '')
          .trim()
    );
    // If description is empty or purely numeric (e.g. "23000"), try pending description from prior line
    if (desc.length < 4 || /^[\d\s.,\-]+$/.test(desc)) {
      if (pendingDesc) { desc = pendingDesc; }
      else { pendingDesc = null; continue; }
    }
    pendingDesc = null;
    if (SKIP_RE.test(desc)) continue;
    const key = desc.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ item_id: String(counter), description: desc, scheduled_value: Math.round(total * 100) / 100 });
    counter += 1000;
  }
  return {rows, summary};
}

async function parseSOVFromText(filePath, ext) {
  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse');
    const buf = fs.readFileSync(filePath);
    const data = await pdfParse(buf);
    return rowsFromLines((data.text || '').split('\n'));
  } else if (ext === '.docx' || ext === '.doc') {
    const mammoth = require('mammoth');
    // Try tables first (most structured)
    const rawResult = await mammoth.extractRawText({ path: filePath });
    const lines = (rawResult.value || '').split('\n');
    // Also try HTML to capture table cell content
    const htmlResult = await mammoth.convertToHtml({ path: filePath });
    const html = htmlResult.value || '';
    // Extract table cells: each <td> on its own line for better row detection
    const tableCells = [];
    const trMatches = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    for (const tr of trMatches) {
      const cells = (tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
        .map(td => td.replace(/<[^>]+>/g, ' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim())
        .filter(Boolean);
      if (cells.length >= 2) {
        // Find rightmost cell with a dollar amount as the value
        let amtIdx = -1;
        for (let i = cells.length - 1; i >= 0; i--) {
          if (extractAmounts(cells[i]).length) { amtIdx = i; break; }
        }
        if (amtIdx < 0) continue;
        const descCandidates = cells.slice(0, amtIdx).filter(c => c.length > 3 && !extractAmounts(c).length);
        if (!descCandidates.length) continue;
        const desc = descCandidates.reduce((a, b) => a.length >= b.length ? a : b);
        const amt = extractAmounts(cells[amtIdx]).slice(-1)[0];
        tableCells.push(`${desc} $${amt}`);
      }
    }
    const tableResult = rowsFromLines(tableCells);
    if (tableResult.rows && tableResult.rows.length > 0) return tableResult;
    // Fallback: plain text lines
    return rowsFromLines(lines);
  }
  return {rows: [], summary: {}};
}

app.post('/api/sov/parse', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (rejectFile(req, res, MIME_SOV, 'SOV')) return;
  const cleanup = () => { try { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch(_){} };
  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    let result;

    if (ext === '.pdf') {
      // PDF: pdfplumber (Python) first — correct multi-column table handling.
      // Falls back to pure-JS pdf-parse if Python is not available on this server.
      let parsed = null;
      try {
        parsed = await new Promise((resolve, reject) => {
          const { spawn } = require('child_process');
          const tmpPdf = req.file.path + '.pdf';
          fs.renameSync(req.file.path, tmpPdf);
          const py = spawn('python3', [path.join(__dirname, 'parse_sov.py'), tmpPdf]);
          let out = '', err = '';
          py.stdout.on('data', d => out += d);
          py.stderr.on('data', d => err += d);
          py.on('error', (e) => {
            try { fs.renameSync(tmpPdf, req.file.path); } catch(_) {}
            reject(e);
          });
          py.on('close', code => {
            try { fs.renameSync(tmpPdf, req.file.path); } catch(_) {}
            const combined = out + err;
            let r = null;
            for (const s of [out, err]) { try { r = JSON.parse(s.trim()); break; } catch(_) {} }
            if (!r) { const m = combined.match(/\{[\s\S]*\}/); if (m) { try { r = JSON.parse(m[0]); } catch(_) {} } }
            if (r) return resolve(r);
            reject(new Error('Parser output: ' + combined.slice(0, 200)));
          });
        });
        console.log('[PDF] pdfplumber parsed', parsed.row_count, 'rows');
      } catch(e) {
        console.log('[PDF] Python unavailable, using pure-JS fallback:', e.message);
        parsed = await parseSOVFromText(req.file.path, ext);
      }
      const rows = (parsed && parsed.rows) || [];
      if (!rows.length) {
        cleanup();
        return res.status(422).json({ error: 'No line items with dollar amounts could be extracted from this PDF. If it is a scanned/image PDF, try uploading a Word (.docx) or Excel (.xlsx) version instead.' });
      }
      const summary = (parsed && parsed.summary) || {};
      const computed_total = (parsed && parsed.computed_total) || rows.reduce((s,r) => s + r.scheduled_value, 0);
      const reported_total = (parsed && parsed.reported_total) || summary.total || summary.balance_due || null;
      result = {
        rows, all_rows: rows,
        row_count: rows.length, total_rows: rows.length,
        summary, computed_total, reported_total,
        filename: req.file.originalname,
        sheet_used: 'PDF'
      };
    } else if (ext === '.docx' || ext === '.doc') {
      // Word docs: use Node.js mammoth parser
      const parsed = await parseSOVFromText(req.file.path, ext);
      const rows = parsed.rows || parsed;  // handle both old array and new {rows,summary}
      const summary = parsed.summary || {};
      if (!rows || rows.length === 0) {
        cleanup();
        return res.status(422).json({ error: 'No line items with dollar amounts could be extracted from this file. Please try uploading an Excel (.xlsx) version instead.' });
      }
      const computed_total = rows.reduce((s,r) => s + r.scheduled_value, 0);
      const reported_total = summary.total || summary.balance_due || null;
      result = {
        rows, all_rows: rows,
        row_count: rows.length, total_rows: rows.length,
        summary, computed_total, reported_total,
        filename: req.file.originalname,
        sheet_used: ext.replace('.','').toUpperCase()
      };
    } else {
      // Existing Node/XLSX parser for .xlsx/.xls/.csv
      const parsed = parseSOVFile(req.file.path);
      const summary = parsed.summary || {};
      const computed_total = parsed.allRows.reduce((s,r) => s + r.scheduled_value, 0);
      const reported_total = summary.total || summary.subtotal || null;
      result = {
        headers:    parsed.headers,
        detected:   { item: parsed.iItem, desc: parsed.iDesc, amt: parsed.iAmt },
        all_rows:   parsed.allRows,
        rows:       parsed.allRows,
        row_count:  parsed.allRows.length,
        total_rows: parsed.allRows.length,
        summary, computed_total, reported_total,
        filename:   req.file.originalname,
        sheet_used: parsed.sheetName
      };
    }

    cleanup();
    res.json(result);
  } catch(e) {
    cleanup();
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/projects/:id/sov/uploads', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM sov_uploads WHERE project_id=$1 ORDER BY uploaded_at DESC',[req.params.id]);
  res.json(r.rows);
});

// Contract routes handled below in Phase 1 section (lines ~2063+)

// ── Generate a self-contained HTML document that mirrors the on-screen preview ──
function generatePayAppHTML(pa, lines, cos, totals, logoBase64, sigBase64, photoAttachments=[]) {
  const { tComp, tRet, tPrevCert, tCO, contract, earned, due } = totals;
  const fmtM = n => '$' + parseFloat(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

  // Build G703 rows and accumulate totals
  let tSV=0, tPrev2=0, tThis2=0, tComp2=0, tRet2=0;
  const g703Rows = lines.map(r => {
    const sv   = parseFloat(r.scheduled_value);
    const prev = sv * parseFloat(r.prev_pct) / 100;
    const thisPer = sv * parseFloat(r.this_pct) / 100;
    const comp = prev + thisPer;
    const pctComp = sv > 0 ? comp / sv * 100 : 0;
    const ret  = comp * parseFloat(r.retainage_pct) / 100;
    const bal  = sv - comp;
    tSV += sv; tPrev2 += prev; tThis2 += thisPer; tComp2 += comp; tRet2 += ret;
    return `<tr>
      <td style="border:1px solid #ccc;padding:3px 5px">${r.item_id||''}</td>
      <td style="border:1px solid #ccc;padding:3px 5px">${r.description||''}</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(sv)}</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(prev)}</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(thisPer)}</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(comp)}</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${pctComp.toFixed(0)}%</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${parseFloat(r.retainage_pct).toFixed(0)}%</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(ret)}</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(bal)}</td>
    </tr>`;
  }).join('');

  const today = new Date().toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'});
  const contractDate = pa.contract_date ? new Date(pa.contract_date).toLocaleDateString() : '—';
  const paymentTerms = pa.payment_terms || pa.default_payment_terms || 'Due on receipt';

  // Logo: show image if uploaded, otherwise show company name as dignified fallback
  const companyDisplayName = pa.company_name || pa.contractor || '';
  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" style="max-width:110px;max-height:60px;object-fit:contain;display:block"/>`
    : `<div style="width:110px;min-height:50px;border:1px solid #ddd;border-radius:3px;display:flex;align-items:center;justify-content:center;padding:4px;text-align:center;font-size:8pt;font-weight:bold;color:#333;background:#f9f9f9">${companyDisplayName || '— Your Logo —'}</div>`;

  // Signature: show uploaded image if available, otherwise a clear blank signing area
  const contactName = pa.contact_name || '';
  const sigHtml = sigBase64
    ? `<img src="${sigBase64}" style="max-height:72px;max-width:240px;object-fit:contain;display:block;margin-bottom:4px"/>`
    : `<div style="height:52px"></div>`; /* blank space for wet ink signature */

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Times New Roman',Times,serif;font-size:9pt;color:#000;background:#fff}
/* G702 header */
.aia-header{display:flex;gap:10px;align-items:flex-start;border-bottom:2.5px solid #000;padding-bottom:10px;margin-bottom:8px}
.aia-logo-box{flex:0 0 115px}
.aia-title{flex:1}
.aia-title h1{font-size:12pt;font-weight:bold;margin-bottom:2px}
.aia-title h2{font-size:9.5pt;font-weight:normal;color:#444;margin-bottom:5px}
.aia-title p{font-size:8.5pt;margin:2px 0}
.aia-appnum{flex:0 0 145px;text-align:right;font-size:8.5pt;line-height:1.5}
.aia-appnum .big{font-size:15pt;font-weight:bold;display:block}
/* Payment terms */
.aia-payment-terms{font-size:8.5pt;background:#f5f9ff;border:1px solid #c8daf5;padding:4px 9px;border-radius:3px;margin-bottom:8px}
/* Summary grid */
.aia-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:10px}
.aia-cell{border:1px solid #ccc;padding:5px 8px;display:flex;justify-content:space-between;align-items:center;font-size:8.5pt}
.aia-cell-label{flex:1}
.aia-cell-val{font-weight:bold;white-space:nowrap;margin-left:8px}
.aia-cell-H{background:#fffbe6}
.aia-cell-H .aia-cell-val{font-size:13pt;color:#185FA5}
/* Distribution */
.aia-distribution{margin-bottom:10px;font-size:8.5pt}
.aia-dist-title{font-weight:bold;margin-bottom:5px}
.aia-dist-grid{display:flex;gap:18px}
.aia-dist-item{display:flex;align-items:center;gap:5px}
.aia-checkbox{width:13px;height:13px;border:1.5px solid #185FA5;border-radius:2px;flex-shrink:0}
.aia-checkbox.checked{background:#185FA5}
/* Signature boxes */
.aia-sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.aia-sig-box{border:1px solid #ccc;padding:10px;border-radius:4px}
.aia-sig-title{font-weight:bold;font-size:9pt;margin-bottom:6px;border-bottom:1px solid #eee;padding-bottom:4px}
.aia-sig-line{border-bottom:1px solid #333;margin:8px 0 4px}
.aia-sig-label{font-size:7.5pt;color:#555}
.aia-sig-note{font-size:7.5pt;color:#555;margin-bottom:8px;line-height:1.4}
/* G703 */
.aia-g703-section{page-break-before:always;padding-top:10px}
.g703-title{font-size:11pt;font-weight:bold;text-align:center;margin-bottom:3px}
.g703-sub{font-size:8pt;text-align:center;color:#555;margin-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:7.5pt}
th{background:#f0f0f0;border:1px solid #999;padding:4px 5px;font-size:7.5pt}
td{border:1px solid #ddd;padding:2px 5px}
.tfoot-row td{font-weight:bold;background:#f0f0f0;border:1px solid #ccc}
/* Branding footer */
.print-branding{text-align:center;margin-top:20px;padding-top:10px;border-top:1px solid #e0e0e0}
.brand-name{font-size:11pt;letter-spacing:0.3px;margin-bottom:3px}
.brand-tagline{font-size:8pt;color:#777;margin-bottom:3px;font-style:italic}
.brand-link{font-size:8pt;color:#185FA5;text-decoration:none}
</style></head>
<body>
<!-- G702 PAGE -->
<div class="aia-header">
  <div class="aia-logo-box">${logoHtml}</div>
  <div class="aia-title">
    <h1>Application and Certificate for Payment</h1>
    <h2>Document G702</h2>
    <p>TO OWNER: <strong>${pa.owner||'—'}</strong> &nbsp;&nbsp; PROJECT: <strong>${pa.pname||'—'}</strong></p>
    <p>FROM CONTRACTOR: <strong>${pa.contractor||'—'}</strong> &nbsp;&nbsp; ARCHITECT: <strong>${pa.architect||'—'}</strong></p>
  </div>
  <div class="aia-appnum">
    <span class="big">#${pa.app_number}</span>
    <div>Period: ${pa.period_label||'—'}</div>
    <div>Contract date: ${contractDate}</div>
    <div>Project No: ${pa.pnum||'—'}</div>
  </div>
</div>

<div class="aia-payment-terms"><strong>Payment Terms:</strong> ${paymentTerms}</div>

<div class="aia-grid">
  <div class="aia-cell"><span class="aia-cell-label">A. Original Contract Sum</span><span class="aia-cell-val">${fmtM(pa.original_contract)}</span></div>
  <div class="aia-cell"><span class="aia-cell-label">F. Total Earned Less Retainage (D-E)</span><span class="aia-cell-val">${fmtM(earned)}</span></div>
  <div class="aia-cell"><span class="aia-cell-label">B. Net Change by Change Orders</span><span class="aia-cell-val">${fmtM(tCO)}</span></div>
  <div class="aia-cell"><span class="aia-cell-label">G. Less Previous Certificates for Payment</span><span class="aia-cell-val">${fmtM(tPrevCert)}</span></div>
  <div class="aia-cell"><span class="aia-cell-label">C. Contract Sum to Date (A+B)</span><span class="aia-cell-val">${fmtM(contract)}</span></div>
  <div class="aia-cell aia-cell-H"><span class="aia-cell-label">H. CURRENT PAYMENT DUE</span><span class="aia-cell-val">${fmtM(due)}</span></div>
  <div class="aia-cell"><span class="aia-cell-label">D. Total Completed &amp; Stored to Date</span><span class="aia-cell-val">${fmtM(tComp)}</span></div>
  <div class="aia-cell"><span class="aia-cell-label">I. Balance to Finish, Plus Retainage</span><span class="aia-cell-val">${fmtM(contract-tComp+tRet)}</span></div>
  <div class="aia-cell"><span class="aia-cell-label">E. Retainage to Date</span><span class="aia-cell-val">${fmtM(tRet)}</span></div>
  <div class="aia-cell"></div>
</div>

<div class="aia-distribution">
  <div class="aia-dist-title">Distribution to:</div>
  <div class="aia-dist-grid">
    <div class="aia-dist-item"><div class="aia-checkbox checked"></div><span>Owner</span></div>
    <div class="aia-dist-item"><div class="aia-checkbox checked"></div><span>Architect</span></div>
    <div class="aia-dist-item"><div class="aia-checkbox"></div><span>Contractor file</span></div>
  </div>
</div>

<div class="aia-sig-grid">
  <div class="aia-sig-box">
    <div class="aia-sig-title">Contractor's Signed Certification</div>
    <p class="aia-sig-note">The undersigned Contractor certifies that to the best of the Contractor's knowledge, information and belief the Work covered by this Application for Payment has been completed in accordance with the Contract Documents.</p>
    ${sigHtml}
    <div class="aia-sig-line"></div>
    <div class="aia-sig-label">Authorized Signature &nbsp;&nbsp;&nbsp; Date: ${today}</div>
    ${contactName ? `<div style="font-size:8.5pt;font-weight:bold;margin-top:5px;color:#222">${contactName}</div><div style="font-size:7.5pt;color:#666">${companyDisplayName}</div>` : (companyDisplayName ? `<div style="font-size:8.5pt;font-weight:bold;margin-top:5px;color:#222">${companyDisplayName}</div>` : '')}
  </div>
  <div class="aia-sig-box">
    <div class="aia-sig-title">Architect's Certificate for Payment</div>
    <p class="aia-sig-note">In accordance with the Contract Documents, the Architect certifies to the Owner that the Work has progressed to the point indicated and the quality of the Work is in accordance with the Contract Documents.</p>
    <div style="font-size:8pt;margin-bottom:4px">Amount Certified: <strong>${pa.architect_certified ? fmtM(pa.architect_certified) : 'Pending'}</strong></div>
    <div class="aia-sig-line"></div>
    <div class="aia-sig-label">Architect Signature &nbsp;&nbsp;&nbsp; Date: ${pa.architect_date ? new Date(pa.architect_date).toLocaleDateString() : ''}</div>
  </div>
</div>

<!-- G703 PAGE (page break before) -->
<div class="aia-g703-section">
  <div class="g703-title">Continuation Sheet — Document G703</div>
  <div class="g703-sub">Application #${pa.app_number} &nbsp;—&nbsp; ${pa.period_label||''} &nbsp;—&nbsp; ${pa.pname||''}</div>
  <table>
    <thead>
      <tr>
        <th style="text-align:left;width:52px">Item</th>
        <th style="text-align:left">Description of Work</th>
        <th style="text-align:right;width:78px">Scheduled Value</th>
        <th style="text-align:right;width:75px">Work Prev. Billed</th>
        <th style="text-align:right;width:72px">Work This Period</th>
        <th style="text-align:right;width:72px">Total Completed</th>
        <th style="text-align:right;width:44px">% Comp.</th>
        <th style="text-align:right;width:40px">Ret.%</th>
        <th style="text-align:right;width:70px">Retainage $</th>
        <th style="text-align:right;width:72px">Balance to Finish</th>
      </tr>
    </thead>
    <tbody>${g703Rows}</tbody>
    <tfoot>
      <tr class="tfoot-row">
        <td></td>
        <td>GRAND TOTAL</td>
        <td style="text-align:right">${fmtM(tSV)}</td>
        <td style="text-align:right">${fmtM(tPrev2)}</td>
        <td style="text-align:right">${fmtM(tThis2)}</td>
        <td style="text-align:right">${fmtM(tComp2)}</td>
        <td style="text-align:right">${tSV>0?(tComp2/tSV*100).toFixed(0)+'%':'0%'}</td>
        <td></td>
        <td style="text-align:right">${fmtM(tRet2)}</td>
        <td style="text-align:right">${fmtM(tSV-tComp2)}</td>
      </tr>
    </tfoot>
  </table>
  <div class="print-branding">
    <div class="brand-name"><span style="color:#6B2FA0;font-weight:bold">Construct</span><span style="color:#E87722;font-weight:bold">Invoice</span> <span style="color:#009B8D;font-weight:bold">AI</span></div>
    <div class="brand-tagline">$0 to use — pay it forward instead: feed a child, help a neighbor 🙏</div>
    <a href="https://constructinv.varshyl.com" class="brand-link">constructinv.varshyl.com</a>
  </div>
</div>
${photoAttachments.length ? `
<div style="page-break-before:always;padding:28px 36px">
  <div style="border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:18px">
    <span style="font-size:12pt;font-weight:bold;font-family:'Times New Roman',serif">Site Photos — Attachment</span>
    <span style="font-size:9pt;color:#555;margin-left:12px">Pay App #${pa.app_number}${pa.period_label ? ' · ' + pa.period_label : ''}</span>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:16px">
    ${photoAttachments.map((p, i) => `
    <div style="break-inside:avoid;text-align:center;width:245px">
      <img src="${p.base64}" style="width:245px;max-height:200px;object-fit:contain;border:1px solid #ccc;display:block"/>
      <div style="font-size:7.5pt;color:#666;margin-top:4px;word-break:break-word">${p.name || ('Photo ' + (i+1))}</div>
    </div>`).join('')}
  </div>
</div>` : ''}
</body></html>`;
}

// PDF
app.get('/api/payapps/:id/pdf', async (req,res) => {
  const token = req.query.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  let decoded;
  try { decoded = jwt.verify(token, JWT_SECRET); } catch(e) { return res.status(401).json({error:'Invalid token'}); }

  const paRes = await pool.query(
    `SELECT pa.*,p.name as pname,p.owner,p.contractor,p.architect,p.original_contract,
            p.number as pnum,p.payment_terms,p.contract_date,
            cs.logo_filename,cs.signature_filename,cs.default_payment_terms,
            cs.contact_name,cs.company_name
     FROM pay_apps pa
     JOIN projects p ON p.id=pa.project_id
     LEFT JOIN company_settings cs ON cs.user_id=p.user_id
     WHERE pa.id=$1 AND p.user_id=$2`,
    [req.params.id, decoded.id]
  );
  const pa = paRes.rows[0];
  if(!pa) return res.status(404).json({error:'Not found'});
  await logEvent(decoded.id, 'pdf_downloaded', { pay_app_id: parseInt(req.params.id) });
  const lines = await pool.query(
    'SELECT pal.*,sl.item_id,sl.description,sl.scheduled_value FROM pay_app_lines pal JOIN sov_lines sl ON sl.id=pal.sov_line_id WHERE pal.pay_app_id=$1 ORDER BY sl.sort_order',
    [req.params.id]
  );
  const cos = await pool.query('SELECT * FROM change_orders WHERE pay_app_id=$1',[req.params.id]);

  let tComp=0,tRet=0,tThis=0,tPrev=0,tPrevCert=0;
  lines.rows.forEach(r=>{
    const sv=parseFloat(r.scheduled_value);
    const retPct=parseFloat(r.retainage_pct)/100;
    const prev=sv*parseFloat(r.prev_pct)/100;
    const thisPer=sv*parseFloat(r.this_pct)/100;
    const comp=prev+thisPer+parseFloat(r.stored_materials||0);
    tPrev+=prev; tThis+=thisPer; tComp+=comp;
    tRet+=comp*retPct;
    // G = F from previous apps = prev work less retainage held on prev work
    tPrevCert+=prev*(1-retPct);
  });
  const tCO=cos.rows.reduce((s,c)=>s+parseFloat(c.amount||0),0);
  const contract=parseFloat(pa.original_contract)+tCO;
  const earned=tComp-tRet;
  const due=Math.max(0,earned-tPrevCert);

  // ── Load logo and signature as base64 for embedding ──────────────────────
  // Detect image MIME from magic bytes (multer saves files without extension)
  const imgMime = buf => {
    if (buf[0]===0x89 && buf[1]===0x50) return 'image/png';
    if (buf[0]===0xFF && buf[1]===0xD8) return 'image/jpeg';
    if (buf[0]===0x47 && buf[1]===0x49) return 'image/gif';
    if (buf[0]===0x52 && buf[1]===0x49) return 'image/webp';
    return 'image/png'; // safe fallback
  };
  const readImgB64 = filename => {
    if (!filename) return null;
    try {
      const fp = path.join(__dirname, 'uploads', filename);
      if (!fs.existsSync(fp)) return null;
      const buf = fs.readFileSync(fp);
      return `data:${imgMime(buf)};base64,${buf.toString('base64')}`;
    } catch(e) { return null; }
  };
  const logoBase64 = readImgB64(pa.logo_filename);
  const sigBase64  = readImgB64(pa.signature_filename);

  // ── Load photo attachments for this pay app ───────────────────────────────
  const photoAttsRes = await pool.query(
    `SELECT filename, original_name FROM attachments WHERE pay_app_id=$1 AND mime_type LIKE 'image/%' ORDER BY uploaded_at`,
    [req.params.id]
  );
  const photoAttachments = photoAttsRes.rows.map(a => {
    const b64 = readImgB64(a.filename);
    if (!b64) return null;
    return { base64: b64, name: a.original_name || a.filename, filePath: path.join(__dirname, 'uploads', a.filename) };
  }).filter(Boolean);

  const totals = { tComp, tRet, tPrevCert, tCO, contract, earned, due };
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="PayApp_${pa.app_number}_${(pa.pname||'').replace(/\s+/g,'_')}.pdf"`);

  // ── Puppeteer: pixel-perfect PDF matching the on-screen preview ──────────
  if (puppeteer) {
    let browser;
    try {
      const html = generatePayAppHTML(pa, lines.rows, cos.rows, totals, logoBase64, sigBase64, photoAttachments);
      browser = await puppeteer.launch({
        args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu']
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: { top: '0.5in', right: '0.45in', bottom: '0.5in', left: '0.45in' }
      });
      res.send(pdfBuffer);
      return;
    } catch(puppErr) {
      console.error('[PDF] Puppeteer error, falling back to PDFKit:', puppErr.message);
    } finally {
      if (browser) await browser.close().catch(()=>{});
    }
  }

  // ── PDFKit fallback (used if Puppeteer unavailable or errored) ────────────
  const doc=new PDFDocument({size:'LETTER',margin:45});
  doc.pipe(res);

  doc.fontSize(15).font('Helvetica-Bold').text('Document G702',{align:'center'});
  doc.fontSize(10).font('Helvetica').text('Application and Certificate for Payment',{align:'center'});
  doc.moveDown(0.4);
  doc.moveTo(45,doc.y).lineTo(567,doc.y).lineWidth(0.5).stroke();
  doc.moveDown(0.4);
  const L=45,R=310;
  doc.fontSize(9);
  [
    ['Project: '+(pa.pname||''), 'Application No: '+pa.app_number],
    ['Owner: '+(pa.owner||''),   'Period: '+(pa.period_label||'')],
    ['Contractor: '+(pa.contractor||''), 'Contract Date: '+(pa.contract_date?new Date(pa.contract_date).toLocaleDateString():'')],
    ['Architect: '+(pa.architect||''),   'Project No: '+(pa.pnum||'')]
  ].forEach(([l,r])=>{
    const y=doc.y;
    doc.font('Helvetica').text(l,L,y,{width:240});
    doc.text(r,R,y,{width:240});
  });
  doc.moveDown(0.4);
  doc.moveTo(45,doc.y).lineTo(567,doc.y).lineWidth(0.5).stroke();
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(10).text('Summary of Work');
  doc.moveDown(0.2);
  [
    ['A.','Original Contract Sum',fmt(pa.original_contract)],
    ['B.','Net Change by Change Orders',fmt(tCO)],
    ['C.','Contract Sum to Date (A+B)',fmt(contract)],
    ['D.','Total Completed and Stored to Date',fmt(tComp)],
    ['E.','Retainage to Date',fmt(tRet)],
    ['F.','Total Earned Less Retainage (D-E)',fmt(earned)],
    ['G.','Less Previous Certificates for Payment',fmt(tPrevCert)],
    ['H.','CURRENT PAYMENT DUE',fmt(due)],
    ['I.','Balance to Finish, Plus Retainage',fmt(contract-tComp+tRet)]
  ].forEach(([ltr,lbl,val])=>{
    const y=doc.y;
    doc.font(ltr==='H.'?'Helvetica-Bold':'Helvetica').fontSize(9);
    doc.text(ltr,L,y,{width:18});
    doc.text(lbl,L+20,y,{width:330});
    doc.text(val,L+360,y,{width:140,align:'right'});
  });

  doc.addPage();
  doc.fontSize(13).font('Helvetica-Bold').text('Document G703 - Continuation Sheet',{align:'center'});
  doc.fontSize(9).font('Helvetica').text('Application #'+pa.app_number+'  -  '+(pa.period_label||'')+'  -  '+(pa.pname||''),{align:'center'});
  doc.moveDown(0.5);
  const cx=[45,90,160,235,293,340,393,448,488,532];
  const cw=[43,68,73,56,45,51,53,38,42,40];
  const hdrs=['Item','Description','Sched Value','Prev Billed','% Prev','This Period','Total Comp','Ret%','Retainage','Balance'];
  const hy=doc.y;
  doc.font('Helvetica-Bold').fontSize(7);
  hdrs.forEach((h,i)=>doc.text(h,cx[i],hy,{width:cw[i],align:i>1?'right':'left'}));
  doc.moveDown(0.3);
  doc.moveTo(45,doc.y).lineTo(567,doc.y).lineWidth(0.5).stroke();
  doc.font('Helvetica').fontSize(7);
  let tSV2=0,tPrev2=0,tThis2=0,tComp2=0,tRet2=0;
  lines.rows.forEach(r=>{
    const sv=parseFloat(r.scheduled_value);
    const prev=sv*parseFloat(r.prev_pct)/100;
    const thisPer=sv*parseFloat(r.this_pct)/100;
    const comp=prev+thisPer;
    const ret=comp*parseFloat(r.retainage_pct)/100;
    const bal=sv-comp;
    tSV2+=sv; tPrev2+=prev; tThis2+=thisPer; tComp2+=comp; tRet2+=ret;
    if(doc.y>700){ doc.addPage(); doc.fontSize(7); }
    const y=doc.y;
    [r.item_id,r.description,fmt(sv),fmt(prev),parseFloat(r.prev_pct).toFixed(0)+'%',fmt(thisPer),fmt(comp),parseFloat(r.retainage_pct).toFixed(0)+'%',fmt(ret),fmt(bal)]
      .forEach((v,i)=>doc.text(v,cx[i],y,{width:cw[i],align:i>1?'right':'left'}));
  });
  doc.moveDown(0.3);
  doc.moveTo(45,doc.y).lineTo(567,doc.y).lineWidth(0.5).stroke();
  doc.font('Helvetica-Bold').fontSize(7);
  const ty=doc.y+2;
  ['','GRAND TOTAL',fmt(tSV2),fmt(tPrev2),'',fmt(tThis2),fmt(tComp2),'',fmt(tRet2),fmt(tSV2-tComp2)]
    .forEach((v,i)=>doc.text(v,cx[i],ty,{width:cw[i],align:i>1?'right':'left'}));

  // ── Append lien waiver if one is linked to this pay app ─────────────────
  try {
    const lienRes = await pool.query(
      `SELECT ld.*, p.name, p.owner, p.contractor, p.location, p.city, p.state, p.contact as location_contact,
              cs.logo_filename, cs.company_name
       FROM lien_documents ld
       JOIN projects p ON p.id = ld.project_id
       LEFT JOIN company_settings cs ON cs.user_id = p.user_id
       WHERE ld.pay_app_id=$1
       ORDER BY ld.created_at DESC LIMIT 1`,
      [req.params.id]
    );
    if (lienRes.rows[0]) {
      const lien = lienRes.rows[0];
      doc.addPage();
      // Thin separator note at top of page
      doc.fontSize(7.5).font('Helvetica').fillColor('#888888')
         .text('ATTACHMENT — LIEN WAIVER', 45, 45, { align: 'center', width: 522 });
      doc.moveTo(45, 55).lineTo(567, 55).lineWidth(0.3).stroke('#CCCCCC');
      doc.fillColor('#000000');
      doc.y = 65;

      const project = {
        name: lien.name,
        owner: lien.owner,
        contractor: lien.contractor || lien.company_name,
        company_name: lien.company_name,
        location: lien.location_contact,
        city: lien.city,
        state: lien.state,
        logo_filename: lien.logo_filename,
      };
      renderLienWaiverContent(doc, {
        doc_type: lien.doc_type,
        project,
        through_date: lien.through_date,
        amount: lien.amount,
        maker_of_check: lien.maker_of_check,
        check_payable_to: lien.check_payable_to,
        signatory_name: lien.signatory_name,
        signatory_title: lien.signatory_title,
        signedAt: new Date(lien.signed_at),
        ip: lien.signatory_ip || 'on file',
        jurisdiction: lien.jurisdiction || 'california',
        pay_app_ref: `Pay App #${pa.app_number}${pa.period_label ? ' — ' + pa.period_label : ''}`,
        startX: 45,
        pageW: 522
      });
    }
  } catch(lienErr) { console.error('Lien append error:', lienErr.message); }

  // ── Photo attachments (PDFKit fallback path) ─────────────────────────────
  for (const att of photoAttachments) {
    try {
      if (att.filePath && fs.existsSync(att.filePath)) {
        doc.addPage();
        doc.fontSize(9).font('Helvetica-Bold').text('Site Photo', 45, 45);
        doc.fontSize(8).font('Helvetica').fillColor('#555').text(att.name || '', 45, 58);
        doc.fillColor('#000');
        doc.image(att.filePath, 45, 80, { fit: [522, 640], align: 'center', valign: 'top' });
      }
    } catch(photoErr) { console.error('Photo page error:', photoErr.message); }
  }

  doc.end();
});

// ── Email pay application (PDF + lien waiver attached) ───────────────────
app.post('/api/payapps/:id/email', auth, async (req, res) => {
  const { to, cc, subject, message } = req.body;
  if (!to) return res.status(400).json({ error: 'Recipient email (to) is required' });

  try {
    // Load pay app data
    const paRes = await pool.query(
      `SELECT pa.*,p.name as pname,p.owner,p.contractor,p.architect,p.original_contract,
              p.number as pnum,p.payment_terms,p.contract_date,
              cs.logo_filename,cs.signature_filename,cs.default_payment_terms,
              cs.contact_name,cs.company_name
       FROM pay_apps pa
       JOIN projects p ON p.id=pa.project_id
       LEFT JOIN company_settings cs ON cs.user_id=p.user_id
       WHERE pa.id=$1 AND p.user_id=$2`,
      [req.params.id, req.user.id]
    );
    const pa = paRes.rows[0];
    if (!pa) return res.status(404).json({ error: 'Pay app not found' });

    const lines = await pool.query(
      'SELECT pal.*,sl.item_id,sl.description,sl.scheduled_value FROM pay_app_lines pal JOIN sov_lines sl ON sl.id=pal.sov_line_id WHERE pal.pay_app_id=$1 ORDER BY sl.sort_order',
      [req.params.id]
    );
    const cos = await pool.query('SELECT * FROM change_orders WHERE pay_app_id=$1', [req.params.id]);

    // Calculate totals
    let tComp=0, tRet=0, tPrevCert=0;
    lines.rows.forEach(r => {
      const sv=parseFloat(r.scheduled_value);
      const retPct=parseFloat(r.retainage_pct)/100;
      const prev=sv*parseFloat(r.prev_pct)/100;
      const thisPer=sv*parseFloat(r.this_pct)/100;
      const comp=prev+thisPer+parseFloat(r.stored_materials||0);
      tComp+=comp; tRet+=comp*retPct; tPrevCert+=prev*(1-retPct);
    });
    const tCO=cos.rows.reduce((s,c)=>s+parseFloat(c.amount||0),0);
    const contract=parseFloat(pa.original_contract)+tCO;
    const earned=tComp-tRet;
    const due=Math.max(0,earned-tPrevCert);
    const totals={tComp,tRet,tPrevCert,tCO,contract,earned,due};

    // Load images (reuse same helper pattern as PDF route)
    const imgMimeE = buf => {
      if (buf[0]===0x89 && buf[1]===0x50) return 'image/png';
      if (buf[0]===0xFF && buf[1]===0xD8) return 'image/jpeg';
      if (buf[0]===0x47 && buf[1]===0x49) return 'image/gif';
      return 'image/png';
    };
    const readImgB64E = filename => {
      if (!filename) return null;
      try {
        const fp = path.join(__dirname, 'uploads', filename);
        if (!fs.existsSync(fp)) return null;
        const buf = fs.readFileSync(fp);
        return `data:${imgMimeE(buf)};base64,${buf.toString('base64')}`;
      } catch(e) { return null; }
    };
    const logoBase64 = readImgB64E(pa.logo_filename);
    const sigBase64  = readImgB64E(pa.signature_filename);

    const photoAttsRes = await pool.query(
      `SELECT filename, original_name FROM attachments WHERE pay_app_id=$1 AND mime_type LIKE 'image/%' ORDER BY uploaded_at`,
      [req.params.id]
    );
    const photoAttachments = photoAttsRes.rows.map(a => {
      const b64 = readImgB64E(a.filename);
      if (!b64) return null;
      return { base64: b64, name: a.original_name || a.filename, filePath: path.join(__dirname, 'uploads', a.filename) };
    }).filter(Boolean);

    // Generate pay app PDF buffer via Puppeteer
    const html = generatePayAppHTML(pa, lines.rows, cos.rows, totals, logoBase64, sigBase64, photoAttachments);
    const pdfFilename = `PayApp_${pa.app_number}_${(pa.pname||'').replace(/\s+/g,'_')}.pdf`;
    const emailAttachments = [];

    if (puppeteer) {
      let browser;
      try {
        browser = await puppeteer.launch({
          args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu']
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuf = await page.pdf({
          format: 'Letter',
          printBackground: true,
          margin: { top: '0.5in', right: '0.45in', bottom: '0.5in', left: '0.45in' }
        });
        emailAttachments.push({ filename: pdfFilename, content: Buffer.from(pdfBuf).toString('base64') });
      } finally {
        if (browser) await browser.close().catch(()=>{});
      }
    }

    // Attach lien waiver PDF if one is linked
    try {
      const lienRes = await pool.query(
        `SELECT ld.filename, ld.doc_type FROM lien_documents ld
         JOIN projects p ON p.id=ld.project_id
         WHERE ld.pay_app_id=$1 AND p.user_id=$2
         ORDER BY ld.created_at DESC LIMIT 1`,
        [req.params.id, req.user.id]
      );
      if (lienRes.rows[0]) {
        const lienPath = path.join(__dirname, 'uploads', lienRes.rows[0].filename);
        if (fs.existsSync(lienPath)) {
          const lienBuf = fs.readFileSync(lienPath);
          emailAttachments.push({
            filename: `Lien_Waiver_${(lienRes.rows[0].doc_type||'waiver').replace(/\s+/g,'_')}_PayApp${pa.app_number}.pdf`,
            content: lienBuf.toString('base64')
          });
        }
      }
    } catch(lienErr) { console.error('[Email] Lien attach error:', lienErr.message); }

    // Build HTML email body
    const safeMsg = (message||'').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    const emailHtml = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#185FA5;padding:18px 24px;color:#fff">
        <h2 style="margin:0;font-size:16pt">Pay Application #${pa.app_number}</h2>
        <div style="font-size:10pt;margin-top:4px;opacity:0.9">${pa.pname||''} · ${pa.period_label||''}</div>
      </div>
      <div style="padding:24px;border:1px solid #ddd;border-top:0">
        ${safeMsg ? `<p style="margin-top:0">${safeMsg}</p><hr style="border:0;border-top:1px solid #eee;margin:16px 0">` : ''}
        <table style="width:100%;border-collapse:collapse;font-size:10pt">
          <tr><td style="padding:5px 8px;color:#555">Project</td><td style="padding:5px 8px;font-weight:bold">${pa.pname||''}</td></tr>
          <tr style="background:#f7f7f7"><td style="padding:5px 8px;color:#555">Application #</td><td style="padding:5px 8px">${pa.app_number}</td></tr>
          <tr><td style="padding:5px 8px;color:#555">Period</td><td style="padding:5px 8px">${pa.period_label||''}</td></tr>
          <tr style="background:#f7f7f7"><td style="padding:5px 8px;color:#555;font-weight:bold">Current Payment Due</td>
            <td style="padding:5px 8px;font-weight:bold;color:#185FA5;font-size:11pt">$${due.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>
        </table>
        <p style="margin-top:16px;font-size:9pt;color:#888">
          ${emailAttachments.length > 0 ? `Pay application PDF${emailAttachments.length>1?' and lien waiver are':' is'} attached.` : ''}
          <a href="https://constructinv.varshyl.com" style="color:#185FA5">View online</a>
        </p>
      </div>
      <div style="padding:10px 24px;font-size:8pt;color:#aaa;text-align:center">
        Sent via <a href="https://constructinv.varshyl.com" style="color:#aaa">ConstructInvoice AI</a> · Varshyl Inc.
      </div>
    </div>`;

    // Send via Resend
    const fromEmail = process.env.FROM_EMAIL || 'billing@varshyl.com';
    if (!process.env.RESEND_API_KEY) {
      console.log(`[DEV Email] TO:${to} CC:${cc||'-'} | ${subject||'Pay App #'+pa.app_number} | attachments:${emailAttachments.length}`);
    } else {
      const payload = {
        from: fromEmail,
        to: [to],
        subject: subject || `Pay Application #${pa.app_number} — ${pa.pname||''} (${pa.period_label||''})`,
        html: emailHtml,
        attachments: emailAttachments
      };
      if (cc) payload.cc = [cc];
      const r = await fetchEmail('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const errBody = await r.text().catch(()=>'');
        console.error('[Email Route] Resend error:', r.status, errBody);
        return res.status(502).json({ error: 'Email delivery failed', detail: errBody });
      }
    }

    // Mark pay app as submitted
    if (pa.status !== 'submitted') {
      await pool.query('UPDATE pay_apps SET status=$1 WHERE id=$2', ['submitted', req.params.id]);
    }
    await logEvent(req.user.id, 'email_sent', { pay_app_id: parseInt(req.params.id) });
    res.json({ ok: true, attachments: emailAttachments.length });

  } catch(e) {
    console.error('[Email Route] Error:', e.message, e.stack);
    res.status(500).json({ error: 'Failed to send email', detail: e.message });
  }
});


// COMPANY SETTINGS
app.get('/api/settings', auth, async (req,res) => {
  const r = await pool.query('SELECT * FROM company_settings WHERE user_id=$1',[req.user.id]);
  res.json(r.rows[0]||{});
});

app.post('/api/settings', auth, async (req,res) => {
  const {company_name,default_payment_terms,default_retainage,contact_name,contact_phone,contact_email,job_number_format,
    reminder_7before,reminder_due,reminder_7after,reminder_retention,reminder_email,reminder_phone} = req.body;
  const r = await pool.query(
    `INSERT INTO company_settings(user_id,company_name,default_payment_terms,default_retainage,contact_name,contact_phone,contact_email,job_number_format,
       reminder_7before,reminder_due,reminder_7after,reminder_retention,reminder_email,reminder_phone)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT(user_id) DO UPDATE SET
       company_name=EXCLUDED.company_name,
       default_payment_terms=EXCLUDED.default_payment_terms,
       default_retainage=EXCLUDED.default_retainage,
       contact_name=EXCLUDED.contact_name,
       contact_phone=EXCLUDED.contact_phone,
       contact_email=EXCLUDED.contact_email,
       job_number_format=EXCLUDED.job_number_format,
       reminder_7before=COALESCE(EXCLUDED.reminder_7before, company_settings.reminder_7before, TRUE),
       reminder_due=COALESCE(EXCLUDED.reminder_due, company_settings.reminder_due, TRUE),
       reminder_7after=COALESCE(EXCLUDED.reminder_7after, company_settings.reminder_7after, TRUE),
       reminder_retention=COALESCE(EXCLUDED.reminder_retention, company_settings.reminder_retention, TRUE),
       reminder_email=COALESCE(EXCLUDED.reminder_email, company_settings.reminder_email),
       reminder_phone=COALESCE(EXCLUDED.reminder_phone, company_settings.reminder_phone),
       updated_at=NOW()
     RETURNING *`,
    [req.user.id,company_name,default_payment_terms||'Due on receipt',default_retainage||10,
     contact_name||null,contact_phone||null,contact_email||null,job_number_format||null,
     reminder_7before??null,reminder_due??null,reminder_7after??null,reminder_retention??null,
     reminder_email||null,reminder_phone||null]
  );
  res.json(r.rows[0]);
});

app.post('/api/settings/logo', auth, upload.single('file'), async (req,res) => {
  if(!req.file) return res.status(400).json({error:'No file'});
  if (rejectFile(req, res, MIME_IMAGE, 'logo')) return;
  // Delete old logo if exists
  const old = await pool.query('SELECT logo_filename FROM company_settings WHERE user_id=$1',[req.user.id]);
  if(old.rows[0]?.logo_filename) {
    const oldPath = path.join(__dirname,'uploads',old.rows[0].logo_filename);
    if(fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  const r = await pool.query(
    `INSERT INTO company_settings(user_id,logo_filename,logo_original_name)
     VALUES($1,$2,$3)
     ON CONFLICT(user_id) DO UPDATE SET
       logo_filename=EXCLUDED.logo_filename,
       logo_original_name=EXCLUDED.logo_original_name,
       updated_at=NOW()
     RETURNING *`,
    [req.user.id, req.file.filename, req.file.originalname]
  );
  res.json(r.rows[0]);
});

app.get('/api/settings/logo', auth, async (req,res) => {
  const r = await pool.query('SELECT logo_filename FROM company_settings WHERE user_id=$1',[req.user.id]);
  const filename = r.rows[0]?.logo_filename;
  if(!filename) return res.status(404).json({error:'No logo'});
  const fp = path.join(__dirname,'uploads',filename);
  if(!fs.existsSync(fp)) return res.status(404).json({error:'File not found'});
  res.sendFile(fp);
});

app.post('/api/settings/signature', auth, upload.single('file'), async (req,res) => {
  if(!req.file) return res.status(400).json({error:'No file'});
  if (rejectFile(req, res, MIME_IMAGE, 'signature')) return;
  const r = await pool.query(
    `INSERT INTO company_settings(user_id,signature_filename)
     VALUES($1,$2)
     ON CONFLICT(user_id) DO UPDATE SET signature_filename=EXCLUDED.signature_filename,updated_at=NOW()
     RETURNING *`,
    [req.user.id, req.file.filename]
  );
  res.json(r.rows[0]);
});

app.get('/api/settings/signature', auth, async (req,res) => {
  const r = await pool.query('SELECT signature_filename FROM company_settings WHERE user_id=$1',[req.user.id]);
  const filename = r.rows[0]?.signature_filename;
  if(!filename) return res.status(404).json({error:'No signature'});
  const fp = path.join(__dirname,'uploads',filename);
  if(!fs.existsSync(fp)) return res.status(404).json({error:'File not found'});
  res.sendFile(fp);
});

// EDIT PROJECT
app.put('/api/projects/:id/full', auth, async (req,res) => {
  const {name,number,owner,contractor,architect,contact,contact_name,contact_phone,
         contact_email,building_area,original_contract,contract_date,est_date} = req.body;
  const r = await pool.query(
    `UPDATE projects SET name=$1,number=$2,owner=$3,contractor=$4,architect=$5,
     contact=$6,contact_name=$7,contact_phone=$8,contact_email=$9,
     building_area=$10,original_contract=$11,contract_date=$12,est_date=$13
     WHERE id=$14 AND user_id=$15 RETURNING *`,
    [name,number,owner,contractor,architect,contact,contact_name,contact_phone,
     contact_email,building_area,original_contract,contract_date,est_date,
     req.params.id,req.user.id]
  );
  res.json(r.rows[0]);
});

// ── ANALYTICS API ──────────────────────────────────────────────────────────
// Admin-only: only users whose email is in ADMIN_EMAILS env var can access
function adminAuth(req, res, next) {
  const token = (req.headers.authorization && req.headers.authorization.split(' ')[1]) || req.query.token;
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const user = jwt.verify(token, JWT_SECRET);
    // Filter out blanks so an unset ADMIN_EMAILS env var blocks everyone (not lets everyone in)
    const admins = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    if (admins.length === 0 || !admins.includes(user.email.toLowerCase())) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.user = user;
    next();
  } catch(e) { res.status(401).json({ error: 'Invalid token' }); }
}

// ── Admin: test email deliverability ─────────────────────────────────────────
app.post('/api/admin/test-email', adminAuth, async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'to email required' });
  const apiKey    = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || 'noreply@varshyl.com';
  const appUrl    = process.env.APP_URL || 'https://constructinv.varshyl.com';
  if (!apiKey) return res.status(503).json({ error: 'RESEND_API_KEY not set', env: { FROM_EMAIL: fromEmail, APP_URL: appUrl } });
  try {
    const resp = await fetchEmail('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: 'Email Test — Construction AI Billing',
        html: `<div style="font-family:sans-serif;padding:24px"><h2>Email is working!</h2><p>Sent from: <b>${fromEmail}</b><br>App URL: ${appUrl}<br>Time: ${new Date().toISOString()}</p></div>`,
      }),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('[Test Email] Resend error:', resp.status, JSON.stringify(body));
      return res.status(resp.status).json({ error: 'Resend rejected', status: resp.status, detail: body, from: fromEmail });
    }
    console.log('[Test Email] Sent OK to', to);
    res.json({ ok: true, id: body.id, from: fromEmail, to, appUrl });
  } catch(e) {
    console.error('[Test Email] fetch failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const [users, projects, payapps, events, recentErrors, slowReqs, topEvents, dailySignups, featureUsage] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '7 days') as last7 FROM users`),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '7 days') as last7 FROM projects`),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='submitted') as submitted, COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '7 days') as last7 FROM pay_apps`),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '24 hours') as last24h FROM analytics_events`),
      pool.query(`SELECT event, meta, created_at FROM analytics_events WHERE event='server_error' ORDER BY created_at DESC LIMIT 20`),
      pool.query(`SELECT meta->>'path' as path, AVG((meta->>'ms')::int) as avg_ms, COUNT(*) as hits FROM analytics_events WHERE event='slow_request' AND created_at > NOW()-INTERVAL '7 days' GROUP BY path ORDER BY avg_ms DESC LIMIT 10`),
      pool.query(`SELECT event, COUNT(*) as count FROM analytics_events WHERE created_at > NOW()-INTERVAL '30 days' GROUP BY event ORDER BY count DESC LIMIT 15`),
      pool.query(`SELECT DATE(created_at) as day, COUNT(*) as signups FROM analytics_events WHERE event='user_registered' AND created_at > NOW()-INTERVAL '30 days' GROUP BY day ORDER BY day`),
      pool.query(`SELECT event, COUNT(*) as count FROM analytics_events WHERE event IN ('payapp_created','payapp_submitted','pdf_downloaded','project_created','payapp_lines_saved') AND created_at > NOW()-INTERVAL '30 days' GROUP BY event ORDER BY count DESC`),
    ]);
    res.json({
      users:       users.rows[0],
      projects:    projects.rows[0],
      payapps:     payapps.rows[0],
      events:      events.rows[0],
      recentErrors,
      slowRequests:  slowReqs.rows,
      topEvents:     topEvents.rows,
      dailySignups:  dailySignups.rows,
      featureUsage:  featureUsage.rows,
    });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/api/admin/errors', adminAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT event, meta, created_at FROM analytics_events WHERE event IN ('server_error','login_failed') ORDER BY created_at DESC LIMIT 100`
    );
    res.json(r.rows);
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id, u.name, u.email, u.created_at,
        u.email_verified, u.blocked, u.google_id,
        COUNT(DISTINCT p.id) as project_count,
        COUNT(DISTINCT pa.id) as payapp_count,
        COUNT(DISTINCT pa.id) FILTER (WHERE pa.status='submitted') as submitted_count,
        MAX(ae.created_at) as last_active
      FROM users u
      LEFT JOIN projects p ON p.user_id = u.id
      LEFT JOIN pay_apps pa ON pa.project_id = p.id
      LEFT JOIN analytics_events ae ON ae.user_id = u.id
      GROUP BY u.id ORDER BY u.created_at DESC LIMIT 200
    `);
    res.json(r.rows);
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// Helper: is this email in the admin whitelist?
function isAdminEmail(email) {
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
  return adminEmails.includes((email || '').toLowerCase());
}

// ── SUPER ADMIN: User management ────────────────────────────────────────────
app.post('/api/admin/users/:id/block', adminAuth, async (req, res) => {
  const { reason } = req.body;
  const target = (await pool.query('SELECT email FROM users WHERE id=$1', [req.params.id])).rows[0];
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (isAdminEmail(target.email))
    return res.status(403).json({ error: 'Admin accounts cannot be blocked.' });
  await pool.query('UPDATE users SET blocked=TRUE, blocked_reason=$1 WHERE id=$2', [reason||'Blocked by admin', req.params.id]);
  await logEvent(req.user.id, 'admin_user_blocked', { target_user_id: parseInt(req.params.id), reason });
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/unblock', adminAuth, async (req, res) => {
  await pool.query('UPDATE users SET blocked=FALSE, blocked_reason=NULL WHERE id=$1', [req.params.id]);
  await logEvent(req.user.id, 'admin_user_unblocked', { target_user_id: parseInt(req.params.id) });
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/verify-email', adminAuth, async (req, res) => {
  await pool.query('UPDATE users SET email_verified=TRUE, verification_token=NULL WHERE id=$1', [req.params.id]);
  await logEvent(req.user.id, 'admin_email_verified', { target_user_id: parseInt(req.params.id) });
  res.json({ ok: true });
});

// ── Admin: reset any user's password directly (no email needed) ─────────────
app.post('/api/admin/users/:id/reset-password', adminAuth, async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const user = (await pool.query('SELECT id, email, name FROM users WHERE id=$1', [req.params.id])).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash=$1, reset_token=NULL, reset_token_sent_at=NULL WHERE id=$2', [hash, req.params.id]);
    await logEvent(req.user.id, 'admin_password_reset', { target_user_id: parseInt(req.params.id), target_email: user.email });
    // Return a fresh login token so admin can hand it off to the user if needed
    const tok = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, email: user.email, token: tok });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Support requests (for locked-out users or general help) ─────────────────
app.post('/api/support/request', async (req, res) => {
  // Public endpoint — no auth needed (user might be locked out)
  const { email, name, issue } = req.body;
  if (!email || !issue) return res.status(400).json({ error: 'Email and issue description required' });
  try {
    await logEvent(null, 'support_request', { email, name: name||'', issue: issue.slice(0, 500) });
    // Notify admin via email
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.FROM_EMAIL || 'noreply@varshyl.com';
    const adminEmail = (process.env.ADMIN_EMAILS||'').split(',')[0].trim() || 'vaakapila@gmail.com';
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
            <p><b>From:</b> ${name||'Unknown'} &lt;${email}&gt;</p>
            <p><b>Issue:</b></p>
            <blockquote style="border-left:3px solid #185FA5;padding-left:12px;color:#334155">${issue}</blockquote>
            <p style="margin-top:24px"><a href="${process.env.APP_URL||'https://constructinv.varshyl.com'}/?admin=1" style="background:#185FA5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Open Admin Dashboard</a></p>
          </div>`
        })
      }).catch(e => console.error('[Support email]', e.message));
    }
    res.json({ ok: true });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Admin: list support requests (from analytics_events) ────────────────────
app.get('/api/admin/support-requests', adminAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, event_data, created_at FROM analytics_events
       WHERE event = 'support_request'
       ORDER BY created_at DESC LIMIT 100`
    );
    res.json(r.rows);
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.delete('/api/admin/users/:id', adminAuth, async (req, res) => {
  // Cascade deletes all projects/payapps via FK ON DELETE CASCADE
  const user = (await pool.query('SELECT email FROM users WHERE id=$1', [req.params.id])).rows[0];
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (isAdminEmail(user.email))
    return res.status(403).json({ error: 'Admin accounts cannot be deleted.' });
  await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  await logEvent(req.user.id, 'admin_user_deleted', { target_email: user.email });
  res.json({ ok: true });
});

// ── AI INSIGHTS (requires ANTHROPIC_API_KEY env var) ───────────────────────
app.post('/api/admin/ask', adminAuth, async (req, res) => {
  const { question, history = [] } = req.body;
  if (!question) return res.status(400).json({ error: 'Question required' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI insights not configured — set ANTHROPIC_API_KEY in Railway' });
  try {
    // Pull fresh analytics context
    const [users, projects, payapps, topEvents, dailySignups, recentErrors, slowReqs] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '7 days') as last7, COUNT(*) FILTER (WHERE email_verified=TRUE) as verified, COUNT(*) FILTER (WHERE blocked=TRUE) as blocked FROM users`),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '7 days') as last7 FROM projects`),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='submitted') as submitted FROM pay_apps`),
      pool.query(`SELECT event, COUNT(*) as count FROM analytics_events WHERE created_at > NOW()-INTERVAL '30 days' GROUP BY event ORDER BY count DESC LIMIT 20`),
      pool.query(`SELECT DATE(created_at) as day, COUNT(*) as signups FROM analytics_events WHERE event='user_registered' AND created_at > NOW()-INTERVAL '14 days' GROUP BY day ORDER BY day`),
      pool.query(`SELECT COUNT(*) as count FROM analytics_events WHERE event='server_error' AND created_at > NOW()-INTERVAL '24 hours'`),
      pool.query(`SELECT meta->>'path' as path, COUNT(*) as hits FROM analytics_events WHERE event='slow_request' AND created_at > NOW()-INTERVAL '7 days' GROUP BY path ORDER BY hits DESC LIMIT 5`),
    ]);

    const context = `
You are the analytics AI for Construction AI Billing — a SaaS product for AIA G702/G703 construction pay applications.

CURRENT DATA SNAPSHOT:
Users: ${users.rows[0].total} total, +${users.rows[0].last7} this week, ${users.rows[0].verified} verified, ${users.rows[0].blocked} blocked
Projects: ${projects.rows[0].total} total, +${projects.rows[0].last7} this week
Pay Apps: ${payapps.rows[0].total} created, ${payapps.rows[0].submitted} submitted
Server errors (last 24h): ${recentErrors.rows[0].count}

TOP EVENTS (last 30 days):
${topEvents.rows.map(r=>`  ${r.event}: ${r.count}`).join('\n')}

DAILY SIGNUPS (last 14 days):
${dailySignups.rows.map(r=>`  ${r.day}: ${r.signups}`).join('\n') || '  No signups yet'}

SLOW ENDPOINTS (last 7 days):
${slowReqs.rows.map(r=>`  ${r.path}: ${r.hits} times`).join('\n') || '  None'}

The product roadmap:
- Phase 1 (current): AIA billing, pay applications, PDF export
- Phase 2 (next): Invoicing, vendor payments, basic P&L
- Phase 3 (future): ACH transfers, money holding, financial powerhouse for contractors

Answer the following question based on this data. Be specific, actionable, and direct. If data is limited (early stage), say so and give advice for what to watch as it grows.
`.trim();

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: context,
        // Include conversation history for multi-turn — limit to last 20 messages for context size
        messages: [...(history || []).slice(-20), { role: 'user', content: question }],
      }),
    });
    const aiData = await aiRes.json();
    if (aiData.error) throw new Error(aiData.error.message);
    res.json({ answer: aiData.content?.[0]?.text || 'No response' });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Weekly insight summary ──────────────────────────────────────────────────
app.get('/api/admin/weekly-insight', adminAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not set' });
  // Reuse the /ask endpoint logic with a pre-built weekly question
  req.body = { question: 'Give me a complete weekly business summary. What is growing, what is slowing, what needs my attention, and what is one thing I should do this week to improve the product or grow the user base? Format as clear sections.' };
  return require('./server').handleAdminAsk ? require('./server').handleAdminAsk(req, res) : res.redirect('/api/admin/ask');
});

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 1 ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// ── TEAM MEMBERS ───────────────────────────────────────────────────────────
app.get('/api/team', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM team_members WHERE owner_user_id=$1 ORDER BY created_at', [req.user.id]);
  res.json(r.rows);
});

app.post('/api/team', auth, async (req, res) => {
  const { email, name, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const validRoles = ['admin','accountant','executive','pm','field'];
  if (role && !validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  try {
    const inviteToken = generateToken();
    const r = await pool.query(
      'INSERT INTO team_members(owner_user_id,email,name,role,invite_token) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [req.user.id, email, name||null, role||'field', inviteToken]
    );
    // Send invite email (non-blocking)
    const inviter = (await pool.query('SELECT name,email FROM users WHERE id=$1',[req.user.id])).rows[0];
    sendTeamInviteEmail(email, name||email, inviter, inviteToken).catch(e => console.error('Invite email error:', e.message));
    await logEvent(req.user.id, 'team_member_invited', { email, role: role||'field' });
    res.json(r.rows[0]);
  } catch(e) {
    if (e.code === '23505') return res.status(400).json({ error: 'This email is already on your team' });
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/team/:id', auth, async (req, res) => {
  const { name, role } = req.body;
  const r = await pool.query(
    'UPDATE team_members SET name=COALESCE($1,name), role=COALESCE($2,role) WHERE id=$3 AND owner_user_id=$4 RETURNING *',
    [name||null, role||null, req.params.id, req.user.id]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(r.rows[0]);
});

app.delete('/api/team/:id', auth, async (req, res) => {
  const r = await pool.query('DELETE FROM team_members WHERE id=$1 AND owner_user_id=$2 RETURNING *', [req.params.id, req.user.id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
  await logEvent(req.user.id, 'team_member_removed', { email: r.rows[0].email });
  res.json({ ok: true });
});

// Accept team invite — sets invite_accepted=true on the team_members row
app.get('/api/auth/accept-invite/:token', async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE team_members SET invite_accepted=TRUE
       WHERE invite_token=$1 AND invite_accepted=FALSE
         AND created_at > NOW() - INTERVAL '7 days'
       RETURNING *`,
      [req.params.token]
    );
    if (!r.rows[0]) return res.redirect('/?invite_error=invalid_or_expired');
    res.redirect('/?invite_accepted=1');
  } catch(e) { res.redirect('/?invite_error=server'); }
});

async function sendTeamInviteEmail(toEmail, toName, inviter, token) {
  const apiKey = process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || 'noreply@varshyl.com';
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  if (!apiKey) {
    console.log(`[DEV] Team invite for ${toEmail}: ${appUrl}/api/auth/accept-invite/${token}`);
    return;
  }
  const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
    <h2 style="color:#185FA5">You've been invited to Construction AI Billing</h2>
    <p>Hi ${toName},</p>
    <p>${inviter.name} (${inviter.email}) has added you to their team on Construction AI Billing.</p>
    <a href="${appUrl}/api/auth/accept-invite/${token}" style="display:inline-block;background:#185FA5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0">Accept Invitation →</a>
    <p style="color:#888;font-size:12px">If you didn't expect this invitation, you can ignore this email.</p>
  </div>`;
  const isResend = !!process.env.RESEND_API_KEY;
  const payload = isResend
    ? { from: fromEmail, to: [toEmail], subject: `${inviter.name} invited you to Construction AI Billing`, html }
    : { personalizations:[{to:[{email:toEmail}]}], from:{email:fromEmail},
        subject:`${inviter.name} invited you to Construction AI Billing`,
        content:[{type:'text/html',value:html}] };
  await fetchEmail(isResend ? 'https://api.resend.com/emails' : 'https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', Authorization:`Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
}

// ── JOB NUMBER AUTO-GENERATION ─────────────────────────────────────────────
// Format: CITY-STATE-SEQNUM  e.g. OAK-CA-0042
// City/state derived from project location or company settings
app.get('/api/settings/job-number/next', auth, async (req, res) => {
  try {
    const { city, state } = req.query;
    // Increment the company's job_number_seq atomically
    const r = await pool.query(
      `UPDATE company_settings
         SET job_number_seq = COALESCE(job_number_seq, 0) + 1
         WHERE user_id = $1
         RETURNING job_number_seq, job_number_format`,
      [req.user.id]
    );
    if (!r.rows[0]) {
      // No settings row yet — insert it
      const ins = await pool.query(
        `INSERT INTO company_settings(user_id, job_number_seq) VALUES($1, 1) RETURNING job_number_seq, job_number_format`,
        [req.user.id]
      );
      r.rows[0] = ins.rows[0];
    }
    const seq = r.rows[0].job_number_seq || 1;
    const fmt = r.rows[0].job_number_format;

    let jobNumber;
    if (fmt) {
      // Custom format: replace {CITY}, {STATE}, {SEQ}, {YEAR} tokens
      const year = new Date().getFullYear();
      jobNumber = fmt
        .replace(/{CITY}/gi, (city||'XX').toUpperCase().slice(0,4))
        .replace(/{STATE}/gi, (state||'XX').toUpperCase().slice(0,2))
        .replace(/{SEQ}/gi, String(seq).padStart(4,'0'))
        .replace(/{YEAR}/gi, String(year));
    } else {
      // Default: CITY-STATE-0042
      const cityCode  = (city  ||'XX').replace(/[^A-Za-z]/g,'').toUpperCase().slice(0,4);
      const stateCode = (state ||'XX').replace(/[^A-Za-z]/g,'').toUpperCase().slice(0,2);
      jobNumber = `${cityCode}-${stateCode}-${String(seq).padStart(4,'0')}`;
    }
    res.json({ job_number: jobNumber, seq });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ── CONTRACT UPLOAD + SMART EXTRACTION ────────────────────────────────────
// Accepts PDF or DOCX; extracts key billing fields via text heuristics (no AI API cost)
app.post('/api/projects/:id/contract', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (rejectFile(req, res, MIME_CONTRACT, 'contract')) return;
  // Verify project ownership
  const proj = await pool.query('SELECT id FROM projects WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  if (!proj.rows[0]) { fs.unlinkSync(req.file.path); return res.status(403).json({ error: 'Forbidden' }); }

  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    let text = '';

    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const buf = fs.readFileSync(req.file.path);
      const data = await pdfParse(buf);
      text = data.text || '';
    } else if (ext === '.docx' || ext === '.doc') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: req.file.path });
      text = result.value || '';
    } else {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Only PDF and Word documents are supported for contract upload.' });
    }

    const extracted = extractContractFields(text);
    const contractType = detectContractType(text);

    // Delete any previous contract for this project (replace with new upload)
    const old = await pool.query('SELECT filename FROM contracts WHERE project_id=$1', [req.params.id]);
    for (const row of old.rows) {
      const fp = path.join(__dirname, 'uploads', row.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await pool.query('DELETE FROM contracts WHERE project_id=$1', [req.params.id]);

    const r = await pool.query(
      'INSERT INTO contracts(project_id,filename,original_name,file_size,contract_type,extracted) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.id, req.file.filename, req.file.originalname, req.file.size, contractType, JSON.stringify(extracted)]
    );

    // SOV comparison: get the project's SOV total and compare against extracted contract sum
    let sov_comparison = null;
    if (extracted.contract_sum) {
      const sovRes = await pool.query('SELECT SUM(scheduled_value) as total, COUNT(*) as count FROM sov_lines WHERE project_id=$1', [req.params.id]);
      if (sovRes.rows[0] && parseFloat(sovRes.rows[0].total) > 0) {
        const sovTotal = parseFloat(sovRes.rows[0].total);
        const contractSum = parseFloat(extracted.contract_sum);
        const variance = sovTotal - contractSum;
        const variancePct = Math.abs(variance / contractSum * 100);
        sov_comparison = {
          sov_total: sovTotal,
          contract_sum: contractSum,
          variance,
          variance_pct: variancePct,
          match: variancePct < 0.5, // within 0.5% is a match
          sov_line_count: parseInt(sovRes.rows[0].count),
        };
      }
    }

    await logEvent(req.user.id, 'contract_uploaded', { project_id: parseInt(req.params.id), contract_type: contractType });
    res.json({ ...r.rows[0], extracted, sov_comparison });
  } catch(e) {
    try { fs.unlinkSync(req.file.path); } catch(_) {}
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/projects/:id/contract', auth, async (req, res) => {
  const proj = await pool.query('SELECT id FROM projects WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  if (!proj.rows[0]) return res.status(403).json({ error: 'Forbidden' });
  const r = await pool.query('SELECT * FROM contracts WHERE project_id=$1 ORDER BY uploaded_at DESC LIMIT 1', [req.params.id]);
  res.json(r.rows[0] || null);
});

function detectContractType(text) {
  const t = text.toLowerCase();
  if (/a201|a101|a102|a133|aia\s+document/i.test(t)) return 'aia';
  if (/standard\s+form\s+of\s+agreement/i.test(t)) return 'aia';
  if (/wawf|wide\s+area\s+work\s+flow|dfars|defense\s+contract/i.test(t)) return 'federal_dod';
  if (/sf-?1034|sf-?1035|ipp|invoice\s+processing\s+platform|far\s+part/i.test(t)) return 'federal_civilian';
  if (/department\s+of\s+defense|army\s+corps|navfac|afcec/i.test(t)) return 'federal_dod';
  if (/state\s+of\s+(california|virginia|washington\s+dc)/i.test(t)) return 'state';
  if (/subcontract/i.test(t)) return 'subcontract';
  return 'unknown';
}

function extractContractFields(text) {
  const fields = {};

  // Contract sum / original contract amount
  const sumPatterns = [
    /contract\s+sum[^$\d]*\$?([\d,]+(?:\.\d{2})?)/i,
    /total\s+contract\s+(?:price|amount|value)[^$\d]*\$?([\d,]+(?:\.\d{2})?)/i,
    /contract\s+(?:price|amount)[^$\d]*\$?([\d,]+(?:\.\d{2})?)/i,
    /original\s+contract[^$\d]*\$?([\d,]+(?:\.\d{2})?)/i,
    /total\s+(?:bid|price)[^$\d]*\$?([\d,]+(?:\.\d{2})?)/i,
    /\btotal\b[^$\d\n]*\$\s*([\d,]+(?:\.\d{2})?)/i,
  ];
  for (const p of sumPatterns) {
    const m = text.match(p);
    if (m) { fields.contract_sum = parseFloat(m[1].replace(/,/g,'')); break; }
  }

  // Retainage percentage
  const retPatterns = [
    /retainage\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*%/i,
    /(\d+(?:\.\d+)?)\s*%\s+retainage/i,
    /retain\s+(\d+(?:\.\d+)?)\s*%/i,
    /withhold\s+(\d+(?:\.\d+)?)\s*%/i,
  ];
  for (const p of retPatterns) {
    const m = text.match(p);
    if (m) { fields.retainage_pct = parseFloat(m[1]); break; }
  }

  // Owner name
  const ownerM = text.match(/(?:^|\n)\s*owner[:\s]+([A-Z][^\n,]{3,60})(?:\n|,)/im);
  if (ownerM) fields.owner = ownerM[1].trim();

  // Contractor name
  const contrM = text.match(/(?:^|\n)\s*(?:general\s+)?contractor[:\s]+([A-Z][^\n,]{3,60})(?:\n|,)/im);
  if (contrM) fields.contractor = contrM[1].trim();

  // Contract date
  const datePatterns = [
    /(?:contract\s+date|dated)[:\s]+([A-Za-z]+ \d{1,2},? \d{4})/i,
    /(?:contract\s+date|dated)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /as\s+of\s+([A-Za-z]+ \d{1,2},? \d{4})/i,
  ];
  for (const p of datePatterns) {
    const m = text.match(p);
    if (m) { fields.contract_date = m[1].trim(); break; }
  }

  // Substantial completion / project end date
  const compM = text.match(/substantial\s+completion[:\s]+([A-Za-z]+ \d{1,2},? \d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
  if (compM) fields.completion_date = compM[1].trim();

  // Payment terms
  const termsM = text.match(/payment\s+(?:due|terms)[:\s]+([^\n.]{5,60})/i);
  if (termsM) fields.payment_terms = termsM[1].trim();

  // Federal: Contract/Order Number (PIID)
  const piidM = text.match(/(?:contract|order)\s+(?:number|no\.?)[:\s]+([A-Z0-9\-]{8,20})/i);
  if (piidM) fields.contract_number = piidM[1].trim();

  // Federal: CAGE code
  const cageM = text.match(/cage\s+(?:code)?[:\s]+([A-Z0-9]{5})\b/i);
  if (cageM) fields.cage_code = cageM[1].trim();

  // Federal: Period of Performance
  const popM = text.match(/period\s+of\s+performance[:\s]+([^\n.]{10,60})/i);
  if (popM) fields.period_of_performance = popM[1].trim();

  return fields;
}

// ── SOV extraction from contract text ──────────────────────────────────────
function extractSOVFromContract(text) {
  // Find "Schedule of Values" section header in the text
  const sovMatch = text.search(/schedule\s+of\s+values/i);
  if (sovMatch === -1) return null;

  // Work with the slice starting at SOV header (up to 6000 chars)
  const section = text.slice(sovMatch, sovMatch + 6000);
  const lines = section.split('\n');

  const items = [];
  let seenHeader = false;
  let consecutiveEmpty = 0;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    // Skip blank lines (but stop if too many in a row after we have items)
    if (!trimmed) {
      if (items.length > 2) consecutiveEmpty++;
      if (consecutiveEmpty > 4) break;
      continue;
    }
    consecutiveEmpty = 0;

    // Skip the SOV title line itself
    if (/schedule\s+of\s+values/i.test(trimmed) && !seenHeader) { seenHeader = true; continue; }

    // Skip column header rows
    if (/(?:item|no\.?|description|amount|scheduled\s+value|work\s+item)/i.test(trimmed) && trimmed.length < 80) continue;

    // Stop at signature / total section after we have items
    if (items.length > 2 && /^\s*(?:total|subtotal|grand\s+total|signature|contractor|owner|date\s*:)/i.test(trimmed)) break;

    // Match: optional item id, description, dollar amount at end
    // Amount can be: 45,000 | 45,000.00 | $45,000 | $ 45,000.00
    const amtMatch = trimmed.match(/\$?\s*([\d,]{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*$/);
    if (!amtMatch) continue;

    const amt = parseFloat(amtMatch[1].replace(/,/g, ''));
    if (amt < 50) continue; // ignore tiny/zero amounts

    const descPart = trimmed.slice(0, trimmed.length - amtMatch[0].length).trim();
    if (!descPart || descPart.length < 3 || descPart.length > 120) continue;

    // Strip leading item number (e.g. "1." "A." "01" "A1.")
    const itemM = descPart.match(/^([A-Z]?\d{1,3}\.?\d*\.?)\s+(.+)/i);
    const description = itemM ? itemM[2].trim() : descPart;
    const item_id = itemM ? itemM[1].replace(/\.$/, '') : String(items.length + 1);

    if (description.length < 3) continue;

    items.push({ item_id, description, scheduled_value: amt });
  }

  return items.length >= 2 ? items : null;
}

// ── LIEN DOCUMENTS (California + Virginia + DC) ────────────────────────────
app.get('/api/projects/:id/lien-docs', auth, async (req, res) => {
  const proj = await pool.query('SELECT id FROM projects WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  if (!proj.rows[0]) return res.status(403).json({ error: 'Forbidden' });
  const r = await pool.query('SELECT * FROM lien_documents WHERE project_id=$1 ORDER BY created_at DESC', [req.params.id]);
  res.json(r.rows);
});

// POST /api/projects/:id/lien-docs  — generate a lien document PDF
// Body: { doc_type, through_date, amount, maker_of_check, check_payable_to,
//         signatory_name, signatory_title, jurisdiction }
app.post('/api/projects/:id/lien-docs', auth, async (req, res) => {
  const proj = await pool.query(
    'SELECT p.*, cs.company_name, cs.logo_filename FROM projects p LEFT JOIN company_settings cs ON cs.user_id=p.user_id WHERE p.id=$1 AND p.user_id=$2',
    [req.params.id, req.user.id]
  );
  if (!proj.rows[0]) return res.status(403).json({ error: 'Forbidden' });
  const project = proj.rows[0];

  const {
    doc_type, through_date, amount, maker_of_check, check_payable_to,
    signatory_name, signatory_title, pay_app_id,
    jurisdiction = project.jurisdiction || 'california'
  } = req.body;

  if (!doc_type) return res.status(400).json({ error: 'doc_type required' });
  if (!signatory_name) return res.status(400).json({ error: 'signatory_name required' });

  const signedAt = new Date();
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';

  // Generate PDF to a temp file
  const fname = `lien_${doc_type}_${req.params.id}_${Date.now()}.pdf`;
  const fpath = path.join(__dirname, 'uploads', fname);

  try {
    // If linked to a pay app, include a reference line on the document
    let pay_app_ref = null;
    if (pay_app_id) {
      const paRow = await pool.query('SELECT app_number, period_label FROM pay_apps WHERE id=$1', [pay_app_id]);
      if (paRow.rows[0]) pay_app_ref = `Pay App #${paRow.rows[0].app_number}${paRow.rows[0].period_label ? ' — ' + paRow.rows[0].period_label : ''}`;
    }
    await generateLienDocPDF({
      fpath, doc_type, project, through_date, amount, maker_of_check,
      check_payable_to, signatory_name, signatory_title, signedAt, ip, jurisdiction, pay_app_ref
    });

    const r = await pool.query(
      `INSERT INTO lien_documents(project_id, pay_app_id, doc_type, filename, jurisdiction,
         through_date, amount, maker_of_check, check_payable_to,
         signatory_name, signatory_title, signed_at, signatory_ip)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.params.id, pay_app_id||null, doc_type, fname, jurisdiction,
       through_date||null, amount||null, maker_of_check||null, check_payable_to||null,
       signatory_name, signatory_title||null, signedAt, ip]
    );
    await logEvent(req.user.id, 'lien_doc_generated', { project_id: parseInt(req.params.id), doc_type, jurisdiction });
    res.json(r.rows[0]);
  } catch(e) {
    try { if (fs.existsSync(fpath)) fs.unlinkSync(fpath); } catch(_) {}
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve lien document PDF
app.get('/api/lien-docs/:id/pdf', async (req, res) => {
  const token = req.query.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  let decoded;
  try { decoded = jwt.verify(token, JWT_SECRET); } catch(e) { return res.status(401).json({ error: 'Invalid token' }); }

  const r = await pool.query(
    'SELECT ld.* FROM lien_documents ld JOIN projects p ON p.id=ld.project_id WHERE ld.id=$1 AND p.user_id=$2',
    [req.params.id, decoded.id]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
  const fp = path.join(__dirname, 'uploads', r.rows[0].filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${r.rows[0].doc_type}_${r.rows[0].id}.pdf"`);
  res.sendFile(fp);
});

// ── Shared helper: render a lien waiver into an open PDFDocument at current position ──
function renderLienWaiverContent(doc, { doc_type, project, through_date, amount,
  maker_of_check, check_payable_to, signatory_name, signatory_title,
  signedAt, ip, jurisdiction, pay_app_ref, startX, pageW }) {

  const L = startX || 45;
  const W = pageW || 522;
  const R = L + W;

  const fmtAmt = n => n ? '$' + parseFloat(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '[AMOUNT]';
  const fmtDate = d => {
    if (!d) return '[DATE]';
    const dt = new Date(d);
    // compensate for UTC offset to prevent off-by-one day
    const local = new Date(dt.getTime() + dt.getTimezoneOffset() * 60000);
    return local.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  };
  const projectName = project.name || '[Project Name]';
  const ownerName = project.owner || '[Owner]';
  const contractorName = project.contractor || project.company_name || '[Contractor]';
  const loc = project.location || [project.city, project.state].filter(Boolean).join(', ') || projectName;

  // ── HEADER BAND ─────────────────────────────────────────────────────────
  const BLUE = '#0C3B6B';
  const bandTop = doc.y;
  const bandH = 66;
  doc.rect(L, bandTop, W, bandH).fill(BLUE);

  // Logo in header band (left side)
  let logoPlaced = false;
  if (project.logo_filename) {
    const logoPath = path.join(__dirname, 'uploads', project.logo_filename);
    if (fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, L + 10, bandTop + 8, { fit: [100, 50], align: 'left', valign: 'center' });
        logoPlaced = true;
      } catch(_) {}
    }
  }

  // Document title in header band
  let titleLine1 = '', titleLine2 = '', statuteRef = '';
  if (doc_type === 'preliminary_notice') {
    titleLine1 = jurisdiction === 'california' ? 'PRELIMINARY NOTICE' : 'NOTICE TO OWNER';
    titleLine2 = '';
    statuteRef = jurisdiction === 'california' ? 'California Civil Code §8200–8216'
                 : jurisdiction === 'virginia'  ? 'Virginia Code §43-4' : '';
  } else if (doc_type === 'conditional_waiver') {
    titleLine1 = 'CONDITIONAL WAIVER AND RELEASE';
    titleLine2 = 'ON PROGRESS PAYMENT';
    statuteRef = jurisdiction === 'california' ? 'Civil Code §8132' : '';
  } else if (doc_type === 'unconditional_waiver') {
    titleLine1 = 'UNCONDITIONAL WAIVER AND RELEASE';
    titleLine2 = 'ON PROGRESS PAYMENT';
    statuteRef = jurisdiction === 'california' ? 'Civil Code §8134' : '';
  } else if (doc_type === 'conditional_final_waiver') {
    titleLine1 = 'CONDITIONAL WAIVER AND RELEASE';
    titleLine2 = 'ON FINAL PAYMENT';
    statuteRef = jurisdiction === 'california' ? 'Civil Code §8136' : '';
  } else if (doc_type === 'unconditional_final_waiver') {
    titleLine1 = 'UNCONDITIONAL WAIVER AND RELEASE';
    titleLine2 = 'ON FINAL PAYMENT';
    statuteRef = jurisdiction === 'california' ? 'Civil Code §8138' : '';
  }

  const titleX = logoPlaced ? L + 120 : L + 10;
  const titleW = R - titleX - 10;
  doc.fillColor('#FFFFFF').fontSize(12.5).font('Helvetica-Bold')
     .text(titleLine1, titleX, bandTop + 12, { width: titleW, align: logoPlaced ? 'center' : 'left' });
  if (titleLine2) {
    doc.fontSize(12.5).font('Helvetica-Bold')
       .text(titleLine2, titleX, doc.y, { width: titleW, align: logoPlaced ? 'center' : 'left' });
  }
  if (statuteRef) {
    doc.fontSize(8).font('Helvetica')
       .text(statuteRef, titleX, doc.y + 1, { width: titleW, align: logoPlaced ? 'center' : 'left' });
  }
  doc.fillColor('#000000');
  doc.y = bandTop + bandH + 10;

  // ── INFO GRID (2-column box) ─────────────────────────────────────────────
  const col1W = W * 0.56, col2W = W * 0.44;
  const rowH = 20;
  const infoLeft = [
    ['Project Name', projectName],
    ['Property Owner', ownerName],
    ['General Contractor', contractorName],
    ['Project Location', loc],
    ...(pay_app_ref ? [['Pay Application', pay_app_ref]] : []),
  ];
  const infoRight = [
    ['Through Date', fmtDate(through_date)],
    ['Amount', fmtAmt(amount)],
    ['Maker of Check', maker_of_check || '—'],
    ['Check Payable To', check_payable_to || contractorName],
    ['Jurisdiction', jurisdiction ? jurisdiction.charAt(0).toUpperCase()+jurisdiction.slice(1) : '—'],
  ];

  const gridTop = doc.y;
  const rows = Math.max(infoLeft.length, infoRight.length);
  const gridH = rows * rowH;

  // Draw outer border
  doc.rect(L, gridTop, W, gridH).lineWidth(0.5).stroke('#AAAAAA');
  // Vertical divider
  doc.moveTo(L + col1W, gridTop).lineTo(L + col1W, gridTop + gridH).lineWidth(0.5).stroke('#AAAAAA');

  for (let i = 0; i < rows; i++) {
    const rowY = gridTop + i * rowH;
    // Horizontal divider (not after last row)
    if (i < rows - 1) doc.moveTo(L, rowY + rowH).lineTo(R, rowY + rowH).lineWidth(0.3).stroke('#DDDDDD');
    // Left column
    if (infoLeft[i]) {
      doc.fontSize(7).font('Helvetica-Bold').fillColor('#555555')
         .text(infoLeft[i][0].toUpperCase(), L + 5, rowY + 4, { width: col1W - 70 });
      doc.fontSize(8.5).font('Helvetica').fillColor('#000000')
         .text(infoLeft[i][1], L + 5 + 85, rowY + 3.5, { width: col1W - 95, lineBreak: false });
    }
    // Right column
    if (infoRight[i]) {
      doc.fontSize(7).font('Helvetica-Bold').fillColor('#555555')
         .text(infoRight[i][0].toUpperCase(), L + col1W + 5, rowY + 4, { width: col2W - 70 });
      doc.fontSize(8.5).font('Helvetica').fillColor('#000000')
         .text(infoRight[i][1], L + col1W + 5 + 82, rowY + 3.5, { width: col2W - 90, lineBreak: false });
    }
  }
  doc.fillColor('#000000');
  doc.y = gridTop + gridH + 12;

  // ── STATUTORY BODY TEXT ──────────────────────────────────────────────────
  doc.fontSize(9).font('Helvetica').fillColor('#000000');

  // NOTICE box (shaded background) for waiver types
  const isWaiver = doc_type !== 'preliminary_notice';
  if (isWaiver) {
    let noticeText = '';
    if (doc_type === 'conditional_waiver' || doc_type === 'conditional_final_waiver') {
      noticeText = 'NOTICE: This document waives and releases lien and payment bond rights and stop payment notice rights based on a contract. Read it before signing.';
    } else if (doc_type === 'unconditional_waiver' || doc_type === 'unconditional_final_waiver') {
      noticeText = 'NOTICE: This document waives and releases lien and payment bond rights and stop payment notice rights unconditionally and states that you have been paid for giving up those rights. This document is enforceable against you if you sign it, even if you have not been paid. Read it before signing.';
    }
    if (noticeText) {
      const noticeY = doc.y;
      const noticeH = 32;
      doc.rect(L, noticeY, W, noticeH).fill('#FFF3CD');
      doc.rect(L, noticeY, W, noticeH).lineWidth(0.5).stroke('#CC9900');
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#7A4F00')
         .text(noticeText, L + 8, noticeY + 6, { width: W - 16, lineBreak: true });
      doc.fillColor('#000000');
      doc.y = noticeY + noticeH + 10;
    }
  }

  // Body text (full statutory language)
  doc.fontSize(9).font('Helvetica').text('', L, doc.y); // reset x
  if (doc_type === 'preliminary_notice' && jurisdiction === 'california') {
    doc.font('Helvetica-Bold').text('NOTICE TO PROPERTY OWNER', L, doc.y, { align: 'center', width: W });
    doc.moveDown(0.3);
    doc.font('Helvetica').text(
      'If bills are not paid in full for the labor, services, equipment, or materials furnished or to be furnished, ' +
      'a mechanic\'s lien leading to the loss, through court foreclosure proceedings, of all or part of your property ' +
      'being so improved may be placed against the property even though you have paid your contractor in full. You may ' +
      'wish to protect yourself against this consequence by (1) requiring your contractor to furnish a signed release by ' +
      'the person or firm giving you this notice before making payment to your contractor, or (2) any other method or ' +
      'device that is appropriate under the circumstances.',
      L, doc.y, { width: W, align: 'justify' }
    );
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('NOTICE IS HEREBY GIVEN THAT:', L, doc.y, { width: W });
    doc.moveDown(0.2);
    doc.font('Helvetica').list([
      `The undersigned, ${contractorName}, has furnished or will furnish labor, services, equipment, or materials of the following type: General Construction Services`,
      `To: ${ownerName} (Owner) and ${contractorName} (General Contractor)`,
      `For the improvement of property located at: ${loc}`,
      `Project: ${projectName}`,
    ], L, doc.y, { bulletRadius: 2, textIndent: 15, indent: 10, width: W });
  } else if (doc_type === 'conditional_waiver' && jurisdiction === 'california') {
    doc.text(
      `Upon receipt by the undersigned of a check from ${maker_of_check || '[Maker of Check]'} in the sum of ${fmtAmt(amount)} ` +
      `payable to ${check_payable_to || contractorName} and when the check has been properly endorsed and has been paid by the bank ` +
      `upon which it is drawn, this document shall become effective to release any mechanic's lien, stop payment notice, or bond right ` +
      `the undersigned has on the job of ${ownerName} located at ${loc} to the following extent. This release covers a progress ` +
      `payment for all labor, services, equipment, or materials furnished to ${ownerName} through ${fmtDate(through_date)}, ` +
      `and does not cover any retention or items, conditions, or obligations for which the claimant has separately secured payment ` +
      `in full. Before any recipient of this document relies on it, the recipient should verify evidence of payment to the undersigned.`,
      L, doc.y, { width: W, align: 'justify' }
    );
  } else if (doc_type === 'unconditional_waiver' && jurisdiction === 'california') {
    doc.text(
      `The undersigned has been paid and has received a progress payment in the sum of ${fmtAmt(amount)} for all labor, services, ` +
      `equipment, or materials furnished to ${ownerName} through ${fmtDate(through_date)} and does hereby release any mechanic's ` +
      `lien, stop payment notice, or bond right the undersigned has on the job of ${ownerName} located at ${loc}. A payment of ` +
      `${fmtAmt(amount)} was received on ${fmtDate(through_date)}.`,
      L, doc.y, { width: W, align: 'justify' }
    );
  } else if (doc_type === 'conditional_final_waiver' && jurisdiction === 'california') {
    doc.text(
      `Upon receipt by the undersigned of a check from ${maker_of_check || '[Maker of Check]'} in the sum of ${fmtAmt(amount)} ` +
      `payable to ${check_payable_to || contractorName} and when the check has been properly endorsed and has been paid by the bank ` +
      `upon which it is drawn, this document shall become effective to release any mechanic's lien, stop payment notice, or bond right ` +
      `the undersigned has on the job of ${ownerName} located at ${loc}. This release covers the final payment for all labor, ` +
      `services, equipment, or materials furnished on the job, except for disputed claims for additional work in the amount of ` +
      `$______________. Before any recipient of this document relies on it, the recipient should verify evidence of payment to the undersigned.`,
      L, doc.y, { width: W, align: 'justify' }
    );
  } else if (doc_type === 'unconditional_final_waiver' && jurisdiction === 'california') {
    doc.text(
      `The undersigned has been paid and has received final payment in the sum of ${fmtAmt(amount)} for all labor, services, ` +
      `equipment, or materials furnished to ${ownerName} on the job of ${ownerName} located at ${loc} and does hereby release ` +
      `any mechanic's lien, stop payment notice, or bond right the undersigned has on the job. A payment of ${fmtAmt(amount)} ` +
      `was received on ${fmtDate(through_date)}. The claimant releases and waives all rights under this title irrespective of payment.`,
      L, doc.y, { width: W, align: 'justify' }
    );
  } else if (doc_type === 'preliminary_notice' && jurisdiction === 'virginia') {
    doc.font('Helvetica-Bold').text('NOTICE TO OWNER PURSUANT TO VIRGINIA CODE §43-4', L, doc.y, { width: W });
    doc.moveDown(0.3);
    doc.font('Helvetica').text(
      `You are hereby notified that the undersigned, ${contractorName}, has performed or will perform labor, ` +
      `services, or furnish materials, machinery, tools, or equipment for improvement of the property described below. ` +
      `This notice is given pursuant to the Virginia Mechanics Lien Law, Title 43 of the Code of Virginia. ` +
      `The owner is advised that the undersigned may, unless paid, have a right to file a memorandum of lien against ` +
      `the property described below within 150 days after the last day materials were furnished or work was performed.`,
      L, doc.y, { width: W, align: 'justify' }
    );
  } else {
    doc.text(
      `The undersigned hereby certifies and declares that all labor, services, equipment, and materials ` +
      `furnished to ${projectName} (the "Project") located at ${loc} for the period through ${fmtDate(through_date)} ` +
      `have been paid in full (or upon payment in the case of a conditional waiver), and hereby releases ` +
      `any and all lien rights, stop notice rights, and payment bond rights for work performed through said date.`,
      L, doc.y, { width: W, align: 'justify' }
    );
  }

  // ── SIGNATURE BLOCK (bordered box) ──────────────────────────────────────
  doc.moveDown(1.2);
  const sigBoxY = doc.y;
  const sigBoxH = 90;
  doc.rect(L, sigBoxY, W, sigBoxH).lineWidth(0.5).stroke('#AAAAAA');

  // Left column — signature
  const sigColW = W * 0.55;
  doc.moveTo(L + sigColW, sigBoxY).lineTo(L + sigColW, sigBoxY + sigBoxH).lineWidth(0.5).stroke('#AAAAAA');

  doc.fontSize(7).font('Helvetica-Bold').fillColor('#555555')
     .text('AUTHORIZED SIGNATURE', L + 6, sigBoxY + 8, { width: sigColW - 12 });
  // Signature line
  doc.moveTo(L + 6, sigBoxY + 32).lineTo(L + sigColW - 8, sigBoxY + 32).lineWidth(0.5).stroke('#999999');
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000')
     .text(signatory_name || '', L + 6, sigBoxY + 35, { width: sigColW - 12 });
  doc.fontSize(7.5).font('Helvetica').fillColor('#333333')
     .text((signatory_title ? signatory_title + '  ·  ' : '') + contractorName, L + 6, sigBoxY + 50, { width: sigColW - 12 });
  doc.fontSize(7.5).text(`Date: ${signedAt.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}`, L + 6, sigBoxY + 65, { width: sigColW - 12 });

  // Right column — metadata
  const rX = L + sigColW + 6;
  const rW = W - sigColW - 12;
  doc.fontSize(7).font('Helvetica-Bold').fillColor('#555555').text('ELECTRONIC SIGNATURE DETAILS', rX, sigBoxY + 8, { width: rW });
  doc.fontSize(7.5).font('Helvetica').fillColor('#333333');
  doc.text(`Signed: ${signedAt.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'})}`, rX, sigBoxY + 22, { width: rW });
  doc.text(`IP: ${ip}`, rX, sigBoxY + 35, { width: rW });
  doc.fontSize(6.5).text('By signing, the signatory agrees this electronic signature is the legal equivalent of a handwritten signature.', rX, sigBoxY + 48, { width: rW });
  doc.fillColor('#000000');
  doc.y = sigBoxY + sigBoxH + 10;

  // ── FOOTER ───────────────────────────────────────────────────────────────
  doc.fontSize(7).fillColor('#999999')
     .text(`Generated by Construction AI Billing — constructinv.varshyl.com  |  ${new Date().toISOString().slice(0,10)}`,
       L, 730, { width: W, align: 'center' });
  doc.fillColor('#000000');
}

async function generateLienDocPDF({ fpath, doc_type, project, through_date, amount,
  maker_of_check, check_payable_to, signatory_name, signatory_title, signedAt, ip, jurisdiction, pay_app_ref }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 45 });
    const stream = fs.createWriteStream(fpath);
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);
    renderLienWaiverContent(doc, {
      doc_type, project, through_date, amount, maker_of_check, check_payable_to,
      signatory_name, signatory_title, signedAt, ip, jurisdiction, pay_app_ref,
      startX: 45, pageW: 522
    });
    doc.end();
  });
}

// ── REVENUE SUMMARY ────────────────────────────────────────────────────────
app.get('/api/revenue/summary', auth, async (req, res) => {
  try {
    const uid = req.user.id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const period = req.query.period || 'monthly'; // monthly | quarterly | yearly

    // All pay apps for this user in the selected year.
    // COALESCE(period_end, created_at) so apps without a period_end still get a chart bucket.
    const paRes = await pool.query(`
      SELECT pa.id, pa.project_id,
             pa.app_number AS pay_app_number,
             pa.period_end AS period_end,
             pa.status, pa.payment_received,
             p.name AS project_name, p.address, p.job_number,
             p.original_contract AS contract_amount,
             EXTRACT(MONTH   FROM COALESCE(pa.period_end, pa.created_at::date)) AS month,
             EXTRACT(QUARTER FROM COALESCE(pa.period_end, pa.created_at::date)) AS quarter,
             -- Gross billed this period (before retainage): Column C × Scheduled Value
             COALESCE((
               SELECT SUM(sl.scheduled_value * pal.this_pct / 100)
               FROM pay_app_lines pal
               JOIN sov_lines sl ON sl.id = pal.sov_line_id
               WHERE pal.pay_app_id = pa.id
             ), 0) AS gross_this,
             -- Live amount_due (H = F - G) computed from actual line percentages
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

    // KPIs — sum over submitted/approved/received only
    const billedRows = rows.filter(r => ['submitted','approved','paid'].includes(r.status) || r.payment_received);
    const gross_billed   = billedRows.reduce((s, r) => s + parseFloat(r.gross_this    || 0), 0);
    const total_billed   = gross_billed; // use gross (same as dashboard /api/stats) so numbers are consistent
    const net_billed     = billedRows.reduce((s, r) => s + parseFloat(r.amount_due    || 0), 0);
    const total_retention = billedRows.reduce((s, r) => s + parseFloat(r.retention_held || 0), 0);
    const active_projects = new Set(rows.map(r => r.project_name)).size;

    // Build chart buckets
    let chart = [];
    if (period === 'monthly') {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      chart = months.map((label, i) => ({
        label,
        amount: billedRows.filter(r => parseInt(r.month) === i+1).reduce((s,r)=>s+parseFloat(r.amount_due||0),0)
      }));
    } else if (period === 'quarterly') {
      chart = ['Q1','Q2','Q3','Q4'].map((label, i) => ({
        label,
        amount: billedRows.filter(r => parseInt(r.quarter) === i+1).reduce((s,r)=>s+parseFloat(r.amount_due||0),0)
      }));
    } else {
      // Yearly — compute live amounts so we don't rely on stale snapshots
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
      chart = yRes.rows.map(r => ({ label: String(parseInt(r.yr)), amount: parseFloat(r.amount)||0 }));
    }

    res.json({ total_billed, net_billed, total_retention, active_projects, chart, rows });
  } catch(e) {
    console.error('[Revenue] ERROR:', e.message, '\n', e.stack);
    res.status(500).json({ error: 'Internal server error', detail: e.message });
  }
});

// ── PAYMENT RECEIVED TOGGLE ────────────────────────────────────────────────
app.post('/api/payapps/:id/payment-received', auth, async (req, res) => {
  try {
    const { received } = req.body; // true or false
    // Verify the pay app belongs to this user
    const check = await pool.query(
      `SELECT pa.id FROM pay_apps pa JOIN projects p ON p.id=pa.project_id WHERE pa.id=$1 AND p.user_id=$2`,
      [req.params.id, req.user.id]
    );
    if (!check.rows[0]) return res.status(404).json({ error: 'Not found' });
    const r = await pool.query(
      `UPDATE pay_apps SET payment_received=$1, payment_received_at=$2 WHERE id=$3 RETURNING *`,
      [!!received, received ? new Date() : null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e) {
    console.error('[PaymentReceived]', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── SHARED HELPER: fetch all pay apps for a user/year with live amounts ──────
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

// ── QUICKBOOKS IIF EXPORT ─────────────────────────────────────────────────────
// DR Accounts Receivable / CR Construction Revenue per invoice.
// Import: QB Desktop — File > Utilities > Import > IIF Files
app.get('/api/revenue/export/quickbooks', auth, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const rows = await fetchRevenueRows(req.user.id, year);
    const billed = rows.filter(r => ['submitted','approved','paid'].includes(r.status) || r.payment_received);

    const fmtD = d => { const dt = new Date(d||Date.now()); return `${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}/${dt.getFullYear()}`; };
    const fmtA = n => parseFloat(n||0).toFixed(2);

    let iif = '!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\tCLEAR\tTOPRINT\n';
    iif    += '!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\tCLEAR\n';
    iif    += '!ENDTRNS\n';

    billed.forEach((r, i) => {
      const date     = fmtD(r.period_end);
      const customer = r.project_name || 'Unknown';
      const docNum   = `${r.job_number||''}#${r.app_number}`.trim();
      const memo     = `Pay App #${r.app_number} — ${r.project_name}`;
      const amt      = fmtA(r.amount_due);
      const negAmt   = fmtA(-parseFloat(r.amount_due||0));

      iif += `TRNS\t${1000+i}\tINVOICE\t${date}\tAccounts Receivable\t${customer}\t${amt}\t${docNum}\t${memo}\tN\tY\n`;
      iif += `SPL\t${2000+i}\tINVOICE\t${date}\tConstruction Revenue\t${customer}\t${negAmt}\t${docNum}\t${memo}\tN\n`;
      iif += 'ENDTRNS\n';
    });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="revenue_${year}_quickbooks.iif"`);
    res.send(iif);
  } catch(e) {
    console.error('[QB Export]', e.message);
    res.status(500).json({ error: 'Export failed' });
  }
});

// ── SAGE 300 CONSTRUCTION CSV EXPORT ─────────────────────────────────────────
// AR Invoice batch import.
// Import path: A/R → A/R Transactions → Invoice Batch List → File → Import
app.get('/api/revenue/export/sage', auth, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const rows = await fetchRevenueRows(req.user.id, year);
    const billed = rows.filter(r => ['submitted','approved','paid'].includes(r.status) || r.payment_received);

    const fmtD = d => { const dt = new Date(d||Date.now()); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`; };
    const fmtA = n => parseFloat(n||0).toFixed(2);

    const headers = ['CUSTOMER_NO','CUSTOMER_NAME','DOCUMENT_NO','DOCUMENT_DATE','DUE_DATE','GL_ACCOUNT','DESCRIPTION','INVOICE_AMOUNT','RETAINAGE_AMOUNT','JOB_NUMBER'];
    const csvRows = billed.map(r => [
      r.job_number || r.project_name?.replace(/\s/g,'').toUpperCase().slice(0,10) || 'CUST001',
      r.project_name || '',
      `PA${String(r.app_number).padStart(3,'0')}-${r.job_number||r.id}`,
      fmtD(r.period_end),
      fmtD(r.period_end ? new Date(new Date(r.period_end).getTime() + 30*24*60*60*1000) : null),
      '4000-00',
      `Pay App #${r.app_number} - ${r.project_name}`,
      fmtA(r.amount_due),
      fmtA(r.retention_held),
      r.job_number || ''
    ]);

    const csv = [headers, ...csvRows].map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="revenue_${year}_sage300.csv"`);
    res.send(csv);
  } catch(e) {
    console.error('[Sage Export]', e.message);
    res.status(500).json({ error: 'Export failed' });
  }
});

// ── ANNUAL REVENUE REPORT PDF ─────────────────────────────────────────────────
app.get('/api/revenue/report/pdf', auth, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const rows = await fetchRevenueRows(req.user.id, year);

    const fmtM  = n => '$' + parseFloat(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    const fmtD  = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

    const billed = rows.filter(r => ['submitted','approved','paid'].includes(r.status) || r.payment_received);
    const total_billed    = billed.reduce((s,r)=>s+parseFloat(r.amount_due||0),0);
    const total_retention = billed.reduce((s,r)=>s+parseFloat(r.retention_held||0),0);
    const net_received    = total_billed - total_retention;
    const active_projects = new Set(rows.map(r=>r.project_name)).size;

    // Monthly chart data
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthlyAmounts = months.map((_,i) =>
      billed.filter(r => r.period_end && new Date(r.period_end).getMonth()===i)
            .reduce((s,r)=>s+parseFloat(r.amount_due||0),0)
    );
    const maxAmt = Math.max(...monthlyAmounts, 1);

    const barBars = months.map((m,i) => {
      const h = Math.round((monthlyAmounts[i]/maxAmt)*80);
      const lbl = monthlyAmounts[i]>0 ? `$${Math.round(monthlyAmounts[i]/1000)}k` : '';
      return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;gap:3px">
        <div style="font-size:9px;color:#185FA5;font-weight:600">${lbl}</div>
        <div style="width:100%;height:${h}px;background:linear-gradient(to top,#185FA5,#4a9be0);border-radius:3px 3px 0 0;min-height:${monthlyAmounts[i]>0?4:0}px"></div>
        <div style="font-size:9px;color:#666">${m}</div>
      </div>`;
    }).join('');

    const tableRows = rows.map(r => `
      <tr>
        <td>${r.job_number||'—'}</td>
        <td>${r.project_name||'—'}</td>
        <td>#${r.app_number}</td>
        <td>${fmtD(r.period_end)}</td>
        <td style="text-align:right">${fmtM(r.contract_amount)}</td>
        <td style="text-align:right">${fmtM(r.amount_due)}</td>
        <td style="text-align:right">${fmtM(r.retention_held)}</td>
        <td style="text-align:center"><span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:${r.status==='submitted'||r.status==='approved'?'#d1fae5':'#fef3c7'};color:${r.status==='submitted'||r.status==='approved'?'#065f46':'#92400e'}">${r.status||'draft'}</span></td>
        <td style="text-align:center">${r.payment_received?'✓':'—'}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#1a1a2e;padding:32px 40px}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:18px;border-bottom:2px solid #185FA5}
      .co-name{font-size:20px;font-weight:700;color:#185FA5}
      .report-title{font-size:14px;color:#444;margin-top:3px}
      .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px}
      .kpi{background:#f0f6ff;border-radius:8px;padding:14px 16px;border:1px solid #c7dff7}
      .kpi-label{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px}
      .kpi-val{font-size:18px;font-weight:700;color:#185FA5}
      .section-title{font-size:12px;font-weight:700;color:#1a1a2e;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;text-transform:uppercase;letter-spacing:0.05em}
      .chart-wrap{display:flex;align-items:flex-end;gap:6px;height:100px;margin-bottom:24px;padding:0 4px}
      table{width:100%;border-collapse:collapse;font-size:10px}
      th{background:#185FA5;color:#fff;padding:7px 10px;text-align:left;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.04em}
      td{padding:7px 10px;border-bottom:1px solid #f1f5f9}
      tr:nth-child(even) td{background:#f8fafc}
      .footer{margin-top:28px;padding-top:12px;border-top:1px solid #e2e8f0;text-align:center;font-size:9px;color:#999}
    </style></head><body>
    <div class="header">
      <div>
        <div class="co-name">Annual Revenue Report</div>
        <div class="report-title">Fiscal Year ${year} · Generated ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div>
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
    <div class="footer">ConstructInvoice AI · $0 to use — pay it forward instead: feed a child, help a neighbor 🙏</div>
    </body></html>`;

    let pdfBuf;
    if (puppeteer) {
      const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      pdfBuf = await page.pdf({ format: 'Letter', printBackground: true, margin: { top:'0.4in', bottom:'0.4in', left:'0.4in', right:'0.4in' } });
      await browser.close();
    } else {
      return res.status(503).json({ error: 'PDF generation unavailable' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="annual_revenue_report_${year}.pdf"`);
    res.send(pdfBuf);
  } catch(e) {
    console.error('[Annual Report]', e.message);
    res.status(500).json({ error: 'Report generation failed' });
  }
});

// ── PUBLIC INVOICE VIEW (no auth — shareable link sent to owners) ──────────
app.get('/invoice/:token', async (req, res) => {
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
    if (!r.rows[0]) return res.status(404).send('<h2>Invoice not found or link has expired.</h2>');
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
    const fmt = v => '$' + parseFloat(v||0).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2});
    const dueDate = pa.payment_due_date ? new Date(pa.payment_due_date) : null;
    const today = new Date(); today.setHours(0,0,0,0);
    const daysUntil = dueDate ? Math.round((dueDate - today) / 86400000) : null;
    const isOverdue = daysUntil !== null && daysUntil < 0;
    const isDueToday = daysUntil === 0;
    const statusColor = isOverdue ? '#dc2626' : isDueToday ? '#d97706' : '#1d4ed8';
    const statusText = isOverdue ? `OVERDUE — ${Math.abs(daysUntil)} DAYS PAST DUE` : isDueToday ? 'DUE TODAY' : dueDate ? `DUE IN ${daysUntil} DAYS` : 'INVOICE';
    const logoUrl = pa.logo_filename ? `/uploads/${pa.logo_filename}` : null;

    const linesHTML = lines.rows.map(l => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b">${l.item_id||''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px">${l.description}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right">${fmt(l.scheduled_value)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right">${parseFloat(l.prev_pct||0).toFixed(0)}%</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right;font-weight:600">${parseFloat(l.this_pct||0).toFixed(0)}%</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right;font-weight:600">${fmt(l.this_amount)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right;color:#94a3b8">${fmt(l.retainage)}</td>
      </tr>`).join('');

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice — ${pa.project_name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#1e293b;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @media print{body{background:#fff}.no-print{display:none!important}}
</style>
</head>
<body>
<div style="max-width:860px;margin:0 auto;padding:24px 16px">
  <!-- Status banner -->
  <div style="background:${statusColor};color:#fff;text-align:center;padding:14px;border-radius:10px 10px 0 0;font-size:17px;font-weight:800;letter-spacing:0.05em">${statusText}</div>
  <!-- Header -->
  <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:28px 32px;display:flex;justify-content:space-between;align-items:flex-start;gap:24px;flex-wrap:wrap">
    <div>
      ${logoUrl ? `<img src="${logoUrl}" style="max-height:60px;max-width:180px;object-fit:contain;margin-bottom:12px;display:block"/>` : `<div style="font-size:20px;font-weight:800;color:#0C3B6B;margin-bottom:8px">${pa.company_name||pa.contractor||'Contractor'}</div>`}
      <div style="font-size:13px;color:#64748b">${pa.co_contact||pa.contact_name||''}</div>
      <div style="font-size:13px;color:#64748b">${pa.co_email||pa.contact_email||''}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:28px;font-weight:800;color:${statusColor}">${fmt(totalDue)}</div>
      <div style="font-size:13px;color:#64748b;margin-top:4px">Amount Due${dueDate ? ' — Due ' + dueDate.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : ''}</div>
      ${totalRet > 0 ? `<div style="font-size:12px;color:#94a3b8;margin-top:2px">+ ${fmt(totalRet)} retention held</div>` : ''}
    </div>
  </div>
  <!-- Project info -->
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;padding:16px 32px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
    <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#94a3b8;margin-bottom:3px">Project</div><div style="font-size:13px;font-weight:600">${pa.project_name}</div>${pa.job_number ? `<div style="font-size:11px;color:#64748b">Job #${pa.job_number}</div>` : ''}</div>
    <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#94a3b8;margin-bottom:3px">Pay Application</div><div style="font-size:13px;font-weight:600">No. ${pa.app_number}</div><div style="font-size:11px;color:#64748b">${pa.period_label||''}</div></div>
    <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#94a3b8;margin-bottom:3px">Bill To</div><div style="font-size:13px;font-weight:600">${pa.owner||'Owner'}</div>${pa.owner_email ? `<div style="font-size:11px;color:#64748b">${pa.owner_email}</div>` : ''}</div>
  </div>
  <!-- Pay Now button -->
  <div class="no-print" style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:20px 32px;text-align:center;border-bottom:none">
    <div style="font-size:13px;color:#64748b;margin-bottom:12px">To pay, please remit <strong>${fmt(totalDue)}</strong> via check or wire transfer per your contract terms.</div>
    <a href="mailto:${pa.co_email||pa.contact_email||''}?subject=Payment%20for%20${encodeURIComponent(pa.project_name)}%20Pay%20App%20%23${pa.app_number}&body=Please%20find%20payment%20confirmation%20for%20Pay%20Application%20%23${pa.app_number}." style="display:inline-block;background:#0C3B6B;color:#fff;padding:13px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;margin-right:12px">📧 Confirm Payment</a>
    <button onclick="window.print()" style="display:inline-block;background:#f1f5f9;color:#1e293b;border:1px solid #e2e8f0;padding:13px 24px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer">🖨 Print Invoice</button>
  </div>
  <!-- SOV table -->
  <div style="background:#fff;border:1px solid #e2e8f0;overflow:hidden;margin-top:0">
    <div style="padding:14px 32px;background:#f8fafc;border-bottom:1px solid #e2e8f0">
      <div style="font-size:13px;font-weight:700;color:#0C3B6B">Schedule of Values — Pay Application #${pa.app_number}</div>
    </div>
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;border-bottom:1px solid #e2e8f0">Item</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;border-bottom:1px solid #e2e8f0">Description</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;border-bottom:1px solid #e2e8f0">Scheduled</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;border-bottom:1px solid #e2e8f0">Prev %</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;border-bottom:1px solid #e2e8f0">This %</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;border-bottom:1px solid #e2e8f0">This Period</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;border-bottom:1px solid #e2e8f0">Retainage</th>
        </tr>
      </thead>
      <tbody>${linesHTML}</tbody>
      <tfoot>
        <tr style="background:#0C3B6B">
          <td colspan="5" style="padding:12px 32px;color:#fff;font-weight:700;font-size:14px">TOTAL AMOUNT DUE THIS PERIOD</td>
          <td style="padding:12px 12px;color:#fff;font-weight:800;font-size:16px;text-align:right">${fmt(totalDue)}</td>
          <td style="padding:12px 12px;color:rgba(255,255,255,0.7);font-size:13px;text-align:right">${fmt(totalRet)}</td>
        </tr>
      </tfoot>
    </table>
    </div>
  </div>
  <div style="text-align:center;padding:20px;font-size:11px;color:#94a3b8">Generated by Construction AI Billing · ${new Date().toLocaleDateString()}</div>
</div>
</body></html>`);
  } catch(e) {
    console.error('[Public Invoice]', e.message);
    res.status(500).send('<h2>Error loading invoice.</h2>');
  }
});

// ── FEEDBACK WIDGET ────────────────────────────────────────────────────────
app.post('/api/feedback', auth, upload.single('screenshot'), async (req, res) => {
  const { category, message, page_context } = req.body;
  if (!message && !req.file) return res.status(400).json({ error: 'Message or screenshot required' });
  if (rejectFile(req, res, MIME_SCREENSHOT, 'screenshot')) return;
  try {
    const screenshotFilename = req.file ? req.file.filename : null;
    const r = await pool.query(
      'INSERT INTO feedback(user_id,category,message,screenshot_filename,page_context) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [req.user.id, category||'other', message||null, screenshotFilename, page_context||null]
    );
    await logEvent(req.user.id, 'feedback_submitted', { category: category||'other' });
    res.json({ ok: true, id: r.rows[0].id });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/api/admin/feedback', adminAuth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT f.*, u.name as user_name, u.email as user_email
      FROM feedback f
      LEFT JOIN users u ON u.id = f.user_id
      ORDER BY f.created_at DESC
      LIMIT 200
    `);
    res.json(r.rows);
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Weekly feedback digest — every Monday at 7am, only if new items exist ──
let lastWeeklyDigestDate = null;
setInterval(async () => {
  const now = new Date();
  const isMonday = now.getDay() === 1;          // 0=Sun, 1=Mon
  if (!isMonday || now.getHours() !== 7) return; // only fire Monday at 7am
  const today = now.toISOString().slice(0, 10);
  if (lastWeeklyDigestDate === today) return;    // already sent this week
  lastWeeklyDigestDate = today;

  try {
    const r = await pool.query(`
      SELECT f.*, u.name as user_name, u.email as user_email
      FROM feedback f LEFT JOIN users u ON u.id = f.user_id
      WHERE f.digest_sent = FALSE ORDER BY f.created_at
    `);
    if (r.rows.length === 0) return; // nothing new — skip email entirely

    const items = r.rows.map((f, i) => `
      <tr style="background:${i%2===0?'#f9f9f9':'#fff'}">
        <td style="padding:8px;border:1px solid #ddd;font-size:12px">${f.created_at.toISOString().slice(0,16).replace('T',' ')}</td>
        <td style="padding:8px;border:1px solid #ddd;font-size:12px">${f.user_name||'Anon'} (${f.user_email||'—'})</td>
        <td style="padding:8px;border:1px solid #ddd;font-size:12px">${f.category}</td>
        <td style="padding:8px;border:1px solid #ddd;font-size:12px">${(f.message||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>
        <td style="padding:8px;border:1px solid #ddd;font-size:12px">${f.page_context||'—'}</td>
      </tr>`).join('');

    const html = `<div style="font-family:sans-serif;max-width:900px;margin:0 auto;padding:24px">
      <h2 style="color:#185FA5">Weekly Feedback Digest — Construction AI Billing</h2>
      <p style="color:#555">${r.rows.length} new feedback item${r.rows.length!==1?'s':''} from your users this week.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:16px">
        <thead><tr style="background:#185FA5;color:#fff">
          <th style="padding:8px;border:1px solid #ddd;text-align:left">Time</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left">User</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left">Category</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left">Message</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left">Page</th>
        </tr></thead>
        <tbody>${items}</tbody>
      </table>
      <p style="color:#888;font-size:11px;margin-top:20px">
        View all feedback live at <a href="https://constructinv.varshyl.com" style="color:#185FA5">constructinv.varshyl.com</a> → Admin → Feedback inbox.<br>
        You only receive this email when there are new items. No activity = no email.
      </p>
    </div>`;

    const apiKey = process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY;
    const digestTo = process.env.DIGEST_EMAIL || 'vaakapila@gmail.com';
    const fromEmail = process.env.FROM_EMAIL || 'noreply@varshyl.com';
    if (apiKey) {
      const isResend = !!process.env.RESEND_API_KEY;
      const payload = isResend
        ? { from: fromEmail, to: [digestTo], subject: `[Weekly Digest] ${r.rows.length} new feedback item${r.rows.length!==1?'s':''} — ${today}`, html }
        : { personalizations:[{to:[{email:digestTo}]}], from:{email:fromEmail},
            subject:`[Weekly Digest] ${r.rows.length} new feedback item${r.rows.length!==1?'s':''} — ${today}`,
            content:[{type:'text/html',value:html}] };
      await fetchEmail(isResend ? 'https://api.resend.com/emails' : 'https://api.sendgrid.com/v3/mail/send', {
        method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},
        body:JSON.stringify(payload),
      });
      const ids = r.rows.map(f => f.id);
      await pool.query('UPDATE feedback SET digest_sent=TRUE WHERE id=ANY($1)', [ids]);
      console.log(`[Weekly Digest] Sent ${r.rows.length} feedback items to ${digestTo}`);
    } else {
      console.log(`[DEV] Weekly digest: ${r.rows.length} items would be sent to ${digestTo}`);
    }
  } catch(e) { console.error('[Weekly Digest] Error:', e.message); }
}, 30 * 60 * 1000); // check every 30 minutes (tight enough to not miss the Monday 7am window)

// ── PAYMENT & RETENTION REMINDERS ─────────────────────────────────────────
// Runs once per hour. Checks payment_due_date and retention_due_date on projects.
// Sends via Resend. Respects per-user toggle preferences.
// ── REMINDER EMAIL ENGINE ─────────────────────────────────────────────────
async function sendReminderEmail({ to, cc, replyTo, subject, html, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromName = process.env.FROM_NAME || 'Construction AI Billing';
  const fromEmail = process.env.FROM_EMAIL || 'reminders@varshyl.com';
  if (!apiKey) {
    console.log(`[DEV Reminder] TO: ${to} CC: ${cc||'-'} | ${subject}`);
    return true;
  }
  try {
    const payload = {
      from: `${fromName} <${fromEmail}>`,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    };
    if (cc) payload.cc = Array.isArray(cc) ? cc : [cc];
    if (replyTo) payload.reply_to = replyTo;
    if (attachments && attachments.length) payload.attachments = attachments;
    const r = await fetchEmail('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r.ok) { const e = await r.text(); console.error('[Resend Reminder]', e); return false; }
    return true;
  } catch(e) { console.error('[Reminder Email Error]', e.message); return false; }
}

function buildReminderEmail({
  urgency,           // 'upcoming' | 'due_today' | 'overdue' | 'retention'
  daysLabel,         // e.g. "7 days", "TODAY", "7 days OVERDUE"
  projectName, jobNumber, address,
  payAppNumber, periodLabel,
  amountDue, retentionHeld, contractAmount,
  dueDate,
  invoiceUrl,        // public /invoice/:token link
  contractorName, contractorEmail,
  ownerName,
  upcomingInvoices,  // array of {project_name, amount_due, due_date} within 14 days
}) {
  const fmt = v => v ? '$' + parseFloat(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}) : '';

  const colors = {
    upcoming: { banner:'#1d4ed8', badge:'#dbeafe', badgeText:'#1e40af', icon:'📅' },
    due_today: { banner:'#d97706', badge:'#fef3c7', badgeText:'#92400e', icon:'🗓️' },
    overdue:   { banner:'#dc2626', badge:'#fee2e2', badgeText:'#991b1b', icon:'🚨' },
    retention: { banner:'#059669', badge:'#d1fae5', badgeText:'#065f46', icon:'💰' },
  };
  const c = colors[urgency] || colors.upcoming;

  const bannerText = {
    upcoming: `Payment Due in ${daysLabel}`,
    due_today: 'Payment Due TODAY',
    overdue: `Payment ${daysLabel} Overdue — Action Required`,
    retention: `Retention Release Due in ${daysLabel}`,
  }[urgency];

  const messageText = {
    upcoming: `This is a friendly reminder that payment for the project below is due in <strong>${daysLabel}</strong>. Please review the invoice and plan your payment accordingly.`,
    due_today: `Payment for the project below is <strong>due today</strong>. Please remit payment at your earliest convenience to avoid a formal follow-up.`,
    overdue: `Payment for the project below was due <strong>${daysLabel} ago</strong> and has not been received. Please remit payment immediately or contact us to discuss. Continued non-payment may result in lien action per applicable law.`,
    retention: `Per your contract, retention for the project below is due for release in <strong>${daysLabel}</strong>. Please initiate the retention payment process.`,
  }[urgency];

  const upcomingBlock = (upcomingInvoices && upcomingInvoices.length > 0) ? `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-top:20px">
      <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px">📋 Also Due Within 14 Days</div>
      ${upcomingInvoices.map(u => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f1f5f9">
          <div style="font-size:13px;color:#1e293b">${u.project_name}</div>
          <div style="font-size:13px;font-weight:600;color:#0C3B6B">${fmt(u.amount_due)} — ${fmtDate(u.due_date)}</div>
        </div>`).join('')}
    </div>` : '';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:600px;margin:32px auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.1)">

  <!-- Status banner -->
  <div style="background:${c.banner};padding:18px 32px;text-align:center">
    <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:0.02em">${c.icon} ${bannerText}</div>
  </div>

  <!-- Header -->
  <div style="background:#0C3B6B;padding:20px 32px;display:flex;align-items:center;justify-content:space-between">
    <div>
      <div style="color:#fff;font-size:16px;font-weight:700">${contractorName || 'Construction AI Billing'}</div>
      <div style="color:rgba(255,255,255,0.65);font-size:12px">Pay Application Notice</div>
    </div>
    <div style="text-align:right">
      <div style="color:#fff;font-size:28px;font-weight:800">${fmt(amountDue)}</div>
      <div style="color:rgba(255,255,255,0.65);font-size:12px">Amount Due</div>
    </div>
  </div>

  <!-- Body -->
  <div style="background:#fff;padding:28px 32px">
    <p style="font-size:14px;color:#475569;margin:0 0 20px">${messageText}</p>

    <!-- Invoice card -->
    <div style="border:2px solid ${c.banner};border-radius:10px;overflow:hidden;margin-bottom:24px">
      <div style="background:${c.badge};padding:12px 20px;display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:13px;font-weight:700;color:${c.bannerText}">INVOICE DETAILS</div>
        <div style="font-size:12px;color:${c.bannerText}">Pay App #${payAppNumber || '?'} · ${periodLabel || ''}</div>
      </div>
      <div style="padding:16px 20px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em">Project</div>
          <div style="font-size:14px;font-weight:700;color:#0a1f3c;margin-top:2px">${projectName}</div>
          ${jobNumber ? `<div style="font-size:11px;color:#64748b">Job #${jobNumber}</div>` : ''}
          ${address ? `<div style="font-size:11px;color:#64748b">${address}</div>` : ''}
        </div>
        <div>
          <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em">Due Date</div>
          <div style="font-size:14px;font-weight:700;color:${c.banner};margin-top:2px">${fmtDate(dueDate)}</div>
          ${contractAmount ? `<div style="font-size:11px;color:#64748b">Contract: ${fmt(contractAmount)}</div>` : ''}
        </div>
        <div>
          <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em">Amount Due</div>
          <div style="font-size:22px;font-weight:800;color:${c.banner};margin-top:2px">${fmt(amountDue)}</div>
        </div>
        ${retentionHeld > 0 ? `<div>
          <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em">Retention Held</div>
          <div style="font-size:14px;font-weight:600;color:#64748b;margin-top:2px">${fmt(retentionHeld)}</div>
          <div style="font-size:11px;color:#94a3b8">Not due this payment</div>
        </div>` : ''}
      </div>
    </div>

    <!-- View Invoice button -->
    <div style="text-align:center;margin-bottom:20px">
      <a href="${invoiceUrl}" style="display:inline-block;background:${c.banner};color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:800;font-size:16px;letter-spacing:0.02em">
        View Full Invoice &amp; Pay →
      </a>
      <div style="font-size:11px;color:#94a3b8;margin-top:8px">Click to view the complete invoice with all line items</div>
    </div>

    ${upcomingBlock}
  </div>

  <!-- Footer -->
  <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center">
    <div style="font-size:12px;color:#64748b">Questions? Reply to this email or contact <a href="mailto:${contractorEmail||''}" style="color:#185FA5">${contractorEmail||contractorName||'the billing team'}</a></div>
    <div style="font-size:10px;color:#94a3b8;margin-top:6px">
      Sent by Construction AI Billing on behalf of ${contractorName||'your contractor'} ·
      <a href="${process.env.APP_URL||'https://constructinv.varshyl.com'}/settings" style="color:#94a3b8">Manage reminders</a>
    </div>
  </div>
</div>
</body></html>`;
}

async function runPaymentReminders() {
  try {
    const appUrl = process.env.APP_URL || 'https://constructinv.varshyl.com';
    const today = new Date(); today.setHours(0,0,0,0);

    // Get all pay apps with due dates, with user prefs and project info
    // payment_due_date is per pay_app (auto-calculated from payment_terms on submission)
    const res = await pool.query(`
      SELECT p.id as project_id, p.name as project_name, p.job_number, p.address,
             p.owner, p.owner_email, p.retention_due_date,
             p.original_contract, p.user_id,
             pa.id as pay_app_id, pa.app_number as pay_app_number, pa.period_label,
             pa.amount_due, pa.retention_held, pa.invoice_token,
             pa.payment_due_date,
             cs.reminder_7before, cs.reminder_due, cs.reminder_7after, cs.reminder_retention,
             cs.reminder_email, cs.reminder_phone, cs.company_name,
             u.email as user_email, u.name as user_name
      FROM projects p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN company_settings cs ON cs.user_id = p.user_id
      INNER JOIN pay_apps pa ON pa.project_id = p.id AND pa.status = 'submitted' AND pa.deleted_at IS NULL
        AND pa.id = (SELECT id FROM pay_apps WHERE project_id=p.id AND status='submitted' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1)
      WHERE (pa.payment_due_date IS NOT NULL OR p.retention_due_date IS NOT NULL)
        AND u.blocked IS NOT TRUE
    `);

    // Get all upcoming invoices per user (within 14 days) for "also due soon" section
    const upcomingRes = await pool.query(`
      SELECT p.user_id, p.name as project_name, pa.amount_due, pa.payment_due_date as due_date
      FROM projects p
      JOIN pay_apps pa ON pa.project_id = p.id AND pa.status='submitted' AND pa.deleted_at IS NULL
        AND pa.id = (SELECT id FROM pay_apps WHERE project_id=p.id AND status='submitted' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1)
      WHERE pa.payment_due_date BETWEEN NOW() AND NOW() + INTERVAL '14 days'
    `);
    const upcomingByUser = {};
    for (const u of upcomingRes.rows) {
      if (!upcomingByUser[u.user_id]) upcomingByUser[u.user_id] = [];
      upcomingByUser[u.user_id].push(u);
    }

    for (const r of res.rows) {
      // TO: owner email (who pays). CC: contractor (reminder_email or user_email)
      const ownerEmail = r.owner_email;
      const contractorEmail = r.reminder_email || r.user_email;
      const contractorName = r.company_name || r.user_name;
      const invoiceUrl = r.invoice_token ? `${appUrl}/invoice/${r.invoice_token}` : appUrl;
      const upcomingInvoices = (upcomingByUser[r.user_id] || []).filter(u => u.project_name !== r.project_name);

      const baseArgs = {
        projectName: r.project_name, jobNumber: r.job_number, address: r.address,
        payAppNumber: r.pay_app_number, periodLabel: r.period_label,
        amountDue: r.amount_due, retentionHeld: parseFloat(r.retention_held||0),
        contractAmount: r.original_contract,
        contractorName, contractorEmail, ownerName: r.owner,
        invoiceUrl, upcomingInvoices,
      };

      const payDue = r.payment_due_date ? new Date(r.payment_due_date) : null;
      const retDue = r.retention_due_date ? new Date(r.retention_due_date) : null;
      const daysDiff = (d) => Math.round((d - today) / (1000 * 60 * 60 * 24));

      const alreadySent = async (type) => {
        const chk = await pool.query(
          `SELECT id FROM reminder_log WHERE project_id=$1 AND reminder_type=$2 AND sent_at > NOW() - INTERVAL '20 hours'`,
          [r.project_id, type]);
        return chk.rows.length > 0;
      };

      const logSent = async (type, to) => {
        await pool.query('INSERT INTO reminder_log(user_id,project_id,pay_app_id,reminder_type,sent_to) VALUES($1,$2,$3,$4,$5)',
          [r.user_id, r.project_id, r.pay_app_id, type, to]);
      };

      if (payDue) {
        const diff = daysDiff(payDue);

        if (diff === 7 && r.reminder_7before !== false && !await alreadySent('7_before')) {
          const subject = `Payment Due in 7 Days — ${r.project_name}`;
          const html = buildReminderEmail({ ...baseArgs, urgency:'upcoming', daysLabel:'7 days', dueDate:payDue });
          const ok = await sendReminderEmail({ to: ownerEmail||contractorEmail, cc: ownerEmail ? contractorEmail : null, replyTo: contractorEmail, subject, html });
          if (ok) await logSent('7_before', ownerEmail||contractorEmail);
        }

        if (diff === 0 && r.reminder_due !== false && !await alreadySent('due_today')) {
          const subject = `⚠️ Payment Due TODAY — ${r.project_name} — ${baseArgs.amountDue ? '$'+parseFloat(baseArgs.amountDue).toLocaleString() : ''}`;
          const html = buildReminderEmail({ ...baseArgs, urgency:'due_today', daysLabel:'TODAY', dueDate:payDue });
          const ok = await sendReminderEmail({ to: ownerEmail||contractorEmail, cc: ownerEmail ? contractorEmail : null, replyTo: contractorEmail, subject, html });
          if (ok) await logSent('due_today', ownerEmail||contractorEmail);
        }

        if (diff === -7 && r.reminder_7after !== false && !await alreadySent('7_after')) {
          const subject = `🚨 OVERDUE: Payment 7 Days Past Due — ${r.project_name}`;
          const html = buildReminderEmail({ ...baseArgs, urgency:'overdue', daysLabel:'7 days', dueDate:payDue });
          const ok = await sendReminderEmail({ to: ownerEmail||contractorEmail, cc: ownerEmail ? contractorEmail : null, replyTo: contractorEmail, subject, html });
          if (ok) await logSent('7_after', ownerEmail||contractorEmail);
        }

        // Also fire at -14 and -21 for persistent non-payers
        if ((diff === -14 || diff === -21) && r.reminder_7after !== false && !await alreadySent(`overdue_${Math.abs(diff)}`)) {
          const absDays = Math.abs(diff);
          const subject = `🚨 OVERDUE ${absDays} Days — ${r.project_name} — Immediate Attention Required`;
          const html = buildReminderEmail({ ...baseArgs, urgency:'overdue', daysLabel:`${absDays} days`, dueDate:payDue });
          const ok = await sendReminderEmail({ to: ownerEmail||contractorEmail, cc: ownerEmail ? contractorEmail : null, replyTo: contractorEmail, subject, html });
          if (ok) await logSent(`overdue_${absDays}`, ownerEmail||contractorEmail);
        }
      }

      // Retention reminders — to contractor (they need to request it)
      if (retDue && r.reminder_retention !== false) {
        const diff = daysDiff(retDue);
        if ((diff === 30 || diff === 14 || diff === 7) && !await alreadySent(`retention_${diff}`)) {
          const subject = `Retention Release Due in ${diff} Days — ${r.project_name}`;
          const html = buildReminderEmail({ ...baseArgs, urgency:'retention', daysLabel:`${diff} days`, dueDate:retDue, amountDue: r.retention_held });
          const ok = await sendReminderEmail({ to: contractorEmail, replyTo: contractorEmail, subject, html });
          if (ok) await logSent(`retention_${diff}`, contractorEmail);
        }
      }
    }
    console.log(`[Reminders] Checked ${res.rows.length} projects at ${new Date().toISOString()}`);
  } catch(e) { console.error('[Reminders Error]', e.message); }
}

// Run reminders every hour
setInterval(runPaymentReminders, 60 * 60 * 1000);
// Also run once at startup (after a short delay so DB is ready)
setTimeout(runPaymentReminders, 15000);

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

initDB()
  .then(() => app.listen(PORT, () => console.log(`Construction AI Billing running on port ${PORT}`)))
  .catch(err => {
    console.error('STARTUP FAILED:', err.message);
    console.error('DATABASE_URL set:', !!process.env.DATABASE_URL);
    process.exit(1);
  });