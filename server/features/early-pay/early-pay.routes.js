'use strict';
const express = require('express');
const router = express.Router();
const { auth } = require('../../middleware/auth');
const { pool } = require('../../../db');

// Lazy Stripe init — avoids startup crash when STRIPE_SECRET_KEY is not set in local dev
let _stripe = null;
function getStripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
    _stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

/**
 * ENDPOINT 1: GET /api/early-pay/eligibility/:hubUploadId
 * Check if an approved invoice is eligible for early payment
 * Returns: { eligible: bool, reason: string, fee_pct: 0.025, estimated_fee: number, net_amount: number }
 */
router.get('/api/early-pay/eligibility/:hubUploadId', auth, async (req, res) => {
  try {
    const hubUploadId = parseInt(req.params.hubUploadId);
    if (!hubUploadId || isNaN(hubUploadId)) {
      return res.status(400).json({ data: null, error: 'Invalid hub upload ID' });
    }

    // Fetch hub upload
    const uploadResult = await pool.query(
      `SELECT id, project_id, trade_id, status, doc_type, amount FROM hub_uploads WHERE id = $1`,
      [hubUploadId]
    );
    if (uploadResult.rows.length === 0) {
      return res.status(404).json({ data: null, error: 'Upload not found' });
    }
    const upload = uploadResult.rows[0];

    // Validate: must be approved and invoice doc type
    if (upload.status !== 'approved' || upload.doc_type !== 'invoice') {
      return res.json({
        data: {
          eligible: false,
          reason: upload.status !== 'approved' ? 'Invoice not yet approved' : 'Document is not an invoice',
          fee_pct: 0.025,
          estimated_fee: 0,
          net_amount: 0
        },
        error: null
      });
    }

    if (!upload.amount || upload.amount <= 0) {
      return res.json({
        data: {
          eligible: false,
          reason: 'Invoice amount is missing or zero',
          fee_pct: 0.025,
          estimated_fee: 0,
          net_amount: 0
        },
        error: null
      });
    }

    // Check GC override
    const overrideResult = await pool.query(
      `SELECT gc_early_pay_override FROM project_trades WHERE id = $1 AND project_id = $2`,
      [upload.trade_id, upload.project_id]
    );
    if (overrideResult.rows.length > 0 && overrideResult.rows[0].gc_early_pay_override) {
      const feePct = 0.025;
      const feeAmount = Number((upload.amount * feePct).toFixed(2));
      const netAmount = Number((upload.amount - feeAmount).toFixed(2));
      return res.json({
        data: {
          eligible: true,
          reason: 'GC has enabled early payment for this trade',
          fee_pct: feePct,
          estimated_fee: feeAmount,
          net_amount: netAmount
        },
        error: null
      });
    }

    // Check vendor trust score
    const trustResult = await pool.query(
      `SELECT score FROM vendor_trust_scores WHERE project_id = $1
       AND vendor_email IN (
         SELECT contact_email FROM project_trades WHERE id = $1
       ) LIMIT 1`,
      [upload.project_id]
    );
    if (trustResult.rows.length > 0) {
      const score = trustResult.rows[0].score;
      if (score >= 381) {
        const feePct = 0.025;
        const feeAmount = Number((upload.amount * feePct).toFixed(2));
        const netAmount = Number((upload.amount - feeAmount).toFixed(2));
        return res.json({
          data: {
            eligible: true,
            reason: `Vendor trust score is ${score} (Silver+ tier)`,
            fee_pct: feePct,
            estimated_fee: feeAmount,
            net_amount: netAmount
          },
          error: null
        });
      }
    }

    // Not eligible
    return res.json({
      data: {
        eligible: false,
        reason: 'Vendor does not meet eligibility requirements (trust score < 381)',
        fee_pct: 0.025,
        estimated_fee: 0,
        net_amount: 0
      },
      error: null
    });
  } catch (err) {
    console.error('[Early Pay] eligibility error:', err);
    res.status(500).json({ data: null, error: 'Failed to check eligibility' });
  }
});

/**
 * ENDPOINT 2: POST /api/early-pay/request/:hubUploadId
 * Sub requests early payment on an approved invoice
 */
