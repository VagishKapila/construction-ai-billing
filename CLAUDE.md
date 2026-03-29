# Construction AI Billing — Project Context for Claude

> **READ THIS FIRST** before touching any code.
> This is the CONSTRUCTION AI BILLING project. If you are in a different project session, stop and switch tabs.
> **PRODUCT IS LIVE WITH REAL USERS. Treat every change as production risk.**

---

## What This Project Is

A web-based G702/G703 construction billing platform for General Contractors.
Users create projects, upload a Schedule of Values (SOV), then generate G702/G703 pay applications as PDFs.

**Live URL:** https://constructinv.varshyl.com
**Staging URL:** https://construction-ai-billing-staging.up.railway.app
**Railway project:** comfortable-radiance
**GitHub repo:** VagishKapila/construction-ai-billing (separate from Sleep Eyes — confirm before touching)
**Owner:** Vagish Kapila (vaakapila@gmail.com) — Varshyl Inc.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | **Two files**: `public/index.html` (landing/marketing) + `public/app.html` (billing app) |
| Backend | Node.js + Express (`server.js`) |
| Database | PostgreSQL via Railway (`db.js` runs migrations on startup) |
| SOV parsing | Node.js XLSX.js (Excel/CSV) + Python `parse_sov.py` (PDF/DOCX) |
| PDF generation | PDFKit (server-side, `server.js`) |
| Auth | JWT + bcrypt, email verification, Google OAuth |
| Email | Resend API (`FROM_EMAIL` env var, plain email only — no display name) |
| Hosting | Railway (auto-deploy from GitHub `main` branch → production, `staging` branch → staging) |
| Domain | constructinv.varshyl.com → IONOS DNS CNAME + TXT verification |
| Payments | Stripe Connect Express (ACH + card via Checkout), `stripe` npm v21+ |
| File storage | Railway Volume `construction-ai-billing-volume` mounted at `/app/uploads` (persistent across deploys) |

---

## File Structure (critical files)

```
construction-ai-billing/
├── server.js          ← ALL backend routes, SOV parser, PDF generator
├── db.js              ← DB schema + ALTER TABLE migrations (runs on startup)
├── parse_sov.py       ← Python parser for PDF and DOCX SOV files only
├── public/
│   ├── index.html     ← Landing/marketing page ONLY — no app logic here
│   ├── app.html       ← ENTIRE billing app (auth, projects, pay apps, settings, admin)
│   ├── pay.html       ← Public payment page (no auth — accessed by payer via /pay/:token)
│   ├── varshyl-logo.png        ← ConstructInvoice AI logo (white bg, 35KB, 400×266px)
│   └── constructinvoice-logo.png  ← Same logo, alternate filename (35KB)
├── qa_test.js         ← Run with `node qa_test.js` — 109 tests, must all pass
├── CLAUDE.md          ← This file
└── package.json
```

### Logo notes
- `varshyl-logo.png` = the ConstructInvoice AI logo (colorful, white background). Used everywhere.
- Both PNG files must stay under 100KB — the QA test enforces this.
- Varshyl is the parent company; ConstructInvoice AI is the product brand.
- DO NOT use the old dark-background logo — it has been replaced.

### CRITICAL: Two-file architecture
The app was split from one file into two. **Any server-side redirect must point to `/app.html`, never to `/` or `/?`.**
- `index.html` = public landing page. Has no auth, no token handlers, no app logic.
- `app.html` = the actual billing app. Handles all auth, Google token, reset token, etc.
- The catch-all route `app.get('*', ...)` serves `index.html` for unknown paths.
- `/app.html` is served as a static file directly by Express.

---

## Core Features & Current Status

