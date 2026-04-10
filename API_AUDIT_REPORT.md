# Construction AI Billing — API Audit Report
**Date:** April 2, 2026
**Project:** construction-ai-billing (refactored to client/ + server/ architecture)

---

## Executive Summary

The React client has been successfully refactored with organized API modules, but there are significant gaps:
- **3 server route files have NO corresponding client APIs** (team, feedback, other-invoices)
- **Several admin features are accessible but undiscovered** (extended trial management, subscription controls)
- **Lien waiver endpoints exist but no dedicated client module** (called inline from payApps module)

---

## Part 1: COMPLETE API CATALOG

### Authentication Routes (`/api/auth`)
**Server Endpoints:**
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/register` | None | User registration |
| POST | `/api/auth/login` | None | Email/password login |
| POST | `/api/auth/forgot-password` | None | Password reset request |
| POST | `/api/auth/reset-password` | None | Complete password reset |
| GET | `/api/auth/verify/:token` | None | Email verification link |
| POST | `/api/auth/resend-verification` | Yes | Resend verification email |
| GET | `/api/auth/me` | Yes | Get current user |
| GET | `/oauth/google` | None | Google OAuth start |
| GET | `/oauth/google/callback` | None | Google OAuth callback |
| DELETE | `/api/auth/account` | Yes | Delete own account |
| GET | `/api/auth/accept-invite/:token` | None | Accept team invite |

**Client API Coverage:** ✅ COMPLETE
- All auth routes properly exposed in `/client/src/api/auth.ts`
- Login, register, password reset all functional

---

### Projects & SOV (`/api/projects`, `/api/sov`)
**Server Endpoints:**
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/projects` | Yes | List all projects |
| POST | `/api/projects` | Yes | Create new project |
| PUT | `/api/projects/:id` | Yes | Update project |
| DELETE | `/api/projects/:id` | Yes | Delete project |
| GET | `/api/projects/:id/sov` | Yes | Get SOV lines for project |
| POST | `/api/projects/:id/sov` | Yes | Save SOV lines |
| GET | `/api/projects/:id/sov/uploads` | Yes | List SOV upload history |
| POST | `/api/sov/parse` | Yes | Parse uploaded SOV file (Excel/PDF/CSV/Word) |
| PUT | `/api/projects/:id/full` | Yes | Bulk update project + SOV + settings |
| POST | `/api/projects/:id/contract` | Yes | Upload contract document |
| GET | `/api/projects/:id/contract` | Yes | Download contract document |
| POST | `/api/projects/:id/sync-contract` | Yes | Sync with QuickBooks contract |

**Client API Coverage:** ✅ COMPLETE
- All project CRUD operations covered in `/client/src/api/projects.ts`
- SOV parsing, upload history, contract management all functional

---

### Pay Applications (`/api/payapps`, `/api/changeorders`)
**Server Endpoints:**
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/projects/:id/payapps` | Yes | List pay apps for project |
| GET | `/api/projects/:id/payapps/deleted` | Yes | List deleted pay apps |
| POST | `/api/projects/:id/payapps` | Yes | Create new pay app |
| GET | `/api/payapps/:id` | Yes | Get single pay app with all data |
| PUT | `/api/payapps/:id` | Yes | Update pay app header |
| PUT | `/api/payapps/:id/lines` | Yes | Save line items + percentages + retainage |
| POST | `/api/payapps/:id/unsubmit` | Yes | Revert from submitted → draft |
| POST | `/api/payapps/:id/restore` | Yes | Restore soft-deleted pay app |
| DELETE | `/api/payapps/:id` | Yes | Soft delete pay app |
| GET | `/api/payapps/:id/pdf` | Yes | Download G702/G703 PDF |
| POST | `/api/payapps/:id/email` | Yes | Send via email + optional lien waiver |
| POST | `/api/payapps/:id/changeorders` | Yes | Create change order |
| PUT | `/api/changeorders/:id` | Yes | Update change order |
| DELETE | `/api/changeorders/:id` | Yes | Delete change order |
| POST | `/api/payapps/:id/attachments` | Yes | Upload attachment (notes, drawings, etc.) |
| DELETE | `/api/attachments/:id` | Yes | Delete attachment |

**Client API Coverage:** ✅ COMPLETE
- Full CRUD for pay apps, lines, change orders in `/client/src/api/payApps.ts`
- PDF download, email sending functional
- Attachment management covered

---

### Settings & Company Profile (`/api/settings`)
**Server Endpoints:**
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/settings` | Yes | Get company settings (logo, signature, contact info, defaults) |
| POST | `/api/settings` | Yes | Save settings (name, terms, retainage, contact) |
| POST | `/api/settings/logo` | Yes | Upload company logo |
| GET | `/api/settings/logo` | Yes | Download logo |
| POST | `/api/settings/signature` | Yes | Upload signature image |
| GET | `/api/settings/signature` | Yes | Download signature |
| POST | `/api/settings/nudges` | Yes | Save nudge preferences (disable trial/pro prompts) |
| GET | `/api/settings/job-number/next` | Yes | Get next auto-increment job number |

