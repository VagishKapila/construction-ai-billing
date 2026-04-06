/**
 * ConstructInvoice AI — Express Application Setup
 *
 * Mounts all middleware and route modules.
 * In production, serves the React build from client/dist/.
 * In development, Vite dev server proxies /api to this Express server.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Security middleware (optional, graceful if not installed)
let helmet;
try { helmet = require('helmet'); } catch(e) { console.warn('helmet not installed — run: npm install helmet'); }

const app = express();

// Set trust proxy for Railway load balancer
app.set('trust proxy', 1);

// Security headers
if (helmet) app.use(helmet({ contentSecurityPolicy: false }));

// CORS
const corsOrigin = process.env.ALLOWED_ORIGIN;
if (!corsOrigin && process.env.NODE_ENV === 'production') {
  console.warn('[SECURITY] WARNING: ALLOWED_ORIGIN is not set in production.');
}
app.use(cors({ origin: corsOrigin || '*' }));

// ── Stripe webhook MUST be before JSON body parser ────────────────────────
// It needs raw body for signature verification
const webhookRoutes = require('./routes/webhook');
app.use(webhookRoutes);

// JSON body parser (skip for webhook route — already handled above)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/stripe/webhook') return next();
  express.json()(req, res, next);
});

// URL-encoded body parser (for OAuth routes)
app.use(express.urlencoded({ extended: false }));

// ── Static files ──────────────────────────────────────────────────────────
// In production, serve the React build from client/dist/
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
const publicPath = path.join(__dirname, '..', 'public');
const hasReactBuild = fs.existsSync(path.join(clientDistPath, 'index.html'));

// ── IMPORTANT: Intercept legacy routes BEFORE static middleware ───────────
// express.static(publicPath) would serve public/index.html and public/app.html
// as static files, bypassing route handlers. These middlewares catch them first.
if (hasReactBuild) {
  // Serve React SPA for root path instead of old public/index.html
  app.get('/', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });

  app.get('/app.html', (req, res) => {
    // Map old app.html query/hash params to React SPA routes
    const url = req.originalUrl;
    if (url.includes('reset='))          return res.redirect(302, url.replace('/app.html', '/reset-password'));
    if (url.includes('verified='))       return res.redirect(302, '/login?verified=1');
    if (url.includes('verify_error='))   return res.redirect(302, '/login?verify_error=1');
    if (url.includes('auth_error='))     return res.redirect(302, '/login?auth_error=' + (req.query.auth_error || ''));
    if (url.includes('google_token='))   return res.redirect(302, url.replace('/app.html', '/dashboard'));
    if (url.includes('subscription='))   return res.redirect(302, '/settings');
    if (url.includes('invite_error='))   return res.redirect(302, '/login?invite_error=1');
    // Default: send to dashboard (user is likely already logged in)
    return res.redirect(302, '/dashboard');
  });
  console.log('[Router] Legacy /app.html interceptor active — redirecting to React SPA');
}

if (hasReactBuild) {
  // Production: serve React SPA build
  app.use(express.static(clientDistPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      } else if (filePath.match(/\.(js|css|woff2?|ttf|eot|svg|png|jpg|gif|ico)$/)) {
        // Cache hashed assets for 1 year
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
  console.log('[Static] Serving React build from client/dist/');
}

// Always serve /public for legacy assets (logos, old pages, pay.html)
app.use(express.static(publicPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

// ── Request timing middleware ──────────────────────────────────────────────
const { requestTimerMiddleware } = require('./middleware/requestTimer');
app.use('/api', requestTimerMiddleware);

// ── Mount all route modules ───────────────────────────────────────────────
// Routes use full paths (/api/...) so all mount at root
// Exceptions: auth.js and oauth.js use relative paths, mounted with prefix
// admin.js uses relative paths, mounted at /api/admin

// Auth routes (relative paths — mount at /api/auth)
app.use('/api/auth', require('./routes/auth'));

// OAuth routes (relative paths — mount at /oauth)
app.use('/oauth', require('./routes/oauth'));

// Admin routes (relative paths — mount at /api/admin)
app.use('/api/admin', require('./routes/admin'));

// Extended admin routes — trial management, subscription controls (Module 2)
app.use('/api/admin', require('./routes/admin-extended'));

// QuickBooks routes (relative paths — mount at /api/quickbooks)
app.use('/api/quickbooks', require('./routes/quickbooks'));

// Trial & Subscription routes (relative paths — mount at /api/trial)
// GET /api/trial/status is public (works with or without token)
// POST /api/trial/upgrade requires auth
const { auth: trialAuth, optionalAuth } = require('./middleware/auth');
app.use('/api/trial', (req, res, next) => {
  // Apply optional auth to all trial routes (allows GET without token, POST checks in route)
  optionalAuth(req, res, next);
}, require('./routes/trial').router);

// Import auth middleware for protected routes
const { auth } = require('./middleware/auth');

// All other routes use full paths — mount at root
app.use(require('./routes/projects'));
app.use(require('./routes/payApps'));
app.use(require('./routes/sov'));
app.use(require('./routes/payments'));
app.use(require('./routes/settings'));
app.use(require('./routes/lienWaivers'));
app.use(auth, require('./routes/reports')); // Reports requires auth
app.use(require('./routes/otherInvoices'));
app.use(require('./routes/team'));
app.use(require('./routes/feedback'));
app.use(require('./routes/onboarding'));
app.use(require('./routes/ai'));

// Hub routes — Project document intake (Phase 1)
app.use(require('./routes/hub'));

// ── Emergency admin reset (standalone) ────────────────────────────────────
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
app.post('/api/admin/emergency-reset', async (req, res) => {
  const { secret, email, new_password } = req.body;
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || secret !== adminSecret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const hash = await bcrypt.hash(new_password || 'TempPass123!', 10);
    const result = await pool.query(
      'UPDATE users SET password=$1, email_verified=true WHERE email=$2 RETURNING id, email',
      [hash, email]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'Password reset successfully', user: result.rows[0] });
  } catch(e) {
    console.error('[Emergency Reset]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Config endpoint ───────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    stripeEnabled: !!process.env.STRIPE_SECRET_KEY,
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
  });
});

// ── Public pages (catch-all MUST be LAST) ─────────────────────────────────
app.use(require('./routes/publicPages'));

// ── Global error handler ──────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
