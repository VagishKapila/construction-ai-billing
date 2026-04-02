const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { pool } = require('../../db');
const { auth } = require('../middleware/auth');
const { upload } = require('../middleware/fileValidation');
const { logEvent } = require('../lib/logEvent');
const { fmt } = require('../lib/format');
const PDFDocument = require('pdfkit');
const { generateLienDocPDF } = require('./lienWaivers');
const { generatePaymentToken } = require('../services/stripe');

// PDF generation via Puppeteer (fallback to PDFKit if unavailable)
let puppeteer = null;
try { puppeteer = require('puppeteer'); } catch(e) { console.warn('[PDF] Puppeteer not available, falling back to PDFKit'); }

// JWT_SECRET and other config from environment
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

// Helper: fetch email with timeout (from server.js)
function fetchEmail(url, opts) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(10000) });
}

// Get helper functions from global app exports
// These are set by server.js after it loads the module
function getServerHelpers() {
  return global.__serverHelpers || {};
}

// GET /api/projects/:id/payapps - List pay apps for a project
router.get('/api/projects/:id/payapps', auth, async (req,res) => {
  // Exclude soft-deleted pay apps from the normal listing
  const r = await pool.query('SELECT * FROM pay_apps WHERE project_id=$1 AND deleted_at IS NULL ORDER BY app_number',[req.params.id]);
  res.json(r.rows);
});

// POST /api/projects/:id/payapps - Create new pay app
router.post('/api/projects/:id/payapps', auth, async (req,res) => {
  const {period_label,period_start,period_end,app_number} = req.body;
  const invoiceToken = require('crypto').randomBytes(24).toString('hex');
  const pa = await pool.query(
    'INSERT INTO pay_apps(project_id,app_number,period_label,period_start,period_end,invoice_token) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.params.id,app_number,period_label,period_start,period_end,invoiceToken]
  );
  const paId = pa.rows[0].id;
  const sovLines = await pool.query('SELECT * FROM sov_lines WHERE project_id=$1 ORDER BY sort_order',[req.params.id]);
  // Fetch project's default retainage (falls back to 10 if column not yet present)
  const projRes = await pool.query('SELECT default_retainage FROM projects WHERE id=$1',[req.params.id]);
  const projDefaultRet = projRes.rows[0] ? parseFloat(projRes.rows[0].default_retainage ?? 10) : 10;
  const prevLines = await pool.query(
    'SELECT pal.* FROM pay_app_lines pal JOIN pay_apps p ON p.id=pal.pay_app_id WHERE p.project_id=$1 AND p.app_number=$2',
    [req.params.id,app_number-1]
  );
  const prevMap = {};
  prevLines.rows.forEach(r => prevMap[r.sov_line_id]=r);
  for(const line of sovLines.rows) {
    const prev = prevMap[line.id];
    const prevPct = prev ? Math.min(100, parseFloat(prev.prev_pct)+parseFloat(prev.this_pct)) : 0;
    const retPct = prev ? parseFloat(prev.retainage_pct) : projDefaultRet;
    await pool.query(
      'INSERT INTO pay_app_lines(pay_app_id,sov_line_id,prev_pct,this_pct,retainage_pct,stored_materials) VALUES($1,$2,$3,$4,$5,$6)',
      [paId,line.id,prevPct,0,retPct,0]
    );
  }
  await logEvent(req.user.id, 'payapp_created', { project_id: parseInt(req.params.id), app_number });
  res.json(pa.rows[0]);
});

// GET /api/payapps/:id - Get single pay app with lines and change orders
router.get('/api/payapps/:id', auth, async (req,res) => {
  const pa = await pool.query(
    'SELECT pa.*,p.name as project_name,p.owner,p.contractor,p.architect,p.contact,p.contact_name,p.contact_phone,p.contact_email,p.original_contract,p.number as project_number,p.building_area,p.id as project_id,p.contract_date,p.payment_terms,p.include_architect,p.include_retainage FROM pay_apps pa JOIN projects p ON p.id=pa.project_id WHERE pa.id=$1 AND p.user_id=$2 AND pa.deleted_at IS NULL',
    [req.params.id, req.user.id]
  );
  if(!pa.rows[0]) return res.status(404).json({error:'Not found'});
  const lines = await pool.query(
    'SELECT pal.*,sl.item_id,sl.description,sl.scheduled_value,sl.sort_order FROM pay_app_lines pal JOIN sov_lines sl ON sl.id=pal.sov_line_id WHERE pal.pay_app_id=$1 ORDER BY sl.sort_order',
    [req.params.id]
  );
  const cos = await pool.query('SELECT * FROM change_orders WHERE pay_app_id=$1 ORDER BY co_number',[req.params.id]);
  const atts = await pool.query('SELECT * FROM attachments WHERE pay_app_id=$1 ORDER BY uploaded_at',[req.params.id]);
  res.json({...pa.rows[0],lines:lines.rows,change_orders:cos.rows,attachments:atts.rows});
});

