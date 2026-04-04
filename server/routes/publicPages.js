const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Detect whether React SPA build exists (built during Railway deploy)
const clientDistIndex = path.join(__dirname, '../../client/dist/index.html');
const hasReactBuild = fs.existsSync(clientDistIndex);
if (hasReactBuild) {
  console.log('[Router] React SPA build detected — serving Rev 2 UI');
} else {
  console.log('[Router] No React build — serving legacy public/index.html');
}

// ── Serve public payment page (always from public/ — not part of React SPA) ──
router.get('/pay/:token', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public', 'pay.html'));
});

// ── Legacy app.html — redirect to React SPA if build exists ───────────────
router.get('/app.html', (req, res) => {
  if (hasReactBuild) {
    // Preserve query params (e.g. ?reset=TOKEN, ?google_token=TOKEN)
    const query = req.originalUrl.split('?')[1];
    const redirect = query ? `/login?${query}` : '/dashboard';
    return res.redirect(302, redirect);
  }
  res.sendFile(path.join(__dirname, '../../public', 'app.html'));
});

// ── Catch-all: serve React SPA or legacy index.html ─────────────────────────
router.get('*', (req, res) => {
  // Skip API routes and static assets (shouldn't reach here, but safety check)
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (hasReactBuild) {
    // React SPA: serve index.html for all routes — React Router handles routing
    return res.sendFile(clientDistIndex);
  }

  // Legacy fallback
  res.sendFile(path.join(__dirname, '../../public', 'index.html'));
});

module.exports = router;
