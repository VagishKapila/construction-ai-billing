const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { pool } = require('../../db');
const { auth } = require('../middleware/auth');
const { upload } = require('../middleware/fileValidation');

const uploadDir = path.join(__dirname, '../../uploads');

// GET /api/projects/:id/other-invoices — List other invoices for a project
router.get('/api/projects/:id/other-invoices', auth, async (req, res) => {
  try {
    const proj = (await pool.query(
      'SELECT id FROM projects WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    )).rows[0];

    if (!proj) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const rows = await pool.query(
      `SELECT * FROM other_invoices
       WHERE project_id=$1 AND user_id=$2 AND deleted_at IS NULL
       ORDER BY invoice_date DESC, created_at DESC`,
      [req.params.id, req.user.id]
    );

    res.json(rows.rows);
  } catch (e) {
    console.error('[GET /api/projects/:id/other-invoices]', e.message);
    res.status(500).json({ error: 'Failed to load other invoices' });
  }
});

// POST /api/projects/:id/other-invoices — Create other invoice
router.post('/api/projects/:id/other-invoices', auth, upload.single('file'), async (req, res) => {
  try {
    const proj = (await pool.query(
      'SELECT id FROM projects WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    )).rows[0];

    if (!proj) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const {
      invoice_number, category, description, vendor, amount, invoice_date, due_date, notes
    } = req.body;

    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Description is required' });
    }

    let attachFilename = null, attachOriginalName = null;
    if (req.file) {
      attachFilename = req.file.filename;
      attachOriginalName = req.file.originalname;
    }

    const result = await pool.query(
      `INSERT INTO other_invoices (project_id, user_id, invoice_number, category,
         description, vendor, amount, invoice_date, due_date, notes,
         attachment_filename, attachment_original_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [req.params.id, req.user.id, invoice_number || null, category || 'other',
       description.trim(), vendor || null, parseFloat(amount) || 0,
       invoice_date || new Date().toISOString().slice(0, 10), due_date || null,
       notes || null, attachFilename, attachOriginalName, 'sent']
    );

    res.json(result.rows[0]);
  } catch (e) {
    console.error('[POST /api/projects/:id/other-invoices]', e.message);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// PUT /api/other-invoices/:id — Update other invoice
router.put('/api/other-invoices/:id', auth, upload.single('file'), async (req, res) => {
  try {
    const inv = (await pool.query(
      'SELECT * FROM other_invoices WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL',
      [req.params.id, req.user.id]
    )).rows[0];

    if (!inv) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const {
      invoice_number, category, description, vendor, amount, invoice_date, due_date, status, notes
    } = req.body;

    let attachFilename = inv.attachment_filename;
    let attachOriginalName = inv.attachment_original_name;

    if (req.file) {
      attachFilename = req.file.filename;
      attachOriginalName = req.file.originalname;
    }

    const result = await pool.query(
      `UPDATE other_invoices SET
        invoice_number=COALESCE($1, invoice_number),
        category=COALESCE($2, category),
        description=COALESCE($3, description),
        vendor=COALESCE($4, vendor),
        amount=COALESCE($5, amount),
        invoice_date=COALESCE($6, invoice_date),
        due_date=COALESCE($7, due_date),
        status=COALESCE($8, status),
        notes=COALESCE($9, notes),
        attachment_filename=$10,
        attachment_original_name=$11
       WHERE id=$12 RETURNING *`,
      [invoice_number, category, description, vendor, amount != null ? parseFloat(amount) : null,
       invoice_date || null, due_date || null, status || null, notes,
       attachFilename, attachOriginalName, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (e) {
    console.error('[PUT /api/other-invoices/:id]', e.message);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// GET /api/other-invoices/:id/attachment — Download invoice attachment
router.get('/api/other-invoices/:id/attachment', auth, async (req, res) => {
  try {
    const inv = (await pool.query(
      'SELECT * FROM other_invoices WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL',
      [req.params.id, req.user.id]
    )).rows[0];

    if (!inv) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (!inv.attachment_filename) {
      return res.status(404).json({ error: 'No attachment' });
    }

    const filePath = path.join(uploadDir, inv.attachment_filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.download(filePath, inv.attachment_original_name || inv.attachment_filename);
  } catch (e) {
    console.error('[GET /api/other-invoices/:id/attachment]', e.message);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

// DELETE /api/other-invoices/:id — Soft-delete other invoice
router.delete('/api/other-invoices/:id', auth, async (req, res) => {
  try {
    const inv = (await pool.query(
      'SELECT * FROM other_invoices WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL',
      [req.params.id, req.user.id]
    )).rows[0];

    if (!inv) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    await pool.query('UPDATE other_invoices SET deleted_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/other-invoices/:id]', e.message);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

// GET /api/other-invoices/:id/pdf — Generate professional invoice PDF
router.get('/api/other-invoices/:id/pdf', auth, async (req, res) => {
  try {
    const inv = (await pool.query(
      `SELECT oi.*, p.name as project_name, p.number as project_number,
              p.owner as project_owner, p.contractor, p.contact_name, p.contact_phone,
              p.contact_email, p.job_number, p.address, p.owner_email, p.owner_phone
       FROM other_invoices oi JOIN projects p ON p.id=oi.project_id
       WHERE oi.id=$1 AND oi.user_id=$2 AND oi.deleted_at IS NULL`,
      [req.params.id, req.user.id]
    )).rows[0];

    if (!inv) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Get company settings for logo/contact
    const settings = (await pool.query(
      'SELECT * FROM company_settings WHERE user_id=$1',
      [req.user.id]
    )).rows[0] || {};

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: {top: 50, bottom: 50, left: 60, right: 60}
    });

    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => {
      const pdf = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="invoice-${inv.invoice_number || inv.id}.pdf"`);
      res.send(pdf);
    });

    // Company logo
    const logoPath = settings.logo_filename ? path.join(uploadDir, settings.logo_filename) : null;
    if (logoPath && fs.existsSync(logoPath)) {
      try { doc.image(logoPath, 60, 40, {width: 100}); } catch (e) { }
    }

    // Header
    doc.fontSize(22).font('Helvetica-Bold').text('INVOICE', 0, 50, {align: 'right', width: 552});
    doc.moveDown(0.3);
    const catDisplay = inv.category
      ? inv.category.charAt(0).toUpperCase() + inv.category.slice(1)
      : 'Other';
    doc.fontSize(10).font('Helvetica').fillColor('#666').text(
      catDisplay + '  ·  Non-contract item',
      0, doc.y, {align: 'right', width: 552}
    );

    // Invoice details box (left side)
    const yStart = 110;
    doc.fillColor('#000');
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Invoice #:', 60, yStart);
    doc.font('Helvetica').text(inv.invoice_number || 'N/A', 140, yStart);
    doc.font('Helvetica-Bold').text('Date:', 60, yStart + 16);
    doc.font('Helvetica').text(inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : 'N/A', 140, yStart + 16);

    if (inv.due_date) {
      doc.font('Helvetica-Bold').text('Due Date:', 60, yStart + 32);
      doc.font('Helvetica').text(new Date(inv.due_date).toLocaleDateString(), 140, yStart + 32);
    }

    // Project info (right side)
    let rightY = yStart;
    doc.font('Helvetica-Bold').fontSize(9).text('Project:', 340, rightY);
    doc.font('Helvetica').text(inv.project_name || '', 410, rightY);
    rightY += 16;

    if (inv.job_number) {
      doc.font('Helvetica-Bold').text('Job #:', 340, rightY);
      doc.font('Helvetica').text(inv.job_number, 410, rightY);
      rightY += 16;
    }

    if (inv.project_number) {
      doc.font('Helvetica-Bold').text('Project #:', 340, rightY);
      doc.font('Helvetica').text(inv.project_number, 410, rightY);
      rightY += 16;
    }

    if (inv.address) {
      doc.font('Helvetica-Bold').text('Address:', 340, rightY);
      doc.font('Helvetica').text(inv.address, 410, rightY, {width: 142});
      rightY += 16;
    }

    if (inv.project_owner) {
      doc.font('Helvetica-Bold').text('Owner:', 340, rightY);
      doc.font('Helvetica').text(inv.project_owner, 410, rightY);
    }

    // Divider
    const divY = yStart + 72;
    doc.moveTo(60, divY).lineTo(552, divY).strokeColor('#ccc').lineWidth(0.5).stroke();

    // From / To
    let curY = divY + 16;
    if (inv.contractor || settings.company_name) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#888').text('FROM', 60, curY);
      doc.fillColor('#000').font('Helvetica').text(settings.company_name || inv.contractor || '', 60, curY + 14);
      if (settings.contact_name || inv.contact_name) doc.text(settings.contact_name || inv.contact_name, 60, curY + 26);
      if (settings.contact_phone || inv.contact_phone) doc.text(settings.contact_phone || inv.contact_phone, 60, curY + 38);
      if (settings.contact_email || inv.contact_email) doc.text(settings.contact_email || inv.contact_email, 60, curY + 50);
    }

    if (inv.vendor) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#888').text('TO / PAYEE', 340, curY);
      doc.fillColor('#000').font('Helvetica').text(inv.vendor, 340, curY + 14);
    }

    // Description & amount table
    curY += 76;
    doc.moveTo(60, curY).lineTo(552, curY).strokeColor('#ccc').lineWidth(0.5).stroke();
    curY += 8;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#888');
    doc.text('DESCRIPTION', 60, curY);
    doc.text('AMOUNT', 440, curY, {width: 112, align: 'right'});
    curY += 18;
    doc.moveTo(60, curY).lineTo(552, curY).strokeColor('#e0e0e0').lineWidth(0.3).stroke();

    // Line item
    const fmtAmt = n => '$' + parseFloat(n || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    curY += 10;
    doc.font('Helvetica').fontSize(11).fillColor('#000').text(inv.description, 60, curY, {width: 350});
    doc.fontSize(11).fillColor('#1d4ed8').font('Helvetica-Bold')
      .text(fmtAmt(inv.amount), 440, curY, {width: 112, align: 'right'});

    // Totals
    curY += 40;
    doc.moveTo(60, curY).lineTo(552, curY).strokeColor('#ccc').lineWidth(0.5).stroke();
    curY += 12;
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('Amount:', 350, curY);
    doc.fontSize(10).fillColor('#1d4ed8').text(fmtAmt(inv.amount), 440, curY, {width: 112, align: 'right'});

    // Notes
    if (inv.notes) {
      curY += 24;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#888').text('NOTES', 60, curY);
      curY += 14;
      doc.font('Helvetica').fontSize(9).fillColor('#000').text(inv.notes, 60, curY, {width: 492});
    }

    // Footer
    doc.fontSize(8).fillColor('#999').text(
      'Generated by ConstructInvoice AI  ·  Non-contract item — not included in G702/G703 contract billing',
      60, 720, {width: 492, align: 'center'}
    );

    doc.end();
  } catch (e) {
    console.error('[GET /api/other-invoices/:id/pdf]', e.message);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

module.exports = router;
