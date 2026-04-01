const express = require('express');
const router = express.Router();

const { pool } = require('../../db');
const { auth } = require('../middleware/auth');
const { logEvent } = require('../lib/logEvent');

// POST /api/onboarding/complete
router.post('/api/onboarding/complete', auth, async (req, res) => {
  try {
    await pool.query('UPDATE users SET has_completed_onboarding = TRUE WHERE id=$1', [req.user.id]);
    await logEvent(req.user.id, 'onboarding_completed', {});
    res.json({ ok: true });
  } catch(e) {
    console.error('[API Error]', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/onboarding/reset
router.post('/api/onboarding/reset', auth, async (req, res) => {
  try {
    await pool.query('UPDATE users SET has_completed_onboarding = FALSE WHERE id=$1', [req.user.id]);
    res.json({ ok: true });
  } catch(e) {
    console.error('[API Error]', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/onboarding/status
router.get('/api/onboarding/status', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT has_completed_onboarding FROM users WHERE id=$1', [req.user.id]);
    res.json({ has_completed_onboarding: r.rows[0]?.has_completed_onboarding || false });
  } catch(e) {
    console.error('[API Error]', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
