const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');
const { pool } = require('../../db');
const { auth } = require('../middleware/auth');
const { logEvent } = require('../lib/logEvent');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

// GET /api/projects/:id/lien-docs — List lien documents for a project
router.get('/api/projects/:id/lien-docs', auth, async (req, res) => {
  const proj = await pool.query(
    'SELECT id FROM projects WHERE id=$1 AND user_id=$2',
    [req.params.id, req.user.id]
  );

  if (!proj.rows[0]) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const r = await pool.query(
    'SELECT * FROM lien_documents WHERE project_id=$1 ORDER BY created_at DESC',
    [req.params.id]
  );

  res.json(r.rows);
});

// POST /api/projects/:id/lien-docs — Generate lien document PDF
router.post('/api/projects/:id/lien-docs', auth, async (req, res) => {
  const proj = await pool.query(
    `SELECT p.*, cs.company_name, cs.logo_filename
     FROM projects p
     LEFT JOIN company_settings cs ON cs.user_id=p.user_id
     WHERE p.id=$1 AND p.user_id=$2`,
    [req.params.id, req.user.id]
  );

  if (!proj.rows[0]) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const project = proj.rows[0];
  const {
    doc_type, through_date, amount, maker_of_check, check_payable_to,
    signatory_name, signatory_title, pay_app_id,
    jurisdiction = project.jurisdiction || 'california'
  } = req.body;

  if (!doc_type) {
    return res.status(400).json({ error: 'doc_type required' });
  }

  if (!signatory_name) {
    return res.status(400).json({ error: 'signatory_name required' });
  }

  const signedAt = new Date();
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const fname = `lien_${doc_type}_${req.params.id}_${Date.now()}.pdf`;
  const fpath = path.join(__dirname, '../../uploads', fname);

  try {
    // Get pay app reference if linked
    let pay_app_ref = null;
    if (pay_app_id) {
      const paRow = await pool.query(
        'SELECT app_number, period_label FROM pay_apps WHERE id=$1',
        [pay_app_id]
      );

      if (paRow.rows[0]) {
        pay_app_ref = `Pay App #${paRow.rows[0].app_number}${
          paRow.rows[0].period_label ? ' — ' + paRow.rows[0].period_label : ''
        }`;
      }
    }

    await generateLienDocPDF({
      fpath, doc_type, project, through_date, amount, maker_of_check,
      check_payable_to, signatory_name, signatory_title, signedAt, ip,
      jurisdiction, pay_app_ref
    });

    const r = await pool.query(
      `INSERT INTO lien_documents(project_id, pay_app_id, doc_type, filename,
         jurisdiction, through_date, amount, maker_of_check, check_payable_to,
         signatory_name, signatory_title, signed_at, signatory_ip)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [req.params.id, pay_app_id || null, doc_type, fname, jurisdiction,
       through_date || null, amount || null, maker_of_check || null,
       check_payable_to || null, signatory_name, signatory_title || null,
       signedAt, ip]
    );

    await logEvent(req.user.id, 'lien_doc_generated', {
      project_id: parseInt(req.params.id),
      doc_type,
      jurisdiction
    });

    res.json(r.rows[0]);
  } catch (e) {
    try { if (fs.existsSync(fpath)) fs.unlinkSync(fpath); } catch (_) { }
    console.error('[API Error]', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/lien-docs/:id/pdf — Download lien document PDF
router.get('/api/lien-docs/:id/pdf', async (req, res) => {
  try {
    const token = req.query.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const r = await pool.query(
      `SELECT ld.*, p.name, p.owner, p.contractor, p.location, p.city, p.state,
              p.contact as location_contact, cs.logo_filename, cs.company_name
       FROM lien_documents ld
       JOIN projects p ON p.id=ld.project_id
       LEFT JOIN company_settings cs ON cs.user_id=p.user_id
       WHERE ld.id=$1 AND p.user_id=$2`,
      [req.params.id, decoded.id]
    );

    if (!r.rows[0]) {
      return res.status(404).json({ error: 'Not found' });
    }

    const lien = r.rows[0];
    const fp = path.resolve(__dirname, '../../uploads', lien.filename);

    // Try to regenerate PDF with current logo
    try {
      let pay_app_ref = null;
      if (lien.pay_app_id) {
        const paRow = await pool.query(
          'SELECT app_number, period_label FROM pay_apps WHERE id=$1',
          [lien.pay_app_id]
        );

        if (paRow.rows[0]) {
          pay_app_ref = `Pay App #${paRow.rows[0].app_number}${
            paRow.rows[0].period_label ? ' — ' + paRow.rows[0].period_label : ''
          }`;
        }
      }

      const project = {
        name: lien.name, owner: lien.owner, contractor: lien.contractor || lien.company_name,
        company_name: lien.company_name, location: lien.location_contact,
        city: lien.city, state: lien.state, logo_filename: lien.logo_filename
      };

      const tmpPath = fp + '.tmp';
      await generateLienDocPDF({
        fpath: tmpPath, doc_type: lien.doc_type, project,
        through_date: lien.through_date, amount: lien.amount,
        maker_of_check: lien.maker_of_check, check_payable_to: lien.check_payable_to,
        signatory_name: lien.signatory_name, signatory_title: lien.signatory_title,
        signedAt: new Date(lien.signed_at), ip: lien.signatory_ip || 'on file',
        jurisdiction: lien.jurisdiction || 'california', pay_app_ref
      });

      if (fs.existsSync(tmpPath) && fs.statSync(tmpPath).size > 100) {
        fs.renameSync(tmpPath, fp);
      } else {
        try { fs.unlinkSync(tmpPath); } catch (_) { }
      }
    } catch (regenErr) {
      console.error('[Lien PDF regen error]', regenErr.message);
      try { const tmp = fp + '.tmp'; if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) { }
    }

    // If file is still missing/empty after regen, try direct generation as last resort
    if (!fs.existsSync(fp) || fs.statSync(fp).size === 0) {
      console.log('[Lien PDF] File missing or empty, attempting direct generation to:', fp);
      try {
        let pay_app_ref2 = null;
        if (lien.pay_app_id) {
          const paRow2 = await pool.query(
            'SELECT app_number, period_label FROM pay_apps WHERE id=$1',
            [lien.pay_app_id]
          );

          if (paRow2.rows[0]) {
            pay_app_ref2 = `Pay App #${paRow2.rows[0].app_number}${
              paRow2.rows[0].period_label ? ' — ' + paRow2.rows[0].period_label : ''
            }`;
          }
        }

        const proj2 = {
          name: lien.name, owner: lien.owner, contractor: lien.contractor || lien.company_name,
          company_name: lien.company_name, location: lien.location_contact,
          city: lien.city, state: lien.state, logo_filename: lien.logo_filename
        };

        await generateLienDocPDF({
          fpath: fp, doc_type: lien.doc_type, project: proj2,
          through_date: lien.through_date, amount: lien.amount,
          maker_of_check: lien.maker_of_check, check_payable_to: lien.check_payable_to,
          signatory_name: lien.signatory_name, signatory_title: lien.signatory_title,
          signedAt: new Date(lien.signed_at), ip: lien.signatory_ip || 'on file',
          jurisdiction: lien.jurisdiction || 'california', pay_app_ref: pay_app_ref2
        });

        console.log('[Lien PDF] Direct generation succeeded, size:', fs.statSync(fp).size);
      } catch (lastErr) {
        console.error('[Lien PDF] Direct generation also failed:', lastErr.message, lastErr.stack);
      }
    }

    // Serve the file
    if (fs.existsSync(fp) && fs.statSync(fp).size > 0) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${lien.doc_type}_${lien.id}.pdf"`);
      return res.sendFile(fp, (err) => {
        if (err && !res.headersSent) res.status(500).json({ error: 'File send failed' });
      });
    }

    return res.status(404).json({ error: 'Lien waiver PDF could not be generated' });
  } catch (outerErr) {
    console.error('[Lien PDF route error]', outerErr.message, outerErr.stack);
    if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Helper functions ──────────────────────────────────────────────────────────

function renderLienWaiverContent(doc, {
  doc_type, project, through_date, amount, maker_of_check, check_payable_to,
  signatory_name, signatory_title, signedAt, ip, jurisdiction, pay_app_ref,
  startX, pageW
}) {
  const L = startX || 45;
  const W = pageW || 522;
  const R = L + W;

  const fmtAmt = n => n
    ? '$' + parseFloat(n).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})
    : '[AMOUNT]';

  const fmtDate = d => {
    if (!d) return '[DATE]';
    const dt = new Date(d);
    const local = new Date(dt.getTime() + dt.getTimezoneOffset() * 60000);
    return local.toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'});
  };

  const projectName = project.name || '[Project Name]';
  const ownerName = project.owner || '[Owner]';
  const contractorName = project.contractor || project.company_name || '[Contractor]';
  const loc = project.location || [project.city, project.state].filter(Boolean).join(', ') || projectName;

  // ── HEADER BAND ───────────────────────────────────────────────────────────
  const BLUE = '#1d4ed8';
  const bandTop = doc.y;
  const bandH = 66;
  doc.rect(L, bandTop, W, bandH).fill(BLUE);

  // Logo in header band (left side)
  let logoPlaced = false;
  if (project.logo_filename) {
    const logoPath = path.join(__dirname, '../../uploads', project.logo_filename);
    if (fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, L + 10, bandTop + 8, {fit: [100, 50], align: 'left', valign: 'center'});
        logoPlaced = true;
      } catch (_) { }
    }
  }

  // Document title in header band
  let titleLine1 = '', titleLine2 = '', statuteRef = '';
  if (doc_type === 'preliminary_notice') {
    titleLine1 = jurisdiction === 'california' ? 'PRELIMINARY NOTICE' : 'NOTICE TO OWNER';
    titleLine2 = '';
    statuteRef = jurisdiction === 'california' ? 'California Civil Code §8200–8216'
      : jurisdiction === 'virginia' ? 'Virginia Code §43-4' : '';
  } else if (doc_type === 'conditional_waiver') {
    titleLine1 = 'CONDITIONAL WAIVER AND RELEASE';
    titleLine2 = 'ON PROGRESS PAYMENT';
    statuteRef = jurisdiction === 'california' ? 'Civil Code §8132' : '';
  } else if (doc_type === 'unconditional_waiver') {
    titleLine1 = 'UNCONDITIONAL WAIVER AND RELEASE';
    titleLine2 = 'ON PROGRESS PAYMENT';
    statuteRef = jurisdiction === 'california' ? 'Civil Code §8134' : '';
  } else if (doc_type === 'conditional_final_waiver') {
    titleLine1 = 'CONDITIONAL WAIVER AND RELEASE';
    titleLine2 = 'ON FINAL PAYMENT';
    statuteRef = jurisdiction === 'california' ? 'Civil Code §8136' : '';
  } else if (doc_type === 'unconditional_final_waiver') {
    titleLine1 = 'UNCONDITIONAL WAIVER AND RELEASE';
    titleLine2 = 'ON FINAL PAYMENT';
    statuteRef = jurisdiction === 'california' ? 'Civil Code §8138' : '';
  }

  const titleX = logoPlaced ? L + 120 : L + 10;
  const titleW = R - titleX - 10;
  doc.fillColor('#FFFFFF').fontSize(12.5).font('Helvetica-Bold')
    .text(titleLine1, titleX, bandTop + 12, {width: titleW, align: logoPlaced ? 'center' : 'left'});

  if (titleLine2) {
    doc.fontSize(12.5).font('Helvetica-Bold')
      .text(titleLine2, titleX, doc.y, {width: titleW, align: logoPlaced ? 'center' : 'left'});
  }

  if (statuteRef) {
    doc.fontSize(8).font('Helvetica')
      .text(statuteRef, titleX, doc.y + 1, {width: titleW, align: logoPlaced ? 'center' : 'left'});
  }

  doc.fillColor('#000000');
  doc.y = bandTop + bandH + 10;

  // ── INFO GRID (2-column box) ──────────────────────────────────────────────
  const col1W = W * 0.56, col2W = W * 0.44;
  const rowH = 20;
  const infoLeft = [
    ['Project Name', projectName],
    ['Property Owner', ownerName],
    ['General Contractor', contractorName],
    ['Project Location', loc],
    ...(pay_app_ref ? [['Pay Application', pay_app_ref]] : [])
  ];

  const infoRight = [
    ['Through Date', fmtDate(through_date)],
    ['Amount', fmtAmt(amount)],
    ['Maker of Check', maker_of_check || '—'],
    ['Check Payable To', check_payable_to || contractorName],
    ['Jurisdiction', jurisdiction ? jurisdiction.charAt(0).toUpperCase() + jurisdiction.slice(1) : '—']
  ];

  const gridTop = doc.y;
  const rows = Math.max(infoLeft.length, infoRight.length);
  const gridH = rows * rowH;

  // Draw outer border
  doc.rect(L, gridTop, W, gridH).lineWidth(0.5).stroke('#AAAAAA');
  // Vertical divider
  doc.moveTo(L + col1W, gridTop).lineTo(L + col1W, gridTop + gridH).lineWidth(0.5).stroke('#AAAAAA');

  for (let i = 0; i < rows; i++) {
    const rowY = gridTop + i * rowH;
    if (i < rows - 1) doc.moveTo(L, rowY + rowH).lineTo(R, rowY + rowH).lineWidth(0.3).stroke('#DDDDDD');

    if (infoLeft[i]) {
      doc.fontSize(7).font('Helvetica-Bold').fillColor('#555555')
        .text(infoLeft[i][0].toUpperCase(), L + 5, rowY + 4, {width: col1W - 70});
      doc.fontSize(8.5).font('Helvetica').fillColor('#000000')
        .text(infoLeft[i][1], L + 5 + 85, rowY + 3.5, {width: col1W - 95, lineBreak: false});
    }

    if (infoRight[i]) {
      doc.fontSize(7).font('Helvetica-Bold').fillColor('#555555')
        .text(infoRight[i][0].toUpperCase(), L + col1W + 5, rowY + 4, {width: col2W - 70});
      doc.fontSize(8.5).font('Helvetica').fillColor('#000000')
        .text(infoRight[i][1], L + col1W + 5 + 82, rowY + 3.5, {width: col2W - 90, lineBreak: false});
    }
  }

  doc.fillColor('#000000');
  doc.y = gridTop + gridH + 12;

  // ── STATUTORY BODY TEXT ───────────────────────────────────────────────────
  doc.fontSize(9).font('Helvetica').fillColor('#000000');

  // NOTICE box for waivers
  const isWaiver = doc_type !== 'preliminary_notice';
  if (isWaiver) {
    let noticeText = '';
    if (doc_type === 'conditional_waiver' || doc_type === 'conditional_final_waiver') {
      noticeText = 'NOTICE: This document waives and releases lien and payment bond rights and stop payment notice rights based on a contract. Read it before signing.';
    } else if (doc_type === 'unconditional_waiver' || doc_type === 'unconditional_final_waiver') {
      noticeText = 'NOTICE: This document waives and releases lien and payment bond rights and stop payment notice rights unconditionally and states that you have been paid for giving up those rights. This document is enforceable against you if you sign it, even if you have not been paid. Read it before signing.';
    }

    if (noticeText) {
      const noticeY = doc.y;
      const noticeH = 32;
      doc.rect(L, noticeY, W, noticeH).fill('#FFF3CD');
      doc.rect(L, noticeY, W, noticeH).lineWidth(0.5).stroke('#CC9900');
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#7A4F00')
        .text(noticeText, L + 8, noticeY + 6, {width: W - 16, lineBreak: true});
      doc.fillColor('#000000');
      doc.y = noticeY + noticeH + 10;
    }
  }

  // Body text
  doc.fontSize(9).font('Helvetica').text('', L, doc.y);

  if (doc_type === 'preliminary_notice' && jurisdiction === 'california') {
    doc.font('Helvetica-Bold').text('NOTICE TO PROPERTY OWNER', L, doc.y, {align: 'center', width: W});
    doc.moveDown(0.3);
    doc.font('Helvetica').text(
      'If bills are not paid in full for the labor, services, equipment, or materials furnished or to be furnished, ' +
      'a mechanic\'s lien leading to the loss, through court foreclosure proceedings, of all or part of your property ' +
      'being so improved may be placed against the property even though you have paid your contractor in full. You may ' +
      'wish to protect yourself against this consequence by (1) requiring your contractor to furnish a signed release by ' +
      'the person or firm giving you this notice before making payment to your contractor, or (2) any other method or ' +
      'device that is appropriate under the circumstances.',
      L, doc.y, {width: W, align: 'justify'}
    );
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('NOTICE IS HEREBY GIVEN THAT:', L, doc.y, {width: W});
    doc.moveDown(0.2);
    doc.font('Helvetica').list([
      `The undersigned, ${contractorName}, has furnished or will furnish labor, services, equipment, or materials of the following type: General Construction Services`,
      `To: ${ownerName} (Owner) and ${contractorName} (General Contractor)`,
      `For the improvement of property located at: ${loc}`,
      `Project: ${projectName}`
    ], L, doc.y, {bulletRadius: 2, textIndent: 15, indent: 10, width: W});
  } else if (doc_type === 'conditional_waiver' && jurisdiction === 'california') {
    doc.text(
      `Upon receipt by the undersigned of a check from ${maker_of_check || '[Maker of Check]'} in the sum of ${fmtAmt(amount)} ` +
      `payable to ${check_payable_to || contractorName} and when the check has been properly endorsed and has been paid by the bank ` +
      `upon which it is drawn, this document shall become effective to release any mechanic's lien, stop payment notice, or bond right ` +
      `the undersigned has on the job of ${ownerName} located at ${loc} to the following extent. This release covers a progress ` +
      `payment for all labor, services, equipment, or materials furnished to ${ownerName} through ${fmtDate(through_date)}, ` +
      `and does not cover any retention or items, conditions, or obligations for which the claimant has separately secured payment ` +
      `in full. Before any recipient of this document relies on it, the recipient should verify evidence of payment to the undersigned.`,
      L, doc.y, {width: W, align: 'justify'}
    );
  } else if (doc_type === 'unconditional_waiver' && jurisdiction === 'california') {
    doc.text(
      `The undersigned has been paid and has received a progress payment in the sum of ${fmtAmt(amount)} for all labor, services, ` +
      `equipment, or materials furnished to ${ownerName} through ${fmtDate(through_date)} and does hereby release any mechanic's ` +
      `lien, stop payment notice, or bond right the undersigned has on the job of ${ownerName} located at ${loc}. A payment of ` +
      `${fmtAmt(amount)} was received on ${fmtDate(through_date)}.`,
      L, doc.y, {width: W, align: 'justify'}
    );
  } else if (doc_type === 'conditional_final_waiver' && jurisdiction === 'california') {
    doc.text(
      `Upon receipt by the undersigned of a check from ${maker_of_check || '[Maker of Check]'} in the sum of ${fmtAmt(amount)} ` +
      `payable to ${check_payable_to || contractorName} and when the check has been properly endorsed and has been paid by the bank ` +
      `upon which it is drawn, this document shall become effective to release any mechanic's lien, stop payment notice, or bond right ` +
      `the undersigned has on the job of ${ownerName} located at ${loc}. This release covers the final payment for all labor, ` +
      `services, equipment, or materials furnished on the job, except for disputed claims for additional work in the amount of ` +
      `$______________. Before any recipient of this document relies on it, the recipient should verify evidence of payment to the undersigned.`,
      L, doc.y, {width: W, align: 'justify'}
    );
  } else if (doc_type === 'unconditional_final_waiver' && jurisdiction === 'california') {
    doc.text(
      `The undersigned has been paid and has received final payment in the sum of ${fmtAmt(amount)} for all labor, services, ` +
      `equipment, or materials furnished to ${ownerName} on the job of ${ownerName} located at ${loc} and does hereby release ` +
      `any mechanic's lien, stop payment notice, or bond right the undersigned has on the job. A payment of ${fmtAmt(amount)} ` +
      `was received on ${fmtDate(through_date)}. The claimant releases and waives all rights under this title irrespective of payment.`,
      L, doc.y, {width: W, align: 'justify'}
    );
  } else if (doc_type === 'preliminary_notice' && jurisdiction === 'virginia') {
    doc.font('Helvetica-Bold').text('NOTICE TO OWNER PURSUANT TO VIRGINIA CODE §43-4', L, doc.y, {width: W});
    doc.moveDown(0.3);
    doc.font('Helvetica').text(
      `You are hereby notified that the undersigned, ${contractorName}, has performed or will perform labor, ` +
      `services, or furnish materials, machinery, tools, or equipment for improvement of the property described below. ` +
      `This notice is given pursuant to the Virginia Mechanics Lien Law, Title 43 of the Code of Virginia. ` +
      `The owner is advised that the undersigned may, unless paid, have a right to file a memorandum of lien against ` +
      `the property described below within 150 days after the last day materials were furnished or work was performed.`,
      L, doc.y, {width: W, align: 'justify'}
    );
  } else {
    doc.text(
      `The undersigned hereby certifies and declares that all labor, services, equipment, and materials ` +
      `furnished to ${projectName} (the "Project") located at ${loc} for the period through ${fmtDate(through_date)} ` +
      `have been paid in full (or upon payment in the case of a conditional waiver), and hereby releases ` +
      `any and all lien rights, stop notice rights, and payment bond rights for work performed through said date.`,
      L, doc.y, {width: W, align: 'justify'}
    );
  }

  // ── SIGNATURE BLOCK ───────────────────────────────────────────────────────
  doc.moveDown(1.2);
  const sigBoxY = doc.y;
  const sigBoxH = 90;
  doc.rect(L, sigBoxY, W, sigBoxH).lineWidth(0.5).stroke('#AAAAAA');

  const sigColW = W * 0.55;
  doc.moveTo(L + sigColW, sigBoxY).lineTo(L + sigColW, sigBoxY + sigBoxH).lineWidth(0.5).stroke('#AAAAAA');

  doc.fontSize(7).font('Helvetica-Bold').fillColor('#555555')
    .text('AUTHORIZED SIGNATURE', L + 6, sigBoxY + 8, {width: sigColW - 12});

  // Embed uploaded signature image if available
  let sigImagePlaced = false;
  if (project && project.signature_filename) {
    const sigPath = path.join(__dirname, '../../uploads', project.signature_filename);
    if (fs.existsSync(sigPath)) {
      try {
        doc.image(sigPath, L + 6, sigBoxY + 17, {fit: [sigColW - 20, 28], align: 'left', valign: 'center'});
        sigImagePlaced = true;
      } catch (_) { }
    }
  }

  if (sigImagePlaced) {
    // Signature image present — just show the date below it (no name/company overlap)
    doc.fontSize(7.5).font('Helvetica').fillColor('#333333').text(
      `Date: ${signedAt.toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'})}`,
      L + 6, sigBoxY + 48, {width: sigColW - 12}
    );
  } else {
    // No signature image — show signature line + name + company + date
    doc.moveTo(L + 6, sigBoxY + 32).lineTo(L + sigColW - 8, sigBoxY + 32).lineWidth(0.5).stroke('#999999');
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000')
      .text(signatory_name || '', L + 6, sigBoxY + 35, {width: sigColW - 12});
    doc.fontSize(7.5).font('Helvetica').fillColor('#333333')
      .text((signatory_title ? signatory_title + '  ·  ' : '') + contractorName, L + 6, sigBoxY + 50, {width: sigColW - 12});
    doc.fontSize(7.5).text(
      `Date: ${signedAt.toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'})}`,
      L + 6, sigBoxY + 65, {width: sigColW - 12}
    );
  }

  const rX = L + sigColW + 6;
  const rW = W - sigColW - 12;
  doc.fontSize(7).font('Helvetica-Bold').fillColor('#555555').text('ELECTRONIC SIGNATURE DETAILS', rX, sigBoxY + 8, {width: rW});
  doc.fontSize(7.5).font('Helvetica').fillColor('#333333');
  doc.text(
    `Signed: ${signedAt.toLocaleString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short'})}`,
    rX, sigBoxY + 22, {width: rW}
  );
  doc.text(`IP: ${ip}`, rX, sigBoxY + 35, {width: rW});
  doc.fontSize(6.5).text(
    'By signing, the signatory agrees this electronic signature is the legal equivalent of a handwritten signature.',
    rX, sigBoxY + 48, {width: rW}
  );
  doc.fillColor('#000000');
  doc.y = sigBoxY + sigBoxH + 10;

  // ── FOOTER ────────────────────────────────────────────────────────────────
  doc.fontSize(7).fillColor('#999999')
    .text(
      `Generated by Construction AI Billing — constructinv.varshyl.com  |  ${new Date().toISOString().slice(0, 10)}`,
      L, 730, {width: W, align: 'center'}
    );
  doc.fillColor('#000000');
}

async function generateLienDocPDF({
  fpath, doc_type, project, through_date, amount, maker_of_check,
  check_payable_to, signatory_name, signatory_title, signedAt, ip,
  jurisdiction, pay_app_ref
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({size: 'LETTER', margin: 45});
    const stream = fs.createWriteStream(fpath);
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);
    renderLienWaiverContent(doc, {
      doc_type, project, through_date, amount, maker_of_check, check_payable_to,
      signatory_name, signatory_title, signedAt, ip, jurisdiction, pay_app_ref,
      startX: 45, pageW: 522
    });
    doc.end();
  });
}

module.exports = router;
module.exports.generateLienDocPDF = generateLienDocPDF;
