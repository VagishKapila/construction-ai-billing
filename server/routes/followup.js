/**
 * Magic link routes for payment follow-up responses.
 *
 * GET /api/followup/:token/paid     — owner clicked "Yes I Paid"
 * GET /api/followup/:token/not-yet  — owner clicked "Not Yet"
 *
 * Both routes are public (no auth — the token is the secret).
 */
const express  = require('express');
const router   = express.Router();
const { pool } = require('../../db');
const { confirmationPage } = require('../features/followup/templates');

const BASE_URL = process.env.BASE_URL || 'https://constructinv.varshyl.com';

/** Resolve a followup token and return the associated pay app + project info. */
async function resolveToken(token) {
  const { rows } = await pool.query(`
    SELECT
      pf.id                          AS followup_id,
      pf.pay_app_id,
      pf.followup_token_expires_at,
      pf.response,
      pr.name                        AS project_name,
      u.name                         AS contractor_name
    FROM payment_followups pf
    JOIN pay_apps pa ON pa.id = pf.pay_app_id
    JOIN projects pr ON pr.id = pa.project_id
    JOIN users    u  ON u.id  = pr.user_id
    WHERE pf.followup_token = $1
  `, [token]);
  return rows[0] || null;
}

// GET /api/followup/:token/paid
router.get('/api/followup/:token/paid', async (req, res) => {
  const { token } = req.params;

  try {
    const row = await resolveToken(token);

    if (!row) {
      return res.status(404).send(confirmationPage({
        status: 'invalid',
        projectName: 'your project',
        contractorName: 'your contractor',
        baseUrl: BASE_URL,
      }));
    }

    if (new Date(row.followup_token_expires_at) < new Date()) {
      return res.status(410).send(confirmationPage({
        status: 'expired',
        projectName: row.project_name,
        contractorName: row.contractor_name,
        baseUrl: BASE_URL,
      }));
    }

    // Mark follow-up as responded
    await pool.query(
      `UPDATE payment_followups SET response = 'paid', response_at = NOW() WHERE followup_token = $1`,
      [token]
    );

    // Update pay app status to 'paid' (unless already further along)
    await pool.query(
      `UPDATE pay_apps
          SET payment_status       = 'paid',
              payment_received     = TRUE,
              payment_received_at  = NOW()
       WHERE id = $1
         AND payment_status NOT IN ('partial', 'processing')`,
      [row.pay_app_id]
    );

    return res.send(confirmationPage({
      status: 'paid',
      projectName: row.project_name,
      contractorName: row.contractor_name,
      baseUrl: BASE_URL,
    }));
  } catch (err) {
    console.error('[followup] /paid error:', err);
    return res.status(500).send('Something went wrong. Please try again.');
  }
});

// GET /api/followup/:token/not-yet
router.get('/api/followup/:token/not-yet', async (req, res) => {
  const { token } = req.params;

  try {
    const row = await resolveToken(token);

    if (!row) {
      return res.status(404).send(confirmationPage({
        status: 'invalid',
        projectName: 'your project',
        contractorName: 'your contractor',
        baseUrl: BASE_URL,
      }));
    }

    // Mark follow-up as responded
    await pool.query(
      `UPDATE payment_followups SET response = 'not_yet', response_at = NOW() WHERE followup_token = $1`,
      [token]
    );

    return res.send(confirmationPage({
      status: 'not_yet',
      projectName: row.project_name,
      contractorName: row.contractor_name,
      baseUrl: BASE_URL,
    }));
  } catch (err) {
    console.error('[followup] /not-yet error:', err);
    return res.status(500).send('Something went wrong. Please try again.');
  }
});

module.exports = router;
