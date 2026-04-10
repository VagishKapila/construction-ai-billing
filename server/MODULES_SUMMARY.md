# Backend Modules Rev 3 — Implementation Summary

## Overview

Backend architecture for ConstructInvoice AI Rev 3 trial/subscription system, admin controls, and reporting features. Follows ECC Zenith enterprise patterns with clean separation of concerns.

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `server/services/trial.js` | 307 | Trial/subscription business logic (getTrialStatus, canPerformAction, Stripe integration) |
| `server/routes/trial.js` | 193 | Trial API endpoints (status, upgrade, subscription webhooks) + middleware |
| `server/routes/admin-extended.js` | 360 | Super admin controls (trial stats, extend trial, manual upgrades, email) |
| `server/routes/reports.js` | 398 | Reporting module (filter/sort pay apps, export CSV, monthly trends, revenue summary) |

**Total backend code: 1,258 lines of production-ready code**

---

## Module 1: Trial & Subscription System

### Service Layer (`server/services/trial.js`)

**Functions:**
- `getTrialStatus(userId)` — Calculate days remaining, is_expired, is_blocked flags
- `isTrialExpired(user)` — Helper to check if trial past end_date
- `canPerformAction(userId, action)` — Gate check for blocked actions (create_project, create_pay_app, send_email, generate_pdf, sign_lien_waiver)
- `createProSubscription(userId, email, stripeSecretKey, stripePriceId)` — Create Stripe customer + subscription Checkout session
- `handleSubscriptionWebhook(event)` — Process Stripe subscription lifecycle events (invoice.paid, invoice.payment_failed, customer.subscription.deleted/updated)

**Features:**
- Automatic trial expiry detection (>trial_end_date = expired)
- Soft blocking of actions for expired trial users
- Stripe Checkout integration for $40/month Pro
- Webhook handler for subscription status changes
- Graceful degradation if Stripe not configured

---

### Routes (`server/routes/trial.js`)

**Endpoints:**

1. `GET /api/trial/status` — Returns trial/subscription status, days remaining, is_blocked flag
   - Supports anonymous users (no trial)
   - Returns helpful message if blocked

2. `POST /api/trial/upgrade` — Create Stripe Checkout session for Pro ($40/month)
   - Requires auth
   - Returns checkout URL for frontend redirect
   - Logs upgrade event

3. `POST /api/stripe/subscription-webhook` — Stripe webhook handler
   - Events: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted/updated`
   - Updates subscription_status and plan_type
   - Returns 200 always (Stripe retry logic)

**Middleware:**
- `trialGate(req, res, next)` — Blocks expired trial users from specific actions
  - Can be mounted on individual routes to enforce restrictions
  - Infers action from route (create_project, create_pay_app, etc.)
  - Returns 403 with helpful message if action blocked

---

## Module 2: Super Admin Controls

### Extended Admin Routes (`server/routes/admin-extended.js`)

**Endpoints (all require adminAuth):**

1. `GET /api/admin/trial-stats` — KPI dashboard
   - Trial user count, Pro users, free_override users
   - Trials expiring this week
   - MRR (monthly recurring revenue), active subscriptions
   - Conversion rate (trial → pro) last 30 days

2. `POST /api/admin/users/:id/extend-trial` — Add days to trial
   - Body: `{ days: 7 }`
   - Validates days 1-365
   - Logs action with reason

3. `POST /api/admin/users/:id/set-free-override` — Waive payment indefinitely
   - Sets subscription_status='free_override', plan_type='free_override'
   - Used for key users, partnerships, support exceptions
   - Logs action with reason

4. `POST /api/admin/users/:id/upgrade-to-pro` — Manually upgrade to Pro
   - Sets subscription_status='active', plan_type='pro'
   - Skips Stripe Checkout (used for manual/ACH payments)
   - Logs action

5. `POST /api/admin/users/:id/reset-to-trial` — Reset to 90-day fresh trial
   - Sets trial_start_date=NOW(), trial_end_date=NOW()+90d
   - Clears stripe_subscription_id
   - Logs action

6. `POST /api/admin/users/:id/send-email` — Send manual email to user
   - Body: `{ subject, html }`
   - Uses Resend API (FROM_EMAIL required)
   - Logs email sent event with Resend ID

**Features:**
- All actions fully logged to analytics_events
- Parameterized queries (SQL injection safe)
- Try/catch error handling
- Consistent JSON responses

---

## Module 5: Reporting & Analytics

### Reporting Routes (`server/routes/reports.js`)

**Endpoints (all require auth):**

1. `GET /api/reports/pay-apps` — Filter and sort pay apps
   - Query params:
     - `project_id` — filter by project
     - `from`, `to` — date range (YYYY-MM-DD)
     - `status` — 'draft', 'submitted', 'paid'
     - `sort` — 'created_at' (default), 'period_end', 'amount_due', 'status', 'app_number'
     - `order` — 'ASC', 'DESC' (default)
     - `page`, `limit` — pagination (default: page=1, limit=20, max=100)
   - Returns paginated data + filter/pagination metadata
   - Example: `/api/reports/pay-apps?project_id=5&status=submitted&sort=period_end&order=DESC&page=1&limit=20`

2. `GET /api/reports/summary` — Monthly revenue summary
   - Query param: `month=YYYY-MM` (default: current month)
   - Returns:
     - `total_billed_month` — total submitted pay apps this month
     - `total_outstanding` — unpaid amount
     - `total_paid` — collected amount
     - `payapp_count` — number of pay apps
     - Per-project breakdown with total_scheduled, total_work_completed, total_retainage

3. `GET /api/reports/export` — Export filtered pay apps as CSV
   - Same query params as /pay-apps
   - Returns CSV file: `pay-apps-export-YYYY-MM-DD.csv`
   - Headers: App #, Project, Project #, Period, Period Start, Period End, Status, Amount Due, Retainage Held, Payment Status, Amount Paid, Created At, Submitted At

4. `GET /api/reports/trends` — Monthly billing trends (last 12 months)
   - Returns array of monthly data: month_label, payapp_count, total_billed, total_paid
   - Used for revenue charts
   - Aggregates by calendar month

**Features:**
- Dynamic WHERE clause building (safe parameter injection)
- Pagination with total count
- CSV export with proper escaping (quoted fields, escaped quotes)
- Flexible sorting (validates column names)
- Date range filtering
- Status filtering
- Project filtering
- Graceful date formatting for CSV export

---

## Database Schema

All columns required by these modules are already in `db.js`:

```sql
-- Users table additions
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_start_date TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_type VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(200);

