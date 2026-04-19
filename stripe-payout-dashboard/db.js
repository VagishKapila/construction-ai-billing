/**
 * stripe-payout-dashboard/db.js
 * Shared DB pool for the payout dashboard module.
 * Reuses DATABASE_URL from the main app environment.
 */
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 5,                // small pool — this is a side module
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[PayoutDB] Unexpected pool error:', err.message);
});

module.exports = { pool };
