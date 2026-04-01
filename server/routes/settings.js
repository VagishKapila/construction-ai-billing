const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const { pool } = require('../../db');
const { auth } = require('../middleware/auth');
const { upload, rejectFile, MIME_IMAGE } = require('../middleware/fileValidation');
const { compressUploadedImage } = require('../services/imageCompressor');
const { logEvent } = require('../lib/logEvent');

// GET /api/settings
router.get('/api/settings', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM company_settings WHERE user_id=$1', [req.user.id]);
  res.json(r.rows[0] || {});
});

// POST /api/settings
router.post('/api/settings', auth, async (req, res) => {
  const {
    company_name, default_payment_terms, default_retainage, contact_name, contact_phone,
    contact_email, job_number_format, reminder_7before, reminder_due, reminder_7after,
    reminder_retention, reminder_email, reminder_phone, credit_card_enabled
  } = req.body;
  const r = await pool.query(
    `INSERT INTO company_settings(
      user_id, company_name, default_payment_terms, default_retainage, contact_name,
      contact_phone, contact_email, job_number_format, reminder_7before, reminder_due,
      reminder_7after, reminder_retention, reminder_email, reminder_phone, credit_card_enabled
     )
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT(user_id) DO UPDATE SET
       company_name=EXCLUDED.company_name,
       default_payment_terms=EXCLUDED.default_payment_terms,
       default_retainage=EXCLUDED.default_retainage,
       contact_name=EXCLUDED.contact_name,
       contact_phone=EXCLUDED.contact_phone,
       contact_email=EXCLUDED.contact_email,
       job_number_format=EXCLUDED.job_number_format,
       reminder_7before=COALESCE(EXCLUDED.reminder_7before, company_settings.reminder_7before, TRUE),
       reminder_due=COALESCE(EXCLUDED.reminder_due, company_settings.reminder_due, TRUE),
       reminder_7after=COALESCE(EXCLUDED.reminder_7after, company_settings.reminder_7after, TRUE),
       reminder_retention=COALESCE(EXCLUDED.reminder_retention, company_settings.reminder_retention, TRUE),
       reminder_email=COALESCE(EXCLUDED.reminder_email, company_settings.reminder_email),
       reminder_phone=COALESCE(EXCLUDED.reminder_phone, company_settings.reminder_phone),
       credit_card_enabled=COALESCE(EXCLUDED.credit_card_enabled, company_settings.credit_card_enabled, FALSE),
       updated_at=NOW()
     RETURNING *`,
    [
      req.user.id, company_name, default_payment_terms || 'Due on receipt', default_retainage || 10,
      contact_name || null, contact_phone || null, contact_email || null, job_number_format || null,
      reminder_7before ?? null, reminder_due ?? null, reminder_7after ?? null, reminder_retention ?? null,
      reminder_email || null, reminder_phone || null, credit_card_enabled ?? null
    ]
  );
  res.json(r.rows[0]);
});

// POST /api/settings/nudges
router.post('/api/settings/nudges', auth, async (req, res) => {
  const { nudge_30day, nudge_60day, nudge_5payapps, nudge_dismiss_days } = req.body;
  try {
    await pool.query(
      `UPDATE company_settings SET nudge_30day=$1, nudge_60day=$2, nudge_5payapps=$3, nudge_dismiss_days=$4 WHERE user_id=$5`,
      [nudge_30day !== false, nudge_60day !== false, nudge_5payapps !== false, parseInt(nudge_dismiss_days) || 7, req.user.id]
    );
    res.json({ ok: true });
  } catch(e) {
    console.error('[Nudge Settings]', e.message);
    res.status(500).json({ error: 'Failed to save' });
  }
});