router.post('/api/early-pay/request/:hubUploadId', auth, async (req, res) => {
  try {
    const hubUploadId = parseInt(req.params.hubUploadId);
    const userId = req.user.id;

    if (!hubUploadId || isNaN(hubUploadId)) {
      return res.status(400).json({ data: null, error: 'Invalid hub upload ID' });
    }

    // Fetch upload
    const uploadResult = await pool.query(
      `SELECT id, project_id, trade_id, status, doc_type, amount FROM hub_uploads WHERE id = $1`,
      [hubUploadId]
    );
    if (uploadResult.rows.length === 0) {
      return res.status(404).json({ data: null, error: 'Upload not found' });
    }
    const upload = uploadResult.rows[0];

    // Validate approval and invoice type
    if (upload.status !== 'approved' || upload.doc_type !== 'invoice') {
      return res.status(400).json({ data: null, error: 'Invoice must be approved to request early payment' });
    }

    if (!upload.amount || upload.amount <= 0) {
      return res.status(400).json({ data: null, error: 'Invalid invoice amount' });
    }

    // Check eligibility (same logic as GET endpoint)
    const overrideResult = await pool.query(
      `SELECT gc_early_pay_override FROM project_trades WHERE id = $1 AND project_id = $2`,
      [upload.trade_id, upload.project_id]
    );
    let isEligible = overrideResult.rows.length > 0 && overrideResult.rows[0].gc_early_pay_override;

    if (!isEligible) {
      const trustResult = await pool.query(
        `SELECT score FROM vendor_trust_scores WHERE project_id = $1
         AND vendor_email IN (
           SELECT contact_email FROM project_trades WHERE id = $1
         ) LIMIT 1`,
        [upload.project_id]
      );
      if (trustResult.rows.length > 0 && trustResult.rows[0].score >= 381) {
        isEligible = true;
      }
    }

    if (!isEligible) {
      return res.status(400).json({ data: null, error: 'Not eligible for early payment' });
    }

    // Calculate fees
    const feePct = 0.025;
    const feeAmount = Number((upload.amount * feePct).toFixed(2));
    const netAmount = Number((upload.amount - feeAmount).toFixed(2));

    // Get requestor name from trade
    const tradeResult = await pool.query(
      `SELECT contact_name FROM project_trades WHERE id = $1`,
      [upload.trade_id]
    );
    const requestedBy = tradeResult.rows.length > 0 ? tradeResult.rows[0].contact_name : 'Unknown';

    // Insert early payment request
    const requestResult = await pool.query(
      `INSERT INTO early_payment_requests
       (hub_upload_id, project_id, trade_id, requested_by, amount, fee_pct, fee_amount, net_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING id, amount, fee_amount, net_amount, status, created_at`,
      [hubUploadId, upload.project_id, upload.trade_id, requestedBy, upload.amount, feePct, feeAmount, netAmount]
    );

    const request = requestResult.rows[0];
    const requestId = request.id;

    // Update hub_uploads to mark early pay requested
    await pool.query(
      `UPDATE hub_uploads SET early_pay_requested = true, early_pay_request_id = $1 WHERE id = $2`,
      [requestId, hubUploadId]
    );

    res.status(201).json({
      data: {
        id: requestId,
        hub_upload_id: hubUploadId,
        project_id: upload.project_id,
        amount: request.amount,
        fee_amount: request.fee_amount,
        net_amount: request.net_amount,
        status: request.status,
        created_at: request.created_at
      },
      error: null
    });
  } catch (err) {
    console.error('[Early Pay] request error:', err);
    res.status(500).json({ data: null, error: 'Failed to create early payment request' });
  }
});

/**
 * ENDPOINT 3: GET /api/early-pay/requests
 * GC sees all pending early payment requests for their projects
 */