// PUT /api/payapps/:id - Update pay app
router.put('/api/payapps/:id', auth, async (req,res) => {
  const {period_label,period_start,period_end,status,architect_certified,architect_name,architect_date,notes,po_number,special_notes} = req.body;
  // Boolean fields need explicit undefined check — false is valid but falsy
  const distOwner    = req.body.dist_owner    !== undefined ? req.body.dist_owner    : null;
  const distArchitect= req.body.dist_architect!== undefined ? req.body.dist_architect: null;
  const distContractor=req.body.dist_contractor!==undefined ? req.body.dist_contractor:null;

  // ── Security: prevent reverting a submitted PA back to draft ──────────────
  if (status && status !== 'submitted') {
    const cur = await pool.query(
      'SELECT status FROM pay_apps WHERE id=$1 AND project_id IN (SELECT id FROM projects WHERE user_id=$2)',
      [req.params.id, req.user.id]
    );
    if (cur.rows[0]?.status === 'submitted') {
      return res.status(409).json({ error: 'A submitted pay application cannot be reverted. Contact support if needed.' });
    }
  }

  // COALESCE prevents partial updates from nuking fields not included in the request
  const r = await pool.query(
    `UPDATE pay_apps SET
      period_label    = COALESCE($1,  period_label),
      period_start    = COALESCE($2,  period_start),
      period_end      = COALESCE($3,  period_end),
      status          = COALESCE($4,  status),
      architect_certified = COALESCE($5, architect_certified),
      architect_name  = COALESCE($6,  architect_name),
      architect_date  = COALESCE($7,  architect_date),
      notes           = COALESCE($8,  notes),
      dist_owner      = COALESCE($11, dist_owner),
      dist_architect  = COALESCE($12, dist_architect),
      dist_contractor = COALESCE($13, dist_contractor),
      po_number       = COALESCE($14, po_number),
      special_notes   = COALESCE($15, special_notes)
     WHERE id=$9 AND project_id IN (SELECT id FROM projects WHERE user_id=$10)
     RETURNING *`,
    [period_label||null, period_start||null, period_end||null,
     status||null, architect_certified||null, architect_name||null,
     architect_date||null, notes||null,
     req.params.id, req.user.id,
     distOwner, distArchitect, distContractor,
     po_number||null, special_notes||null]
  );
  if(!r.rows[0]) return res.status(404).json({error:'Not found'});
  if (status === 'submitted') {
    await logEvent(req.user.id, 'payapp_submitted', { pay_app_id: parseInt(req.params.id) });
    // Snapshot amount_due and retention_held using correct column names
    try {
      const snap = await pool.query(`
        SELECT
          SUM(sl.scheduled_value * pal.this_pct / 100
              - sl.scheduled_value * (pal.prev_pct + pal.this_pct) / 100 * pal.retainage_pct / 100
              + sl.scheduled_value * pal.prev_pct / 100 * pal.retainage_pct / 100) AS amount_due,
          SUM(sl.scheduled_value * (pal.prev_pct + pal.this_pct) / 100 * pal.retainage_pct / 100) AS retention_held
        FROM pay_app_lines pal
        JOIN sov_lines sl ON sl.id = pal.sov_line_id
        WHERE pal.pay_app_id=$1`, [req.params.id]);
      if (snap.rows[0]) {
        await pool.query(
          'UPDATE pay_apps SET amount_due=$1, retention_held=$2, submitted_at=COALESCE(submitted_at, NOW()) WHERE id=$3',
          [snap.rows[0].amount_due||0, snap.rows[0].retention_held||0, req.params.id]
        );
      }
    } catch(snapErr) { console.error('[Snap amount_due]', snapErr.message); }

    // Auto-calculate payment_due_date from project payment_terms (e.g. "Net 30" → today + 30 days)
    try {
      const projR = await pool.query(
        'SELECT payment_terms FROM projects WHERE id IN (SELECT project_id FROM pay_apps WHERE id=$1)',
        [req.params.id]
      );
      if (projR.rows[0]?.payment_terms) {
        const terms = projR.rows[0].payment_terms.toString().toLowerCase().trim();
        let daysToAdd = 30; // sensible default
        if (terms === 'due on receipt' || terms === 'due on demand') {
          daysToAdd = 0;
        } else {
          const m = terms.match(/net\s*(\d+)/);
          if (m) daysToAdd = parseInt(m[1]);
        }
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + daysToAdd);
        await pool.query(
          'UPDATE pay_apps SET payment_due_date=$1 WHERE id=$2',
          [dueDate.toISOString().split('T')[0], req.params.id]
        );
      }
    } catch(dueErr) { console.error('[Auto due date]', dueErr.message); }

    // Auto-generate lien waiver on submit (non-blocking)
    // - Progress payments → Conditional Waiver (with amount, conditional on receiving payment)
    // - Final payment (≥98% complete) → Unconditional Final Waiver (waives all remaining rights)
    try {
      const lienCheck = await pool.query(
        'SELECT id FROM lien_documents WHERE pay_app_id=$1', [req.params.id]
      );
      if (!lienCheck.rows[0]) {
        const projData = await pool.query(
          `SELECT p.*, cs.company_name, cs.logo_filename, cs.contact_name
           FROM projects p
           LEFT JOIN company_settings cs ON cs.user_id = p.user_id
           WHERE p.id IN (SELECT project_id FROM pay_apps WHERE id=$1)`,
          [req.params.id]
        );
        if (projData.rows[0]) {
          const proj = projData.rows[0];
          const paRow = await pool.query(
            'SELECT amount_due, period_end, app_number, period_label FROM pay_apps WHERE id=$1',
            [req.params.id]
          );
          const pa = paRow.rows[0] || {};
          const lienAmount = parseFloat(pa.amount_due || 0);
          const through_date = pa.period_end
            ? new Date(pa.period_end).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0];
          const signatory_name = proj.contact_name || proj.company_name || proj.contractor || 'Contractor';
          const jurisdiction = proj.jurisdiction || 'california';
          const pay_app_ref = `Pay App #${pa.app_number}${pa.period_label ? ' — ' + pa.period_label : ''}`;

          // Determine if this is a final payment: ≥98% of contract billed
          const compCheck = await pool.query(`
            SELECT SUM(sl.scheduled_value) as total_contract,
                   SUM(sl.scheduled_value * (pal.prev_pct + pal.this_pct) / 100) as total_billed
            FROM pay_app_lines pal JOIN sov_lines sl ON sl.id=pal.sov_line_id
            WHERE pal.pay_app_id=$1`, [req.params.id]);
          const totalContract = parseFloat(compCheck.rows[0]?.total_contract || 0);
          const totalBilled = parseFloat(compCheck.rows[0]?.total_billed || 0);
          const isFinalPayment = totalContract > 0 && (totalBilled / totalContract) >= 0.98;

          const doc_type = isFinalPayment ? 'unconditional_final_waiver' : 'conditional_waiver';
          const lienAmountForDoc = isFinalPayment ? 0 : lienAmount;
          const fname = `lien_${doc_type}_${req.params.id}_${Date.now()}.pdf`;
          const fpath = path.join(__dirname, '..', 'uploads', fname);
          const signedAt = new Date();

          await generateLienDocPDF({
            fpath, doc_type, project: proj,
            through_date, amount: lienAmountForDoc,
            maker_of_check: proj.owner || '',
            check_payable_to: proj.company_name || proj.contractor || '',
            signatory_name, signatory_title: null,
            signedAt, ip: req.ip || 'auto', jurisdiction, pay_app_ref
          });
          await pool.query(
            `INSERT INTO lien_documents(project_id, pay_app_id, doc_type, filename, jurisdiction,
               through_date, amount, maker_of_check, check_payable_to,
               signatory_name, signatory_title, signed_at, signatory_ip)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [proj.id, parseInt(req.params.id), doc_type, fname, jurisdiction,
             through_date, lienAmountForDoc, proj.owner||null, proj.company_name||proj.contractor||null,
             signatory_name, null, signedAt, req.ip || 'auto']
          );
          await logEvent(req.user.id, 'lien_auto_generated', {
            pay_app_id: parseInt(req.params.id), doc_type, is_final: isFinalPayment
          });
        }
      }
    } catch(lienErr) { console.error('[Auto lien release]', lienErr.message); }
  }
  res.json(r.rows[0]);
});

// POST /api/payapps/:id/unsubmit - Unsubmit a pay app
router.post('/api/payapps/:id/unsubmit', auth, async (req,res) => {
  try {
    const r = await pool.query(
      `UPDATE pay_apps SET status='draft', submitted_at=NULL
       WHERE id=$1 AND project_id IN (SELECT id FROM projects WHERE user_id=$2)
       RETURNING id, status`,
      [req.params.id, req.user.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    await logEvent(req.user.id, 'payapp_unsubmitted', { pay_app_id: parseInt(req.params.id) });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/payapps/:id - Soft-delete a pay app
router.delete('/api/payapps/:id', auth, async (req, res) => {
  try {
    const cascade = req.query.cascade === 'true';

    // Verify ownership and get app_number + project_id
    const target = await pool.query(
      `SELECT pa.id, pa.app_number, pa.project_id, pa.status
       FROM pay_apps pa
       JOIN projects p ON p.id = pa.project_id
       WHERE pa.id=$1 AND p.user_id=$2 AND pa.deleted_at IS NULL`,
      [req.params.id, req.user.id]
    );
    if (!target.rows[0]) return res.status(404).json({ error: 'Pay application not found or already deleted' });

    const { app_number, project_id } = target.rows[0];

    // Check for subsequent non-deleted pay apps that depend on this one
    const subsequent = await pool.query(
      `SELECT id, app_number, period_label, status
       FROM pay_apps
       WHERE project_id=$1 AND app_number > $2 AND deleted_at IS NULL
       ORDER BY app_number`,
      [project_id, app_number]
    );

    // If there are subsequent pay apps and cascade not requested, return a warning
    if (subsequent.rows.length > 0 && !cascade) {
      return res.status(409).json({
        warning: true,
        message: `Pay App #${app_number} has ${subsequent.rows.length} subsequent application${subsequent.rows.length > 1 ? 's' : ''} that depend on it for their "Previous Billing" totals.`,
        subsequent: subsequent.rows.map(r => ({ id: r.id, app_number: r.app_number, period_label: r.period_label, status: r.status })),
        target: { id: target.rows[0].id, app_number }
      });
    }

    // Delete the target + all subsequent if cascade
    const toDelete = [target.rows[0].id, ...subsequent.rows.map(r => r.id)];
    await pool.query(
      `UPDATE pay_apps SET deleted_at=NOW(), deleted_by=$1 WHERE id = ANY($2::int[])`,
      [req.user.id, toDelete]
    );

    for (const pid of toDelete) {
      await logEvent(req.user.id, 'payapp_deleted', { pay_app_id: pid, cascade: toDelete.length > 1 });
    }

    res.json({
      ok: true,
      deleted_count: toDelete.length,
      app_numbers: [app_number, ...subsequent.rows.map(r => r.app_number)]
    });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/payapps/:id/restore - Restore a soft-deleted pay app
router.post('/api/payapps/:id/restore', auth, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE pay_apps SET deleted_at=NULL, deleted_by=NULL
       WHERE id=$1
         AND project_id IN (SELECT id FROM projects WHERE user_id=$2)
         AND deleted_at IS NOT NULL
       RETURNING id, app_number`,
      [req.params.id, req.user.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Pay application not found or not deleted' });
    await logEvent(req.user.id, 'payapp_restored', { pay_app_id: parseInt(req.params.id) });
    res.json({ ok: true, id: r.rows[0].id, app_number: r.rows[0].app_number });
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// GET /api/projects/:id/payapps/deleted - Get deleted pay apps for a project
router.get('/api/projects/:id/payapps/deleted', auth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT pa.id, pa.app_number, pa.period_label, pa.amount_due, pa.retention_held,
              pa.deleted_at, pa.status,
              u.name as deleted_by_name
       FROM pay_apps pa
       JOIN projects p ON p.id = pa.project_id
       LEFT JOIN users u ON u.id = pa.deleted_by
       WHERE pa.project_id=$1
         AND p.user_id=$2
         AND pa.deleted_at IS NOT NULL
         AND pa.deleted_at > NOW() - INTERVAL '1 year'
       ORDER BY pa.deleted_at DESC`,
      [req.params.id, req.user.id]
    );
    res.json(r.rows);
  } catch(e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Internal server error' }); }
});

