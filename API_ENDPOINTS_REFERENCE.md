# API Endpoints Reference — Rev 3 Modules

Complete reference for all new API endpoints added by Modules 1, 2, and 5.

## Module 1: Trial & Subscription System

### GET /api/trial/status
Get current user's trial/subscription status.

**Auth:** Optional (returns anonymous status if no token)

**Response:**
```json
{
  "trial_start_date": "2026-04-06T00:00:00.000Z",
  "trial_end_date": "2026-07-05T00:00:00.000Z",
  "subscription_status": "trial",
  "plan_type": "free_trial",
  "days_remaining": 85,
  "is_expired": false,
  "is_blocked": false,
  "authenticated": true,
  "message": null
}
```

**Possible subscription_status values:**
- `trial` — In 90-day trial
- `active` — Pro subscription active
- `free_override` — Admin waived payment
- `canceled` — Subscription canceled
- `past_due` — Payment failed
- `none` — Anonymous user (no trial)

---

### POST /api/trial/upgrade
Create Stripe Checkout session for $40/month Pro subscription.

**Auth:** Required

**Request:** (empty body)

**Response:**
```json
{
  "ok": true,
  "session_id": "cs_test_...",
  "url": "https://checkout.stripe.com/pay/cs_test_...",
  "message": "Stripe Checkout session created"
}
```

**Frontend:** Redirect user to `url` for payment.

**After payment:** Stripe webhook updates subscription_status to 'active'.

---

### POST /api/stripe/subscription-webhook
Stripe webhook endpoint for subscription lifecycle events.

**Auth:** None (Stripe signature verification in server.js)

**Events handled:**
- `invoice.paid` — Subscription payment succeeded → status='active'
- `invoice.payment_failed` — Payment failed → status='past_due'
- `customer.subscription.deleted` — Subscription canceled → status='canceled'
- `customer.subscription.updated` — Status changed → update status accordingly

**Response:**
```json
{
  "ok": true,
  "event_type": "invoice.paid",
  "processed": true,
  "message": "Subscription activated"
}
```

---

## Module 2: Super Admin Controls

All endpoints require `adminAuth` (ADMIN_EMAILS env var).

### GET /api/admin/trial-stats
Get trial/subscription system KPIs.

**Auth:** Admin only

**Response:**
```json
{
  "ok": true,
  "user_counts": {
    "trial_users": 145,
    "pro_users": 23,
    "free_override_users": 2,
    "canceled_users": 5,
    "past_due_users": 1,
    "total_users": 170
  },
  "trial_expiry": {
    "expiring_this_week": 8
  },
  "revenue": {
    "mrr": 920.0,
    "active_subscriptions": 23
  },
  "metrics": {
    "conversion_rate_30d": 12.5,
    "trial_to_pro_last_30d": 3
  }
}
```

---

### POST /api/admin/users/:id/extend-trial
Add days to a user's trial end date.

**Auth:** Admin only

**Request:**
```json
{
  "days": 7
}
```

**Response:**
```json
{
  "ok": true,
  "user": {
    "id": 42,
    "email": "user@example.com",
    "trial_end_date": "2026-07-12T00:00:00.000Z",
    "subscription_status": "trial"
  },
  "message": "Trial extended by 7 days for user@example.com"
}
```

---

### POST /api/admin/users/:id/set-free-override
Manually waive payment for a user (indefinite free access).

**Auth:** Admin only

**Request:**
```json
{
  "reason": "VIP customer, launch discount"
}
```

**Response:**
```json
{
  "ok": true,
  "user": {
    "id": 42,
    "email": "user@example.com",
    "subscription_status": "free_override",
    "plan_type": "free_override"
  },
  "message": "user@example.com set to free_override"
}
```

---

### POST /api/admin/users/:id/upgrade-to-pro
Manually upgrade user to Pro ($40/month).

**Auth:** Admin only

**Request:** (empty body)

**Response:**
```json
{
  "ok": true,
  "user": {
    "id": 42,
    "email": "user@example.com",
    "subscription_status": "active",
    "plan_type": "pro"
  },
  "message": "user@example.com upgraded to Pro"
}
```

---

### POST /api/admin/users/:id/reset-to-trial
Reset user to a fresh 90-day trial.

**Auth:** Admin only

**Request:** (empty body)

**Response:**
```json
{
  "ok": true,
  "user": {
    "id": 42,
    "email": "user@example.com",
    "trial_start_date": "2026-04-06T12:34:56.000Z",
    "trial_end_date": "2026-07-05T12:34:56.000Z",
    "subscription_status": "trial"
  },
  "message": "user@example.com reset to 90-day trial"
}
```

---

### POST /api/admin/users/:id/send-email
Send manual email to user via Resend.

**Auth:** Admin only

**Request:**
```json
{
  "subject": "Trial Ending Soon",
  "html": "<h2>Your 90-day trial ends in 7 days</h2><p>Upgrade to Pro now...</p>"
}
```

**Response:**
```json
{
  "ok": true,
  "email_id": "72c0d6b4-8c00-4b0b-ad50-6e95a65c1f52",
  "to": "user@example.com",
  "subject": "Trial Ending Soon",
  "message": "Email sent to user@example.com"
}
```

---

## Module 5: Reporting & Analytics

All endpoints require auth.

### GET /api/reports/pay-apps
Filter, sort, and paginate pay applications.

**Auth:** Required

**Query Params:**
| Param | Type | Default | Example |
|-------|------|---------|---------|
| `project_id` | INT | - | `?project_id=5` |
| `from` | DATE | - | `?from=2026-04-01` |
| `to` | DATE | - | `?to=2026-04-30` |
| `status` | VARCHAR | - | `?status=submitted` |
| `sort` | VARCHAR | `created_at` | `?sort=amount_due` |
| `order` | VARCHAR | `DESC` | `?order=ASC` |
| `page` | INT | 1 | `?page=2` |
| `limit` | INT | 20 | `?limit=50` |

