require('dotenv').config();

const { initDB } = require('../db');
const app = require('./app');

const PORT = process.env.PORT || 3000;

// Validate environment on startup
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET env var must be set in production. Exiting.');
    process.exit(1);
  }
  console.warn('WARNING: JWT_SECRET not set — using insecure default (dev only).');
}

// Start server immediately so Railway health checks pass even during DB init
const server = app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[Server] NODE_ENV=${process.env.NODE_ENV || 'development'}`);
  if (!process.env.ALLOWED_ORIGIN) {
    console.warn('[Server] ALLOWED_ORIGIN not set — using wildcard CORS (dev only)');
  }
});

// Initialize database with retry logic — server stays up even if DB is slow
const MAX_DB_RETRIES = 5;
const DB_RETRY_DELAY_MS = 3000;

async function initWithRetry(attempt = 1) {
  try {
    await initDB();
    console.log('[Database] Connected and migrations complete');
  } catch (err) {
    console.error(`[Database] Init attempt ${attempt}/${MAX_DB_RETRIES} failed:`, err.message);
    if (attempt < MAX_DB_RETRIES) {
      console.log(`[Database] Retrying in ${DB_RETRY_DELAY_MS / 1000}s...`);
      setTimeout(() => initWithRetry(attempt + 1), DB_RETRY_DELAY_MS);
    } else {
      console.error('[Database] All retries exhausted — running in degraded mode (DB unavailable)');
      // Server stays up — /api/health returns 503, but Railway proxy gets 200 from health check
    }
  }
}

initWithRetry();

// ── Hub Stale Document Alerts (runs daily at 3:00 AM UTC) ────────────────
const { runStaleAlerts } = require('./features/hub/stale-alerts');
const { pool } = require('../db');

async function scheduleStaleAlerts() {
  // Calculate delay until next 03:00 UTC
  const now = new Date();
  const next3am = new Date(now.getTime());
  next3am.setUTCHours(3, 0, 0, 0);
  if (next3am <= now) {
    next3am.setUTCDate(next3am.getUTCDate() + 1);
  }
  const delayMs = next3am.getTime() - now.getTime();
  console.log(
    `[StaleAlerts] Scheduled for ${next3am.toISOString()} (in ${Math.round(delayMs / 1000 / 60)} minutes)`
  );

  // Run once at the scheduled time, then every 24 hours
  setTimeout(() => {
    const fromEmail = process.env.FROM_EMAIL || 'billing@varshyl.com';
    runStaleAlerts(pool, fromEmail).catch((err) => {
      console.error('[StaleAlerts] Cron execution failed:', err);
    });
    // Then run every 24 hours
    setInterval(() => {
      runStaleAlerts(pool, fromEmail).catch((err) => {
        console.error('[StaleAlerts] Cron execution failed:', err);
      });
    }, 24 * 60 * 60 * 1000);
  }, delayMs);
}

scheduleStaleAlerts();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received — shutting down gracefully');
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});
