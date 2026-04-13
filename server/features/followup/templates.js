/**
 * Payment follow-up email templates for ConstructInvoice AI.
 * All functions return { subject, html } ready to pass to Resend.
 */

const BASE_URL = process.env.BASE_URL || 'https://constructinv.varshyl.com';

/**
 * Follow-up email sent to the owner (payer).
 * Contains two magic-link buttons: "Yes I Paid" and "Not Yet".
 */
function followupEmail({ ownerName, contractorName, projectName, amount, dueDate, paidToken, notYetToken }) {
  const subject = `Payment reminder: ${projectName} — $${amount} was due ${dueDate}`;

  const paidUrl   = `${BASE_URL}/api/followup/${paidToken}/paid`;
  const notYetUrl = `${BASE_URL}/api/followup/${notYetToken}/not-yet`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">

        <!-- Header -->
        <tr>
          <td style="background:#10b981;padding:24px 32px;">
            <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">ConstructInvoice AI</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:16px;color:#1e293b;">Hi ${ownerName || 'there'},</p>

            <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
              ${contractorName} submitted a pay application for <strong>${projectName}</strong>.
              The payment of <strong>$${amount}</strong> was due on <strong>${dueDate}</strong>.
            </p>

            <p style="margin:0 0 24px;font-size:15px;color:#475569;">
              Quick question &mdash; have you sent payment?
            </p>

            <!-- CTA Buttons -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
              <tr>
                <td style="padding-right:12px;">
                  <a href="${paidUrl}"
                     style="display:inline-block;background:#10b981;color:#ffffff;font-size:15px;font-weight:600;padding:14px 28px;border-radius:6px;text-decoration:none;">
                    &#x2705; Yes, I&apos;ve Paid
                  </a>
                </td>
                <td>
                  <a href="${notYetUrl}"
                     style="display:inline-block;background:#f1f5f9;color:#334155;font-size:15px;font-weight:600;padding:14px 28px;border-radius:6px;text-decoration:none;border:1px solid #e2e8f0;">
                    &#x23F3; Not Yet
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
              If you have questions about this invoice, reply to this email or contact
              ${contractorName} directly.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              You received this because you are the owner on a ConstructInvoice AI pay application.
              &nbsp;&middot;&nbsp;
              <a href="https://constructinv.varshyl.com" style="color:#10b981;">ConstructInvoice AI</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

/**
 * Confirmation page HTML shown after clicking Yes/Not Yet.
 * Served inline (res.send) — not an email.
 */
function confirmationPage({ status, projectName, contractorName, baseUrl }) {
  const isPaid    = status === 'paid';
  const isInvalid = status === 'invalid' || status === 'expired';
  const headline  = isPaid
    ? '&#x2705; Payment confirmed!'
    : isInvalid
      ? 'This link is no longer valid.'
      : '&#x23F3; Got it &mdash; we\'ll follow up soon.';
  const message = isPaid
    ? `Thanks for confirming! ${contractorName} has been notified that payment for <strong>${projectName}</strong> is on the way.`
    : isInvalid
      ? 'This link may have expired or already been used. Please contact your contractor directly.'
      : `Thanks for letting us know. ${contractorName} will follow up with you about the payment for <strong>${projectName}</strong>.`;

  const resolvedBase = baseUrl || BASE_URL;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>ConstructInvoice AI</title></head>
<body style="margin:0;padding:40px 20px;background:#f8fafc;font-family:'Helvetica Neue',Arial,sans-serif;text-align:center;">
  <div style="max-width:480px;margin:60px auto;background:#fff;border-radius:8px;padding:40px;border:1px solid #e2e8f0;">
    <img src="${resolvedBase}/varshyl-logo.png" alt="ConstructInvoice AI" style="height:40px;margin-bottom:24px;">
    <h1 style="font-size:22px;color:#1e293b;margin:0 0 16px;">${headline}</h1>
    <p style="font-size:15px;color:#475569;line-height:1.6;">${message}</p>
    <p style="margin-top:32px;font-size:13px;color:#94a3b8;">You can close this window.</p>
  </div>
</body>
</html>`;
}

module.exports = { followupEmail, confirmationPage };
