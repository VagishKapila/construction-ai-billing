require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ── Stripe SDK (lazy init — only active when STRIPE_SECRET_KEY is set) ──────
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  const Stripe = require('stripe');
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  console.log('[Stripe] SDK initialized' + (process.env.STRIPE_SECRET_KEY.startsWith('sk_test') ? ' (TEST mode)' : ' (LIVE mode)'));
} else {
  console.log('[Stripe] No STRIPE_SECRET_KEY — payment features disabled');
}
const PDFDocument = require('pdfkit');
const multer = require('multer');
let puppeteer = null;
try { puppeteer = require('puppeteer'); } catch(e) { console.warn('[PDF] Puppeteer not available, falling back to PDFKit'); }

// ── Sharp: optional server-side image compression ─────────────────────────
// Graceful: if sharp isn't installed or fails to load, compression is skipped
// silently. Invoices always send regardless. Never crashes the app.
let sharp = null;
try { sharp = require('sharp'); console.log('[sharp] Server-side image compression enabled'); }
catch(e) { console.log('[sharp] Not available — client-side compression only (install sharp + libvips to enable)'); }

async function compressUploadedImage(filePath) {
  if (!sharp) return; // no sharp = skip silently, original file used as-is
  const stat = fs.statSync(filePath);
  if (stat.size < 500 * 1024) return; // skip small files (< 500KB)
  const tmp = filePath + '.sharp_tmp';
  try {
    await sharp(filePath)
      .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, progressive: true })
      .toFile(tmp);
    const newStat = fs.statSync(tmp);
    fs.renameSync(tmp, filePath);
    console.log(`[sharp] ${path.basename(filePath)}: ${Math.round(stat.size/1024)}KB → ${Math.round(newStat.size/1024)}KB`);
  } catch(e) {
    console.warn('[sharp] Compression failed, using original:', e.message);
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch(_) {}
    // Original file untouched — invoice processing continues normally
  }
}
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
app.use((req, res, next) => {
  // Skip JSON parsing for Stripe webhook — it needs raw body for signature verification
  if (req.originalUrl === '/api/stripe/webhook') return next();
  express.json()(req, res, next);
});
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    // Prevent aggressive caching of HTML files so users always get latest version
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));
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
    res.json({token:tok,user:{id:user.id,name:user.name,email:user.email,email_verified:user.email_verified,trial_start_date:user.trial_start_date,trial_end_date:user.trial_end_date,subscription_status:user.subscription_status,plan_type:user.plan_type,has_completed_onboarding:user.has_completed_onboarding}});
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
    const resetUrl = `${appUrl}/app.html?reset=${resetToken}`;
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
    <h2 style="color:#2563eb">Welcome to Construction AI Billing</h2>
    <p>Hi ${name},</p>
    <p>Please verify your email address to keep your account in good standing.</p>
    <a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0">Verify my email →</a>
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
        'INSERT INTO users(name,email,password_hash,google_id,email_verified,trial_start_date,trial_end_date,subscription_status,plan_type) VALUES($1,$2,$3,$4,TRUE,NOW(),NOW()+INTERVAL \'90 days\',\'trial\',\'free_trial\') RETURNING *',
        [(profile.name || profile.email.split('@')[0]).replace(/[^\x00-\x7F]/g, '').trim() || profile.email.split('@')[0], profile.email, '', profile.id]
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
  .logo{font-size:14px;font-weight:600;color:#2563eb;margin-bottom:24px}
  p{font-size:14px;color:#555;margin-bottom:6px;text-align:left}
  .scope-list{background:#f8fafc;border-radius:8px;padding:14px 18px;text-align:left;font-size:13px;color:#333;margin:16px 0}
  .scope-list li{margin-bottom:4px}
  .client-name{font-weight:600;color:#1a1a1a}
  input{width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;margin:6px 0 14px;box-sizing:border-box}
  .btn{width:100%;padding:11px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;margin-top:6px}
  .btn-primary{background:#2563eb;color:#fff}
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

// ── Get current user (refresh cached data) ──────────────────────────────────
app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, name, email, email_verified, trial_start_date, trial_end_date, subscription_status, plan_type, has_completed_onboarding FROM users WHERE id=$1',
      [req.user.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ user: r.rows[0] });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
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
    if (!r.rows[0]) return res.redirect('/app.html?verify_error=invalid_or_expired_token');
    await logEvent(r.rows[0].id, 'email_verified', {});
    res.redirect('/app.html?verified=1');
  } catch(e) { res.redirect('/app.html?verify_error=server_error'); }
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

// PROJECTS
app.get('/api/projects', auth, async (req,res) => {
  const r = await pool.query('SELECT * FROM projects WHERE user_id=$1 ORDER BY created_at DESC',[req.user.id]);
  res.json(r.rows);
});

app.post('/api/projects', auth, async (req,res) => {
  const {name,number,owner,owner_email,owner_phone,contractor,architect,contact,contact_name,contact_phone,contact_email,building_area,original_contract,contract_date,est_date,default_retainage,payment_terms,include_architect,include_retainage} = req.body;
  const retPct = (default_retainage !== undefined && default_retainage !== null) ? parseFloat(default_retainage) : 10;
  const inclArch = include_architect !== false;
  const inclRet = include_retainage !== false;
  const r = await pool.query(
    `INSERT INTO projects(user_id,name,number,owner,owner_email,owner_phone,contractor,architect,contact,contact_name,contact_phone,contact_email,building_area,original_contract,contract_date,est_date,default_retainage,payment_terms,include_architect,include_retainage)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
    [req.user.id,name,number,owner,owner_email||null,owner_phone||null,contractor,architect,contact,contact_name,contact_phone,contact_email,building_area,original_contract,contract_date||null,est_date||null,retPct,payment_terms||null,inclArch,inclRet]
  );
  await logEvent(req.user.id, 'project_created', { project_id: r.rows[0].id, contract_value: original_contract });
  res.json(r.rows[0]);
});

app.put('/api/projects/:id', auth, async (req,res) => {
  const {name,number,owner,contractor,architect,contact,building_area,original_contract,contract_date,include_architect,include_retainage} = req.body;
  const r = await pool.query(
    'UPDATE projects SET name=$1,number=$2,owner=$3,contractor=$4,architect=$5,contact=$6,building_area=$7,original_contract=$8,contract_date=$9,include_architect=COALESCE($12,include_architect),include_retainage=COALESCE($13,include_retainage) WHERE id=$10 AND user_id=$11 RETURNING *',
    [name,number,owner,contractor,architect,contact,building_area,original_contract,contract_date,req.params.id,req.user.id,include_architect,include_retainage]
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
    'SELECT pa.*,p.name as project_name,p.owner,p.contractor,p.architect,p.contact,p.contact_name,p.contact_phone,p.contact_email,p.original_contract,p.number as project_number,p.building_area,p.id as project_id,p.contract_date,p.payment_terms,p.include_architect,p.include_retainage FROM pay_apps pa JOIN projects p ON p.id=pa.project_id WHERE pa.id=$1 AND p.user_id=$2 AND pa.deleted_at IS NULL',
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
  const {period_label,period_start,period_end,status,architect_certified,architect_name,architect_date,notes,po_number,special_notes} = req.body;
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
      dist_contractor = COALESCE($13, dist_contractor),
      po_number       = COALESCE($14, po_number),
      special_notes   = COALESCE($15, special_notes)
     WHERE id=$9 AND project_id IN (SELECT id FROM projects WHERE user_id=$10)
     RETURNING *`,
    [period_label||null, period_start||null, period_end||null,
     status||null, architect_certified||null, architect_name||null,
     architect_date||null, notes||null,
     req.params.id, req.user.id,
     distOwner, distArchitect, distContractor,
     po_number||null, special_notes||null]
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
          'UPDATE pay_apps SET amount_due=$1, retention_held=$2, submitted_at=COALESCE(submitted_at, NOW()) WHERE id=$3',
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

    // Auto-generate lien waiver on submit (non-blocking)
    // - Progress payments → Conditional Waiver (with amount, conditional on receiving payment)
    // - Final payment (≥98% complete) → Unconditional Final Waiver (waives all remaining rights)
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

          // Determine if this is a final payment: ≥98% of contract billed
          const compCheck = await pool.query(`
            SELECT SUM(sl.scheduled_value) as total_contract,
                   SUM(sl.scheduled_value * (pal.prev_pct + pal.this_pct) / 100) as total_billed
            FROM pay_app_lines pal JOIN sov_lines sl ON sl.id=pal.sov_line_id
            WHERE pal.pay_app_id=$1`, [req.params.id]);
          const totalContract = parseFloat(compCheck.rows[0]?.total_contract || 0);
          const totalBilled = parseFloat(compCheck.rows[0]?.total_billed || 0);
          const isFinalPayment = totalContract > 0 && (totalBilled / totalContract) >= 0.98;

          const doc_type = isFinalPayment ? 'unconditional_final_waiver' : 'conditional_waiver';
          const lienAmountForDoc = isFinalPayment ? 0 : lienAmount; // Unconditional final = no specific amount
          const fname = `lien_${doc_type}_${req.params.id}_${Date.now()}.pdf`;
          const fpath = path.join(__dirname, 'uploads', fname);
          const signedAt = new Date();

          await generateLienDocPDF({
            fpath, doc_type, project: proj,
            through_date, amount: lienAmountForDoc,
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
            [proj.id, parseInt(req.params.id), doc_type, fname, jurisdiction,
             through_date, lienAmountForDoc, proj.owner||null, proj.company_name||proj.contractor||null,
             signatory_name, null, signedAt, req.ip || 'auto']
          );
          await logEvent(req.user.id, 'lien_auto_generated', { pay_app_id: parseInt(req.params.id), doc_type, is_final: isFinalPayment });
        }
      }
    } catch(lienErr) { console.error('[Auto lien release]', lienErr.message); }
  }
  res.json(r.rows[0]);
});

// Unsubmit: allow owner to revert a submitted pay app back to draft
app.post('/api/payapps/:id/unsubmit', auth, async (req,res) => {
  try {
    const r = await pool.query(
      `UPDATE pay_apps SET status='draft', submitted_at=NULL
       WHERE id=$1 AND project_id IN (SELECT id FROM projects WHERE user_id=$2)
       RETURNING id, status`,
      [req.params.id, req.user.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    await logEvent(req.user.id, 'payapp_unsubmitted', { pay_app_id: parseInt(req.params.id) });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
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
  // Server-side compression for image attachments (graceful fallback)
  if (req.file.mimetype.startsWith('image/')) {
    await compressUploadedImage(path.join(__dirname, 'uploads', req.file.filename)).catch(()=>{});
  }
  const {originalname,filename,mimetype} = req.file;
  const actualSize = (() => { try { return fs.statSync(path.join(__dirname,'uploads',filename)).size; } catch(_) { return req.file.size; } })();
  const r = await pool.query(
    'INSERT INTO attachments(pay_app_id,filename,original_name,file_size,mime_type) VALUES($1,$2,$3,$4,$5) RETURNING *',
    [req.params.id,filename,originalname,actualSize,mimetype]
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
    // BUT skip rows that have numeric data in other columns — those are data/summary rows, not headers
    // (e.g. "TOTAL" row with dollar amounts is a summary, not a column header)
    if ((fAmt >= 0 || fDesc >= 0) && bestPartialRow < 0) {
      let hasNumericData = false;
      for (let ci = 0; ci < row.length; ci++) {
        if (ci === fAmt || ci === fDesc || ci === fItem) continue;
        const v = row[ci];
        if (typeof v === 'number' && v > 0) { hasNumericData = true; break; }
      }
      if (!hasNumericData) {
        bestPartialRow = ri; bestPartialAmt = fAmt; bestPartialDesc = fDesc; bestPartialItem = fItem;
      }
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
  // Amounts are ALWAYS to the RIGHT of descriptions in SOV documents.
  // Also exclude columns left of description (likely CSI codes even if not detected).
  if (iAmt < 0) {
    // Re-score amounts excluding code cols and cols left of description; rightmost highest-count col wins
    const amtScore2 = new Array(nCols).fill(0);
    const descAnchorForAmt = iDesc >= 0 ? iDesc : 0;
    for (const row of json) {
      for (let ci = 0; ci < row.length; ci++) {
        if (ci === iDesc || costCodeCols.has(ci)) continue;
        if (ci <= descAnchorForAmt) continue;  // amounts must be RIGHT of descriptions
        const cell = String(row[ci]||'').trim();
        if (!cell || cell.length < 2) continue;
        const n = parseFloat(cell.replace(/[$,\s]/g,''));
        if (!isNaN(n) && n > 50) amtScore2[ci]++;
      }
    }
    let best = 0;
    for (let ci = 0; ci < nCols; ci++) {
      if (ci === iDesc || costCodeCols.has(ci)) continue;
      if (ci <= descAnchorForAmt) continue;
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
    // Also check other columns for TOTAL/SUBTOTAL labels (e.g. col 0 may have "TOTAL"
    // while the desc column has a note like "(Excludes Permits...)")
    let rowHasSummaryLabel = false;
    for (let ci = 0; ci < row.length; ci++) {
      if (ci === iDesc || ci === iAmt) continue;
      const cell = String(row[ci]||'').trim();
      if (/^(total|subtotal|grand\s*total)$/i.test(cell)) { rowHasSummaryLabel = true; break; }
    }
    if (rowHasSummaryLabel && isSummary('total', itemId, parseFloat(rawAmt))) continue;
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

  // ── Post-process 3: Lump sum fallback ──────────────────────────────────────
  // If normal parsing found 0 line items, check for a "lump sum" proposal:
  // descriptions exist but amounts are only in a TOTAL row. Creates a single
  // line item with the total amount. Scope descriptions are collected for display
  // in the SOV review step but only the lump sum line goes to billing.
  if (allRows.length === 0) {
    // Scan ALL rows for a TOTAL row with a dollar amount
    let lumpTotal = 0;
    const descCol = iDesc >= 0 ? iDesc : (() => {
      // Find desc column by scoring
      const maxD = Math.max(...descScore);
      return maxD > 0 ? descScore.indexOf(maxD) : -1;
    })();
    for (let ri = 0; ri < json.length; ri++) {
      const row = json[ri];
      for (let ci = 0; ci < row.length; ci++) {
        const cell = String(row[ci]||'').trim();
        if (/^(total|grand\s*total)$/i.test(cell)) {
          // Found a TOTAL label — look for the biggest number in this row
          for (let ci2 = 0; ci2 < row.length; ci2++) {
            const n = parseFloat(String(row[ci2]||'').replace(/[$,\s]/g, ''));
            if (!isNaN(n) && n > lumpTotal) lumpTotal = n;
          }
        }
      }
    }
    if (lumpTotal > 0 && descCol >= 0) {
      // Build line items that mirror the original bid: each scope line at $0,
      // then a TOTAL line at the bottom with the lump sum amount.
      const lumpRows = [];
      // Find the column with CSI codes (col left of descriptions with 4-6 digit numbers)
      let codeCol = -1;
      for (let ci = 0; ci < descCol; ci++) {
        let codeCount = 0, total = 0;
        for (const row of json) { const v = String(row[ci]||'').trim(); if (!v) continue; total++; if (/^\d{4,6}$/.test(v)) codeCount++; }
        if (total > 3 && codeCount / total >= 0.4) { codeCol = ci; break; }
      }
      // Collect scope lines: rows that have a CSI code with a description (skip boilerplate)
      for (let ri = 0; ri < json.length; ri++) {
        const row = json[ri];
        const code = codeCol >= 0 ? String(row[codeCol]||'').trim() : '';
        const desc = String(row[descCol]||'').trim();
        const isCode = /^\d{4,6}$/.test(code);
        // Must have a valid CSI code — this filters out boilerplate, phone numbers, signatures
        if (!isCode) continue;
        // Skip rows where code is a summary label
        if (/^(total|subtotal|grand)/i.test(code)) continue;
        if (/^(total|subtotal|grand|note|sincerely|dear |we thank|it is an|signature)/i.test(desc)) continue;
        if (/^(Altn|option)/i.test(desc)) continue;
        lumpRows.push({ item_id: code, description: desc || '(scope item)', scheduled_value: 0, is_parent: false });
      }
      // Add the TOTAL line at the bottom with the lump sum amount
      lumpRows.push({ item_id: '', description: 'TOTAL (Lump Sum)', scheduled_value: Math.round(lumpTotal * 100) / 100, is_parent: false });
      xlsSummary['total'] = Math.round(lumpTotal * 100) / 100;
      return { headers: ['Item #','Description','Scheduled Value'], sheetName, allRows: lumpRows, parentRows: [], iItem: codeCol, iDesc: descCol, iAmt: -1, summary: xlsSummary, lump_sum: true };
    }
  }

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
function generatePayAppHTML(pa, lines, cos, totals, logoBase64, sigBase64, photoAttachments=[], docAttachments=[]) {
  const { tComp, tRet, tPrevCert, tCO, contract, earned, due } = totals;
  const fmtM = n => '$' + parseFloat(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

  // Build G703 rows and accumulate totals
  const showRet = pa.include_retainage !== false;
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
    if (sv === 0) return `<tr style="background:#f9f9f9;color:#999">
      <td style="border:1px solid #ccc;padding:3px 5px">${r.item_id||''}</td>
      <td style="border:1px solid #ccc;padding:3px 5px;font-style:italic">${r.description||''}</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:center;font-style:italic;font-size:8pt">Included</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:center">-</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:center">-</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:center">-</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:center">-</td>
      ${showRet ? '<td style="border:1px solid #ccc;padding:3px 5px;text-align:center">-</td><td style="border:1px solid #ccc;padding:3px 5px;text-align:center">-</td>' : ''}
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:center">-</td>
    </tr>`;
    return `<tr>
      <td style="border:1px solid #ccc;padding:3px 5px">${r.item_id||''}</td>
      <td style="border:1px solid #ccc;padding:3px 5px">${r.description||''}</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(sv)}</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(prev)}</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(thisPer)}</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(comp)}</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${pctComp.toFixed(0)}%</td>
      ${showRet ? `<td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${parseFloat(r.retainage_pct).toFixed(0)}%</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(ret)}</td>` : ''}
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
.aia-appnum{flex:0 0 180px;text-align:right;font-size:8.5pt;line-height:1.5}
.aia-appnum .big{font-size:11pt;font-weight:bold}
/* Payment terms */
.aia-payment-terms{font-size:8.5pt;background:#f5f9ff;border:1px solid #c8daf5;padding:4px 9px;border-radius:3px;margin-bottom:8px}
/* Summary grid */
.aia-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:10px}
.aia-cell{border:1px solid #ccc;padding:5px 8px;display:flex;justify-content:space-between;align-items:center;font-size:8.5pt}
.aia-cell-label{flex:1}
.aia-cell-val{font-weight:bold;white-space:nowrap;margin-left:8px}
.aia-cell-H{background:#fffbe6}
.aia-cell-H .aia-cell-val{font-size:13pt;color:#2563eb}
/* Distribution */
.aia-distribution{margin-bottom:10px;font-size:8.5pt}
.aia-dist-title{font-weight:bold;margin-bottom:5px}
.aia-dist-grid{display:flex;gap:18px}
.aia-dist-item{display:flex;align-items:center;gap:5px}
.aia-checkbox{width:13px;height:13px;border:1.5px solid #2563eb;border-radius:2px;flex-shrink:0}
.aia-checkbox.checked{background:#2563eb}
/* Signature boxes */
.aia-sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.aia-sig-box{border:1px solid #ccc;padding:10px;border-radius:4px;display:flex;flex-direction:column;min-height:120px}
.aia-sig-title{font-weight:bold;font-size:9pt;margin-bottom:6px;border-bottom:1px solid #eee;padding-bottom:4px}
.aia-sig-spacer{flex:1}
.aia-sig-line{border-bottom:1px solid #333;margin:4px 0 4px}
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
.brand-link{font-size:8pt;color:#2563eb;text-decoration:none}
</style></head>
<body>
<!-- G702 PAGE -->
<div class="aia-header">
  <div class="aia-logo-box">${logoHtml}</div>
  <div class="aia-title">
    <h1>Application and Certificate for Payment</h1>
    <h2>Document G702</h2>
    <p>TO OWNER: <strong>${pa.owner||'—'}</strong> &nbsp;&nbsp; PROJECT: <strong>${pa.pname||'—'}</strong></p>
    <p>FROM CONTRACTOR: <strong>${pa.contractor||'—'}</strong>${pa.include_architect !== false ? ` &nbsp;&nbsp; ARCHITECT: <strong>${pa.architect||'—'}</strong>` : ''}</p>
  </div>
  <div class="aia-appnum">
    <span class="big">#${pa.app_number}</span>
    <div>Period: ${pa.period_label||'—'}</div>
    <div>Contract date: ${contractDate}</div>
    <div>Project No: ${pa.pnum||'—'}</div>
    ${pa.po_number ? `<div style="margin-top:2px;font-size:7pt;overflow-wrap:break-word;word-break:break-word">PO #: <span style="font-weight:600">${pa.po_number}</span></div>` : ''}
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
    <div class="aia-dist-item"><div class="aia-checkbox${pa.dist_owner !== false ? ' checked' : ''}"></div><span>Owner</span></div>
    <div class="aia-dist-item"><div class="aia-checkbox${pa.dist_architect === true ? ' checked' : ''}"></div><span>Architect</span></div>
    <div class="aia-dist-item"><div class="aia-checkbox${pa.dist_contractor === true ? ' checked' : ''}"></div><span>Contractor file</span></div>
  </div>
</div>

<div class="aia-sig-grid" ${pa.include_architect === false ? 'style="grid-template-columns:1fr"' : ''}>
  <div class="aia-sig-box">
    <div class="aia-sig-title">Contractor's Signed Certification</div>
    <p class="aia-sig-note">The undersigned Contractor certifies that to the best of the Contractor's knowledge, information and belief the Work covered by this Application for Payment has been completed in accordance with the Contract Documents.</p>
    <div class="aia-sig-spacer"></div>
    ${sigHtml}
    <div class="aia-sig-line"></div>
    <div class="aia-sig-label">Authorized Signature &nbsp;&nbsp;&nbsp; Date: ${today}</div>
    ${contactName ? `<div style="font-size:8.5pt;font-weight:bold;margin-top:5px;color:#222">${contactName}</div><div style="font-size:7.5pt;color:#666">${companyDisplayName}</div>` : (companyDisplayName ? `<div style="font-size:8.5pt;font-weight:bold;margin-top:5px;color:#222">${companyDisplayName}</div>` : '')}
  </div>
  ${pa.include_architect !== false ? `<div class="aia-sig-box">
    <div class="aia-sig-title">Architect's Certificate for Payment</div>
    <p class="aia-sig-note">In accordance with the Contract Documents, the Architect certifies to the Owner that the Work has progressed to the point indicated and the quality of the Work is in accordance with the Contract Documents.</p>
    <div style="font-size:8pt;margin-bottom:4px">Amount Certified: <strong>${pa.architect_certified ? fmtM(pa.architect_certified) : 'Pending'}</strong></div>
    <div class="aia-sig-spacer"></div>
    <div class="aia-sig-line"></div>
    <div class="aia-sig-label">Architect Signature &nbsp;&nbsp;&nbsp; Date: ${pa.architect_date ? new Date(pa.architect_date).toLocaleDateString() : ''}</div>
  </div>` : ''}
</div>

${pa.special_notes ? `<div style="margin-top:8px;padding:6px 10px;background:#fafafa;border:1px solid #ddd;border-radius:4px;font-size:8pt;color:#333"><strong>Notes:</strong> ${pa.special_notes}</div>` : ''}

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
        ${showRet ? '<th style="text-align:right;width:40px">Ret.%</th><th style="text-align:right;width:70px">Retainage $</th>' : ''}
        <th style="text-align:right;width:72px">Balance to Finish</th>
      </tr>
    </thead>
    <tbody>${g703Rows}${cos.length ? `
      <tr style="background:#fffbe6;border-top:2px solid #999">
        <td colspan="${showRet ? 10 : 8}" style="border:1px solid #ccc;padding:5px;font-weight:bold;font-size:8pt;color:#444">CHANGE ORDERS</td>
      </tr>
      ${cos.map(co => {
        const coAmt = parseFloat(co.amount || 0);
        tSV += coAmt; tComp2 += coAmt; // COs add to scheduled value and are 100% complete when approved
        return `<tr style="background:#fffbe6">
          <td style="border:1px solid #ccc;padding:3px 5px;font-style:italic">CO-${co.co_number||''}</td>
          <td style="border:1px solid #ccc;padding:3px 5px">${co.description||''} ${co.status ? '('+co.status+')' : ''}</td>
          <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(coAmt)}</td>
          <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">-</td>
          <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(coAmt)}</td>
          <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(coAmt)}</td>
          <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">100%</td>
          ${showRet ? '<td style="border:1px solid #ccc;padding:3px 5px;text-align:right">-</td><td style="border:1px solid #ccc;padding:3px 5px;text-align:right">-</td>' : ''}
          <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">$0.00</td>
        </tr>`;
      }).join('')}` : ''}</tbody>
    <tfoot>
      <tr class="tfoot-row">
        <td></td>
        <td>GRAND TOTAL (incl. Change Orders)</td>
        <td style="text-align:right">${fmtM(tSV)}</td>
        <td style="text-align:right">${fmtM(tPrev2)}</td>
        <td style="text-align:right">${fmtM(tThis2)}</td>
        <td style="text-align:right">${fmtM(tComp2)}</td>
        <td style="text-align:right">${tSV>0?(tComp2/tSV*100).toFixed(0)+'%':'0%'}</td>
        ${showRet ? `<td></td><td style="text-align:right">${fmtM(tRet2)}</td>` : ''}
        <td style="text-align:right">${fmtM(tSV-tComp2)}</td>
      </tr>
    </tfoot>
  </table>
  ${pa.payment_link_token && due > 0 ? `
  <div style="text-align:center;margin:18px 0 10px;padding:14px 20px;background:#f0f4ff;border:1.5px solid #93c5fd;border-radius:8px">
    <div style="font-size:9pt;color:#555;margin-bottom:6px">Pay this invoice online — ACH or credit card</div>
    <a href="https://constructinv.varshyl.com/pay/${pa.payment_link_token}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:10pt">Pay Now — ${fmtM(due)}</a>
    <div style="font-size:7.5pt;color:#888;margin-top:6px">constructinv.varshyl.com/pay/${pa.payment_link_token}</div>
  </div>` : ''}
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
${docAttachments.length ? `
<div style="page-break-before:${photoAttachments.length?'always':'always'};padding:28px 36px">
  <div style="border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:18px">
    <span style="font-size:12pt;font-weight:bold;font-family:'Times New Roman',serif">Supporting Documents — Attachment List</span>
    <span style="font-size:9pt;color:#555;margin-left:12px">Pay App #${pa.app_number}${pa.period_label ? ' · ' + pa.period_label : ''}</span>
  </div>
  ${docAttachments.map((d,i) => `
  <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#f7f7f7;border:1px solid #ddd;border-radius:4px;margin-bottom:8px">
    <span style="font-size:13pt">📄</span>
    <div>
      <div style="font-size:10pt;font-weight:600">${d.name}</div>
      <div style="font-size:8pt;color:#777">Document ${i+1} of ${docAttachments.length}</div>
    </div>
  </div>`).join('')}
  <p style="font-size:8.5pt;color:#666;margin-top:16px;font-style:italic">These documents are attached as separate files in the email alongside this PDF.</p>
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
            p.include_architect,p.include_retainage,
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

  // ── Load PDF document attachments (listed as references, not embedded) ─────
  const docAttsRes = await pool.query(
    `SELECT filename, original_name FROM attachments WHERE pay_app_id=$1 AND mime_type='application/pdf' ORDER BY uploaded_at`,
    [req.params.id]
  );
  const docAttachments = docAttsRes.rows.map(a => ({ name: a.original_name || a.filename }));

  // ── Debug: log logo status for diagnosing missing logo reports ────────────
  if (!pa.logo_filename) {
    console.log(`[PDF] No logo_filename in company_settings for user_id=${decoded.id} (pay_app=${req.params.id})`);
  } else {
    const lp = path.join(__dirname, 'uploads', pa.logo_filename);
    if (!fs.existsSync(lp)) console.log(`[PDF] Logo file missing on disk: ${lp}`);
  }

  const totals = { tComp, tRet, tPrevCert, tCO, contract, earned, due };
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="PayApp_${pa.app_number}_${(pa.pname||'').replace(/\s+/g,'_')}.pdf"`);

  // ── Puppeteer: pixel-perfect PDF matching the on-screen preview ──────────
  if (puppeteer) {
    let browser;
    try {
      const html = generatePayAppHTML(pa, lines.rows, cos.rows, totals, logoBase64, sigBase64, photoAttachments, docAttachments);
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
  if(pa.po_number){doc.font('Helvetica').text('PO #: '+pa.po_number,L,doc.y,{width:240});}
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

  if(pa.special_notes){const plainNotes=pa.special_notes.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ');doc.moveDown(0.5);doc.font('Helvetica-Bold').fontSize(8).text('Notes:',L,doc.y,{continued:true});doc.font('Helvetica').text(' '+plainNotes,{width:500});}

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
    if(sv===0){
      // Scope-only line: just show code + description, skip dollar columns
      doc.fillColor('#888').text(r.item_id||'',cx[0],y,{width:cw[0]});
      doc.text(r.description||'',cx[1],y,{width:440});
      doc.fillColor('#000');
    } else {
      [r.item_id,r.description,fmt(sv),fmt(prev),parseFloat(r.prev_pct).toFixed(0)+'%',fmt(thisPer),fmt(comp),parseFloat(r.retainage_pct).toFixed(0)+'%',fmt(ret),fmt(bal)]
        .forEach((v,i)=>doc.text(v,cx[i],y,{width:cw[i],align:i>1?'right':'left'}));
    }
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
  const { to, cc, subject, message, attach_lien_waiver, include_payment_link } = req.body;
  const shouldAttachLien = attach_lien_waiver !== false; // default true
  const shouldIncludePayLink = include_payment_link !== false; // default true (opt-out)
  if (!to) return res.status(400).json({ error: 'Recipient email (to) is required' });

  try {
    // Load pay app data
    const paRes = await pool.query(
      `SELECT pa.*,p.name as pname,p.owner,p.contractor,p.architect,p.original_contract,
              p.number as pnum,p.payment_terms,p.contract_date,
              p.include_architect,p.include_retainage,
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
    // NOTE: skip photo attachments in email PDF to stay well under Resend's 40MB limit.
    // The full PDF (with photos) is always available via the Download button in the app.
    const html = generatePayAppHTML(pa, lines.rows, cos.rows, totals, logoBase64, sigBase64, []);
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
      } catch(puppErr) {
        console.error('[Email PDF] Puppeteer error, falling back to PDFKit:', puppErr.message);
      } finally {
        if (browser) await browser.close().catch(()=>{});
      }
    }

    // PDFKit fallback for email attachment (used if Puppeteer unavailable or errored)
    if (emailAttachments.length === 0) {
      try {
        const pdfDoc = new PDFDocument({ size: 'LETTER', margin: 45 });
        const chunks = [];
        pdfDoc.on('data', c => chunks.push(c));
        await new Promise((resolve, reject) => {
          pdfDoc.on('end', resolve);
          pdfDoc.on('error', reject);
          pdfDoc.fontSize(15).font('Helvetica-Bold').text('Document G702', { align: 'center' });
          pdfDoc.fontSize(10).font('Helvetica').text('Application and Certificate for Payment', { align: 'center' });
          pdfDoc.moveDown(0.5);
          pdfDoc.fontSize(11).font('Helvetica-Bold').text(pa.pname || 'Pay Application');
          pdfDoc.fontSize(9).font('Helvetica').text(`Application #${pa.app_number}  ·  ${pa.period_label || ''}`);
          if (pa.po_number) pdfDoc.text(`PO #: ${pa.po_number}`);
          pdfDoc.moveDown(0.4);
          pdfDoc.fontSize(9).text(`Original Contract Sum: $${Number(totals.contract || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
          pdfDoc.text(`Net Change by Change Orders: $${Number(totals.tCO || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
          pdfDoc.text(`Total Completed & Stored to Date: $${Number(totals.tComp || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
          pdfDoc.text(`Retainage: $${Number(totals.tRet || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
          pdfDoc.text(`Total Earned Less Retainage: $${Number(totals.earned || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
          pdfDoc.text(`Less Previous Certificates: $${Number(totals.tPrevCert || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
          pdfDoc.moveDown(0.3);
          pdfDoc.font('Helvetica-Bold').text(`Current Payment Due: $${Number(totals.due || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
          if (pa.special_notes) { const pn=pa.special_notes.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' '); pdfDoc.moveDown(0.5); pdfDoc.font('Helvetica-Bold').fontSize(8).text('Notes:',{continued:true}); pdfDoc.font('Helvetica').text(' '+pn); }
          pdfDoc.moveDown(1);
          pdfDoc.fontSize(8).font('Helvetica').fillColor('#888').text('Generated by ConstructInvoice AI · Full PDF available in app', { align: 'center' });
          pdfDoc.end();
        });
        const pdfBuf = Buffer.concat(chunks);
        emailAttachments.push({ filename: pdfFilename, content: pdfBuf.toString('base64') });
        console.log('[Email PDF] PDFKit fallback generated', pdfBuf.length, 'bytes');
      } catch(pdfErr) {
        console.error('[Email PDF] PDFKit fallback also failed:', pdfErr.message);
        // Email will still send, just without PDF attachment
      }
    }

    // Attach lien waiver PDF if one is linked and user opted in (default: yes)
    if (shouldAttachLien) try {
      const lienRes = await pool.query(
        `SELECT ld.*, p.name, p.owner, p.contractor, p.location, p.city, p.state, p.contact as location_contact,
                cs.logo_filename, cs.company_name
         FROM lien_documents ld
         JOIN projects p ON p.id=ld.project_id
         LEFT JOIN company_settings cs ON cs.user_id=p.user_id
         WHERE ld.pay_app_id=$1 AND p.user_id=$2
         ORDER BY ld.created_at DESC LIMIT 1`,
        [req.params.id, req.user.id]
      );
      if (lienRes.rows[0]) {
        const lien = lienRes.rows[0];
        const lienPath = path.join(__dirname, 'uploads', lien.filename);
        // Regenerate to temp file, then replace original if successful
        try {
          const tmpLien = lienPath + '.email.tmp';
          const lienProject = { name: lien.name, owner: lien.owner, contractor: lien.contractor || lien.company_name,
            company_name: lien.company_name, location: lien.location_contact, city: lien.city, state: lien.state, logo_filename: lien.logo_filename };
          const lienRef = `Pay App #${pa.app_number}${pa.period_label ? ' — ' + pa.period_label : ''}`;
          await generateLienDocPDF({ fpath: tmpLien, doc_type: lien.doc_type, project: lienProject,
            through_date: lien.through_date, amount: lien.amount, maker_of_check: lien.maker_of_check,
            check_payable_to: lien.check_payable_to, signatory_name: lien.signatory_name,
            signatory_title: lien.signatory_title, signedAt: new Date(lien.signed_at),
            ip: lien.signatory_ip || 'on file', jurisdiction: lien.jurisdiction || 'california', pay_app_ref: lienRef });
          if (fs.existsSync(tmpLien) && fs.statSync(tmpLien).size > 100) {
            fs.renameSync(tmpLien, lienPath); // Update the stored file too
          } else {
            try { fs.unlinkSync(tmpLien); } catch(_) {}
          }
        } catch(regenErr) {
          console.error('[Email] Lien regen error:', regenErr.message);
          try { const tmp = lienPath + '.email.tmp'; if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch(_) {}
        }
        // Attach the file (either freshly regenerated or original)
        if (fs.existsSync(lienPath)) {
          const lienBuf = fs.readFileSync(lienPath);
          if (lienBuf.length > 0) {
            emailAttachments.push({
              filename: `Lien_Waiver_${(lien.doc_type||'waiver').replace(/\s+/g,'_')}_PayApp${pa.app_number}.pdf`,
              content: lienBuf.toString('base64')
            });
          }
        }
      }
    } catch(lienErr) { console.error('[Email] Lien attach error:', lienErr.message); }

    // Attach any uploaded PDF documents as separate email attachments
    try {
      const pdfAttsRes = await pool.query(
        `SELECT filename, original_name FROM attachments WHERE pay_app_id=$1 AND mime_type='application/pdf' ORDER BY uploaded_at`,
        [req.params.id]
      );
      for (const att of pdfAttsRes.rows) {
        const attPath = path.join(__dirname, 'uploads', att.filename);
        if (fs.existsSync(attPath)) {
          const buf = fs.readFileSync(attPath);
          emailAttachments.push({ filename: att.original_name || att.filename, content: buf.toString('base64') });
        }
      }
    } catch(attErr) { console.error('[Email] PDF doc attach error:', attErr.message); }

    // Auto-generate payment link if GC has Stripe Connect and pay app doesn't have one yet
    // Only include if user checked "Include Payment Link" (default: true / opt-out)
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    let payNowUrl = null;
    if (shouldIncludePayLink) {
      try {
        const acctCheck = (await pool.query('SELECT stripe_account_id FROM connected_accounts WHERE user_id=$1 AND charges_enabled=TRUE', [req.user.id])).rows[0];
        if (acctCheck && due > 0) {
          let payToken = pa.payment_link_token;
          if (!payToken) {
            payToken = generatePaymentToken();
            await pool.query('UPDATE pay_apps SET payment_link_token=$1 WHERE id=$2', [payToken, req.params.id]);
          }
          payNowUrl = `${baseUrl}/pay/${payToken}`;
        }
      } catch(payLinkErr) { console.error('[Email] Payment link gen error:', payLinkErr.message); }
    }

    // Build HTML email body
    const safeMsg = (message||'').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    const payNowBtnHtml = payNowUrl ? `
        <div style="text-align:center;margin:20px 0 8px">
          <a href="${payNowUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:12pt">Pay Now — $${due.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</a>
        </div>
        <p style="font-size:9pt;color:#888;text-align:center;margin:4px 0 0">ACH bank transfer or credit card accepted. Secure payment via Stripe.</p>` : '';
    const emailHtml = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#2563eb;padding:18px 24px;color:#fff">
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
            <td style="padding:5px 8px;font-weight:bold;color:#2563eb;font-size:11pt">$${due.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>
        </table>
        ${payNowBtnHtml}
        ${emailAttachments.length > 0 ? `<p style="margin-top:16px;font-size:9pt;color:#888">Pay application PDF${emailAttachments.length>1?' and lien waiver are':' is'} attached.</p>` : ''}
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
    reminder_7before,reminder_due,reminder_7after,reminder_retention,reminder_email,reminder_phone,credit_card_enabled} = req.body;
  const r = await pool.query(
    `INSERT INTO company_settings(user_id,company_name,default_payment_terms,default_retainage,contact_name,contact_phone,contact_email,job_number_format,
       reminder_7before,reminder_due,reminder_7after,reminder_retention,reminder_email,reminder_phone,credit_card_enabled)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
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
       credit_card_enabled=COALESCE(EXCLUDED.credit_card_enabled, company_settings.credit_card_enabled, FALSE),
       updated_at=NOW()
     RETURNING *`,
    [req.user.id,company_name,default_payment_terms||'Due on receipt',default_retainage||10,
     contact_name||null,contact_phone||null,contact_email||null,job_number_format||null,
     reminder_7before??null,reminder_due??null,reminder_7after??null,reminder_retention??null,
     reminder_email||null,reminder_phone||null,credit_card_enabled??null]
  );
  res.json(r.rows[0]);
});

// Save nudge preferences (separate endpoint to avoid overwriting all settings)
app.post('/api/settings/nudges', auth, async (req, res) => {
  const { nudge_30day, nudge_60day, nudge_5payapps, nudge_dismiss_days } = req.body;
  try {
    await pool.query(
      `UPDATE company_settings SET nudge_30day=$1, nudge_60day=$2, nudge_5payapps=$3, nudge_dismiss_days=$4 WHERE user_id=$5`,
      [nudge_30day !== false, nudge_60day !== false, nudge_5payapps !== false, parseInt(nudge_dismiss_days) || 7, req.user.id]
    );
    res.json({ ok: true });
  } catch(e) { console.error('[Nudge Settings]', e.message); res.status(500).json({ error: 'Failed to save' }); }
});

app.post('/api/settings/logo', auth, upload.single('file'), async (req,res) => {
  if(!req.file) return res.status(400).json({error:'No file'});
  if (rejectFile(req, res, MIME_IMAGE, 'logo')) return;
  // Server-side compression (graceful — never blocks the save)
  await compressUploadedImage(path.join(__dirname, 'uploads', req.file.filename)).catch(()=>{});
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
  await compressUploadedImage(path.join(__dirname, 'uploads', req.file.filename)).catch(()=>{});
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
         contact_email,building_area,original_contract,contract_date,est_date,include_architect,include_retainage} = req.body;
  const inclArch = include_architect !== undefined ? include_architect : null;
  const inclRet  = include_retainage !== undefined ? include_retainage : null;
  const r = await pool.query(
    `UPDATE projects SET name=$1,number=$2,owner=$3,contractor=$4,architect=$5,
     contact=$6,contact_name=$7,contact_phone=$8,contact_email=$9,
     building_area=$10,original_contract=$11,contract_date=$12,est_date=$13,
     include_architect=COALESCE($16,include_architect),include_retainage=COALESCE($17,include_retainage)
     WHERE id=$14 AND user_id=$15 RETURNING *`,
    [name,number,owner,contractor,architect,contact,contact_name,contact_phone,
     contact_email,building_area,original_contract,contract_date,est_date,
     req.params.id,req.user.id,inclArch,inclRet]
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
    const [users, projects, payapps, events, recentErrors, slowReqs, topEvents, dailySignups, featureUsage, pipeline, totalBilled, billedByMonth, subscriptionStats] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '7 days') as last7 FROM users`),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '7 days') as last7 FROM projects`),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='submitted') as submitted, COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '7 days') as last7 FROM pay_apps`),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '24 hours') as last24h FROM analytics_events`),
      pool.query(`SELECT event, meta, created_at FROM analytics_events WHERE event='server_error' ORDER BY created_at DESC LIMIT 20`),
      pool.query(`SELECT meta->>'path' as path, AVG((meta->>'ms')::int) as avg_ms, COUNT(*) as hits FROM analytics_events WHERE event='slow_request' AND created_at > NOW()-INTERVAL '7 days' GROUP BY path ORDER BY avg_ms DESC LIMIT 10`),
      pool.query(`SELECT event, COUNT(*) as count FROM analytics_events WHERE created_at > NOW()-INTERVAL '30 days' GROUP BY event ORDER BY count DESC LIMIT 15`),
      pool.query(`SELECT DATE(created_at) as day, COUNT(*) as signups FROM analytics_events WHERE event='user_registered' AND created_at > NOW()-INTERVAL '30 days' GROUP BY day ORDER BY day`),
      pool.query(`SELECT event, COUNT(*) as count FROM analytics_events WHERE event IN ('payapp_created','payapp_submitted','pdf_downloaded','project_created','payapp_lines_saved') AND created_at > NOW()-INTERVAL '30 days' GROUP BY event ORDER BY count DESC`),
      // Total pipeline = sum of all SOV scheduled values across all projects
      pool.query(`SELECT COALESCE(SUM(scheduled_value), 0) as pipeline, COUNT(DISTINCT project_id) as project_count FROM sov_lines`),
      // Total billed = sum of amount_due on submitted pay apps (using snapshotted values)
      pool.query(`SELECT COALESCE(SUM(amount_due), 0) as total_billed, COUNT(*) as count FROM pay_apps WHERE status IN ('submitted','approved','paid') AND deleted_at IS NULL`),
      // Billed by month (last 12 months) for chart
      pool.query(`SELECT TO_CHAR(DATE_TRUNC('month', COALESCE(submitted_at, created_at)), 'Mon YYYY') as month, DATE_TRUNC('month', COALESCE(submitted_at, created_at)) as month_dt, COALESCE(SUM(amount_due), 0) as billed FROM pay_apps WHERE status IN ('submitted','approved','paid') AND deleted_at IS NULL GROUP BY month_dt, month ORDER BY month_dt DESC LIMIT 12`),
      // Subscription stats
      pool.query(`SELECT
        COUNT(*) FILTER (WHERE subscription_status='trial') as trial_users,
        COUNT(*) FILTER (WHERE subscription_status='active') as pro_users,
        COUNT(*) FILTER (WHERE subscription_status='free_override') as free_override_users,
        COUNT(*) FILTER (WHERE subscription_status='canceled') as canceled_users,
        COUNT(*) FILTER (WHERE subscription_status='trial' AND trial_end_date < NOW()) as expired_trials,
        COUNT(*) FILTER (WHERE subscription_status='trial' AND trial_end_date BETWEEN NOW() AND NOW()+INTERVAL '7 days') as expiring_this_week
      FROM users`),
    ]);
    const pipelineTotal = parseFloat(pipeline.rows[0].pipeline) || 0;
    const billedTotal   = parseFloat(totalBilled.rows[0].total_billed) || 0;
    const projectCount  = parseInt(pipeline.rows[0].project_count) || 0;
    const avgContract   = projectCount > 0 ? Math.round(pipelineTotal / projectCount) : 0;
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
      revenue: {
        pipeline:     pipelineTotal,
        total_billed: billedTotal,
        avg_contract: avgContract,
        billed_by_month: billedByMonth.rows.reverse(), // chronological order
      },
      subscriptions: subscriptionStats.rows[0] || {},
    });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// Chart: pay app creation count by month (last 12 months)
app.get('/api/admin/chart/payapp-activity', adminAuth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') as month,
             DATE_TRUNC('month', created_at) as month_dt,
             COUNT(*) as count
      FROM pay_apps
      WHERE created_at > NOW() - INTERVAL '12 months'
        AND deleted_at IS NULL
      GROUP BY month_dt, month
      ORDER BY month_dt ASC
    `);
    res.json(r.rows);
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// Chart: pipeline vs billed by user (top 10 by pipeline)
app.get('/api/admin/chart/pipeline-by-user', adminAuth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.name, u.email,
             COALESCE(SUM(sl.scheduled_value), 0) as pipeline,
             COALESCE(SUM(pa.amount_due) FILTER (WHERE pa.status IN ('submitted','approved','paid') AND pa.deleted_at IS NULL), 0) as billed
      FROM users u
      LEFT JOIN projects p ON p.user_id = u.id
      LEFT JOIN sov_lines sl ON sl.project_id = p.id
      LEFT JOIN pay_apps pa ON pa.project_id = p.id
      GROUP BY u.id, u.name, u.email
      HAVING COALESCE(SUM(sl.scheduled_value), 0) > 0
      ORDER BY pipeline DESC
      LIMIT 10
    `);
    res.json(r.rows);
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

app.delete('/api/admin/errors', adminAuth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM analytics_events WHERE event IN ('server_error','login_failed','slow_request')`);
    await logEvent(req.user.id, 'admin_errors_cleared', {});
    res.json({ ok: true });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id, u.name, u.email, u.created_at,
        u.email_verified, u.blocked, u.google_id,
        u.trial_start_date, u.trial_end_date, u.subscription_status, u.plan_type,
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

// ── Admin: resend verification email to any user ─────────────────────────────
app.post('/api/admin/users/:id/resend-verification', adminAuth, async (req, res) => {
  try {
    const user = (await pool.query('SELECT id, email, name, email_verified FROM users WHERE id=$1', [req.params.id])).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.email_verified) return res.json({ ok: true, message: 'Already verified' });
    const token = generateToken();
    await pool.query('UPDATE users SET verification_token=$1, verification_sent_at=NOW() WHERE id=$2', [token, user.id]);
    await sendVerificationEmail(user.email, user.name, token);
    await logEvent(req.user.id, 'admin_resend_verification', { target_user_id: user.id, target_email: user.email });
    res.json({ ok: true });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
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

// ── SUBSCRIPTION & TRIAL STATUS ──────────────────────────────────────────────
app.get('/api/subscription', auth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT trial_start_date, trial_end_date, subscription_status, plan_type, stripe_customer_id FROM users WHERE id=$1',
      [req.user.id]
    );
    const user = r.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    const now = new Date();
    const trialEnd = user.trial_end_date ? new Date(user.trial_end_date) : null;
    const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd - now) / (1000*60*60*24))) : 0;
    const trialExpired = trialEnd ? now > trialEnd : false;
    // Admin users are always 'active' — never blocked
    const isAdmin = isAdminEmail(req.user.email);
    res.json({
      trial_start_date: user.trial_start_date,
      trial_end_date: user.trial_end_date,
      subscription_status: isAdmin ? 'active' : user.subscription_status,
      plan_type: isAdmin ? 'pro' : user.plan_type,
      days_left: daysLeft,
      trial_expired: isAdmin ? false : trialExpired,
      is_admin: isAdmin,
      has_stripe: !!user.stripe_customer_id
    });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Stripe Subscription Billing ($40/month Pro plan) ────────────────────────

// One-time setup: create the Stripe Product + Price (admin only, idempotent)
app.post('/api/admin/setup-subscription-product', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    // Check if we already have a price stored
    const existing = (await pool.query("SELECT value FROM app_settings WHERE key='subscription_price_id'")).rows[0];
    if (existing?.value) {
      // Verify it still exists in Stripe
      try {
        const price = await stripe.prices.retrieve(existing.value);
        return res.json({ message: 'Subscription product already exists', price_id: existing.value, product_id: price.product, amount: price.unit_amount, interval: price.recurring?.interval });
      } catch(e) { /* price was deleted, recreate below */ }
    }
    // Create product
    const product = await stripe.products.create({
      name: 'ConstructInvoice AI Pro',
      description: 'Full access to ConstructInvoice AI — G702/G703 pay apps, lien waivers, payment collection, AI assistant, and more.',
      metadata: { app: 'constructinvoice', tier: 'pro' }
    });
    // Create price ($40/month)
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: 4000, // $40.00 in cents
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { app: 'constructinvoice', tier: 'pro' }
    });
    // Store in app_settings table for future reference
    await pool.query(
      "INSERT INTO app_settings(key,value) VALUES('subscription_price_id',$1) ON CONFLICT(key) DO UPDATE SET value=$1",
      [price.id]
    );
    await pool.query(
      "INSERT INTO app_settings(key,value) VALUES('subscription_product_id',$1) ON CONFLICT(key) DO UPDATE SET value=$1",
      [product.id]
    );
    console.log(`[Stripe] Created subscription product ${product.id} with price ${price.id} ($40/month)`);
    res.json({ message: 'Subscription product created', product_id: product.id, price_id: price.id, amount: 4000, interval: 'month' });
  } catch(e) { console.error('[Stripe Setup Error]', e.message); res.status(500).json({ error: e.message }); }
});

// Get subscription price ID (used by frontend to create checkout)
app.get('/api/subscription/price', auth, async (req, res) => {
  try {
    const r = (await pool.query("SELECT value FROM app_settings WHERE key='subscription_price_id'")).rows[0];
    if (!r?.value) return res.status(404).json({ error: 'Subscription not configured. Admin must run setup first.' });
    res.json({ price_id: r.value, amount: 4000, currency: 'usd', interval: 'month' });
  } catch(e) { res.status(500).json({ error: 'Internal error' }); }
});

// Create a Stripe Checkout Session for subscription
app.post('/api/subscription/checkout', auth, requireStripe, async (req, res) => {
  try {
    const priceRow = (await pool.query("SELECT value FROM app_settings WHERE key='subscription_price_id'")).rows[0];
    if (!priceRow?.value) return res.status(400).json({ error: 'Subscription price not configured. Admin must run setup first.' });
    const user = (await pool.query('SELECT id, email, name, stripe_customer_id FROM users WHERE id=$1', [req.user.id])).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Create or reuse Stripe Customer
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { user_id: String(user.id), app: 'constructinvoice' }
      });
      customerId = customer.id;
      await pool.query('UPDATE users SET stripe_customer_id=$1 WHERE id=$2', [customerId, user.id]);
    }
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceRow.value, quantity: 1 }],
      success_url: `${baseUrl}/app.html?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/app.html?subscription=cancelled`,
      metadata: { user_id: String(user.id), app: 'constructinvoice' },
      subscription_data: {
        metadata: { user_id: String(user.id), app: 'constructinvoice' }
      }
    });
    console.log(`[Subscription] Checkout session created for user ${user.id} (${user.email})`);
    res.json({ checkout_url: session.url, session_id: session.id });
  } catch(e) { console.error('[Subscription Checkout Error]', e.message); res.status(500).json({ error: e.message }); }
});

// Create Stripe Customer Portal session (manage subscription, cancel, update payment)
app.post('/api/subscription/portal', auth, requireStripe, async (req, res) => {
  try {
    const user = (await pool.query('SELECT stripe_customer_id FROM users WHERE id=$1', [req.user.id])).rows[0];
    if (!user?.stripe_customer_id) return res.status(400).json({ error: 'No active subscription found' });
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${baseUrl}/app.html#settings`,
    });
    res.json({ portal_url: session.url });
  } catch(e) { console.error('[Portal Error]', e.message); res.status(500).json({ error: e.message }); }
});

// Admin: update subscription price (change amount)
app.post('/api/admin/update-subscription-price', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const { amount } = req.body; // amount in dollars
    if (!amount || amount < 1) return res.status(400).json({ error: 'Amount must be at least $1' });
    const productRow = (await pool.query("SELECT value FROM app_settings WHERE key='subscription_product_id'")).rows[0];
    if (!productRow?.value) return res.status(400).json({ error: 'No subscription product exists. Run setup first.' });
    // Create new price (Stripe prices are immutable — you archive old, create new)
    const price = await stripe.prices.create({
      product: productRow.value,
      unit_amount: Math.round(amount * 100),
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { app: 'constructinvoice', tier: 'pro' }
    });
    // Archive old price
    const oldPriceRow = (await pool.query("SELECT value FROM app_settings WHERE key='subscription_price_id'")).rows[0];
    if (oldPriceRow?.value) {
      try { await stripe.prices.update(oldPriceRow.value, { active: false }); } catch(e) {}
    }
    await pool.query("UPDATE app_settings SET value=$1 WHERE key='subscription_price_id'", [price.id]);
    console.log(`[Stripe] Updated subscription price to $${amount}/month (${price.id})`);
    res.json({ message: `Price updated to $${amount}/month`, price_id: price.id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: Stripe webhook management (SDK-only, no dashboard needed) ─────────
const REQUIRED_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.deleted',
  'customer.subscription.updated',
  'payment_intent.payment_failed'
];

app.get('/api/admin/stripe/list-webhooks', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 20 });
    res.json(endpoints.data.map(ep => ({
      id: ep.id,
      url: ep.url,
      status: ep.status,
      enabled_events: ep.enabled_events,
      api_version: ep.api_version,
      created: new Date(ep.created * 1000).toISOString()
    })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/stripe/create-webhook', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const { url } = req.body;
    const targetUrl = url || `${process.env.BASE_URL || `${req.protocol}://${req.get('host')}`}/api/stripe/webhook`;
    // Check if webhook already exists for this URL
    const existing = await stripe.webhookEndpoints.list({ limit: 20 });
    const found = existing.data.find(ep => ep.url === targetUrl && ep.status === 'enabled');
    if (found) {
      return res.json({ message: 'Webhook already exists', id: found.id, url: found.url, secret: '(already created — check Railway env)', events: found.enabled_events });
    }
    const endpoint = await stripe.webhookEndpoints.create({
      url: targetUrl,
      enabled_events: REQUIRED_WEBHOOK_EVENTS,
      description: 'ConstructInvoice AI — payments + subscriptions',
      metadata: { app: 'constructinvoice', created_by: 'admin_sdk' }
    });
    console.log(`[Stripe] Webhook endpoint created: ${endpoint.id} → ${targetUrl}`);
    res.json({ message: 'Webhook created', id: endpoint.id, url: endpoint.url, secret: endpoint.secret, events: endpoint.enabled_events });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/stripe/delete-webhook', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const { webhook_id } = req.body;
    if (!webhook_id) return res.status(400).json({ error: 'webhook_id required' });
    await stripe.webhookEndpoints.del(webhook_id);
    console.log(`[Stripe] Webhook endpoint deleted: ${webhook_id}`);
    res.json({ message: 'Webhook deleted', id: webhook_id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Comprehensive Stripe setup verification
app.get('/api/admin/stripe/verify-setup', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const checks = {};
    // 1. Account info
    const account = await stripe.accounts.retrieve();
    checks.account = { id: account.id, name: account.settings?.dashboard?.display_name, country: account.country, charges: account.charges_enabled, payouts: account.payouts_enabled };
    // 2. Mode detection
    checks.mode = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test') ? 'TEST' : 'LIVE';
    // 3. Subscription product
    const prodRow = (await pool.query("SELECT value FROM app_settings WHERE key='subscription_product_id'")).rows[0];
    const priceRow = (await pool.query("SELECT value FROM app_settings WHERE key='subscription_price_id'")).rows[0];
    checks.subscription = { product_id: prodRow?.value || 'NOT SET', price_id: priceRow?.value || 'NOT SET' };
    if (priceRow?.value) {
      try {
        const price = await stripe.prices.retrieve(priceRow.value);
        checks.subscription.amount = price.unit_amount / 100;
        checks.subscription.currency = price.currency;
        checks.subscription.interval = price.recurring?.interval;
        checks.subscription.active = price.active;
      } catch(e) { checks.subscription.error = 'Price not found in Stripe: ' + e.message; }
    }
    // 4. Webhooks
    const endpoints = await stripe.webhookEndpoints.list({ limit: 20 });
    checks.webhooks = endpoints.data.map(ep => ({ id: ep.id, url: ep.url, status: ep.status, events: ep.enabled_events.length }));
    checks.webhook_secret_configured = !!process.env.STRIPE_WEBHOOK_SECRET;
    // 5. Connected accounts count
    const connectedAccounts = (await pool.query('SELECT COUNT(*) FROM connected_accounts WHERE account_status=$1', ['active'])).rows[0].count;
    checks.connected_accounts = parseInt(connectedAccounts);
    // 6. Overall readiness
    const issues = [];
    if (!prodRow?.value) issues.push('No subscription product — run setup-subscription-product');
    if (!priceRow?.value) issues.push('No subscription price — run setup-subscription-product');
    if (checks.webhooks.length === 0) issues.push('No webhook endpoints configured');
    if (!process.env.STRIPE_WEBHOOK_SECRET) issues.push('STRIPE_WEBHOOK_SECRET env var not set');
    if (!process.env.BASE_URL) issues.push('BASE_URL env var not set (needed for payment links)');
    checks.ready = issues.length === 0;
    checks.issues = issues;
    res.json(checks);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── Admin: End-to-End Stripe Test Harness ────────────────────────────────────
// Creates test GC accounts, projects, pay apps, and verifies money flow.
// ALL endpoints are admin-only. Used in TEST mode only.
// ══════════════════════════════════════════════════════════════════════════════

// Create a test GC user + Stripe Express connected account + onboarding link
app.post('/api/admin/test/create-test-gc', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  const isTest = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test');
  if (!isTest) return res.status(403).json({ error: 'Test endpoints only work in Stripe TEST mode' });
  try {
    const { name, email, company_name } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'name and email required' });
    // 1. Create user in our DB (or find existing)
    let userId;
    const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (existing.rows[0]) {
      userId = existing.rows[0].id;
    } else {
      const hash = await bcrypt.hash('TestPass123!', 10);
      const r = await pool.query(
        `INSERT INTO users(name,email,password_hash,email_verified,trial_start_date,trial_end_date,subscription_status,plan_type)
         VALUES($1,$2,$3,TRUE,NOW(),NOW()+INTERVAL '90 days','trial','free_trial') RETURNING id`,
        [name, email, hash]
      );
      userId = r.rows[0].id;
    }
    // 2. Save company settings
    if (company_name) {
      await pool.query(
        `INSERT INTO company_settings(user_id, company_name) VALUES($1,$2)
         ON CONFLICT(user_id) DO UPDATE SET company_name=$2`,
        [userId, company_name]
      );
    }
    // 3. Create Stripe Express connected account
    const existingAcct = await pool.query('SELECT * FROM connected_accounts WHERE user_id=$1', [userId]);
    let accountId;
    if (existingAcct.rows[0]) {
      accountId = existingAcct.rows[0].stripe_account_id;
    } else {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: email,
        business_type: 'company',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
          us_bank_account_ach_payments: { requested: true },
        },
        metadata: { user_id: String(userId), platform: 'constructinvoice', test: 'true' },
      });
      accountId = account.id;
      await pool.query(
        'INSERT INTO connected_accounts(user_id, stripe_account_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET stripe_account_id=$2',
        [userId, accountId]
      );
      await pool.query('UPDATE users SET stripe_connect_id=$1 WHERE id=$2', [accountId, userId]);
    }
    // 4. Generate onboarding link
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/app.html#payments_setup=refresh`,
      return_url: `${baseUrl}/app.html#payments_setup=complete`,
      type: 'account_onboarding',
    });
    // 5. Check current account status
    const acct = await stripe.accounts.retrieve(accountId);
    res.json({
      message: 'Test GC created',
      user_id: userId,
      email: email,
      password: 'TestPass123!',
      stripe_account_id: accountId,
      charges_enabled: acct.charges_enabled,
      payouts_enabled: acct.payouts_enabled,
      onboarding_url: link.url,
      note: 'Open onboarding_url in browser. In test mode, click "Use test data" to auto-fill all fields.'
    });
  } catch(e) {
    console.error('[Test Create GC]', e.message);
    if (e.code === '23505') return res.status(400).json({ error: 'Email already exists — use a different email or the existing user' });
    res.status(500).json({ error: e.message });
  }
});

// Create a test project + SOV + pay app for a test GC user, and generate payment link
app.post('/api/admin/test/create-test-payapp', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const { user_id, project_name, contract_amount, owner_name, owner_email } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    const pName = project_name || 'Test Renovation Project';
    const amount = contract_amount || 85000;
    const oName = owner_name || 'John Smith (Test Owner)';
    const oEmail = owner_email || 'testowner@example.com';
    // 1. Create project
    const proj = await pool.query(
      `INSERT INTO projects(user_id,name,number,owner,owner_email,contractor,original_contract,default_retainage,payment_terms)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [user_id, pName, 'TEST-' + Date.now().toString(36).toUpperCase(), oName, oEmail, 'Test GC Company', amount, 10, 'Net 30']
    );
    const projectId = proj.rows[0].id;
    // 2. Create SOV lines (realistic construction items)
    const sovItems = [
      { item_id: '1', description: 'General Conditions', scheduled_value: Math.round(amount * 0.08) },
      { item_id: '2', description: 'Site Preparation', scheduled_value: Math.round(amount * 0.05) },
      { item_id: '3', description: 'Concrete & Foundation', scheduled_value: Math.round(amount * 0.15) },
      { item_id: '4', description: 'Framing & Structural', scheduled_value: Math.round(amount * 0.20) },
      { item_id: '5', description: 'Electrical', scheduled_value: Math.round(amount * 0.12) },
      { item_id: '6', description: 'Plumbing', scheduled_value: Math.round(amount * 0.10) },
      { item_id: '7', description: 'HVAC', scheduled_value: Math.round(amount * 0.10) },
      { item_id: '8', description: 'Finishes & Paint', scheduled_value: Math.round(amount * 0.08) },
      { item_id: '9', description: 'Landscaping', scheduled_value: Math.round(amount * 0.05) },
      { item_id: '10', description: 'Project Management Fee', scheduled_value: amount - Math.round(amount * 0.93) },
    ];
    const sovTotal = sovItems.reduce((s, l) => s + l.scheduled_value, 0);
    for (const [i, line] of sovItems.entries()) {
      await pool.query(
        'INSERT INTO sov_lines(project_id,item_id,description,scheduled_value,sort_order) VALUES($1,$2,$3,$4,$5)',
        [projectId, line.item_id, line.description, line.scheduled_value, i]
      );
    }
    await pool.query('UPDATE projects SET original_contract=$1 WHERE id=$2', [sovTotal, projectId]);
    // 3. Create Pay App #1 with 30% progress
    const invoiceToken = require('crypto').randomBytes(24).toString('hex');
    const pa = await pool.query(
      `INSERT INTO pay_apps(project_id,app_number,period_label,period_start,period_end,invoice_token)
       VALUES($1,1,'March 2026','2026-03-01','2026-03-31',$2) RETURNING *`,
      [projectId, invoiceToken]
    );
    const paId = pa.rows[0].id;
    // 4. Create pay app lines with 30% this period
    const sovLines = await pool.query('SELECT * FROM sov_lines WHERE project_id=$1 ORDER BY sort_order', [projectId]);
    let totalThisPeriod = 0;
    for (const line of sovLines.rows) {
      const thisPct = 30; // 30% progress this period
      const sv = parseFloat(line.scheduled_value);
      totalThisPeriod += sv * thisPct / 100;
      await pool.query(
        'INSERT INTO pay_app_lines(pay_app_id,sov_line_id,prev_pct,this_pct,retainage_pct,stored_materials) VALUES($1,$2,$3,$4,$5,$6)',
        [paId, line.id, 0, thisPct, 10, 0]
      );
    }
    // 5. Generate payment link token
    const payToken = require('crypto').randomBytes(24).toString('hex');
    await pool.query('UPDATE pay_apps SET payment_link_token=$1, status=$2 WHERE id=$3', [payToken, 'submitted', paId]);
    // 6. Calculate expected payment amounts
    const grossThisPeriod = totalThisPeriod;
    const retainage = grossThisPeriod * 0.10;
    const netAfterRetainage = grossThisPeriod - retainage;
    const paymentDue = netAfterRetainage; // First pay app, no previous certs
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    res.json({
      message: 'Test project + pay app created',
      project_id: projectId,
      project_name: pName,
      pay_app_id: paId,
      sov_total: sovTotal,
      sov_lines: sovItems.length,
      progress_pct: 30,
      gross_this_period: grossThisPeriod,
      retainage_10pct: retainage,
      net_after_retainage: netAfterRetainage,
      payment_due: paymentDue,
      payment_link: `${baseUrl}/pay/${payToken}`,
      payment_token: payToken,
      owner: oName,
      owner_email: oEmail,
      expected_fees: {
        ach: { platform_fee: 25.00, gc_receives: paymentDue - 25.00, owner_pays: paymentDue },
        card: {
          processing_fee: Math.round((paymentDue * 0.033 + 0.40) * 100) / 100,
          owner_pays: Math.round((paymentDue + paymentDue * 0.033 + 0.40) * 100) / 100,
          gc_receives: paymentDue,
          platform_keeps_margin: Math.round(((paymentDue * 0.033 + 0.40) - (paymentDue * 0.029 + 0.30)) * 100) / 100
        }
      }
    });
  } catch(e) {
    console.error('[Test Create PayApp]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Complete reconciliation report — shows ALL money flow with math verification
app.get('/api/admin/test/reconciliation', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    // 1. All payments in our DB
    const payments = await pool.query(`
      SELECT p.*, pa.app_number, pa.project_id, pa.payment_link_token,
             pr.name as project_name, pr.owner, u.name as gc_name, u.email as gc_email,
             ca.stripe_account_id
      FROM payments p
      JOIN pay_apps pa ON pa.id = p.pay_app_id
      JOIN projects pr ON pr.id = pa.project_id
      JOIN users u ON u.id = p.user_id
      LEFT JOIN connected_accounts ca ON ca.user_id = p.user_id
      ORDER BY p.created_at DESC
    `);
    // 2. All connected accounts with balances
    const connectedAccts = await pool.query(`
      SELECT ca.*, u.name as gc_name, u.email as gc_email
      FROM connected_accounts ca
      JOIN users u ON u.id = ca.user_id
    `);
    const accountDetails = [];
    for (const acct of connectedAccts.rows) {
      try {
        const stripeAcct = await stripe.accounts.retrieve(acct.stripe_account_id);
        let balance = null;
        try { balance = await stripe.balance.retrieve({ stripeAccount: acct.stripe_account_id }); } catch(e) {}
        accountDetails.push({
          gc_name: acct.gc_name,
          gc_email: acct.gc_email,
          stripe_id: acct.stripe_account_id,
          charges_enabled: stripeAcct.charges_enabled,
          payouts_enabled: stripeAcct.payouts_enabled,
          business_name: stripeAcct.business_profile?.name || stripeAcct.settings?.dashboard?.display_name,
          balance: balance ? {
            available: balance.available.map(b => ({ amount: b.amount / 100, currency: b.currency })),
            pending: balance.pending.map(b => ({ amount: b.amount / 100, currency: b.currency }))
          } : 'Unable to retrieve'
        });
      } catch(e) {
        accountDetails.push({ gc_name: acct.gc_name, stripe_id: acct.stripe_account_id, error: e.message });
      }
    }
    // 3. Platform balance
    let platformBalance;
    try {
      const bal = await stripe.balance.retrieve();
      platformBalance = {
        available: bal.available.map(b => ({ amount: b.amount / 100, currency: b.currency })),
        pending: bal.pending.map(b => ({ amount: b.amount / 100, currency: b.currency }))
      };
    } catch(e) { platformBalance = { error: e.message }; }
    // 4. Recent Stripe charges (last 20)
    let recentCharges = [];
    try {
      const charges = await stripe.charges.list({ limit: 20 });
      recentCharges = charges.data.map(c => ({
        id: c.id,
        amount: c.amount / 100,
        fee: c.application_fee_amount ? c.application_fee_amount / 100 : 0,
        net: (c.amount - (c.application_fee_amount || 0)) / 100,
        status: c.status,
        method: c.payment_method_details?.type || 'unknown',
        destination: c.transfer_data?.destination || 'platform',
        created: new Date(c.created * 1000).toISOString(),
        description: c.description
      }));
    } catch(e) { recentCharges = [{ error: e.message }]; }
    // 5. Subscription revenue
    let subscriptions = [];
    try {
      const subs = await stripe.subscriptions.list({ limit: 50, status: 'all' });
      subscriptions = subs.data.map(s => ({
        id: s.id,
        customer: s.customer,
        status: s.status,
        amount: s.items.data[0]?.price?.unit_amount / 100,
        interval: s.items.data[0]?.price?.recurring?.interval,
        created: new Date(s.created * 1000).toISOString(),
        current_period_end: new Date(s.current_period_end * 1000).toISOString()
      }));
    } catch(e) {}
    // 6. Math verification
    const dbPayments = payments.rows.map(p => ({
      id: p.id,
      pay_app: `#${p.app_number}`,
      project: p.project_name,
      gc: p.gc_name,
      amount: parseFloat(p.amount),
      processing_fee: parseFloat(p.processing_fee || 0),
      platform_fee: parseFloat(p.platform_fee || 0),
      method: p.payment_method,
      payment_status: p.payment_status,
      stripe_session: p.stripe_checkout_session_id,
      connected_account: p.stripe_account_id,
      created: p.created_at
    }));
    const totals = {
      total_payments: dbPayments.length,
      total_amount: dbPayments.reduce((s, p) => s + p.amount, 0),
      total_platform_fees: dbPayments.reduce((s, p) => s + p.platform_fee, 0),
      total_processing_fees: dbPayments.reduce((s, p) => s + p.processing_fee, 0),
      total_subscriptions: subscriptions.length,
      active_subscriptions: subscriptions.filter(s => s.status === 'active').length,
      monthly_subscription_revenue: subscriptions.filter(s => s.status === 'active').reduce((s, sub) => s + (sub.amount || 0), 0)
    };
    res.json({
      summary: totals,
      platform_balance: platformBalance,
      connected_accounts: accountDetails,
      payments: dbPayments,
      stripe_charges: recentCharges,
      subscriptions: subscriptions,
      generated_at: new Date().toISOString()
    });
  } catch(e) {
    console.error('[Reconciliation]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Complete onboarding programmatically in TEST MODE
// Deletes existing Express account (can't set company/TOS via API) and recreates as Custom
// Custom accounts give the platform full API control — identical payment routing
app.post('/api/admin/test/complete-onboarding', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  const isTest = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test');
  if (!isTest) return res.status(403).json({ error: 'Only works in Stripe TEST mode' });
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    const user = await pool.query('SELECT name, email FROM users WHERE id=$1', [user_id]);
    if (!user.rows[0]) return res.status(404).json({ error: 'User not found' });
    const company = await pool.query('SELECT company_name FROM company_settings WHERE user_id=$1', [user_id]);
    const userName = user.rows[0]?.name || 'Test User';
    const userEmail = user.rows[0]?.email;
    const companyName = company.rows[0]?.company_name || 'Test Construction Co';
    const nameParts = userName.split(' ');
    const firstName = nameParts[0] || 'Test';
    const lastName = nameParts.slice(1).join(' ') || 'User';
    // Step 0: Delete existing Express account if present (can't API-onboard Express)
    const existing = await pool.query('SELECT stripe_account_id FROM connected_accounts WHERE user_id=$1', [user_id]);
    if (existing.rows[0]) {
      try { await stripe.accounts.del(existing.rows[0].stripe_account_id); } catch(e) {
        console.log(`[Test] Could not delete old account: ${e.message}`);
      }
      await pool.query('DELETE FROM connected_accounts WHERE user_id=$1', [user_id]);
    }
    // Step 1: Create Custom connected account as INDIVIDUAL (simpler requirements than company)
    // Individual accounts don't need company.phone, and work identically for payment routing
    const account = await stripe.accounts.create({
      type: 'custom',
      country: 'US',
      email: userEmail,
      business_type: 'individual',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
        us_bank_account_ach_payments: { requested: true },
      },
      business_profile: {
        mcc: '1520',
        name: companyName,
        product_description: 'General contracting and construction services',
        url: 'https://www.example-construction.com',
      },
      individual: {
        first_name: firstName,
        last_name: lastName,
        email: userEmail,
        phone: '+14155552671',
        dob: { day: 1, month: 1, year: 1990 },
        address: { line1: '123 Test Street', city: 'San Francisco', state: 'CA', postal_code: '94105', country: 'US' },
        ssn_last_4: '0000',
        id_number: '000000000', // Test SSN
      },
      tos_acceptance: {
        date: Math.floor(Date.now() / 1000),
        ip: '127.0.0.1',
        service_agreement: 'full',
      },
      metadata: { user_id: String(user_id), platform: 'constructinvoice', test: 'true' },
    });
    const accountId = account.id;
    // Step 2: No separate person needed — individual account uses the `individual` block
    const person = { id: 'individual_account' };
    // Step 3: Add test bank account for payouts
    await stripe.accounts.createExternalAccount(accountId, {
      external_account: {
        object: 'bank_account',
        country: 'US',
        currency: 'usd',
        routing_number: '110000000',
        account_number: '000123456789',
      },
    });
    // Step 4: Save to our DB
    await pool.query(
      'INSERT INTO connected_accounts(user_id, stripe_account_id, account_status, charges_enabled, payouts_enabled, business_name, onboarded_at) VALUES($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT(user_id) DO UPDATE SET stripe_account_id=$2, account_status=$3, charges_enabled=$4, payouts_enabled=$5, business_name=$6, onboarded_at=NOW()',
      [user_id, accountId, 'active', true, true, companyName]
    );
    await pool.query('UPDATE users SET stripe_connect_id=$1, payments_enabled=TRUE WHERE id=$2', [accountId, user_id]);
    // Step 5: Verify
    const acct = await stripe.accounts.retrieve(accountId);
    res.json({
      message: 'Custom account created & fully onboarded',
      stripe_account_id: accountId,
      account_type: 'custom',
      charges_enabled: acct.charges_enabled,
      payouts_enabled: acct.payouts_enabled,
      details_submitted: acct.details_submitted,
      requirements: {
        currently_due: acct.requirements?.currently_due || [],
        past_due: acct.requirements?.past_due || [],
        disabled_reason: acct.requirements?.disabled_reason || null,
      },
      business_name: acct.business_profile?.name,
      person_id: person.id,
      bank_account: 'Test bank ****6789 (routing 110000000)',
      note: 'Custom accounts work identically to Express for payments — same transfer_data, same application_fee routing.'
    });
  } catch(e) {
    console.error('[Test Onboarding]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// List all test GC accounts with their Stripe status
app.get('/api/admin/test/list-test-gcs', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const gcs = await pool.query(`
      SELECT u.id, u.name, u.email, u.subscription_status, u.plan_type,
             ca.stripe_account_id, ca.charges_enabled, ca.payouts_enabled, ca.account_status, ca.business_name,
             COUNT(DISTINCT pr.id) as project_count,
             COUNT(DISTINCT pa.id) as payapp_count
      FROM users u
      LEFT JOIN connected_accounts ca ON ca.user_id = u.id
      LEFT JOIN projects pr ON pr.user_id = u.id
      LEFT JOIN pay_apps pa ON pa.project_id = pr.id AND pa.deleted_at IS NULL
      GROUP BY u.id, u.name, u.email, u.subscription_status, u.plan_type,
               ca.stripe_account_id, ca.charges_enabled, ca.payouts_enabled, ca.account_status, ca.business_name
      ORDER BY u.created_at DESC
    `);
    // Enrich with live Stripe data
    const results = [];
    for (const gc of gcs.rows) {
      const entry = { ...gc, project_count: parseInt(gc.project_count), payapp_count: parseInt(gc.payapp_count) };
      if (gc.stripe_account_id) {
        try {
          const acct = await stripe.accounts.retrieve(gc.stripe_account_id);
          entry.stripe_live = {
            charges_enabled: acct.charges_enabled,
            payouts_enabled: acct.payouts_enabled,
            details_submitted: acct.details_submitted,
            business_name: acct.business_profile?.name || acct.settings?.dashboard?.display_name
          };
        } catch(e) { entry.stripe_live = { error: e.message }; }
      }
      results.push(entry);
    }
    res.json(results);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Cleanup: remove test data (test users, projects, pay apps)
app.post('/api/admin/test/cleanup', adminAuth, async (req, res) => {
  try {
    const { user_ids } = req.body;
    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: 'user_ids array required' });
    }
    // Delete connected accounts from Stripe
    for (const uid of user_ids) {
      const ca = await pool.query('SELECT stripe_account_id FROM connected_accounts WHERE user_id=$1', [uid]);
      if (ca.rows[0]?.stripe_account_id) {
        try { await stripe.accounts.del(ca.rows[0].stripe_account_id); } catch(e) {
          console.log(`[Test Cleanup] Could not delete Stripe account ${ca.rows[0].stripe_account_id}: ${e.message}`);
        }
      }
    }
    // Delete users (CASCADE takes care of projects, pay_apps, sov_lines, etc.)
    const placeholders = user_ids.map((_, i) => `$${i + 1}`).join(',');
    const deleted = await pool.query(`DELETE FROM users WHERE id IN (${placeholders}) RETURNING id, email`, user_ids);
    res.json({ message: `Cleaned up ${deleted.rows.length} test users`, deleted: deleted.rows });
  } catch(e) {
    console.error('[Test Cleanup]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── User-facing AI Assistant (product help) ──────────────────────────────────
const PRODUCT_KNOWLEDGE = `
You are Aria, the friendly AI assistant built into ConstructInvoice AI — a construction billing platform for General Contractors.
Your job is to help users understand and use the product. Be warm, concise, and practical. Use short paragraphs.

PRODUCT OVERVIEW:
ConstructInvoice AI generates AIA G702/G703 pay applications for construction projects. Users create projects, upload a Schedule of Values (SOV), then generate pay apps as PDFs.

PRICING:
- 90-day FREE trial with full features, no credit card required
- After trial: $40/month Pro plan
- If a contractor cannot afford it, they can email vaakapila@gmail.com and the team will waive the fee

KEY FEATURES & HOW-TO:

1. CREATE A PROJECT:
   - Click "+ New project" in the sidebar
   - Step 1: Enter project name, owner, contractor, architect, contract amount
   - Step 2: Upload your Schedule of Values (SOV) file
   - Step 3: Review parsed SOV line items
   - Accepted SOV formats: Excel (.xlsx, .xls), CSV, PDF (.pdf), Word (.docx, .doc)

2. CREATE A PAY APP:
   - Open a project from the Dashboard
   - Go to the Pay Apps tab, click "+ New Pay App"
   - Set the application period (from/to dates)
   - Enter % complete for each SOV line item this period
   - The G702/G703 math is calculated automatically
   - Click Save, then download the PDF

3. G702/G703 MATH:
   - Col A: Scheduled value (from SOV)
   - Col B: Work completed from previous periods
   - Col C: Work completed this period (what you enter)
   - Col D: Total completed (B + C)
   - Col E: Retainage (% of D)
   - Col F: Total earned less retainage (D - E)
   - Col G: Previous certificates for payment
   - Col H: Current payment due (F - G)
   - Col I: Balance to finish (A - F)

4. CHANGE ORDERS:
   - In the Pay App editor, find the "+ Change Order" section
   - Each change order gets its own line with description and amount
   - Change orders roll into the G702 totals automatically
   - Save with the checkmark button or press Enter

5. LIEN WAIVERS:
   - Conditional waivers are auto-created when a pay app has an amount and signatory info in Settings. You can also manually create waivers from the Preview tab.
   - Supported types: Preliminary Notice, Conditional Progress, Unconditional Progress, Conditional Final, Unconditional Final
   - Currently supports California, Virginia, and Washington D.C.
   - Sign electronically by typing your name — PDF includes timestamp and IP

6. PDF DOWNLOAD:
   - Click "Download PDF" on the pay app Preview tab
   - PDF includes G702 cover sheet + G703 continuation sheet
   - Your company logo and signature are included automatically if set in Settings

7. EMAIL / SEND:
   - Click "Send & Mark Submitted" to email the pay app PDF to the project owner
   - Lien waiver PDF is automatically attached if one was generated
   - After first send, button changes to "Resend"

8. SETTINGS:
   - Company name, contact info (auto-fills new project forms)
   - Upload company logo (appears on all PDFs)
   - Upload signature (auto-fills on pay apps)
   - Default payment terms and retainage %
   - Set up automated email reminders (7 days before, day-of, 7 days overdue)

9. REVENUE:
   - Click "Revenue" in the sidebar
   - See total billed, retention held, and net received across all projects
   - Filter by month, quarter, or year
   - Export to CSV, QuickBooks IIF, or Sage format

10. REPORTS (NEW):
    - Click "Reports" in the sidebar
    - Filter by project, date range, and status (draft/submitted/paid)
    - See monthly billing trend chart (contract billing + other invoices side by side)
    - Two tables: pay apps and other invoices, both filterable
    - Export pay apps or other invoices to CSV
    - Each project also has a mini billing summary at the bottom of the Pay Apps tab

11. OTHER INVOICES (NEW — non-contract):
    - Inside any project, scroll to "Other invoices" section below pay apps
    - Click "+ New invoice" to create permits, materials, equipment, labor, inspection, insurance, bond, or other invoices
    - These are NOT part of the G702/G703 contract total — tracked separately
    - Attach receipts or documents to each invoice
    - Download each invoice as a professional PDF
    - Vendor auto-fills from your company settings
    - Due date auto-fills to 30 days from today

12. PAYMENTS (Stripe Connect):
    - Go to Settings → Accept Payments via Stripe
    - Connect your Stripe account to accept ACH bank transfers (recommended) from property owners
    - Credit card is off by default — enable it in Settings if you want (higher dispute risk)
    - When you send a pay app email, it includes a "Pay Now" link
    - The property owner clicks the link and pays via ACH directly — funds go to your bank

13. SOV UPLOAD TIPS:
    - The parser auto-detects amount and description columns
    - "By Others" line items are treated as $0 (correct behavior)
    - Grand Total rows are automatically excluded
    - No template required — works with messy contractor spreadsheets

14. TEAM MEMBERS:
    - Settings > Team members > Invite by email
    - Roles: Field (content only), Project Manager, Accountant, Executive, Admin

RESPONSE STYLE:
- Keep answers under 3-4 short sentences when possible
- Use numbered steps for how-to questions
- Be encouraging and supportive
- If you do not know the answer, say so and suggest they email support at vaakapila@gmail.com
- Do NOT make up features that do not exist
`.trim();

let _aiUserHistory = {};  // per-user chat history (in-memory, resets on server restart)

app.post('/api/ai/ask', auth, async (req, res) => {
  const { question, history } = req.body;
  if (!question) return res.status(400).json({ error: 'Question required' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI not configured' });
  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: PRODUCT_KNOWLEDGE,
        messages: [...(history || []).slice(-10), { role: 'user', content: question }],
      }),
    });
    const aiData = await aiRes.json();
    if (aiData.error) throw new Error(aiData.error.message);
    res.json({ answer: aiData.content?.[0]?.text || 'No response' });
  } catch(e) { console.error('[AI User]', e.message); res.status(500).json({ error: 'AI temporarily unavailable' }); }
});

// ── Onboarding status ────────────────────────────────────────────────────────
app.post('/api/onboarding/complete', auth, async (req, res) => {
  try {
    await pool.query('UPDATE users SET has_completed_onboarding = TRUE WHERE id=$1', [req.user.id]);
    await logEvent(req.user.id, 'onboarding_completed', {});
    res.json({ ok: true });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/onboarding/reset', auth, async (req, res) => {
  try {
    await pool.query('UPDATE users SET has_completed_onboarding = FALSE WHERE id=$1', [req.user.id]);
    res.json({ ok: true });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/api/onboarding/status', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT has_completed_onboarding FROM users WHERE id=$1', [req.user.id]);
    res.json({ has_completed_onboarding: r.rows[0]?.has_completed_onboarding || false });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Admin: Manage user trials & subscriptions ────────────────────────────────
app.post('/api/admin/users/:id/extend-trial', adminAuth, async (req, res) => {
  const { days } = req.body;
  if (!days || days < 1 || days > 365) return res.status(400).json({ error: 'Days must be between 1 and 365' });
  try {
    await pool.query(
      'UPDATE users SET trial_end_date = COALESCE(trial_end_date, NOW()) + ($1 || \' days\')::INTERVAL, subscription_status = \'trial\', plan_type = \'free_trial\' WHERE id=$2',
      [days.toString(), req.params.id]
    );
    await logEvent(req.user.id, 'admin_trial_extended', { target_user_id: parseInt(req.params.id), days });
    res.json({ ok: true });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/admin/users/:id/set-free-override', adminAuth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE users SET subscription_status = \'free_override\', plan_type = \'free_override\', trial_end_date = NOW() + INTERVAL \'100 years\' WHERE id=$1',
      [req.params.id]
    );
    await logEvent(req.user.id, 'admin_free_override', { target_user_id: parseInt(req.params.id) });
    res.json({ ok: true });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/admin/users/:id/upgrade-pro', adminAuth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE users SET subscription_status = \'active\', plan_type = \'pro\' WHERE id=$1',
      [req.params.id]
    );
    await logEvent(req.user.id, 'admin_upgrade_pro', { target_user_id: parseInt(req.params.id) });
    res.json({ ok: true });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/admin/users/:id/reset-trial', adminAuth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE users SET trial_start_date = NOW(), trial_end_date = NOW() + INTERVAL \'90 days\', subscription_status = \'trial\', plan_type = \'free_trial\' WHERE id=$1',
      [req.params.id]
    );
    await logEvent(req.user.id, 'admin_trial_reset', { target_user_id: parseInt(req.params.id) });
    res.json({ ok: true });
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
            <blockquote style="border-left:3px solid #2563eb;padding-left:12px;color:#334155">${issue}</blockquote>
            <p style="margin-top:24px"><a href="${process.env.APP_URL||'https://constructinv.varshyl.com'}/?admin=1" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Open Admin Dashboard</a></p>
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
      `SELECT id, meta AS event_data, created_at FROM analytics_events
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
    if (!r.rows[0]) return res.redirect('/app.html?invite_error=invalid_or_expired');
    res.redirect('/app.html?invite_accepted=1');
  } catch(e) { res.redirect('/app.html?invite_error=server'); }
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
    <h2 style="color:#2563eb">You've been invited to Construction AI Billing</h2>
    <p>Hi ${toName},</p>
    <p>${inviter.name} (${inviter.email}) has added you to their team on Construction AI Billing.</p>
    <a href="${appUrl}/api/auth/accept-invite/${token}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0">Accept Invitation →</a>
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
  try {
    const token = req.query.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
    let decoded;
    try { decoded = jwt.verify(token, JWT_SECRET); } catch(e) { return res.status(401).json({ error: 'Invalid token' }); }

    const r = await pool.query(
      `SELECT ld.*, p.name, p.owner, p.contractor, p.location, p.city, p.state, p.contact as location_contact,
              cs.logo_filename, cs.company_name
       FROM lien_documents ld
       JOIN projects p ON p.id=ld.project_id
       LEFT JOIN company_settings cs ON cs.user_id=p.user_id
       WHERE ld.id=$1 AND p.user_id=$2`,
      [req.params.id, decoded.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    const lien = r.rows[0];

    const fp = path.resolve(__dirname, 'uploads', lien.filename);

    // Try to regenerate PDF with current logo (write to temp file first to avoid corrupting original)
    try {
      let pay_app_ref = null;
      if (lien.pay_app_id) {
        const paRow = await pool.query('SELECT app_number, period_label FROM pay_apps WHERE id=$1', [lien.pay_app_id]);
        if (paRow.rows[0]) pay_app_ref = `Pay App #${paRow.rows[0].app_number}${paRow.rows[0].period_label ? ' — ' + paRow.rows[0].period_label : ''}`;
      }
      const project = {
        name: lien.name, owner: lien.owner, contractor: lien.contractor || lien.company_name,
        company_name: lien.company_name, location: lien.location_contact,
        city: lien.city, state: lien.state, logo_filename: lien.logo_filename
      };
      const tmpPath = fp + '.tmp';
      await generateLienDocPDF({
        fpath: tmpPath, doc_type: lien.doc_type, project,
        through_date: lien.through_date, amount: lien.amount,
        maker_of_check: lien.maker_of_check, check_payable_to: lien.check_payable_to,
        signatory_name: lien.signatory_name, signatory_title: lien.signatory_title,
        signedAt: new Date(lien.signed_at), ip: lien.signatory_ip || 'on file',
        jurisdiction: lien.jurisdiction || 'california', pay_app_ref
      });
      if (fs.existsSync(tmpPath) && fs.statSync(tmpPath).size > 100) {
        fs.renameSync(tmpPath, fp);
      } else {
        try { fs.unlinkSync(tmpPath); } catch(_) {}
      }
    } catch(regenErr) {
      console.error('[Lien PDF regen error]', regenErr.message);
      try { const tmp = fp + '.tmp'; if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch(_) {}
    }

    // If file is still missing/empty after regen attempt, try direct generation as last resort
    if (!fs.existsSync(fp) || fs.statSync(fp).size === 0) {
      console.log('[Lien PDF] File missing or empty, attempting direct generation to:', fp);
      try {
        let pay_app_ref2 = null;
        if (lien.pay_app_id) {
          const paRow2 = await pool.query('SELECT app_number, period_label FROM pay_apps WHERE id=$1', [lien.pay_app_id]);
          if (paRow2.rows[0]) pay_app_ref2 = `Pay App #${paRow2.rows[0].app_number}${paRow2.rows[0].period_label ? ' — ' + paRow2.rows[0].period_label : ''}`;
        }
        const proj2 = {
          name: lien.name, owner: lien.owner, contractor: lien.contractor || lien.company_name,
          company_name: lien.company_name, location: lien.location_contact,
          city: lien.city, state: lien.state, logo_filename: lien.logo_filename
        };
        await generateLienDocPDF({
          fpath: fp, doc_type: lien.doc_type, project: proj2,
          through_date: lien.through_date, amount: lien.amount,
          maker_of_check: lien.maker_of_check, check_payable_to: lien.check_payable_to,
          signatory_name: lien.signatory_name, signatory_title: lien.signatory_title,
          signedAt: new Date(lien.signed_at), ip: lien.signatory_ip || 'on file',
          jurisdiction: lien.jurisdiction || 'california', pay_app_ref: pay_app_ref2
        });
        console.log('[Lien PDF] Direct generation succeeded, size:', fs.statSync(fp).size);
      } catch(lastErr) {
        console.error('[Lien PDF] Direct generation also failed:', lastErr.message, lastErr.stack);
      }
    }

    // Serve the file
    if (fs.existsSync(fp) && fs.statSync(fp).size > 0) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${lien.doc_type}_${lien.id}.pdf"`);
      return res.sendFile(fp, (err) => { if (err && !res.headersSent) res.status(500).json({ error: 'File send failed' }); });
    }
    return res.status(404).json({ error: 'Lien waiver PDF could not be generated' });
  } catch(outerErr) {
    console.error('[Lien PDF route error]', outerErr.message, outerErr.stack);
    if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
  }
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
  const BLUE = '#1d4ed8';
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

// ── MODULE 5: REPORTS API ──────────────────────────────────────────────────

// Reports: filtered pay apps with computed amounts
app.get('/api/reports/pay-apps', auth, async (req, res) => {
  try {
    const uid = req.user.id;
    const { project_id, status, date_from, date_to, sort_by, sort_dir } = req.query;
    let where = 'p.user_id=$1 AND pa.deleted_at IS NULL';
    const params = [uid];
    let pIdx = 2;
    if (project_id) { where += ` AND pa.project_id=$${pIdx++}`; params.push(project_id); }
    if (status) {
      if (status === 'paid') { where += ' AND pa.payment_received=TRUE'; }
      else if (status === 'submitted') { where += " AND pa.status='submitted' AND (pa.payment_received IS NULL OR pa.payment_received=FALSE)"; }
      else if (status === 'draft') { where += " AND pa.status!='submitted'"; }
    }
    if (date_from) { where += ` AND COALESCE(pa.period_end, pa.created_at::date) >= $${pIdx++}`; params.push(date_from); }
    if (date_to) { where += ` AND COALESCE(pa.period_end, pa.created_at::date) <= $${pIdx++}`; params.push(date_to); }

    const allowedSort = { date: 'COALESCE(pa.period_end, pa.created_at::date)', project: 'p.name', amount: 'gross_this', app_number: 'pa.app_number' };
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
    const totalOutstanding = submitted.filter(r => !r.payment_received).reduce((s, r) => s + parseFloat(r.amount_due || 0), 0);
    const totalPaid = submitted.filter(r => r.payment_received).reduce((s, r) => s + parseFloat(r.amount_due || 0), 0);
    const totalRetention = submitted.reduce((s, r) => s + parseFloat(r.retention_held || 0), 0);

    // Monthly chart data (from filtered results)
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const chart = months.map((label, i) => ({
      label,
      billed: submitted.filter(r => {
        const d = new Date(r.period_end || r.created_at);
        return d.getMonth() === i;
      }).reduce((s, r) => s + parseFloat(r.amount_due || 0), 0)
    }));

    res.json({ rows: r.rows, summary: { totalBilled, totalOutstanding, totalPaid, totalRetention, count: r.rows.length }, chart });
  } catch(e) { console.error('[Reports pay-apps]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// Reports: filtered other invoices
app.get('/api/reports/other-invoices', auth, async (req, res) => {
  try {
    const uid = req.user.id;
    const { project_id, category, status, date_from, date_to, sort_by, sort_dir } = req.query;
    let where = 'oi.user_id=$1 AND oi.deleted_at IS NULL';
    const params = [uid];
    let pIdx = 2;
    if (project_id) { where += ` AND oi.project_id=$${pIdx++}`; params.push(project_id); }
    if (category) { where += ` AND oi.category=$${pIdx++}`; params.push(category); }
    if (status) { where += ` AND oi.status=$${pIdx++}`; params.push(status); }
    if (date_from) { where += ` AND oi.invoice_date >= $${pIdx++}`; params.push(date_from); }
    if (date_to) { where += ` AND oi.invoice_date <= $${pIdx++}`; params.push(date_to); }

    const allowedSort = { date: 'oi.invoice_date', project: 'p.name', amount: 'oi.amount', vendor: 'oi.vendor', category: 'oi.category' };
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

    res.json({ rows: r.rows, summary: { totalAmount, count: r.rows.length, byCategory } });
  } catch(e) { console.error('[Reports other-invoices]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// Reports: CSV export
app.get('/api/reports/export/csv', auth, async (req, res) => {
  try {
    const uid = req.user.id;
    const { type, project_id, date_from, date_to } = req.query;
    let csvRows = [];
    if (type === 'other-invoices') {
      let where = 'oi.user_id=$1 AND oi.deleted_at IS NULL';
      const params = [uid]; let pIdx = 2;
      if (project_id) { where += ` AND oi.project_id=$${pIdx++}`; params.push(project_id); }
      if (date_from) { where += ` AND oi.invoice_date >= $${pIdx++}`; params.push(date_from); }
      if (date_to) { where += ` AND oi.invoice_date <= $${pIdx++}`; params.push(date_to); }
      const r = await pool.query(`SELECT oi.*, p.name AS project_name FROM other_invoices oi JOIN projects p ON p.id=oi.project_id WHERE ${where} ORDER BY oi.invoice_date DESC`, params);
      csvRows.push(['Invoice #','Category','Description','Vendor','Amount','Invoice Date','Due Date','Status','Project','Notes']);
      r.rows.forEach(inv => {
        csvRows.push([inv.invoice_number||'',inv.category||'',inv.description||'',inv.vendor||'',inv.amount||0,
          inv.invoice_date?new Date(inv.invoice_date).toLocaleDateString():'',
          inv.due_date?new Date(inv.due_date).toLocaleDateString():'',
          inv.status||'',inv.project_name||'',inv.notes||'']);
      });
    } else {
      // Pay apps export
      let where = 'p.user_id=$1 AND pa.deleted_at IS NULL';
      const params = [uid]; let pIdx = 2;
      if (project_id) { where += ` AND pa.project_id=$${pIdx++}`; params.push(project_id); }
      if (date_from) { where += ` AND COALESCE(pa.period_end, pa.created_at::date) >= $${pIdx++}`; params.push(date_from); }
      if (date_to) { where += ` AND COALESCE(pa.period_end, pa.created_at::date) <= $${pIdx++}`; params.push(date_to); }
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
      csvRows.push(['App #','Period','Period End','Status','Payment Received','Project','Job #','Gross Billed','Net Due']);
      r.rows.forEach(pa => {
        csvRows.push([pa.app_number, pa.period_label||'', pa.period_end?new Date(pa.period_end).toLocaleDateString():'',
          pa.status||'', pa.payment_received?'Yes':'No', pa.project_name||'', pa.job_number||'',
          parseFloat(pa.gross_billed||0).toFixed(2), parseFloat(pa.net_due||0).toFixed(2)]);
      });
    }
    const csv = csvRows.map(row => row.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="report_${type||'pay-apps'}_${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
  } catch(e) { console.error('[Reports CSV]', e.message); res.status(500).json({ error: 'Export failed' }); }
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
        <div style="font-size:9px;color:#2563eb;font-weight:600">${lbl}</div>
        <div style="width:100%;height:${h}px;background:linear-gradient(to top,#2563eb,#3b82f6);border-radius:3px 3px 0 0;min-height:${monthlyAmounts[i]>0?4:0}px"></div>
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
      ${logoUrl ? `<img src="${logoUrl}" style="max-height:60px;max-width:180px;object-fit:contain;margin-bottom:12px;display:block"/>` : `<div style="font-size:20px;font-weight:800;color:#1d4ed8;margin-bottom:8px">${pa.company_name||pa.contractor||'Contractor'}</div>`}
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
    <a href="mailto:${pa.co_email||pa.contact_email||''}?subject=Payment%20for%20${encodeURIComponent(pa.project_name)}%20Pay%20App%20%23${pa.app_number}&body=Please%20find%20payment%20confirmation%20for%20Pay%20Application%20%23${pa.app_number}." style="display:inline-block;background:#1d4ed8;color:#fff;padding:13px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;margin-right:12px">📧 Confirm Payment</a>
    <button onclick="window.print()" style="display:inline-block;background:#f1f5f9;color:#1e293b;border:1px solid #e2e8f0;padding:13px 24px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer">🖨 Print Invoice</button>
  </div>
  <!-- SOV table -->
  <div style="background:#fff;border:1px solid #e2e8f0;overflow:hidden;margin-top:0">
    <div style="padding:14px 32px;background:#f8fafc;border-bottom:1px solid #e2e8f0">
      <div style="font-size:13px;font-weight:700;color:#1d4ed8">Schedule of Values — Pay Application #${pa.app_number}</div>
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
        <tr style="background:#1d4ed8">
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
      <h2 style="color:#2563eb">Weekly Feedback Digest — Construction AI Billing</h2>
      <p style="color:#555">${r.rows.length} new feedback item${r.rows.length!==1?'s':''} from your users this week.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:16px">
        <thead><tr style="background:#2563eb;color:#fff">
          <th style="padding:8px;border:1px solid #ddd;text-align:left">Time</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left">User</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left">Category</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left">Message</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left">Page</th>
        </tr></thead>
        <tbody>${items}</tbody>
      </table>
      <p style="color:#888;font-size:11px;margin-top:20px">
        View all feedback live at <a href="https://constructinv.varshyl.com" style="color:#2563eb">constructinv.varshyl.com</a> → Admin → Feedback inbox.<br>
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
      from: fromEmail,
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
          <div style="font-size:13px;font-weight:600;color:#1d4ed8">${fmt(u.amount_due)} — ${fmtDate(u.due_date)}</div>
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
  <div style="background:#1d4ed8;padding:20px 32px;display:flex;align-items:center;justify-content:space-between">
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
    <div style="font-size:12px;color:#64748b">Questions? Reply to this email or contact <a href="mailto:${contractorEmail||''}" style="color:#2563eb">${contractorEmail||contractorName||'the billing team'}</a></div>
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

// ── STRIPE CONNECT & PAYMENTS ─────────────────────────────────────────────────
// Hybrid fee model: ACH $25 from GC | CC 3.3%+$0.40 from payer | Zero absorption
// All routes require stripe to be initialized (STRIPE_SECRET_KEY env var)

const STRIPE_FEE = {
  cc_rate: 0.033, cc_flat: 40, // 3.3% + $0.40 (in cents: 40)
  ach_flat: 2500, // $25.00 flat ACH fee (cents)
  stripe_ach_rate: 0.008, stripe_ach_cap: 500, // Stripe's 0.8% capped at $5
};

function requireStripe(req, res, next) {
  if (!stripe) return res.status(503).json({ error: 'Payment features not configured. Set STRIPE_SECRET_KEY.' });
  next();
}

function generatePaymentToken() {
  return require('crypto').randomBytes(24).toString('hex');
}

// ── Stripe Connect: Create onboarding link for GC ──────────────────────────
app.post('/api/stripe/connect', auth, requireStripe, async (req, res) => {
  try {
    // Check if user already has a connected account
    const existing = await pool.query('SELECT * FROM connected_accounts WHERE user_id=$1', [req.user.id]);
    let accountId;
    if (existing.rows[0]) {
      accountId = existing.rows[0].stripe_account_id;
    } else {
      // Create Express connected account
      const user = (await pool.query('SELECT name, email FROM users WHERE id=$1', [req.user.id])).rows[0];
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: user.email,
        business_type: 'company',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
          us_bank_account_ach_payments: { requested: true },
        },
        metadata: { user_id: String(req.user.id), platform: 'constructinvoice' },
      });
      accountId = account.id;
      await pool.query(
        'INSERT INTO connected_accounts(user_id, stripe_account_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET stripe_account_id=$2',
        [req.user.id, accountId]
      );
      await pool.query('UPDATE users SET stripe_connect_id=$1 WHERE id=$2', [accountId, req.user.id]);
      await logEvent(req.user.id, 'stripe_connect_created', { account_id: accountId });
    }
    // Create onboarding link
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/app.html#payments_setup=refresh`,
      return_url: `${baseUrl}/app.html#payments_setup=complete`,
      type: 'account_onboarding',
    });
    res.json({ url: link.url, account_id: accountId });
  } catch(e) { console.error('[Stripe Connect Error]', e.message); res.status(500).json({ error: e.message }); }
});

// ── Stripe Connect: Check account status ────────────────────────────────────
app.get('/api/stripe/account-status', auth, requireStripe, async (req, res) => {
  try {
    const row = await pool.query('SELECT * FROM connected_accounts WHERE user_id=$1', [req.user.id]);
    if (!row.rows[0]) return res.json({ connected: false });
    const acct = await stripe.accounts.retrieve(row.rows[0].stripe_account_id);
    const charges = acct.charges_enabled;
    const payouts = acct.payouts_enabled;
    await pool.query(
      'UPDATE connected_accounts SET charges_enabled=$1, payouts_enabled=$2, account_status=$3, business_name=$4, onboarded_at=CASE WHEN $1 AND onboarded_at IS NULL THEN NOW() ELSE onboarded_at END WHERE user_id=$5',
      [charges, payouts, charges ? 'active' : 'pending', acct.business_profile?.name || '', req.user.id]
    );
    if (charges) await pool.query('UPDATE users SET payments_enabled=TRUE WHERE id=$1', [req.user.id]);
    res.json({
      connected: true,
      charges_enabled: charges,
      payouts_enabled: payouts,
      account_id: row.rows[0].stripe_account_id,
      business_name: acct.business_profile?.name,
      status: charges ? 'active' : 'pending',
    });
  } catch(e) { console.error('[Stripe Status Error]', e.message); res.status(500).json({ error: e.message }); }
});

// ── Stripe Connect: Create dashboard login link (GC can view their Stripe dashboard) ──
app.post('/api/stripe/dashboard-link', auth, requireStripe, async (req, res) => {
  try {
    const row = await pool.query('SELECT stripe_account_id FROM connected_accounts WHERE user_id=$1', [req.user.id]);
    if (!row.rows[0]) return res.status(404).json({ error: 'No connected account' });
    const link = await stripe.accounts.createLoginLink(row.rows[0].stripe_account_id);
    res.json({ url: link.url });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Generate payment link for a pay app ─────────────────────────────────────
app.post('/api/pay-apps/:id/payment-link', auth, requireStripe, async (req, res) => {
  try {
    const pa = (await pool.query('SELECT pa.*, p.name as project_name, p.user_id FROM pay_apps pa JOIN projects p ON pa.project_id=p.id WHERE pa.id=$1', [req.params.id])).rows[0];
    if (!pa || pa.user_id !== req.user.id) return res.status(404).json({ error: 'Pay app not found' });
    // Check GC has Stripe Connect
    const acct = (await pool.query('SELECT * FROM connected_accounts WHERE user_id=$1 AND charges_enabled=TRUE', [req.user.id])).rows[0];
    if (!acct) return res.status(400).json({ error: 'Please connect your Stripe account in Settings first.' });
    // Generate or reuse payment link token
    let token = pa.payment_link_token;
    if (!token) {
      token = generatePaymentToken();
      await pool.query('UPDATE pay_apps SET payment_link_token=$1 WHERE id=$2', [token, pa.id]);
    }
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const payUrl = `${baseUrl}/pay/${token}`;
    await logEvent(req.user.id, 'payment_link_generated', { pay_app_id: pa.id, token });
    res.json({ url: payUrl, token });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Public payment page data (no auth — accessed by payer via link) ──────────
app.get('/api/pay/:token', async (req, res) => {
  try {
    const pa = (await pool.query(
      `SELECT pa.*, p.name as project_name, p.number as project_number, p.owner as project_owner,
              p.contractor, p.user_id, p.owner_email,
              cs.company_name, cs.logo_filename, cs.contact_name, cs.contact_phone, cs.contact_email,
              cs.credit_card_enabled
       FROM pay_apps pa
       JOIN projects p ON pa.project_id=p.id
       LEFT JOIN company_settings cs ON cs.user_id=p.user_id
       WHERE pa.payment_link_token=$1 AND pa.deleted_at IS NULL`,
      [req.params.token]
    )).rows[0];
    if (!pa) return res.status(404).json({ error: 'Payment link not found or expired' });
    // Get connected account for this GC
    const acct = (await pool.query('SELECT stripe_account_id FROM connected_accounts WHERE user_id=$1 AND charges_enabled=TRUE', [pa.user_id])).rows[0];
    if (!acct) return res.status(400).json({ error: 'Contractor has not set up payment acceptance yet.' });
    // Calculate amounts from pay app lines
    const lines = (await pool.query(
      `SELECT pal.*, sl.item_id, sl.description, sl.scheduled_value
       FROM pay_app_lines pal JOIN sov_lines sl ON pal.sov_line_id=sl.id
       WHERE pal.pay_app_id=$1`, [pa.id]
    )).rows;
    let totalDue = 0;
    let totalRetainageHeld = 0;
    let avgRetainagePct = 0;
    lines.forEach(l => {
      const sv = parseFloat(l.scheduled_value) || 0;
      const prevPct = parseFloat(l.prev_pct) || 0;
      const thisPct = parseFloat(l.this_pct) || 0;
      const retPct = parseFloat(l.retainage_pct) || 10;
      const d = sv * (prevPct + thisPct) / 100;
      const e = d * retPct / 100;
      const f = d - e;
      const g = sv * prevPct / 100 * (1 - retPct / 100);
      totalDue += (f - g);
      // Track retainage for this period only
      const thisWork = sv * thisPct / 100;
      totalRetainageHeld += thisWork * retPct / 100;
      avgRetainagePct = retPct; // Use last line's retainage (usually uniform)
    });
    const amountPaid = parseFloat(pa.amount_paid) || 0;
    const amountRemaining = Math.max(0, totalDue - amountPaid);
    // Check if there are any succeeded/pending payments for this pay app
    const existingPayments = (await pool.query(
      "SELECT COUNT(*) as count FROM payments WHERE pay_app_id=$1 AND payment_status IN ('succeeded','pending')", [pa.id]
    )).rows[0].count;
    // Calculate fees for display
    const ccFee = Math.round(amountRemaining * STRIPE_FEE.cc_rate * 100 + STRIPE_FEE.cc_flat) / 100;
    const achFee = STRIPE_FEE.ach_flat / 100; // $25 flat, deducted from GC
    // Build line items for invoice details display
    const lineItems = lines.map(l => {
      const sv = parseFloat(l.scheduled_value) || 0;
      const prevPct = parseFloat(l.prev_pct) || 0;
      const thisPct = parseFloat(l.this_pct) || 0;
      const thisAmt = sv * thisPct / 100;
      return {
        item_id: l.item_id,
        description: l.description,
        scheduled_value: sv,
        this_period: parseFloat(thisAmt.toFixed(2)),
      };
    }).filter(l => l.this_period > 0 || l.scheduled_value > 0);
    res.json({
      project_name: pa.project_name,
      project_number: pa.project_number,
      project_owner: pa.project_owner,
      app_number: pa.app_number,
      period_label: pa.period_label,
      company_name: pa.company_name || pa.contractor,
      logo_filename: pa.logo_filename,
      contact_name: pa.contact_name,
      contact_email: pa.contact_email,
      amount_due: parseFloat(amountRemaining.toFixed(2)),
      amount_paid: amountPaid,
      total_due: parseFloat(totalDue.toFixed(2)),
      payment_status: parseInt(existingPayments) > 0 && (pa.payment_status === 'unpaid' || !pa.payment_status) ? 'processing' : (pa.payment_status || 'unpaid'),
      has_pending_payment: parseInt(existingPayments) > 0,
      bad_debt: pa.bad_debt,
      retainage_held: parseFloat(totalRetainageHeld.toFixed(2)),
      retainage_pct: avgRetainagePct,
      cc_fee: ccFee,
      ach_fee: achFee,
      stripe_account_id: acct.stripe_account_id,
      po_number: pa.po_number,
      lines: lineItems,
      pay_app_id: pa.id,
      credit_card_enabled: pa.credit_card_enabled === true || pa.credit_card_enabled === 'true',
    });
  } catch(e) { console.error('[Pay Page Error]', e.message); res.status(500).json({ error: e.message }); }
});

// ── Public PDF Download (authenticated via payment token) ─────────────────────
app.get('/api/pay/:token/pdf', async (req, res) => {
  try {
    const pa = (await pool.query(
      `SELECT pa.*, p.name as pname, p.number as pnum, p.owner, p.contractor, p.architect,
              p.original_contract, p.payment_terms, p.contract_date, p.user_id,
              p.include_architect, p.include_retainage,
              cs.logo_filename, cs.signature_filename, cs.default_payment_terms,
              cs.contact_name, cs.company_name
       FROM pay_apps pa JOIN projects p ON pa.project_id=p.id
       LEFT JOIN company_settings cs ON cs.user_id=p.user_id
       WHERE pa.payment_link_token=$1 AND pa.deleted_at IS NULL`,
      [req.params.token]
    )).rows[0];
    if (!pa) return res.status(404).json({ error: 'Invoice not found' });
    const lines = await pool.query(
      'SELECT pal.*,sl.item_id,sl.description,sl.scheduled_value FROM pay_app_lines pal JOIN sov_lines sl ON sl.id=pal.sov_line_id WHERE pal.pay_app_id=$1 ORDER BY sl.sort_order',
      [pa.id]
    );
    const cos = await pool.query('SELECT * FROM change_orders WHERE pay_app_id=$1', [pa.id]);
    let tComp=0,tRet=0,tThis=0,tPrev=0,tPrevCert=0;
    lines.rows.forEach(r => {
      const sv=parseFloat(r.scheduled_value);
      const retPct=parseFloat(r.retainage_pct)/100;
      const prev=sv*parseFloat(r.prev_pct)/100;
      const thisPer=sv*parseFloat(r.this_pct)/100;
      const comp=prev+thisPer+parseFloat(r.stored_materials||0);
      tPrev+=prev; tThis+=thisPer; tComp+=comp;
      tRet+=comp*retPct;
      tPrevCert+=prev*(1-retPct);
    });
    const tCO=cos.rows.reduce((s,c)=>s+parseFloat(c.amount||0),0);
    const contract=parseFloat(pa.original_contract)+tCO;
    const earned=tComp-tRet;
    const due=Math.max(0,earned-tPrevCert);
    const imgMime = buf => {
      if (buf[0]===0x89 && buf[1]===0x50) return 'image/png';
      if (buf[0]===0xFF && buf[1]===0xD8) return 'image/jpeg';
      if (buf[0]===0x47 && buf[1]===0x49) return 'image/gif';
      if (buf[0]===0x52 && buf[1]===0x49) return 'image/webp';
      return 'image/png';
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
    const sigBase64 = readImgB64(pa.signature_filename);
    const totals = { tComp, tRet, tPrevCert, tCO, contract, earned, due };
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PayApp_${pa.app_number}_${(pa.pname||'').replace(/\s+/g,'_')}.pdf"`);
    if (puppeteer) {
      let browser;
      try {
        const html = generatePayAppHTML(pa, lines.rows, cos.rows, totals, logoBase64, sigBase64, [], []);
        browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'Letter', printBackground: true, margin: { top: '0.5in', right: '0.45in', bottom: '0.5in', left: '0.45in' } });
        res.send(pdfBuffer);
        return;
      } catch(puppErr) {
        console.error('[Public PDF] Puppeteer error, falling back to PDFKit:', puppErr.message);
      } finally { if (browser) await browser.close().catch(()=>{}); }
    }
    // PDFKit fallback
    const PDFDocument = require('pdfkit');
    const pdfDoc = new PDFDocument({ size: 'LETTER', margin: 40 });
    pdfDoc.pipe(res);
    pdfDoc.fontSize(16).font('Helvetica-Bold').text(`Pay Application #${pa.app_number}`, { align: 'center' });
    pdfDoc.moveDown(0.3);
    pdfDoc.fontSize(11).font('Helvetica').text(`${pa.pname||''} · ${pa.period_label||''}`, { align: 'center' });
    pdfDoc.moveDown(0.5);
    pdfDoc.fontSize(10).text(`Current Payment Due: $${due.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`, { align: 'center' });
    pdfDoc.moveDown(1);
    pdfDoc.fontSize(8).fillColor('#888').text('Generated by ConstructInvoice AI', { align: 'center' });
    pdfDoc.end();
  } catch(e) {
    console.error('[Public PDF Error]', e.message);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// ── Create Stripe Checkout Session (called from payment page) ────────────────
app.post('/api/pay/:token/checkout', async (req, res) => {
  try {
    const { method, amount, payer_name, payer_email } = req.body;
    if (!method || !amount) return res.status(400).json({ error: 'Missing method or amount' });
    const pa = (await pool.query(
      `SELECT pa.*, p.name as project_name, p.user_id, p.contractor
       FROM pay_apps pa JOIN projects p ON pa.project_id=p.id
       WHERE pa.payment_link_token=$1 AND pa.deleted_at IS NULL`, [req.params.token]
    )).rows[0];
    if (!pa) return res.status(404).json({ error: 'Invalid payment link' });
    if (pa.bad_debt) return res.status(400).json({ error: 'This invoice has been marked as uncollectable.' });
    const acct = (await pool.query('SELECT stripe_account_id FROM connected_accounts WHERE user_id=$1 AND charges_enabled=TRUE', [pa.user_id])).rows[0];
    if (!acct) return res.status(400).json({ error: 'Payment not available' });
    // Check if credit card is enabled for this GC
    if (method === 'card') {
      const ccSettings = (await pool.query('SELECT credit_card_enabled FROM company_settings WHERE user_id=$1', [pa.user_id])).rows[0];
      if (!ccSettings || !ccSettings.credit_card_enabled) {
        return res.status(400).json({ error: 'Credit card payments are not enabled. Please use ACH bank transfer.' });
      }
    }
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (amountCents < 100) return res.status(400).json({ error: 'Minimum payment is $1.00' });
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const paymentToken = generatePaymentToken();
    // Calculate CC processing fee upfront (used for card checkout + INSERT)
    const processingFeeCents = Math.round(amountCents * STRIPE_FEE.cc_rate) + STRIPE_FEE.cc_flat;

    let sessionConfig;
    if (method === 'ach') {
      // ACH: $25 fee deducted from GC side. Owner pays exact amount.
      // application_fee = our $25 fee. Stripe takes their $5 from the connected account.
      sessionConfig = {
        payment_method_types: ['us_bank_account'],
        mode: 'payment',
        customer_creation: 'always',
        payment_intent_data: {
          application_fee_amount: STRIPE_FEE.ach_flat, // $25 in cents = 2500
          transfer_data: { destination: acct.stripe_account_id },
        },
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Pay App #${pa.app_number} — ${pa.project_name}`,
              description: `Payment to ${pa.contractor || 'Contractor'}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}/pay/${req.params.token}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pay/${req.params.token}?payment=cancelled`,
        metadata: { pay_app_id: String(pa.id), payment_token: paymentToken, method: 'ach' },
      };
    } else {
      // CC/Debit: 3.3% + $0.40 processing fee charged ON TOP to the payer
      const totalChargeCents = amountCents + processingFeeCents;
      // application_fee = processing fee (we keep the margin, Stripe takes their share from it)
      sessionConfig = {
        payment_method_types: ['card'],
        mode: 'payment',
        payment_intent_data: {
          application_fee_amount: processingFeeCents,
          transfer_data: { destination: acct.stripe_account_id },
        },
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: `Pay App #${pa.app_number} — ${pa.project_name}` },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
          {
            price_data: {
              currency: 'usd',
              product_data: { name: 'Processing Fee' },
              unit_amount: processingFeeCents,
            },
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/pay/${req.params.token}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pay/${req.params.token}?payment=cancelled`,
        metadata: { pay_app_id: String(pa.id), payment_token: paymentToken, method: 'card' },
      };
    }
    // Add payer info if provided
    if (payer_email) sessionConfig.customer_email = payer_email;
    const session = await stripe.checkout.sessions.create(sessionConfig);
    // Record pending payment
    await pool.query(
      `INSERT INTO payments(pay_app_id, project_id, user_id, stripe_checkout_session_id, payment_token, amount, processing_fee, payment_method, payment_status, payer_name, payer_email)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10)`,
      [pa.id, pa.project_id, pa.user_id, session.id, paymentToken, amount,
       method === 'ach' ? 25 : (processingFeeCents || 0) / 100,
       method, payer_name || '', payer_email || '']
    );
    res.json({ checkout_url: session.url, session_id: session.id });
  } catch(e) { console.error('[Checkout Error]', e.message); res.status(500).json({ error: e.message }); }
});

// ── Verify payment on success redirect (fallback if webhook is delayed/missing) ──
app.post('/api/pay/:token/verify', async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'Missing session_id' });
    // Verify this session belongs to this payment token
    const payment = (await pool.query(
      `SELECT p.*, pa.amount_due, pa.id as pay_app_id FROM payments p
       JOIN pay_apps pa ON pa.id=p.pay_app_id
       WHERE p.stripe_checkout_session_id=$1 AND pa.payment_link_token=$2`,
      [session_id, req.params.token]
    )).rows[0];
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    // If already succeeded, just return
    if (payment.payment_status === 'succeeded') return res.json({ status: 'succeeded', already: true });
    // Check with Stripe directly
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status === 'paid' || session.status === 'complete') {
      // Update payment record
      await pool.query(
        `UPDATE payments SET payment_status='succeeded', stripe_payment_intent_id=$1, paid_at=NOW(),
         payer_email=COALESCE(NULLIF(payer_email,''),$2)
         WHERE stripe_checkout_session_id=$3`,
        [session.payment_intent, session.customer_details?.email || '', session_id]
      );
      // Update pay app totals
      const payAppId = payment.pay_app_id;
      const currentPaid = (await pool.query("SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE pay_app_id=$1 AND payment_status='succeeded'", [payAppId])).rows[0].total;
      let totalDue = parseFloat(payment.amount_due) || 0;
      // If amount_due not snapshotted, calculate from line items
      if (totalDue <= 0) {
        const linesResult = await pool.query(
          `SELECT pal.*, sl.scheduled_value FROM pay_app_lines pal
           JOIN sov_lines sl ON pal.sov_line_id=sl.id WHERE pal.pay_app_id=$1`, [payAppId]);
        linesResult.rows.forEach(l => {
          const sv = parseFloat(l.scheduled_value) || 0;
          const prevP = parseFloat(l.prev_pct) || 0;
          const thisP = parseFloat(l.this_pct) || 0;
          const retP = parseFloat(l.retainage_pct) || 10;
          const d2 = sv * (prevP + thisP) / 100;
          const e2 = d2 * retP / 100;
          const f2 = d2 - e2;
          const g2 = sv * prevP / 100 * (1 - retP / 100);
          totalDue += (f2 - g2);
        });
        if (totalDue > 0) await pool.query('UPDATE pay_apps SET amount_due=$1 WHERE id=$2', [totalDue.toFixed(2), payAppId]);
      }
      const paidNum = parseFloat(currentPaid);
      const newStatus = paidNum >= totalDue && totalDue > 0 ? 'paid' : paidNum > 0 ? 'partial' : 'unpaid';
      await pool.query(
        "UPDATE pay_apps SET amount_paid=$1, payment_status=$2, payment_received=$3, payment_received_at=CASE WHEN $2='paid' THEN NOW() ELSE payment_received_at END WHERE id=$4",
        [paidNum, newStatus, newStatus === 'paid', payAppId]
      );
      console.log(`[Payment Verify] Confirmed payment for PA#${payAppId}: $${paidNum} (${newStatus})`);
      return res.json({ status: 'succeeded', payment_status: newStatus, amount_paid: paidNum });
    }
    // ACH might be 'processing' — still pending
    res.json({ status: session.payment_status || 'pending', stripe_status: session.status });
  } catch(e) {
    console.error('[Payment Verify Error]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Stripe Webhook (handles payment success/failure) ────────────────────────
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
      console.warn('[Stripe Webhook] No webhook secret — accepting unverified event (dev only)');
    }
  } catch(e) { console.error('[Webhook Verify Error]', e.message); return res.status(400).send('Webhook Error'); }

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      const payAppId = parseInt(session.metadata?.pay_app_id);
      const paymentToken = session.metadata?.payment_token;
      const method = session.metadata?.method;
      if (!payAppId) return res.json({ received: true });
      const amountPaid = (session.amount_total || 0) / 100;
      // For CC: subtract processing fee to get actual pay app amount
      let actualAmount = amountPaid;
      if (method === 'card') {
        // Total includes processing fee; back out our fee to get pay app amount
        const payAppAmount = (await pool.query('SELECT amount FROM payments WHERE stripe_checkout_session_id=$1', [session.id])).rows[0]?.amount;
        if (payAppAmount) actualAmount = parseFloat(payAppAmount);
      }
      // For ACH: checkout.session.completed fires first with payment_status='unpaid' (processing).
      // checkout.session.async_payment_succeeded fires later when ACH clears.
      // Only mark payment as 'succeeded' when actually paid.
      const isACH = method === 'ach';
      const sessionPaid = session.payment_status === 'paid';
      const isAsyncSuccess = event.type === 'checkout.session.async_payment_succeeded';
      if (!isACH || isAsyncSuccess || sessionPaid) {
        // Update payment record to succeeded
        await pool.query(
          `UPDATE payments SET payment_status='succeeded', stripe_payment_intent_id=$1, paid_at=NOW(), payer_email=COALESCE(NULLIF(payer_email,''),$2)
           WHERE stripe_checkout_session_id=$3`,
          [session.payment_intent, session.customer_details?.email || '', session.id]
        );
      } else {
        // ACH checkout completed but payment still processing — keep as pending
        await pool.query(
          `UPDATE payments SET stripe_payment_intent_id=$1, payer_email=COALESCE(NULLIF(payer_email,''),$2)
           WHERE stripe_checkout_session_id=$3`,
          [session.payment_intent, session.customer_details?.email || '', session.id]
        );
        console.log(`[Payment] ACH payment initiated for PA#${payAppId} — waiting for bank confirmation`);
      }
      // Update pay app totals — calculate totalDue from line items if amount_due not set
      const currentPaid = (await pool.query('SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE pay_app_id=$1 AND payment_status=\'succeeded\'', [payAppId])).rows[0].total;
      const pa = (await pool.query('SELECT amount_due FROM pay_apps WHERE id=$1', [payAppId])).rows[0];
      let totalDue = parseFloat(pa?.amount_due) || 0;
      // If amount_due not snapshotted, calculate from line items (G702 math)
      if (totalDue <= 0) {
        const linesResult = await pool.query(
          `SELECT pal.*, sl.scheduled_value FROM pay_app_lines pal
           JOIN sov_lines sl ON pal.sov_line_id=sl.id WHERE pal.pay_app_id=$1`, [payAppId]);
        linesResult.rows.forEach(l => {
          const sv = parseFloat(l.scheduled_value) || 0;
          const prevP = parseFloat(l.prev_pct) || 0;
          const thisP = parseFloat(l.this_pct) || 0;
          const retP = parseFloat(l.retainage_pct) || 10;
          const d2 = sv * (prevP + thisP) / 100;
          const e2 = d2 * retP / 100;
          const f2 = d2 - e2;
          const g2 = sv * prevP / 100 * (1 - retP / 100);
          totalDue += (f2 - g2);
        });
        // Snapshot it for future lookups
        if (totalDue > 0) await pool.query('UPDATE pay_apps SET amount_due=$1 WHERE id=$2', [totalDue.toFixed(2), payAppId]);
      }
      const paidNum = parseFloat(currentPaid);
      const newStatus = paidNum >= totalDue && totalDue > 0 ? 'paid' : paidNum > 0 ? 'partial' : 'unpaid';
      await pool.query(
        'UPDATE pay_apps SET amount_paid=$1, payment_status=$2, payment_received=$3, payment_received_at=CASE WHEN $2=\'paid\' THEN NOW() ELSE payment_received_at END WHERE id=$4',
        [paidNum, newStatus, newStatus === 'paid', payAppId]
      );
      // Log event
      const userId = (await pool.query('SELECT user_id FROM payments WHERE stripe_checkout_session_id=$1', [session.id])).rows[0]?.user_id;
      if (userId) await logEvent(userId, 'payment_received', { pay_app_id: payAppId, amount: actualAmount, method, total_paid: paidNum });
      console.log(`[Payment] ${event.type}: ${method} $${actualAmount} for PA#${payAppId} (total paid: $${paidNum}, status: ${newStatus})`);
    }
    // Handle async ACH payment failure
    if (event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object;
      const payAppId = parseInt(session.metadata?.pay_app_id);
      await pool.query(
        "UPDATE payments SET payment_status='failed', failed_at=NOW(), failure_reason='ACH bank transfer failed' WHERE stripe_checkout_session_id=$1",
        [session.id]
      );
      if (payAppId) {
        await pool.query("UPDATE pay_apps SET payment_status='unpaid' WHERE id=$1 AND payment_status != 'paid'", [payAppId]);
      }
      console.log(`[Payment] ACH payment FAILED for PA#${payAppId}`);
    }
    if (event.type === 'checkout.session.expired' || event.type === 'payment_intent.payment_failed') {
      const session = event.data.object;
      const sessionId = session.id || session.metadata?.checkout_session_id;
      await pool.query("UPDATE payments SET payment_status='failed', failed_at=NOW(), failure_reason=$1 WHERE stripe_checkout_session_id=$2",
        [event.type === 'payment_intent.payment_failed' ? (session.last_payment_error?.message || 'Payment failed') : 'Session expired', sessionId]);
    }

    // ── Subscription lifecycle events ──────────────────────────────────────
    if (event.type === 'invoice.paid') {
      const invoice = event.data.object;
      const customerId = invoice.customer;
      const subscriptionId = invoice.subscription;
      if (customerId && subscriptionId) {
        const userRow = (await pool.query('SELECT id FROM users WHERE stripe_customer_id=$1', [customerId])).rows[0];
        if (userRow) {
          await pool.query(
            "UPDATE users SET subscription_status='active', plan_type='pro', stripe_subscription_id=$1 WHERE id=$2",
            [subscriptionId, userRow.id]
          );
          console.log(`[Subscription] User ${userRow.id} → active (invoice paid: ${invoice.id})`);
        }
      }
    }
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      const customerId = invoice.customer;
      if (customerId) {
        const userRow = (await pool.query('SELECT id FROM users WHERE stripe_customer_id=$1', [customerId])).rows[0];
        if (userRow) {
          await pool.query("UPDATE users SET subscription_status='past_due' WHERE id=$1", [userRow.id]);
          console.log(`[Subscription] User ${userRow.id} → past_due (invoice payment failed)`);
        }
      }
    }
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      if (customerId) {
        const userRow = (await pool.query('SELECT id FROM users WHERE stripe_customer_id=$1', [customerId])).rows[0];
        if (userRow) {
          await pool.query("UPDATE users SET subscription_status='canceled', plan_type='free_trial' WHERE id=$1", [userRow.id]);
          console.log(`[Subscription] User ${userRow.id} → canceled`);
        }
      }
    }
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      if (customerId && subscription.status === 'active') {
        const userRow = (await pool.query('SELECT id FROM users WHERE stripe_customer_id=$1', [customerId])).rows[0];
        if (userRow) {
          await pool.query(
            "UPDATE users SET subscription_status='active', plan_type='pro', stripe_subscription_id=$1 WHERE id=$2",
            [subscription.id, userRow.id]
          );
        }
      }
    }
  } catch(e) { console.error('[Webhook Processing Error]', e.message); }
  res.json({ received: true });
});

// ── GC: List payments for their pay apps ────────────────────────────────────
app.get('/api/payments', auth, async (req, res) => {
  try {
    const payments = (await pool.query(
      `SELECT pm.*, pa.app_number, p.name as project_name
       FROM payments pm
       JOIN pay_apps pa ON pm.pay_app_id=pa.id
       JOIN projects p ON pm.project_id=p.id
       WHERE pm.user_id=$1
       ORDER BY pm.created_at DESC
       LIMIT 100`, [req.user.id]
    )).rows;
    // Summary stats
    const stats = (await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE payment_status='succeeded') as received_count,
         COALESCE(SUM(amount) FILTER (WHERE payment_status='succeeded'),0) as total_received,
         COUNT(*) FILTER (WHERE payment_status='pending') as pending_count,
         COALESCE(SUM(amount) FILTER (WHERE payment_status='pending'),0) as total_pending
       FROM payments WHERE user_id=$1`, [req.user.id]
    )).rows[0];
    res.json({ payments, summary: stats, count: payments.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GC: Mark pay app as bad debt ────────────────────────────────────────────
app.post('/api/pay-apps/:id/bad-debt', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    const pa = (await pool.query(
      'SELECT pa.*, p.user_id FROM pay_apps pa JOIN projects p ON pa.project_id=p.id WHERE pa.id=$1', [req.params.id]
    )).rows[0];
    if (!pa || pa.user_id !== req.user.id) return res.status(404).json({ error: 'Pay app not found' });
    await pool.query('UPDATE pay_apps SET bad_debt=TRUE, bad_debt_at=NOW(), bad_debt_reason=$1, payment_status=\'bad_debt\' WHERE id=$2', [reason || 'Marked as uncollectable', req.params.id]);
    await logEvent(req.user.id, 'bad_debt_marked', { pay_app_id: pa.id, reason });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GC: Undo bad debt ──────────────────────────────────────────────────────
app.post('/api/pay-apps/:id/undo-bad-debt', auth, async (req, res) => {
  try {
    const pa = (await pool.query(
      'SELECT pa.*, p.user_id FROM pay_apps pa JOIN projects p ON pa.project_id=p.id WHERE pa.id=$1', [req.params.id]
    )).rows[0];
    if (!pa || pa.user_id !== req.user.id) return res.status(404).json({ error: 'Pay app not found' });
    const amountPaid = parseFloat(pa.amount_paid) || 0;
    const newStatus = amountPaid > 0 ? 'partial' : 'unpaid';
    await pool.query('UPDATE pay_apps SET bad_debt=FALSE, bad_debt_at=NULL, bad_debt_reason=NULL, payment_status=$1 WHERE id=$2', [newStatus, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Other Invoices: Non-contract items (permits, materials, misc) ───────────

// List other invoices for a project
app.get('/api/projects/:id/other-invoices', auth, async (req, res) => {
  try {
    const proj = (await pool.query('SELECT id FROM projects WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rows[0];
    if (!proj) return res.status(404).json({ error: 'Project not found' });
    const rows = await pool.query(
      'SELECT * FROM other_invoices WHERE project_id=$1 AND user_id=$2 AND deleted_at IS NULL ORDER BY invoice_date DESC, created_at DESC',
      [req.params.id, req.user.id]
    );
    res.json(rows.rows);
  } catch(e) {
    console.error('[GET /api/projects/:id/other-invoices]', e.message);
    res.status(500).json({ error: 'Failed to load other invoices' });
  }
});

// Create other invoice (supports multipart for file attachment)
app.post('/api/projects/:id/other-invoices', auth, upload.single('file'), async (req, res) => {
  try {
    const proj = (await pool.query('SELECT id FROM projects WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rows[0];
    if (!proj) return res.status(404).json({ error: 'Project not found' });
    const { invoice_number, category, description, vendor, amount, invoice_date, due_date, notes } = req.body;
    if (!description || !description.trim()) return res.status(400).json({ error: 'Description is required' });
    let attachFilename = null, attachOriginalName = null;
    if (req.file) {
      attachFilename = req.file.filename;
      attachOriginalName = req.file.originalname;
    }
    const result = await pool.query(
      `INSERT INTO other_invoices (project_id, user_id, invoice_number, category, description, vendor, amount, invoice_date, due_date, notes, attachment_filename, attachment_original_name, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.params.id, req.user.id, invoice_number||null, category||'other', description.trim(), vendor||null,
       parseFloat(amount)||0, invoice_date||new Date().toISOString().slice(0,10), due_date||null, notes||null,
       attachFilename, attachOriginalName, 'sent']
    );
    res.json(result.rows[0]);
  } catch(e) {
    console.error('[POST /api/projects/:id/other-invoices]', e.message);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// Update other invoice (supports multipart for file attachment)
app.put('/api/other-invoices/:id', auth, upload.single('file'), async (req, res) => {
  try {
    const inv = (await pool.query('SELECT * FROM other_invoices WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL', [req.params.id, req.user.id])).rows[0];
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    const { invoice_number, category, description, vendor, amount, invoice_date, due_date, status, notes } = req.body;
    let attachFilename = inv.attachment_filename;
    let attachOriginalName = inv.attachment_original_name;
    if (req.file) {
      attachFilename = req.file.filename;
      attachOriginalName = req.file.originalname;
    }
    const result = await pool.query(
      `UPDATE other_invoices SET
        invoice_number=COALESCE($1,invoice_number), category=COALESCE($2,category),
        description=COALESCE($3,description), vendor=COALESCE($4,vendor),
        amount=COALESCE($5,amount), invoice_date=COALESCE($6,invoice_date),
        due_date=COALESCE($7,due_date), status=COALESCE($8,status), notes=COALESCE($9,notes),
        attachment_filename=$10, attachment_original_name=$11
       WHERE id=$12 RETURNING *`,
      [invoice_number, category, description, vendor, amount!=null?parseFloat(amount):null,
       invoice_date||null, due_date||null, status||null, notes,
       attachFilename, attachOriginalName, req.params.id]
    );
    res.json(result.rows[0]);
  } catch(e) {
    console.error('[PUT /api/other-invoices/:id]', e.message);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// Download other invoice attachment
app.get('/api/other-invoices/:id/attachment', auth, async (req, res) => {
  try {
    const inv = (await pool.query('SELECT * FROM other_invoices WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL', [req.params.id, req.user.id])).rows[0];
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    if (!inv.attachment_filename) return res.status(404).json({ error: 'No attachment' });
    const filePath = path.join(uploadDir, inv.attachment_filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
    res.download(filePath, inv.attachment_original_name || inv.attachment_filename);
  } catch(e) {
    console.error('[GET /api/other-invoices/:id/attachment]', e.message);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

// Soft-delete other invoice
app.delete('/api/other-invoices/:id', auth, async (req, res) => {
  try {
    const inv = (await pool.query('SELECT * FROM other_invoices WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL', [req.params.id, req.user.id])).rows[0];
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    await pool.query('UPDATE other_invoices SET deleted_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) {
    console.error('[DELETE /api/other-invoices/:id]', e.message);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

// Download other invoice as professional one-page PDF
app.get('/api/other-invoices/:id/pdf', auth, async (req, res) => {
  try {
    const inv = (await pool.query(
      `SELECT oi.*, p.name as project_name, p.number as project_number, p.owner as project_owner,
              p.contractor, p.contact_name, p.contact_phone, p.contact_email,
              p.job_number, p.address, p.owner_email, p.owner_phone
       FROM other_invoices oi JOIN projects p ON p.id=oi.project_id
       WHERE oi.id=$1 AND oi.user_id=$2 AND oi.deleted_at IS NULL`,
      [req.params.id, req.user.id]
    )).rows[0];
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    // Get company settings for logo/contact
    const settings = (await pool.query('SELECT * FROM company_settings WHERE user_id=$1', [req.user.id])).rows[0] || {};

    // Check if user has Stripe Connect for pay link
    const connAcct = (await pool.query('SELECT * FROM connected_accounts WHERE user_id=$1 AND charges_enabled=true', [req.user.id])).rows[0];

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 50, bottom: 50, left: 60, right: 60 } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => {
      const pdf = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="invoice-${inv.invoice_number||inv.id}.pdf"`);
      res.send(pdf);
    });

    // Company logo
    const logoPath = settings.logo_filename ? path.join(uploadDir, settings.logo_filename) : null;
    if (logoPath && fs.existsSync(logoPath)) {
      try { doc.image(logoPath, 60, 40, { width: 100 }); } catch(e) {}
    }

    // Header
    doc.fontSize(22).font('Helvetica-Bold').text('INVOICE', 0, 50, { align: 'right', width: 552 });
    doc.moveDown(0.3);
    const catDisplay = inv.category ? inv.category.charAt(0).toUpperCase() + inv.category.slice(1) : 'Other';
    doc.fontSize(10).font('Helvetica').fillColor('#666').text(
      catDisplay + '  ·  Non-contract item',
      0, doc.y, { align: 'right', width: 552 }
    );

    // Invoice details box (left side)
    const yStart = 110;
    doc.fillColor('#000');
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Invoice #:', 60, yStart); doc.font('Helvetica').text(inv.invoice_number || 'N/A', 140, yStart);
    doc.font('Helvetica-Bold').text('Date:', 60, yStart + 16); doc.font('Helvetica').text(inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : 'N/A', 140, yStart + 16);
    if (inv.due_date) {
      doc.font('Helvetica-Bold').text('Due Date:', 60, yStart + 32); doc.font('Helvetica').text(new Date(inv.due_date).toLocaleDateString(), 140, yStart + 32);
    }

    // Project info (right side) — includes job #, address for long-term record keeping
    let rightY = yStart;
    doc.font('Helvetica-Bold').fontSize(9).text('Project:', 340, rightY); doc.font('Helvetica').text(inv.project_name || '', 410, rightY);
    rightY += 16;
    if (inv.job_number) { doc.font('Helvetica-Bold').text('Job #:', 340, rightY); doc.font('Helvetica').text(inv.job_number, 410, rightY); rightY += 16; }
    if (inv.project_number) { doc.font('Helvetica-Bold').text('Project #:', 340, rightY); doc.font('Helvetica').text(inv.project_number, 410, rightY); rightY += 16; }
    if (inv.address) { doc.font('Helvetica-Bold').text('Address:', 340, rightY); doc.font('Helvetica').text(inv.address, 410, rightY, { width: 142 }); rightY += 16; }
    if (inv.project_owner) { doc.font('Helvetica-Bold').text('Owner:', 340, rightY); doc.font('Helvetica').text(inv.project_owner, 410, rightY); }

    // Divider
    const divY = yStart + 72;
    doc.moveTo(60, divY).lineTo(552, divY).strokeColor('#ccc').lineWidth(0.5).stroke();

    // From / To
    let curY = divY + 16;
    if (inv.contractor || settings.company_name) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#888').text('FROM', 60, curY);
      doc.fillColor('#000').font('Helvetica').text(settings.company_name || inv.contractor || '', 60, curY + 14);
      if (settings.contact_name || inv.contact_name) doc.text(settings.contact_name || inv.contact_name, 60, curY + 26);
      if (settings.contact_phone || inv.contact_phone) doc.text(settings.contact_phone || inv.contact_phone, 60, curY + 38);
      if (settings.contact_email || inv.contact_email) doc.text(settings.contact_email || inv.contact_email, 60, curY + 50);
    }
    if (inv.vendor) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#888').text('TO / PAYEE', 340, curY);
      doc.fillColor('#000').font('Helvetica').text(inv.vendor, 340, curY + 14);
    }

    // Description & amount table
    curY += 76;
    doc.moveTo(60, curY).lineTo(552, curY).strokeColor('#ccc').lineWidth(0.5).stroke();
    curY += 8;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#888');
    doc.text('DESCRIPTION', 60, curY); doc.text('AMOUNT', 440, curY, { width: 112, align: 'right' });
    curY += 18;
    doc.moveTo(60, curY).lineTo(552, curY).strokeColor('#e0e0e0').lineWidth(0.3).stroke();
    curY += 8;
    doc.font('Helvetica').fontSize(10).fillColor('#000');
    doc.text(inv.description || '', 60, curY, { width: 360 });
    const amtStr = '$' + (parseFloat(inv.amount)||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    doc.font('Helvetica-Bold').text(amtStr, 440, curY, { width: 112, align: 'right' });

    // Total box — highlighted
    curY += 40;
    doc.rect(330, curY, 222, 30).fill('#f0f7ff').stroke('#c0d8f0');
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1a365d').text('TOTAL DUE', 340, curY + 8);
    doc.text(amtStr, 440, curY + 8, { width: 102, align: 'right' });

    // Payment info
    curY += 45;
    if (connAcct) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#1d4ed8').text('PAY THIS INVOICE', 60, curY);
      curY += 14;
      doc.font('Helvetica').fontSize(9).fillColor('#333').text(
        'Pay online via ACH bank transfer at: ' + (process.env.BASE_URL || 'https://constructinv.varshyl.com'),
        60, curY, { width: 492 }
      );
      curY += 16;
    }

    // Notes
    if (inv.notes) {
      curY += 8;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#888').text('NOTES', 60, curY);
      curY += 14;
      doc.font('Helvetica').fontSize(9).fillColor('#000').text(inv.notes, 60, curY, { width: 492 });
    }

    // Footer
    doc.fontSize(8).fillColor('#999').text(
      'Generated by ConstructInvoice AI  ·  Non-contract item — not included in G702/G703 contract billing',
      60, 720, { width: 492, align: 'center' }
    );

    doc.end();
  } catch(e) {
    console.error('[GET /api/other-invoices/:id/pdf]', e.message);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// ── Serve public payment page ───────────────────────────────────────────────
app.get('/pay/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pay.html'));
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

// ── Exports for route modules ──────────────────────────────────────────────
global.__serverHelpers = {
  generatePayAppHTML,
  renderLienWaiverContent,
  generateLienDocPDF,
  generatePaymentToken,
  fetchEmail
};

module.exports = {
  generatePayAppHTML,
  renderLienWaiverContent,
  generateLienDocPDF,
  generatePaymentToken,
  fetchEmail
};

initDB()
  .then(() => app.listen(PORT, () => console.log(`Construction AI Billing running on port ${PORT}`)))
  .catch(err => {
    console.error('STARTUP FAILED:', err.message);
    console.error('DATABASE_URL set:', !!process.env.DATABASE_URL);
    process.exit(1);
  });