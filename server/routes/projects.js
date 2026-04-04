const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { pool } = require('../../db');
const { auth } = require('../middleware/auth');
const { upload, rejectFile, MIME_CONTRACT } = require('../middleware/fileValidation');
const { logEvent } = require('../lib/logEvent');

// GET /api/projects — List all projects for authenticated user (includes pay app count)
router.get('/api/projects', auth, async (req, res) => {
  const r = await pool.query(
    `SELECT p.*, COALESCE(pa.pay_app_count, 0)::int AS pay_app_count
     FROM projects p
     LEFT JOIN (
       SELECT project_id, COUNT(*) AS pay_app_count
       FROM pay_apps WHERE deleted_at IS NULL
       GROUP BY project_id
     ) pa ON pa.project_id = p.id
     WHERE p.user_id=$1
     ORDER BY p.created_at DESC`,
    [req.user.id]
  );
  res.json(r.rows);
});

// POST /api/projects — Create new project
router.post('/api/projects', auth, async (req, res) => {
  const {
    name, number, owner, owner_email, owner_phone, contractor, architect, contact,
    contact_name, contact_phone, contact_email, building_area, original_contract,
    contract_date, est_date, default_retainage, payment_terms, include_architect,
    include_retainage
  } = req.body;

  const retPct = (default_retainage !== undefined && default_retainage !== null)
    ? parseFloat(default_retainage)
    : 10;
  const inclArch = include_architect !== false;
  const inclRet = include_retainage !== false;

  const r = await pool.query(
    `INSERT INTO projects(user_id, name, number, owner, owner_email, owner_phone,
       contractor, architect, contact, contact_name, contact_phone, contact_email,
       building_area, original_contract, contract_date, est_date, default_retainage,
       payment_terms, include_architect, include_retainage)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
       $17, $18, $19, $20) RETURNING *`,
    [req.user.id, name, number, owner, owner_email || null, owner_phone || null,
     contractor, architect, contact, contact_name, contact_phone, contact_email,
     building_area, original_contract, contract_date || null, est_date || null,
     retPct, payment_terms || null, inclArch, inclRet]
  );
  await logEvent(req.user.id, 'project_created', {
    project_id: r.rows[0].id,
    contract_value: original_contract
  });
  res.json(r.rows[0]);
});

// PUT /api/projects/:id — Update project
router.put('/api/projects/:id', auth, async (req, res) => {
  const {
    name, number, owner, contractor, architect, contact, building_area,
    original_contract, contract_date, include_architect, include_retainage
  } = req.body;

  const r = await pool.query(
    `UPDATE projects SET name=$1, number=$2, owner=$3, contractor=$4, architect=$5,
       contact=$6, building_area=$7, original_contract=$8, contract_date=$9,
       include_architect=COALESCE($12, include_architect),
       include_retainage=COALESCE($13, include_retainage)
     WHERE id=$10 AND user_id=$11 RETURNING *`,
    [name, number, owner, contractor, architect, contact, building_area,
     original_contract, contract_date, req.params.id, req.user.id,
     include_architect, include_retainage]
  );
  res.json(r.rows[0]);
});

