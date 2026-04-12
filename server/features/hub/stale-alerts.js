/**
 * Hub Stale Document Alerts
 *
 * Cron job to send stale alerts for pending hub uploads:
 * - 2-day warning (gentle reminder)
 * - 5-day escalation (stronger warning)
 * - 7-day urgent (critical flag)
 *
 * Tracking columns in hub_uploads:
 * - stale_warning_sent_at (2-day alert)
 * - stale_escalation_sent_at (5-day alert)
 * - 7-day urgent tracked via hub_notifications (trigger_type: 'stale_urgent')
 */

async function runStaleAlerts(db, fromEmail) {
  try {
    const now = new Date();
    const nowISO = now.toISOString();
    console.log(`[StaleAlerts] Running at ${nowISO}`);

    // Get all pending uploads (unpaid, unreviewed documents)
    const uploadsResult = await db.query(`
      SELECT
        hu.id,
        hu.project_id,
        hu.original_name,
        hu.created_at,
        hu.stale_warning_sent_at,
        hu.stale_escalation_sent_at,
        hu.stale_urgent_sent_at,
        p.user_id AS contractor_id,
        u.email AS contractor_email,
        u.name AS contractor_name,
        EXTRACT(EPOCH FROM (NOW() - hu.created_at)) / 86400 AS age_days
      FROM hub_uploads hu
      JOIN projects p ON hu.project_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE hu.status = 'pending'
        AND hu.created_at < NOW() - INTERVAL '2 days'
      ORDER BY hu.created_at ASC
    `);

    const uploads = uploadsResult.rows;
    console.log(`[StaleAlerts] Found ${uploads.length} pending uploads older than 2 days`);

    for (const upload of uploads) {
      const ageDays = Math.floor(upload.age_days);

      // 2-day warning (send only once)
      if (
        ageDays >= 2 &&
        ageDays < 5 &&
        !upload.stale_warning_sent_at
      ) {
        try {
          await sendStaleWarning(
            db,
            upload,
            fromEmail,
            'warning'
          );
          // Mark as sent
          await db.query(
            'UPDATE hub_uploads SET stale_warning_sent_at = NOW() WHERE id = $1',
            [upload.id]
          );
          console.log(`[StaleAlerts] 2-day warning sent for upload ${upload.id}`);
        } catch (err) {
          console.error(
            `[StaleAlerts] Error sending 2-day warning for upload ${upload.id}:`,
            err.message
          );
        }
      }

      // 5-day escalation (send only once)
      if (
        ageDays >= 5 &&
        ageDays < 7 &&
        !upload.stale_escalation_sent_at
      ) {
        try {
          await sendStaleWarning(
            db,
            upload,
            fromEmail,
            'escalation'
          );
          // Mark as sent
          await db.query(
            'UPDATE hub_uploads SET stale_escalation_sent_at = NOW() WHERE id = $1',
            [upload.id]
          );
          console.log(
            `[StaleAlerts] 5-day escalation sent for upload ${upload.id}`
          );
        } catch (err) {
          console.error(
            `[StaleAlerts] Error sending 5-day escalation for upload ${upload.id}:`,
            err.message
          );
        }
      }

      // 7-day urgent (send only once, tracked via stale_urgent_sent_at)
      if (ageDays >= 7 && !upload.stale_urgent_sent_at) {
        try {
          await sendStaleWarning(
            db,
            upload,
            fromEmail,
            'urgent'
          );
          // Mark as sent in hub_uploads
          await db.query(
            'UPDATE hub_uploads SET stale_urgent_sent_at = NOW() WHERE id = $1',
            [upload.id]
          );
          // Also record in hub_notifications for visibility
          await db.query(
            `INSERT INTO hub_notifications
             (project_id, upload_id, user_id, trigger_type, message, created_at)
             VALUES ($1, $2, $3, 'stale_urgent', $4, NOW())`,
            [
              upload.project_id,
              upload.id,
              upload.contractor_id,
              `Document "${upload.original_name}" has been pending for 7 days and requires immediate action.`,
            ]
          );
          console.log(
            `[StaleAlerts] 7-day urgent notification sent for upload ${upload.id}`
          );
        } catch (err) {
          console.error(
            `[StaleAlerts] Error sending 7-day urgent for upload ${upload.id}:`,
            err.message
          );
        }
      }
    }

    console.log('[StaleAlerts] Run completed successfully');
  } catch (err) {
    console.error('[StaleAlerts] Fatal error:', err.message);
  }
}

