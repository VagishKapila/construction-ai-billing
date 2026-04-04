/**
 * QuickBooks Online Integration Service
 * Handles OAuth 2.0 flow, token management, and QB API operations
 * Phase 8, Apr 2026
 */

const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { pool } = require('../../db');

// ──────────────────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────────────────

const QB_CONFIG = {
  client_id: process.env.QB_CLIENT_ID,
  client_secret: process.env.QB_CLIENT_SECRET,
  redirect_uri: process.env.QB_REDIRECT_URI || 'https://constructinv.varshyl.com/api/quickbooks/callback',
  sandbox: process.env.QB_SANDBOX === 'true',
};

const QB_URLS = {
  auth: 'https://appcenter.intuit.com/connect/oauth2',
  token: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
  sandbox_api: 'https://sandbox-quickbooks.api.intuit.com',
  production_api: 'https://quickbooks.api.intuit.com',
};

const QB_API_BASE = QB_CONFIG.sandbox ? QB_URLS.sandbox_api : QB_URLS.production_api;
const QB_ENCRYPTION_KEY = process.env.QB_ENCRYPTION_KEY;

if (!QB_CONFIG.client_id || !QB_CONFIG.client_secret) {
  console.warn('[QB] WARNING: QB_CLIENT_ID or QB_CLIENT_SECRET not set — QuickBooks integration disabled');
}

if (!QB_ENCRYPTION_KEY || QB_ENCRYPTION_KEY.length !== 64) {
  console.warn('[QB] WARNING: QB_ENCRYPTION_KEY must be 32-byte hex string (64 chars) — tokens will fail to encrypt');
}

// ──────────────────────────────────────────────────────────────────────────
// Token Encryption/Decryption (AES-256-GCM)
// ──────────────────────────────────────────────────────────────────────────

function encryptToken(plaintext) {
  if (!QB_ENCRYPTION_KEY) throw new Error('QB_ENCRYPTION_KEY not set');

  const key = Buffer.from(QB_ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  // Format: iv.authTag.encrypted
  return `${iv.toString('hex')}.${authTag.toString('hex')}.${encrypted}`;
}

function decryptToken(encryptedData) {
  if (!QB_ENCRYPTION_KEY) throw new Error('QB_ENCRYPTION_KEY not set');

  const key = Buffer.from(QB_ENCRYPTION_KEY, 'hex');
  const [ivHex, authTagHex, encryptedHex] = encryptedData.split('.');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ──────────────────────────────────────────────────────────────────────────
// OAuth Flow Helpers
// ──────────────────────────────────────────────────────────────────────────

function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: QB_CONFIG.client_id,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: QB_CONFIG.redirect_uri,
    state: state,
  });
  return `${QB_URLS.auth}?${params.toString()}`;
}

async function exchangeCodeForTokens(code, realmId) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: QB_CONFIG.redirect_uri,
  });

  const authHeader = Buffer.from(`${QB_CONFIG.client_id}:${QB_CONFIG.client_secret}`).toString('base64');

  const response = await fetch(QB_URLS.token, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`QB token exchange failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in, // typically 3600 seconds (1 hour)
  };
}

async function refreshAccessToken(connection) {
  if (!connection.refresh_token_enc) {
    throw new Error('No refresh token available');
  }

  const refreshToken = decryptToken(connection.refresh_token_enc);

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const authHeader = Buffer.from(`${QB_CONFIG.client_id}:${QB_CONFIG.client_secret}`).toString('base64');

  const response = await fetch(QB_URLS.token, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`QB token refresh failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  // Update DB with new tokens
  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000);
  const encAccessToken = encryptToken(data.access_token);
  const encRefreshToken = encryptToken(data.refresh_token);

  await pool.query(
    `UPDATE quickbooks_connections
     SET access_token_enc = $1, refresh_token_enc = $2, token_expires_at = $3, last_sync_at = NOW()
     WHERE user_id = $4`,
    [encAccessToken, encRefreshToken, newExpiresAt, connection.user_id]
  );

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: newExpiresAt,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// QB Connection Management
// ──────────────────────────────────────────────────────────────────────────

