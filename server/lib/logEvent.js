// Analytics event logger — silent on error to never crash the app
const { pool } = require('../../db');

async function logEvent(userId, event, meta = {}) {
  try {
    await pool.query(
      'INSERT INTO analytics_events(user_id, event, meta) VALUES($1,$2,$3)',
      [userId || null, event, JSON.stringify(meta)]
    );
  } catch(e) { /* silent — analytics must never crash the app */ }
}

module.exports = { logEvent };