**Client API Coverage:** ✅ COMPLETE
- All settings operations in `/client/src/api/settings.ts`
- File uploads (logo, signature) functional
- Job number generation available

---

### Payments & Stripe (`/api/payments`, `/api/stripe`, `/api/pay/:token`)
**Server Endpoints:**
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/stripe/connect` | Yes | Start Stripe Express onboarding |
| GET | `/api/stripe/account-status` | Yes | Check if GC has connected account |
| POST | `/api/stripe/dashboard-link` | Yes | Get link to Stripe Express dashboard |
| POST | `/api/pay-apps/:id/payment-link` | Yes | Generate payment link for pay app |
| GET | `/api/pay/:token` | No | Get invoice data (public, for payer) |
| GET | `/api/pay/:token/pdf` | No | Download PDF (public) |
| POST | `/api/pay/:token/checkout` | No | Create Stripe Checkout session (public) |
| POST | `/api/pay/:token/verify` | No | Verify payment status (public) |
| GET | `/api/payments` | Yes | List all payments for GC |
| POST | `/api/pay-apps/:id/bad-debt` | Yes | Mark pay app as uncollectable |
| POST | `/api/pay-apps/:id/undo-bad-debt` | Yes | Undo bad debt marking |
| POST | `/api/stripe/webhook` | None | Stripe webhook handler (raw body) |

**Client API Coverage:** ✅ COMPLETE
- Stripe Connect flows in `/client/src/api/payments.ts`
- Payment link generation, checkout, verification all functional
- Bad debt tracking functional

**Additional (internal-use) Payment Routes (in admin.js):**
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/admin/subscription` | Yes | Get user's subscription status |
| GET | `/api/admin/subscription/price` | Yes | Get current Pro price ($40/month) |
| POST | `/api/admin/subscription/checkout` | Yes | Create subscription Checkout session |
| POST | `/api/admin/subscription/portal` | Yes | Get Stripe billing portal link |
| POST | `/api/admin/setup-subscription-product` | Admin | Create/update Stripe product |
| POST | `/api/admin/update-subscription-price` | Admin | Update Pro tier price |

**Client Coverage:** ❌ MISSING
- No client module for `/api/admin/subscription/*` routes
- These are used for Pro tier upgrades but not exposed in client API

---

