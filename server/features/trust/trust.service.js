'use strict';
const { pool: db } = require('../../../db');

const MAX_SCORE = 763; // NEVER CHANGE

const TIERS = [
  { name: 'platinum', min: 687, max: 763, color: '#7c3aed', bg: '#f5f3ff', label: 'Platinum' },
  { name: 'gold',     min: 534, max: 686, color: '#d97706', bg: '#fef9c3', label: 'Gold' },
  { name: 'silver',   min: 381, max: 533, color: '#64748b', bg: '#f1f5f9', label: 'Silver' },
  { name: 'bronze',   min: 229, max: 380, color: '#ea580c', bg: '#fef3c7', label: 'Bronze' },
  { name: 'review',   min: 0,   max: 228, color: '#dc2626', bg: '#fef2f2', label: 'Under Review' },
];

const SCORE_EVENTS = {
  approved:       +15,
  rejected:       -20,
  on_time:        +10,
  late_submission: -5,
  first_upload:   +25,
};

function getTier(score) {
  return TIERS.find(t => score >= t.min && score <= t.max) || TIERS[TIERS.length - 1];
}

const trustService = {
  MAX_SCORE,
  getTier,

  async getOrCreate(projectId, vendorEmail) {
    const existing = await db.query(
      'SELECT * FROM vendor_trust_scores WHERE project_id = $1 ORDER BY id DESC LIMIT 1',
      [projectId]
    );
    if (existing.rows[0]) return existing.rows[0];
    const result = await db.query(
      `INSERT INTO vendor_trust_scores (project_id, score, tier, vendor_email)
       VALUES ($1, 500, 'silver', $2) RETURNING *`,
      [projectId, vendorEmail || null]
    );
    return result.rows[0];
  },

  async applyEvent(trustScoreId, eventType, uploadId, rejectionNote) {
    const current = await db.query('SELECT * FROM vendor_trust_scores WHERE id = $1', [trustScoreId]);
    if (!current.rows[0]) throw new Error('Trust score not found: ' + trustScoreId);

    const delta = SCORE_EVENTS[eventType] || 0;
    const newScore = Math.max(0, Math.min(MAX_SCORE, current.rows[0].score + delta));
    const tier = getTier(newScore);

    let rejectionCategory = null;
    let coachingNote = null;

    if (eventType === 'rejected' && rejectionNote) {
      const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
      if (ANTHROPIC_API_KEY) {
        try {
          const Anthropic = require('@anthropic-ai/sdk');
          const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
          const msg = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            messages: [{
              role: 'user',
              content: `Categorize this construction invoice rejection: "${rejectionNote}"\nReturn ONLY JSON: { "category": "missing_retention|missing_lien_waiver|over_budget|double_billing|insurance_expired|format_error|other", "coachingNote": "one sentence" }`
            }]
          });
          const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '{}';
          const match = text.match(/\{[\s\S]*?\}/);
          if (match) {
            const p = JSON.parse(match[0]);
            rejectionCategory = p.category || 'other';
            coachingNote = p.coachingNote || null;
          }
        } catch(e) { rejectionCategory = 'other'; }
      } else {
        rejectionCategory = 'other';
        coachingNote = 'Please review the rejection reason and resubmit with the correct documents.';
      }
    }

    await db.query(
      'UPDATE vendor_trust_scores SET score = $1, tier = $2, updated_at = NOW() WHERE id = $3',
      [newScore, tier.name, trustScoreId]
    );

    await db.query(
      `INSERT INTO vendor_trust_events (vendor_trust_score_id, event_type, score_delta, score_after, rejection_category, coaching_note, upload_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [trustScoreId, eventType, delta, newScore, rejectionCategory, coachingNote, uploadId || null]
    );

    return { score: newScore, tier: tier.name, tier_info: tier, delta, rejection_category: rejectionCategory, coaching_note: coachingNote };
  },

  async getHistory(trustScoreId) {
    const result = await db.query(
      'SELECT * FROM vendor_trust_events WHERE vendor_trust_score_id = $1 ORDER BY created_at DESC LIMIT 20',
      [trustScoreId]
    );
    return result.rows;
  }
};

module.exports = trustService;
