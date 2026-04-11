# ConstructInvoice AI — Monitoring Setup

## BetterStack Uptime Monitoring (5 minutes)

> **Do this now** — you'll get a text within 60 seconds of any outage.

### Steps

1. Go to [betterstack.com](https://betterstack.com) → sign up free
2. Click **"Uptime"** in the left nav → **"New Monitor"**
3. Configure:
   - **Monitor type:** HTTP/HTTPS
   - **URL:** `https://constructinv.varshyl.com/api/health`
   - **Check every:** 30 seconds
   - **Alert after:** 2 failures (= 1 minute of downtime before alert)
4. Alert notifications:
   - Email: vagishkapila@gmail.com
   - SMS: your number
5. Click **Save**

That's it. You'll be alerted within 60 seconds of any production outage.

---

## Sentry Error Monitoring

Sentry is already installed and wired into the app. To activate:

### Backend
1. Go to [sentry.io](https://sentry.io) → New Project → Node.js
2. Copy your DSN (looks like `https://xxxx@o123.ingest.sentry.io/456`)
3. In Railway: Variables → `SENTRY_DSN` = your DSN
4. Deploy (auto-triggers on env var change)

### Frontend
1. Use the same or a separate Sentry project → React
2. Copy the DSN
3. In Railway client build vars: `VITE_SENTRY_DSN` = your DSN

### Verify it's working
After deploy, trigger a test error:
```
curl -X POST https://constructinv.varshyl.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"wrongpassword"}'
```
Check Sentry — you should see the 401 event within 30 seconds.

---

## Rate Limiting (Already Active)

Rate limiting is active on all Railway deploys. Limits:

| Route | Window | Max requests |
|-------|--------|-------------|
| `/api/auth/*` | 15 min | 20 |
| `/api/pay/*` | 1 min | 10 |
| `/api/*` (general) | 1 min | 200 |
| `/api/admin/*` | No limit | Admin bypass |

If you get locked out during testing, wait 15 minutes or restart the service.

---

## Health Check Endpoint

`GET https://constructinv.varshyl.com/api/health`

Returns:
```json
{
  "status": "healthy",
  "timestamp": "2026-04-10T...",
  "version": "2.1.0",
  "database": "connected"
}
```

Returns HTTP 503 with `"status": "degraded"` if DB is unreachable — this triggers BetterStack alert.
