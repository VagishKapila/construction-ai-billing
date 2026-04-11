/**
 * Feature Flags — toggle via Railway environment variables
 *
 * Usage in routes:
 *   const flags = require('../features/flags');
 *   router.use(flags.require('trust_score'));   // returns 404 if flag off
 *
 * Usage in services:
 *   const flags = require('../features/flags');
 *   if (flags.early_payment) { ... }
 *
 * To enable on Railway: set FF_TRUST_SCORE=true (string), etc.
 * Default: all new features OFF until explicitly enabled.
 */

const flags = {
  trust_score:        process.env.FF_TRUST_SCORE === 'true',
  early_payment:      process.env.FF_EARLY_PAY === 'true',
  lien_module:        process.env.FF_LIEN === 'true',
  join_code:          process.env.FF_JOIN_CODE === 'true',
  vendor_book:        process.env.FF_VENDOR_BOOK === 'true',
  sage_integration:   process.env.FF_SAGE === 'true',
  orbital_v2:         process.env.FF_ORBITAL_V2 === 'true',
  certified_mail:     process.env.FF_CERTIFIED_MAIL === 'true',
};

/**
 * Middleware factory: returns 404 if flag is off.
 * Place at router level to gate an entire route group.
 *
 * @param {string} flagName — key in the flags object above
 * @returns Express middleware
 */
flags.require = (flagName) => (req, res, next) => {
  if (!flags[flagName]) {
    return res.status(404).json({ error: 'not_enabled', message: 'Feature not available.' });
  }
  next();
};

/**
 * Check a flag value without middleware context.
 *
 * @param {string} flagName
 * @returns {boolean}
 */
flags.isEnabled = (flagName) => !!flags[flagName];

module.exports = flags;
