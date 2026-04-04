const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { pool } = require('../lib/db');
const { JWT_SECRET } = require('../middleware/auth');

// ── OAuth 2.0 Authorization Server — for Custom GPT / MCP token flow ────────
// Allows external apps (OpenAI Custom GPT, Claude plugins) to get user tokens
// via standard OAuth Authorization Code Flow without the user copying JWT tokens.

const OAUTH_CLIENTS = (() => {
  try { return JSON.parse(process.env.OAUTH_CLIENTS || '[]'); } catch { return []; }
})();
// In-memory auth code store — short-lived (10 min). Fine for low-volume use.
const oauthCodes = new Map(); // code -> {user_id, client_id, expires}

router.get('/authorize', async (req, res) => {
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

router.post('/authorize-confirm', express.urlencoded({ extended: false }), async (req, res) => {
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

router.post('/token', express.json(), express.urlencoded({ extended: false }), async (req, res) => {
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

module.exports = router;
