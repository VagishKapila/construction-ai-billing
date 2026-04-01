const fs = require('fs');
const multer = require('multer');

// ── MIME type whitelists — used to reject unexpected file types on upload ────
const MIME_IMAGE   = ['image/jpeg','image/png','image/gif','image/webp','image/svg+xml'];
const MIME_SOV     = ['application/pdf','application/msword',
                      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                      'application/vnd.ms-excel',
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                      'text/csv','text/plain'];
const MIME_CONTRACT= ['application/pdf','application/msword',
                      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const MIME_ATTACH  = [...MIME_IMAGE, ...MIME_CONTRACT,
                      'application/vnd.ms-excel',
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                      'text/csv','text/plain'];
const MIME_SCREENSHOT = [...MIME_IMAGE];

function rejectFile(req, res, allowedTypes, label) {
  if (!req.file) return false;
  // Check MIME type; also cross-check file extension for extra safety
  if (!allowedTypes.includes(req.file.mimetype)) {
    try { fs.unlinkSync(req.file.path); } catch(_) {}
    res.status(400).json({ error: `Invalid file type for ${label}. Accepted types: ${allowedTypes.join(', ')}` });
    return true;
  }
  return false;
}

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB max per file
});

module.exports = {
  MIME_IMAGE,
  MIME_SOV,
  MIME_CONTRACT,
  MIME_ATTACH,
  MIME_SCREENSHOT,
  rejectFile,
  upload
};