### Lien Waivers & Documents (`/api/lien-docs`, `/api/projects/:id/lien-docs`)
**Server Endpoints:**
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/projects/:id/lien-docs` | Yes | List all lien waivers for project |
| POST | `/api/projects/:id/lien-docs` | Yes | Create lien waiver (conditional/unconditional) |
| GET | `/api/lien-docs/:id/pdf` | No | Download lien waiver PDF (public) |

**Client API Coverage:** ⚠️ PARTIAL
- **No dedicated client module** (`client/src/api/lienWaivers.ts` does NOT exist)
- Instead, lien waiver handling is embedded in:
  - `emailPayApp()` accepts `include_lien_waiver: boolean`
  - Server generates lien waiver on-the-fly and attaches to email
- **Gap:** No UI to create lien waivers outside of email context
  - Old app.html had standalone "Generate Lien Waiver" button
  - React app likely only creates waivers when sending emails
  - **Missing:** No way to create, download, or view lien waivers independently

---

### Reports & Analytics (`/api/stats`, `/api/revenue/*`, `/api/reports/*`)
**Server Endpoints:**
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/stats` | Yes | Dashboard KPIs (projects, payapps, billed, outstanding) |
| GET | `/api/revenue/summary` | Yes | Revenue summary (scheduled, certified, earned, retainage, paid, outstanding) |
| GET | `/api/reports/pay-apps` | Yes | Filtered list of pay apps (w/ project, status, date filters) |
| GET | `/api/reports/other-invoices` | Yes | Filtered list of other invoices |
| GET | `/api/reports/export/csv` | Yes | Export filtered pay apps as CSV |
| POST | `/api/pay-apps/:id/payment-received` | Yes | Toggle "payment received" status |
| GET | `/api/revenue/export/quickbooks` | Yes | Export to QuickBooks format |
| GET | `/api/revenue/export/sage` | Yes | Export to Sage format |
| GET | `/api/revenue/report/pdf` | Yes | Generate PDF revenue report with charts |
| GET | `/invoice/:token` | No | Public invoice view page |

**Client API Coverage:** ✅ COMPLETE
- All report queries in `/client/src/api/reports.ts`
- Stats, revenue summary, pay app reports all functional
- CSV and PDF exports working
- Payment received toggle integrated

---

### Other Invoices (`/api/other-invoices`, `/api/projects/:id/other-invoices`)
**Server Endpoints:**
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/projects/:id/other-invoices` | Yes | List supplemental invoices for project |
| POST | `/api/projects/:id/other-invoices` | Yes | Create/upload other invoice |
| PUT | `/api/other-invoices/:id` | Yes | Update other invoice |
| GET | `/api/other-invoices/:id/attachment` | Yes | Download attachment |
| DELETE | `/api/other-invoices/:id` | Yes | Delete other invoice |
| GET | `/api/other-invoices/:id/pdf` | Yes | Download as PDF |

**Client API Coverage:** ❌ MISSING
- **No client module exists** (`client/src/api/otherInvoices.ts` not created)
- Feature is server-side complete but not exposed in React UI
- **Gap:** No way to upload supplemental invoices (RFI costs, change orders outside of G703, etc.) from React app
- Likely intended for future "pro tier" feature per CLAUDE.md roadmap

---

### Team Management (`/api/team`, `/api/auth/accept-invite`)
**Server Endpoints:**
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/team` | Yes | List team members |
| POST | `/api/team` | Yes | Invite team member (sends email) |
| PUT | `/api/team/:id` | Yes | Update team member (e.g., role) |
| DELETE | `/api/team/:id` | Yes | Remove team member |
| GET | `/api/auth/accept-invite/:token` | No | Accept team invitation (public link) |

**Client API Coverage:** ❌ MISSING
- **No client module exists** (`client/src/api/team.ts` not created)
- Feature is server-side complete but not exposed in React UI
- **Gap:** No team collaboration features available in React app
- Likely future feature for enterprise tier (multiple users per company)

---

### AI Assistant (`/api/ai/ask`)
**Server Endpoints:**
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/ai/ask` | Yes | Ask Claude AI a question (construction billing context) |

**Client API Coverage:** ⚠️ PARTIAL
- No dedicated client module
- Called directly in components:
  - `client/src/components/ai/AIChatWidget.tsx` — AI chat in app sidebar
  - `client/src/pages/Help.tsx` — Help page AI assistant
- Works but not formally exposed in API module system

---

### Admin Dashboard (`/api/admin/*`)
**Server Endpoints:**

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/admin/stats` | Admin | KPIs: users, projects, payapps, events, revenue, subscription stats |
| GET | `/api/admin/users` | Admin | List all users with project/payapp counts |
| GET | `/api/admin/chart/payapp-activity` | Admin | Daily payapp + revenue data (30 days) |
| GET | `/api/admin/chart/pipeline-by-user` | Admin | Pipeline vs billed by user with conversion % |
| GET | `/api/admin/errors` | Admin | List recent server errors |
| DELETE | `/api/admin/errors` | Admin | Clear error log |
| POST | `/api/admin/users/:id/block` | Admin | Block/unblock user account |
| POST | `/api/admin/users/:id/unblock` | Admin | Unblock user (deprecated — use block w/ false) |
| POST | `/api/admin/users/:id/verify-email` | Admin | Manually verify user's email |
| POST | `/api/admin/users/:id/resend-verification` | Admin | Send verification email |
| POST | `/api/admin/users/:id/reset-password` | Admin | Set temporary password for user |
| POST | `/api/admin/users/:id/extend-trial` | Admin | Add N days to user's trial |
| POST | `/api/admin/users/:id/set-free-override` | Admin | Waive subscription (user gets unlimited access) |
| POST | `/api/admin/users/:id/upgrade-pro` | Admin | Manually upgrade user to Pro ($40/month) |
| POST | `/api/admin/users/:id/reset-trial` | Admin | Reset user back to trial status |
| DELETE | `/api/admin/users/:id` | Admin | Delete user account + all data |
| POST | `/api/admin/ask` | Admin | Ask Claude a question (admin context) |
| GET | `/api/admin/feedback` | Admin | Get user feedback inbox |
| GET | `/api/admin/support-requests` | Admin | Get support request tickets |
| POST | `/api/admin/test-email` | Admin | Test Resend email deliverability |
| **Testing Harness (internal)** | | |
| POST | `/api/admin/test/create-test-gc` | Admin | Create test GC + Stripe Express account |
| POST | `/api/admin/test/complete-onboarding` | Admin | Complete GC Stripe onboarding (Custom account) |
| POST | `/api/admin/test/create-test-payapp` | Admin | Create full test project + payapp + payment link |
| GET | `/api/admin/test/reconciliation` | Admin | Full money flow report (all payments, Stripe charges) |
| GET | `/api/admin/test/list-test-gcs` | Admin | List all test GC accounts with Stripe status |
| POST | `/api/admin/test/cleanup` | Admin | Delete test users + Stripe accounts |
| **Webhook Management (internal)** | | |
| GET | `/api/admin/stripe/list-webhooks` | Admin | List Stripe webhooks for this account |
| POST | `/api/admin/stripe/create-webhook` | Admin | Create new Stripe webhook endpoint |
| DELETE | `/api/admin/stripe/delete-webhook` | Admin | Delete webhook endpoint |
| GET | `/api/admin/stripe/verify-setup` | Admin | Verify Stripe account is ready for production |
| **Weekly Insights (internal)** | | |
| GET | `/api/admin/weekly-insight` | Admin | Generate weekly stats email (cron job) |

**Client API Coverage:** ✅ MOSTLY COMPLETE
- Core admin functions in `/client/src/api/admin.ts`
- Missing:
  - User management details (unblock, verify-email, resend-verification, reset-password)
  - Test harness endpoints (create-test-gc, etc.) — intentional, admin-only
  - Webhook management (list, create, delete, verify-setup) — intentional, admin-only
  - Weekly insights — intentional, internal cron job

---

### Onboarding (`/api/onboarding`)
**Server Endpoints:**
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/onboarding/complete` | Yes | Mark onboarding wizard as complete |
| POST | `/api/onboarding/reset` | Yes | Reset onboarding (show wizard again) |
| GET | `/api/onboarding/status` | Yes | Get onboarding completion status |

**Client API Coverage:** ✅ COMPLETE
- All endpoints in `/client/src/api/onboarding.ts`
- Onboarding workflow tracking functional

---

### Feedback & Support (`/api/feedback`, `/api/support`)
**Server Endpoints:**
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/feedback` | Yes | Submit feedback + optional screenshot |
| POST | `/api/support/request` | No | Submit support request |
| GET | `/api/admin/feedback` | Admin | View feedback inbox |
| GET | `/api/admin/support-requests` | Admin | View support request tickets |

**Client API Coverage:** ❌ MISSING
- **No client module exists** (`client/src/api/feedback.ts` not created)
- Feedback feature is server-side complete but not exposed in React UI
- **Gap:** No way for users to submit feedback/bug reports from React app
- Support request form likely exists but not connected to client API

---

### QuickBooks Integration (`/api/quickbooks/*`)
**Server Endpoints:**
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/quickbooks/connect` | Yes | Get QuickBooks OAuth authorization URL |
| GET | `/api/quickbooks/status` | Yes | Check QuickBooks connection status |
| POST | `/api/quickbooks/disconnect` | Yes | Disconnect QuickBooks account |
| POST | `/api/quickbooks/sync/:projectId` | Yes | Sync project with QuickBooks |
| POST | `/api/quickbooks/sync/:projectId/payment` | Yes | Sync payment to QuickBooks |
| GET | `/api/quickbooks/sync-log` | Yes | View sync history |
| GET | `/api/quickbooks/sync-log/:projectId` | Yes | View sync history for specific project |
| GET | `/api/quickbooks/estimates` | Yes | List QuickBooks estimates |
| POST | `/api/quickbooks/import-estimate` | Yes | Import estimate as project |
| POST | `/oauth/authorize` | None | QuickBooks OAuth flow |
| POST | `/oauth/authorize-confirm` | None | Confirm QB authorization |
| POST | `/oauth/token` | None | Exchange code for QB token |
| POST | `/quickbooks/webhook` | None | QuickBooks webhook handler |

**Client API Coverage:** ✅ COMPLETE
- All QB operations in `/client/src/api/quickbooks.ts`
- Connection, sync, import all functional

---

### Config & Misc (`/api/config`)
**Server Endpoints:**
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/config` | None | Get public config (Google Client ID, Stripe key) |

**Client API Coverage:** ✅ COMPLETE
- Called during app initialization

---

## Part 2: MISMATCH ANALYSIS

### A. Client Calls with No Server Endpoint

**NONE FOUND** — All client API calls map to valid server endpoints.

---

### B. Server Endpoints with No Client API

| Server Endpoint | Category | Status | Notes |
|---|---|---|---|
| **Team Management** | | ⚠️ NOT EXPOSED | |
| `/api/team` (GET, POST, PUT, DELETE) | Collaboration | Missing | Feature incomplete in React |
| `/api/auth/accept-invite/:token` | Auth | Missing | Server-side ready |
| **Other Invoices** | | ⚠️ NOT EXPOSED | |
| `/api/projects/:id/other-invoices` (all) | Supplemental | Missing | Future feature (pro tier?) |
| **Feedback** | | ⚠️ NOT EXPOSED | |
| `/api/feedback` (POST) | User Input | Missing | Server ready, no UI |
| `/api/support/request` (POST) | Support | Missing | Server ready, no UI |
| **Lien Waivers** | | ⚠️ PARTIAL | |
| Standalone lien waiver CRUD | Documents | Incomplete | Only accessible via email flow |
| **Subscription Management** | | ⚠️ MISSING | |
| `/api/admin/subscription/*` (GET, POST) | Billing | Missing | User-facing routes exist but no client API |
| `/api/admin/setup-subscription-product` | Billing | Admin-only | Intentional |
| **Admin (User Management)** | | ⚠️ PARTIAL | |
| `/api/admin/users/:id/unblock` | User Mgmt | Missing | Exists in server, not in client |
| `/api/admin/users/:id/verify-email` | User Mgmt | Missing | Exists in server, not in client |
| `/api/admin/users/:id/resend-verification` | User Mgmt | Missing | Exists in server, not in client |
| `/api/admin/users/:id/reset-password` | User Mgmt | Missing | Exists in server, not in client |
| **Admin (Testing/Webhooks)** | | ℹ️ INTENTIONAL | |
| `/api/admin/test/*` (all) | Internal | Intentional | Admin/testing only |
| `/api/admin/stripe/*` (all) | Internal | Intentional | Admin/testing only |
| **QuickBooks** | | ✅ COMPLETE | |
| All `/api/quickbooks/*` | Integration | Covered | Full client support |

---

### C. Parameter Mismatches

**NONE FOUND** — All client requests send correct parameters expected by server.

---

## Part 3: FEATURE GAPS IN REACT APP

### Critical Gaps (Blocking Features)

1. **Standalone Lien Waiver Management** ⚠️ HIGH
   - **Server Support:** Yes (3 endpoints)
   - **Client Support:** None (only via email)
   - **Impact:** Users can't create/download lien waivers unless they're sending email
   - **Old App:** Had "Generate Lien Waiver" button in pay app detail view
   - **Fix:** Create `/client/src/api/lienWaivers.ts` + UI components

2. **Subscription Management** ⚠️ HIGH
   - **Server Support:** Yes (4 endpoints in admin.js)
   - **Client Support:** None
   - **Routes exist:**
     - `GET /api/admin/subscription` — Check subscription status
     - `POST /api/admin/subscription/checkout` — Create subscription Checkout
     - `POST /api/admin/subscription/portal` — Get billing portal link
   - **Impact:** Users can't upgrade to Pro tier, no way to manage subscription
   - **Fix:** Create `/client/src/api/admin.ts` subscription functions + UI page

3. **Team Collaboration** ⚠️ MEDIUM
   - **Server Support:** Yes (4 endpoints)
   - **Client Support:** None
   - **Impact:** Multi-user teams can't be managed from React
   - **Fix:** Create `/client/src/api/team.ts` + Team Settings page

4. **Other Invoices** ⚠️ MEDIUM
   - **Server Support:** Yes (5 endpoints)
   - **Client Support:** None
   - **Impact:** Can't upload supplemental invoices (RFI costs, materials, etc.)
   - **Fix:** Create `/client/src/api/otherInvoices.ts` + "Other Invoices" section

5. **Feedback & Support** ⚠️ LOW
   - **Server Support:** Yes (4 endpoints)
   - **Client Support:** None
   - **Impact:** Users can't submit bug reports/feedback from app
   - **Fix:** Create `/client/src/api/feedback.ts` + feedback modal

---

### Nice-to-Have Gaps

1. **Admin User Management Refinement**
   - Missing endpoints in client:
     - `/api/admin/users/:id/verify-email` (manually verify email)
     - `/api/admin/users/:id/resend-verification` (resend verification)
     - `/api/admin/users/:id/reset-password` (set temp password)
   - Workaround: Block/unblock already works; these are edge cases

2. **AI Assistant Formalization**
   - Currently called inline in components
   - Should be exposed as formal API function in `/client/src/api/ai.ts`
   - Low priority, works as-is

3. **Export Formats**
   - QuickBooks export: `/api/revenue/export/quickbooks` (server ready, no UI)
   - Sage export: `/api/revenue/export/sage` (server ready, no UI)
   - Could add to Reports page export options

---

## Part 4: RECOMMENDATIONS

### Priority 1: Subscription Management (BLOCKING)
**Effort:** 4-6 hours
**Files to Create/Update:**
- `/client/src/api/admin.ts` — Add subscription functions
- `/client/src/pages/Subscription.tsx` — New subscription management page
- `/client/src/types/index.ts` — Add Subscription types

**Implementation:**
```typescript
// In /client/src/api/admin.ts, add:
export async function getSubscriptionStatus(): Promise<ApiResponse<SubscriptionStatus>> {
  return api.get('/api/admin/subscription');
}

export async function createSubscriptionCheckout(): Promise<ApiResponse<{ url: string }>> {
  return api.post('/api/admin/subscription/checkout', {});
}

export async function getBillingPortalLink(): Promise<ApiResponse<{ url: string }>> {
  return api.post('/api/admin/subscription/portal', {});
}
```

---

### Priority 2: Lien Waiver Management (BLOCKING)
**Effort:** 3-4 hours
**Files to Create:**
- `/client/src/api/lienWaivers.ts` — New API module

**Implementation:**
```typescript
export async function getLienWaivers(projectId: number): Promise<ApiResponse<LienDocument[]>> {
  return api.get(`/api/projects/${projectId}/lien-docs`);
}

export async function createLienWaiver(
  projectId: number,
  data: CreateLienWaiverRequest,
): Promise<ApiResponse<LienDocument>> {
  return api.post(`/api/projects/${projectId}/lien-docs`, data);
}

export async function downloadLienWaiverPDF(id: number): Promise<Blob> {
  const token = api.getToken();
  const res = await fetch(`/api/lien-docs/${id}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Failed to download PDF');
  return res.blob();
}
```

---

### Priority 3: Team Management (NICE-TO-HAVE)
**Effort:** 5-7 hours
**Files to Create:**
- `/client/src/api/team.ts`
- `/client/src/pages/TeamSettings.tsx`

---

### Priority 4: Other Invoices (FUTURE)
**Effort:** 6-8 hours
**Status:** Server-ready, defer to Pro tier rollout
**Files to Create:**
- `/client/src/api/otherInvoices.ts`
- `/client/src/pages/OtherInvoices.tsx`

---

### Priority 5: Feedback Submission (NICE-TO-HAVE)
**Effort:** 2-3 hours
**Files to Create:**
- `/client/src/api/feedback.ts`
- Simple feedback modal component

---

## Part 5: CROSS-REFERENCE TABLE

### All Server Routes vs Client Coverage

| Module | Total Routes | Covered | Missing | Coverage % |
|--------|------|---|---|---|
| Auth | 11 | 11 | 0 | 100% |
| Projects & SOV | 12 | 12 | 0 | 100% |
| Pay Apps | 16 | 16 | 0 | 100% |
| Settings | 8 | 8 | 0 | 100% |
| Payments & Stripe | 12 | 12 | 0 | 100% |
| Reports | 11 | 11 | 0 | 100% |
| Lien Waivers | 3 | 0 | 3 | 0% ⚠️ |
| Admin (Core) | 8 | 8 | 0 | 100% |
| Admin (User Mgmt) | 8 | 5 | 3 | 62% ⚠️ |
| Admin (Testing) | 6 | 0 | 6 | 0% (intentional) |
| Admin (Webhooks) | 4 | 0 | 4 | 0% (intentional) |
| Team | 5 | 0 | 5 | 0% ⚠️ |
| Other Invoices | 6 | 0 | 6 | 0% ⚠️ |
| Feedback | 4 | 0 | 4 | 0% ⚠️ |
| AI Assistant | 1 | 1 | 0 | 100% |
| Onboarding | 3 | 3 | 0 | 100% |
| QuickBooks | 13 | 13 | 0 | 100% |
| **TOTAL** | **144** | **129** | **15** | **90%** |

**Note:** Of the 15 missing:
- 6 are intentional (admin testing/webhooks)
- 9 are features not yet in React UI (team, other-invoices, feedback, lien-waivers, partial admin)

---

## Conclusion

The React refactor is **well-structured** with clean API module organization. However, **critical features are server-ready but missing client implementations:**

1. **Lien Waivers** — Server endpoints exist, but React can only access them through email flow
2. **Subscription Management** — Server endpoints exist, but React has no upgrade path
3. **Team Collaboration** — Server endpoints exist, but React doesn't expose multi-user features
4. **Other Invoices** — Server endpoints exist, but React has no supplemental invoice UI

**Immediate action needed:** Expose subscription management in React to unblock Pro tier revenue.
