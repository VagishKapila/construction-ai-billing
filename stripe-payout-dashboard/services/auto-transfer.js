/**
 * stripe-payout-dashboard/services/auto-transfer.js
 * Module 4 — Auto Transfer Logic
 *
 * Called every time an invoice is paid.
 * Calculates the split, creates the Stripe transfer, and logs it to DB.
 *
 * Usage:
 *   const { createTransfer } = require('./stripe-payout-dashboard/services/auto-transfer');
 *   const result = await createTransfer({
 *     invoiceId:          'pay_app_123',
 *     amountPaidCents:    1500000,          // $15,000 in cents
 *     connectedAccountId: 'acct_1TKlrsAUqZyUhjJj',
 *     paymentMethod:      'card' | 'ach',   // to calculate Stripe fees correctly
 *     platformFeePercent: 2.5,              // optional — overrides PLATFORM_FEE_PERCENT env var
 *   });
 */
'use strict';

const Stripe   = require('stripe');
const { pool } = require('../db');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Platform fee — read from env, default 2.5%
const DEFAULT_PLATFORM_FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENT || '2.5');

// Stripe's own processing fees (for informational breakdown — NOT deducted here,
// Stripe has already taken these before the funds appear in the platform balance)
const STRIPE_FEES = {
  card: { rate: 0.033, flat: 0.40 },   // 3.3% + $0.40
  ach:  { flat: 25.00,  rate: 0    },  // $25 flat
};

/**
 * Calculate fee breakdown for a given payment.
 * @param {number} grossCents     — total charged to the customer (cents)
 * @param {string} method         — 'card' | 'ach'
 * @param {number} platformFeePercent
 * @returns {{ stripeFee, platformFee, vendorAmount }} all in cents
 */
function calculateFees(grossCents, method = 'card', platformFeePercent = DEFAULT_PLATFORM_FEE_PERCENT) {
  const gross = grossCents;

  // Stripe fee (already deducted before platform sees funds — informational only)
  let stripeFee;
  if (method === 'ach') {
    stripeFee = Math.round(STRIPE_FEES.ach.flat * 100); // $25 = 2500 cents
  } else {
    stripeFee = Math.round(gross * STRIPE_FEES.card.rate + STRIPE_FEES.card.flat * 100);
  }

  // Net received by platform after Stripe (this is what we actually transfer FROM)
  const netReceivedCents = gross - stripeFee;

  // Platform fee taken from net
  const platformFeeCents = Math.round(netReceivedCents * (platformFeePercent / 100));

  // What the vendor/GC receives
  const vendorAmountCents = netReceivedCents - platformFeeCents;

  return {
    grossCents,
    stripeFeeCents:    stripeFee,
    netReceivedCents,
    platformFeeCents,
    platformFeePercent,
    vendorAmountCents,
    // Dollar equivalents for logging
    gross:             gross         / 100,
    stripeFee:         stripeFee     / 100,
    netReceived:       netReceivedCents / 100,
    platformFee:       platformFeeCents / 100,
    vendorAmount:      vendorAmountCents / 100,
  };
}

/**
 * Create a Stripe transfer from platform → connected account.
 * Saves the transfer record to stripe_transfers_log.
 *
 * @param {object} params
 * @param {string} params.invoiceId             — pay app / invoice ID (for transfer_group)
 * @param {number} params.amountPaidCents       — gross amount paid by customer (cents)
 * @param {string} params.connectedAccountId    — Stripe connected account ID (acct_xxx)
 * @param {'card'|'ach'} params.paymentMethod   — payment method used
 * @param {number} [params.platformFeePercent]  — override platform fee %, default from env
 * @param {string} [params.description]         — transfer description shown in Stripe
 * @param {object} [params.extraMetadata]       — extra metadata to attach to transfer
 * @returns {Promise<{ transfer, fees, error }>}
 */
async function createTransfer({
  invoiceId,
  amountPaidCents,
  connectedAccountId,
  paymentMethod = 'card',
  platformFeePercent,
  description,
  extraMetadata = {},
}) {
  if (!invoiceId)          throw new Error('invoiceId is required');
  if (!amountPaidCents)    throw new Error('amountPaidCents is required');
  if (!connectedAccountId) throw new Error('connectedAccountId is required');

  const feePercent = platformFeePercent ?? DEFAULT_PLATFORM_FEE_PERCENT;
  const fees       = calculateFees(amountPaidCents, paymentMethod, feePercent);

  if (fees.vendorAmountCents <= 0) {
    throw new Error(`Vendor amount is $${fees.vendorAmount.toFixed(2)} — fees exceed payment. Cannot transfer.`);
  }

  const transferGroup = `invoice_${invoiceId}`;
  const desc          = description || `Pay App #${invoiceId} — ConstructInvoice AI`;

  const metadata = {
    invoice_id:           String(invoiceId),
    payment_method:       paymentMethod,
    gross_amount:         String(fees.gross),
    stripe_fee:           String(fees.stripeFee),
    platform_fee:         String(fees.platformFee),
    platform_fee_percent: String(fees.platformFeePercent),
    vendor_amount:        String(fees.vendorAmount),
    ...extraMetadata,
  };

  console.log(`[AutoTransfer] Creating transfer: invoice=${invoiceId} gross=$${fees.gross} ` +
    `platform_fee=$${fees.platformFee} (${feePercent}%) vendor=$${fees.vendorAmount} → ${connectedAccountId}`);

  let transfer;
  try {
    transfer = await stripe.transfers.create({
      amount:         fees.vendorAmountCents,
      currency:       'usd',
      destination:    connectedAccountId,
      transfer_group: transferGroup,
      description:    desc,
      metadata,
    });
  } catch (stripeErr) {
    console.error(`[AutoTransfer] Stripe error for invoice ${invoiceId}:`, stripeErr.message);
    return { transfer: null, fees, error: stripeErr.message };
  }

  // Save to DB
  try {
    await pool.query(`
      INSERT INTO stripe_transfers_log
        (transfer_id, destination_account, amount, currency, transfer_group, description, status, metadata, stripe_created_at)
      VALUES ($1,$2,$3,'usd',$4,$5,'created',$6,to_timestamp($7))
      ON CONFLICT (transfer_id) DO NOTHING
    `, [
      transfer.id,
      connectedAccountId,
      fees.vendorAmount,
      transferGroup,
      desc,
      JSON.stringify(metadata),
      transfer.created,
    ]);
  } catch (dbErr) {
    // Log but don't fail — transfer already succeeded in Stripe
    console.error('[AutoTransfer] DB log failed (transfer succeeded in Stripe):', dbErr.message);
  }

  console.log(`[AutoTransfer] SUCCESS: ${transfer.id} — $${fees.vendorAmount.toFixed(2)} to ${connectedAccountId}`);
  return { transfer, fees, error: null };
}

/**
 * Preview fee breakdown without creating a transfer.
 * Useful for showing the contractor what they'll receive before sending.
 */
function previewFees(amountPaidCents, paymentMethod = 'card', platformFeePercent) {
  return calculateFees(amountPaidCents, paymentMethod, platformFeePercent ?? DEFAULT_PLATFORM_FEE_PERCENT);
}

module.exports = { createTransfer, previewFees, calculateFees };
