'use strict';
const { pool: db } = require('../../../db');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'uploads');

const hubService = {
  async getHubSummary(projectId) {
    const trades = await db.query('SELECT COUNT(*) as count FROM project_trades WHERE project_id = $1', [projectId]);
    const docs = await db.query(
      'SELECT status, COUNT(*) as count FROM hub_uploads WHERE project_id = $1 GROUP BY status',
      [projectId]
    );
    const trustAvg = await db.query(
      'SELECT AVG(score) as avg_score FROM vendor_trust_scores WHERE project_id = $1',
      [projectId]
    );
    return {
      trade_count: parseInt(trades.rows[0]?.count || 0),
      docs_by_status: docs.rows,
      avg_trust_score: Math.round(parseFloat(trustAvg.rows[0]?.avg_score || 500))
    };
  },

  async validateJoinCode(code) {
    // users table has no company_name — join company_settings instead
    const result = await db.query(`
      SELECT jc.*, p.address as project_address, p.name as project_name,
             COALESCE(cs.company_name, u.name) as gc_company
      FROM project_join_codes jc
      JOIN projects p ON p.id = jc.project_id
      JOIN users u ON u.id = p.user_id
      LEFT JOIN company_settings cs ON cs.user_id = u.id
      WHERE jc.code = $1 AND jc.is_active = true
      AND (jc.expires_at IS NULL OR jc.expires_at > NOW())
    `, [code]);
    return result.rows[0] || null;
  },

  async getFilesForZip(projectId) {
    const result = await db.query(`
      SELECT hu.*, pt.name as trade_name
      FROM hub_uploads hu
      JOIN project_trades pt ON pt.id = hu.trade_id
      WHERE hu.project_id = $1 AND hu.status = 'approved' AND hu.filename IS NOT NULL
      ORDER BY pt.name, hu.created_at
    `, [projectId]);
    return result.rows;
  }
};

module.exports = hubService;
