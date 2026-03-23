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
│   ├── varshyl-logo.png        ← ConstructInvoice AI logo (white bg, 35KB, 400×266px)
│   └── constructinvoice-logo.png  ← Same logo, alternate filename (35KB)
├── qa_test.js         ← Run with `node qa_test.js` — 57 tests, must all pass
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
3. **Run `node qa_test.js` (57/57) before flagging any change as ready to push**
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
- After any code change, run `node qa_test.js` — must be 57/57 before pushing

### Current Branch Status (updated Mar 23 2026)
- `main` = production — has all fixes through Google OAuth, password reset, admin dashboard, revenue charts, logo fixes, pricing page updates
- `staging` = same as main (all recent changes committed and pushed)
- `feature/followup` = NOT CREATED YET — planned next sprint

---

## Pending Features (approved, not built yet)

### 1. Net 30 as default payment terms (tiny, safe)
- Change hardcoded fallback from `"Due on receipt"` to `"Net 30"` in server.js and app.html
- DB migration to update existing users who never changed it
- Branch: can go directly to staging

### 2. Payment follow-up emails + "Mark as Paid" (`feature/followup`)
Full design agreed:
- Daily cron job checks submitted pay apps where `payment_due_date` is approaching/past
- Sends follow-up to owner email (from pay app), CC contractor
- Same run sends contractor a "Did you get paid?" email with Yes/No magic links
- Yes → marks pay app as `paid`, cancels all future follow-ups
- No → follow-up schedule continues
- Follow-up schedule: Net 7 → day 5; Net 15 → day 9 + day 16; Net 30 → day 23 + day 37
- New DB table: `followup_log` (tracks what was sent, when, to whom — prevents duplicates)
- New pay app status: `paid` / `payment_received`
- Branch: `feature/followup` → staging only, never main until fully tested

### 3. Stripe $129/month subscription (`feature/stripe`)
- Simple Stripe Checkout — "Support Us" button on pricing page and in app settings
- NOT a hard paywall — app stays free, this is voluntary support
- Branch: `feature/stripe` — discuss timing with Vagish before building

### 4. Stripe Connect payment pipeline (`feature/stripe-connect`)
- Escrow model: owner pays contractor through platform, platform takes fee
- Stripe Connect handles contractor KYC/onboarding (not us)
- ACH preferred for large amounts (0.8% capped at $5 vs 2.9% for cards)
- Major feature — 2-3 week build minimum
- DO NOT START until explicitly approved and scoped

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

## Project Boundaries — What NOT to Touch

- **Do NOT** modify the G702/G703 math formulas without running the full pay app test
- **Do NOT** remove the `_commaSetup` guard on `setupCommaInput`
- **Do NOT** change `parse_sov.py` for Excel files — Excel is handled by Node.js only
- **Do NOT** change the Railway/GitHub deploy setup — Vagish manages this
- **Do NOT** push to GitHub — Vagish does this via GitHub Desktop
- **Do NOT** use display name format in Resend `from` field — plain email only
- **Do NOT** redirect to `/` or `/?` from server — always use `/app.html` or `/app.html?`
- **Do NOT** start any payment/Stripe/escrow work without explicit approval from Vagish
- **Do NOT** make changes to email sending logic without discussing first (risk of spamming users)

---

## Other Project Warning

The user also has a **Sleep Eyes** project in a **separate Cowork tab**.
If you see files or code unrelated to construction billing, you are in the wrong session.
Ask the user to confirm which project before making any changes.