// PUT /api/payapps/:id/lines - Update pay app lines (percentages, retainage, stored materials)
router.put('/api/payapps/:id/lines', auth, async (req,res) => {
  // Verify ownership before updating any lines
  const own = await pool.query(
    'SELECT pa.id, pa.status FROM pay_apps pa JOIN projects p ON p.id=pa.project_id WHERE pa.id=$1 AND p.user_id=$2',
    [req.params.id, req.user.id]
  );
  if(!own.rows[0]) return res.status(403).json({error:'Forbidden'});
  if(own.rows[0].status === 'submitted') return res.status(409).json({error:'Cannot edit lines on a submitted pay application.'});

  const {lines} = req.body;

  // ── Input validation: pct values must be 0–100, amounts non-negative ──────
  for(const line of lines) {
    const thisPct = parseFloat(line.this_pct);
    const retPct  = parseFloat(line.retainage_pct);
    const stored  = parseFloat(line.stored_materials || 0);
    if(isNaN(thisPct) || thisPct < 0 || thisPct > 100)
      return res.status(400).json({ error: `this_pct must be 0–100 (got ${line.this_pct})` });
    if(isNaN(retPct) || retPct < 0 || retPct > 100)
      return res.status(400).json({ error: `retainage_pct must be 0–100 (got ${line.retainage_pct})` });
    if(isNaN(stored) || stored < 0)
      return res.status(400).json({ error: `stored_materials must be 0 or positive (got ${line.stored_materials})` });
  }

  for(const line of lines) {
    await pool.query(
      'UPDATE pay_app_lines SET this_pct=$1,retainage_pct=$2,stored_materials=$3 WHERE id=$4 AND pay_app_id=$5',
      [line.this_pct,line.retainage_pct,line.stored_materials||0,line.id,req.params.id]
    );
  }
  await logEvent(req.user.id, 'payapp_lines_saved', { pay_app_id: parseInt(req.params.id), line_count: lines.length });
  res.json({ok:true});
});