router.get('/api/early-pay/requests', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT
         epr.id,
         epr.hub_upload_id,
         epr.amount,
         epr.fee_amount,
         epr.net_amount,
         epr.status,
         epr.created_at,
         epr.updated_at,
         p.name as project_name,
         pt.name as trade_name,
         hu.original_name as invoice_filename
       FROM early_payment_requests epr
       JOIN projects p ON epr.project_id = p.id
       JOIN project_trades pt ON epr.trade_id = pt.id
       JOIN hub_uploads hu ON epr.hub_upload_id = hu.id
       WHERE p.user_id = $1
       ORDER BY epr.created_at DESC`,
      [userId]
    );

    res.json({
      data: result.rows,
      error: null
    });
  } catch (err) {
    console.error('[Early Pay] requests list error:', err);
    res.status(500).json({ data: null, error: 'Failed to fetch early payment requests' });
  }
});

/**
 * ENDPOINT 4: POST /api/early-pay/approve/:requestId
 * GC approves and initiates early payment (via Stripe or manual)
 */
router.post('/api/early-pay/approve/:requestId', auth, async (req, res) => {
  try {
    const requestId = parseInt(req.params.requestId);
    const userId = req.user.id;

    if (!requestId || isNaN(requestId)) {
      return res.status(400).json({ data: null, error: 'Invalid request ID' });
    }

    // Fetch the request
    const reqResult = await pool.query(
      `SELECT epr.*, p.user_id as project_owner_id FROM early_payment_requests epr
       JOIN projects p ON epr.project_id = p.id
       WHERE epr.id = $1`,
      [requestId]
    );

    if (reqResult.rows.length === 0) {
      return res.status(404).json({ data: null, error: 'Request not found' });
    }

    const request = reqResult.rows[0];

    // Verify GC owns this project
    if (request.project_owner_id !== userId) {
      return res.status(403).json({ data: null, error: 'Not authorized' });
    }

    // Verify pending status
    if (request.status !== 'pending') {
      return res.status(400).json({ data: null, error: 'Request is not pending' });
    }

    // Get trade vendor info for Stripe transfer
    const tradeResult = await pool.query(
      `SELECT pt.contact_email, pt.contact_name, ca.stripe_connect_id
       FROM project_trades pt
       LEFT JOIN connected_accounts ca ON ca.user_id = (
         SELECT id FROM users WHERE email = pt.contact_email
       )
       WHERE pt.id = $1`,
      [request.trade_id]
    );

    const trade = tradeResult.rows[0];

    // Try Stripe payment if vendor has connected account
    let stripePaymentIntentId = null;
    let stripeTransferId = null;
    let newStatus = 'pending';

    if (trade && trade.stripe_connect_id) {
      try {
        // Get GC's Stripe account
        const gcConnectedResult = await pool.query(
          `SELECT stripe_connect_id FROM connected_accounts WHERE user_id = $1 LIMIT 1`,
          [userId]
        );

        if (gcConnectedResult.rows.length > 0) {
          const gcStripeId = gcConnectedResult.rows[0].stripe_connect_id;

          // Create PaymentIntent on GC's account (charge their account for the fee)
          const paymentIntent = await getStripe().paymentIntents.create(
            {
              amount: Math.round(request.fee_amount * 100), // Convert to cents
              currency: 'usd',
              description: `Early payment processing fee for ${trade.contact_name}`,
              metadata: {
                early_payment_request_id: requestId
              }
            },
            { stripeAccount: gcStripeId }
          );
          stripePaymentIntentId = paymentIntent.id;

          // Create Transfer to vendor's account (send net amount)
          const transfer = await getStripe().transfers.create(
            {
              amount: Math.round(request.net_amount * 100), // Convert to cents
              currency: 'usd',
              destination: trade.stripe_connect_id,
              description: `Early payment for invoice - ${request.hub_upload_id}`,
              metadata: {
                early_payment_request_id: requestId
              }
            },
            { stripeAccount: gcStripeId }
          );
          stripeTransferId = transfer.id;
          newStatus = 'disbursed';
        }
      } catch (stripeErr) {
        console.error('[Early Pay] Stripe error:', stripeErr.message);
        // Fall through to 'approved' status (manual disbursement)
        newStatus = 'approved';
      }
    } else {
      // No Stripe account, mark as approved (manual disbursement needed)
      newStatus = 'approved';
    }

    // Update early payment request
    const updateResult = await pool.query(
      `UPDATE early_payment_requests
       SET status = $1, stripe_payment_intent_id = $2, stripe_transfer_id = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [newStatus, stripePaymentIntentId, stripeTransferId, requestId]
    );

    const updatedRequest = updateResult.rows[0];

    res.json({
      data: {
        id: updatedRequest.id,
        status: updatedRequest.status,
        amount: updatedRequest.amount,
        fee_amount: updatedRequest.fee_amount,
        net_amount: updatedRequest.net_amount,
        stripe_payment_intent_id: updatedRequest.stripe_payment_intent_id,
        stripe_transfer_id: updatedRequest.stripe_transfer_id,
        message: newStatus === 'disbursed' ? 'Early payment processed via Stripe' : 'Approved - manual disbursement required'
      },
      error: null
    });
  } catch (err) {
    console.error('[Early Pay] approve error:', err);
    res.status(500).json({ data: null, error: 'Failed to approve early payment' });
  }
});

