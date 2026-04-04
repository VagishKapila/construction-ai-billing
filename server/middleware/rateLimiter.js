// Rate limiting on auth endpoints

let rateLimit;
try {
  rateLimit = require('express-rate-limit');
} catch(e) {
  console.warn('express-rate-limit not installed — run: npm install express-rate-limit');
}

const authLimiter = rateLimit ? rateLimit({
  windowMs: 60 * 1000,       // 1 minute window
  max: 10,                    // max 10 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a minute and try again.' }
}) : (req, res, next) => next(); // no-op if package not installed yet

module.exports = { authLimiter };