### ✅ Working
- **Landing page (`index.html`)** — marketing page, Sign In + Start Free nav buttons, pricing section
- **App landing page (`app.html`)** — in-app landing with Sign In / Get Started buttons, dynamic nav
- **Auth** — register, login, JWT, email verification, Google OAuth, forgot/reset password
- **Google OAuth name sanitization** — non-ASCII characters stripped from profile name on new user creation
- **New Project wizard** — 3 steps: project info → SOV upload → review
- **SOV upload** — accepts Excel (.xlsx/.xls), CSV, PDF (.pdf), Word (.docx/.doc)
- **SOV parser** — universal column detection (finds "Total" header first, falls back to scoring)
- **Pay application** — G702/G703 math, change orders (with ✓ Save button + Enter key), retainage per line
- **PDF generation** — G702 cover + G703 continuation sheet, company logo included
- **Settings page** — company logo, signature, contact profile (name/phone/email), defaults
- **Auto-fill** — new project form pre-fills from saved company profile
- **Lien waivers** — both Conditional and Unconditional waiver buttons; auto-fills amount, date, owner, company, signatory
- **Email send** — sends pay app PDF (+ lien waiver if present) via Resend; "Send & Mark Submitted" first time, "Resend" after
- **Amount Certified** — pre-fills with current payment due (Col H) if not yet set
- **Mobile layout** — responsive CSS, all grids collapse to single column on mobile
- **Admin dashboard** — ⚡ Admin nav item (ADMIN_EMAILS users only):
  - KPI cards: users, projects, pay apps, events today
  - Revenue KPIs: total pipeline, total billed, avg contract size
  - 3 Chart.js charts: monthly billed, pay app activity, pipeline vs billed by user
  - Feature usage bars, daily signups chart, slow API endpoints
  - Error log, AI Insights chat (Claude-powered), feedback inbox, support requests
  - User table with block/unblock/delete/verify controls
- **Railway Volume** — uploads (logos, signatures, lien waiver PDFs) persist across deploys on both production and staging
- **payment_due_date** — auto-calculated on pay app submit based on payment terms (Net 30 → today + 30 days)

### ⚠️ Known Behavior
- "By Others" in SOV amount column → treated as $0 (skipped), correct behavior
- Grand Total row in SOV → excluded from line items, correct behavior
- SSL cert on custom domain — provisioned by Railway via Let's Encrypt, takes 5-15min after DNS

---

## SOV Parser Logic (server.js `parseSOVFile`)

**Human-first approach — do NOT simplify this without testing:**

1. **Step 1 (header detection):** Scan first 30 rows for a cell containing "Total", "Scheduled Value", "Amount", "Cost", "Price" → that column is the amount column. Also look for "Description", "Scope", "Work" → that's the description column.
2. **Step 2 (scoring fallback):** If Step 1 finds nothing, score every column: most numeric cells > $50 = amount col (rightmost wins ties), most text cells > 5 chars = desc col.
3. **Step 3 (row parsing):** Iterate from the row after the header. Skip rows where description OR item_id matches total/subtotal patterns. Skip rows with no amount > 0. Use `continue` (not `break`) on summary rows so Fee-type items after a subtotal are still captured.