-- App settings table (for Stripe Price ID storage)
CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pay apps table additions (for reporting)
ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS amount_due NUMERIC(14,2);
ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS retention_held NUMERIC(14,2);
ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50);
ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(14,2);
ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
```

---

## Integration Checklist

To integrate into `server.js`:

- [ ] Import trial router: `const { router: trialRouter, trialGate } = require('./server/routes/trial');`
- [ ] Mount trial routes: `app.use('/api/trial', auth, trialRouter);`
- [ ] Mount trial webhook: `app.post('/api/stripe/subscription-webhook', trialRouter);`
- [ ] Import admin extended router: `const adminExtendedRouter = require('./server/routes/admin-extended');`
- [ ] Mount admin routes: `app.use('/api/admin', adminAuth, adminExtendedRouter);`
- [ ] Import reports router: `const reportsRouter = require('./server/routes/reports');`
- [ ] Mount reports routes: `app.use('/api/reports', auth, reportsRouter);`
- [ ] Add `STRIPE_PRO_PRICE_ID` to Railway env vars
- [ ] (Optional) Apply trialGate to project/pay-app routes
- [ ] Test trial status endpoint
- [ ] Test admin trial stats
- [ ] Test reporting endpoints

---

## Error Handling & Patterns

All modules follow ECC Zenith enterprise patterns:

1. **Parameterized Queries** — All SQL uses `$1, $2, ...` placeholders
2. **Try/Catch Blocks** — Every route wrapped with error logging
3. **Consistent Responses** — `{ ok, data/error, message }` format
4. **Input Validation** — Sort columns, pagination limits, date ranges validated
5. **SQL Injection Safety** — No string concatenation in WHERE clauses
6. **Graceful Degradation** — Features disabled if dependencies missing (Stripe, Resend)
7. **Logging** — All admin actions logged to analytics_events table

---

## Security

- Admin routes protected by `adminAuth` (ADMIN_EMAILS env var)
- All user-facing routes require JWT auth
- Trial gate middleware returns 403 if access denied
- Email sending requires RESEND_API_KEY
- Stripe integration uses SDK (no raw API calls in code)
- CSV export properly escapes quotes and commas

---

## Testing Notes

### Unit Test Locations

- Trial status calculation: `getTrialStatus()` in `trial.js`
- Action gate check: `canPerformAction()` in `trial.js`
- CSV export: test with `?project_id=1&from=2026-01-01&to=2026-03-31`

### Integration Test Examples

```bash
# Get trial status
curl -H "Authorization: Bearer TOKEN" https://constructinv.varshyl.com/api/trial/status

# Admin: Get trial stats
curl -H "Authorization: Bearer ADMIN_TOKEN" https://constructinv.varshyl.com/api/admin/trial-stats

# User: Get pay apps (submitted status, sorted by date)
curl -H "Authorization: Bearer TOKEN" \
  "https://constructinv.varshyl.com/api/reports/pay-apps?status=submitted&sort=period_end&order=DESC"

# User: Export CSV
curl -H "Authorization: Bearer TOKEN" \
  "https://constructinv.varshyl.com/api/reports/export?from=2026-04-01&to=2026-04-30" \
  -o pay-apps.csv

# User: Get monthly summary
curl -H "Authorization: Bearer TOKEN" \
  "https://constructinv.varshyl.com/api/reports/summary?month=2026-04"
```

---

## Future Enhancements

1. **Module 3: Onboarding Walkthrough** — Use trial system to show feature tour on first login
2. **Module 4: AI Assistant Training** — Use analytics data to train AI on user questions
3. **Module 6: Pro Upgrade Nudges** — Use nudge_analytics table to track nudge effectiveness
4. **Module 7: QA & Testing** — Use test account flag to exclude from analytics

---

## Support

For questions about integration:
1. Check `BACKEND_MODULES_INTEGRATION.md` for step-by-step setup
2. Review existing routes in `server/routes/` for patterns
3. Check ECC Zenith skill for enterprise patterns
4. Review CLAUDE.md project context

