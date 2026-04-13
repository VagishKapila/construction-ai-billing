const { pool } = require('../../db');

/**
 * Trial gate middleware — soft-blocks create/send/generate actions
 * when the user's trial has expired and they're not on a paid plan.
 *
 * Must be placed AFTER auth middleware (needs req.user.id).
 *
 * Blocked actions (when trial expired AND not pro AND not free_override):
 * - Creating new projects
 * - Creating new pay apps
 * - Sending emails (pay app email)
 * - Generating PDFs
 * - Signing lien waivers
 * - Uploading SOV files
 *
 * Allowed even when expired:
 * - Viewing existing projects, pay apps, settings (read-only access)
 * - Logging in/out
 * - Viewing reports
 * - Accessing settings
 * - Upgrading to Pro
 */
async function trialGate(req, res, next) {
  // req.user should be set by auth middleware
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check if we've already cached this check in the current request
  if (req.user._trialGateChecked) {
    return next();
  }

  try {
    // Query user's subscription status and trial end date
    const result = await pool.query(
      `SELECT subscription_status, plan_type, trial_end_date
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const { subscription_status, plan_type, trial_end_date } = user;

    // Cache the result on req.user to avoid multiple DB hits
    req.user._trialGateChecked = true;
    req.user.subscription_status = subscription_status;
    req.user.plan_type = plan_type;
    req.user.trial_end_date = trial_end_date;

    // Logic:
    // 1. If subscription_status is 'active' (pro user) → pass
    if (subscription_status === 'active') {
      return next();
    }

    // 2. If subscription_status is 'free_override' → pass
    if (subscription_status === 'free_override') {
      return next();
    }

    // 3. If trial_end_date is in the future → pass (trial still active)
    if (trial_end_date && new Date(trial_end_date) > new Date()) {
      return next();
    }

    // 4. Otherwise (trial expired, not pro, not free_override) → block
    return res.status(403).json({
      error: 'Trial expired',
      code: 'TRIAL_EXPIRED',
      message: 'Your 90-day trial has ended. Upgrade to Pro ($64/month) to continue.',
      upgrade_url: '/settings#subscription',
    });
  } catch (error) {
    console.error('trialGate middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { trialGate };
