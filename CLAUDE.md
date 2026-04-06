# Construction AI Billing — Project Context for Claude

> **READ THIS FIRST** before touching any code.
> This is the CONSTRUCTION AI BILLING project. If you are in a different project session, stop and switch tabs.
> **PRODUCT IS LIVE WITH REAL USERS. Treat every change as production risk.**

---

## ⚡ AGENT ORCHESTRATION — USE BY DEFAULT

**ALWAYS use parallel agents for any task that touches multiple layers (frontend, backend, database, deployment).** Do NOT ask Vagish if you should use agents — just use them. This is the default workflow.

### When to launch parallel agents:
- **Any feature work** → spawn agents for: backend routes, frontend components, database migrations, and deployment/wiring
- **Bug fixes touching 2+ files** → spawn agents for each file/layer in parallel
- **Audit/review tasks** → spawn an agent to read and report on each module simultaneously
- **Stripe/QB/external API work** → use Stripe SDK via curl (NOT browser — Stripe Dashboard is blocked). Use Stripe CLI or REST API for all Stripe operations.

### Agent roles (use these names):
| Agent | Scope | Tools |
|-------|-------|-------|
| **Backend Architect** | Express routes, services, middleware, API design | server/, db.js |
| **Frontend Developer** | React components, pages, hooks, types | client/src/ |
| **Database Architect** | PostgreSQL schema, migrations, indexes | db.js |
| **Deployment Engineer** | Railway config, server/app.js wiring, env vars, build verification | railway.toml, nixpacks.toml, server/app.js |
| **QA Engineer** | Run qa_test.js, TypeScript check, Vite build, integration tests | qa_test.js, client/ |

### Orchestration rules:
1. **Read CLAUDE.md first** — every session, every time
2. **Launch 2-4 agents in parallel** for any non-trivial task
3. **After agents complete** — verify integration, fix wiring issues, run QA
4. **Stripe operations** — ALWAYS via SDK/API (curl), NEVER browser automation
5. **QuickBooks** — NEVER use browser automation for Intuit Developer portal
6. **All new features go to `staging` branch** → test → merge to `main`

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
| Frontend | React 19 + TypeScript + Vite 6 SPA (`client/`) + legacy `public/app.html` (billing app) + `public/index.html` (legacy landing) |
| Backend | Node.js + Express (`server.js`) |
| Database | PostgreSQL via Railway (`db.js` runs migrations on startup) |
| SOV parsing | Node.js XLSX.js (Excel/CSV) + Python `parse_sov.py` (PDF/DOCX) |
| PDF generation | PDFKit (server-side, `server.js`) |
| Auth | JWT + bcrypt, email verification, Google OAuth |
| Email | Resend API (`FROM_EMAIL` env var, plain email only — no display name) |
| Hosting | Railway (auto-deploy from GitHub `main` branch → production, `staging` branch → staging) |
| Domain | constructinv.varshyl.com → IONOS DNS CNAME + TXT verification |
| Payments | Stripe Connect Express (ACH + card via Checkout), `stripe` npm v21+ |
| QuickBooks | OAuth 2.0 integration via `intuit-oauth` + REST API v3 (`server/services/quickbooks.js`) |
| File storage | Railway Volume `construction-ai-billing-volume` mounted at `/app/uploads` (persistent across deploys) |

### Rev 3 Frontend Stack (constructinv-3.0 branch → merged to main)

| Library | Purpose | Version |
|---------|---------|---------|
| React 19 + TypeScript | UI framework | ^19.2.4 |
| Vite 6 | Build tool (NOT Vite 8 — Rolldown native bindings crash Railway) | ^6.4.1 |
| Tailwind CSS v4 + shadcn/ui | Styling + component primitives | ^4.2.2 |
| Remotion + @remotion/player | Animated marketing videos, hero content | ^4.0.443 |
| @remotion/three | 3D video content (React Three Fiber integration) | ^4.0.443 |
| Framer Motion | 3D UI animations, page transitions, hover effects | ^12.38.0 |
| Three.js + @react-three/fiber + @react-three/drei | 3D scene rendering for UI and Remotion | ^0.183.2 |
| Aceternity UI patterns | 3D tilting cards, spotlight effects, aurora backgrounds (copy-paste, not npm) | N/A |
| Recharts | Charts and data visualization | ^3.8.1 |
| Lucide React | Icon set | ^1.7.0 |

**IMPORTANT:** Remotion + Framer Motion + Three.js are part of this project's animation/3D stack. Do NOT remove them. They were installed together with Nano Banana 2 (image generation) and the ui-ux-pro-max skill as part of the design system overhaul.

---

## File Structure (critical files)

