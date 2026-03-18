require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool, initDB } = require('./db');

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

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB max per file
});
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
    res.status(500).json({error:e.message});
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
  } catch(e) { res.status(500).json({error:e.message}); }
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
  const fromEmail = process.env.FROM_EMAIL || 'noreply@constructai.app';
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
    await fetch(isResend ? 'https://api.resend.com/emails' : 'https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', Authorization:`Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
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
  if (error || !code) return res.redirect('/?auth_error=google_denied');
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
      if (user.blocked) return res.redirect('/?auth_error=account_blocked');
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
    const tok = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    // Redirect back to app with token in URL hash (frontend picks it up)
    res.redirect(`/?google_token=${tok}`);
  } catch(e) {
    console.error('Google OAuth error:', e.message);
    res.redirect('/?auth_error=google_failed');
  }
});

// ── Email verification ──────────────────────────────────────────────────────
app.get('/api/auth/verify/:token', async (req, res) => {
  try {
    const r = await pool.query(
      'UPDATE users SET email_verified=TRUE, verification_token=NULL WHERE verification_token=$1 RETURNING id,name,email',
      [req.params.token]
    );
    if (!r.rows[0]) return res.redirect('/?verify_error=invalid_token');
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
  } catch(e) { res.status(500).json({ error: e.message }); }
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
    `, [req.user.id]);
    res.json(r.rows[0] || { total_billed: 0, total_retainage: 0 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PROJECTS
app.get('/api/projects', auth, async (req,res) => {
  const r = await pool.query('SELECT * FROM projects WHERE user_id=$1 ORDER BY created_at DESC',[req.user.id]);
  res.json(r.rows);
});

app.post('/api/projects', auth, async (req,res) => {
  const {name,number,owner,contractor,architect,contact,contact_name,contact_phone,contact_email,building_area,original_contract,contract_date,est_date,default_retainage} = req.body;
  const retPct = (default_retainage !== undefined && default_retainage !== null) ? parseFloat(default_retainage) : 10;
  const r = await pool.query(
    'INSERT INTO projects(user_id,name,number,owner,contractor,architect,contact,contact_name,contact_phone,contact_email,building_area,original_contract,contract_date,est_date,default_retainage) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',
    [req.user.id,name,number,owner,contractor,architect,contact,contact_name,contact_phone,contact_email,building_area,original_contract,contract_date,est_date,retPct]
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
  const r = await pool.query('SELECT * FROM sov_lines WHERE project_id=$1 ORDER BY sort_order',[req.params.id]);
  res.json(r.rows);
});

// PAY APPS
app.get('/api/projects/:id/payapps', auth, async (req,res) => {
  const r = await pool.query('SELECT * FROM pay_apps WHERE project_id=$1 ORDER BY app_number',[req.params.id]);
  res.json(r.rows);
});

app.post('/api/projects/:id/payapps', auth, async (req,res) => {
  const {period_label,period_start,period_end,app_number} = req.body;
  const pa = await pool.query(
    'INSERT INTO pay_apps(project_id,app_number,period_label,period_start,period_end) VALUES($1,$2,$3,$4,$5) RETURNING *',
    [req.params.id,app_number,period_label,period_start,period_end]
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
    'SELECT pa.*,p.name as project_name,p.owner,p.contractor,p.architect,p.contact,p.contact_name,p.contact_phone,p.contact_email,p.original_contract,p.number as project_number,p.building_area,p.id as project_id,p.contract_date FROM pay_apps pa JOIN projects p ON p.id=pa.project_id WHERE pa.id=$1 AND p.user_id=$2',
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
  if (status === 'submitted') await logEvent(req.user.id, 'payapp_submitted', { pay_app_id: parseInt(req.params.id) });
  res.json(r.rows[0]);
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
  const workbook = XLSX.readFile(filePath);

  // Prefer Summary sheet
  let sheetName = workbook.SheetNames[0];
  for (const name of workbook.SheetNames) {
    if (/summary/i.test(name)) { sheetName = name; break; }
  }

  const worksheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  const nCols = json.reduce((m, r) => Math.max(m, r.length), 0);

  // ── Step 1: Scan first 30 rows for a header row with "Total" / "Description" ─
  let headerRowIdx = -1, iAmt = -1, iDesc = -1, iItem = -1;

  for (let ri = 0; ri < Math.min(json.length, 30); ri++) {
    const row = json[ri];
    let fAmt = -1, fDesc = -1, fItem = -1;
    for (let ci = 0; ci < row.length; ci++) {
      const h = String(row[ci]||'').trim();
      if (!h) continue;
      // "Total" wins highest priority — it's the clearest signal
      if (/^(total|scheduled\s*value|amount|cost|value|price|bid\s*total|contract\s*value)/i.test(h) && fAmt < 0) fAmt = ci;
      if (/^(description|scope|work|item\s*desc|name|trade|section\s*desc)/i.test(h) && fDesc < 0) fDesc = ci;
      if (/^(item\s*#?|sect(ion)?|no\.?|code|csi)/i.test(h) && fItem < 0) fItem = ci;
    }
    if (fAmt >= 0 || fDesc >= 0) {
      headerRowIdx = ri;
      if (fAmt  >= 0) iAmt  = fAmt;
      if (fDesc >= 0) iDesc = fDesc;
      if (fItem >= 0) iItem = fItem;
      break;
    }
  }

  // ── Step 2: Scoring fallback for any column still unresolved ────────────────
  const descScore = new Array(nCols).fill(0);
  const amtScore  = new Array(nCols).fill(0);

  for (const row of json) {
    for (let ci = 0; ci < row.length; ci++) {
      const cell = String(row[ci]||'').trim();
      if (!cell || cell.length < 2) continue;
      const n = parseFloat(cell.replace(/[$,\s]/g,''));
      if (!isNaN(n) && n > 50) {
        amtScore[ci]++;
      } else if (cell.length > 5 && (isNaN(n) || /[a-zA-Z]/.test(cell))) {
        descScore[ci]++;
      }
    }
  }

  if (iDesc < 0) {
    const maxD = Math.max(...descScore);
    iDesc = maxD > 0 ? descScore.indexOf(maxD) : 1;
  }
  if (iAmt < 0) {
    // Rightmost highest-count column wins — totals are almost always rightmost
    let best = 0;
    for (let ci = 0; ci < nCols; ci++) {
      if (ci === iDesc) continue;
      if (amtScore[ci] >= best) { best = amtScore[ci]; iAmt = ci; }
    }
  }
  if (iItem < 0) {
    iItem = iDesc > 0 ? iDesc - 1 : 0;
    if (iItem === iAmt) iItem = 0;
  }

  if (iAmt < 0) {
    return { headers: ['Item #','Description','Scheduled Value'], sheetName, allRows: [], parentRows: [], iItem, iDesc, iAmt };
  }

  // ── Step 3: Parse data rows — skip summary/total rows, collect line items ───
  const isSummary = (desc, itemId) =>
    /^(total|subtotal|grand\s*total|total\s+project|total\s+bid|total\s+cost)/i.test(desc) ||
    /^(total|subtotal|grand\s*total)$/i.test(itemId);

  const isHeaderLabel = (desc) =>
    /^(section|description|item|scope|no\.|#|trade|work\s*item|csi)/i.test(desc);

  const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
  const allRows = [], parentRows = [];
  const seen = new Set();

  for (let ri = startRow; ri < json.length; ri++) {
    const row    = json[ri];
    const desc   = String(row[iDesc]||'').trim();
    const itemId = String(row[iItem]||'').trim();
    const rawAmt = String(row[iAmt] ||'').replace(/[$,\s]/g,'');
    const amt    = Math.round(parseFloat(rawAmt));

    if (!desc || desc.length < 2) continue;
    if (isHeaderLabel(desc)) continue;
    if (isSummary(desc, itemId)) continue;  // skip summary rows — continue (Fee may follow)
    if (isNaN(amt) || amt <= 0) continue;   // skip "By Others", blank amounts

    const key = desc.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // isParent: ends-in-000 codes, short alpha codes (GC/GL), blank code, or 4-6 digit proposal codes
    const isParent = /000$/.test(itemId) || /^[A-Z]{1,5}$/.test(itemId)
                   || itemId === '' || /^\d{4,6}$/.test(itemId);
    const rowObj = { item_id: itemId, description: desc, scheduled_value: amt, is_parent: isParent };
    allRows.push(rowObj);
    if (isParent) parentRows.push(rowObj);
  }

  return { headers: ['Item #','Description','Scheduled Value'], sheetName, allRows, parentRows, iItem, iDesc, iAmt };
}

// ── Node.js PDF/DOCX SOV parser (replaces Python parse_sov.py) ─────────────────
// Parses contractor estimate PDFs and Word docs into line items.
// Uses pdf-parse (PDF) and mammoth (DOCX) — pure JS, no Python needed.

const SKIP_RE = /^(\*|•|·|–|—|-{2,})|^(subtotal|total|tax|overhead|company overhead|balance due|amount paid|terms|signature|page \d|note[:\s]|excludes|it is an honor|we thank|sincerely|dear |http|www\.)/i;
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
  const merged = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const isJustDollarAmt = /^\$[\d,]+(?:\.\d{1,2})?$/.test(line);
    if (isJustDollarAmt && merged.length > 0) {
      const prev = merged[merged.length - 1];
      // Only merge if the previous line has no amount yet (avoid double-merging)
      if (!extractAmounts(prev).length) {
        merged[merged.length - 1] = prev + ' ' + line;
        continue;
      }
    }
    merged.push(line);
  }

  const rows = [];
  const seen = new Set();
  let counter = 1000;
  for (const raw of merged) {
    const line = raw.trim();
    if (line.length < 5) continue;
    if (SKIP_RE.test(line)) continue;
    if (SKIP_META_RE.test(line)) continue;
    const amounts = extractAmounts(line);
    if (!amounts.length) continue;
    const total = amounts[amounts.length - 1];
    if (total <= 0) continue;
    // Description = everything before the amount (strip trailing $X,XXX or bare X,XXX)
    let desc = cleanDesc(
      line.replace(/\s*\$[\d,]+(?:\.\d{1,2})?.*$/, '')
          .replace(/\s+\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\s*$/, '')
          .trim()
    );
    if (desc.length < 4 || /^[\d\s.\-]+$/.test(desc)) continue;
    if (SKIP_RE.test(desc)) continue;
    const key = desc.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ item_id: String(counter), description: desc, scheduled_value: Math.round(total * 100) / 100 });
    counter += 1000;
  }
  return rows;
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
    const tableRows = rowsFromLines(tableCells);
    if (tableRows.length > 0) return tableRows;
    // Fallback: plain text lines
    return rowsFromLines(lines);
  }
  return [];
}

app.post('/api/sov/parse', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const cleanup = () => { try { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch(_){} };
  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    let result;

    if (ext === '.pdf' || ext === '.docx' || ext === '.doc') {
      // Node.js parser for PDFs and Word docs (no Python dependency)
      const rows = await parseSOVFromText(req.file.path, ext);
      if (!rows || rows.length === 0) {
        cleanup();
        return res.status(422).json({ error: 'No line items with dollar amounts could be extracted from this file. This may be a scanned/image PDF. Please try uploading an Excel (.xlsx) or Word (.docx) version instead.' });
      }
      result = {
        rows, all_rows: rows,
        row_count: rows.length, total_rows: rows.length,
        filename: req.file.originalname,
        sheet_used: ext.replace('.','').toUpperCase()
      };
    } else {
      // Existing Node/XLSX parser for .xlsx/.xls/.csv
      const parsed = parseSOVFile(req.file.path);
      result = {
        headers:    parsed.headers,
        detected:   { item: parsed.iItem, desc: parsed.iDesc, amt: parsed.iAmt },
        all_rows:   parsed.allRows,
        rows:       parsed.parentRows,
        row_count:  parsed.parentRows.length,
        total_rows: parsed.allRows.length,
        filename:   req.file.originalname,
        sheet_used: parsed.sheetName
      };
    }

    cleanup();
    res.json(result);
  } catch(e) {
    cleanup();
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/projects/:id/sov/uploads', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM sov_uploads WHERE project_id=$1 ORDER BY uploaded_at DESC',[req.params.id]);
  res.json(r.rows);
});

// PDF
app.get('/api/payapps/:id/pdf', async (req,res) => {
  const token = req.query.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  let decoded;
  try { decoded = jwt.verify(token, JWT_SECRET); } catch(e) { return res.status(401).json({error:'Invalid token'}); }

  const paRes = await pool.query(
    'SELECT pa.*,p.name as pname,p.owner,p.contractor,p.architect,p.original_contract,p.number as pnum FROM pay_apps pa JOIN projects p ON p.id=pa.project_id WHERE pa.id=$1 AND p.user_id=$2',
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

  let tComp=0,tRet=0,tThis=0,tPrev=0;
  lines.rows.forEach(r=>{
    const sv=parseFloat(r.scheduled_value);
    const prev=sv*parseFloat(r.prev_pct)/100;
    const thisPer=sv*parseFloat(r.this_pct)/100;
    const comp=prev+thisPer+parseFloat(r.stored_materials||0);
    tPrev+=prev; tThis+=thisPer; tComp+=comp;
    tRet+=comp*parseFloat(r.retainage_pct)/100;
  });
  const tCO=cos.rows.reduce((s,c)=>s+parseFloat(c.amount||0),0);
  const contract=parseFloat(pa.original_contract)+tCO;
  const earned=tComp-tRet;
  const due=Math.max(0,earned-tPrev);

  const doc=new PDFDocument({size:'LETTER',margin:45});
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="PayApp_${pa.app_number}_${(pa.pname||'').replace(/\s+/g,'_')}.pdf"`);
  doc.pipe(res);

  doc.fontSize(15).font('Helvetica-Bold').text('AIA Document G702',{align:'center'});
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
    ['G.','Less Previous Certificates for Payment',fmt(tPrev)],
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
  doc.fontSize(13).font('Helvetica-Bold').text('AIA Document G703 - Continuation Sheet',{align:'center'});
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
  doc.end();
});


// COMPANY SETTINGS
app.get('/api/settings', auth, async (req,res) => {
  const r = await pool.query('SELECT * FROM company_settings WHERE user_id=$1',[req.user.id]);
  res.json(r.rows[0]||{});
});

app.post('/api/settings', auth, async (req,res) => {
  const {company_name,default_payment_terms,default_retainage,contact_name,contact_phone,contact_email} = req.body;
  const r = await pool.query(
    `INSERT INTO company_settings(user_id,company_name,default_payment_terms,default_retainage,contact_name,contact_phone,contact_email)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(user_id) DO UPDATE SET
       company_name=EXCLUDED.company_name,
       default_payment_terms=EXCLUDED.default_payment_terms,
       default_retainage=EXCLUDED.default_retainage,
       contact_name=EXCLUDED.contact_name,
       contact_phone=EXCLUDED.contact_phone,
       contact_email=EXCLUDED.contact_email,
       updated_at=NOW()
     RETURNING *`,
    [req.user.id,company_name,default_payment_terms||'Due on receipt',default_retainage||10,contact_name||null,contact_phone||null,contact_email||null]
  );
  res.json(r.rows[0]);
});

app.post('/api/settings/logo', auth, upload.single('file'), async (req,res) => {
  if(!req.file) return res.status(400).json({error:'No file'});
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
    const admins = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    if (!admins.includes(user.email.toLowerCase()) && admins[0] !== '') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.user = user;
    next();
  } catch(e) { res.status(401).json({ error: 'Invalid token' }); }
}

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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/errors', adminAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT event, meta, created_at FROM analytics_events WHERE event IN ('server_error','login_failed') ORDER BY created_at DESC LIMIT 100`
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SUPER ADMIN: User management ───────────────────────────────────────────
app.post('/api/admin/users/:id/block', adminAuth, async (req, res) => {
  const { reason } = req.body;
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

app.delete('/api/admin/users/:id', adminAuth, async (req, res) => {
  // Cascade deletes all projects/payapps via FK ON DELETE CASCADE
  const user = (await pool.query('SELECT email FROM users WHERE id=$1', [req.params.id])).rows[0];
  if (!user) return res.status(404).json({ error: 'User not found' });
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Weekly insight summary ──────────────────────────────────────────────────
app.get('/api/admin/weekly-insight', adminAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not set' });
  // Reuse the /ask endpoint logic with a pre-built weekly question
  req.body = { question: 'Give me a complete weekly business summary. What is growing, what is slowing, what needs my attention, and what is one thing I should do this week to improve the product or grow the user base? Format as clear sections.' };
  return require('./server').handleAdminAsk ? require('./server').handleAdminAsk(req, res) : res.redirect('/api/admin/ask');
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

initDB()
  .then(() => app.listen(PORT, () => console.log(`Construction AI Billing running on port ${PORT}`)))
  .catch(err => {
    console.error('STARTUP FAILED:', err.message);
    console.error('DATABASE_URL set:', !!process.env.DATABASE_URL);
    process.exit(1);
  });