async function getConnection(userId, autoRefresh = true) {
  const result = await pool.query(
    'SELECT * FROM quickbooks_connections WHERE user_id = $1',
    [userId]
  );

  if (!result.rows.length) {
    return null;
  }

  const connection = result.rows[0];

  // Auto-refresh if token expired or expiring soon (within 5 min)
  if (autoRefresh && connection.token_expires_at) {
    const now = Date.now();
    const expiresAt = new Date(connection.token_expires_at).getTime();
    const refreshBuffer = 5 * 60 * 1000; // 5 minutes

    if (now >= expiresAt - refreshBuffer) {
      try {
        const refreshed = await refreshAccessToken(connection);
        connection.access_token = refreshed.access_token;
        connection.token_expires_at = refreshed.expires_at;
      } catch (e) {
        console.error('[QB] Token refresh failed:', e.message);
        // Return connection anyway with expired token; API call will fail with 401
      }
    } else {
      // Token still valid, decrypt it
      connection.access_token = decryptToken(connection.access_token_enc);
    }
  } else if (!autoRefresh) {
    connection.access_token = decryptToken(connection.access_token_enc);
  }

  return connection;
}

// ──────────────────────────────────────────────────────────────────────────
// QB API Wrapper
// ──────────────────────────────────────────────────────────────────────────

