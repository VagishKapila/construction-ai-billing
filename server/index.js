require('dotenv').config();

const { initDB } = require('../db');
const app = require('./app');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

// Validate environment on startup
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET env var must be set in production. Exiting.');
    process.exit(1);
  }
  console.warn('WARNING: JWT_SECRET not set — using insecure default (dev only).');
}

// Initialize database and start server
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[Server] Running on port ${PORT}`);
      console.log(`[Server] NODE_ENV=${process.env.NODE_ENV || 'development'}`);
      if (!process.env.ALLOWED_ORIGIN) {
        console.warn('[Server] ALLOWED_ORIGIN not set — using wildcard CORS (dev only)');
      }
    });
  })
  .catch(err => {
    console.error('[Database Init Error]', err);
    process.exit(1);
  });
