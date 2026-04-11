/**
 * Rate Limiting Middleware
 * Protects auth routes from brute force, pay routes from Stripe abuse,
 * and general API from hammering.
 *
 * Apply in server.js:
 *   const { authLimiter, payLimiter, apiLimiter } = require('./server/middleware/rateLimiter');
 *   app.use('/api/auth/', authLimiter);
 *   app.use('/api/pay/', payLimiter);
 *   app.use('/api/', apiLimiter);
 */
let rateLimit;
try {
  rateLimit = require('express-rate-limit');
} catch(e) {
  console.warn('express-rate-limit not installed — run: npm install express-rate-limit');
}

// Auth routes — prevent brute force (login, register, password reset)
const authLimiter = rateLimit ? rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: {
    error: 'too_many_attempts',
    message: 'Too many requests. Please try again in 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
}) : (req, res, next) => next();

// Pay page — prevent Stripe checkout abuse
const payLimiter = rateLimit ? rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: {
    error: 'too_many_requests',
    message: 'Please slow down and try again shortly.',
  },
  standardHeaders: true,
  legacyHeaders: false,
}) : (req, res, next) => next();

// General API limiter — prevent hammering
const apiLimiter = rateLimit ? rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  skip: (req) => req.path.startsWith('/api/admin'), // Admin bypasses
  message: {
    error: 'rate_limited',
    message: 'Too many requests. Please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
}) : (req, res, next) => next();

module.exports = { authLimiter, payLimiter, apiLimiter };
