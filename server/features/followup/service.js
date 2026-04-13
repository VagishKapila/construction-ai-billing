/**
 * Payment follow-up service.
 *
 * Exported function: runFollowups()
 * Called daily by scheduler.js. Also importable for manual testing.
 *
 * Uses fetch() to call Resend API directly — no extra npm package needed,
 * consistent with the rest of the codebase.
 */
const crypto   = require('crypto');
const { pool } = require('../../../db');
const { followupEmail } = require('./templates');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL     = process.env.FROM_EMAIL || 'billing@varshyl.com';
const BASE_URL       = process.env.BASE_URL   || 'https://constructinv.varshyl.com';

// Days after payment_due_date when we send a follow-up.
// Key = normalised payment_terms string (lower-case), Value = array of day offsets.
const FOLLOWUP_DAYS = {
  'due on receipt': [3],
  'net 7':  [5, 8],
  'net 15': [9, 16],
  'net 30': [23, 37],
  'net 60': [45, 67],
};

/** Normalise payment_terms to a key we can look up. */
function normTerms(raw) {
  if (!raw) return 'net 30';
  const s = raw.toString().toLowerCase().trim();
  if (s.includes('receipt') || s === '0' || s === 'due on receipt') return 'due on receipt';
  const m = s.match(/net\s*(\d+)/);
  if (m) return `net ${m[1]}`;
  return 'net 30';
}

/** Generate a single-use URL-safe token. */
function makeToken() {
  return crypto.randomBytes(48).toString('hex');
}

/** Send a follow-up email via Resend API using fetch. */
async function sendFollowupEmail({ to, cc, subject, html }) {
  if (!RESEND_API_KEY) {
    // Dev mode — log instead of sending
    console.log(`[followup] DEV — no RESEND_API_KEY, would send to ${to}`);
    return;
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to:   Array.isArray(to) ? to : [to],
      ...(cc ? { cc: Array.isArray(cc) ? cc : [cc] } : {}),
      subject,
      html,
    }),
  });
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    throw new Error(`Resend API ${resp.status}: ${errBody}`);
  }
}

/**
 * Main entry point — run all due follow-ups.
 * @returns {{ sent: number, skipped: number, errors: string[] }}
 */
async function runFollowups() {
  const result = { sent: 0, skipped: 0, errors: [] };
  const today  = new Date();
  today.setHours(0, 0, 0, 0);

  // Fetch all pay apps that are submitted, not paid, have an owner_email,
  // and have a payment_due_date (set when submitted).
  const { rows: payApps } = await pool.query(`
    SELECT
      pa.id,
      pa.payment_status,
      pa.payment_due_date,
      pa.submitted_at,
      p.payment_terms,
      p.name       AS project_name,
      p.owner      AS owner_name,
      p.owner_email,
      u.name       AS contractor_name,
      u.email      AS contractor_email
    FROM pay_apps pa
    JOIN projects p ON p.id = pa.project_id
    JOIN users    u ON u.id = p.user_id
    WHERE pa.deleted_at IS NULL
      AND pa.submitted_at IS NOT NULL
      AND pa.payment_due_date IS NOT NULL
      AND p.owner_email IS NOT NULL AND p.owner_email <> ''
      AND pa.payment_status NOT IN ('paid', 'partial', 'processing', 'bad_debt')
  `);

  for (const pa of payApps) {
    try {
      const dueDate = new Date(pa.payment_due_date);
      dueDate.setHours(0, 0, 0, 0);
      const daysPastDue = Math.floor((today - dueDate) / 86400000);

      const terms      = normTerms(pa.payment_terms);
      const thresholds = FOLLOWUP_DAYS[terms] || FOLLOWUP_DAYS['net 30'];

      if (!thresholds.includes(daysPastDue)) {
        result.skipped++;
        continue;
      }

      const followupType = `day_${daysPastDue}`;

      // Dedup — don't send the same follow-up type twice for the same pay app
      const { rows: existing } = await pool.query(
        `SELECT id FROM payment_followups
         WHERE pay_app_id = $1 AND followup_type = $2 AND sent_at IS NOT NULL`,
        [pa.id, followupType + '_paid']
      );
      if (existing.length > 0) {
        result.skipped++;
        continue;
      }

      // Generate two one-time tokens — one for paid, one for not-yet
      const paidToken   = makeToken();
      const notYetToken = makeToken();
      const expiresAt   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      // Get current payment amount due from pay app
      const { rows: amounts } = await pool.query(
        `SELECT COALESCE(amount_due, 0) AS amount_due FROM pay_apps WHERE id = $1`,
        [pa.id]
      );
      const amountDue = Number(amounts[0]?.amount_due || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      });

      // Insert two rows — one per token/action
      await pool.query(
        `INSERT INTO payment_followups
           (pay_app_id, user_id, followup_type, scheduled_date, email_sent_to, owner_name,
            followup_token, followup_token_expires_at)
         SELECT $1, p.user_id, $2, $3, $4, $5, $6, $7
         FROM pay_apps pa2 JOIN projects p ON p.id = pa2.project_id WHERE pa2.id = $1`,
        [pa.id, followupType + '_paid',   today, pa.owner_email, pa.owner_name, paidToken,   expiresAt]
      );
      await pool.query(
        `INSERT INTO payment_followups
           (pay_app_id, user_id, followup_type, scheduled_date, email_sent_to, owner_name,
            followup_token, followup_token_expires_at)
         SELECT $1, p.user_id, $2, $3, $4, $5, $6, $7
         FROM pay_apps pa2 JOIN projects p ON p.id = pa2.project_id WHERE pa2.id = $1`,
        [pa.id, followupType + '_notyet', today, pa.owner_email, pa.owner_name, notYetToken, expiresAt]
      );

      // Build and send the email
      const dueDateFormatted = new Date(pa.payment_due_date).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      const { subject, html } = followupEmail({
        ownerName:      pa.owner_name,
        contractorName: pa.contractor_name,
        projectName:    pa.project_name,
        amount:         amountDue,
        dueDate:        dueDateFormatted,
        paidToken,
        notYetToken,
      });

      if (!RESEND_API_KEY) {
        // Dev mode — log the magic links
        console.log(`[followup] DEV — Would email ${pa.owner_email} for pay app ${pa.id}`);
        console.log(`  PAID link:    ${BASE_URL}/api/followup/${paidToken}/paid`);
        console.log(`  NOT YET link: ${BASE_URL}/api/followup/${notYetToken}/not-yet`);
      } else {
        await sendFollowupEmail({
          to:      pa.owner_email,
          cc:      pa.contractor_email,
          subject,
          html,
        });
      }

      // Mark both rows as sent
      await pool.query(
        `UPDATE payment_followups SET sent_at = NOW()
         WHERE pay_app_id = $1 AND followup_type IN ($2, $3)`,
        [pa.id, followupType + '_paid', followupType + '_notyet']
      );

      result.sent++;
    } catch (err) {
      result.errors.push(`payApp ${pa.id}: ${err.message}`);
    }
  }

  return result;
}

module.exports = { runFollowups, normTerms };
