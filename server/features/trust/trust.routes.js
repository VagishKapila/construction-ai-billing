'use strict';
const express = require('express');
const router = express.Router();
const { auth } = require('../../../server/middleware/auth');
const { pool: db } = require('../../../db');
const trustService = require('./trust.service');

// GET /api/trust/:vendorEmail — look up trust score by vendor email
// Note: vendor_email column was dropped in Hub v2 migration — lookup via users table join
router.get('/api/trust/:vendorEmail', auth, async (req, res) => {
  try {
    const vendorEmail = req.params.vendorEmail;
    // Find vendor user by email first, then look up trust score by vendor_user_id
    const userResult = await db.query('SELECT id FROM users WHERE email = $1', [vendorEmail]);
    const vendorUserId = userResult.rows[0]?.id;

    let score = null;
    if (vendorUserId) {
      const result = await db.query(
        'SELECT * FROM vendor_trust_scores WHERE vendor_user_id = $1 ORDER BY id DESC LIMIT 1',
        [vendorUserId]
      );
      score = result.rows[0];
    }

    if (!score) {
      // No score on file — return default silver/500
      return res.json({ data: { score: 500, tier: 'silver', max_score: trustService.MAX_SCORE }, error: null });
    }
    const tier = trustService.getTier(score.score);
    res.json({ data: { ...score, max_score: trustService.MAX_SCORE, tier_info: tier }, error: null });
  } catch (err) {
    console.error('[Trust] get error:', err);
    res.status(500).json({ data: null, error: 'Failed to get trust score' });
  }
});

// POST /api/trust/event
router.post('/api/trust/event', auth, async (req, res) => {
  try {
    const { trust_score_id, event_type, upload_id, rejection_note } = req.body;
    if (!trust_score_id || !event_type) {
      return res.status(400).json({ data: null, error: 'trust_score_id and event_type required' });
    }
    const result = await trustService.applyEvent(parseInt(trust_score_id), event_type, upload_id, rejection_note);
    res.json({ data: result, error: null });
  } catch (err) {
    console.error('[Trust] event error:', err);
    res.status(500).json({ data: null, error: 'Failed to record trust event' });
  }
});

// GET /api/trust/history/:trustScoreId
router.get('/api/trust/history/:trustScoreId', auth, async (req, res) => {
  try {
    const history = await trustService.getHistory(parseInt(req.params.trustScoreId));
    res.json({ data: history, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: 'Failed to get trust history' });
  }
});

// GET /api/trust/score/:projectId — get trust score for a project
router.get('/api/trust/score/:projectId', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM vendor_trust_scores WHERE project_id = $1 ORDER BY id DESC LIMIT 1',
      [parseInt(req.params.projectId)]
    );
    if (!result.rows[0]) {
      return res.json({ data: { score: 500, tier: 'silver', max_score: trustService.MAX_SCORE }, error: null });
    }
    const tier = trustService.getTier(result.rows[0].score);
    res.json({ data: { ...result.rows[0], max_score: trustService.MAX_SCORE, tier_info: tier }, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: 'Failed to get score' });
  }
});

module.exports = router;