**Valid sort columns:** created_at, period_end, amount_due, status, app_number
**Valid status values:** draft, submitted, paid

**Example:** `/api/reports/pay-apps?status=submitted&sort=period_end&order=DESC&limit=20&page=1`

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "id": 123,
      "app_number": 5,
      "period_start": "2026-04-01",
      "period_end": "2026-04-30",
      "period_label": "April 2026",
      "status": "submitted",
      "amount_due": 15000.00,
      "retention_held": 1500.00,
      "payment_status": "unpaid",
      "amount_paid": 0.00,
      "created_at": "2026-05-01T10:30:00Z",
      "submitted_at": "2026-05-01T10:35:00Z",
      "project_id": 5,
      "project_name": "Downtown Office Renovation",
      "project_number": "DOW-2026-001"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "pages": 3
  },
  "filters": {
    "project_id": null,
    "from": null,
    "to": null,
    "status": "submitted",
    "sort": "created_at",
    "order": "DESC"
  }
}
```

---

### GET /api/reports/summary
Get monthly revenue summary.

**Auth:** Required

**Query Params:**
| Param | Type | Default | Example |
|-------|------|---------|---------|
| `month` | VARCHAR | Current month | `?month=2026-04` |

**Response:**
```json
{
  "ok": true,
  "summary": {
    "period": "2026-04",
    "total_billed_month": 125000.00,
    "total_outstanding": 85000.00,
    "total_paid": 40000.00,
    "payapp_count": 5
  },
  "projects": [
    {
      "id": 5,
      "name": "Downtown Office Renovation",
      "number": "DOW-2026-001",
      "total_scheduled": 500000.00,
      "total_work_completed": 150000.00,
      "total_retainage": 15000.00,
      "payapp_count": 5
    }
  ],
  "message": "Summary for 2026-04"
}
```

---

### GET /api/reports/export
Export filtered pay apps as CSV file.

**Auth:** Required

**Query Params:** Same as `/pay-apps`

**Example:** `/api/reports/export?status=submitted&from=2026-04-01&to=2026-04-30`

**Response:** CSV file (Content-Type: text/csv)

**Filename:** `pay-apps-export-2026-04-06.csv`

**CSV Headers:**
```
App #,Project,Project #,Period,Period Start,Period End,Status,Amount Due,Retainage Held,Payment Status,Amount Paid,Created At,Submitted At
```

**CSV Example:**
```
5,Downtown Office Renovation,DOW-2026-001,April 2026,2026-04-01,2026-04-30,submitted,15000.00,1500.00,unpaid,0.00,2026-05-01T10:30:00Z,2026-05-01T10:35:00Z
6,Downtown Office Renovation,DOW-2026-001,May 2026,2026-05-01,2026-05-31,draft,18000.00,1800.00,unpaid,0.00,2026-06-01T09:15:00Z,
```

---

### GET /api/reports/trends
Get monthly billing trends (last 12 months).

**Auth:** Required

**Query Params:** None

**Response:**
```json
{
  "ok": true,
  "trends": [
    {
      "month": "2025-05-01",
      "month_label": "2025-05",
      "payapp_count": 2,
      "total_billed": 25000.00,
      "total_paid": 25000.00
    },
    {
      "month": "2025-06-01",
      "month_label": "2025-06",
      "payapp_count": 3,
      "total_billed": 42000.00,
      "total_paid": 35000.00
    },
    {
      "month": "2026-04-01",
      "month_label": "2026-04",
      "payapp_count": 5,
      "total_billed": 125000.00,
      "total_paid": 40000.00
    }
  ],
  "period": "Last 12 months"
}
```

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request (invalid params, missing required field) |
| 401 | Unauthorized (no token or invalid token) |
| 403 | Forbidden (trial expired, admin only) |
| 404 | Not found (user/project doesn't exist) |
| 500 | Server error |
| 503 | Service unavailable (Stripe/Resend not configured) |

---

## Error Responses

**Standard error format:**
```json
{
  "error": "Trial expired",
  "reason": "Your 90-day trial has ended. Upgrade to Pro ($40/month) to continue.",
  "message": "Your 90-day trial has ended. Upgrade to Pro ($40/month) to continue."
}
```

---

## Authentication

All protected endpoints require JWT token in header:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" https://constructinv.varshyl.com/api/trial/status
```

Or as query parameter:

```bash
curl "https://constructinv.varshyl.com/api/trial/status?token=YOUR_JWT_TOKEN"
```

---

## Rate Limiting

No rate limiting on these endpoints (inherited from Express).

For production, consider adding:
- 100 requests/minute per user for reporting
- 10 requests/minute for admin actions

---

## Testing with curl

```bash
# Test trial status
TOKEN="your_jwt_token"
curl -H "Authorization: Bearer $TOKEN" \
  https://constructinv.varshyl.com/api/trial/status

# Test admin trial stats
ADMIN_TOKEN="admin_jwt_token"
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://constructinv.varshyl.com/api/admin/trial-stats

# Test reporting (paginated, sorted)
curl -H "Authorization: Bearer $TOKEN" \
  "https://constructinv.varshyl.com/api/reports/pay-apps?status=submitted&sort=period_end&order=DESC&limit=10&page=1"

# Export CSV
curl -H "Authorization: Bearer $TOKEN" \
  "https://constructinv.varshyl.com/api/reports/export?from=2026-04-01&to=2026-04-30" \
  -o report.csv
```