async function qbApiCall(connection, method, endpoint, body = null) {
  if (!connection.access_token) {
    throw new Error('No access token available');
  }

  const url = `${QB_API_BASE}/v2/company/${connection.realm_id}${endpoint}`;

  const options = {
    method: method,
    headers: {
      'Authorization': `Bearer ${connection.access_token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (response.status === 401) {
    throw new Error('QB API 401 Unauthorized — token may have expired or been revoked');
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`QB API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data;
}

// ──────────────────────────────────────────────────────────────────────────
// QB Entity Creation/Retrieval
// ──────────────────────────────────────────────────────────────────────────

async function createCustomer(userId, { displayName, companyName, email, phone }) {
  const connection = await getConnection(userId);
  if (!connection) throw new Error('No QB connection for this user');

  // QB Customer creation via API
  const customerPayload = {
    DisplayName: displayName || companyName,
    GivenName: displayName || 'Customer',
    FullyQualifiedName: displayName || companyName,
  };

  if (email) {
    customerPayload.PrimaryEmailAddr = { Address: email };
  }
  if (phone) {
    customerPayload.PrimaryPhone = { FreeFormNumber: phone };
  }

  const result = await qbApiCall(connection, 'POST', '/query', {
    query: `SELECT * FROM Customer WHERE DisplayName = '${displayName.replace(/'/g, "''")}'`,
  });

  // If customer exists, return it
  if (result.QueryResponse?.Customer?.length > 0) {
    return result.QueryResponse.Customer[0];
  }

  // Otherwise create new
  const createResult = await qbApiCall(connection, 'POST', '/customer', customerPayload);
  return createResult;
}

async function findCustomerByName(userId, name) {
  const connection = await getConnection(userId);
  if (!connection) throw new Error('No QB connection for this user');

  const result = await qbApiCall(connection, 'GET', `/query?query=SELECT * FROM Customer WHERE DisplayName = '${name.replace(/'/g, "''")}'`);

  if (result.QueryResponse?.Customer?.length > 0) {
    return result.QueryResponse.Customer[0];
  }

  return null;
}

async function createInvoice(userId, { customerId, lineItems, dueDate, docNumber }) {
  const connection = await getConnection(userId);
  if (!connection) throw new Error('No QB connection for this user');

  const invoicePayload = {
    DocNumber: docNumber || `INV-${Date.now()}`,
    CustomerRef: { value: customerId },
    Line: lineItems.map(item => ({
      DetailType: 'SalesItemLineDetail',
      Description: item.description,
      Amount: item.amount,
      SalesItemLineDetail: {
        Qty: 1,
        UnitPrice: item.amount,
        ItemRef: { value: '1' }, // QB requires item reference
      },
    })),
  };

  if (dueDate) {
    invoicePayload.DueDate = dueDate;
  }

  const result = await qbApiCall(connection, 'POST', '/invoice', invoicePayload);
  return result;
}

async function createPayment(userId, { customerId, invoiceId, amount, date, method, refNumber }) {
  const connection = await getConnection(userId);
  if (!connection) throw new Error('No QB connection for this user');

  const paymentPayload = {
    CustomerRef: { value: customerId },
    DepositToAccountRef: { value: '1' }, // QB cash account
    PaymentMethodRef: { value: method || '3' }, // default to check
    PaymentRefNum: refNumber || `PAY-${Date.now()}`,
    TxnDate: date || new Date().toISOString().split('T')[0],
    Line: [
      {
        DetailType: 'PaymentLineDetail',
        Amount: amount,
        PaymentLineDetail: {
          TxnType: 'Invoice',
          TxnId: invoiceId,
        },
      },
    ],
  };

  const result = await qbApiCall(connection, 'POST', '/payment', paymentPayload);
  return result;
}

async function getEstimates(userId, { status } = {}) {
  const connection = await getConnection(userId);
  if (!connection) throw new Error('No QB connection for this user');

  let query = 'SELECT * FROM Estimate';
  if (status) {
    query += ` WHERE DocStatus = '${status}'`;
  }

  const result = await qbApiCall(connection, 'GET', `/query?query=${encodeURIComponent(query)}`);
  return result.QueryResponse?.Estimate || [];
}

async function getEstimate(userId, estimateId) {
  const connection = await getConnection(userId);
  if (!connection) throw new Error('No QB connection for this user');

  const result = await qbApiCall(connection, 'GET', `/estimate/${estimateId}`);
  return result;
}

// ──────────────────────────────────────────────────────────────────────────
// High-Level Sync Operations
// ──────────────────────────────────────────────────────────────────────────

async function syncProjectToQB(userId, projectId) {
  const projectResult = await pool.query(
    'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
    [projectId, userId]
  );

  if (!projectResult.rows.length) {
    throw new Error('Project not found');
  }

  const project = projectResult.rows[0];

  try {
    // Create/find QB Customer
    const qbCustomer = await createCustomer(userId, {
      displayName: project.owner || project.name,
      companyName: project.owner,
      email: project.owner_email,
      phone: project.owner_phone,
    });

    // Update project with QB customer ID
    await pool.query(
      `UPDATE projects SET qb_customer_id = $1, qb_sync_status = $2, qb_last_synced_at = NOW()
       WHERE id = $3`,
      [qbCustomer.Id, 'synced', projectId]
    );

    // Log sync
    await pool.query(
      `INSERT INTO quickbooks_sync_log(user_id, project_id, sync_type, sync_direction, qb_entity_type, qb_entity_id, sync_status, response_payload)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, projectId, 'project', 'push', 'Customer', qbCustomer.Id, 'success', JSON.stringify(qbCustomer)]
    );

    return { success: true, qb_customer_id: qbCustomer.Id };
  } catch (error) {
    console.error('[QB] Sync project error:', error.message);

    // Log failed sync
    await pool.query(
      `INSERT INTO quickbooks_sync_log(user_id, project_id, sync_type, sync_direction, sync_status, error_message)
       VALUES($1, $2, $3, $4, $5, $6)`,
      [userId, projectId, 'project', 'push', 'error', error.message]
    );

    throw error;
  }
}

async function syncInvoiceToQB(userId, payAppId) {
  const payAppResult = await pool.query(
    `SELECT pa.*, p.id as project_id, p.qb_customer_id, p.owner
     FROM pay_apps pa
     JOIN projects p ON pa.project_id = p.id
     WHERE pa.id = $1 AND p.user_id = $2`,
    [payAppId, userId]
  );

  if (!payAppResult.rows.length) {
    throw new Error('Pay app not found');
  }

  const payApp = payAppResult.rows[0];

  if (!payApp.qb_customer_id) {
    throw new Error('Project not synced to QB — sync project first');
  }

  try {
    // Get SOV lines for this pay app
    const sovLinesResult = await pool.query(
      `SELECT sl.* FROM sov_lines sl
       WHERE sl.project_id = $1
       ORDER BY sl.sort_order ASC`,
      [payApp.project_id]
    );

    const sovLines = sovLinesResult.rows;

    // Calculate invoice line items from pay app
    const lineItems = [];
    let totalAmount = 0;

    const payAppLinesResult = await pool.query(
      `SELECT pal.*, sl.description, sl.scheduled_value
       FROM pay_app_lines pal
       JOIN sov_lines sl ON pal.sov_line_id = sl.id
       WHERE pal.pay_app_id = $1`,
      [payAppId]
    );

    const payAppLines = payAppLinesResult.rows;

    for (const payAppLine of payAppLines) {
      const thisAmount = (payAppLine.scheduled_value || 0) * (payAppLine.this_pct || 0) / 100;

      lineItems.push({
        description: payAppLine.description || 'Work completed',
        amount: parseFloat(thisAmount.toFixed(2)),
      });

      totalAmount += thisAmount;
    }

    // Create QB Invoice
    const qbInvoice = await createInvoice(userId, {
      customerId: payApp.qb_customer_id,
      lineItems,
      dueDate: payApp.payment_due_date || new Date().toISOString().split('T')[0],
      docNumber: `PA-${payApp.app_number}`,
    });

    // Update pay app with QB invoice ID
    await pool.query(
      `UPDATE pay_apps SET qb_invoice_id = $1, qb_sync_status = $2
       WHERE id = $3`,
      [qbInvoice.Id, 'synced', payAppId]
    );

    // Log sync
    await pool.query(
      `INSERT INTO quickbooks_sync_log(user_id, project_id, pay_app_id, sync_type, sync_direction, qb_entity_type, qb_entity_id, sync_status, response_payload)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, payApp.project_id, payAppId, 'invoice', 'push', 'Invoice', qbInvoice.Id, 'success', JSON.stringify(qbInvoice)]
    );

    return { success: true, qb_invoice_id: qbInvoice.Id, total_amount: parseFloat(totalAmount.toFixed(2)) };
  } catch (error) {
    console.error('[QB] Sync invoice error:', error.message);

    await pool.query(
      `INSERT INTO quickbooks_sync_log(user_id, project_id, pay_app_id, sync_type, sync_direction, sync_status, error_message)
       VALUES($1, $2, $3, $4, $5, $6, $7)`,
      [userId, payApp.project_id, payAppId, 'invoice', 'push', 'error', error.message]
    );

    throw error;
  }
}

async function syncPaymentToQB(userId, payAppId, paymentData) {
  const payAppResult = await pool.query(
    `SELECT pa.*, p.qb_customer_id, p.id as project_id
     FROM pay_apps pa
     JOIN projects p ON pa.project_id = p.id
     WHERE pa.id = $1 AND p.user_id = $2`,
    [payAppId, userId]
  );

  if (!payAppResult.rows.length) {
    throw new Error('Pay app not found');
  }

  const payApp = payAppResult.rows[0];

  if (!payApp.qb_invoice_id) {
    throw new Error('Pay app not synced to QB — sync invoice first');
  }

  try {
    const qbPayment = await createPayment(userId, {
      customerId: payApp.qb_customer_id,
      invoiceId: payApp.qb_invoice_id,
      amount: paymentData.amount,
      date: paymentData.date || new Date().toISOString().split('T')[0],
      method: paymentData.method || '3',
      refNumber: paymentData.refNumber || `PAY-${payAppId}-${Date.now()}`,
    });

    // Update pay app with QB payment ID
    await pool.query(
      `UPDATE pay_apps SET qb_payment_id = $1, qb_sync_status = $2
       WHERE id = $3`,
      [qbPayment.Id, 'synced', payAppId]
    );

    // Log sync
    await pool.query(
      `INSERT INTO quickbooks_sync_log(user_id, project_id, pay_app_id, sync_type, sync_direction, qb_entity_type, qb_entity_id, sync_status, response_payload)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, payApp.project_id, payAppId, 'payment', 'push', 'Payment', qbPayment.Id, 'success', JSON.stringify(qbPayment)]
    );

    return { success: true, qb_payment_id: qbPayment.Id };
  } catch (error) {
    console.error('[QB] Sync payment error:', error.message);

    await pool.query(
      `INSERT INTO quickbooks_sync_log(user_id, project_id, pay_app_id, sync_type, sync_direction, sync_status, error_message)
       VALUES($1, $2, $3, $4, $5, $6, $7)`,
      [userId, payApp.project_id, payAppId, 'payment', 'push', 'error', error.message]
    );

    throw error;
  }
}

async function importEstimateAsSOV(userId, estimateId, projectId) {
  const projectResult = await pool.query(
    'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
    [projectId, userId]
  );

  if (!projectResult.rows.length) {
    throw new Error('Project not found');
  }

  try {
    const connection = await getConnection(userId);
    if (!connection) throw new Error('No QB connection for this user');

    // Get estimate from QB
    const estimate = await getEstimate(userId, estimateId);

    if (!estimate.Line) {
      throw new Error('Estimate has no line items');
    }

    // Parse estimate lines into SOV
    let sortOrder = 0;
    let totalScheduledValue = 0;

    for (const line of estimate.Line) {
      if (line.DetailType !== 'SalesItemLineDetail') continue;

      const amount = line.Amount || 0;
      totalScheduledValue += amount;

      await pool.query(
        `INSERT INTO sov_lines(project_id, item_id, description, scheduled_value, sort_order)
         VALUES($1, $2, $3, $4, $5)`,
        [projectId, line.Id || `est-${sortOrder}`, line.Description || 'Imported from QB', amount, sortOrder++]
      );
    }

    // Update project contract total
    await pool.query(
      `UPDATE projects SET original_contract = $1
       WHERE id = $2`,
      [totalScheduledValue, projectId]
    );

    // Log sync
    await pool.query(
      `INSERT INTO quickbooks_sync_log(user_id, project_id, sync_type, sync_direction, qb_entity_type, qb_entity_id, sync_status, response_payload)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, projectId, 'estimate_import', 'pull', 'Estimate', estimateId, 'success', JSON.stringify({ lineCount: sortOrder, totalValue: totalScheduledValue })]
    );

    return { success: true, lines_imported: sortOrder, total_value: totalScheduledValue };
  } catch (error) {
    console.error('[QB] Import estimate error:', error.message);

    await pool.query(
      `INSERT INTO quickbooks_sync_log(user_id, project_id, sync_type, sync_direction, sync_status, error_message)
       VALUES($1, $2, $3, $4, $5, $6)`,
      [userId, projectId, 'estimate_import', 'pull', 'error', error.message]
    );

    throw error;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Webhook Handling (for QB notifications)
// ──────────────────────────────────────────────────────────────────────────

async function handleWebhookEvent(event) {
  // QB webhooks notify of changes (invoice paid, estimate created, etc.)
  // Event structure varies by type — implement as needed
  console.log('[QB] Webhook event:', event.eventType);

  // For now, just log — can expand to handle updates, payment confirmations, etc.
  return { success: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────────────────

module.exports = {
  // OAuth
  getAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,

  // Token management
  encryptToken,
  decryptToken,
  getConnection,

  // QB API calls
  createCustomer,
  findCustomerByName,
  createInvoice,
  createPayment,
  getEstimates,
  getEstimate,

  // High-level sync
  syncProjectToQB,
  syncInvoiceToQB,
  syncPaymentToQB,
  importEstimateAsSOV,

  // Webhook
  handleWebhookEvent,
};