// CHANGE ORDERS
// POST /api/payapps/:id/changeorders - Add change order
router.post('/api/payapps/:id/changeorders', auth, async (req,res) => {
  // Verify user owns this pay app before adding change orders
  const own = await pool.query(
    'SELECT pa.id FROM pay_apps pa JOIN projects p ON p.id=pa.project_id WHERE pa.id=$1 AND p.user_id=$2',
    [req.params.id, req.user.id]
  );
  if (!own.rows[0]) return res.status(403).json({ error: 'Forbidden' });
  const {co_number,description,amount,status} = req.body;
  const r = await pool.query(
    'INSERT INTO change_orders(pay_app_id,co_number,description,amount,status) VALUES($1,$2,$3,$4,$5) RETURNING *',
    [req.params.id,co_number,description,amount,status||'pending']
  );
  res.json(r.rows[0]);
});

// PUT /api/changeorders/:id - Update change order
router.put('/api/changeorders/:id', auth, async (req,res) => {
  const own = await pool.query(
    'SELECT co.id FROM change_orders co JOIN pay_apps pa ON pa.id=co.pay_app_id JOIN projects p ON p.id=pa.project_id WHERE co.id=$1 AND p.user_id=$2',
    [req.params.id, req.user.id]
  );
  if(!own.rows[0]) return res.status(403).json({error:'Forbidden'});
  const {description,amount,status} = req.body;
  const r = await pool.query(
    'UPDATE change_orders SET description=$1,amount=$2,status=$3 WHERE id=$4 RETURNING *',
    [description,amount,status,req.params.id]
  );
  res.json(r.rows[0]);
});

// DELETE /api/changeorders/:id - Delete change order
router.delete('/api/changeorders/:id', auth, async (req,res) => {
  const own = await pool.query(
    'SELECT co.id FROM change_orders co JOIN pay_apps pa ON pa.id=co.pay_app_id JOIN projects p ON p.id=pa.project_id WHERE co.id=$1 AND p.user_id=$2',
    [req.params.id, req.user.id]
  );
  if(!own.rows[0]) return res.status(403).json({error:'Forbidden'});
  await pool.query('DELETE FROM change_orders WHERE id=$1',[req.params.id]);
  res.json({ok:true});
});