/**
 * ENDPOINT 5: POST /api/early-pay/reject/:requestId
 * GC rejects an early payment request
 */
router.post('/api/early-pay/reject/:requestId', auth, async (req, res) => {
  try {
    const requestId = parseInt(req.params.requestId);
    const userId = req.user.id;
    const { reason } = req.body;

    if (!requestId || isNaN(requestId)) {
      return res.status(400).json({ data: null, error: 'Invalid request ID' });
    }

    // Fetch the request
    const reqResult = await pool.query(
      `SELECT epr.*, p.user_id as project_owner_id FROM early_payment_requests epr
       JOIN projects p ON epr.project_id = p.id
       WHERE epr.id = $1`,
      [requestId]
    );

    if (reqResult.rows.length === 0) {
      return res.status(404).json({ data: null, error: 'Request not found' });
    }

    const request = reqResult.rows[0];

    // Verify GC owns this project
    if (request.project_owner_id !== userId) {
      return res.status(403).json({ data: null, error: 'Not authorized' });
    }

    // Update status to rejected
    const updateResult = await pool.query(
      `UPDATE early_payment_requests
       SET status = 'rejected', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [requestId]
    );

    const updatedRequest = updateResult.rows[0];

    res.json({
      data: {
        id: updatedRequest.id,
        status: updatedRequest.status,
        amount: updatedRequest.amount
      },
      error: null
    });
  } catch (err) {
    console.error('[Early Pay] reject error:', err);
    res.status(500).json({ data: null, error: 'Failed to reject early payment' });
  }
});

/**
 * ENDPOINT 6: POST /api/early-pay/gc-toggle/:tradeId
 * GC toggles early pay override for a trade (bypass trust score)
 */
router.post('/api/early-pay/gc-toggle/:tradeId', auth, async (req, res) => {
  try {
    const tradeId = parseInt(req.params.tradeId);
    const userId = req.user.id;

    if (!tradeId || isNaN(tradeId)) {
      return res.status(400).json({ data: null, error: 'Invalid trade ID' });
    }

    // Fetch trade and verify GC owns the project
    const tradeResult = await pool.query(
      `SELECT pt.id, pt.gc_early_pay_override, p.user_id as project_owner_id
       FROM project_trades pt
       JOIN projects p ON pt.project_id = p.id
       WHERE pt.id = $1`,
      [tradeId]
    );

    if (tradeResult.rows.length === 0) {
      return res.status(404).json({ data: null, error: 'Trade not found' });
    }

    const trade = tradeResult.rows[0];

    // Verify authorization
    if (trade.project_owner_id !== userId) {
      return res.status(403).json({ data: null, error: 'Not authorized' });
    }

    // Toggle the override
    const newValue = !trade.gc_early_pay_override;
    await pool.query(
      `UPDATE project_trades SET gc_early_pay_override = $1 WHERE id = $2`,
      [newValue, tradeId]
    );

    res.json({
      data: {
        trade_id: tradeId,
        gc_early_pay_override: newValue
      },
      error: null
    });
  } catch (err) {
    console.error('[Early Pay] toggle error:', err);
    res.status(500).json({ data: null, error: 'Failed to toggle early pay override' });
  }
});

module.exports = router;