**Tested against:** Bains contractor proposal (Vagish's real file)
→ Must find 23 rows, sum = $268,233
→ Must include: Project Management, Superintendent, Contracts Admin, Fee
→ Must exclude: "By Others" (Windows), Grand Total row, signature/phone rows

Run `node qa_test.js` to verify after any parser changes.

---

## Settings & Autofill (db.js + server.js + app.html)

`company_settings` table columns (all added via `ALTER TABLE IF NOT EXISTS`):
- `company_name`, `default_payment_terms`, `default_retainage`
- `logo_filename`, `signature_filename`
- `contact_name`, `contact_phone`, `contact_email`

When user opens New Project wizard, `showNewProject()` auto-fills:
- General contractor ← `companySettings.company_name`
- Contact name/phone/email ← `companySettings.contact_name/phone/email`
- Payment terms ← `companySettings.default_payment_terms`

**Pending (approved, not yet built):** Change default payment terms from "Due on receipt" to "Net 30".

---

## Admin Dashboard

Protected by `ADMIN_EMAILS` env var on Railway (currently set to `vaakapila@gmail.com,vagishkapila@gmail.com`).
Log in with either admin email → ⚡ Admin nav item appears.

Backend routes: `GET /api/admin/stats`, `GET /api/admin/users`, `GET /api/admin/chart/payapp-activity`,
`GET /api/admin/chart/pipeline-by-user`, `POST /api/admin/users/:id/block`, etc.
All protected by `adminAuth` middleware that checks `ADMIN_EMAILS` env var.

---

## Email (Resend API)

`FROM_EMAIL` env var = `billing@varshyl.com`
The `from` field MUST be plain email only — no display name format like `"Name <email>"`.
All Resend calls in the codebase use `from: fromEmail` (not `from: \`${name} <${email}>\``).

---

## G702/G703 Math — DO NOT CHANGE

| Col | Formula |
|-----|---------|
| A | Scheduled value |
| B | Work completed from previous |
| C | Work completed this period |
| D | B + C |
| E | Retainage % × D |
| F | D − E |
| G | Previous certificates |
| H | F − G (current payment due) |
| I | A − F (balance to finish) |

Retainage is per-line (can vary). Default from project settings.

---

## Branch Strategy & Engineering Rules

### ⚠️ CRITICAL RULES — READ BEFORE EVERY CHANGE

1. **Always discuss with Vagish before making any code change** — no surprises, no assumptions
2. **Claude NEVER pushes to GitHub** — Vagish pushes via GitHub Desktop only
3. **Run `node qa_test.js` (109/109) before flagging any change as ready to push**
4. **Product is live with real users** — treat every change as production risk

### Branch Map

| Branch | Environment | Purpose |
|--------|-------------|---------|
| `main` | Production (constructinv.varshyl.com) | **Only merge when fully tested on staging** |
| `staging` | Staging (railway staging env) | Bug fixes, small UI/copy changes, pre-production testing |
| `feature/followup` | Local only until tested | Payment follow-up emails + "Mark as Paid" — DO NOT merge to staging without full review |
| `feature/stripe` | Local only until discussed | Stripe $129/month subscription — NOT STARTED, discuss first |
| `feature/stripe-connect` | Future | Contractor payment pipeline — NOT STARTED, major feature |

### What goes where

- **Small bug fixes, copy changes, UI tweaks** → `staging` branch → test → merge to `main`
- **New features touching billing, email, or payments** → `feature/*` branch → staging → discuss → main
- **Payment processing (Stripe, escrow model)** → completely isolated `feature/stripe-connect` branch, never touches `staging` or `main` until production-ready and explicitly approved

### What NEVER goes to staging or main without explicit approval
- Any payment processing code (Stripe, Chase, escrow)
- Any email sending changes (risk of spamming users)
- Any database schema changes that can't be rolled back
- Any auth changes

---

## Deployment Workflow

- Vagish pushes via **GitHub Desktop → "Push origin"** → Railway auto-deploys
- `staging` branch → staging environment → test here first
- `main` branch → production (constructinv.varshyl.com)
- Claude NEVER pushes to GitHub — Vagish controls all deploys via GitHub Desktop
- After any code change, run `node qa_test.js` — must be 109/109 before pushing

### Current Branch Status (updated Mar 23 2026)
- `main` = production — has all fixes through Google OAuth, password reset, admin dashboard, revenue charts, logo fixes, pricing page updates
- `staging` = same as main (all recent changes committed and pushed)
- `feature/followup` = NOT CREATED YET — planned next sprint

---

## Pending Features — Master Roadmap (updated Mar 28 2026)

> **THIS IS THE SINGLE SOURCE OF TRUTH for all planned features.**
> Every new Claude session should read this section first.
> Features are organized by module. Status: ⬜ Not started | 🟡 In progress | ✅ Done

---

### Module 1: Trial & Subscription System (`feature/trial`) — PRIORITY 1
**Status: ⬜ Not started**
**Pricing model:** $40/month, 90-day free trial, NO credit card at signup

**Database changes:**
- Add to `users` table: `trial_start_date` (timestamp, set on registration), `trial_end_date` (timestamp, trial_start + 90 days), `subscription_status` (enum: 'trial', 'active', 'canceled', 'past_due', 'free_override'), `stripe_customer_id` (text, nullable), `stripe_subscription_id` (text, nullable), `plan_type` (enum: 'free_trial', 'pro', 'free_override')
- Existing users: set `trial_start_date` = their `created_at`, `subscription_status` = 'trial', `plan_type` = 'free_trial'

**Soft block after trial expires:**
- Users can still log in and VIEW existing projects, pay apps, and reports (read-only)
- BLOCKED: creating new projects, creating new pay apps, sending emails, generating PDFs, signing lien waivers
- Show a banner: "Your 90-day trial has ended. Upgrade to Pro ($40/month) to continue. Can't afford it? Email vaakapila@gmail.com — we'll work something out."
- If someone wants to pay DURING the trial, show an option: "Want to go Pro now? Your support helps us keep this free for contractors who can't afford it yet, and helps us cover hosting costs."

**Stripe integration:**
- Stripe Checkout for payment collection (NOT at signup — only when they choose to upgrade or trial ends)
- Stripe Customer created when they first pay, not at registration
- Stripe Subscription with no trial (since our trial is managed in-app)
- Webhooks: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`
- Branch: `feature/trial`

**Pro tier extras (beyond free trial features):**
- Accept payments through invoices (Stripe Connect — future)
- Advanced reporting with sort/filter by job, date, week
- Priority AI assistant
- Mobile-optimized PWA with offline access
- Custom email templates
- Bulk operations (send multiple pay apps)
- Occasional gentle nudge: "Going Pro helps other contractors use this for free and helps us keep the servers running"

---

### Module 2: Super Admin Controls — PRIORITY 2
**Status: ⬜ Not started**
**Requires:** Module 1 (trial system DB schema)

**Admin dashboard additions (ADMIN_EMAILS users only):**
- User table: show `subscription_status`, `trial_end_date`, `plan_type` for each user
- Action buttons per user: "Extend Trial" (add X days), "Set Free Override" (waive payment indefinitely), "Upgrade to Pro" (manual), "Reset to Trial"
- KPI cards: total trial users, total pro users, total free-override users, trials expiring this week
- Revenue dashboard: MRR (monthly recurring revenue), churn rate, conversion rate (trial → pro)
- Ability to send a manual email to any user from admin dashboard

---

### Module 3: Onboarding Walkthrough (Guided Tour) — PRIORITY 3
**Status: ⬜ Not started**

**First-time user overlay/tooltip tour:**
- Triggers on first login (track via `has_completed_onboarding` boolean in users table)
- Step-by-step highlights with overlay dimming:
  1. "Welcome! Let's create your first project" → highlights New Project button
  2. "Upload your Schedule of Values" → highlights SOV upload area
  3. "Enter this period's progress" → highlights the pay app grid
  4. "Download your G702/G703 PDF" → highlights Download button
  5. "Send it directly to the owner" → highlights Email button
  6. "Need a lien waiver? Generate one here" → highlights Lien Waiver button
  7. "Ask our AI anything about billing" → highlights AI chat
  8. "Update your company logo and signature in Settings" → highlights Settings nav
- Must work on mobile (single-column layout, touch-friendly)
- "Skip tour" and "Show me later" options
- Can be re-triggered from Settings or Help menu
- Lightweight implementation: no external library, pure CSS/JS overlay

---

### Module 4: AI Assistant Training (Product Help) — PRIORITY 4
**Status: ⬜ Not started**

**Enhance the existing AI chat to answer product questions:**
- "How do I create a lien waiver?"
- "Where do I upload my Schedule of Values?"
- "How do I add a change order?"
- "How do I send my pay app to the owner?"
- "What file formats can I upload?"
- "How do I change my company logo?"
- "How do I generate a report?"

**Implementation:** Add a product knowledge system prompt to the existing AI chat that includes all feature documentation, step-by-step instructions, and FAQ. The AI should detect when someone is asking a "how to use the product" question vs a construction billing question and respond accordingly.

**Also needed:** A help/FAQ page or section accessible from the nav that has common questions, possibly auto-generated from the AI knowledge base.

---

### Module 5: Reporting Module (Sort/Filter Invoices) — PRIORITY 5
**Status: ⬜ Not started**

**Expand existing revenue/billing views:**
- Currently: admin dashboard shows total pipeline, total billed, revenue charts
- New: a dedicated "Reports" section accessible to ALL users (not just admin)
- Sort/filter pay apps by: project name, date submitted, date range, week, month, status (draft/submitted/paid)
- Export filtered results as CSV or PDF
- Summary cards: total billed this month, total outstanding, total paid
- Per-project drill-down: all pay apps for a project with running totals
- Chart: monthly billing trend per project

---

### Module 6: Pro Upgrade Nudges + Early Payment — PRIORITY 6
**Status: ⬜ Not started**
**Requires:** Module 1 (trial system)

**During trial, occasional gentle prompts:**
- After 30 days: "Enjoying ConstructInvoice AI? Going Pro helps us keep this free for contractors who need it."
- After 60 days: "Your trial ends in 30 days. Want to lock in Pro now? $40/month — cancel anytime."
- After creating 5th pay app: "You've generated 5 pay applications! Pro users get advanced reporting and priority AI support."
- NEVER aggressive or annoying. Max 1 nudge per session. Dismissible with "Not now" that stays dismissed for 7 days.

**Early payment option:**
- In Settings, always show: "Upgrade to Pro — $40/month" button even during trial
- Message: "Your support helps other contractors use this for free and keeps our servers running."

---

### Module 7: QA & Testing Automation — ONGOING
**Status: ⬜ Not started**

**Phase A: API Integration Tests (expand qa_test.js)**
- Test every critical endpoint with real HTTP requests
- Lien waiver download → verify response is PDF, not HTML
- Email send → verify Resend API called with correct attachments
- Pay app save → verify notes/PO persist correctly
- SOV upload → verify parser returns correct line items
- Auth flows → verify JWT, Google OAuth, password reset

**Phase B: Playwright End-to-End Browser Tests (new file: e2e_test.js)**
- Full user flows in real Chromium browser
- Create account → create project → upload SOV → generate pay app → download PDF → send email
- Verify PDF opens correctly (not HTML)
- Verify lien waiver downloads correctly
- Mobile viewport testing
- Screenshot comparisons for visual regression

---

### Previously Approved (Still Valid)

#### Net 30 as default payment terms (tiny, safe)
- Change hardcoded fallback from `"Due on receipt"` to `"Net 30"` in server.js and app.html
- DB migration to update existing users who never changed it
- Branch: can go directly to staging

#### Payment follow-up emails + "Mark as Paid" (`feature/followup`)
- Daily cron job checks submitted pay apps where `payment_due_date` is approaching/past
- Sends follow-up to owner email, CC contractor
- "Did you get paid?" email with Yes/No magic links
- Follow-up schedule: Net 7 → day 5; Net 15 → day 9 + day 16; Net 30 → day 23 + day 37
- New DB table: `followup_log`
- New pay app status: `paid` / `payment_received`
- Branch: `feature/followup`

#### Stripe Connect Payment Pipeline (`feature/stripe-connect`) — FUTURE
- Escrow model: owner pays contractor through platform
- Stripe Connect handles contractor KYC/onboarding
- ACH preferred for large amounts
- Major feature — 2-3 week build minimum
- Part of Pro tier — DO NOT START until Modules 1-2 are complete and stable

---

## Things That Have Been Broken Before — Don't Repeat

1. **SOV parser skipping "Project Management"** — old skipDesc had "project" in it. Current uses `isSummary()`.
2. **PDF upload rejected client-side** — `processSOVFile()` was checking only xlsx/csv. Now checks pdf/docx/doc too.
3. **Settings fields not persisting** — `contact_name/phone/email` were not in DB schema. Now added via ALTER TABLE.
4. **Mobile layout broken** — comprehensive CSS rules needed for all grids.
5. **Landing page hiding app** — `auth-screen` must start with class `hidden`.
6. **Logo file too large** — varshyl-logo.png must stay < 100KB (currently 35KB at 400×266px).
7. **Google OAuth loop** — server redirected to `/#google_token=...` which served index.html. Fixed: now redirects to `/app.html#google_token=...`.
8. **Password reset opens home page** — server sent reset link as `/?reset=TOKEN`. Fixed: now `/app.html?reset=TOKEN`.
9. **Email 422 non-ASCII error** — `FROM_NAME` env var had non-ASCII char. Fixed: use plain `fromEmail` only (no display name).
10. **Uploaded files lost on redeploy** — Railway ephemeral filesystem. Fixed: Railway Volume at `/app/uploads` on both environments.
11. **Google profile name garbled** — Unicode curly quotes in nickname showed as "â€" sequences. Fixed: strip non-ASCII from name in Google OAuth handler.
12. **Wrong logo filename** — auth screen pointed to `constructinvoice-logo.png` (onerror hid it). Fixed: use `/varshyl-logo.png`.
13. **Logo too large for deploy** — original logo was 2MB (6144×4096px). Compressed to 35KB (400×266px) using Pillow.

---

## Stripe Connect — Payment Integration (added Mar 28 2026)

### Account Structure
- **Parent org:** Varshyl (Stripe Organization)
- **ConstructInvoice AI account:** `acct_1TG76NAHP8NRRyLC` — separate from DocuFlow
- **DocuFlowAI account:** `acct_1TG786AsCE0yP645` — DO NOT use these keys here
- Each product has its own API keys, connected accounts, and payment history
- Currently in **TEST MODE** — keys start with `pk_test_` / `sk_test_`

### Railway Environment Variables (must be set on Railway, NOT in code)
| Variable | Purpose | Example |
|----------|---------|---------|
| `STRIPE_SECRET_KEY` | Server-side Stripe SDK | `sk_test_51TG76NAHP8NRRyLC...` |
| `STRIPE_PUBLISHABLE_KEY` | Client-side (if needed) | `pk_test_51TG76NAHP8NRRyLC...` |
| `STRIPE_WEBHOOK_SECRET` | Verify webhook signatures | `whsec_...` |
| `BASE_URL` | Payment link URLs | `https://construction-ai-billing-staging.up.railway.app` (staging) or `https://constructinv.varshyl.com` (prod) |

### Fee Model (Hybrid — zero absorption)
| Method | Who Pays | Amount | Platform Keeps |
|--------|----------|--------|----------------|
| ACH | GC (contractor) | $25 flat | $25 application_fee |
| Credit Card | Payer (owner) | 3.3% + $0.40 on top | Processing fee as application_fee |
| Payouts | GC (from balance) | 0.28% + $0.28 | Markup over Stripe's 0.25%+$0.25 |

### How It Works
1. GC connects Stripe via Express onboarding (Settings → Accept Payments)
2. GC sends pay app email → email includes "Pay Now" button with unique `/pay/:token` link
3. Owner clicks link → `pay.html` loads invoice data, shows ACH (recommended) + card options
4. Owner pays → Stripe Checkout handles payment → webhook updates pay_app status
5. GC sees payment in 💳 Payments dashboard + status badge on pay app

### Database Tables
- `connected_accounts` — GC's Stripe Connect accounts
- `payments` — individual payment records (links to pay_apps)
- `payment_followups` — scheduled follow-up tracking
- `pay_apps` additions: `payment_status`, `amount_paid`, `payment_link_token`, `bad_debt`, `bad_debt_at`, `bad_debt_reason`
- `users` additions: `stripe_connect_id`, `payments_enabled`

### Server Routes (all in server.js)
- `POST /api/stripe/connect` — Start Connect Express onboarding
- `GET /api/stripe/account-status` — Check GC's connected account
- `POST /api/stripe/dashboard-link` — Generate Stripe Express dashboard link
- `POST /api/pay-apps/:id/payment-link` — Generate payment link for a pay app
- `GET /api/pay/:token` — Public: get pay app data for payment page
- `POST /api/pay/:token/checkout` — Create Stripe Checkout session (ACH or card)
- `POST /api/stripe/webhook` — Handle Stripe webhook events
- `GET /api/payments` — List GC's payments with summary stats
- `POST /api/pay-apps/:id/bad-debt` — Mark as uncollectable
- `POST /api/pay-apps/:id/undo-bad-debt` — Undo bad debt
- `GET /pay/:token` — Serve pay.html (public payment page)

### Going Live Checklist
- [ ] Switch Stripe to live mode, get `sk_live_` and `pk_live_` keys
- [ ] Update Railway production env vars with live keys
- [ ] Create live webhook endpoint pointing to production URL
- [ ] Verify GC onboarding flow works end-to-end
- [ ] Test real ACH and card payment (use small amount)
- [ ] Confirm payouts to GC's bank account

---

## Project Boundaries — What NOT to Touch

- **Do NOT** modify the G702/G703 math formulas without running the full pay app test
- **Do NOT** remove the `_commaSetup` guard on `setupCommaInput`
- **Do NOT** change `parse_sov.py` for Excel files — Excel is handled by Node.js only
- **Do NOT** change the Railway/GitHub deploy setup — Vagish manages this
- **Do NOT** push to GitHub — Vagish does this via GitHub Desktop
- **Do NOT** use display name format in Resend `from` field — plain email only
- **Do NOT** redirect to `/` or `/?` from server — always use `/app.html` or `/app.html?`
- **Do NOT** modify Stripe fee amounts (ACH $25, CC 3.3%+$0.40) without discussing with Vagish
- **Do NOT** switch Stripe from test mode to live mode without explicit approval from Vagish
- **Do NOT** make changes to email sending logic without discussing first (risk of spamming users)

---

## Other Project Warning

The user also has a **Sleep Eyes** project in a **separate Cowork tab**.
If you see files or code unrelated to construction billing, you are in the wrong session.
Ask the user to confirm which project before making any changes.