/**
 * Send stale alert email
 * @param {Pool} db - Database connection pool
 * @param {Object} upload - Upload record
 * @param {string} fromEmail - Sender email address
 * @param {string} severity - 'warning' | 'escalation' | 'urgent'
 */
async function sendStaleWarning(db, upload, fromEmail, severity) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(
      `[StaleAlerts] DEV MODE: ${severity} alert for ${upload.original_name} (age: ${Math.floor(upload.age_days)} days)`
    );
    return;
  }

  const ageDays = Math.floor(upload.age_days);
  let subject, html;

  if (severity === 'warning') {
    subject = `Document Pending Review: ${upload.original_name}`;
    html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
        <h2 style="color:#f59e0b">Document Pending Review</h2>
        <p>Hi ${upload.contractor_name},</p>
        <p>The following document has been pending for <strong>${ageDays} days</strong> and awaits your review or action:</p>
        <div style="background:#fff3cd;border-left:4px solid #f59e0b;padding:16px;margin:20px 0">
          <p style="margin:0"><strong>${upload.original_name}</strong></p>
          <p style="margin:8px 0;color:#666">Uploaded: ${new Date(upload.created_at).toLocaleDateString()}</p>
        </div>
        <p style="margin:24px 0">
          <a href="https://constructinv.varshyl.com/projects/${upload.project_id}"
             style="background:#3b82f6;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">
            Review Document
          </a>
        </p>
        <p style="color:#666;font-size:14px">If you've already reviewed this document, you can ignore this reminder.</p>
      </div>
    `;
  } else if (severity === 'escalation') {
    subject = `Action Required: ${upload.original_name} Pending ${ageDays} Days`;
    html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
        <h2 style="color:#ef4444">Action Required</h2>
        <p>Hi ${upload.contractor_name},</p>
        <p>The following document has been pending for <strong>${ageDays} days</strong> and still awaits your decision:</p>
        <div style="background:#fee2e2;border-left:4px solid #ef4444;padding:16px;margin:20px 0">
          <p style="margin:0"><strong>${upload.original_name}</strong></p>
          <p style="margin:8px 0;color:#666">Uploaded: ${new Date(upload.created_at).toLocaleDateString()}</p>
        </div>
        <p style="margin:24px 0">Please approve or reject this document at your earliest convenience:</p>
        <p style="margin:24px 0">
          <a href="https://constructinv.varshyl.com/projects/${upload.project_id}"
             style="background:#ef4444;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">
            Review Now
          </a>
        </p>
        <p style="color:#666;font-size:14px">Pending documents may impact project billing and approvals.</p>
      </div>
    `;
  } else {
    // urgent
    subject = `URGENT: Document Pending ${ageDays} Days — Immediate Action Required`;
    html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
        <h2 style="color:#dc2626">URGENT: Immediate Action Required</h2>
        <p>Hi ${upload.contractor_name},</p>
        <p>The following document has been pending for <strong>${ageDays} days</strong> and <strong>requires immediate attention</strong>:</p>
        <div style="background:#fecaca;border-left:4px solid #dc2626;padding:16px;margin:20px 0">
          <p style="margin:0"><strong>${upload.original_name}</strong></p>
          <p style="margin:8px 0;color:#666">Uploaded: ${new Date(upload.created_at).toLocaleDateString()}</p>
        </div>
        <p style="margin:24px 0;font-weight:bold;color:#dc2626">This document is critical to your project. Please review and take action immediately.</p>
        <p style="margin:24px 0">
          <a href="https://constructinv.varshyl.com/projects/${upload.project_id}"
             style="background:#dc2626;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:bold">
            Resolve Now
          </a>
        </p>
      </div>
    `;
  }

  // Send email via Resend
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [upload.contractor_email],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Resend API error: ${response.status} ${errText}`
      );
    }

    const data = await response.json();
    console.log(
      `[StaleAlerts] Email sent (${severity}): ${data.id} to ${upload.contractor_email}`
    );
  } catch (err) {
    console.error('[StaleAlerts] Email send failed:', err.message);
    throw err;
  }
}

module.exports = { runStaleAlerts };
