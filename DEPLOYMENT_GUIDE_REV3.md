# ConstructInvoice AI Rev 3 — Deployment & Integration Guide

**Status**: ✅ All modules wired and ready for Railway deployment
**Date**: April 6, 2026
**Branch**: `constructinv-3.0` (or your deployment branch)

---

## Overview

Rev 3 integrates the following major systems:

1. **Trial & Subscription System** (Module 1) — 90-day free trial, Pro upgrade ($40/month), subscription lifecycle
2. **Trial Gating Middleware** — Soft-blocks create/send/generate actions when trial expires
3. **React TrialProvider** — Global trial state management on the frontend
4. **Reports Module** (Module 5) — Sort/filter pay apps, export to CSV
5. **Stripe Connect Payment Pipeline** — ACH + card payments, Stripe webhook handling
6. **QuickBooks Integration** — OAuth token encryption, sync push/pull with QB

All new modules are **backward-compatible** with the existing codebase.

---

## Deployment Checklist

### 1. Backend Route Mounting ✅

The server now mounts all trial and reporting routes:

**File: `server/app.js`**
```javascript
// Trial routes mounted at /api/trial
const { trialGate } = require('./middleware/trialGate');
app.use('/api/trial', require('./routes/trial').router);

// All other routes mounted at root
app.use(require('./routes/projects'));     // with trialGate on POST
app.use(require('./routes/payApps'));      // with trialGate on POST, POST/:id/email
app.use(require('./routes/sov'));          // with trialGate on POST
app.use(require('./routes/lienWaivers'));  // with trialGate on POST
app.use(require('./routes/reports'));      // reports routes (no gate, read-only)
```

**Trial Gate Middleware Applied To:**
- `POST /api/projects` — Create new project
- `POST /api/projects/:id/payapps` — Create new pay app
- `POST /api/payapps/:id/email` — Send pay app email
- `POST /api/sov/parse` — Upload SOV file
- `POST /api/projects/:id/lien-docs` — Create lien waiver

**Allowed Actions (No Gate):**
- `GET` (read) routes — View projects, pay apps, reports, settings
- `DELETE` routes — Delete projects (but cannot create new ones)
- Trial status endpoint — `/api/trial/status`
- Upgrade endpoint — `/api/trial/upgrade` (upgrade is always allowed)

### 2. Frontend Provider Nesting ✅

**File: `client/src/App.tsx`**

```typescript
import { useAuth } from '@/contexts/AuthContext'
import { TrialProvider } from '@/contexts/TrialContext'

function AppWithProviders() {
  const { user } = useAuth();
  return (
    <TrialProvider user={user}>
      <AppRouter />
    </TrialProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppWithProviders />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
```

**Provider Stack (inside-out):**
1. `ErrorBoundary` — Catches React errors
2. `BrowserRouter` — React Router setup
3. `AuthProvider` — User authentication state
4. `TrialProvider` — Trial/subscription state (receives user from AuthProvider)
5. `AppRouter` — Routes

The `TrialProvider` receives the authenticated user from the `AuthProvider` and provides trial status (days remaining, is_blocked, plan_type) to all child routes via context.

### 3. Environment Variables ✅

**Updated: `.env.example`**

Copy `.env.example` to `.env` and fill in these values on Railway:

#### Core Auth & Networking
```
NODE_ENV=production
PORT=3000
JWT_SECRET=your-very-long-random-secret-here
ALLOWED_ORIGIN=https://constructinv.varshyl.com
APP_URL=https://constructinv.varshyl.com
BASE_URL=https://constructinv.varshyl.com
```

#### Stripe Payment Processing
```
STRIPE_SECRET_KEY=sk_test_xxxx (or sk_live_xxxx in production)
STRIPE_PUBLISHABLE_KEY=pk_test_xxxx (or pk_live_xxxx in production)
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx (from Stripe Dashboard → Webhooks)
STRIPE_PRO_PRICE_ID=price_xxxxxxxxxxxx (from Stripe Products → Price ID)
```