// DELETE /api/projects/:id — Delete project
router.delete('/api/projects/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM projects WHERE id=$1 AND user_id=$2',
    [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// GET /api/projects/:id/change-orders — All change orders across all pay apps in this project
router.get('/api/projects/:id/change-orders', auth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT co.*, pa.app_number
       FROM change_orders co
       JOIN pay_apps pa ON pa.id = co.pay_app_id
       JOIN projects p ON p.id = pa.project_id
       WHERE p.id = $1 AND p.user_id = $2 AND pa.deleted_at IS NULL
       ORDER BY co.co_number`,
      [req.params.id, req.user.id]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/projects/:id/attachments — All attachments across all pay apps in this project
router.get('/api/projects/:id/attachments', auth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT a.*, pa.app_number
       FROM attachments a
       JOIN pay_apps pa ON pa.id = a.pay_app_id
       JOIN projects p ON p.id = pa.project_id
       WHERE p.id = $1 AND p.user_id = $2 AND pa.deleted_at IS NULL
       ORDER BY a.uploaded_at DESC`,
      [req.params.id, req.user.id]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/projects/:id/sov — Get Schedule of Values lines
router.get('/api/projects/:id/sov', auth, async (req, res) => {
  const r = await pool.query(
    'SELECT * FROM sov_lines WHERE project_id=$1 ORDER BY sort_order',
    [req.params.id]
  );
  res.json(r.rows);
});

// POST /api/projects/:id/sov — Create/replace SOV lines
router.post('/api/projects/:id/sov', auth, async (req, res) => {
  const { lines } = req.body;
  await pool.query('DELETE FROM sov_lines WHERE project_id=$1', [req.params.id]);

  for (const [i, line] of lines.entries()) {
    await pool.query(
      'INSERT INTO sov_lines(project_id, item_id, description, scheduled_value, sort_order) VALUES($1, $2, $3, $4, $5)',
      [req.params.id, line.item_id, line.description, line.scheduled_value, i]
    );
  }

  // Auto-sync original_contract with SOV total
  const sovTotal = lines.reduce((s, l) => s + parseFloat(l.scheduled_value || 0), 0);
  await pool.query('UPDATE projects SET original_contract=$1 WHERE id=$2 AND user_id=$3',
    [sovTotal, req.params.id, req.user.id]);

  const r = await pool.query(
    'SELECT * FROM sov_lines WHERE project_id=$1 ORDER BY sort_order',
    [req.params.id]
  );
  res.json(r.rows);
});

// POST /api/projects/:id/sync-contract — Sync original_contract to SOV total
router.post('/api/projects/:id/sync-contract', auth, async (req, res) => {
  const sov = await pool.query('SELECT scheduled_value FROM sov_lines WHERE project_id=$1',
    [req.params.id]);

  if (!sov.rows.length) {
    return res.status(400).json({ error: 'No SOV lines found for this project' });
  }

  const total = sov.rows.reduce((s, r) => s + parseFloat(r.scheduled_value || 0), 0);
  const updated = await pool.query(
    'UPDATE projects SET original_contract=$1 WHERE id=$2 AND user_id=$3 RETURNING *',
    [total, req.params.id, req.user.id]
  );

  if (!updated.rows[0]) {
    return res.status(404).json({ error: 'Project not found' });
  }

  await logEvent(req.user.id, 'contract_synced', {
    project_id: parseInt(req.params.id),
    new_total: total
  });

  res.json({ ok: true, original_contract: total, project: updated.rows[0] });
});

// PUT /api/projects/:id/full — Full project edit (edit page)
router.put('/api/projects/:id/full', auth, async (req, res) => {
  const {
    name, number, owner, contractor, architect, contact, contact_name,
    contact_phone, contact_email, building_area, original_contract, contract_date,
    est_date, include_architect, include_retainage
  } = req.body;

  const inclArch = include_architect !== undefined ? include_architect : null;
  const inclRet = include_retainage !== undefined ? include_retainage : null;

  const r = await pool.query(
    `UPDATE projects SET name=$1, number=$2, owner=$3, contractor=$4, architect=$5,
       contact=$6, contact_name=$7, contact_phone=$8, contact_email=$9,
       building_area=$10, original_contract=$11, contract_date=$12, est_date=$13,
       include_architect=COALESCE($16, include_architect),
       include_retainage=COALESCE($17, include_retainage)
     WHERE id=$14 AND user_id=$15 RETURNING *`,
    [name, number, owner, contractor, architect, contact, contact_name,
     contact_phone, contact_email, building_area, original_contract, contract_date,
     est_date, req.params.id, req.user.id, inclArch, inclRet]
  );

  res.json(r.rows[0]);
});

// POST /api/projects/:id/contract — Upload contract (PDF/DOCX) and extract fields
router.post('/api/projects/:id/contract', auth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  if (rejectFile(req, res, MIME_CONTRACT, 'contract')) return;

  const proj = await pool.query(
    'SELECT id FROM projects WHERE id=$1 AND user_id=$2',
    [req.params.id, req.user.id]
  );

  if (!proj.rows[0]) {
    fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    let text = '';

    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const buf = fs.readFileSync(req.file.path);
      const data = await pdfParse(buf);
      text = data.text || '';
    } else if (ext === '.docx' || ext === '.doc') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: req.file.path });
      text = result.value || '';
    } else {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: 'Only PDF and Word documents are supported for contract upload.'
      });
    }

    const extracted = extractContractFields(text);
    const contractType = detectContractType(text);

    // Delete any previous contract for this project
    const old = await pool.query('SELECT filename FROM contracts WHERE project_id=$1',
      [req.params.id]);
    for (const row of old.rows) {
      const fp = path.join(__dirname, '../../uploads', row.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await pool.query('DELETE FROM contracts WHERE project_id=$1', [req.params.id]);

    const r = await pool.query(
      `INSERT INTO contracts(project_id, filename, original_name, file_size,
         contract_type, extracted) VALUES($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.id, req.file.filename, req.file.originalname, req.file.size,
       contractType, JSON.stringify(extracted)]
    );

    // SOV comparison
    let sov_comparison = null;
    if (extracted.contract_sum) {
      const sovRes = await pool.query(
        'SELECT SUM(scheduled_value) as total, COUNT(*) as count FROM sov_lines WHERE project_id=$1',
        [req.params.id]
      );

      if (sovRes.rows[0] && parseFloat(sovRes.rows[0].total) > 0) {
        const sovTotal = parseFloat(sovRes.rows[0].total);
        const contractSum = parseFloat(extracted.contract_sum);
        const variance = sovTotal - contractSum;
        const variancePct = Math.abs(variance / contractSum * 100);
        sov_comparison = {
          sov_total: sovTotal,
          contract_sum: contractSum,
          variance,
          variance_pct: variancePct,
          match: variancePct < 0.5,
          sov_line_count: parseInt(sovRes.rows[0].count)
        };
      }
    }

    await logEvent(req.user.id, 'contract_uploaded', {
      project_id: parseInt(req.params.id),
      contract_type: contractType
    });

    res.json({ ...r.rows[0], extracted, sov_comparison });
  } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch (_) { }
    console.error('[API Error]', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:id/contract — Get most recent contract for project
router.get('/api/projects/:id/contract', auth, async (req, res) => {
  const proj = await pool.query(
    'SELECT id FROM projects WHERE id=$1 AND user_id=$2',
    [req.params.id, req.user.id]
  );

  if (!proj.rows[0]) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const r = await pool.query(
    'SELECT * FROM contracts WHERE project_id=$1 ORDER BY uploaded_at DESC LIMIT 1',
    [req.params.id]
  );

  res.json(r.rows[0] || null);
});

// ── Helper functions ──────────────────────────────────────────────────────────

function detectContractType(text) {
  const t = text.toLowerCase();
  if (/a201|a101|a102|a133|aia\s+document/i.test(t)) return 'aia';
  if (/standard\s+form\s+of\s+agreement/i.test(t)) return 'aia';
  if (/wawf|wide\s+area\s+work\s+flow|dfars|defense\s+contract/i.test(t)) return 'federal_dod';
  if (/sf-?1034|sf-?1035|ipp|invoice\s+processing\s+platform|far\s+part/i.test(t)) return 'federal_civilian';
  if (/department\s+of\s+defense|army\s+corps|navfac|afcec/i.test(t)) return 'federal_dod';
  if (/state\s+of\s+(california|virginia|washington\s+dc)/i.test(t)) return 'state';
  if (/subcontract/i.test(t)) return 'subcontract';
  return 'unknown';
}

function extractContractFields(text) {
  const fields = {};

  // Contract sum
  const sumPatterns = [
    /contract\s+sum[^$\d]*\$?([\d,]+(?:\.\d{2})?)/i,
    /total\s+contract\s+(?:price|amount|value)[^$\d]*\$?([\d,]+(?:\.\d{2})?)/i,
    /contract\s+(?:price|amount)[^$\d]*\$?([\d,]+(?:\.\d{2})?)/i,
    /original\s+contract[^$\d]*\$?([\d,]+(?:\.\d{2})?)/i,
    /total\s+(?:bid|price)[^$\d]*\$?([\d,]+(?:\.\d{2})?)/i,
    /\btotal\b[^$\d\n]*\$\s*([\d,]+(?:\.\d{2})?)/i
  ];
  for (const p of sumPatterns) {
    const m = text.match(p);
    if (m) {
      fields.contract_sum = parseFloat(m[1].replace(/,/g, ''));
      break;
    }
  }

  // Retainage percentage
  const retPatterns = [
    /retainage\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*%/i,
    /(\d+(?:\.\d+)?)\s*%\s+retainage/i,
    /retain\s+(\d+(?:\.\d+)?)\s*%/i,
    /withhold\s+(\d+(?:\.\d+)?)\s*%/i
  ];
  for (const p of retPatterns) {
    const m = text.match(p);
    if (m) {
      fields.retainage_pct = parseFloat(m[1]);
      break;
    }
  }

  // Owner name
  const ownerM = text.match(/(?:^|\n)\s*owner[:\s]+([A-Z][^\n,]{3,60})(?:\n|,)/im);
  if (ownerM) fields.owner = ownerM[1].trim();

  // Contractor name
  const contrM = text.match(/(?:^|\n)\s*(?:general\s+)?contractor[:\s]+([A-Z][^\n,]{3,60})(?:\n|,)/im);
  if (contrM) fields.contractor = contrM[1].trim();

  // Contract date
  const datePatterns = [
    /(?:contract\s+date|dated)[:\s]+([A-Za-z]+ \d{1,2},? \d{4})/i,
    /(?:contract\s+date|dated)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /as\s+of\s+([A-Za-z]+ \d{1,2},? \d{4})/i
  ];
  for (const p of datePatterns) {
    const m = text.match(p);
    if (m) {
      fields.contract_date = m[1].trim();
      break;
    }
  }

  // Substantial completion / project end date
  const compM = text.match(/substantial\s+completion[:\s]+([A-Za-z]+ \d{1,2},? \d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
  if (compM) fields.completion_date = compM[1].trim();

  // Payment terms
  const termsM = text.match(/payment\s+(?:due|terms)[:\s]+([^\n.]{5,60})/i);
  if (termsM) fields.payment_terms = termsM[1].trim();

  // Federal: Contract/Order Number (PIID)
  const piidM = text.match(/(?:contract|order)\s+(?:number|no\.?)[:\s]+([A-Z0-9\-]{8,20})/i);
  if (piidM) fields.contract_number = piidM[1].trim();

  // Federal: CAGE code
  const cageM = text.match(/cage\s+(?:code)?[:\s]+([A-Z0-9]{5})\b/i);
  if (cageM) fields.cage_code = cageM[1].trim();

  // Federal: Period of Performance
  const popM = text.match(/period\s+of\s+performance[:\s]+([^\n.]{10,60})/i);
  if (popM) fields.period_of_performance = popM[1].trim();

  return fields;
}

// GET /api/projects/:id/reconciliation — Full billing reconciliation report
router.get('/api/projects/:id/reconciliation', auth, async (req, res) => {
  try {
    const proj = await pool.query('SELECT * FROM projects WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!proj.rows[0]) return res.status(404).json({ error: 'Project not found' });
    const project = proj.rows[0];

    // Get all pay apps (non-deleted) ordered by app_number
    const payApps = await pool.query(
      `SELECT id, app_number, period_label, status, amount_due, retention_held, is_retainage_release, submitted_at, payment_status, amount_paid
       FROM pay_apps WHERE project_id=$1 AND deleted_at IS NULL ORDER BY app_number`,
      [req.params.id]
    );

    // Get all change orders
    const cos = await pool.query(
      `SELECT co.* FROM change_orders co
       JOIN pay_apps pa ON pa.id = co.pay_app_id
       WHERE pa.project_id=$1 AND pa.deleted_at IS NULL`,
      [req.params.id]
    );
    const totalChangeOrders = cos.rows.reduce((s, c) => s + parseFloat(c.amount || 0), 0);

    // Calculate totals
    const originalContract = parseFloat(project.original_contract || 0);
    const adjustedContract = originalContract + totalChangeOrders;

    let totalBilled = 0;          // sum of amount_due from standard (non-RR) pay apps
    let totalRetainageHeld = 0;    // cumulative retainage held (from latest non-RR pay app)
    let totalRetainageReleased = 0; // sum of amount_due from retainage release pay apps
    let totalPaid = 0;

    const invoices = payApps.rows.map(pa => {
      const amountDue = parseFloat(pa.amount_due || 0);
      const retHeld = parseFloat(pa.retention_held || 0);
      const amountPaid = parseFloat(pa.amount_paid || 0);

      if (pa.is_retainage_release) {
        totalRetainageReleased += amountDue;
      } else {
        totalBilled += amountDue;
        // Use the LATEST non-RR pay app's retention_held as cumulative retainage
        totalRetainageHeld = retHeld;
      }
      totalPaid += amountPaid;

      return {
        app_number: pa.app_number,
        period_label: pa.period_label,
        status: pa.status,
        is_retainage_release: pa.is_retainage_release || false,
        amount_due: amountDue,
        retention_held: retHeld,
        amount_paid: amountPaid,
        payment_status: pa.payment_status,
        submitted_at: pa.submitted_at,
      };
    });

    // G702 reconciliation: total work completed = billed + retainage held
    // This should equal the adjusted contract when everything is 100% billed.
    // Retainage release is NOT added to billed — it releases previously held retainage.
    const totalWorkCompleted = totalBilled + totalRetainageHeld;
    const variance = adjustedContract - totalWorkCompleted;
    const isFullyReconciled = Math.abs(variance) < 0.02; // allow penny rounding

    res.json({
      project_name: project.name,
      original_contract: originalContract,
      total_change_orders: totalChangeOrders,
      adjusted_contract: adjustedContract,
      invoices,
      summary: {
        total_billed: totalBilled,
        total_retainage_held: totalRetainageHeld,
        total_retainage_released: totalRetainageReleased,
        total_work_completed: totalWorkCompleted,
        total_paid: totalPaid,
        total_outstanding: totalBilled + totalRetainageReleased - totalPaid,
        variance,
        is_fully_reconciled: isFullyReconciled,
      }
    });
  } catch (err) {
    console.error('[Reconciliation]', err.message);
    res.status(500).json({ error: 'Failed to generate reconciliation report' });
  }
});

module.exports = router;
