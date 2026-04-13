/**
 * ConstructInvoice AI — Hub Email Ingestion Route
 *
 * Receives inbound emails from Cloudflare Email Workers for the @hub.constructinv.com domain.
 * Parses email address to extract trade and project ID, saves attachments, creates hub_uploads records.
 *
 * No authentication — validates via X-Hub-Secret header instead.
 * Called by: Cloudflare Email Workers with webhook POST requests.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { pool } = require('../../db');

// Uploads directory — consistent with hub.js pattern
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

/**
 * Verify X-Hub-Secret header matches environment variable.
 * If env var not set, skip verification (development mode).
 */
function verifyInboundSecret(req) {
  const secret = process.env.HUB_INBOUND_SECRET;
  if (!secret) {
    console.warn('[Hub Email] HUB_INBOUND_SECRET not set — skipping verification (dev mode)');
    return true;
  }
  const header = req.get('X-Hub-Secret');
  return header === secret;
}

/**
 * Parse email address: "trade-slug-42@hub.constructinv.com" -> { tradeSlug: "trade-slug", projectId: 42 }
 * Handles multi-part trade slugs: "electrical-contractor-42" -> slug="electrical-contractor", id=42
 */
function parseEmailAddress(toAddress) {
  const match = toAddress.match(/^([^@]+)@hub\.constructinv\.com$/i);
  if (!match) return null;

  const localPart = match[1]; // e.g., "plumbing-42" or "electrical-contractor-42"
  const lastDash = localPart.lastIndexOf('-');
  if (lastDash === -1) return null;

  const potentialId = localPart.substring(lastDash + 1);
  const projectId = parseInt(potentialId, 10);
  if (isNaN(projectId)) return null;

  const tradeSlug = localPart.substring(0, lastDash); // e.g., "plumbing" or "electrical-contractor"
  return { tradeSlug, projectId };
}

/**
 * Detect document type from filename and contentType.
 * Checks subject line for keywords like "lien", "invoice", etc.
 */
function detectDocType(filename, contentType, subject = '') {
  const subjectLower = (subject || '').toLowerCase();
  const filenameLower = (filename || '').toLowerCase();
  const ext = path.extname(filename).toLowerCase();

  // Lien waiver
  if (subjectLower.includes('lien') || filenameLower.includes('lien')) {
    return 'lien_waiver';
  }

  // Invoice
  if (
    subjectLower.includes('invoice') ||
    filenameLower.includes('invoice') ||
    ext === '.pdf'
  ) {
    return 'invoice';
  }

  // Photo
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
    return 'photo';
  }

  // Photo by content type
  if (contentType && contentType.startsWith('image/')) {
    return 'photo';
  }

  // RFI
  if (subjectLower.includes('rfi') || filenameLower.includes('rfi')) {
    return 'rfi';
  }

  // Submittal
  if (subjectLower.includes('submittal') || filenameLower.includes('submittal')) {
    return 'submittal';
  }

  // Default
  return 'other';
}

/**
 * Sanitize filename for safe filesystem storage.
 * Remove path traversal attempts, special characters.
 */
function sanitizeFilename(original) {
  return original
    .replace(/[^\w\s.-]/g, '') // Remove special chars except dash, underscore, dot
    .replace(/\s+/g, '_') // Replace spaces with underscore
    .substring(0, 255); // Max length
}

/**
 * Find trade by fuzzy matching against project trades.
 * Looks for trades whose name contains the slug (case-insensitive).
 */
async function findTrade(projectId, tradeSlug) {
  const query = `
    SELECT id, name FROM project_trades
    WHERE project_id = $1 AND LOWER(name) LIKE '%' || LOWER($2) || '%'
    LIMIT 1
  `;
  const result = await pool.query(query, [projectId, tradeSlug]);
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * POST /api/hub/inbound-email
 * Receive email from Cloudflare Email Workers.
 */
router.post('/inbound-email', async (req, res) => {
  try {
    // Verify secret header
    if (!verifyInboundSecret(req)) {
      console.warn('[Hub Email] Invalid X-Hub-Secret');
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { to, from, subject, text, attachments } = req.body;

    // Validate required fields
    if (!to) {
      return res.status(400).json({ error: 'Missing "to" field in email' });
    }

    // Parse email address
    const parsed = parseEmailAddress(to);
    if (!parsed) {
      console.warn(`[Hub Email] Failed to parse email address: ${to}`);
      return res.status(400).json({ error: 'Invalid email address format' });
    }

    const { tradeSlug, projectId } = parsed;

    // Verify project exists
    const projectResult = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId]);
    if (projectResult.rows.length === 0) {
      console.warn(`[Hub Email] Project not found: ${projectId}`);
      return res.status(404).json({ error: 'Project not found' });
    }

    // Find matching trade
    const trade = await findTrade(projectId, tradeSlug);
    if (!trade) {
      console.warn(`[Hub Email] Trade not found for project ${projectId}, slug: ${tradeSlug}`);
      return res.status(404).json({ error: 'Trade not found for this project' });
    }

    // Ensure uploads directory exists
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    // Process attachments
    let documentsCreated = 0;
    if (attachments && Array.isArray(attachments)) {
      for (const attachment of attachments) {
        try {
          const { filename, contentType, content } = attachment;
          if (!filename || !content) continue;

          // Decode base64
          const buffer = Buffer.from(content, 'base64');

          // Generate safe filename with timestamp
          const timestamp = Date.now();
          const sanitized = sanitizeFilename(filename);
          const storedFilename = `${timestamp}-${sanitized}`;
          const filePath = path.join(UPLOADS_DIR, storedFilename);

          // Write file
          fs.writeFileSync(filePath, buffer);

          // Detect doc type
          const docType = detectDocType(filename, contentType, subject);

          // Insert into hub_uploads
          const insertResult = await pool.query(
            `INSERT INTO hub_uploads (
              project_id, trade_id, original_name, filename, file_size, mime_type,
              doc_type, status, source, uploaded_by, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id`,
            [
              projectId,
              trade.id,
              filename,
              storedFilename,
              buffer.length,
              contentType || 'application/octet-stream',
              docType,
              'pending',
              'email_ingest',
              from,
              subject || null,
            ]
          );

          console.log(
            `[Hub Email] Created upload: project=${projectId}, trade=${trade.id}, type=${docType}, file=${storedFilename}`
          );
          documentsCreated++;
        } catch (err) {
          console.error(`[Hub Email] Error processing attachment "${attachment.filename}":`, err.message);
          // Continue with next attachment
        }
      }
    }

    // If no attachments, still log the email (for future NLP/manual review)
    if (documentsCreated === 0 && text) {
      console.log(
        `[Hub Email] Email received with no attachments: project=${projectId}, trade=${trade.id}, from=${from}`
      );
    }

    res.json({ success: true, documents_created: documentsCreated });
  } catch (err) {
    console.error('[Hub Email] Route error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
