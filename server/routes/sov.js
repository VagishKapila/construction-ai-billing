const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { pool } = require('../../db');
const { auth } = require('../middleware/auth');
const { upload } = require('../middleware/fileValidation');
const { logEvent } = require('../lib/logEvent');
const XLSX = require('xlsx');
const { execSync } = require('child_process');

// MIME types for SOV uploads (from server.js)
const MIME_SOV = ['application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv','text/plain'];

// File validation helper (from server.js)
function rejectFile(req, res, allowedTypes, label) {
  if (!req.file) return false;
  if (!allowedTypes.includes(req.file.mimetype)) {
    try { fs.unlinkSync(req.file.path); } catch(_) {}
    res.status(400).json({ error: `Invalid file type for ${label}. Accepted types: ${allowedTypes.join(', ')}` });
    return true;
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// SOV PARSER — Excel/CSV
// ──────────────────────────────────────────────────────────────────────────────

function parseSOVFile(filePath) {
  // Local helper to normalize summary row descriptions
  function _xlsSummaryLabel(text) {
    const s = String(text).replace(/\s*[$\d,\.]+.*$/, '').trim().toLowerCase().replace(/\s+/g,' ');
    if (/sub[\s-]?total/.test(s))   return 'subtotal';
    if (/balance[\s-]?due/.test(s)) return 'balance_due';
    if (/amount[\s-]?paid/.test(s)) return 'amount_paid';
    if (/grand/.test(s))            return 'total';
    if (/^total/.test(s))           return 'total';
    return s.replace(/[^a-z0-9_]/g,'_').slice(0,30);
  }
  const workbook = XLSX.readFile(filePath);

  // Prefer Summary sheet
  let sheetName = workbook.SheetNames[0];
  for (const name of workbook.SheetNames) {
    if (/summary/i.test(name)) { sheetName = name; break; }
  }

  const worksheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  const nCols = json.reduce((m, r) => Math.max(m, r.length), 0);

  // Step 1: Scan first 30 rows for header row with BOTH "Total" + "Description"
  let headerRowIdx = -1, iAmt = -1, iDesc = -1, iItem = -1;
  let bestPartialRow = -1, bestPartialAmt = -1, bestPartialDesc = -1, bestPartialItem = -1;

  for (let ri = 0; ri < Math.min(json.length, 30); ri++) {
    const row = json[ri];
    let fAmt = -1, fDesc = -1, fItem = -1;
    for (let ci = 0; ci < row.length; ci++) {
      const h = String(row[ci]||'').trim();
      if (!h) continue;
      if (/^(total|scheduled\s*value|amount|cost|value|price|bid\s*total|contract\s*value)/i.test(h) && fAmt < 0) fAmt = ci;
      if (/^(description|scope|work|item\s*desc|name|trade|section\s*desc)/i.test(h) && fDesc < 0) fDesc = ci;
      if (/^(item\s*#?|sect(ion)?|no\.?|code|csi)/i.test(h) && fItem < 0) fItem = ci;
    }
    if (fAmt >= 0 && fDesc >= 0) {
      headerRowIdx = ri; iAmt = fAmt; iDesc = fDesc;
      if (fItem >= 0) iItem = fItem;
      break;
    }
    if ((fAmt >= 0 || fDesc >= 0) && bestPartialRow < 0) {
      let hasNumericData = false;
      for (let ci = 0; ci < row.length; ci++) {
        if (ci === fAmt || ci === fDesc || ci === fItem) continue;
        const v = row[ci];
        if (typeof v === 'number' && v > 0) { hasNumericData = true; break; }
      }
      if (!hasNumericData) {
        bestPartialRow = ri; bestPartialAmt = fAmt; bestPartialDesc = fDesc; bestPartialItem = fItem;
      }
    }
  }
  if (headerRowIdx < 0 && bestPartialRow >= 0) {
    headerRowIdx = bestPartialRow;
    if (bestPartialAmt  >= 0) iAmt  = bestPartialAmt;
    if (bestPartialDesc >= 0) iDesc = bestPartialDesc;
    if (bestPartialItem >= 0) iItem = bestPartialItem;
  }

  // Step 2a: Desc scoring
  const descScore = new Array(nCols).fill(0);
  const amtScore  = new Array(nCols).fill(0);
  for (const row of json) {
    for (let ci = 0; ci < row.length; ci++) {
      const cell = String(row[ci]||'').trim();
      if (!cell || cell.length < 2) continue;
      const n = parseFloat(cell.replace(/[$,\s]/g,''));
      if (cell.length > 5 && (isNaN(n) || /[a-zA-Z]/.test(cell))) descScore[ci]++;
      else if (!isNaN(n) && n > 50) amtScore[ci]++;
    }
  }
  if (iDesc < 0) {
    const maxD = Math.max(...descScore);
    iDesc = maxD > 0 ? descScore.indexOf(maxD) : 1;
  }

  // Step 2b: Pre-detect cost code columns
  const costCodeCols = new Set();
  const descAnchor = iDesc >= 0 ? iDesc : Math.floor(nCols / 2);
  for (let ci = 0; ci < descAnchor; ci++) {
    let total = 0, codeCount = 0;
    for (const row of json) {
      const v = String(row[ci]||'').trim();
      if (!v) continue;
      total++;
      if (/^\d{4,6}$/.test(v)) codeCount++;
    }
    if (total > 3 && codeCount / total >= 0.6) costCodeCols.add(ci);
  }

  // Step 2c: Amount scoring
  if (iAmt < 0) {
    const amtScore2 = new Array(nCols).fill(0);
    const descAnchorForAmt = iDesc >= 0 ? iDesc : 0;
    for (const row of json) {
      for (let ci = 0; ci < row.length; ci++) {
        if (ci === iDesc || costCodeCols.has(ci)) continue;
        if (ci <= descAnchorForAmt) continue;
        const cell = String(row[ci]||'').trim();
        if (!cell || cell.length < 2) continue;
        const n = parseFloat(cell.replace(/[$,\s]/g,''));
        if (!isNaN(n) && n > 50) amtScore2[ci]++;
      }
    }
    let best = 0;
    for (let ci = 0; ci < nCols; ci++) {
      if (ci === iDesc || costCodeCols.has(ci)) continue;
      if (ci <= descAnchorForAmt) continue;
      if (amtScore2[ci] >= best) { best = amtScore2[ci]; iAmt = ci; }
    }
  }
  if (iItem < 0) {
    for (const ci of costCodeCols) {
      if (ci !== iAmt && ci !== iDesc) { iItem = ci; break; }
    }
    if (iItem < 0) { iItem = iDesc > 0 ? iDesc - 1 : 0; }
    if (iItem === iAmt) iItem = 0;
  }

  if (iAmt < 0) {
    return { headers: ['Item #','Description','Scheduled Value'], sheetName, allRows: [], parentRows: [], iItem, iDesc, iAmt };
  }

  // Step 3: Parse data rows
  const xlsSummary = {};
  const isSummary = (desc, itemId, amt) => {
    const isSum = /^(total|subtotal|grand\s*total|total\s+project|total\s+bid|total\s+cost)/i.test(desc) ||
                  /^(total|subtotal|grand\s*total)$/i.test(itemId);
    if (isSum && !isNaN(amt) && amt > 0) {
      const labelText = /^(total|subtotal|grand)/i.test(itemId) ? itemId : (desc || itemId);
      const key = _xlsSummaryLabel(labelText);
      xlsSummary[key] = Math.round(amt * 100) / 100;
    }
    return isSum;
  };

  const isHeaderLabel = (desc) =>
    /^(section|description|item|scope|no\.|#|trade|work\s*item|csi)/i.test(desc);

  const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
  const rawRows  = [];

  for (let ri = startRow; ri < json.length; ri++) {
    const row    = json[ri];
    const desc   = String(row[iDesc]||'').trim();
    const itemId = String(row[iItem]||'').trim();
    const rawAmt = String(row[iAmt] ||'').replace(/[$,\s]/g,'');
    const amt    = Math.round(parseFloat(rawAmt));

    if (!desc || desc.length < 2) continue;
    if (isHeaderLabel(desc)) continue;
    if (isSummary(desc, itemId, parseFloat(rawAmt))) continue;
    let rowHasSummaryLabel = false;
    for (let ci = 0; ci < row.length; ci++) {
      if (ci === iDesc || ci === iAmt) continue;
      const cell = String(row[ci]||'').trim();
      if (/^(total|subtotal|grand\s*total)$/i.test(cell)) { rowHasSummaryLabel = true; break; }
    }
    if (rowHasSummaryLabel && isSummary('total', itemId, parseFloat(rawAmt))) continue;
    if (isNaN(amt) || amt <= 0) continue;

    const isParent = /000$/.test(itemId) || /^[A-Z]{1,5}$/.test(itemId) || itemId === '';
    rawRows.push({ item_id: itemId, description: desc, scheduled_value: amt, is_parent: isParent });
  }

  // Post-process 1: detect & remove CSI section-header rows
  const sectionHeaderIndices = new Set();
  for (let i = 0; i < rawRows.length; i++) {
    const code = rawRows[i].item_id;
    if (!/^\d{4,6}$/.test(code) || !/000$/.test(code)) continue;

    let subSum = 0;
    let hasSubRows = false;
    for (let j = i + 1; j < rawRows.length; j++) {
      const nextCode = rawRows[j].item_id;
      if (/^\d{4,6}$/.test(nextCode) && /000$/.test(nextCode)) break;
      subSum += rawRows[j].scheduled_value;
      hasSubRows = true;
    }

    const headerAmt = rawRows[i].scheduled_value;
    if (hasSubRows && headerAmt > 0 && Math.abs(subSum - headerAmt) / headerAmt <= 0.05) {
      sectionHeaderIndices.add(i);
    }
  }

  const filteredRows = rawRows.filter((_, i) => !sectionHeaderIndices.has(i));

  // Post-process 2: dedup by (description + amount)
  const seen = new Set();
  const allRows = filteredRows.filter(row => {
    const key = row.description.toLowerCase() + '|' + row.scheduled_value;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const parentRows = allRows.filter(r => r.is_parent);

  return { headers: ['Item #','Description','Scheduled Value'], sheetName, allRows, parentRows, iItem, iDesc, iAmt, summary: xlsSummary };
}

// ──────────────────────────────────────────────────────────────────────────────
// PDF/DOCX PARSER
// ──────────────────────────────────────────────────────────────────────────────

const SKIP_RE = /^(\*|•|·|–|—|-{2,})|^(terms|signature|page \d|note[:\s]|excludes|it is an honor|we thank|sincerely|dear |http|www\.)/i;
const SUMMARY_RE = /^(subtotal|sub[\s\-]total|grand[\s\-]total|total[\s\-]amount|balance[\s\-]due|amount[\s\-]paid|amount[\s\-]due|total[\s\(\$\-]|total\s*$)/i;
const SKIP_META_RE = /\b(lic(ense)?(\s*#|\s+no\.?)?|p\.?o\.?\s*box|phone|fax|e[\-]?mail|zip|contractor'?s)\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2},?\s*\d{4}/i;

function extractSummaryLabel(line) {
  const s = line.replace(/\s*\$[\d,]+(?:\.\d{1,2})?.*$/, '').trim().toLowerCase().replace(/\s+/g,' ');
  if (/sub[\s-]?total/.test(s))   return 'subtotal';
  if (/balance[\s-]?due/.test(s)) return 'balance_due';
  if (/amount[\s-]?paid/.test(s)) return 'amount_paid';
  if (/amount[\s-]?due/.test(s))  return 'amount_due';
  if (/grand/.test(s))            return 'total';
  if (/^total/.test(s))           return 'total';
  return s.replace(/[^a-z0-9_]/g,'_').slice(0,30);
}

function extractAmounts(text) {
  const dollarMatches = (text.match(/\$[\d,]+(?:\.\d{1,2})?/g) || [])
    .map(m => parseFloat(m.replace(/[$,]/g, '')));
  if (dollarMatches.length) return dollarMatches;
  const bareMatches = (text.match(/\b(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)\s*$/g) || [])
    .map(m => parseFloat(m.trim().replace(/,/g, '')))
    .filter(n => n >= 100 && n <= 500000);
  return bareMatches;
}

function cleanDesc(s) {
  return s
    .replace(/^[\*\•\-–—·]+\s*/, '')
    .replace(/^\d{4,6}\s+/, '')
    .replace(/^\d{5}(?=[A-Za-z])/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function rowsFromLines(lines) {
  const merged = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const isJustDollarAmt = /^\$[\d,]+(?:\.\d{1,2})?$/.test(line);
    if (isJustDollarAmt && merged.length > 0) {
      const prev = merged[merged.length - 1];
      const prevWouldBeSkipped = SKIP_RE.test(prev) || SKIP_META_RE.test(prev);
      if (!prevWouldBeSkipped && !extractAmounts(prev).length) {
        merged[merged.length - 1] = prev + ' ' + line;
        continue;
      }
    }
    merged.push(line);
  }

  const rows = [];
  const summary = {};
  const seen = new Set();
  let counter = 1000;
  let pendingDesc = null;
  for (const raw of merged) {
    const line = raw.trim();
    if (line.length < 5) { pendingDesc = null; continue; }
    if (SUMMARY_RE.test(line)) {
      const amts = extractAmounts(line);
      if (amts.length) summary[extractSummaryLabel(line)] = Math.round(amts[amts.length-1] * 100) / 100;
      pendingDesc = null;
      continue;
    }
    if (SKIP_RE.test(line)) { pendingDesc = null; continue; }
    if (SKIP_META_RE.test(line)) { pendingDesc = null; continue; }
    const amounts = extractAmounts(line);
    if (!amounts.length) {
      const candidate = cleanDesc(line.replace(/\s*\$[\d,]+(?:\.\d{1,2})?.*$/, '').trim());
      pendingDesc = (candidate.length >= 4 && !/^[\d\s.,\-]+$/.test(candidate)) ? candidate : null;
      continue;
    }
    const total = amounts[amounts.length - 1];
    if (total <= 0) { pendingDesc = null; continue; }
    let desc = cleanDesc(
      line.replace(/\s*\$[\d,]+(?:\.\d{1,2})?.*$/, '')
          .replace(/\s+\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\s*$/, '')
          .trim()
    );
    if (desc.length < 4 || /^[\d\s.,\-]+$/.test(desc)) {
      if (pendingDesc) { desc = pendingDesc; }
      else { pendingDesc = null; continue; }
    }
    pendingDesc = null;
    if (SKIP_RE.test(desc)) continue;
    const key = desc.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ item_id: String(counter), description: desc, scheduled_value: Math.round(total * 100) / 100 });
    counter += 1000;
  }
  return {rows, summary};
}

async function parseSOVFromText(filePath, ext) {
  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse');
    const buf = fs.readFileSync(filePath);
    const data = await pdfParse(buf);
    return rowsFromLines((data.text || '').split('\n'));
  } else if (ext === '.docx' || ext === '.doc') {
    const mammoth = require('mammoth');
    const rawResult = await mammoth.extractRawText({ path: filePath });
    const lines = (rawResult.value || '').split('\n');
    const htmlResult = await mammoth.convertToHtml({ path: filePath });
    const html = htmlResult.value || '';
    const tableCells = [];
    const trMatches = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    for (const tr of trMatches) {
      const cells = (tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
        .map(td => td.replace(/<[^>]+>/g, ' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim())
        .filter(Boolean);
      if (cells.length >= 2) {
        let amtIdx = -1;
        for (let i = cells.length - 1; i >= 0; i--) {
          if (extractAmounts(cells[i]).length) { amtIdx = i; break; }
        }
        if (amtIdx < 0) continue;
        const descCandidates = cells.slice(0, amtIdx).filter(c => c.length > 3 && !extractAmounts(c).length);
        if (!descCandidates.length) continue;
        const desc = descCandidates.reduce((a, b) => a.length >= b.length ? a : b);
        const amt = extractAmounts(cells[amtIdx]).slice(-1)[0];
        tableCells.push(`${desc} $${amt}`);
      }
    }
    const tableResult = rowsFromLines(tableCells);
    if (tableResult.rows && tableResult.rows.length > 0) return tableResult;
    return rowsFromLines(lines);
  }
  return {rows: [], summary: {}};
}

// ──────────────────────────────────────────────────────────────────────────────
// ROUTES
// ──────────────────────────────────────────────────────────────────────────────

// POST /api/sov/parse - Parse SOV file (Excel, CSV, PDF, Word)
router.post('/api/sov/parse', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (rejectFile(req, res, MIME_SOV, 'SOV')) return;
  const cleanup = () => { try { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch(_){} };
  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    let result;

    if (ext === '.pdf') {
      let parsed = null;
      try {
        parsed = await new Promise((resolve, reject) => {
          const tmpPdf = req.file.path + '.pdf';
          fs.renameSync(req.file.path, tmpPdf);
          const py = require('child_process').spawn('python3', [path.join(__dirname, '../../parse_sov.py'), tmpPdf]);
          let out = '', err = '';
          py.stdout.on('data', d => out += d);
          py.stderr.on('data', d => err += d);
          py.on('error', (e) => {
            try { fs.renameSync(tmpPdf, req.file.path); } catch(_) {}
            reject(e);
          });
          py.on('close', code => {
            try { fs.renameSync(tmpPdf, req.file.path); } catch(_) {}
            const combined = out + err;
            let r = null;
            for (const s of [out, err]) { try { r = JSON.parse(s.trim()); break; } catch(_) {} }
            if (!r) { const m = combined.match(/\{[\s\S]*\}/); if (m) { try { r = JSON.parse(m[0]); } catch(_) {} } }
            if (r) return resolve(r);
            reject(new Error('Parser output: ' + combined.slice(0, 200)));
          });
        });
        console.log('[PDF] pdfplumber parsed', parsed.row_count, 'rows');
      } catch(e) {
        console.log('[PDF] Python unavailable, using pure-JS fallback:', e.message);
        parsed = await parseSOVFromText(req.file.path, ext);
      }
      const rows = (parsed && parsed.rows) || [];
      if (!rows.length) {
        cleanup();
        return res.status(422).json({ error: 'No line items with dollar amounts could be extracted from this PDF. If it is a scanned/image PDF, try uploading a Word (.docx) or Excel (.xlsx) version instead.' });
      }
      const summary = (parsed && parsed.summary) || {};
      const computed_total = (parsed && parsed.computed_total) || rows.reduce((s,r) => s + r.scheduled_value, 0);
      const reported_total = (parsed && parsed.reported_total) || summary.total || summary.balance_due || null;
      result = {
        rows, all_rows: rows,
        row_count: rows.length, total_rows: rows.length,
        summary, computed_total, reported_total,
        filename: req.file.originalname,
        sheet_used: 'PDF'
      };
    } else if (ext === '.docx' || ext === '.doc') {
      const parsed = await parseSOVFromText(req.file.path, ext);
      const rows = parsed.rows || parsed;
      const summary = parsed.summary || {};
      if (!rows || rows.length === 0) {
        cleanup();
        return res.status(422).json({ error: 'No line items with dollar amounts could be extracted from this file. Please try uploading an Excel (.xlsx) version instead.' });
      }
      const computed_total = rows.reduce((s,r) => s + r.scheduled_value, 0);
      const reported_total = summary.total || summary.balance_due || null;
      result = {
        rows, all_rows: rows,
        row_count: rows.length, total_rows: rows.length,
        summary, computed_total, reported_total,
        filename: req.file.originalname,
        sheet_used: ext.replace('.','').toUpperCase()
      };
    } else {
      // XLSX/XLS/CSV
      const parsed = parseSOVFile(req.file.path);
      const summary = parsed.summary || {};
      const computed_total = parsed.allRows.reduce((s,r) => s + r.scheduled_value, 0);
      const reported_total = summary.total || summary.subtotal || null;
      result = {
        headers:    parsed.headers,
        detected:   { item: parsed.iItem, desc: parsed.iDesc, amt: parsed.iAmt },
        all_rows:   parsed.allRows,
        rows:       parsed.allRows,
        row_count:  parsed.allRows.length,
        total_rows: parsed.allRows.length,
        summary, computed_total, reported_total,
        filename:   req.file.originalname,
        sheet_used: parsed.sheetName
      };
    }

    cleanup();
    res.json(result);
  } catch(e) {
    cleanup();
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:id/sov/uploads - Get SOV upload history for a project
router.get('/api/projects/:id/uploads', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM sov_uploads WHERE project_id=$1 ORDER BY uploaded_at DESC',[req.params.id]);
  res.json(r.rows);
});

module.exports = router;
