'use strict';
const { pool } = require('../../../db');
const archiver = require('archiver');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = process.env.UPLOADS_DIR || '/app/uploads';

module.exports = {
  async getProjectFiles(projectId) {
    const result = await pool.query(
      `SELECT id, filename, original_name, doc_type, status, source, created_at, amount
       FROM hub_uploads WHERE project_id=$1 ORDER BY created_at DESC`,
      [projectId]
    );
    return result.rows;
  },
  async generateZip(projectId) {
    const files = await this.getProjectFiles(projectId);
    const zipDir = path.join(UPLOADS_DIR, 'zips');
    if (!fs.existsSync(zipDir)) fs.mkdirSync(zipDir, { recursive: true });
    const zipPath = path.join(zipDir, `project_${projectId}_${Date.now()}.zip`);
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 6 } });
      output.on('close', () => resolve({ zipPath, size: archive.pointer() }));
      archive.on('error', reject);
      archive.pipe(output);
      for (const file of files) {
        const fp = path.join(UPLOADS_DIR, file.filename);
        if (fs.existsSync(fp)) archive.file(fp, { name: file.original_name || file.filename });
      }
      archive.finalize();
    });
  }
};
