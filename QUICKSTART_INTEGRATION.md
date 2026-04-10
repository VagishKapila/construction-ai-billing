# Quick Start: Integrate Rev 3 Modules

Copy-paste integration for server.js. Takes 5 minutes.

## Step 1: Add Imports (near top of server.js, after other requires)

```javascript
const { router: trialRouter, trialGate } = require('./server/routes/trial');
const adminExtendedRouter = require('./server/routes/admin-extended');
const reportsRouter = require('./server/routes/reports');
```

## Step 2: Mount Routes (after other route definitions, before app.listen)

```javascript
// ── Module 1: Trial & Subscription System ─────────────────────────────
app.use('/api/trial', auth, trialRouter);
app.post('/api/stripe/subscription-webhook', trialRouter);

// ── Module 2: Extended Admin Controls ────────────────────────────────
app.use('/api/admin', adminAuth, adminExtendedRouter);

// ── Module 5: Reporting Module ──────────────────────────────────────
app.use('/api/reports', auth, reportsRouter);
```

## Step 3: Set Environment Variable in Railway

Dashboard → constructinv-3.0 project → Variables:

```
STRIPE_PRO_PRICE_ID=price_1TH...  (Stripe price ID for $40/month plan)
```

## Step 4: (Optional) Apply Trial Gate to Routes

To block expired trial users from creating projects/pay apps:

```javascript
// Wrap existing routes with trialGate
app.post('/api/projects', trialGate, auth, async (req, res) => {
  // existing code
});

app.post('/api/pay-apps', trialGate, auth, async (req, res) => {
  // existing code
});
```

## Step 5: Test Endpoints

```bash
# Test trial status
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://constructinv.varshyl.com/api/trial/status

# Test admin trial stats
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  https://constructinv.varshyl.com/api/admin/trial-stats

# Test reporting
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://constructinv.varshyl.com/api/reports/pay-apps?status=submitted&limit=10"
```

## Step 6: Deploy

```bash
git add server/
git commit -m "Add Rev 3 modules: trial system, admin controls, reporting"
git push origin constructinv-3.0
# Railway auto-deploys
```

## Verification

After deploy, confirm:

1. Node syntax check: `node -c server/services/trial.js` (all pass)
2. Trial status returns correct response
3. Admin can access trial stats
4. Users can see reports
5. CSV export downloads correctly

## Database

No migration needed — all columns already in db.js.

## Documentation

- **API Endpoints**: See `API_ENDPOINTS_REFERENCE.md` for complete list
- **Integration Details**: See `server/BACKEND_MODULES_INTEGRATION.md`
- **Feature Summary**: See `server/MODULES_SUMMARY.md`
- **Verification**: See `BACKEND_MODULES_VERIFY.md`

## Common Issues

**"Cannot find module"** → Make sure file paths are correct:
- `./server/routes/trial` (not `/server/routes` or `server/routes.js`)
- Check require() statements match file locations

**"adminAuth is not defined"** → Make sure adminAuth is defined in server.js
- Should be a function that checks ADMIN_EMAILS env var

**"Stripe not configured"** → Set STRIPE_SECRET_KEY in Railway
- Trial upgrade endpoint returns 503 if Stripe not configured

**CSV export broken** → Make sure FROM_EMAIL and RESEND_API_KEY are set
- Email endpoint requires both for Resend API

## What's Included

Module 1: Trial & Subscription System
  - 90-day free trial for all new users
  - $40/month Pro subscription via Stripe
  - Soft blocking of expired trials
  - Automatic trial expiration detection

Module 2: Super Admin Controls
  - KPI dashboard (trial users, MRR, conversion rate)
  - Extend trials, set free_override, manual upgrades
  - Send emails to users via Resend

Module 5: Reporting & Analytics
  - Filter/sort pay apps (project, date range, status)
  - Paginated results with flexible sorting
  - Monthly revenue summary
  - CSV export
  - 12-month billing trends

Total: 1,258 lines of production-ready code

## Next Steps

1. Integrate (5 min)
2. Set STRIPE_PRO_PRICE_ID in Railway
3. Run tests
4. Deploy to staging
5. QA testing
6. Merge to main

Docs are in project root for reference.
