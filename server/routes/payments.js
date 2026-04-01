const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const router = express.Router();

const { pool } = require('../../db');
const { auth, requireStripe } = require('../middleware/auth');
const { stripe, STRIPE_FEE } = require('../services/stripe');
const { logEvent } = require('../lib/logEvent');

// ── Helper: Generate a secure random token ──────────────────────────────
function generatePaymentToken() {
  return crypto.randomBytes(24).toString('hex');
}

// ── Stripe Connect: Create onboarding link for GC ──────────────────────────
router.post('/api/stripe/connect', auth, requireStripe, async (req, res) => {
  try {
    // Check if user already has a connected account
    const existing = await pool.query('SELECT * FROM connected_accounts WHERE user_id=$1', [req.user.id]);
    let accountId;
    if (existing.rows[0]) {
      accountId = existing.rows[0].stripe_account_id;
    } else {
      // Create Express connected account
      const user = (await pool.query('SELECT name, email FROM users WHERE id=$1', [req.user.id])).rows[0];
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: user.email,
        business_type: 'company',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
          us_bank_account_ach_payments: { requested: true },
        },
        metadata: { user_id: String(req.user.id), platform: 'constructinvoice' },
      });
      accountId = account.id;
      await pool.query(
        'INSERT INTO connected_accounts(user_id, stripe_account_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET stripe_account_id=$2',
        [req.user.id, accountId]
      );
      await pool.query('UPDATE users SET stripe_connect_id=$1 WHERE id=$2', [accountId, req.user.id]);
      await logEvent(req.user.id, 'stripe_connect_created', { account_id: accountId });
    }
    // Create onboarding link
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/app.html#payments_setup=refresh`,
      return_url: `${baseUrl}/app.html#payments_setup=complete`,
      type: 'account_onboarding',
    });
    res.json({ url: link.url, account_id: accountId });
  } catch(e) { console.error('[Stripe Connect Error]', e.message); res.status(500).json({ error: e.message }); }
});

// ── Stripe Connect: Check account status ────────────────────────────────────
router.get('/api/stripe/account-status', auth, requireStripe, async (req, res) => {
  try {
    const row = await pool.query('SELECT * FROM connected_accounts WHERE user_id=$1', [req.user.id]);
    if (!row.rows[0]) return res.json({ connected: false });
    const acct = await stripe.accounts.retrieve(row.rows[0].stripe_account_id);
    const charges = acct.charges_enabled;
    const payouts = acct.payouts_enabled;
    await pool.query(
      'UPDATE connected_accounts SET charges_enabled=$1, payouts_enabled=$2, account_status=$3, business_name=$4, onboarded_at=CASE WHEN $1 AND onboarded_at IS NULL THEN NOW() ELSE onboarded_at END WHERE user_id=$5',
      [charges, payouts, charges ? 'active' : 'pending', acct.business_profile?.name || '', req.user.id]
    );
    if (charges) await pool.query('UPDATE users SET payments_enabled=TRUE WHERE id=$1', [req.user.id]);
    res.json({
      connected: true,
      charges_enabled: charges,
      payouts_enabled: payouts,
      account_id: row.rows[0].stripe_account_id,
      business_name: acct.business_profile?.name,
      status: charges ? 'active' : 'pending',
    });
  } catch(e) { console.error('[Stripe Status Error]', e.message); res.status(500).json({ error: e.message }); }
});

