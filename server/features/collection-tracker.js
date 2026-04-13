/**
 * Collection Intelligence Service — Module 8 Phase 4
 * AI-powered follow-up generation, payer pattern analysis, and cash flow tracking
 *
 * Functions:
 * - getOutstandingCollections(db, userId) — all unpaid pay apps with days overdue
 * - calculateOverdue(payApp) — estimate days overdue from payment_due_date or payment_terms
 * - flagOverdue(db, userId) — filter to only overdue items, sorted by severity
 * - generateFollowUpDraft(payApp) — call Claude API to generate follow-up email
 * - recordFollowUp(db, payAppId, userId, followupType, draftText) — log follow-up
 */

const { pool } = require('../../db');

/**
 * Get all outstanding pay apps (unpaid/partial) across user's projects
 * Includes days overdue calculation and urgency categorization
 */
async function getOutstandingCollections(userId) {
  try {
    const result = await pool.query(`
      SELECT
        pa.id,
        pa.app_number as pay_app_number,
        pa.amount_due,
        pa.amount_paid,
        pa.payment_due_date,
        pa.payment_status,
        pa.bad_debt,
        pa.submitted_at,
        p.name as project_name,
        p.id as project_id,
        p.owner_name,
        p.owner_email,
        p.default_payment_terms,
        CASE
          WHEN pa.payment_due_date < NOW() THEN
            EXTRACT(DAY FROM NOW() - pa.payment_due_date)::INTEGER
          ELSE 0
        END as days_overdue
      FROM pay_apps pa
      JOIN projects p ON pa.project_id = p.id
      WHERE p.user_id = $1
        AND pa.submitted_at IS NOT NULL
        AND (pa.payment_status IS NULL OR pa.payment_status NOT IN ('paid'))
        AND (pa.bad_debt IS NULL OR pa.bad_debt = FALSE)
      ORDER BY
        CASE WHEN pa.payment_due_date < NOW() THEN 0 ELSE 1 END,
        pa.payment_due_date ASC
    `, [userId]);

    return result.rows;
  } catch (e) {
    console.error('[Collection Tracker] getOutstandingCollections error:', e.message);
    throw e;
  }
}

/**
 * Calculate days overdue for a pay app
 * If payment_due_date exists, use it; otherwise estimate from submitted_at + payment_terms
 * Returns: { daysOverdue, isDue, urgency }
 */
function calculateOverdue(payApp) {
  if (!payApp) return { daysOverdue: 0, isDue: false, urgency: 'current' };

  let daysOverdue = 0;
  const now = new Date();

  if (payApp.payment_due_date) {
    const dueDate = new Date(payApp.payment_due_date);
    if (now > dueDate) {
      daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
    }
  } else if (payApp.submitted_at) {
    // Estimate from payment_terms (default "Net 30")
    const terms = payApp.default_payment_terms || 'Net 30';
    const daysMatch = terms.match(/\d+/);
    const daysTerm = daysMatch ? parseInt(daysMatch[0]) : 30;

    const submittedDate = new Date(payApp.submitted_at);
    const estimatedDueDate = new Date(submittedDate.getTime() + daysTerm * 24 * 60 * 60 * 1000);

    if (now > estimatedDueDate) {
      daysOverdue = Math.floor((now - estimatedDueDate) / (1000 * 60 * 60 * 24));
    }
  }

  const isDue = daysOverdue > 0;
  let urgency = 'current';
  if (daysOverdue >= 60) urgency = 'critical';
  else if (daysOverdue >= 31) urgency = 'seriously_late';
  else if (daysOverdue >= 15) urgency = 'late';
  else if (daysOverdue > 0) urgency = 'early_overdue';

  return { daysOverdue, isDue, urgency };
}

/**
 * Get only overdue items, sorted by severity (most overdue first)
 */
async function flagOverdue(userId) {
  const outstanding = await getOutstandingCollections(userId);
  const overdue = outstanding
    .map(item => ({
      ...item,
      ...calculateOverdue(item),
    }))
    .filter(item => item.isDue)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  return overdue;
}

/**
 * Generate an AI follow-up email draft using Claude Haiku
 * Returns the draft text (does NOT send automatically)
 *
 * @param {Object} payApp - pay app record { app_number, amount_due, project_name, owner_name, days_overdue, etc }
 * @returns {Promise<string>} Follow-up email text (under 150 words)
 */
async function generateFollowUpDraft(payApp) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  if (!payApp || !payApp.amount_due || !payApp.app_number) {
    throw new Error('Invalid pay app data');
  }

  try {
    const daysOverdue = payApp.days_overdue || 0;
    const formatMoney = (n) => `$${parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    let tone = 'professional and friendly';
    if (daysOverdue >= 60) {
      tone = 'firm and professional';
    } else if (daysOverdue >= 30) {
      tone = 'professional with some urgency';
    }

    const prompt = `Write a professional follow-up email to collect payment on a construction invoice.

Invoice Details:
- Invoice #: PA #${payApp.app_number}
- Amount Due: ${formatMoney(payApp.amount_due)}
- Project: ${payApp.project_name}
- Days Overdue: ${daysOverdue}
- Contractor: ${payApp.owner_name}

Email Requirements:
1. Tone: ${tone}
2. Length: Keep it under 150 words
3. Include the exact amount due and invoice number
4. Polite but professional
5. Include a call-to-action (request payment or prompt to discuss)
6. Do NOT include specific payment instructions or links

Start the email directly without salutation (no "Dear..." — just begin the body).`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [
          { role: 'user', content: prompt }
        ],
      }),
    });

    const aiData = await aiRes.json();
    if (aiData.error) {
      throw new Error(aiData.error.message || 'Claude API error');
    }

    const draft = aiData.content?.[0]?.text || '';
    if (!draft) {
      throw new Error('No response from Claude API');
    }

    return draft.trim();
  } catch (e) {
    console.error('[Collection Tracker] generateFollowUpDraft error:', e.message);
    throw e;
  }
}

/**
 * Record a follow-up in payment_followups table
 * Stores the draft text and follow-up type for audit trail
 *
 * @param {number} payAppId
 * @param {number} userId
 * @param {string} followupType - 'ai_draft' | 'email_sent' | 'phone_call' | 'note'
 * @param {string} draftText - the generated or user-provided text
 * @returns {Promise<Object>} inserted followup record
 */
async function recordFollowUp(payAppId, userId, followupType, draftText) {
  try {
    // Verify pay app belongs to user
    const payAppCheck = await pool.query(`
      SELECT pa.id
      FROM pay_apps pa
      JOIN projects p ON pa.project_id = p.id
      WHERE pa.id = $1 AND p.user_id = $2
    `, [payAppId, userId]);

    if (payAppCheck.rows.length === 0) {
      throw new Error('Pay app not found or access denied');
    }

    // Insert follow-up record
    const result = await pool.query(`
      INSERT INTO payment_followups(
        pay_app_id,
        user_id,
        followup_type,
        notes,
        created_at
      )
      VALUES($1, $2, $3, $4, NOW())
      RETURNING id, pay_app_id, user_id, followup_type, notes, created_at
    `, [payAppId, userId, followupType, draftText || null]);

    return result.rows[0];
  } catch (e) {
    console.error('[Collection Tracker] recordFollowUp error:', e.message);
    throw e;
  }
}

module.exports = {
  getOutstandingCollections,
  calculateOverdue,
  flagOverdue,
  generateFollowUpDraft,
  recordFollowUp,
};
