/**
 * Hub Export Routes — ZIP archive download for project documents
 *
 * Exports all approved hub documents as a downloadable ZIP file,
 * organized by document type.
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const { pool } = require('../../db');
const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/projects/:projectId/hub/export-zip
 *
 * Export all approved hub documents for a project as a ZIP file.
 * Files are organized in subdirectories by doc_type.
 *
 * Auth: Required (JWT token)
 * Response: ZIP file as application/zip
 */
router.get('/api/projects/:projectId/hub/export-zip', auth, async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user?.id;

  try {
    // Verify user owns this project
    const projectResult = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(403).json({ error: 'Project not found or unauthorized' });
    }

    // Query approved uploads for this project
    const uploadsResult = await pool.query(
      `SELECT id, project_id, filename, original_name, doc_type, trade_id
       FROM hub_uploads
       WHERE project_id = $1 AND status = 'approved'
       ORDER BY doc_type, created_at`,
      [projectId]
    );

    const uploads = uploadsResult.rows;

    // If no approved documents, return 404
    if (uploads.length === 0) {
      return res.status(404).json({ error: 'No approved documents to export' });
    }

    // Get trade names for file organization
    const tradeIds = [...new Set(uploads.map(u => u.trade_id))];
    const tradesResult = await pool.query(
      'SELECT id, name FROM project_trades WHERE id = ANY($1)',
      [tradeIds]
    );
    const tradeMap = {};
    tradesResult.rows.forEach(t => {
      tradeMap[t.id] = t.name;
    });

    // Create ZIP archive
    const archive = archiver('zip', { zlib: { level: 6 } });

    // Set response headers
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="hub-export-project-${projectId}.zip"`
    );

    // Pipe archive to response
    archive.pipe(res);

    // Upload directory (dev: ./uploads, prod: /app/uploads)
    const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

    // Add each approved file to the archive
    let addedCount = 0;
    for (const upload of uploads) {
      const filePath = path.join(uploadsDir, upload.filename);

      try {
        // Check if file exists
        await fs.access(filePath);

        // Build path in ZIP: {doc_type}/{trade_name}_{original_name}
        const docType = upload.doc_type || 'other';
        const tradeName = sanitizeFilename(tradeMap[upload.trade_id] || 'Unknown');
        const originalName = sanitizeFilename(upload.original_name);
        const zipPath = `${docType}/${tradeName}_${originalName}`;

        // Add file to archive
        const fileStream = (await fs.readFile(filePath));
        archive.append(fileStream, { name: zipPath });
        addedCount++;
      } catch (fileErr) {
        // File missing — log and skip (don't fail the whole export)
        logger.warn({
          msg: 'Hub export: file not found, skipping',
          uploadId: upload.id,
          filename: upload.filename,
          filePath,
          error: fileErr.message,
        });
      }
    }

    // Finalize archive
    await archive.finalize();

    logger.info({
      msg: 'Hub export successful',
      projectId,
      userId,
      totalApproved: uploads.length,
      addedToZip: addedCount,
    });
  } catch (error) {
    logger.error({
      msg: 'Hub export failed',
      projectId,
      userId,
      error: error.message,
      stack: error.stack,
    });

    // If headers already sent, can't send JSON error
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate export file' });
    } else {
      res.end();
    }
  }
});

/**
 * Sanitize filename for ZIP archive
 * Removes path separators and special characters
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[\/\\:*?"<>|]/g, '_') // Replace path separators and special chars
    .replace(/\s+/g, '_')           // Replace spaces with underscore
    .substring(0, 100);              // Limit length
}

module.exports = router;
