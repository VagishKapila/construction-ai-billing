const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { pool } = require('../../db');
const { auth } = require('../middleware/auth');
const { trialGate } = require('../middleware/trialGate');
const { upload } = require('../middleware/fileValidation');
const { logEvent } = require('../lib/logEvent');
const { fmt } = require('../lib/format');
const PDFDocument = require('pdfkit');
const { generateLienDocPDF } = require('./lienWaivers');
const { generatePaymentToken } = require('../services/stripe');
const { generatePayAppHTML } = require('../lib/generatePayAppHTML');
const { PDFDocument: PDFLibDocument } = require('pdf-lib');
const logger = require('../utils/logger');

// Sentry error capture (graceful fallback if not installed)
let Sentry;
try { Sentry = require('@sentry/node'); } catch(e) { Sentry = { captureException: () => {} }; }

// PDF generation via Puppeteer (fallback to PDFKit if unavailable)
let puppeteer = null;
try { puppeteer = require('puppeteer'); } catch(e) { logger.warn({ component: 'pdf' }, 'Puppeteer not available, falling back to PDFKit'); }

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
  // Include last manual payment info (method, check number) for "Paid via..." display
  const r = await pool.query(`
    SELECT pa.*,
      mp.payment_method AS last_payment_method,
      mp.check_number   AS last_check_number,
      mp.amount         AS last_payment_amount
    FROM pay_apps pa
    LEFT JOIN LATERAL (
      SELECT payment_method, check_number, amount
      FROM manual_payments
      WHERE pay_app_id = pa.id
      ORDER BY created_at DESC
      LIMIT 1
    ) mp ON true
    WHERE pa.project_id=$1 AND pa.deleted_at IS NULL
    ORDER BY pa.app_number
  `, [req.params.id]);
  res.json(r.rows);
});

