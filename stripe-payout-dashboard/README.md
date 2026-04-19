# Stripe Payout Dashboard

Standalone monitoring module for Stripe Connect payouts on ConstructInvoice AI.
Tracks transfers, payouts, balances, and alerts — without touching any existing app code.

---

## What It Does

| Module | File | What it handles |
|---|---|---|
| Webhook Listener | `webhooks/stripe-webhook.js` | Receives and persists all Stripe payout events |
| Balance Sync Cron | `jobs/sync-balances.js` | Syncs live balances every 6 hours, raises alerts |
| API Routes | `routes/payout-routes.js` | REST API for dashboard UI |
| Auto Transfer | `services/auto-transfer.js` | Creates platform → GC transfers on invoice payment |
| Dashboard UI | `ui/index.html` | Standalone HTML dashboard (no framework deps) |

---

## Environment Variables

Add these to your `.env` or Railway environment:

```env
# Required (already set in main app)
STRIPE_SECRET_KEY=sk_live_...          # Platform Stripe secret key
STRIPE_WEBHOOK_SECRET=whsec_...        # Set this to the new webhook's signing secret (see below)
DATABASE_URL=postgresql://...          # PostgreSQL connection string
JWT_SECRET=...                         # Same JWT secret as main app (for admin auth)
ADMIN_EMAILS=vaakapila@gmail.com,...   # Same admin emails as main app

# Optional
PLATFORM_FEE_PERCENT=2.5              # Platform cut from each transfer (default: 2.5%)
STRIPE_PLATFORM_ACCOUNT_ID=acct_1TG76NAHP8NRRyLC  # Platform account — skipped in account.updated handler
PAYOUT_DASHBOARD_PORT=3001            # Standalone mode port (default: 3001)
PAYOUT_DASHBOARD_SECRET=...           # Optional simple token for standalone auth bypass
```

---

## Running Standalone

```bash
cd construction-ai-billing

# 1. Run DB migration (creates 4 tables)
node -e "require('./stripe-payout-dashboard').runMigration()"

# 2. Start standalone server
node stripe-payout-dashboard/index.js

# Dashboard UI: http://localhost:3001/payout-dashboard
# API:          http://localhost:3001/payout-dashboard/accounts
# Webhook:      POST http://localhost:3001/stripe-webhooks/payout-events
```

---

## Integrating Into Main App

Add two lines to `server/app.js` (after middleware setup, before catch-all):

```js
// stripe-payout-dashboard — add this block
const payoutDashboard = require('./stripe-payout-dashboard');
payoutDashboard.init(app);
// end stripe-payout-dashboard
```

That's it. The module mounts its own routes, starts the cron, and serves the UI.

**Integration checklist:**
- [ ] Run `setup.sql` once against your DB (or call `runMigration()`)
- [ ] Set `STRIPE_WEBHOOK_SECRET` env var to the payout webhook's signing secret
- [ ] Set `STRIPE_PLATFORM_ACCOUNT_ID` env var to `acct_1TG76NAHP8NRRyLC`
- [ ] Set `PLATFORM_FEE_PERCENT` env var (default 2.5%)
- [ ] Add `payoutDashboard.init(app)` to `server/app.js`
- [ ] Register the Stripe webhook (see below)
- [ ] Deploy and visit `/payout-dashboard` as admin

---

## Stripe Webhook Setup

### Register the new webhook endpoint in Stripe

Using the Stripe CLI or API (since Dashboard is blocked):

```bash
SK=sk_live_...
curl https://api.stripe.com/v1/webhook_endpoints \
  -u "$SK:" \
  -d url="https://constructinv.varshyl.com/stripe-webhooks/payout-events" \
  -d "enabled_events[]=transfer.created" \
  -d "enabled_events[]=transfer.failed" \
  -d "enabled_events[]=payout.created" \
  -d "enabled_events[]=payout.paid" \
  -d "enabled_events[]=payout.failed" \
  -d "enabled_events[]=account.updated" \
  -d "enabled_events[]=capability.updated" \
  -d description="Payout Dashboard — ConstructInvoice AI"
```

Copy the `secret` field from the response → set as `STRIPE_WEBHOOK_SECRET` env var on Railway.

**Note:** This is a SEPARATE webhook from the existing one (`we_1TK4WjAHP8NRRyLCoqgLDoK8`).
The existing webhook handles checkout and subscription events.
This new webhook handles payout/transfer/account events for the dashboard.

### Webhook URL
```
POST https://constructinv.varshyl.com/stripe-webhooks/payout-events
```

### Events to Subscribe
```
transfer.created
transfer.failed
payout.created
payout.paid
payout.failed
account.updated
capability.updated
```

---

## Using Auto Transfer

Call `createTransfer` from your invoice payment handler:

```js
const { createTransfer } = require('./stripe-payout-dashboard/services/auto-transfer');

// Inside your webhook handler, after invoice is confirmed paid:
const { transfer, fees, error } = await createTransfer({
  invoiceId:          payAppId,              // pay app ID
  amountPaidCents:    session.amount_total,   // gross amount in cents
  connectedAccountId: contractorStripeAcctId, // acct_xxx from connected_accounts table
  paymentMethod:      method,                 // 'card' or 'ach'
  platformFeePercent: 2.5,                   // optional override
  description:        `Pay App #${appNumber} — ${projectName}`,
});

if (error) {
  console.error('Transfer failed:', error);
} else {
  console.log(`Transfer created: ${transfer.id} — vendor gets $${fees.vendorAmount}`);
}
```

**Fee breakdown example** (for a $10,000 card payment at 2.5% platform fee):
```
Gross paid by owner:    $10,000.00
Stripe fee (3.3%+$0.40):  -$330.40
Net received by platform:  $9,669.60
Platform fee (2.5%):       -$241.74
Vendor/GC receives:        $9,427.86
```

---

## Database Tables

See `setup.sql` for full CREATE statements.

| Table | Purpose |
|---|---|
| `stripe_payout_events` | Raw webhook event log (idempotent, all events) |
| `stripe_connected_accounts` | Live state of each connected account |
| `stripe_payout_alerts` | Active/resolved alerts |
| `stripe_transfers_log` | Record of every platform → GC transfer |

---

## API Reference

All endpoints require admin JWT token (same `Authorization: Bearer <token>` as main app).

| Method | Endpoint | Description |
|---|---|---|
| GET | `/payout-dashboard/accounts` | List all connected accounts |
| GET | `/payout-dashboard/accounts/:id` | Single account + live Stripe data |
| GET | `/payout-dashboard/accounts/:id/payouts` | Payout history (live from Stripe) |
| GET | `/payout-dashboard/accounts/:id/balance` | Live balance check |
| GET | `/payout-dashboard/alerts` | All unresolved alerts |
| POST | `/payout-dashboard/alerts/:id/resolve` | Mark alert resolved |
| GET | `/payout-dashboard/transfers` | Last 20 platform transfers |
| POST | `/payout-dashboard/sync` | Trigger manual balance sync |
| GET | `/payout-dashboard/events` | Recent webhook events |

---

## Alert Types

| Alert | Triggers when |
|---|---|
| `payout_delayed` | Available balance > $0 and last payout > 3 days ago |
| `payout_failed` | `payout.failed` event received |
| `verification_required` | Account has `requirements.currently_due` or `past_due` items |
| `bank_not_connected` | Account has no external bank account linked |
