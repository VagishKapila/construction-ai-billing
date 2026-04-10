/**
 * California Mechanics Lien Rules & Document Generation
 *
 * Based on:
 * - Cal. Civ. Code §8202 (Preliminary Notice requirements)
 * - Cal. Civ. Code §8204 (30-day rule for preliminary notice)
 * - Cal. Civ. Code §8414 (90-day rule for mechanics lien deadline)
 */

const PDFDocument = require('pdfkit');

const CA_LIEN_RULES = {
  preliminaryNoticeWindow: 20,    // days from work start for prelim notice deadline
  mechanicsLienDeadline: 90,      // days from completion for filing lien
  stopPaymentDeadline: 30,        // days from completion
  alertDay15: 15,                 // alert 15 days before deadline
  alertDay19: 19,                 // alert 19 days before deadline
  alertDay20: 20,                 // alert 20 days before deadline
};

/**
 * Add days to a date
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Calculate all critical lien deadlines based on work start date
 */
function calculateDeadlines(workStartDate) {
  const start = new Date(workStartDate);

  return {
    work_start_date: start,
    preliminary_notice_due: addDays(start, CA_LIEN_RULES.preliminaryNoticeWindow),
    mechanics_lien_deadline: addDays(start, CA_LIEN_RULES.mechanicsLienDeadline),
    stop_payment_deadline: addDays(start, CA_LIEN_RULES.stopPaymentDeadline),
    alert_day_15: addDays(start, CA_LIEN_RULES.alertDay15),
    alert_day_19: addDays(start, CA_LIEN_RULES.alertDay19),
    alert_day_20: addDays(start, CA_LIEN_RULES.alertDay20),
  };
}

/**
 * Format date as MM/DD/YYYY
 */
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
}

/**
 * Generate a California Preliminary Notice PDF
 *
 * Cal. Civ. Code §8202 requires:
 * - Contractor/subcontractor name and address
 * - Property owner name and address
 * - General contractor name and address (if applicable)
 * - Work site address
 * - Description of work/materials to be provided
 * - Estimated contract value
 * - Statutory warning text
 *
 * @param {Object} projectData - { name, address, owner_name, owner_email, owner_phone }
 * @param {Object} subData - { name, address, phone, email, estimated_value }
 * @param {Object} gcData - { name, address, email }
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generatePreliminaryNoticePDF(projectData, subData, gcData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 40,
        size: 'letter',
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .text('PRELIMINARY NOTICE', { align: 'center' })
        .fontSize(10)
        .font('Helvetica')
        .text('(California Civil Code §8202)', { align: 'center' })
        .moveDown(0.5);

      // Section 1: Contractor/Subcontractor Information
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('NOTICE FROM:')
        .font('Helvetica')
        .fontSize(10)
        .text(subData.name || 'Subcontractor/Vendor', { width: 450 })
        .text(subData.address || '', { width: 450 })
        .text((subData.phone || '') + ' ' + (subData.email || ''), { width: 450 })
        .moveDown(0.3);

      // Section 2: Owner Information
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('PROPERTY OWNER:')
        .font('Helvetica')
        .fontSize(10)
        .text(projectData.owner_name || 'Owner Name', { width: 450 })
        .text(projectData.address || '', { width: 450 })
        .text((projectData.owner_phone || '') + ' ' + (projectData.owner_email || ''), { width: 450 })
        .moveDown(0.3);

      // Section 3: GC Information
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('GENERAL CONTRACTOR:')
        .font('Helvetica')
        .fontSize(10)
        .text(gcData.name || 'General Contractor Name', { width: 450 })
        .text(gcData.address || '', { width: 450 })
        .text(gcData.email || '', { width: 450 })
        .moveDown(0.3);

      // Section 4: Project Information
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('PROJECT SITE ADDRESS:')
        .font('Helvetica')
        .fontSize(10)
        .text(projectData.address || '', { width: 450 })
        .moveDown(0.3);

      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('DESCRIPTION OF WORK/MATERIALS:')
        .font('Helvetica')
        .fontSize(10)
        .text(subData.description || 'Labor and materials for construction work', { width: 450 })
        .moveDown(0.3);

      // Section 5: Value
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('ESTIMATED CONTRACT VALUE:')
        .font('Helvetica')
        .fontSize(10)
        .text(
          subData.estimated_value ? `$${parseFloat(subData.estimated_value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'To be determined',
          { width: 450 }
        )
        .moveDown(0.5);

      // Statutory Warning
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('IMPORTANT NOTICE:')
        .font('Helvetica')
        .fontSize(9);

      const warningText = `You have a right to a mechanics lien under California law. This means if you are not paid, you may be able to file a lien on the property where work is being done. If you want to preserve your right to file a mechanics lien, you must provide notice to the property owner no later than ${CA_LIEN_RULES.preliminaryNoticeWindow} days after you first furnish labor, materials, or services. A notice must contain the following:

1. Your name, address, and license number (if applicable)
2. The name and address of the owner of the property
3. The name and address of the general contractor or other person who hired you
4. A description of the work you are furnishing or will furnish
5. A description of the property being improved

Mechanics liens and Stop Payment Notices are regulated by California law and may have legal consequences for owners of property. Owners may wish to consult with legal counsel regarding such notices.`;

      doc.text(warningText, { width: 450, align: 'left' });

      doc.moveDown(1);

      // Date line
      doc
        .fontSize(10)
        .text(`Date: ${formatDate(new Date())}`)
        .moveDown(2);

      // Signature
      doc
        .fontSize(10)
        .text('Authorized Representative: _____________________________', { width: 450 })
        .moveDown(0.3)
        .text('Print Name: _____________________________', { width: 450 });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = {
  CA_LIEN_RULES,
  addDays,
  calculateDeadlines,
  formatDate,
  generatePreliminaryNoticePDF,
};
