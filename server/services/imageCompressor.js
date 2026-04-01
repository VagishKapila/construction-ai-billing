// Server-side image compression using Sharp (optional, graceful fallback)
// If sharp isn't installed or fails to load, compression is skipped silently.
// Invoices always send regardless. Never crashes the app.

const fs = require('fs');
const path = require('path');

let sharp = null;
try {
  sharp = require('sharp');
  console.log('[sharp] Server-side image compression enabled');
}
catch(e) {
  console.log('[sharp] Not available — client-side compression only (install sharp + libvips to enable)');
}

async function compressUploadedImage(filePath) {
  if (!sharp) return; // no sharp = skip silently, original file used as-is
  const stat = fs.statSync(filePath);
  if (stat.size < 500 * 1024) return; // skip small files (< 500KB)
  const tmp = filePath + '.sharp_tmp';
  try {
    await sharp(filePath)
      .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, progressive: true })
      .toFile(tmp);
    const newStat = fs.statSync(tmp);
    fs.renameSync(tmp, filePath);
    console.log(`[sharp] ${path.basename(filePath)}: ${Math.round(stat.size/1024)}KB → ${Math.round(newStat.size/1024)}KB`);
  } catch(e) {
    console.warn('[sharp] Compression failed, using original:', e.message);
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch(_) {}
    // Original file untouched — invoice processing continues normally
  }
}

module.exports = { compressUploadedImage };