// ATTACHMENTS
// POST /api/payapps/:id/attachments - Upload file attachment
router.post('/api/payapps/:id/attachments', auth, upload.single('file'), async (req,res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  // Verify user owns this pay app before attaching files
  const own = await pool.query(
    'SELECT pa.id FROM pay_apps pa JOIN projects p ON p.id=pa.project_id WHERE pa.id=$1 AND p.user_id=$2',
    [req.params.id, req.user.id]
  );
  if (!own.rows[0]) {
    try { fs.unlinkSync(req.file.path); } catch(_) {}
    return res.status(403).json({ error: 'Forbidden' });
  }
  // MIME type whitelist for attachments
  const allowedMime = ['application/pdf','image/jpeg','image/png','image/gif','image/webp',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv'];
  if (!allowedMime.includes(req.file.mimetype)) {
    try { fs.unlinkSync(req.file.path); } catch(_) {}
    return res.status(400).json({ error: 'File type not allowed. Accepted: PDF, images, Word, Excel, CSV.' });
  }
  const {originalname,filename,mimetype} = req.file;
  const actualSize = (() => { try { return fs.statSync(path.join(__dirname,'uploads',filename)).size; } catch(_) { return req.file.size; } })();
  const r = await pool.query(
    'INSERT INTO attachments(pay_app_id,filename,original_name,file_size,mime_type) VALUES($1,$2,$3,$4,$5) RETURNING *',
    [req.params.id,filename,originalname,actualSize,mimetype]
  );
  res.json(r.rows[0]);
});

// DELETE /api/attachments/:id - Delete attachment
router.delete('/api/attachments/:id', auth, async (req,res) => {
  const own = await pool.query(
    'SELECT a.filename FROM attachments a JOIN pay_apps pa ON pa.id=a.pay_app_id JOIN projects p ON p.id=pa.project_id WHERE a.id=$1 AND p.user_id=$2',
    [req.params.id, req.user.id]
  );
  if(!own.rows[0]) return res.status(403).json({error:'Forbidden'});
  await pool.query('DELETE FROM attachments WHERE id=$1',[req.params.id]);
  const fp = path.join(__dirname,'uploads',own.rows[0].filename);
  if(fs.existsSync(fp)) fs.unlinkSync(fp);
  res.json({ok:true});
});

// ──────────────────────────────────────────────────────────────────────────────
// PDF GENERATION
// ──────────────────────────────────────────────────────────────────────────────

// GET /api/payapps/:id/pdf - Generate and download pay app PDF
router.get('/api/payapps/:id/pdf', async (req,res) => {
  const token = req.query.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  let decoded;
  try { decoded = jwt.verify(token, JWT_SECRET); } catch(e) { return res.status(401).json({error:'Invalid token'}); }

  const paRes = await pool.query(
    `SELECT pa.*,p.name as pname,p.owner,p.contractor,p.architect,p.original_contract,
            p.number as pnum,p.payment_terms,p.contract_date,
            p.include_architect,p.include_retainage,
            cs.logo_filename,cs.signature_filename,cs.default_payment_terms,
            cs.contact_name,cs.company_name
     FROM pay_apps pa
     JOIN projects p ON p.id=pa.project_id
     LEFT JOIN company_settings cs ON cs.user_id=p.user_id
     WHERE pa.id=$1 AND p.user_id=$2`,
    [req.params.id, decoded.id]
  );
  const pa = paRes.rows[0];
  if(!pa) return res.status(404).json({error:'Not found'});
  await logEvent(decoded.id, 'pdf_downloaded', { pay_app_id: parseInt(req.params.id) });
  const lines = await pool.query(
    'SELECT pal.*,sl.item_id,sl.description,sl.scheduled_value FROM pay_app_lines pal JOIN sov_lines sl ON sl.id=pal.sov_line_id WHERE pal.pay_app_id=$1 ORDER BY sl.sort_order',
    [req.params.id]
  );
  const cos = await pool.query('SELECT * FROM change_orders WHERE pay_app_id=$1',[req.params.id]);

  let tComp=0,tRet=0,tThis=0,tPrev=0,tPrevCert=0;
  lines.rows.forEach(r=>{
    const sv=parseFloat(r.scheduled_value);
    const retPct=parseFloat(r.retainage_pct)/100;
    const prev=sv*parseFloat(r.prev_pct)/100;
    const thisPer=sv*parseFloat(r.this_pct)/100;
    const comp=prev+thisPer+parseFloat(r.stored_materials||0);
    tPrev+=prev; tThis+=thisPer; tComp+=comp;
    tRet+=comp*retPct;
    tPrevCert+=prev*(1-retPct);
  });
  const tCO=cos.rows.reduce((s,c)=>s+parseFloat(c.amount||0),0);
  const contract=parseFloat(pa.original_contract)+tCO;
  const earned=tComp-tRet;
  const due=Math.max(0,earned-tPrevCert);

  // ── Load logo and signature as base64 for embedding ──────────────────────
  const imgMime = buf => {
    if (buf[0]===0x89 && buf[1]===0x50) return 'image/png';
    if (buf[0]===0xFF && buf[1]===0xD8) return 'image/jpeg';
    if (buf[0]===0x47 && buf[1]===0x49) return 'image/gif';
    if (buf[0]===0x52 && buf[1]===0x49) return 'image/webp';
    return 'image/png';
  };
  const readImgB64 = filename => {
    if (!filename) return null;
    try {
      const fp = path.join(__dirname, '..', 'uploads', filename);
      if (!fs.existsSync(fp)) return null;
      const buf = fs.readFileSync(fp);
      return `data:${imgMime(buf)};base64,${buf.toString('base64')}`;
    } catch(e) { return null; }
  };
  const logoBase64 = readImgB64(pa.logo_filename);
  const sigBase64  = readImgB64(pa.signature_filename);

  // ── Load photo attachments for this pay app ───────────────────────────────
  const photoAttsRes = await pool.query(
    `SELECT filename, original_name FROM attachments WHERE pay_app_id=$1 AND mime_type LIKE 'image/%' ORDER BY uploaded_at`,
    [req.params.id]
  );
  const photoAttachments = photoAttsRes.rows.map(a => {
    const b64 = readImgB64(a.filename);
    if (!b64) return null;
    return { base64: b64, name: a.original_name || a.filename, filePath: path.join(__dirname, '..', 'uploads', a.filename) };
  }).filter(Boolean);

  // ── Load PDF document attachments ─────
  const docAttsRes = await pool.query(
    `SELECT filename, original_name FROM attachments WHERE pay_app_id=$1 AND mime_type='application/pdf' ORDER BY uploaded_at`,
    [req.params.id]
  );
  const docAttachments = docAttsRes.rows.map(a => ({ name: a.original_name || a.filename }));

  if (!pa.logo_filename) {
    console.log(`[PDF] No logo_filename for user_id=${decoded.id} (pay_app=${req.params.id})`);
  } else {
    const lp = path.join(__dirname, '..', 'uploads', pa.logo_filename);
    if (!fs.existsSync(lp)) console.log(`[PDF] Logo file missing: ${lp}`);
  }

  const totals = { tComp, tRet, tPrevCert, tCO, contract, earned, due };
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="PayApp_${pa.app_number}_${(pa.pname||'').replace(/\s+/g,'_')}.pdf"`);

  // ── Puppeteer: pixel-perfect PDF matching the on-screen preview ──────────
  if (puppeteer) {
    let browser;
    try {
      const { generatePayAppHTML } = getServerHelpers();
      if (!generatePayAppHTML) throw new Error('generatePayAppHTML not available');
      const html = generatePayAppHTML(pa, lines.rows, cos.rows, totals, logoBase64, sigBase64, photoAttachments, docAttachments);
      browser = await puppeteer.launch({
        args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu']
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: { top: '0.5in', right: '0.45in', bottom: '0.5in', left: '0.45in' }
      });
      res.send(pdfBuffer);
      return;
    } catch(puppErr) {
      console.error('[PDF] Puppeteer error, falling back to PDFKit:', puppErr.message);
    } finally {
      if (browser) await browser.close().catch(()=>{});
    }
  }

  // PDFKit implementation
  const doc=new PDFDocument({size:'LETTER',margin:45});
  doc.pipe(res);

  doc.fontSize(15).font('Helvetica-Bold').text('Document G702',{align:'center'});
  doc.fontSize(10).font('Helvetica').text('Application and Certificate for Payment',{align:'center'});
  doc.moveDown(0.4);
  doc.moveTo(45,doc.y).lineTo(567,doc.y).lineWidth(0.5).stroke();
  doc.moveDown(0.4);
  const L=45,R=310;
  doc.fontSize(9);
  [
    ['Project: '+(pa.pname||''), 'Application No: '+pa.app_number],
    ['Owner: '+(pa.owner||''),   'Period: '+(pa.period_label||'')],
    ['Contractor: '+(pa.contractor||''), 'Contract Date: '+(pa.contract_date?new Date(pa.contract_date).toLocaleDateString():'')],
    ['Architect: '+(pa.architect||''),   'Project No: '+(pa.pnum||'')]
  ].forEach(([l,r])=>{
    const y=doc.y;
    doc.font('Helvetica').text(l,L,y,{width:240});
    doc.text(r,R,y,{width:240});
  });
  if(pa.po_number){doc.font('Helvetica').text('PO #: '+pa.po_number,L,doc.y,{width:240});}
  doc.moveDown(0.4);
  doc.moveTo(45,doc.y).lineTo(567,doc.y).lineWidth(0.5).stroke();
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(10).text('Summary of Work');
  doc.moveDown(0.2);
  [
    ['A.','Original Contract Sum',fmt(pa.original_contract)],
    ['B.','Net Change by Change Orders',fmt(tCO)],
    ['C.','Contract Sum to Date (A+B)',fmt(contract)],
    ['D.','Total Completed and Stored to Date',fmt(tComp)],
    ['E.','Retainage to Date',fmt(tRet)],
    ['F.','Total Earned Less Retainage (D-E)',fmt(earned)],
    ['G.','Less Previous Certificates for Payment',fmt(tPrevCert)],
    ['H.','CURRENT PAYMENT DUE',fmt(due)],
    ['I.','Balance to Finish, Plus Retainage',fmt(contract-tComp+tRet)]
  ].forEach(([ltr,lbl,val])=>{
    const y=doc.y;
    doc.font(ltr==='H.'?'Helvetica-Bold':'Helvetica').fontSize(9);
    doc.text(ltr,L,y,{width:18});
    doc.text(lbl,L+20,y,{width:330});
    doc.text(val,L+360,y,{width:140,align:'right'});
  });

  if(pa.special_notes){const plainNotes=pa.special_notes.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ');doc.moveDown(0.5);doc.font('Helvetica-Bold').fontSize(8).text('Notes:',L,doc.y,{continued:true});doc.font('Helvetica').text(' '+plainNotes,{width:500});}

  doc.addPage();
  doc.fontSize(13).font('Helvetica-Bold').text('Document G703 - Continuation Sheet',{align:'center'});
  doc.fontSize(9).font('Helvetica').text('Application #'+pa.app_number+'  -  '+(pa.period_label||'')+'  -  '+(pa.pname||''),{align:'center'});
  doc.moveDown(0.5);
  const cx=[45,90,160,235,293,340,393,448,488,532];
  const cw=[43,68,73,56,45,51,53,38,42,40];
  const hdrs=['Item','Description','Sched Value','Prev Billed','% Prev','This Period','Total Comp','Ret%','Retainage','Balance'];
  const hy=doc.y;
  doc.font('Helvetica-Bold').fontSize(7);
  hdrs.forEach((h,i)=>doc.text(h,cx[i],hy,{width:cw[i],align:i>1?'right':'left'}));
  doc.moveDown(0.3);
  doc.moveTo(45,doc.y).lineTo(567,doc.y).lineWidth(0.5).stroke();
  doc.font('Helvetica').fontSize(7);
  let tSV2=0,tPrev2=0,tThis2=0,tComp2=0,tRet2=0;
  lines.rows.forEach(r=>{
    const sv=parseFloat(r.scheduled_value);
    const prev=sv*parseFloat(r.prev_pct)/100;
    const thisPer=sv*parseFloat(r.this_pct)/100;
    const comp=prev+thisPer;
    const ret=comp*parseFloat(r.retainage_pct)/100;
    const bal=sv-comp;
    tSV2+=sv; tPrev2+=prev; tThis2+=thisPer; tComp2+=comp; tRet2+=ret;
    if(doc.y>700){ doc.addPage(); doc.fontSize(7); }
    const y=doc.y;
    if(sv===0){
      doc.fillColor('#888').text(r.item_id||'',cx[0],y,{width:cw[0]});
      doc.text(r.description||'',cx[1],y,{width:440});
      doc.fillColor('#000');
    } else {
      [r.item_id,r.description,fmt(sv),fmt(prev),parseFloat(r.prev_pct).toFixed(0)+'%',fmt(thisPer),fmt(comp),parseFloat(r.retainage_pct).toFixed(0)+'%',fmt(ret),fmt(bal)]
        .forEach((v,i)=>doc.text(v,cx[i],y,{width:cw[i],align:i>1?'right':'left'}));
    }
  });
  doc.moveDown(0.3);
  doc.moveTo(45,doc.y).lineTo(567,doc.y).lineWidth(0.5).stroke();
  doc.font('Helvetica-Bold').fontSize(7);
  const ty=doc.y+2;
  ['','GRAND TOTAL',fmt(tSV2),fmt(tPrev2),'',fmt(tThis2),fmt(tComp2),'',fmt(tRet2),fmt(tSV2-tComp2)]
    .forEach((v,i)=>doc.text(v,cx[i],ty,{width:cw[i],align:i>1?'right':'left'}));

  doc.end();
});

// ──────────────────────────────────────────────────────────────────────────────
// EMAIL SENDING
// ──────────────────────────────────────────────────────────────────────────────

// POST /api/payapps/:id/email - Send pay app via email with PDF
router.post('/api/payapps/:id/email', auth, async (req, res) => {
  const { to, cc, subject, message, attach_lien_waiver, include_payment_link } = req.body;
  const shouldAttachLien = attach_lien_waiver !== false;
  const shouldIncludePayLink = include_payment_link !== false;
  if (!to) return res.status(400).json({ error: 'Recipient email (to) is required' });

  try {
    const paRes = await pool.query(
      `SELECT pa.*,p.name as pname,p.owner,p.contractor,p.architect,p.original_contract,
              p.number as pnum,p.payment_terms,p.contract_date,
              p.include_architect,p.include_retainage,
              cs.logo_filename,cs.signature_filename,cs.default_payment_terms,
              cs.contact_name,cs.company_name
       FROM pay_apps pa
       JOIN projects p ON p.id=pa.project_id
       LEFT JOIN company_settings cs ON cs.user_id=p.user_id
       WHERE pa.id=$1 AND p.user_id=$2`,
      [req.params.id, req.user.id]
    );
    const pa = paRes.rows[0];
    if (!pa) return res.status(404).json({ error: 'Pay app not found' });

    const lines = await pool.query(
      'SELECT pal.*,sl.item_id,sl.description,sl.scheduled_value FROM pay_app_lines pal JOIN sov_lines sl ON sl.id=pal.sov_line_id WHERE pal.pay_app_id=$1 ORDER BY sl.sort_order',
      [req.params.id]
    );
    const cos = await pool.query('SELECT * FROM change_orders WHERE pay_app_id=$1', [req.params.id]);

    let tComp=0, tRet=0, tPrevCert=0;
    lines.rows.forEach(r => {
      const sv=parseFloat(r.scheduled_value);
      const retPct=parseFloat(r.retainage_pct)/100;
      const prev=sv*parseFloat(r.prev_pct)/100;
      const thisPer=sv*parseFloat(r.this_pct)/100;
      const comp=prev+thisPer+parseFloat(r.stored_materials||0);
      tComp+=comp; tRet+=comp*retPct; tPrevCert+=prev*(1-retPct);
    });
    const tCO=cos.rows.reduce((s,c)=>s+parseFloat(c.amount||0),0);
    const contract=parseFloat(pa.original_contract)+tCO;
    const earned=tComp-tRet;
    const due=Math.max(0,earned-tPrevCert);
    const totals={tComp,tRet,tPrevCert,tCO,contract,earned,due};

    // Auto-generate payment link if GC has Stripe Connect and pay app doesn't have one yet
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    let payNowUrl = null;
    if (shouldIncludePayLink) {
      try {
        const acctCheck = (await pool.query(
          'SELECT stripe_account_id FROM connected_accounts WHERE user_id=$1 AND charges_enabled=TRUE',
          [req.user.id]
        )).rows[0];
        if (acctCheck && due > 0) {
          let payToken = pa.payment_link_token;
          if (!payToken) {
            payToken = generatePaymentToken();
            await pool.query('UPDATE pay_apps SET payment_link_token=$1 WHERE id=$2', [payToken, req.params.id]);
          }
          payNowUrl = `${baseUrl}/pay/${payToken}`;
        }
      } catch(payLinkErr) { console.error('[Email] Payment link gen error:', payLinkErr.message); }
    }

    const safeMsg = (message||'').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    const payNowBtnHtml = payNowUrl ? `
        <div style="text-align:center;margin:20px 0 8px">
          <a href="${payNowUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:12pt">Pay Now — $${due.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</a>
        </div>
        <p style="font-size:9pt;color:#888;text-align:center;margin:4px 0 0">ACH bank transfer or credit card accepted. Secure payment via Stripe.</p>` : '';
    const emailHtml = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#2563eb;padding:18px 24px;color:#fff">
        <h2 style="margin:0;font-size:16pt">Pay Application #${pa.app_number}</h2>
        <div style="font-size:10pt;margin-top:4px;opacity:0.9">${pa.pname||''} · ${pa.period_label||''}</div>
      </div>
      <div style="padding:24px;border:1px solid #ddd;border-top:0">
        ${safeMsg ? `<p style="margin-top:0">${safeMsg}</p><hr style="border:0;border-top:1px solid #eee;margin:16px 0">` : ''}
        <table style="width:100%;border-collapse:collapse;font-size:10pt">
          <tr><td style="padding:5px 8px;color:#555">Project</td><td style="padding:5px 8px;font-weight:bold">${pa.pname||''}</td></tr>
          <tr style="background:#f7f7f7"><td style="padding:5px 8px;color:#555">Application #</td><td style="padding:5px 8px">${pa.app_number}</td></tr>
          <tr><td style="padding:5px 8px;color:#555">Period</td><td style="padding:5px 8px">${pa.period_label||''}</td></tr>
          <tr style="background:#f7f7f7"><td style="padding:5px 8px;color:#555;font-weight:bold">Current Payment Due</td>
            <td style="padding:5px 8px;font-weight:bold;color:#2563eb;font-size:11pt">$${due.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>
        </table>
        ${payNowBtnHtml}
      </div>
      <div style="padding:10px 24px;font-size:8pt;color:#aaa;text-align:center">
        Sent via <a href="https://constructinv.varshyl.com" style="color:#aaa">ConstructInvoice AI</a> · Varshyl Inc.
      </div>
    </div>`;

    const pdfFilename = `PayApp_${pa.app_number}_${(pa.pname||'').replace(/\s+/g,'_')}.pdf`;
    const emailAttachments = [];

    try {
      const pdfDoc = new PDFDocument({ size: 'LETTER', margin: 45 });
      const chunks = [];
      pdfDoc.on('data', c => chunks.push(c));
      await new Promise((resolve, reject) => {
        pdfDoc.on('end', resolve);
        pdfDoc.on('error', reject);
        pdfDoc.fontSize(15).font('Helvetica-Bold').text('Document G702', { align: 'center' });
        pdfDoc.fontSize(10).font('Helvetica').text('Application and Certificate for Payment', { align: 'center' });
        pdfDoc.moveDown(0.5);
        pdfDoc.fontSize(11).font('Helvetica-Bold').text(pa.pname || 'Pay Application');
        pdfDoc.fontSize(9).font('Helvetica').text(`Application #${pa.app_number}  ·  ${pa.period_label || ''}`);
        if (pa.po_number) pdfDoc.text(`PO #: ${pa.po_number}`);
        pdfDoc.moveDown(0.4);
        pdfDoc.fontSize(9).text(`Original Contract Sum: $${Number(totals.contract || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
        pdfDoc.text(`Net Change by Change Orders: $${Number(totals.tCO || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
        pdfDoc.text(`Total Completed & Stored to Date: $${Number(totals.tComp || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
        pdfDoc.text(`Retainage: $${Number(totals.tRet || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
        pdfDoc.text(`Total Earned Less Retainage: $${Number(totals.earned || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
        pdfDoc.text(`Less Previous Certificates: $${Number(totals.tPrevCert || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
        pdfDoc.moveDown(0.3);
        pdfDoc.font('Helvetica-Bold').text(`Current Payment Due: $${Number(totals.due || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
        if (pa.special_notes) { const pn=pa.special_notes.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' '); pdfDoc.moveDown(0.5); pdfDoc.font('Helvetica-Bold').fontSize(8).text('Notes:',{continued:true}); pdfDoc.font('Helvetica').text(' '+pn); }
        pdfDoc.moveDown(1);
        pdfDoc.fontSize(8).font('Helvetica').fillColor('#888').text('Generated by ConstructInvoice AI · Full PDF available in app', { align: 'center' });
        pdfDoc.end();
      });
      const pdfBuf = Buffer.concat(chunks);
      emailAttachments.push({ filename: pdfFilename, content: pdfBuf.toString('base64') });
      console.log('[Email PDF] Generated', pdfBuf.length, 'bytes');
    } catch(pdfErr) {
      console.error('[Email PDF] Failed:', pdfErr.message);
    }

    const fromEmail = process.env.FROM_EMAIL || 'billing@varshyl.com';
    if (!process.env.RESEND_API_KEY) {
      console.log(`[DEV Email] TO:${to} CC:${cc||'-'} | ${subject||'Pay App #'+pa.app_number} | attachments:${emailAttachments.length}`);
    } else {
      const payload = {
        from: fromEmail,
        to: [to],
        subject: subject || `Pay Application #${pa.app_number} — ${pa.pname||''} (${pa.period_label||''})`,
        html: emailHtml,
        attachments: emailAttachments
      };
      if (cc) payload.cc = [cc];
      const r = await fetchEmail('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const errBody = await r.text().catch(()=>'');
        console.error('[Email Route] Resend error:', r.status, errBody);
        return res.status(502).json({ error: 'Email delivery failed', detail: errBody });
      }
    }

    if (pa.status !== 'submitted') {
      await pool.query('UPDATE pay_apps SET status=$1 WHERE id=$2', ['submitted', req.params.id]);
    }
    await logEvent(req.user.id, 'email_sent', { pay_app_id: parseInt(req.params.id) });
    res.json({ ok: true, attachments: emailAttachments.length });

  } catch(e) {
    console.error('[Email Route] Error:', e.message, e.stack);
    res.status(500).json({ error: 'Failed to send email', detail: e.message });
  }
});

module.exports = router;
