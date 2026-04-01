const express = require('express');
const path = require('path');
const router = express.Router();

// ── Serve public payment page ───────────────────────────────────────────────
router.get('/pay/:token', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public', 'pay.html'));
});

// ── Catch-all: serve index.html for unknown routes ────────────────────────
router.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public', 'index.html'));
});

module.exports = router;