// POST /api/projects/:id/payapps - Create new pay app
router.post('/api/projects/:id/payapps', auth, trialGate, async (req,res) => {
  let {period_label,period_start,period_end,app_number} = req.body;
  // Auto-calculate app_number if not provided (React UI calls without it)
  if (app_number === undefined || app_number === null) {
    const maxRes = await pool.query(
      'SELECT COALESCE(MAX(app_number), 0) as max_num FROM pay_apps WHERE project_id=$1 AND deleted_at IS NULL',
      [req.params.id]
    );
    app_number = (parseInt(maxRes.rows[0].max_num) || 0) + 1;
  }
  const invoiceToken = require('crypto').randomBytes(24).toString('hex');
  // Carry over po_number and special_notes from the previous pay app (if any)
  const prevPayApp = app_number > 1
    ? (await pool.query(
        'SELECT po_number, special_notes, notes_color FROM pay_apps WHERE project_id=$1 AND app_number=$2 AND deleted_at IS NULL',
        [req.params.id, app_number - 1]
      )).rows[0]
    : null;
  const inheritedPoNumber = prevPayApp?.po_number || null;
  const inheritedNotes = prevPayApp?.special_notes || null;
  const inheritedNotesColor = prevPayApp?.notes_color || null;
  const pa = await pool.query(
    'INSERT INTO pay_apps(project_id,app_number,period_label,period_start,period_end,invoice_token,po_number,special_notes,notes_color) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [req.params.id,app_number,period_label,period_start,period_end,invoiceToken,inheritedPoNumber,inheritedNotes,inheritedNotesColor]
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

  // Smart auto-fill: check how much is left to bill across all lines
  // If the remaining % on every line = retainage %, this is the final billing (bill the balance)
  let totalRemaining = 0;
  let totalScheduled = 0;
  for (const line of sovLines.rows) {
    const prev = prevMap[line.id];
    const prevPct = prev ? Math.min(100, parseFloat(prev.prev_pct)+parseFloat(prev.this_pct)) : 0;
    totalRemaining += (100 - prevPct);
    totalScheduled += 100;
  }
  const avgRemainingPct = sovLines.rows.length > 0 ? totalRemaining / sovLines.rows.length : 100;

  // Default billing %: PA#1→20%, PA#2→25%, PA#3+→20%
  // BUT if average remaining ≤ default, use the exact remaining (bill the balance)
  const baseDefault = app_number === 1 ? 20 : app_number === 2 ? 25 : 20;
  const useExactRemaining = avgRemainingPct <= baseDefault && avgRemainingPct > 0;

  for(const line of sovLines.rows) {
    const prev = prevMap[line.id];
    const prevPct = prev ? Math.min(100, parseFloat(prev.prev_pct)+parseFloat(prev.this_pct)) : 0;
    const retPct = prev ? parseFloat(prev.retainage_pct) : projDefaultRet;
    const remaining = 100 - prevPct;
    // If remaining is ≤ default, fill exact remaining to bill balance; otherwise use default
    const thisPct = useExactRemaining ? remaining : Math.min(baseDefault, remaining);
    await pool.query(
      'INSERT INTO pay_app_lines(pay_app_id,sov_line_id,prev_pct,this_pct,retainage_pct,stored_materials) VALUES($1,$2,$3,$4,$5,$6)',
      [paId,line.id,prevPct,thisPct,retPct,0]
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

    // Check if this is a retainage release pay app
    const rrCheck = await pool.query('SELECT is_retainage_release, amount_due FROM pay_apps WHERE id=$1', [req.params.id]);
    const isRetainageRelease = rrCheck.rows[0]?.is_retainage_release;

    // Snapshot amount_due and retention_held
    try {
      if (isRetainageRelease) {
        // ── Retainage release: preserve the pre-calculated amount_due ──────────
        // The retainage release amount was set at creation time to the total retainage held.
        // Lines have this_pct=0 and retainage_pct=0, so the standard formula gives $0.
        // We keep the existing amount_due and just set retention_held=0 + submitted_at.
        await pool.query(
          'UPDATE pay_apps SET retention_held=0, submitted_at=COALESCE(submitted_at, NOW()) WHERE id=$1',
          [req.params.id]
        );
      } else {
        // ── Standard pay app: calculate from SOV lines + add change orders ─────
        const snap = await pool.query(`
          SELECT
            SUM(sl.scheduled_value * pal.this_pct / 100
                - sl.scheduled_value * (pal.prev_pct + pal.this_pct) / 100 * pal.retainage_pct / 100
                + sl.scheduled_value * pal.prev_pct / 100 * pal.retainage_pct / 100) AS amount_due,
            SUM(sl.scheduled_value * (pal.prev_pct + pal.this_pct) / 100 * pal.retainage_pct / 100) AS retention_held
          FROM pay_app_lines pal
          JOIN sov_lines sl ON sl.id = pal.sov_line_id
          WHERE pal.pay_app_id=$1`, [req.params.id]);

        // Change orders are billed at 100% with NO retainage — add their total to amount_due
        const coSnap = await pool.query(
          'SELECT COALESCE(SUM(amount), 0) as co_total FROM change_orders WHERE pay_app_id=$1',
          [req.params.id]
        );
        const lineAmountDue = parseFloat(snap.rows[0]?.amount_due || 0);
        const coTotal = parseFloat(coSnap.rows[0]?.co_total || 0);
        const totalAmountDue = lineAmountDue + coTotal;
        const retentionHeld = parseFloat(snap.rows[0]?.retention_held || 0);

        await pool.query(
          'UPDATE pay_apps SET amount_due=$1, retention_held=$2, submitted_at=COALESCE(submitted_at, NOW()) WHERE id=$3',
          [totalAmountDue, retentionHeld, req.params.id]
        );
      }
    } catch(snapErr) { logger.error({ error: snapErr.message, payAppId: req.params.id }, 'snap_amount_due_error'); }

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
    } catch(dueErr) { logger.error({ error: dueErr.message, payAppId: req.params.id }, 'auto_due_date_error'); }

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
          const fpath = path.join(__dirname, '..', '..', 'uploads', fname);
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
    } catch(lienErr) { logger.error({ error: lienErr.message, payAppId: req.params.id }, 'auto_lien_release_error'); }

    // Auto-generate Final Retainage Release pay app when project reaches 100% billed
    // Also skip if this IS the retainage release being submitted
    if (!isRetainageRelease) {
      try {
        const compCheck2 = await pool.query(`
          SELECT SUM(sl.scheduled_value) as total_contract,
                 SUM(sl.scheduled_value * (pal.prev_pct + pal.this_pct) / 100) as total_billed
          FROM pay_app_lines pal JOIN sov_lines sl ON sl.id=pal.sov_line_id
          WHERE pal.pay_app_id=$1`, [req.params.id]);
        const tc2 = parseFloat(compCheck2.rows[0]?.total_contract || 0);
        const tb2 = parseFloat(compCheck2.rows[0]?.total_billed || 0);
        const isFinal2 = tc2 > 0 && (tb2 / tc2) >= 0.98;

        if (isFinal2) {
          const currentPa = await pool.query('SELECT project_id FROM pay_apps WHERE id=$1', [req.params.id]);
          const projId = currentPa.rows[0]?.project_id;
          const existingRelease = await pool.query(
            'SELECT id FROM pay_apps WHERE project_id=$1 AND is_retainage_release=TRUE AND deleted_at IS NULL',
            [projId]
          );
          if (!existingRelease.rows[0] && projId) {
            // Calculate total retainage held across ALL submitted pay apps for this project
            // (not just the triggering one — we need project-wide retainage)
            const retHeld = await pool.query(`
              SELECT SUM(pa.retention_held) as total_retainage
              FROM pay_apps pa
              WHERE pa.project_id=$1 AND pa.deleted_at IS NULL
                AND pa.status='submitted' AND pa.is_retainage_release=FALSE`,
              [projId]);
            // The retention_held on the LATEST pay app is the cumulative retainage for the whole project
            // (each PA stores the cumulative retainage at that point, not just incremental)
            // So we use the maximum retention_held value, which is from the most recent PA
            const retHeldMax = await pool.query(`
              SELECT retention_held FROM pay_apps
              WHERE project_id=$1 AND deleted_at IS NULL AND status='submitted'
                AND is_retainage_release=FALSE AND retention_held IS NOT NULL
              ORDER BY app_number DESC LIMIT 1`, [projId]);
            const totalRetainage = parseFloat(retHeldMax.rows[0]?.retention_held || 0);

            if (totalRetainage > 0) {
              const maxNum = await pool.query(
                'SELECT COALESCE(MAX(app_number), 0) as max_num FROM pay_apps WHERE project_id=$1 AND deleted_at IS NULL',
                [projId]
              );
              const releaseNum = (parseInt(maxNum.rows[0].max_num) || 0) + 1;
              const releaseToken = require('crypto').randomBytes(24).toString('hex');
              const now = new Date();
              const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
              const periodLabel = `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()} — Final Retainage`;

              const releasePa = await pool.query(
                `INSERT INTO pay_apps(project_id, app_number, period_label, period_start, period_end, invoice_token, is_retainage_release, special_notes)
                 VALUES($1, $2, $3, $4, $4, $5, TRUE, $6) RETURNING *`,
                [projId, releaseNum, periodLabel, now.toISOString().split('T')[0], releaseToken,
                 'Final Retainage Release — This invoice releases all retainage held on the project. All work has been completed and billed at 100%.']
              );
              const releasePaId = releasePa.rows[0].id;

              // Create line items: 100% prev_pct, 0% this_pct, 0% retainage (releases retainage)
              const sovLines2 = await pool.query('SELECT * FROM sov_lines WHERE project_id=$1 ORDER BY sort_order', [projId]);
              const finalLines = await pool.query(
                'SELECT sov_line_id, prev_pct, this_pct, retainage_pct FROM pay_app_lines WHERE pay_app_id=$1', [req.params.id]
              );
              const finalMap = {};
              finalLines.rows.forEach(r2 => finalMap[r2.sov_line_id] = r2);

              for (const line of sovLines2.rows) {
                const final2 = finalMap[line.id];
                const cumPct = final2 ? Math.min(100, parseFloat(final2.prev_pct) + parseFloat(final2.this_pct)) : 100;
                await pool.query(
                  'INSERT INTO pay_app_lines(pay_app_id, sov_line_id, prev_pct, this_pct, retainage_pct, stored_materials) VALUES($1,$2,$3,$4,$5,$6)',
                  [releasePaId, line.id, cumPct, 0, 0, 0]
                );
              }

              // Set amount_due = total retainage being released
              await pool.query(
                'UPDATE pay_apps SET amount_due=$1, retention_held=0, status=$3 WHERE id=$2',
                [totalRetainage, releasePaId, 'draft']
              );

              await logEvent(req.user.id, 'retainage_release_created', {
                project_id: projId, pay_app_id: releasePaId, amount: totalRetainage
              });
              logger.info({ projectId: projId, payAppNumber: releaseNum, amount: totalRetainage }, 'retainage_release_created');
            }
          }
        }
      } catch(retErr) { logger.error({ error: retErr.message, projectId: req.params.id }, 'auto_retainage_release_error'); }
    }
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
  } catch(e) {
    logger.error({ error: e.message, userId: req.user?.id, payAppId: req.params.id }, 'delete_payapps_error');
    if (Sentry?.captureException) {
      Sentry.captureException(e, { extra: { userId: req.user?.id, payAppId: req.params.id } });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
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
  } catch(e) {
    logger.error({ error: e.message, userId: req.user?.id, payAppId: req.params.id }, 'restore_payapp_error');
    if (Sentry?.captureException) {
      Sentry.captureException(e, { extra: { userId: req.user?.id, payAppId: req.params.id } });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
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
  } catch(e) {
    logger.error({ error: e.message, userId: req.user?.id, projectId: req.params.id }, 'list_deleted_payapps_error');
    if (Sentry?.captureException) {
      Sentry.captureException(e, { extra: { userId: req.user?.id, projectId: req.params.id } });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
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
  try {
    // Verify user owns this pay app before adding change orders
    const own = await pool.query(
      'SELECT pa.id FROM pay_apps pa JOIN projects p ON p.id=pa.project_id WHERE pa.id=$1 AND p.user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!own.rows[0]) return res.status(403).json({ error: 'Forbidden' });

    const {description,amount} = req.body;

    // Auto-generate co_number: count existing COs for this pay app, use count+1
    const coCount = await pool.query(
      'SELECT COUNT(*) as cnt FROM change_orders WHERE pay_app_id=$1',
      [req.params.id]
    );
    const coNumber = (parseInt(coCount.rows[0].cnt) || 0) + 1;

    const r = await pool.query(
      'INSERT INTO change_orders(pay_app_id,co_number,description,amount,status) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [req.params.id, coNumber, description, amount, 'active']
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
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
  const actualSize = (() => { try { return fs.statSync(path.join(__dirname,'..','..','uploads',filename)).size; } catch(_) { return req.file.size; } })();
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
  const fp = path.join(__dirname,'..','..','uploads',own.rows[0].filename);
  if(fs.existsSync(fp)) fs.unlinkSync(fp);
  res.json({ok:true});
});

// ──────────────────────────────────────────────────────────────────────────────
// HTML PREVIEW — Professional AIA G702/G703 with auto-print dialog
// ──────────────────────────────────────────────────────────────────────────────

router.get('/api/payapps/:id/html', async (req,res) => {
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
  await logEvent(decoded.id, 'pdf_previewed', { pay_app_id: parseInt(req.params.id) });
  const lines = await pool.query(
    'SELECT pal.*,sl.item_id,sl.description,sl.scheduled_value FROM pay_app_lines pal JOIN sov_lines sl ON sl.id=pal.sov_line_id WHERE pal.pay_app_id=$1 ORDER BY sl.sort_order',
    [req.params.id]
  );
  const cos = await pool.query('SELECT * FROM change_orders WHERE pay_app_id=$1',[req.params.id]);

  let tComp=0,tRet=0,tPrevCert=0;
  lines.rows.forEach(r=>{
    const sv=parseFloat(r.scheduled_value);
    const retPct=parseFloat(r.retainage_pct)/100;
    const prev=sv*parseFloat(r.prev_pct)/100;
    const thisPer=sv*parseFloat(r.this_pct)/100;
    const comp=prev+thisPer+parseFloat(r.stored_materials||0);
    tComp+=comp; tRet+=comp*retPct; tPrevCert+=prev*(1-retPct);
  });
  const tCO=cos.rows.filter(c=>c.status!=='void'&&c.status!=='voided').reduce((s,c)=>s+parseFloat(c.amount||0),0);
  const contract=parseFloat(pa.original_contract)+tCO;
  const earned=tComp-tRet;
  const due = pa.is_retainage_release ? parseFloat(pa.amount_due||0) : Math.max(0,earned-tPrevCert)+tCO;

  const imgMime = buf => { if (buf[0]===0x89 && buf[1]===0x50) return 'image/png'; if (buf[0]===0xFF && buf[1]===0xD8) return 'image/jpeg'; return 'image/png'; };
  const readImgB64 = filename => { if (!filename) return null; try { const fp = path.join(__dirname, '..', '..', 'uploads', filename); if (!fs.existsSync(fp)) return null; const buf = fs.readFileSync(fp); return `data:${imgMime(buf)};base64,${buf.toString('base64')}`; } catch(e) { return null; } };
  const logoBase64 = readImgB64(pa.logo_filename);
  const sigBase64  = readImgB64(pa.signature_filename);

  const photoAttsRes = await pool.query(`SELECT filename, original_name FROM attachments WHERE pay_app_id=$1 AND mime_type LIKE 'image/%' ORDER BY uploaded_at`, [req.params.id]);
  const photoAttachments = photoAttsRes.rows.map(a => { const b64 = readImgB64(a.filename); if (!b64) return null; return { base64: b64, name: a.original_name || a.filename }; }).filter(Boolean);
  const docAttsRes = await pool.query(`SELECT filename, original_name FROM attachments WHERE pay_app_id=$1 AND mime_type='application/pdf' ORDER BY uploaded_at`, [req.params.id]);
  const docAttachments = docAttsRes.rows.map(a => ({ name: a.original_name || a.filename }));

  const totals = { tComp, tRet, tPrevCert, tCO, contract, earned, due };
  const html = generatePayAppHTML(pa, lines.rows, cos.rows, totals, logoBase64, sigBase64, photoAttachments, docAttachments);

  // Wrap with print-friendly auto-print script
  const printableHtml = html.replace('</body>', `
<script>
  window.onload = function() {
    setTimeout(function() { window.print(); }, 500);
  };
</script>
</body>`);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(printableHtml);
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
  const tCO=cos.rows.filter(c=>c.status!=='void'&&c.status!=='voided').reduce((s,c)=>s+parseFloat(c.amount||0),0);
  const contract=parseFloat(pa.original_contract)+tCO;
  const earned=tComp-tRet;
  const due = pa.is_retainage_release ? parseFloat(pa.amount_due||0) : Math.max(0,earned-tPrevCert)+tCO;

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
      const fp = path.join(__dirname, '..', '..', 'uploads', filename);
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
    return { base64: b64, name: a.original_name || a.filename, filePath: path.join(__dirname, '..', '..', 'uploads', a.filename) };
  }).filter(Boolean);

  // ── Load PDF document attachments ─────
  const docAttsRes = await pool.query(
    `SELECT filename, original_name FROM attachments WHERE pay_app_id=$1 AND mime_type='application/pdf' ORDER BY uploaded_at`,
    [req.params.id]
  );
  const docAttachments = docAttsRes.rows.map(a => ({ name: a.original_name || a.filename }));

  if (!pa.logo_filename) {
    logger.info({ userId: decoded.id, payAppId: req.params.id }, 'pdf_no_logo_filename');
  } else {
    const lp = path.join(__dirname, '..', '..', 'uploads', pa.logo_filename);
    if (!fs.existsSync(lp)) logger.warn({ logoPath: lp, payAppId: req.params.id }, 'pdf_logo_file_missing');
  }

  // ── Auto-generate payment link token (always, so Pay Now appears on every invoice) ──
  if (!pa.payment_link_token && due > 0) {
    try {
      const payToken = generatePaymentToken();
      await pool.query('UPDATE pay_apps SET payment_link_token=$1 WHERE id=$2', [payToken, req.params.id]);
      pa.payment_link_token = payToken;
      logger.info({ payAppId: req.params.id }, 'pdf_payment_token_auto_generated');
    } catch(e) {
      logger.error({ error: e.message, payAppId: req.params.id }, 'pdf_payment_token_gen_error');
    }
  }

  const totals = { tComp, tRet, tPrevCert, tCO, contract, earned, due };
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="PayApp_${pa.app_number}_${(pa.pname||'').replace(/\s+/g,'_')}.pdf"`);

  // ── Helper: find or auto-generate lien waiver, return PDF buffer ────────
  const getLienWaiverBuffer = async () => {
    try {
      const lienRes = await pool.query(
        'SELECT * FROM lien_documents WHERE project_id=$1 AND pay_app_id=$2 ORDER BY created_at DESC LIMIT 1',
        [pa.project_id, req.params.id]
      );
      let lienDoc = lienRes.rows[0];
      const today = new Date().toLocaleDateString('en-US');
      const sigName = pa.contact_name || pa.company_name || pa.contractor || '';
      const lienProject = { name: pa.pname, owner: pa.owner, contractor: pa.contractor, company_name: pa.company_name, logo_filename: pa.logo_filename, signature_filename: pa.signature_filename };

      // Always regenerate the PDF to ensure latest signature/logo are embedded
      if (lienDoc && lienDoc.filename && due > 0) {
        const existingPath = path.join(__dirname, '..', '..', 'uploads', lienDoc.filename);
        try {
          await generateLienDocPDF({
            fpath: existingPath, doc_type: lienDoc.doc_type || 'conditional_waiver',
            project: lienProject, through_date: lienDoc.through_date || today, amount: lienDoc.amount || due,
            maker_of_check: pa.owner || '', check_payable_to: sigName,
            signatory_name: sigName, signedAt: new Date(lienDoc.signed_at || Date.now()), ip: 'auto-regen',
          });
          logger.info({ lienDocId: lienDoc.id, filename: lienDoc.filename }, 'pdf_lien_regenerated');
        } catch(regenErr) {
          logger.error({ error: regenErr.message, lienDocId: lienDoc?.id }, 'pdf_lien_regen_error');
        }
      }
      // Auto-generate conditional waiver if none exists
      if (!lienDoc && due > 0 && (pa.contact_name || pa.company_name)) {
        const crypto = require('crypto');
        const lienFilename = `lien_${crypto.randomBytes(8).toString('hex')}.pdf`;
        const fpath = path.join(__dirname, '..', '..', 'uploads', lienFilename);
        await generateLienDocPDF({
          fpath, doc_type: 'conditional_waiver',
          project: lienProject, through_date: today, amount: due,
          maker_of_check: pa.owner || '', check_payable_to: sigName,
          signatory_name: sigName, signedAt: new Date(), ip: 'auto-gen',
        });
        const insertRes = await pool.query(
          `INSERT INTO lien_documents(project_id,pay_app_id,user_id,doc_type,status,amount,filename,through_date,claimant_name,owner_name)
           VALUES($1,$2,$3,'conditional_waiver','draft',$4,$5,$6,$7,$8) RETURNING *`,
          [pa.project_id, req.params.id, decoded.id, due, lienFilename, today, sigName, pa.owner || '']
        );
        lienDoc = insertRes.rows[0];
        logger.info({ lienDocId: lienDoc.id, filename: lienFilename, payAppId: req.params.id }, 'pdf_lien_auto_generated');
      }
      if (lienDoc && lienDoc.filename) {
        const lienPath = path.join(__dirname, '..', '..', 'uploads', lienDoc.filename);
        if (fs.existsSync(lienPath)) return fs.readFileSync(lienPath);
      }
    } catch(e) {
      logger.error({ error: e.message, payAppId: req.params.id }, 'pdf_lien_waiver_error');
    }
    return null;
  };

  // ── Helper: merge two PDF buffers into one ──────────────────────────────
  const mergePDFs = async (mainBuf, lienBuf) => {
    if (!lienBuf) return mainBuf;
    try {
      const merged = await PDFLibDocument.create();
      const mainDoc = await PDFLibDocument.load(mainBuf);
      const lienDoc = await PDFLibDocument.load(lienBuf);
      const mainPages = await merged.copyPages(mainDoc, mainDoc.getPageIndices());
      mainPages.forEach(p => merged.addPage(p));
      const lienPages = await merged.copyPages(lienDoc, lienDoc.getPageIndices());
      lienPages.forEach(p => merged.addPage(p));
      return Buffer.from(await merged.save());
    } catch(e) {
      logger.error({ error: e.message, payAppId: req.params.id }, 'pdf_merge_error');
      return mainBuf; // fallback: return pay app only
    }
  };

  // ── Puppeteer: pixel-perfect PDF matching the on-screen preview ──────────
  if (puppeteer) {
    let browser;
    try {
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
      // Bundle lien waiver
      const lienBuf = await getLienWaiverBuffer();
      const finalPdf = await mergePDFs(pdfBuffer, lienBuf);
      res.send(finalPdf);
      return;
    } catch(puppErr) {
      logger.error({ error: puppErr.message, payAppId: req.params.id }, 'pdf_puppeteer_error_fallback_pdfkit');
    } finally {
      if (browser) await browser.close().catch(()=>{});
    }
  }

  // PDFKit fallback — buffer to memory so we can merge with lien waiver
  const doc=new PDFDocument({size:'LETTER',margin:45});
  const chunks = [];
  doc.on('data', c => chunks.push(c));

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

  await new Promise((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
    doc.end();
  });
  const payAppBuf = Buffer.concat(chunks);
  const lienBuf = await getLienWaiverBuffer();
  const finalPdf = await mergePDFs(payAppBuf, lienBuf);
  res.send(finalPdf);
});

// ──────────────────────────────────────────────────────────────────────────────
// EMAIL SENDING
// ──────────────────────────────────────────────────────────────────────────────

// POST /api/payapps/:id/email - Send pay app via email with PDF
router.post('/api/payapps/:id/email', auth, trialGate, async (req, res) => {
  const { to, cc, subject, message, attach_lien_waiver, include_lien_waiver, include_payment_link } = req.body;
  const shouldAttachLien = (attach_lien_waiver ?? include_lien_waiver) !== false;
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
    const tCO=cos.rows.filter(c=>c.status!=='void'&&c.status!=='voided').reduce((s,c)=>s+parseFloat(c.amount||0),0);
    const contract=parseFloat(pa.original_contract)+tCO;
    const earned=tComp-tRet;
    const due = pa.is_retainage_release ? parseFloat(pa.amount_due||0) : Math.max(0,earned-tPrevCert)+tCO;
    const totals={tComp,tRet,tPrevCert,tCO,contract,earned,due};

    // Auto-generate payment link (always — pay page handles Stripe status gracefully)
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    let payNowUrl = null;
    if (shouldIncludePayLink && due > 0) {
      try {
        let payToken = pa.payment_link_token;
        if (!payToken) {
          payToken = generatePaymentToken();
          await pool.query('UPDATE pay_apps SET payment_link_token=$1 WHERE id=$2', [payToken, req.params.id]);
        }
        payNowUrl = `${baseUrl}/pay/${payToken}`;
      } catch(payLinkErr) {
        logger.error({ error: payLinkErr.message, payAppId: req.params.id }, 'email_payment_link_gen_error');
      }
    }

    const fmtD = n => '$' + parseFloat(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    const safeMsg = (message||'').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    const payNowBtnHtml = payNowUrl ? `
        <div style="text-align:center;margin:24px 0 8px">
          <a href="${payNowUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;padding:16px 48px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14pt;letter-spacing:0.5px">Pay Now — ${fmtD(due)}</a>
        </div>
        <p style="font-size:9pt;color:#888;text-align:center;margin:6px 0 0">ACH bank transfer or credit card accepted. Secure payment via Stripe.</p>` : '';

    // Professional G702 email template with full A-H summary
    const emailHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:620px;margin:0 auto;background:#fff">
      <div style="background:linear-gradient(135deg,#1e40af 0%,#2563eb 50%,#3b82f6 100%);padding:28px 32px;color:#fff;border-radius:8px 8px 0 0">
        <div style="font-size:10pt;opacity:0.85;margin-bottom:4px">${pa.contractor||'Contractor'}</div>
        <h2 style="margin:0;font-size:20pt;font-weight:700;letter-spacing:-0.3px">Pay Application #${pa.app_number}</h2>
        <div style="font-size:11pt;margin-top:6px;opacity:0.9">${pa.pname||''}</div>
        <div style="font-size:9pt;margin-top:3px;opacity:0.7">${pa.period_label||''}</div>
      </div>
      <div style="padding:28px 32px;border:1px solid #e5e7eb;border-top:0">
        ${safeMsg ? `<div style="margin-bottom:20px;padding:14px 16px;background:#f8fafc;border-left:3px solid #2563eb;border-radius:0 6px 6px 0;font-size:10pt;color:#334155;line-height:1.5">${safeMsg}</div>` : ''}
        <div style="background:#f0f4ff;border:1.5px solid #bfdbfe;border-radius:8px;padding:20px 24px;margin-bottom:20px">
          <div style="font-size:8pt;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:12px;font-weight:600">G702 Summary</div>
          <table style="width:100%;border-collapse:collapse;font-size:9.5pt">
            <tr><td style="padding:5px 0;color:#64748b">A. Original Contract Sum</td><td style="padding:5px 0;text-align:right;font-weight:600">${fmtD(pa.original_contract)}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b">B. Net Change by Change Orders</td><td style="padding:5px 0;text-align:right;font-weight:600">${fmtD(tCO)}</td></tr>
            <tr style="border-top:1px solid #dbeafe"><td style="padding:5px 0;color:#64748b">C. Contract Sum to Date (A+B)</td><td style="padding:5px 0;text-align:right;font-weight:600">${fmtD(contract)}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b">D. Total Completed & Stored</td><td style="padding:5px 0;text-align:right;font-weight:600">${fmtD(tComp)}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b">E. Retainage</td><td style="padding:5px 0;text-align:right;font-weight:600">${fmtD(tRet)}</td></tr>
            <tr style="border-top:1px solid #dbeafe"><td style="padding:5px 0;color:#64748b">F. Total Earned Less Retainage</td><td style="padding:5px 0;text-align:right;font-weight:600">${fmtD(earned)}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b">G. Less Previous Certificates</td><td style="padding:5px 0;text-align:right;font-weight:600">${fmtD(tPrevCert)}</td></tr>
          </table>
          <div style="margin-top:14px;padding-top:14px;border-top:2px solid #2563eb;display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:11pt;font-weight:700;color:#1e293b">H. CURRENT PAYMENT DUE</span>
            <span style="font-size:18pt;font-weight:800;color:#2563eb">${fmtD(due)}</span>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:16px">
          <tr><td style="padding:4px 0;color:#94a3b8;width:130px">Contractor</td><td style="padding:4px 0;color:#334155">${pa.contractor||'—'}</td></tr>
          <tr><td style="padding:4px 0;color:#94a3b8">Owner</td><td style="padding:4px 0;color:#334155">${pa.owner||'—'}</td></tr>
          <tr><td style="padding:4px 0;color:#94a3b8">Payment Terms</td><td style="padding:4px 0;color:#334155">${pa.payment_terms || pa.default_payment_terms || 'Due on receipt'}</td></tr>
          ${pa.po_number ? `<tr><td style="padding:4px 0;color:#94a3b8">PO Number</td><td style="padding:4px 0;color:#334155">${pa.po_number}</td></tr>` : ''}
        </table>
        ${payNowBtnHtml}
      </div>
      <div style="padding:14px 32px;font-size:8pt;color:#9ca3af;text-align:center;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;background:#fafafa">
        PDF attached${shouldAttachLien ? ' with lien waiver' : ''} &nbsp;|&nbsp; Sent via <a href="https://constructinv.varshyl.com" style="color:#9ca3af">ConstructInvoice AI</a> &nbsp;|&nbsp; Varshyl Inc.
      </div>
    </div>`;

    const pdfFilename = `PayApp_${pa.app_number}_${(pa.pname||'').replace(/\s+/g,'_')}.pdf`;
    const emailAttachments = [];

    // ── Generate professional PDF attachment using Puppeteer (fallback to PDFKit) ──
    try {
      let pdfBuf = null;

      // Try Puppeteer first for pixel-perfect PDF matching the on-screen preview
      if (puppeteer) {
        let browser;
        try {
          const imgMime = buf => { if (buf[0]===0x89 && buf[1]===0x50) return 'image/png'; if (buf[0]===0xFF && buf[1]===0xD8) return 'image/jpeg'; return 'image/png'; };
          const readImgB64 = filename => { if (!filename) return null; try { const fp = path.join(__dirname, '..', '..', 'uploads', filename); if (!fs.existsSync(fp)) return null; const buf = fs.readFileSync(fp); return `data:${imgMime(buf)};base64,${buf.toString('base64')}`; } catch(e) { return null; } };
          const logoBase64 = readImgB64(pa.logo_filename);
          const sigBase64  = readImgB64(pa.signature_filename);
          // Load photo + doc attachments for this pay app (so site photos appear in email PDF)
          const emailPhotoAtts = await pool.query(`SELECT filename, original_name FROM attachments WHERE pay_app_id=$1 AND mime_type LIKE 'image/%' ORDER BY uploaded_at`, [req.params.id]);
          const emailPhotoAttachments = emailPhotoAtts.rows.map(a => { const b64 = readImgB64(a.filename); if (!b64) return null; return { base64: b64, name: a.original_name || a.filename }; }).filter(Boolean);
          const emailDocAtts = await pool.query(`SELECT filename, original_name FROM attachments WHERE pay_app_id=$1 AND mime_type='application/pdf' ORDER BY uploaded_at`, [req.params.id]);
          const emailDocAttachments = emailDocAtts.rows.map(a => ({ name: a.original_name || a.filename }));
          const html = generatePayAppHTML(pa, lines.rows, cos.rows, totals, logoBase64, sigBase64, emailPhotoAttachments, emailDocAttachments);
          browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: 'networkidle0' });
          pdfBuf = await page.pdf({ format: 'Letter', printBackground: true, margin: { top: '0.5in', right: '0.45in', bottom: '0.5in', left: '0.45in' } });
          logger.info({ payAppId: req.params.id, pdfBytes: pdfBuf.length }, 'email_pdf_puppeteer_generated');
        } catch(puppErr) {
          logger.error({ error: puppErr.message, payAppId: req.params.id }, 'email_pdf_puppeteer_error_fallback_pdfkit');
        } finally {
          if (browser) await browser.close().catch(()=>{});
        }
      }

      // Fallback: PDFKit with improved G702 summary layout
      if (!pdfBuf) {
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
          pdfDoc.fontSize(9).font('Helvetica');
          pdfDoc.text(`Application #${pa.app_number}  |  ${pa.period_label || ''}`);
          pdfDoc.text(`Owner: ${pa.owner||'—'}  |  Contractor: ${pa.contractor||'—'}`);
          if (pa.po_number) pdfDoc.text(`PO #: ${pa.po_number}`);
          pdfDoc.moveDown(0.6);
          pdfDoc.moveTo(45,pdfDoc.y).lineTo(567,pdfDoc.y).lineWidth(0.5).stroke();
          pdfDoc.moveDown(0.4);
          pdfDoc.fontSize(10).font('Helvetica-Bold').text('G702 Summary');
          pdfDoc.moveDown(0.3);
          pdfDoc.fontSize(9).font('Helvetica');
          const items = [
            ['A. Original Contract Sum', fmtD(pa.original_contract)],
            ['B. Net Change by Change Orders', fmtD(tCO)],
            ['C. Contract Sum to Date (A+B)', fmtD(contract)],
            ['D. Total Completed & Stored to Date', fmtD(tComp)],
            ['E. Retainage', fmtD(tRet)],
            ['F. Total Earned Less Retainage (D-E)', fmtD(earned)],
            ['G. Less Previous Certificates', fmtD(tPrevCert)],
          ];
          items.forEach(([label, val]) => {
            const y = pdfDoc.y;
            pdfDoc.text(label, 55, y, { width: 300 });
            pdfDoc.text(val, 400, y, { width: 150, align: 'right' });
          });
          pdfDoc.moveDown(0.4);
          pdfDoc.moveTo(45,pdfDoc.y).lineTo(567,pdfDoc.y).lineWidth(1).stroke();
          pdfDoc.moveDown(0.3);
          const hY = pdfDoc.y;
          pdfDoc.font('Helvetica-Bold').fontSize(11).text('H. CURRENT PAYMENT DUE', 55, hY, { width: 300 });
          pdfDoc.fillColor('#2563eb').fontSize(14).text(fmtD(due), 350, hY-2, { width: 200, align: 'right' });
          pdfDoc.fillColor('#000');
          if (pa.special_notes) { const pn=pa.special_notes.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' '); pdfDoc.moveDown(1); pdfDoc.font('Helvetica-Bold').fontSize(8).text('Notes:',{continued:true}); pdfDoc.font('Helvetica').text(' '+pn); }
          pdfDoc.moveDown(2);
          pdfDoc.fontSize(8).font('Helvetica').fillColor('#888').text('Generated by ConstructInvoice AI', { align: 'center' });
          pdfDoc.text('Full G702/G703 with line items available in app', { align: 'center' });
          pdfDoc.end();
        });
        pdfBuf = Buffer.concat(chunks);
        logger.info({ payAppId: req.params.id, pdfBytes: pdfBuf.length }, 'email_pdf_pdfkit_generated');
      }

      emailAttachments.push({ filename: pdfFilename, content: pdfBuf.toString('base64') });
    } catch(pdfErr) {
      logger.error({ error: pdfErr.message, payAppId: req.params.id }, 'email_pdf_generation_failed');
    }

    // ── Auto-generate lien waiver if none exists and attach it ──
    if (shouldAttachLien && due > 0) {
      try {
        const lienRes = await pool.query(
          'SELECT ld.* FROM lien_documents ld WHERE ld.project_id=$1 AND ld.pay_app_id=$2 ORDER BY ld.created_at DESC LIMIT 1',
          [pa.project_id, req.params.id]
        );
        let lienDoc = lienRes.rows[0];

        // Auto-generate conditional waiver if none exists
        if (!lienDoc && (pa.contact_name || pa.company_name)) {
          const crypto = require('crypto');
          const lienFilename = `lien_${crypto.randomBytes(8).toString('hex')}.pdf`;
          const fpath = path.join(__dirname, '..', '..', 'uploads', lienFilename);
          const today = new Date().toLocaleDateString('en-US');
          const sigName = pa.contact_name || pa.company_name || pa.contractor || '';
          await generateLienDocPDF({
            fpath, doc_type: 'conditional_waiver',
            project: { name: pa.pname, owner: pa.owner, contractor: pa.contractor, company_name: pa.company_name, logo_filename: pa.logo_filename, signature_filename: pa.signature_filename },
            through_date: today, amount: due,
            maker_of_check: pa.owner || '', check_payable_to: sigName,
            signatory_name: sigName, signedAt: new Date(), ip: 'auto-gen',
          });
          const insertRes = await pool.query(
            `INSERT INTO lien_documents(project_id,pay_app_id,user_id,doc_type,status,amount,filename,through_date,claimant_name,owner_name)
             VALUES($1,$2,$3,'conditional_waiver','draft',$4,$5,$6,$7,$8) RETURNING *`,
            [pa.project_id, req.params.id, req.user.id, due, lienFilename, today, sigName, pa.owner || '']
          );
          lienDoc = insertRes.rows[0];
          logger.info({ lienDocId: lienDoc.id, filename: lienFilename, payAppId: req.params.id }, 'email_lien_auto_generated');
        }

        // Attach lien waiver PDF if available
        if (lienDoc && lienDoc.filename) {
          const lienPath = path.join(__dirname, '..', '..', 'uploads', lienDoc.filename);
          if (fs.existsSync(lienPath)) {
            const lienBuf = fs.readFileSync(lienPath);
            const lienType = lienDoc.doc_type === 'unconditional_waiver' ? 'Unconditional' : 'Conditional';
            emailAttachments.push({
              filename: `${lienType}_Lien_Waiver_${(pa.pname||'').replace(/\s+/g,'_')}.pdf`,
              content: lienBuf.toString('base64')
            });
            logger.info({ lienDocId: lienDoc.id, filename: lienDoc.filename, payAppId: req.params.id }, 'email_lien_attached');
          }
        }
      } catch(lienErr) {
        logger.error({ error: lienErr.message, payAppId: req.params.id }, 'email_lien_waiver_error');
      }
    }

    const fromEmail = process.env.FROM_EMAIL || 'billing@varshyl.com';
    if (!process.env.RESEND_API_KEY) {
      logger.info({ to, cc: cc || '-', subject: subject || `Pay App #${pa.app_number}`, attachmentCount: emailAttachments.length }, 'dev_email_no_resend_key');
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
        logger.error({ status: r.status, error: errBody, to, payAppId: req.params.id }, 'resend_api_error');
        return res.status(502).json({ error: 'Email delivery failed', detail: errBody });
      }
    }

    if (pa.status !== 'submitted') {
      await pool.query('UPDATE pay_apps SET status=$1 WHERE id=$2', ['submitted', req.params.id]);
    }
    await logEvent(req.user.id, 'email_sent', { pay_app_id: parseInt(req.params.id) });
    res.json({ ok: true, attachments: emailAttachments.length });

  } catch(e) {
    logger.error({ error: e.message, stack: e.stack, userId: req.user?.id, payAppId: req.params.id }, 'email_route_error');
    if (Sentry?.captureException) {
      Sentry.captureException(e, { extra: { userId: req.user?.id, payAppId: req.params.id } });
    }
    res.status(500).json({ error: 'Failed to send email', detail: e.message });
  }
});

module.exports = router;
