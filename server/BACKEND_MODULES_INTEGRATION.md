# Backend Modules Integration Guide

This document explains how to integrate the new backend modules (trial system, admin controls, reporting) into the existing `server.js`.

## Files Created

### Services
- `/server/services/trial.js` — Trial/subscription business logic

### Routes
- `/server/routes/trial.js` — Trial status, upgrade, subscription webhooks
- `/server/routes/admin-extended.js` — Extended admin controls
- `/server/routes/reports.js` — Reporting and analytics

## Integration Steps

### 1. Mount Trial Routes in server.js

Add near the top of route definitions (after auth, before other routes):

```javascript
// ── Module 1: Trial & Subscription System ─────────────────────────────
const { router: trialRouter, trialGate } = require('./server/routes/trial');
app.use('/api/trial', auth, trialRouter); // auth required for trial status
app.post('/api/stripe/subscription-webhook', trialRouter);
```

### 2. Mount Extended Admin Routes in server.js

After mounting existing admin routes, add:

```javascript
// ── Module 2: Extended Admin Controls (trial/subscription management) ───
const adminExtendedRouter = require('./server/routes/admin-extended');
app.use('/api/admin', adminAuth, adminExtendedRouter);
```

### 3. Mount Reporting Routes in server.js

```javascript
// ── Module 5: Reporting Module ──────────────────────────────────────────
const reportsRouter = require('./server/routes/reports');
app.use('/api/reports', auth, reportsRouter);
```

### 4. Configure Trial Gate Middleware (Optional)

To enforce trial restrictions on key actions:

```javascript
// Apply trial gate to these routes to block expired trial users:
app.post('/api/projects', trialGate, auth, async (req, res) => { /* existing code */ });
app.post('/api/pay-apps', trialGate, auth, async (req, res) => { /* existing code */ });
// ... etc for other restricted actions
```

### 5. Environment Variables

Add these to Railway production env vars:

```
STRIPE_PRO_PRICE_ID=price_1TH...  # Stripe Price ID for $40/month Pro plan
```

Example setup if not using Stripe subscription yet:
```bash
# In server.js admin setup route:
app.post('/api/admin/setup-subscription-product', adminAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  
  // Create product and price
  const product = await stripe.products.create({
    name: 'ConstructInvoice AI Pro',
    metadata: { app: 'constructinvoice' }
  });
  
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 4000, // $40.00
    currency: 'usd',
    recurring: { interval: 'month' }
  });
  
  // Save to app_settings table
  await pool.query(
    'INSERT INTO app_settings(key, value) VALUES($1, $2) ON CONFLICT(key) DO UPDATE SET value=$2',
    ['stripe_pro_price_id', price.id]
  );
  
  res.json({ ok: true, product_id: product.id, price_id: price.id });
});
```

## API Endpoints Reference

### Trial System

- `GET /api/trial/status` — Get user's trial/subscription status
- `POST /api/trial/upgrade` — Create Stripe Checkout for $40/month Pro
- `POST /api/stripe/subscription-webhook` — Stripe webhook handler (auto-configured)

### Extended Admin

- `GET /api/admin/trial-stats` — KPI dashboard for trial system
- `POST /api/admin/users/:id/extend-trial` — Add days to trial
- `POST /api/admin/users/:id/set-free-override` — Waive payment indefinitely
- `POST /api/admin/users/:id/upgrade-to-pro` — Manually upgrade to Pro
- `POST /api/admin/users/:id/reset-to-trial` — Reset to 90-day trial
- `POST /api/admin/users/:id/send-email` — Send manual email to user

### Reporting

- `GET /api/reports/pay-apps?project_id=&from=&to=&status=&sort=&order=&page=&limit=` — Filter pay apps
- `GET /api/reports/summary?month=YYYY-MM` — Monthly revenue summary
- `GET /api/reports/export?...` — Export filtered pay apps as CSV
- `GET /api/reports/trends` — Monthly billing trends (last 12 months)

## Database Schema

All required columns are already in `db.js`:

```sql
-- Users table additions (already migrated in db.js)
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_start_date TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_type VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS nudge_analytics JSONB;

-- App settings table (for storing Stripe price IDs, etc.)
CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Testing the Integration

### 1. Test Trial Status
```bash
curl -H "Authorization: Bearer JWT_TOKEN" \
  https://constructinv.varshyl.com/api/trial/status
```

Response:
```json
{
  "trial_start_date": "2026-04-06T00:00:00Z",
  "trial_end_date": "2026-07-05T00:00:00Z",
  "subscription_status": "trial",
  "plan_type": "free_trial",
  "days_remaining": 85,
  "is_expired": false,
  "is_blocked": false,
  "authenticated": true
}
```

### 2. Test Admin Trial Stats
```bash
curl -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  https://constructinv.varshyl.com/api/admin/trial-stats
```

### 3. Test Reports
```bash
curl -H "Authorization: Bearer JWT_TOKEN" \
  "https://constructinv.varshyl.com/api/reports/pay-apps?status=submitted&limit=10"
```

## Webhook Signature Verification

The trial subscription webhook is auto-verified by the existing Stripe webhook handler in server.js. Make sure `STRIPE_WEBHOOK_SECRET` is set in Railway.

## Notes

- **Trial Gate Middleware** is exported from `trial.js` but not applied to routes by default. Apply it selectively to routes that should block expired trial users.
- **Email Sending** uses Resend API (same as existing code). Make sure `RESEND_API_KEY` and `FROM_EMAIL` are set.
- **Stripe Integration** is lazy-loaded — if `STRIPE_SECRET_KEY` is missing, trial upgrade route returns 503.
- **Admin Routes** require `ADMIN_EMAILS` env var set in Railway. Users with these emails get access.

## ECC Zenith Patterns Used

- Parameterized queries to prevent SQL injection
- Try/catch blocks with error logging
- Consistent JSON response format: `{ ok, data/error, message }`
- Service layer separation (business logic in `/services/`)
- Auth middleware pattern (reused from existing code)
- Graceful degradation (features disabled if Stripe not configured)