// POST /api/settings/logo
router.post('/api/settings/logo', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  if (rejectFile(req, res, MIME_IMAGE, 'logo')) return;
  // Server-side compression (graceful — never blocks the save)
  await compressUploadedImage(path.join(__dirname, '../../uploads', req.file.filename)).catch(() => {});
  // Delete old logo if exists
  const old = await pool.query('SELECT logo_filename FROM company_settings WHERE user_id=$1', [req.user.id]);
  if (old.rows[0]?.logo_filename) {
    const oldPath = path.join(__dirname, '../../uploads', old.rows[0].logo_filename);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  const r = await pool.query(
    `INSERT INTO company_settings(user_id, logo_filename, logo_original_name)
     VALUES($1,$2,$3)
     ON CONFLICT(user_id) DO UPDATE SET
       logo_filename=EXCLUDED.logo_filename,
       logo_original_name=EXCLUDED.logo_original_name,
       updated_at=NOW()
     RETURNING *`,
    [req.user.id, req.file.filename, req.file.originalname]
  );
  res.json(r.rows[0]);
});

// GET /api/settings/logo
router.get('/api/settings/logo', auth, async (req, res) => {
  const r = await pool.query('SELECT logo_filename FROM company_settings WHERE user_id=$1', [req.user.id]);
  const filename = r.rows[0]?.logo_filename;
  if (!filename) return res.status(404).json({ error: 'No logo' });
  const fp = path.join(__dirname, '../../uploads', filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(fp);
});

// POST /api/settings/signature
router.post('/api/settings/signature', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  if (rejectFile(req, res, MIME_IMAGE, 'signature')) return;
  await compressUploadedImage(path.join(__dirname, '../../uploads', req.file.filename)).catch(() => {});
  const r = await pool.query(
    `INSERT INTO company_settings(user_id, signature_filename)
     VALUES($1,$2)
     ON CONFLICT(user_id) DO UPDATE SET signature_filename=EXCLUDED.signature_filename,updated_at=NOW()
     RETURNING *`,
    [req.user.id, req.file.filename]
  );
  res.json(r.rows[0]);
});

// GET /api/settings/signature
router.get('/api/settings/signature', auth, async (req, res) => {
  const r = await pool.query('SELECT signature_filename FROM company_settings WHERE user_id=$1', [req.user.id]);
  const filename = r.rows[0]?.signature_filename;
  if (!filename) return res.status(404).json({ error: 'No signature' });
  const fp = path.join(__dirname, '../../uploads', filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(fp);
});

// GET /api/settings/job-number/next
router.get('/api/settings/job-number/next', auth, async (req, res) => {
  try {
    const { city, state } = req.query;
    // Increment the company's job_number_seq atomically
    const r = await pool.query(
      `UPDATE company_settings
       SET job_number_seq = COALESCE(job_number_seq, 0) + 1
       WHERE user_id = $1
       RETURNING job_number_seq, job_number_format`,
      [req.user.id]
    );
    if (!r.rows[0]) {
      // No settings row yet — insert it
      const ins = await pool.query(
        `INSERT INTO company_settings(user_id, job_number_seq) VALUES($1, 1) RETURNING job_number_seq, job_number_format`,
        [req.user.id]
      );
      r.rows[0] = ins.rows[0];
    }
    const seq = r.rows[0].job_number_seq || 1;
    const fmt = r.rows[0].job_number_format;

    let jobNumber;
    if (fmt) {
      // Custom format: replace {CITY}, {STATE}, {SEQ}, {YEAR} tokens
      const year = new Date().getFullYear();
      jobNumber = fmt
        .replace(/{CITY}/gi, (city || 'XX').toUpperCase().slice(0, 4))
        .replace(/{STATE}/gi, (state || 'XX').toUpperCase().slice(0, 2))
        .replace(/{SEQ}/gi, String(seq).padStart(4, '0'))
        .replace(/{YEAR}/gi, String(year));
    } else {
      // Default: CITY-STATE-0042
      const cityCode = (city || 'XX').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);
      const stateCode = (state || 'XX').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2);
      jobNumber = `${cityCode}-${stateCode}-${String(seq).padStart(4, '0')}`;
    }
    res.json({ job_number: jobNumber, seq });
  } catch(e) {
    console.error('[API Error]', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