#### QuickBooks Integration
```
QB_CLIENT_ID=ABCDEFGHIJKLMNOPQRSTUVWXxxxxxxxxxxxx
QB_CLIENT_SECRET=your-client-secret-from-intuit-app
QB_REDIRECT_URI=https://constructinv.varshyl.com/api/quickbooks/callback
QB_SANDBOX=true (set to 'false' for live QB accounts)
QB_ENCRYPTION_KEY=4ec2a6691499900c175b09b066eefd61f8c4a82d60c088925947a2bfe42aa497
```

#### Email & Communication
```
RESEND_API_KEY=re_xxxxxxxxxxxx
FROM_EMAIL=billing@varshyl.com
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
```

#### Admin & Security
```
ADMIN_EMAILS=vaakapila@gmail.com,vagishkapila@gmail.com
ADMIN_SECRET=your-secret-admin-key (for emergency password resets)
```

#### Database
```
DATABASE_URL=postgresql://user:password@host:5432/dbname (Railway auto-provides)
```

### 4. Build & Deploy Configuration ✅

**File: `railway.toml`**

```toml
[build]
builder = "nixpacks"
installCommand = "npm install && cd client && npm install"
buildCommand = "cd client && npm run build"

[deploy]
startCommand = "node server/index.js"
healthcheckPath = "/"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

**Key Points:**
- Build: Installs root + client dependencies, then builds React SPA to `client/dist/`
- Start: Runs `server/index.js` which initializes DB, then starts Express on port 3000
- Health check: Rails checks `/` every 30 seconds; if endpoint doesn't respond in 30s, restarts
- Auto-restart: On any failure, retries up to 3 times before giving up

### 5. Package.json Dependencies ✅

**Verified in `package.json`:**

Essential packages already present:
- `stripe@^21.0.1` — Stripe SDK for payments + subscriptions
- `express@^4.18.2` — Web server
- `pg@^8.11.3` — PostgreSQL client
- `jsonwebtoken@^9.0.2` — JWT auth tokens
- `bcryptjs@^2.4.3` — Password hashing
- `cors@^2.8.5` — CORS headers
- `dotenv@^16.3.1` — Environment variables
- `pdfkit@^0.14.0` — PDF generation
- All others for file upload, parsing, email, etc.

**No new dependencies added** — Rev 3 uses existing packages.

---

## Key Architecture Changes

### 1. Trial Gate Middleware

**Location**: `server/middleware/trialGate.js`

Checks if user's trial is expired and if they're not on a paid plan:

```javascript
async function trialGate(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const user = await pool.query(
    'SELECT subscription_status, plan_type, trial_end_date FROM users WHERE id=$1',
    [req.user.id]
  );

  const { subscription_status, trial_end_date } = user.rows[0];

  // Pass if: active subscription OR free override OR trial still active
  if (subscription_status === 'active' ||
      subscription_status === 'free_override' ||
      new Date(trial_end_date) > new Date()) {
    return next();
  }

  // Block: trial expired, not pro, not free override
  return res.status(403).json({
    error: 'Trial expired',
    code: 'TRIAL_EXPIRED',
    message: 'Your 90-day trial has ended. Upgrade to Pro ($40/month) to continue.',
    upgrade_url: '/settings#subscription',
  });
}
```

**Applied to routes in:**
- `server/routes/projects.js` — POST /api/projects
- `server/routes/payApps.js` — POST /api/projects/:id/payapps, POST /api/payapps/:id/email
- `server/routes/sov.js` — POST /api/sov/parse
- `server/routes/lienWaivers.js` — POST /api/projects/:id/lien-docs

### 2. TrialProvider (Frontend)

**Location**: `client/src/contexts/TrialContext.tsx`

Provides:
- `daysRemaining` — Integer, days left in trial (null if no trial)
- `isExpired` — Boolean, trial has ended
- `isActive` — Boolean, trial is still active
- `isPro` — Boolean, user has active subscription
- `isFreeOverride` — Boolean, admin waived payment
- `isTrialGated` — Boolean, user is blocked from actions
- `tryAction()` — Function to check if action is allowed
- `startUpgrade()` — Initiates Stripe Checkout for Pro subscription

Used in components to:
- Show "Upgrade" banner when trial is ending or expired
- Disable buttons for blocked actions
- Gate pages behind trial check

### 3. Reports Module

**Location**: `server/routes/reports.js`

Provides:
- `GET /api/reports/pay-apps` — Filter/sort/paginate pay apps
- `GET /api/reports/other-invoices` — List other invoices
- `GET /api/reports/export/csv` — Export filtered data as CSV
- `GET /api/revenue/summary` — Revenue KPI dashboard
- `GET /api/revenue/export/quickbooks` — QB format export
- `GET /api/revenue/export/sage` — Sage 50 format export
- `GET /api/revenue/report/pdf` — Generate PDF revenue report

All routes are read-only (no trial gate needed).

---

## Deployment Steps

### Step 1: Set Railway Environment Variables

On Railway dashboard for the ConstructInvoice AI project:

1. Go to **Variables** tab
2. Add/update all env vars from `.env.example` (see Environment Variables section above)
3. Critical vars to set:
   - `STRIPE_SECRET_KEY` — sk_test_xxxx or sk_live_xxxx
   - `STRIPE_PUBLISHABLE_KEY` — pk_test_xxxx or pk_live_xxxx
   - `STRIPE_WEBHOOK_SECRET` — from Stripe Dashboard
   - `STRIPE_PRO_PRICE_ID` — from Stripe Products
   - `QB_CLIENT_ID`, `QB_CLIENT_SECRET` — from Intuit Developer Portal
   - `QB_ENCRYPTION_KEY` — 32-char hex key for token encryption

### Step 2: Push to GitHub

```bash
git add .
git commit -m "Rev 3: Wire trial system, reports, and middleware"
git push origin constructinv-3.0
```

(Or use GitHub Desktop → Publish branch)

### Step 3: Deploy on Railway

1. Railway auto-detects the push
2. Runs `npm install && cd client && npm install` (installCommand)
3. Runs `cd client && npm run build` (buildCommand → creates client/dist/)
4. Runs `node server/index.js` (startCommand)
5. Initializes database (runs db.js migrations)
6. Starts Express server on port 3000

Monitor logs at: https://railway.app → Project → Deployments

### Step 4: Test Trial Gate

1. Create a new test user (trial starts with 90 days)
2. Verify they can create projects/pay apps normally
3. Manually set their trial to expired in DB:
   ```sql
   UPDATE users SET trial_end_date = NOW() - INTERVAL '1 day' WHERE email='test@example.com';
   ```
4. Try to create a project — should get 403 with message "Trial expired"
5. Verify upgrade button works — should redirect to Stripe Checkout

### Step 5: Test Stripe Webhook

1. Set up Stripe webhook endpoint in Dashboard:
   - Endpoint: `https://constructinv.varshyl.com/api/stripe/webhook`
   - Events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.*`
2. Test with Stripe CLI:
   ```bash
   stripe listen --forward-to https://constructinv.varshyl.com/api/stripe/webhook
   ```
3. Trigger test event:
   ```bash
   stripe trigger payment_intent.succeeded
   ```

### Step 6: Test QB Integration

1. Set QB env vars on Railway (QB_CLIENT_ID, QB_CLIENT_SECRET, QB_REDIRECT_URI, QB_SANDBOX)
2. Log in as user
3. Go to Settings → Connect to QuickBooks
4. Click "Connect" → redirects to Intuit OAuth
5. Authorize → callback stores encrypted tokens in `qb_connections` table
6. Verify connection status shows green

---

## Files Modified

### Backend (`server/`)
- ✅ `server/app.js` — Route mounting + trial gate middleware
- ✅ `server/routes/trial.js` — Trial status, upgrade, webhook (already exists)
- ✅ `server/routes/projects.js` — Added `trialGate` to POST /api/projects
- ✅ `server/routes/payApps.js` — Added `trialGate` to POST /api/projects/:id/payapps, POST /api/payapps/:id/email
- ✅ `server/routes/sov.js` — Added `trialGate` to POST /api/sov/parse
- ✅ `server/routes/lienWaivers.js` — Added `trialGate` to POST /api/projects/:id/lien-docs
- ✅ `server/routes/reports.js` — Reports endpoints (read-only, no gate)
- ✅ `server/middleware/trialGate.js` — Trial gate middleware (already exists)

### Frontend (`client/src/`)
- ✅ `client/src/App.tsx` — Wrapped with AuthProvider → TrialProvider → AppRouter
- ✅ `client/src/contexts/TrialContext.tsx` — Trial state (already exists)
- ✅ `client/src/components/trial/TrialBanner.tsx` — UI banner (already exists)
- ✅ `client/src/components/trial/TrialGate.tsx` — Blocking component (already exists)
- ✅ `client/src/hooks/useTrial.ts` — Trial hook (already exists)

### Config Files
- ✅ `railway.toml` — Updated build/deploy commands (removed pip install)
- ✅ `.env.example` — Added all new env vars (Stripe, QB, trial, etc.)
- ✅ `package.json` — Verified dependencies (no changes needed)

---

## Backward Compatibility

✅ **All changes are backward-compatible:**

- Existing routes still work (trial gate is transparent to active users)
- Old users see trial status as "active" or "paid" (no disruption)
- Trial gate only blocks if `trial_end_date < NOW()` AND `subscription_status != 'active'` AND `subscription_status != 'free_override'`
- Database migrations in `db.js` auto-add trial columns to existing users
- No breaking API changes

---

## Testing Checklist

- [ ] Build succeeds on Railway
- [ ] App starts and serves React SPA at `/`
- [ ] Auth routes work (login, register, forgot password)
- [ ] Create project — succeeds (trial active)
- [ ] Expire trial in DB
- [ ] Create project — fails with 403 (trial gate working)
- [ ] Trial upgrade button works — redirects to Stripe Checkout
- [ ] Reports page loads — shows filtered pay apps
- [ ] QB Connect button works — redirects to OAuth
- [ ] Stripe webhook test succeeds — webhook event processed
- [ ] No console errors in client
- [ ] No errors in server logs

---

## Troubleshooting

### "Trial not found" error
- Check that `db.js` ran migrations
- Verify `trial_end_date` column exists in `users` table
- Manually add column if missing:
  ```sql
  ALTER TABLE users ADD COLUMN trial_start_date TIMESTAMP, trial_end_date TIMESTAMP, subscription_status VARCHAR(50) DEFAULT 'trial', plan_type VARCHAR(50) DEFAULT 'free_trial';
  ```

### Stripe webhook not firing
- Check `STRIPE_WEBHOOK_SECRET` env var is set correctly
- Verify webhook endpoint is registered in Stripe Dashboard
- Check server logs for signature mismatch errors

### QB token expiration
- QB tokens expire after 1 hour (access token) or 100 days (refresh token)
- `server/services/quickbooks.js` auto-refreshes on each use
- If refresh fails, user must reconnect

### Trial gate blocking all actions
- Check `subscription_status` in database (should be 'trial', 'active', or 'free_override')
- Check `trial_end_date` is set to future date for active trials
- If in doubt, set `subscription_status='free_override'` to waive payment

---

## Next Steps (Post-Deployment)

### Immediate (Day 1)
- [ ] Monitor Railway logs for errors
- [ ] Test trial gate with real user
- [ ] Confirm Stripe webhook is firing

### Short-term (Week 1)
- [ ] Launch trial to 10 beta users
- [ ] Collect feedback on upgrade flow
- [ ] Monitor conversion rate (trials → Pro)

### Long-term (Month 1+)
- [ ] Implement onboarding tour (Module 3)
- [ ] Add admin trial controls (Module 2)
- [ ] Setup payment follow-up emails (feature/followup branch)
- [ ] Launch to full user base

---

## Support

For deployment issues:
1. Check Railway logs: https://railway.app → Deployments → Logs
2. Check server console errors: `node server/index.js` locally
3. Check client errors: Browser DevTools → Console
4. Review this guide's Troubleshooting section

For module-specific questions:
- **Trial System**: See CLAUDE.md "Module 1: Trial & Subscription System"
- **Reports**: See CLAUDE.md "Module 5: Reporting Module"
- **Stripe**: See CLAUDE.md "Stripe Connect — Payment Integration"
- **QuickBooks**: See CLAUDE.md "QuickBooks Online Integration"