// ── Stripe Connect: Create dashboard login link (GC can view their Stripe dashboard) ──
router.post('/api/stripe/dashboard-link', auth, requireStripe, async (req, res) => {
  try {
    const row = await pool.query('SELECT stripe_account_id FROM connected_accounts WHERE user_id=$1', [req.user.id]);
    if (!row.rows[0]) return res.status(404).json({ error: 'No connected account' });
    const link = await stripe.accounts.createLoginLink(row.rows[0].stripe_account_id);
    res.json({ url: link.url });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Generate payment link for a pay app ─────────────────────────────────
router.post('/api/pay-apps/:id/payment-link', auth, requireStripe, async (req, res) => {
  try {
    const pa = (await pool.query('SELECT pa.*, p.name as project_name, p.user_id FROM pay_apps pa JOIN projects p ON pa.project_id=p.id WHERE pa.id=$1', [req.params.id])).rows[0];
    if (!pa || pa.user_id !== req.user.id) return res.status(404).json({ error: 'Pay app not found' });
    // Check GC has Stripe Connect
    const acct = (await pool.query('SELECT * FROM connected_accounts WHERE user_id=$1 AND charges_enabled=TRUE', [req.user.id])).rows[0];
    if (!acct) return res.status(400).json({ error: 'Please connect your Stripe account in Settings first.' });
    // Generate or reuse payment link token
    let token = pa.payment_link_token;
    if (!token) {
      token = generatePaymentToken();
      await pool.query('UPDATE pay_apps SET payment_link_token=$1 WHERE id=$2', [token, pa.id]);
    }
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const payUrl = `${baseUrl}/pay/${token}`;
    await logEvent(req.user.id, 'payment_link_generated', { pay_app_id: pa.id, token });
    res.json({ url: payUrl, token });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Public payment page data (no auth — accessed by payer via link) ──────────
router.get('/api/pay/:token', async (req, res) => {
  try {
    const pa = (await pool.query(
      `SELECT pa.*, p.name as project_name, p.number as project_number, p.owner as project_owner,
              p.contractor, p.user_id, p.owner_email,
              cs.company_name, cs.logo_filename, cs.contact_name, cs.contact_phone, cs.contact_email,
              cs.credit_card_enabled
       FROM pay_apps pa
       JOIN projects p ON pa.project_id=p.id
       LEFT JOIN company_settings cs ON cs.user_id=p.user_id
       WHERE pa.payment_link_token=$1 AND pa.deleted_at IS NULL`,
      [req.params.token]
    )).rows[0];
    if (!pa) return res.status(404).json({ error: 'Payment link not found or expired' });
    // Get connected account for this GC
    const acct = (await pool.query('SELECT stripe_account_id FROM connected_accounts WHERE user_id=$1 AND charges_enabled=TRUE', [pa.user_id])).rows[0];
    if (!acct) return res.status(400).json({ error: 'Contractor has not set up payment acceptance yet.' });
    // Calculate amounts from pay app lines
    const lines = (await pool.query(
      `SELECT pal.*, sl.item_id, sl.description, sl.scheduled_value
       FROM pay_app_lines pal JOIN sov_lines sl ON pal.sov_line_id=sl.id
       WHERE pal.pay_app_id=$1`, [pa.id]
    )).rows;
    let totalDue = 0;
    let totalRetainageHeld = 0;
    let avgRetainagePct = 0;
    lines.forEach(l => {
      const sv = parseFloat(l.scheduled_value) || 0;
      const prevPct = parseFloat(l.prev_pct) || 0;
      const thisPct = parseFloat(l.this_pct) || 0;
      const retPct = parseFloat(l.retainage_pct) || 10;
      const d = sv * (prevPct + thisPct) / 100;
      const e = d * retPct / 100;
      const f = d - e;
      const g = sv * prevPct / 100 * (1 - retPct / 100);
      totalDue += (f - g);
      // Track retainage for this period only
      const thisWork = sv * thisPct / 100;
      totalRetainageHeld += thisWork * retPct / 100;
      avgRetainagePct = retPct; // Use last line's retainage (usually uniform)
    });
    const amountPaid = parseFloat(pa.amount_paid) || 0;
    const amountRemaining = Math.max(0, totalDue - amountPaid);
    // Check if there are any succeeded/pending payments for this pay app
    const existingPayments = (await pool.query(
      "SELECT COUNT(*) as count FROM payments WHERE pay_app_id=$1 AND payment_status IN ('succeeded','pending')", [pa.id]
    )).rows[0].count;
    // Calculate fees for display
    const ccFee = Math.round(amountRemaining * STRIPE_FEE.cc_rate * 100 + STRIPE_FEE.cc_flat) / 100;
    const achFee = STRIPE_FEE.ach_flat / 100; // $25 flat, deducted from GC
    // Build line items for invoice details display
    const lineItems = lines.map(l => {
      const sv = parseFloat(l.scheduled_value) || 0;
      const prevPct = parseFloat(l.prev_pct) || 0;
      const thisPct = parseFloat(l.this_pct) || 0;
      const thisAmt = sv * thisPct / 100;
      return {
        item_id: l.item_id,
        description: l.description,
        scheduled_value: sv,
        this_period: parseFloat(thisAmt.toFixed(2)),
      };
    }).filter(l => l.this_period > 0 || l.scheduled_value > 0);
    res.json({
      project_name: pa.project_name,
      project_number: pa.project_number,
      project_owner: pa.project_owner,
      app_number: pa.app_number,
      period_label: pa.period_label,
      company_name: pa.company_name || pa.contractor,
      logo_filename: pa.logo_filename,
      contact_name: pa.contact_name,
      contact_email: pa.contact_email,
      amount_due: parseFloat(amountRemaining.toFixed(2)),
      amount_paid: amountPaid,
      total_due: parseFloat(totalDue.toFixed(2)),
      payment_status: parseInt(existingPayments) > 0 && (pa.payment_status === 'unpaid' || !pa.payment_status) ? 'processing' : (pa.payment_status || 'unpaid'),
      has_pending_payment: parseInt(existingPayments) > 0,
      bad_debt: pa.bad_debt,
      retainage_held: parseFloat(totalRetainageHeld.toFixed(2)),
      retainage_pct: avgRetainagePct,
      cc_fee: ccFee,
      ach_fee: achFee,
      stripe_account_id: acct.stripe_account_id,
      po_number: pa.po_number,
      lines: lineItems,
      pay_app_id: pa.id,
      credit_card_enabled: pa.credit_card_enabled === true || pa.credit_card_enabled === 'true',
    });
  } catch(e) { console.error('[Pay Page Error]', e.message); res.status(500).json({ error: e.message }); }
});

// ── Public PDF Download (authenticated via payment token) ─────────────────────
router.get('/api/pay/:token/pdf', async (req, res) => {
  try {
    const pa = (await pool.query(
      `SELECT pa.*, p.name as pname, p.number as pnum, p.owner, p.contractor, p.architect,
              p.original_contract, p.payment_terms, p.contract_date, p.user_id,
              p.include_architect, p.include_retainage,
              cs.logo_filename, cs.signature_filename, cs.default_payment_terms,
              cs.contact_name, cs.company_name
       FROM pay_apps pa JOIN projects p ON pa.project_id=p.id
       LEFT JOIN company_settings cs ON cs.user_id=p.user_id
       WHERE pa.payment_link_token=$1 AND pa.deleted_at IS NULL`,
      [req.params.token]
    )).rows[0];
    if (!pa) return res.status(404).json({ error: 'Invoice not found' });
    const lines = await pool.query(
      'SELECT pal.*,sl.item_id,sl.description,sl.scheduled_value FROM pay_app_lines pal JOIN sov_lines sl ON sl.id=pal.sov_line_id WHERE pal.pay_app_id=$1 ORDER BY sl.sort_order',
      [pa.id]
    );
    const cos = await pool.query('SELECT * FROM change_orders WHERE pay_app_id=$1', [pa.id]);
    let tComp=0,tRet=0,tThis=0,tPrev=0,tPrevCert=0;
    lines.rows.forEach(r => {
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
        const fp = path.join(__dirname, '../../uploads', filename);
        if (!fs.existsSync(fp)) return null;
        const buf = fs.readFileSync(fp);
        return `data:${imgMime(buf)};base64,${buf.toString('base64')}`;
      } catch(e) { return null; }
    };
    const logoBase64 = readImgB64(pa.logo_filename);
    const sigBase64 = readImgB64(pa.signature_filename);
    const totals = { tComp, tRet, tPrevCert, tCO, contract, earned, due };
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PayApp_${pa.app_number}_${(pa.pname||'').replace(/\s+/g,'_')}.pdf"`);
    // PDFKit fallback
    const pdfDoc = new PDFDocument({ size: 'LETTER', margin: 40 });
    pdfDoc.pipe(res);
    pdfDoc.fontSize(16).font('Helvetica-Bold').text(`Pay Application #${pa.app_number}`, { align: 'center' });
    pdfDoc.moveDown(0.3);
    pdfDoc.fontSize(11).font('Helvetica').text(`${pa.pname||''} · ${pa.period_label||''}`, { align: 'center' });
    pdfDoc.moveDown(0.5);
    pdfDoc.fontSize(10).text(`Current Payment Due: $${due.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`, { align: 'center' });
    pdfDoc.moveDown(1);
    pdfDoc.fontSize(8).fillColor('#888').text('Generated by ConstructInvoice AI', { align: 'center' });
    pdfDoc.end();
  } catch(e) {
    console.error('[Public PDF Error]', e.message);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// ── Create Stripe Checkout Session (called from payment page) ────────────────
router.post('/api/pay/:token/checkout', async (req, res) => {
  try {
    const { method, amount, payer_name, payer_email } = req.body;
    if (!method || !amount) return res.status(400).json({ error: 'Missing method or amount' });
    const pa = (await pool.query(
      `SELECT pa.*, p.name as project_name, p.user_id, p.contractor
       FROM pay_apps pa JOIN projects p ON pa.project_id=p.id
       WHERE pa.payment_link_token=$1 AND pa.deleted_at IS NULL`, [req.params.token]
    )).rows[0];
    if (!pa) return res.status(404).json({ error: 'Invalid payment link' });
    if (pa.bad_debt) return res.status(400).json({ error: 'This invoice has been marked as uncollectable.' });
    const acct = (await pool.query('SELECT stripe_account_id FROM connected_accounts WHERE user_id=$1 AND charges_enabled=TRUE', [pa.user_id])).rows[0];
    if (!acct) return res.status(400).json({ error: 'Payment not available' });
    // Check if credit card is enabled for this GC
    if (method === 'card') {
      const ccSettings = (await pool.query('SELECT credit_card_enabled FROM company_settings WHERE user_id=$1', [pa.user_id])).rows[0];
      if (!ccSettings || !ccSettings.credit_card_enabled) {
        return res.status(400).json({ error: 'Credit card payments are not enabled. Please use ACH bank transfer.' });
      }
    }
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (amountCents < 100) return res.status(400).json({ error: 'Minimum payment is $1.00' });
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const paymentToken = generatePaymentToken();
    // Calculate CC processing fee upfront (used for card checkout + INSERT)
    const processingFeeCents = Math.round(amountCents * STRIPE_FEE.cc_rate) + STRIPE_FEE.cc_flat;

    let sessionConfig;
    if (method === 'ach') {
      // ACH: $25 fee deducted from GC side. Owner pays exact amount.
      // application_fee = our $25 fee. Stripe takes their $5 from the connected account.
      sessionConfig = {
        payment_method_types: ['us_bank_account'],
        mode: 'payment',
        customer_creation: 'always',
        payment_intent_data: {
          application_fee_amount: STRIPE_FEE.ach_flat, // $25 in cents = 2500
          transfer_data: { destination: acct.stripe_account_id },
        },
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Pay App #${pa.app_number} — ${pa.project_name}`,
              description: `Payment to ${pa.contractor || 'Contractor'}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}/pay/${req.params.token}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pay/${req.params.token}?payment=cancelled`,
        metadata: { pay_app_id: String(pa.id), payment_token: paymentToken, method: 'ach' },
      };
    } else {
      // CC/Debit: 3.3% + $0.40 processing fee charged ON TOP to the payer
      const totalChargeCents = amountCents + processingFeeCents;
      // application_fee = processing fee (we keep the margin, Stripe takes their share from it)
      sessionConfig = {
        payment_method_types: ['card'],
        mode: 'payment',
        payment_intent_data: {
          application_fee_amount: processingFeeCents,
          transfer_data: { destination: acct.stripe_account_id },
        },
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: `Pay App #${pa.app_number} — ${pa.project_name}` },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
          {
            price_data: {
              currency: 'usd',
              product_data: { name: 'Processing Fee' },
              unit_amount: processingFeeCents,
            },
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/pay/${req.params.token}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pay/${req.params.token}?payment=cancelled`,
        metadata: { pay_app_id: String(pa.id), payment_token: paymentToken, method: 'card' },
      };
    }
    // Add payer info if provided
    if (payer_email) sessionConfig.customer_email = payer_email;
    const session = await stripe.checkout.sessions.create(sessionConfig);
    // Record pending payment
    await pool.query(
      `INSERT INTO payments(pay_app_id, project_id, user_id, stripe_checkout_session_id, payment_token, amount, processing_fee, payment_method, payment_status, payer_name, payer_email)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10)`,
      [pa.id, pa.project_id, pa.user_id, session.id, paymentToken, amount,
       method === 'ach' ? 25 : (processingFeeCents || 0) / 100,
       method, payer_name || '', payer_email || '']
    );
    res.json({ checkout_url: session.url, session_id: session.id });
  } catch(e) { console.error('[Checkout Error]', e.message); res.status(500).json({ error: e.message }); }
});

// ── Verify payment on success redirect (fallback if webhook is delayed/missing) ──
router.post('/api/pay/:token/verify', async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'Missing session_id' });
    // Verify this session belongs to this payment token
    const payment = (await pool.query(
      `SELECT p.*, pa.amount_due, pa.id as pay_app_id FROM payments p
       JOIN pay_apps pa ON pa.id=p.pay_app_id
       WHERE p.stripe_checkout_session_id=$1 AND pa.payment_link_token=$2`,
      [session_id, req.params.token]
    )).rows[0];
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    // If already succeeded, just return
    if (payment.payment_status === 'succeeded') return res.json({ status: 'succeeded', already: true });
    // Check with Stripe directly
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status === 'paid' || session.status === 'complete') {
      // Update payment record
      await pool.query(
        `UPDATE payments SET payment_status='succeeded', stripe_payment_intent_id=$1, paid_at=NOW(),
         payer_email=COALESCE(NULLIF(payer_email,''),$2)
         WHERE stripe_checkout_session_id=$3`,
        [session.payment_intent, session.customer_details?.email || '', session_id]
      );
      // Update pay app totals
      const payAppId = payment.pay_app_id;
      const currentPaid = (await pool.query("SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE pay_app_id=$1 AND payment_status='succeeded'", [payAppId])).rows[0].total;
      let totalDue = parseFloat(payment.amount_due) || 0;
      // If amount_due not snapshotted, calculate from line items
      if (totalDue <= 0) {
        const linesResult = await pool.query(
          `SELECT pal.*, sl.scheduled_value FROM pay_app_lines pal
           JOIN sov_lines sl ON pal.sov_line_id=sl.id WHERE pal.pay_app_id=$1`, [payAppId]);
        linesResult.rows.forEach(l => {
          const sv = parseFloat(l.scheduled_value) || 0;
          const prevP = parseFloat(l.prev_pct) || 0;
          const thisP = parseFloat(l.this_pct) || 0;
          const retP = parseFloat(l.retainage_pct) || 10;
          const d2 = sv * (prevP + thisP) / 100;
          const e2 = d2 * retP / 100;
          const f2 = d2 - e2;
          const g2 = sv * prevP / 100 * (1 - retP / 100);
          totalDue += (f2 - g2);
        });
        if (totalDue > 0) await pool.query('UPDATE pay_apps SET amount_due=$1 WHERE id=$2', [totalDue.toFixed(2), payAppId]);
      }
      const paidNum = parseFloat(currentPaid);
      const newStatus = paidNum >= totalDue && totalDue > 0 ? 'paid' : paidNum > 0 ? 'partial' : 'unpaid';
      await pool.query(
        "UPDATE pay_apps SET amount_paid=$1, payment_status=$2, payment_received=$3, payment_received_at=CASE WHEN $2='paid' THEN NOW() ELSE payment_received_at END WHERE id=$4",
        [paidNum, newStatus, newStatus === 'paid', payAppId]
      );
      console.log(`[Payment Verify] Confirmed payment for PA#${payAppId}: $${paidNum} (${newStatus})`);
      return res.json({ status: 'succeeded', payment_status: newStatus, amount_paid: paidNum });
    }
    // ACH might be 'processing' — still pending
    res.json({ status: session.payment_status || 'pending', stripe_status: session.status });
  } catch(e) {
    console.error('[Payment Verify Error]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GC: List payments for their pay apps ────────────────────────────────────
router.get('/api/payments', auth, async (req, res) => {
  try {
    const payments = (await pool.query(
      `SELECT pm.*, pa.app_number, p.name as project_name
       FROM payments pm
       JOIN pay_apps pa ON pm.pay_app_id=pa.id
       JOIN projects p ON pm.project_id=p.id
       WHERE pm.user_id=$1
       ORDER BY pm.created_at DESC
       LIMIT 100`, [req.user.id]
    )).rows;
    // Summary stats
    const stats = (await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE payment_status='succeeded') as received_count,
         COALESCE(SUM(amount) FILTER (WHERE payment_status='succeeded'),0) as total_received,
         COUNT(*) FILTER (WHERE payment_status='pending') as pending_count,
         COALESCE(SUM(amount) FILTER (WHERE payment_status='pending'),0) as total_pending
       FROM payments WHERE user_id=$1`, [req.user.id]
    )).rows[0];
    res.json({ payments, summary: stats, count: payments.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GC: Mark pay app as bad debt ────────────────────────────────────────────
router.post('/api/pay-apps/:id/bad-debt', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    const pa = (await pool.query(
      'SELECT pa.*, p.user_id FROM pay_apps pa JOIN projects p ON pa.project_id=p.id WHERE pa.id=$1', [req.params.id]
    )).rows[0];
    if (!pa || pa.user_id !== req.user.id) return res.status(404).json({ error: 'Pay app not found' });
    await pool.query('UPDATE pay_apps SET bad_debt=TRUE, bad_debt_at=NOW(), bad_debt_reason=$1, payment_status=\'bad_debt\' WHERE id=$2', [reason || 'Marked as uncollectable', req.params.id]);
    await logEvent(req.user.id, 'bad_debt_marked', { pay_app_id: pa.id, reason });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GC: Undo bad debt ──────────────────────────────────────────────────────
router.post('/api/pay-apps/:id/undo-bad-debt', auth, async (req, res) => {
  try {
    const pa = (await pool.query(
      'SELECT pa.*, p.user_id FROM pay_apps pa JOIN projects p ON pa.project_id=p.id WHERE pa.id=$1', [req.params.id]
    )).rows[0];
    if (!pa || pa.user_id !== req.user.id) return res.status(404).json({ error: 'Pay app not found' });
    const amountPaid = parseFloat(pa.amount_paid) || 0;
    const newStatus = amountPaid > 0 ? 'partial' : 'unpaid';
    await pool.query('UPDATE pay_apps SET bad_debt=FALSE, bad_debt_at=NULL, bad_debt_reason=NULL, payment_status=$1 WHERE id=$2', [newStatus, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
