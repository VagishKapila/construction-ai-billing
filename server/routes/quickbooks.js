/**
 * QuickBooks Online Integration Routes
 * Handles OAuth flow, sync operations, and imports
 * Phase 8, Apr 2026
 */

const express = require('express');
const crypto = require('crypto');
const { pool } = require('../../db');
const qb = require('../services/quickbooks');

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// Authentication Middleware
// ──────────────────────────────────────────────────────────────────────────

function auth(req, res, next) {
  const token = (req.headers.authorization && req.headers.authorization.split(' ')[1]) || req.query.token;
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'change-this-secret');
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ──────────────────────────────────────────────────────────────────────────
// OAuth Flow Routes
// ──────────────────────────────────────────────────────────────────────────

/**
 * GET /api/quickbooks/connect
 * Initiates QuickBooks OAuth flow
 */
router.get('/connect', auth, async (req, res) => {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    const userId = req.user.id;

    // Store state in DB for verification on callback
    await pool.query(
      `INSERT INTO quickbooks_connections(user_id, realm_id, access_token_enc, refresh_token_enc, token_expires_at)
       VALUES($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         realm_id = EXCLUDED.realm_id`,
      [userId, `pending_${state}`, 'pending', 'pending']
    );

    // Store state temporarily in a session table (or just verify against DB realm_id on callback)
    const authUrl = qb.getAuthUrl(state);

    res.json({
      url: authUrl,
      state: state,
    });
  } catch (error) {
    console.error('[QB Connect]', error.message);
    res.status(500).json({ error: 'Failed to start QuickBooks connection: ' + error.message });
  }
});

/**
 * GET /api/quickbooks/callback
 * OAuth callback — exchange code for tokens and store in DB
 * Intuit redirects here with ?code=XXX&realmId=YYY&state=ZZZ
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, realmId, state } = req.query;

    if (!code || !realmId || !state) {
      return res.status(400).json({ error: 'Missing OAuth parameters' });
    }

    // Find pending connection by state
    const connResult = await pool.query(
      `SELECT * FROM quickbooks_connections WHERE realm_id LIKE $1`,
      [`pending_${state}%`]
    );

    if (!connResult.rows.length) {
      return res.status(400).json({ error: 'Invalid OAuth state — connection not found' });
    }

    const userId = connResult.rows[0].user_id;

    // Exchange code for tokens
    const tokens = await qb.exchangeCodeForTokens(code, realmId);

    // Encrypt tokens
    const encAccessToken = qb.encryptToken(tokens.access_token);
    const encRefreshToken = qb.encryptToken(tokens.refresh_token);

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Fetch company info from QB to get company name
    // We need access token first, so create a temporary connection object
    const tempConnection = {
      user_id: userId,
      realm_id: realmId,
      access_token: tokens.access_token,
    };

    let companyName = 'QuickBooks Company';
    try {
      const companyInfo = await qb.qbApiCall(tempConnection, 'GET', '/companyinfo/' + realmId);
      if (companyInfo.CompanyInfo) {
        companyName = companyInfo.CompanyInfo.CompanyName || companyName;
      }
    } catch (e) {
      console.warn('[QB] Failed to fetch company info:', e.message);
    }

    // Store connection in DB
    await pool.query(
      `UPDATE quickbooks_connections
       SET realm_id = $1,
           access_token_enc = $2,
           refresh_token_enc = $3,
           token_expires_at = $4,
           company_name = $5,
           company_id = $6,
           sandbox = $7,
           connected_at = NOW(),
           last_sync_at = NOW()
       WHERE user_id = $8`,
      [realmId, encAccessToken, encRefreshToken, expiresAt, companyName, realmId, process.env.QB_SANDBOX === 'true', userId]
    );

    // Redirect to settings page with success message
    const redirectUrl = `${process.env.BASE_URL || 'https://constructinv.varshyl.com'}/app.html#/settings?qb=connected&company=${encodeURIComponent(companyName)}`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('[QB Callback]', error.message);
    const errorUrl = `${process.env.BASE_URL || 'https://constructinv.varshyl.com'}/app.html#/settings?qb=error&message=${encodeURIComponent(error.message)}`;
    res.redirect(errorUrl);
  }
});

/**
 * GET /api/quickbooks/status
 * Get current QB connection status for authenticated user
 */