```
construction-ai-billing/
├── server.js          ← ALL backend routes, SOV parser, PDF generator
├── db.js              ← DB schema + ALTER TABLE migrations (runs on startup)
├── parse_sov.py       ← Python parser for PDF and DOCX SOV files only
├── server/
│   ├── app.js             ← Express app setup, route mounting, middleware wiring
│   ├── routes/
│   │   ├── projects.js    ← Project routes including reconciliation, complete/reopen
│   │   ├── quickbooks.js  ← All QB API routes (OAuth, sync, estimates)
│   │   ├── trial.js       ← Trial status + Stripe upgrade checkout (Rev 3)
│   │   ├── admin-extended.js ← Super admin: extend trial, free override, manual upgrade (Rev 3)
│   │   ├── onboarding.js  ← Onboarding complete/reset endpoints (Rev 3)
│   │   ├── reports.js     ← Reports module: filter, sort, export pay apps (Rev 3)
│   │   ├── ai.js          ← AI assistant: product help + billing intelligence (Rev 3)
│   │   └── webhook.js     ← Stripe webhook handler (signature verified, SINGLE handler)
│   ├── services/
│   │   ├── quickbooks.js  ← QB service layer (OAuth, API calls, token encryption)
│   │   └── trial.js       ← Trial logic: getTrialStatus, createProSubscription (Rev 3)
│   ├── middleware/
│   │   ├── auth.js        ← JWT auth + adminAuth middleware
│   │   └── trialGate.js   ← Blocks expired trial users from write operations (Rev 3)
│   └── lib/
│       └── logEvent.js    ← Audit event logging helper
├── client/            ← Rev 3 React frontend (Vite + React 19 + TypeScript)
│   └── src/
│       ├── App.tsx            ← Root: ErrorBoundary + BrowserRouter + AuthProvider
│       ├── pages/
│       │   ├── ProjectDetail.tsx  ← Project view with pay apps, SOV, reconciliation
│       │   ├── Settings.tsx       ← Company settings, Stripe, QB, subscription
│       │   ├── Reports.tsx        ← Reports page: filter/sort/export pay apps (Rev 3)
│       │   └── AdminDashboard.tsx ← Super admin with trial/subscription controls (Rev 3)
│       ├── components/
│       │   ├── layout/
│       │   │   └── Shell.tsx      ← Main layout: sidebar, topbar, trial banner, tour
│       │   ├── quickbooks/
│       │   │   ├── QBConnectionCard.tsx   ← OAuth connect/disconnect UI
│       │   │   ├── QBSyncButton.tsx       ← Sync project to QB button
│       │   │   ├── QBSyncLog.tsx          ← Sync history table
│       │   │   └── QBEstimateImport.tsx   ← Import QB estimates as SOV
│       │   ├── trial/                     ← Rev 3 trial/subscription UI
│       │   │   ├── TrialBanner.tsx        ← Top banner when trial nearing expiry
│       │   │   ├── UpgradeModal.tsx       ← Stripe Checkout upgrade modal
│       │   │   └── UpgradeNudge.tsx       ← Gentle bottom-right nudge toast
│       │   ├── onboarding/                ← Rev 3 onboarding
│       │   │   └── GuidedTour.tsx         ← Step-by-step overlay tour
│       │   └── ai/
│       │       └── AIChatWidget.tsx       ← AI assistant (product help + billing)
│       ├── hooks/
│       │   ├── useTrial.ts       ← Trial state: daysRemaining, isExpired, isPro (Rev 3)
│       │   ├── useOnboarding.ts  ← Tour lifecycle: show, complete, skip, reset (Rev 3)
│       │   ├── useNudge.ts       ← Nudge triggers: 30d, 60d, 5 pay apps (Rev 3)
│       │   └── useReports.ts     ← Reports data fetching + filtering (Rev 3)
│       ├── api/
│       │   ├── projects.ts       ← Project API client
│       │   └── trial.ts          ← Trial/subscription API client (Rev 3)
│       ├── contexts/
│       │   └── AuthContext.tsx    ← Auth state (includes trial fields on user)
│       └── types/index.ts        ← TypeScript interfaces (Project, PayApp, User w/ trial fields)
├── public/
│   ├── index.html     ← Landing/marketing page ONLY — no app logic here
│   ├── app.html       ← Legacy billing app (auth, projects, pay apps, settings, admin)
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
- **Job Completed** — when all SOV lines are 100% billed, "Create Pay Application" button is hidden, green "Job Completed" banner shows with trophy icon. Projects can be reopened (Reopen Job button) to resume billing. DB columns: `projects.status` ('active'|'completed'), `projects.completed_at`
- **Reconciliation** — per-project reconciliation report showing total_work_completed vs total_billed + total_retainage_held. Uses < $0.02 threshold for "Fully Reconciled" status (green banner). Accessible from Pay Apps tab.
- **QuickBooks Integration (UI wired, backend built, NOT YET CONNECTED)** — QB components wired into Settings page (QBConnectionCard, QBSyncLog) and ProjectDetail page (QBSyncButton, QBEstimateImport). Backend routes in `server/routes/quickbooks.js`, service layer in `server/services/quickbooks.js`. **BLOCKED: needs QB env vars on Railway to activate** (see QuickBooks section below).

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
2. **Claude pushes to GitHub** — Claude handles all git commits and pushes. Vagish never pushes manually.
3. **Workflow: staging first** — all work goes to `staging` branch → test → after bug fixes, push to `main`
4. **Run `node qa_test.js` (109/109) before any push**
5. **Product is live with real users** — treat every change as production risk

### Branch Map

| Branch | Environment | Purpose |
|--------|-------------|---------|
| `main` | Production (constructinv.varshyl.com) | **Only merge when fully tested on staging** |
| `staging` | Staging (railway staging env) | **ALL new features and bug fixes go here FIRST** → test → merge to `main` |
| `constructinv-3.0` | Local | Rev 3 build branch (7 modules). Ready to merge to main after Vagish pushes. |

### What goes where (updated Apr 6 2026)

- **ALL new features** → `staging` branch → test on staging env → merge to `main`
- **Bug fixes** → `staging` branch → test → merge to `main`
- **Hotfixes only** → directly to `main` (only if staging is broken or blocked)
- The old `feature/*` branch pattern is retired. Everything goes through `staging`.

### What NEVER goes to staging or main without explicit approval
- Any payment processing code (Stripe live mode switch)
- Any email sending changes (risk of spamming users)
- Any database schema changes that can't be rolled back
- Any auth changes

---

## Deployment Workflow

- Claude commits and pushes via git CLI → Railway auto-deploys
- `staging` branch → staging environment → test here first
- `main` branch → production (constructinv.varshyl.com)
- After any code change, run `node qa_test.js` — must be 109/109 before pushing
- **NOTE:** Vagish has explicitly authorized Claude to push to GitHub for this project

### Current Branch Status (updated Apr 6 2026)
- `constructinv-3.0` = Rev 3 with all 7 modules built, all bugs fixed, ready to push
- `main` = production — Rev 2 + QB integration + Stripe Connect + Job Completed + Reconciliation
- `staging` = same as main (will receive all future work after Rev 3 merges to main)

---

## Modules — Master Roadmap (updated Apr 6 2026)

> **THIS IS THE SINGLE SOURCE OF TRUTH for all features.**
> Every new Claude session should read this section first.
> Features are organized by module. Status: ⬜ Not started | 🟡 In progress | ✅ Done

---

### Module 1: Trial & Subscription System — PRIORITY 1
**Status: ✅ DONE (Rev 3, Apr 6 2026)**
**Files:** `server/routes/trial.js`, `server/services/trial.js`, `server/middleware/trialGate.js`, `server/routes/webhook.js` (subscription events), `client/src/hooks/useTrial.ts`, `client/src/api/trial.ts`, `client/src/components/trial/TrialBanner.tsx`, `client/src/components/trial/UpgradeModal.tsx`
**Stripe:** Product `prod_UHoK09nnd940UV`, Price `price_1TJEhbA9PDiZOpzDJUZiWtd1` ($40/mo — being replaced with $64/mo for Project Hub launch)
**Pricing model:** $64/month (updated from $40 — see Module 8), 90-day free trial, NO credit card at signup

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
- Webhooks: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`
- All subscription webhooks handled in `server/routes/webhook.js` (single handler with Stripe signature verification)

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
**Status: ✅ DONE (Rev 3, Apr 6 2026)**
**Files:** `server/routes/admin-extended.js` (6 routes, all secured with `adminAuth`), `client/src/pages/AdminDashboard.tsx`
**Requires:** Module 1 (trial system DB schema)

**Admin dashboard additions (ADMIN_EMAILS users only):**
- User table: show `subscription_status`, `trial_end_date`, `plan_type` for each user
- Action buttons per user: "Extend Trial" (add X days), "Set Free Override" (waive payment indefinitely), "Upgrade to Pro" (manual), "Reset to Trial"
- KPI cards: total trial users, total pro users, total free-override users, trials expiring this week
- Revenue dashboard: MRR (monthly recurring revenue), churn rate, conversion rate (trial → pro)
- Ability to send a manual email to any user from admin dashboard

---

### Module 3: Onboarding Walkthrough (Guided Tour) — PRIORITY 3
**Status: ✅ DONE (Rev 3, Apr 6 2026)**
**Files:** `client/src/components/onboarding/GuidedTour.tsx`, `client/src/hooks/useOnboarding.ts`, `server/routes/onboarding.js`

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
**Status: ✅ DONE (Rev 3, Apr 6 2026)**
**Files:** `client/src/components/ai/AIChatWidget.tsx`, `server/routes/ai.js`, `db.js` (ai_conversations table)

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
**Status: ✅ DONE (Rev 3, Apr 6 2026)**
**Files:** `client/src/pages/Reports.tsx`, `server/routes/reports.js`, `client/src/hooks/useReports.ts`

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
**Status: ✅ DONE (Rev 3, Apr 6 2026)**
**Files:** `client/src/components/trial/UpgradeNudge.tsx`, `client/src/hooks/useNudge.ts`, `client/src/components/trial/TrialBanner.tsx`, `client/src/components/trial/UpgradeModal.tsx`
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
**Status: ✅ DONE (Rev 3, Apr 6 2026) — Phase A complete, Phase B planned**
**Files:** `qa_test.js` (109 tests), TypeScript strict mode, Vite build verification

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

### Module 8: Exp1_ConstructInv3 — Project Hub (DESIGNED Apr 6 2026)
**Status: 🟡 PRD Complete, ready for implementation**
**Internal codename:** Exp1_ConstructInv3
**PRD:** `Exp1_ConstructInv3_Project_Hub_PRD.docx` (v2.1, 30KB)
**Branch:** `staging` (all work goes through staging → main)

**Core concept:** Project Hub eliminates the "email black hole" in construction. Every project gets a Hub tab where trades (subs, vendors, suppliers) upload invoices, lien waivers, RFIs, photos, submittals, and compliance docs. Zero friction intake via web upload, magic links, AND email aliases. Fully integrated with existing G702/G703 billing, Stripe Connect payments, and QuickBooks sync. AI keeps contractors cash-flow positive.

**This is NOT a separate product** — it's the other half of ConstructInvoice AI. The billing engine handles outgoing money (pay apps, invoicing). Project Hub handles incoming documents from subs/vendors. Together they form one integrated ecosystem.

**Pricing (UPDATED):**
- Pro plan: **$64/month** (replaces previous $40/month)
- 90-day free trial, NO credit card at signup
- Need to create new Stripe Price on `prod_UHoK09nnd940UV` at $64/month
- Existing $40 price (`price_1TJEhbA9PDiZOpzDJUZiWtd1`) will be grandfathered or migrated

**Three Fixed Roles (per project):**
1. **Office/Accountant** — receives invoices, lien waivers, compliance docs
2. **PM/PMCM** — receives RFIs, submittals, change orders, drawings
3. **Superintendent** — receives daily reports, photos, safety docs, punch lists

No complex role configuration needed. Doc type determines routing automatically.

**Key Features (V1):**
- Per-project Hub tab with trades management (add "Plumbing", "Electrical", etc.)
- Magic link invites for subs (zero account creation, zero passwords)
- Email aliases: `{trade}-{address-slug}@hub.constructinv.com` (e.g., plumbing-123elm@hub.constructinv.com)
- Document upload + categorization (invoice, lien_waiver, rfi, photo, submittal, daily_report, change_order, compliance, drawing, other)
- Unified inbox dashboard with filtering by trade, doc type, status
- Approve/Reject/Comment workflow per document
- Simple RFI reply system (text + attachment, works on phone)
- Stale document alerts (2-day warning → 5-day escalation → 7-day urgent)
- AI SOV guardrails (warn-only when invoices approach/exceed SOV line items)
- ZIP export for project close-out + long-term archival
- Full notification system (in-app + email)

**Email Ingestion:**
- Mailgun Routes on `hub.constructinv.com` subdomain (~$35/month)
- Catch-all wildcard → parse trade + project from email alias → route to correct Hub
- Attachments extracted and auto-categorized

**Integrated Ecosystem (Hub + Billing + Payments + QB):**
The full loop: Sub uploads invoice → Hub intake → Client reviews/approves → Approved invoices link to SOV line items → Client creates pay app (billing engine) → Generates G702/G703 PDF → Owner pays via Stripe or check → Payment recorded → Syncs to QuickBooks
- V1: Auto-link approved invoices to matching SOV trades, manual reconciliation
- V2 (future): AI auto-fills pay app work-completed from approved invoice amounts

**AI Cash Flow Intelligence (3 priorities):**
1. **Collection Tracking + Follow-Up** (P0) — Track outstanding amounts per payer, flag overdue invoices, learn payer patterns (who pays slow?), automated follow-up emails at configurable intervals
2. **Cash Flow Forecasting** (P1) — 30-day projections based on active pay apps + payment terms, gap warnings when outgoing > incoming, trend analysis
3. **SOV Budget Guardian** (P2, existing enhanced) — Warn when trade invoices approach/exceed SOV budget, cumulative tracking across all invoices per trade

**Database tables (5 new):**
- `project_trades` — trade per project, magic_link_token, email_alias, sub info, status
- `hub_uploads` — all documents with doc_type enum, approval status, stale alerts, source (web_app|magic_link|email_ingest)
- `hub_comments` — comments and RFI replies (is_rfi_reply boolean)
- `hub_team_roles` — 3 fixed roles per project (office|pm|superintendent)
- `hub_notifications` — all notifications with trigger_type enum (upload|approval|rejection|stale_warning|stale_escalation|rfi_reply|comment|mention)

**API routes (18 endpoints):**
- Trade management: POST/GET/PUT trades, POST invite
- Hub documents: POST upload, GET inbox, GET/PUT single upload, POST reply, POST comment, GET download, GET export ZIP
- Magic link (no auth): GET /hub/:token, GET/POST trade/:token
- Team routing: GET/POST/DELETE team members
- AI + Email: GET sov-check, POST inbound/email, POST stale-check

**Implementation Timeline (7 phases, ~10 weeks):**
- Phase 1 (Wk 1-2): Core Hub — trades, magic links, upload/categorize, 3 roles, approve/reject
- Phase 2 (Wk 3): Inbox + RFI — unified inbox, RFI reply, stale alerts
- Phase 3 (Wk 4-5): Email Ingestion — Mailgun setup, alias routing, attachment extraction
- Phase 4 (Wk 5-6): AI Layer — SOV guardrails, collection tracking, follow-up engine
- Phase 5 (Wk 6-7): Billing Integration — Hub → Pay App linking, reconciliation views
- Phase 6 (Wk 7-8): Cash Flow Intelligence — forecasting, AI dashboard, payer patterns
- Phase 7 (Wk 9-10): Polish — ZIP export, notifications tuning, mobile optimization, QA

**Competitive landscape:** Procore ($500+/mo), Autodesk Build ($$$), GCPay, Textura — ALL focus on outgoing billing. NONE solve the incoming document intake side. This is the gap.

---

### Module 9: Smart AI Agent (Enhanced Aria) — PRIORITY 9
**Status: 🟡 Partially designed, merging into Module 8 AI layer**

**Core concept:** Upgrade the existing Aria AI chat into a multi-capable agent. Now being designed as part of the Project Hub AI Cash Flow Intelligence layer (Module 8, Phase 4+6). The agent will handle product help, construction billing questions, collection tracking intelligence, cash flow forecasting, and SOV budget warnings.

**What the enhanced agent does:**
1. **Product Help** — answers "how do I..." questions about the app (merges with Module 4)
2. **Construction Billing Intelligence** — answers industry questions (retainage rules, lien deadlines by state, AIA form guidance)
3. **Collection Intelligence** — tracks who owes what, flags overdue, suggests follow-up actions
4. **Cash Flow Forecasting** — 30-day projections, gap warnings
5. **Knowledge Storage** — every question asked gets stored, categorized, and analyzed
6. **Admin Insights Feed** — aggregated question patterns surfaced to super admin dashboard
7. **Per-user context** — remembers user's projects, common workflows, and past questions

**Implementation:** Folded into Module 8 Phases 4 and 6. Standalone enhancements (admin insights, question categorization) remain as Module 9 post-Hub work.

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

#### ✅ Stripe Connect Payment Pipeline (`feature/stripe-connect`) — COMPLETED Apr 1 2026
- Owner pays contractor through platform via Stripe Checkout (ACH + card)
- Stripe Connect Express handles contractor KYC/onboarding
- ACH recommended for large amounts ($25 flat fee), card option with 3.3%+$0.40
- Fully working in test mode with test accounts (Mike Rodriguez, Sarah Chen)
- See "Stripe Connect — Payment Integration" section for full details

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
14. **Invoice details showed gross instead of net** — pay.html "View Invoice Details" dropdown showed $15,000 (gross work this period) instead of $13,500 (after 10% retainage). Fixed: added "Gross This Period", "Less Retainage", and "Net Amount Due" rows to the table footer. Server now returns `retainage_held` and `retainage_pct` in `/api/pay/:token` response.
15. **Payment link showed payment form after paying** — revisiting `/pay/:token` after completing payment showed the pay form again instead of "Fully Paid". Root cause: webhook updated `payment_status` to 'partial' (not 'paid') because `pay_apps.amount_due` was NULL. Fixed: (a) server now checks for existing pending/succeeded payments and returns `has_pending_payment: true` + `payment_status: 'processing'`, (b) pay.html now shows paid state for 'partial', 'processing', and `has_pending_payment`, (c) webhook now calculates totalDue from line items when `amount_due` is NULL.
16. **ACH payments never confirmed** — webhook was missing `checkout.session.async_payment_succeeded` event. ACH payments stayed as 'pending' forever because `checkout.session.completed` fires when session completes but ACH bank transfer takes 1-2 days. Fixed: added `async_payment_succeeded` and `async_payment_failed` to webhook events list and handler.
17. **Stripe Express accounts can't be API-onboarded** — tried to set `company`, `tos_acceptance` via API on Express accounts. Error: "This application does not have the required permissions". Fixed: use `type: 'custom'` with `business_type: 'individual'` for programmatic test account creation.
18. **Stripe company.phone rejected** — Custom accounts with `business_type: 'company'` kept rejecting phone number in every format. Fixed: switched to `business_type: 'individual'` which doesn't require company.phone.
19. **Reconciliation rounding mismatch** — floating point math caused $0.01 variance showing "Not Reconciled" (red). Fixed: changed threshold from exact 0 to < $0.02 for "Fully Reconciled" status.
20. **Intuit Developer portal SPA routing** — `developer.intuit.com` redirects `/dashboard`, `/myapps` back to `/homepage` when accessed via browser automation. The SPA client-side routing doesn't work in automation context. Must be navigated manually by Vagish.
21. **TrialProvider import crash (Rev 3)** — App.tsx imported TrialProvider from TrialContext but the file only re-exported hooks, not a Provider component. Fixed: removed TrialProvider dependency entirely — useTrial hook reads directly from AuthContext user object.
22. **Wrong upgrade API endpoint (Rev 3)** — UpgradeModal and trial.ts API client called `/api/subscription/checkout` but the actual backend route is `/api/trial/upgrade`. Fixed both files to use correct endpoint.
23. **Admin-extended routes UNPROTECTED (Rev 3 CRITICAL)** — All 6 admin-extended routes had zero auth middleware. Any unauthenticated user could extend trials, upgrade users, send emails. Fixed by adding `adminAuth` middleware to every route handler.
24. **SQL injection in extend-trial (Rev 3 CRITICAL)** — Used string interpolation `INTERVAL '${days} days'` for the days parameter. Fixed to parameterized `($1 || ' days')::INTERVAL`.
25. **logEvent import broken (Rev 3)** — admin-extended.js used `require('../../server').logEvent` which doesn't exist as an export. Fixed to `require('../lib/logEvent')` matching existing admin.js pattern.
26. **Trial routes had no auth middleware (Rev 3)** — server/app.js mounted trial router without any auth. POST /upgrade was accessible without login. Fixed with conditional middleware: POST gets full auth, GET tries auth but allows anonymous for /status.
27. **Existing user instant trial expiry (Rev 3 BUG)** — Backfill migration set `trial_end_date = created_at + 90 days` which would immediately expire users who registered months ago. Fixed to `NOW() + 90 days` to give all existing users a fresh 90-day trial from the deploy date.
28. **GuidedTour never rendered (Rev 3 GAP)** — GuidedTour component was built but never imported into Shell.tsx. Tour would never appear. Fixed by importing GuidedTour and useOnboarding into Shell.tsx and wiring them up.

---

## Stripe Connect — Payment Integration (added Mar 28 2026, updated Apr 1 2026)

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

### Webhook Events (9 total — must match REQUIRED_WEBHOOK_EVENTS in server.js)
- `checkout.session.completed` — Card payments confirmed immediately; ACH sessions complete but payment still processing
- `checkout.session.async_payment_succeeded` — ACH bank transfer cleared (1-2 business days after session)
- `checkout.session.async_payment_failed` — ACH bank transfer rejected
- `checkout.session.expired` — Checkout session timed out
- `invoice.paid` — Subscription invoice paid
- `invoice.payment_failed` — Subscription payment failed
- `customer.subscription.deleted` / `customer.subscription.updated` — Subscription lifecycle
- `payment_intent.payment_failed` — Generic payment failure

**Current staging webhook:** `we_1THPrlA9PDiZOpzDEhbgmFlk` → `https://construction-ai-billing-staging.up.railway.app/api/stripe/webhook`

### Server Routes (all in server.js)
- `POST /api/stripe/connect` — Start Connect Express onboarding
- `GET /api/stripe/account-status` — Check GC's connected account
- `POST /api/stripe/dashboard-link` — Generate Stripe Express dashboard link
- `POST /api/pay-apps/:id/payment-link` — Generate payment link for a pay app
- `GET /api/pay/:token` — Public: get pay app data for payment page (returns `retainage_held`, `retainage_pct`, `has_pending_payment`)
- `POST /api/pay/:token/checkout` — Create Stripe Checkout session (ACH or card)
- `POST /api/pay/:token/verify` — Verify payment on success redirect (fallback if webhook delayed)
- `POST /api/stripe/webhook` — Handle Stripe webhook events (9 event types)
- `GET /api/payments` — List GC's payments with summary stats
- `POST /api/pay-apps/:id/bad-debt` — Mark as uncollectable
- `POST /api/pay-apps/:id/undo-bad-debt` — Undo bad debt
- `GET /pay/:token` — Serve pay.html (public payment page)

### Admin Test Harness Routes (added Apr 1 2026)
All protected by `adminAuth` middleware. For creating realistic Stripe payment test scenarios.
- `POST /api/admin/test/create-test-gc` — Creates test user + Stripe Express account + onboarding link
- `POST /api/admin/test/complete-onboarding` — Creates Custom connected account with full API control (replaces Express for test mode)
- `POST /api/admin/test/create-test-payapp` — Creates project + 10 SOV lines + pay app with 30% progress + payment link
- `GET /api/admin/test/reconciliation` — Complete money flow report (all payments, balances, Stripe charges, subscriptions)
- `GET /api/admin/test/list-test-gcs` — Lists all test GC accounts with live Stripe status
- `POST /api/admin/test/cleanup` — Removes test users and deletes their Stripe accounts

### Test Accounts (staging, as of Apr 1 2026)
| User | Email | Company | Stripe Account | Status |
|------|-------|---------|---------------|--------|
| Mike Rodriguez | mike.rodriguez.test@constructinv.com | ABC General Contractors | acct_1THBQHAcdALyzl9F | Active, charges_enabled |
| Sarah Chen | sarah.chen.test@constructinv.com | Pacific Coast Builders | acct_1THBbqARAn2OPXl5 | Active, charges_enabled |
| Vagish (admin) | vnkapila@gmail.com | Varshyl Inc. | acct_1TGLGxAmFfzOG6zY | Active, charges_enabled |

**Test login password:** `TestPass123!` (for Mike and Sarah only)

### Test Payment Data (staging)
- **Elm Street Addition** ($50K contract) → Pay App $13,500 due → ACH payment succeeded, $13,475 in Mike's Stripe balance
- **Downtown Bathroom Remodel** ($42K) → Pay App $11,340 due → ACH payment processing
- **Oak Street Kitchen Renovation** ($85K) → Pay App $22,950 due → ACH payment processing

### Stripe Subscription (Pro Plan — Rev 3, Apr 6 2026)
- **Product:** `prod_UHoK09nnd940UV` — "ConstructInvoice AI Pro"
- **Price:** `price_1TJEhbA9PDiZOpzDJUZiWtd1` — $40/month recurring
- **Subscription webhook:** `we_1TJEhdA9PDiZOpzDveIZZHCA` — listens for `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`
- **Checkout flow:** `POST /api/trial/upgrade` → creates Stripe Checkout Session → redirects to Stripe → webhook confirms payment → updates `subscription_status` to 'active'
- **Railway env var needed:** `STRIPE_PRO_PRICE_ID=price_1TJEhbA9PDiZOpzDJUZiWtd1` (set on both staging and production)
- **Webhook secret:** `STRIPE_WEBHOOK_SECRET=whsec_...` (set on Railway — DO NOT commit the actual value here)

### Going Live Checklist
- [x] Stripe Connect payment flow working end-to-end in test mode
- [x] ACH and card payment flows verified with test accounts
- [x] Webhook handling all 9 event types (including ACH async)
- [x] Payment page shows correct state after payment (paid/processing)
- [x] Invoice details show retainage correctly
- [x] Test harness built for creating realistic payment scenarios
- [ ] Switch Stripe to live mode, get `sk_live_` and `pk_live_` keys
- [ ] Update Railway production env vars with live keys
- [ ] Create live webhook endpoint pointing to production URL
- [ ] Verify GC onboarding flow works end-to-end with real Stripe
- [ ] Test real ACH and card payment (use small amount)
- [ ] Confirm payouts to GC's bank account

---

## QuickBooks Online Integration (added Apr 6 2026)

### Status: UI WIRED + BACKEND BUILT, BLOCKED ON ENV VARS

The entire QuickBooks integration is built and committed to `main` but **non-functional** because the 5 required environment variables are not yet set on Railway production.

### Architecture
- **OAuth 2.0 flow**: User clicks "Connect to QuickBooks" in Settings → redirects to Intuit OAuth → callback saves encrypted tokens
- **Token encryption**: AES-256-GCM, tokens stored encrypted in `qb_connections` table
- **Token refresh**: Automatic refresh when access token expires (1 hour), refresh token lasts 100 days
- **Service layer**: `server/services/quickbooks.js` (687 lines) — handles all QB API calls
- **Routes**: `server/routes/quickbooks.js` (459 lines) — all QB endpoints

### Sync Paths
| Direction | What | How |
|-----------|------|-----|
| Push | Project → QB Customer | Creates/updates Customer in QBO |
| Push | Pay App → QB Invoice | Creates Invoice with line items from SOV |
| Push | Payment → QB Payment | Records payment against Invoice |
| Pull | QB Estimate → SOV | Imports estimate line items as Schedule of Values |

### Database Tables
- `qb_connections` — OAuth tokens (encrypted), company_id, realm_id per user
- `qb_sync_log` — Sync history with status, entity type, error messages
- `projects` additions: `qb_customer_id`, `qb_project_id`, `qb_sync_status`, `qb_last_synced_at`

### Frontend Components (all in `client/src/components/quickbooks/`)
- `QBConnectionCard.tsx` — OAuth connect/disconnect UI (in Settings page)
- `QBSyncLog.tsx` — Sync history table (in Settings page)
- `QBSyncButton.tsx` — Per-project sync button (in ProjectDetail page header)
- `QBEstimateImport.tsx` — Import QB estimates as SOV (in ProjectDetail SOV tab, shown when no SOV lines)

### API Routes
- `GET /api/quickbooks/auth-url` — Generate OAuth authorization URL
- `GET /api/quickbooks/callback` — OAuth callback (saves tokens)
- `GET /api/quickbooks/status` — Check connection status
- `POST /api/quickbooks/disconnect` — Disconnect QB
- `POST /api/quickbooks/sync/project/:id` — Sync project to QB
- `POST /api/quickbooks/sync/payapp/:id` — Sync pay app as QB Invoice
- `POST /api/quickbooks/sync/payment/:id` — Sync payment to QB
- `GET /api/quickbooks/estimates` — List QB estimates for import
- `POST /api/quickbooks/import-estimate` — Import estimate as SOV
- `GET /api/quickbooks/sync-log` — Get sync history

### Railway Environment Variables NEEDED (NOT YET SET)
| Variable | Value | Status |
|----------|-------|--------|
| `QB_CLIENT_ID` | *(get from Intuit Developer Portal → App → Keys & credentials)* | ❌ Not set |
| `QB_CLIENT_SECRET` | *(get from Intuit Developer Portal → App → Keys & credentials)* | ❌ Not set |
| `QB_REDIRECT_URI` | `https://constructinv.varshyl.com/api/quickbooks/callback` | ❌ Not set |
| `QB_SANDBOX` | `true` | ❌ Not set |
| `QB_ENCRYPTION_KEY` | `4ec2a6691499900c175b09b066eefd61f8c4a82d60c088925947a2bfe42aa497` | ❌ Not set |

### Setup Steps to Complete
1. **Get QB Client ID and Secret** — Go to developer.intuit.com → My Hub → App dashboard → your app → Keys & credentials → copy Client ID and Client Secret (Development/Sandbox section)
2. **Set redirect URI in Intuit app** — In the same Keys page, add redirect URI: `https://constructinv.varshyl.com/api/quickbooks/callback`
3. **Add all 5 env vars to Railway production** — Variables tab on Railway
4. **Wait for Railway deploy** — auto-deploys after env var change
5. **Test OAuth flow** — Settings → Connect to QuickBooks → authorize → verify connected state

### Intuit Developer Portal Note
The Intuit Developer portal (developer.intuit.com) has SPA routing that doesn't work well with browser automation — clicking "App dashboard" from My Hub redirects back to homepage. Vagish must navigate to the app dashboard manually in his own browser to get the Client ID and Client Secret.

---

## Project Boundaries — What NOT to Touch

- **Do NOT** modify the G702/G703 math formulas without running the full pay app test
- **Do NOT** remove the `_commaSetup` guard on `setupCommaInput`
- **Do NOT** change `parse_sov.py` for Excel files — Excel is handled by Node.js only
- **Do NOT** change the Railway/GitHub deploy setup — Vagish manages this
- **Do NOT** push to `main` without full staging test + explicit approval from Vagish
- **Do NOT** use display name format in Resend `from` field — plain email only
- **Do NOT** redirect to `/` or `/?` from server — always use `/app.html` or `/app.html?`
- **Do NOT** modify Stripe fee amounts (ACH $25, CC 3.3%+$0.40) without discussing with Vagish
- **Do NOT** switch Stripe from test mode to live mode without explicit approval from Vagish
- **Do NOT** make changes to email sending logic without discussing first (risk of spamming users)
- **Do NOT** use browser automation for Intuit Developer portal — `developer.intuit.com` SPA routing breaks in automation. Vagish must navigate manually.
- **Do NOT** use browser automation for Stripe — `dashboard.stripe.com` and `checkout.stripe.com` are blocked. ALL Stripe operations (creating products, webhook endpoints, checking account status, etc.) must be done via Stripe SDK, Stripe CLI, or direct API calls (`curl`) through the terminal. Vagish handles anything that requires the Stripe Dashboard UI manually in his own browser.

---

## Integrated Skills (always available)

The `.claude/skills/` directory contains permanently installed skills that enhance Claude's capabilities:

### UI/UX
- **ui-ux-pro-max** — Design intelligence: 57 UI styles, 95 color palettes, 56 font pairings, 24 chart types, 98 UX guidelines. Search with: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <domain>`

### Engineering (from Everything Claude Code)
- **ecc-frontend-patterns** — Frontend architecture, component patterns, state management
- **ecc-backend-patterns** — Express.js, middleware, error handling, API patterns
- **ecc-api-design** — RESTful API design, versioning, error responses
- **ecc-coding-standards** — Code quality, naming, formatting, documentation
- **ecc-security-review** — Security audit checklist, vulnerability scanning
- **ecc-design-system** — Design tokens, component library patterns
- **ecc-postgres-patterns** — PostgreSQL queries, indexing, migrations
- **ecc-tdd-workflow** — Test-driven development workflow

**Usage:** Claude reads the relevant SKILL.md files before making changes. No manual activation needed.

---

## Other Project Warning

The user also has a **Sleep Eyes** project in a **separate Cowork tab**.
If you see files or code unrelated to construction billing, you are in the wrong session.
Ask the user to confirm which project before making any changes.
