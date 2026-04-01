const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

function auth(req, res, next) {
  const token = (req.headers.authorization && req.headers.authorization.split(' ')[1]) || req.query.token;
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch(e) { res.status(401).json({ error: 'Invalid token' }); }
}

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

function requireStripe(req, res, next) {
  const { stripe } = require('../services/stripe');
  if (!stripe) return res.status(503).json({ error: 'Payment features not configured. Set STRIPE_SECRET_KEY.' });
  next();
}

const { trialGate } = require('./trialGate');

module.exports = { auth, adminAuth, requireStripe, trialGate, JWT_SECRET };