router.get('/status', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, user_id, realm_id, company_name, sandbox, connected_at, last_sync_at
       FROM quickbooks_connections
       WHERE user_id = $1`,
      [req.user.id]
    );

    if (!result.rows.length) {
      return res.json({ connected: false });
    }

    const connection = result.rows[0];
    res.json({
      connected: true,
      realm_id: connection.realm_id,
      company_name: connection.company_name,
      sandbox: connection.sandbox,
      connected_at: connection.connected_at,
      last_sync_at: connection.last_sync_at,
    });
  } catch (error) {
    console.error('[QB Status]', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/quickbooks/disconnect
 * Remove QB connection for user
 */
router.post('/disconnect', auth, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM quickbooks_connections WHERE user_id = $1`,
      [req.user.id]
    );

    // Clear QB mappings from projects and pay apps
    const projectsResult = await pool.query(
      `SELECT id FROM projects WHERE user_id = $1`,
      [req.user.id]
    );

    const projectIds = projectsResult.rows.map(p => p.id);

    if (projectIds.length > 0) {
      await pool.query(
        `UPDATE projects
         SET qb_customer_id = NULL, qb_project_id = NULL, qb_sync_status = 'not_synced', qb_last_synced_at = NULL
         WHERE user_id = $1`,
        [req.user.id]
      );

      await pool.query(
        `UPDATE pay_apps
         SET qb_invoice_id = NULL, qb_payment_id = NULL, qb_sync_status = 'not_synced'
         WHERE project_id = ANY($1)`,
        [projectIds]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[QB Disconnect]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Sync Operations (Path A: ConstructINV → QB)
// ──────────────────────────────────────────────────────────────────────────

/**
 * POST /api/quickbooks/sync/:projectId
 * Sync project to QB as Customer + create Invoice for all submitted pay apps
 */
router.post('/sync/:projectId', auth, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);

    // Verify user owns project
    const projectResult = await pool.query(
      `SELECT * FROM projects WHERE id = $1 AND user_id = $2`,
      [projectId, req.user.id]
    );

    if (!projectResult.rows.length) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Step 1: Sync project as QB Customer
    const projectSync = await qb.syncProjectToQB(req.user.id, projectId);

    // Step 2: Sync all submitted pay apps as QB Invoices
    const payAppsResult = await pool.query(
      `SELECT * FROM pay_apps WHERE project_id = $1 AND status = 'submitted'`,
      [projectId]
    );

    const syncResults = [];
    for (const payApp of payAppsResult.rows) {
      try {
        const invoiceSync = await qb.syncInvoiceToQB(req.user.id, payApp.id);
        syncResults.push({
          pay_app_id: payApp.id,
          app_number: payApp.app_number,
          success: true,
          qb_invoice_id: invoiceSync.qb_invoice_id,
        });
      } catch (e) {
        console.warn('[QB] Failed to sync pay app:', e.message);
        syncResults.push({
          pay_app_id: payApp.id,
          app_number: payApp.app_number,
          success: false,
          error: e.message,
        });
      }
    }

    res.json({
      success: true,
      project: projectSync,
      pay_apps: syncResults,
    });
  } catch (error) {
    console.error('[QB Sync Project]', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/quickbooks/sync/:projectId/payment
 * Sync payment for a pay app to QB
 * Body: { pay_app_id, amount, date, method, refNumber }
 */
router.post('/sync/:projectId/payment', auth, async (req, res) => {
  try {
    const { pay_app_id, amount, date, method, refNumber } = req.body;

    if (!pay_app_id || !amount) {
      return res.status(400).json({ error: 'pay_app_id and amount required' });
    }

    // Verify user owns pay app
    const payAppResult = await pool.query(
      `SELECT pa.*, p.user_id
       FROM pay_apps pa
       JOIN projects p ON pa.project_id = p.id
       WHERE pa.id = $1 AND p.user_id = $2`,
      [pay_app_id, req.user.id]
    );

    if (!payAppResult.rows.length) {
      return res.status(404).json({ error: 'Pay app not found' });
    }

    const paymentSync = await qb.syncPaymentToQB(req.user.id, pay_app_id, {
      amount,
      date,
      method,
      refNumber,
    });

    res.json({
      success: true,
      ...paymentSync,
    });
  } catch (error) {
    console.error('[QB Sync Payment]', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/quickbooks/sync-log
 * Get sync log for current user (all projects)
 */
router.get('/sync-log', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM quickbooks_sync_log
       WHERE user_id = $1
       ORDER BY synced_at DESC
       LIMIT 100`,
      [req.user.id]
    );

    res.json({ logs: result.rows });
  } catch (error) {
    console.error('[QB Sync Log]', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/quickbooks/sync-log/:projectId
 * Get sync log for specific project
 */
router.get('/sync-log/:projectId', auth, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);

    // Verify user owns project
    const projectResult = await pool.query(
      `SELECT * FROM projects WHERE id = $1 AND user_id = $2`,
      [projectId, req.user.id]
    );

    if (!projectResult.rows.length) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await pool.query(
      `SELECT * FROM quickbooks_sync_log
       WHERE project_id = $1
       ORDER BY synced_at DESC`,
      [projectId]
    );

    res.json({ logs: result.rows });
  } catch (error) {
    console.error('[QB Sync Log Project]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Import Operations (Path B: QB → ConstructINV)
// ──────────────────────────────────────────────────────────────────────────

/**
 * GET /api/quickbooks/estimates
 * List QB estimates available for import
 */
router.get('/estimates', auth, async (req, res) => {
  try {
    const estimates = await qb.getEstimates(req.user.id);

    res.json({
      estimates: estimates,
    });
  } catch (error) {
    console.error('[QB Estimates]', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/quickbooks/import-estimate
 * Import QB estimate as SOV into a project
 * Body: { estimate_id, project_id }
 */
router.post('/import-estimate', auth, async (req, res) => {
  try {
    const { estimate_id, project_id } = req.body;

    if (!estimate_id || !project_id) {
      return res.status(400).json({ error: 'estimate_id and project_id required' });
    }

    // Verify user owns project
    const projectResult = await pool.query(
      `SELECT * FROM projects WHERE id = $1 AND user_id = $2`,
      [project_id, req.user.id]
    );

    if (!projectResult.rows.length) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const importResult = await qb.importEstimateAsSOV(req.user.id, estimate_id, project_id);

    res.json({
      success: true,
      ...importResult,
    });
  } catch (error) {
    console.error('[QB Import Estimate]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Webhook (for QB push notifications)
// ──────────────────────────────────────────────────────────────────────────

/**
 * POST /api/quickbooks/webhook
 * Receive QB webhook notifications (requires verification token)
 * QB will POST with header: intuit-signature
 */
router.post('/webhook', express.json(), async (req, res) => {
  try {
    // TODO: Implement QB webhook signature verification
    // QB sends intuit-signature header with HMAC SHA256 of request body

    const event = req.body;

    // Call service to handle event
    const result = await qb.handleWebhookEvent(event);

    // Always return 200 OK to QB (even if processing fails, so it doesn't retry)
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[QB Webhook]', error.message);
    res.status(200).json({ received: true }); // Still return 200 to QB
  }
});

module.exports = router;
