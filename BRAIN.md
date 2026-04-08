# Company Brain
> Last synced: April 6, 2026
> Owner: Vagish Kapila
> Tagline: AI-powered construction billing that keeps contractors cash-flow positive

## Company Overview
**Name**: Varshyl Inc
**Mission**: Build AI-powered tools that eliminate manual work and financial chaos in construction
**Stage**: Launched (ConstructInvoice AI live with real users)
**Founded**: Pre-2026
**Other entities**: Sentio Development Inc (general contracting), DocuFlow (document editing/signing)

## Products & Services

### ConstructInvoice AI (Primary Product)
- **Status**: Launched — live at constructinv.varshyl.com
- **Description**: G702/G703 construction billing platform for GCs and subs. Upload SOV, generate pay apps, download PDFs, send invoices, accept payments.
- **Key Features**: SOV parsing (Excel/CSV/PDF/DOCX), G702/G703 PDF generation, Stripe Connect payments (ACH + card), lien waivers, email send, admin dashboard, AI assistant, QuickBooks integration (built, pending env vars), reconciliation, job completed tracking
- **Stack**: React 19 + TypeScript + Vite 6, Node.js + Express, PostgreSQL on Railway, PDFKit, Stripe Connect, Resend email
- **Users**: Live with real users (contractors, PMs, accountants)
- **Hosting**: Railway (auto-deploy from GitHub), constructinv.varshyl.com via IONOS DNS
- **Revenue model**: $64/month Pro plan (updated from $40), 90-day free trial, no credit card at signup
- **Stripe**: Product `prod_UHoK09nnd940UV`, test mode active

### ConstructInvoice AI — Project Hub (Exp1_ConstructInv3)
- **Status**: PRD Complete (v2.1), ready for implementation
- **Description**: Project Hub eliminates the "email black hole" in construction. Per-project document intake from subs/vendors with magic links, email aliases, approval workflows, and AI cash flow intelligence. Fully integrated with existing billing engine.
- **Key Features (V1)**: Trade management, magic link invites, email aliases (hub.constructinv.com), document upload/categorize, unified inbox, 3 fixed roles, approve/reject/comment, RFI reply, stale alerts (2/5/7 day), AI SOV guardrails, ZIP export, notifications
- **AI Layer**: Collection tracking + follow-up (P0), cash flow forecasting (P1), SOV budget guardian (P2)
- **Email Ingestion**: Mailgun Routes on hub.constructinv.com (~$35/month)
- **Timeline**: 7 phases, ~10 weeks
- **PRD**: `Exp1_ConstructInv3_Project_Hub_PRD.docx`
- **Competitive gap**: Procore/Autodesk/GCPay all focus on outgoing billing — NONE solve incoming document intake

### DocuFlow
- **Status**: In development
- **Description**: Document editing and signing platform
- **Stripe account**: `acct_1TG786AsCE0yP645` (separate from ConstructInvoice AI)

### Sleepy Eyes
- **Status**: In development
- **Description**: Sleep monitoring PWA (snore detection, sleep scoring, AI reports, coins economy)
- **Stack**: React 18 + Vite, Node/Express, PostgreSQL, Claude Haiku API

### SnapClaps (Travel Side Hustle)
- **Status**: Launched — live at snapclaps.com
- **Description**: Travel deals brand under Varshyl Inc. Error fares, luxury deals, honeymoon packages.
- **Tagline**: OopsLuxEscapes — "Luxury escapes at oops prices"
- **Revenue**: 5-layer stack (affiliate marketing, travel advisor, group trips, digital products, luxury referrals)
- **Hosting**: IONOS Webhosting
- **Social**: @oopsluxescapes on Instagram + TikTok

## Team & Roles
| Name | Role | Focus Area | Started |
|------|------|------------|---------|
| Vagish Kapila | Founder/CEO | Everything — product, code, strategy, content | Day 1 |

## Strategy & Direction

### Current Priorities
1. **Merge Rev 3 to main** — 7 modules built (trial, admin, onboarding, AI, reports, nudges, QA), ready to push
2. **Build Project Hub (Exp1_ConstructInv3)** — the integrated ecosystem that makes ConstructInvoice AI a complete platform
3. **Set QuickBooks env vars** — QB integration is fully built, just needs Client ID/Secret on Railway
4. **Go live with Stripe** — Switch from test mode to live mode for real payments
5. **SnapClaps content engine** — daily deal posts, blog SEO, affiliate program approvals

### Key Decisions Log
| Date | Decision | Context |
|------|----------|---------|
| Apr 6, 2026 | Pro pricing increased to $64/month (from $40) | Project Hub adds significant value; competitive pricing still well below Procore ($500+) |
| Apr 6, 2026 | Project Hub uses 3 fixed roles: Office/Accountant, PM/PMCM, Superintendent | Simplicity over configurability; doc type determines routing automatically |
| Apr 6, 2026 | Email aliases format: {trade}-{address-slug}@hub.constructinv.com | Address-based because construction projects are always address-based |
| Apr 6, 2026 | Email ingestion: Hostinger catch-all + Cloudflare Email Workers (FREE) instead of Mailgun ($35/mo) | Early-stage decision — migrate to Mailgun when user base reaches ~100-200 users. See Infrastructure Decisions section. |
| Apr 6, 2026 | AI focus: Collection tracking + follow-up is P0 | Keep contractors cash-flow positive; pattern detection for slow payers |
| Apr 6, 2026 | Hub → Billing: V1 = auto-link + manual reconcile; V2 = AI auto-fill | Start simple, add intelligence as usage grows |
| Apr 6, 2026 | Payment flexibility: Stripe AND manual check payments | Let clients decide; most construction companies still write checks |
| Apr 6, 2026 | RFI replies: simple text + attachment (works on phone) | Field guys need to reply from their phone with one thumb |
| Apr 6, 2026 | Stale alerts: 2-day warning → 5-day escalation → 7-day urgent | In-app card + email; prevents docs from sitting unreviewed |
| Apr 6, 2026 | AI SOV guardrails: warn-only mode | Don't block subs from uploading; just alert the client |
| Apr 1, 2026 | Stripe Connect payment pipeline completed | ACH + card via Checkout, Express onboarding, test accounts working |
| Apr 1, 2026 | ACH $25 flat fee, CC 3.3% + $0.40 | Zero absorption — platform keeps application_fee |

### What We're NOT Doing (and why)
- NOT building a full accounting system — QB handles that, we sync to it
- NOT building mobile native apps yet — PWA-first, mobile-responsive web
- NOT using SMS/WhatsApp for V1 — email + in-app notifications first, SMS later via Twilio
- NOT auto-blocking subs when SOV budget exceeded — warn only
- NOT complex role configuration — 3 fixed roles, no custom permissions
- NOT replacing pay app workflow with Hub — Hub is intake, billing engine is output

## Tech Stack & Tools

### Core Stack
- **Frontend**: React 19 + TypeScript + Vite 6 + Tailwind CSS v4 + shadcn/ui
- **Backend**: Node.js + Express
- **Database**: PostgreSQL on Railway
- **Hosting**: Railway (auto-deploy from GitHub)
- **Payments**: Stripe Connect Express (ACH + card)
- **Email (outbound)**: Resend API (billing@varshyl.com)
- **Email (inbound, Phase 3)**: Hostinger catch-all + Cloudflare Email Workers → Railway webhook (FREE — see Infrastructure Decisions)
- **Accounting sync**: QuickBooks Online OAuth 2.0 (built, pending activation)
- **PDF generation**: PDFKit (server-side)
- **SOV parsing**: XLSX.js (Node) + Python parse_sov.py (PDF/DOCX)
- **Auth**: JWT + bcrypt + Google OAuth + email verification

### Animation/3D Stack (Rev 3)
- Remotion + @remotion/player (animated marketing videos)
- Framer Motion (3D UI animations, page transitions)
- Three.js + @react-three/fiber + @react-three/drei (3D scenes)
- Recharts (data visualization)

### Tools & Services
- Railway (hosting, PostgreSQL, volumes)
- GitHub (VagishKapila/construction-ai-billing)
- IONOS (DNS for constructinv.varshyl.com, hosting for snapclaps.com)
- Hostinger (Business plan — varshylinc.com WordPress, Starter Business Email @varshylinc.com 5 mailboxes)
- Stripe (payments + subscriptions)
- Resend (transactional email)
- HeyGen (AI avatar videos)
- ElevenLabs (AI voiceover)
- Buffer / TikTok Studio (social media posting)

## Processes & Workflows

### Development Workflow
- ALL new features → `staging` branch → test on staging env → merge to `main`
- Run `node qa_test.js` (109/109 tests) before any push
- Claude handles all git commits and pushes — Vagish never pushes manually
- Railway auto-deploys from GitHub

### Video Factory Pipeline (Varshyl marketing)
1. Script (testimonial/hook, <840 chars for HeyGen)
2. Voice (ElevenLabs, Roger voice)
3. Avatar (HeyGen, Avatar III)
4. Compose (ffmpeg mux)
5. Post (TikTok/Buffer)

## Key Metrics & Goals
- **Trial → Pro conversion**: Track after Rev 3 launches
- **MRR target**: TBD (at $64/mo, 100 users = $6,400 MRR)
- **Project Hub adoption**: Measure trades created, uploads per project, email ingestion usage
- **AI collection effectiveness**: Track on-time payment rate improvement
- **SnapClaps**: Affiliate commission revenue, follower growth, content output (6-8 posts/day target)

## Partnerships & Integrations
- **Stripe Connect**: Live (test mode) — ACH + card payments between owners and contractors
- **QuickBooks Online**: Built, pending activation (needs env vars on Railway)
- **Cloudflare Email Workers**: Planned for Project Hub email ingestion Phase 3 (replaces Mailgun until scale justifies it)
- **Fora/InteleTravel**: Planned for SnapClaps travel advisor revenue
- **Affiliate networks**: CJ (active), Villiers Jets (active), Travelpayouts (25 programs declined, reapplying after blog content)

## Infrastructure Decisions

### Project Hub Email Ingestion — Hostinger → Mailgun Migration Path

**Decision date:** April 6, 2026
**Status:** Phase 3 (not yet built) — current implementation uses magic links only

---

#### What we decided and why

The original PRD called for Mailgun Routes on `hub.constructinv.com` at ~$35/month. After reviewing Vagish's existing Hostinger Business plan (which includes email hosting for `@varshylinc.com`), we chose a **free alternative** for the early-stage launch:

**Current plan (0 → ~100-200 users): Hostinger + Cloudflare Email Workers = $0/month**
- Add `hub.constructinv.com` as a domain on the existing Hostinger Business email plan
- Set a catch-all rule: `*@hub.constructinv.com` → Cloudflare Email Worker (free tier, unlimited routing)
- Cloudflare Worker forwards the parsed email + attachments to `POST /api/hub/inbound-email` on Railway
- Our inbound handler parses the trade + project from the alias (`plumbing-123elm@hub.constructinv.com`), extracts attachments, creates a `hub_upload` record with `source: 'email_ingest'`

**Why it works at small scale:** Cloudflare Email Workers free tier handles up to 100 messages/day — more than enough for early users. Hostinger Business plan already paid for.

---

#### When to switch to Mailgun (migration trigger)

Switch when ANY of these are true:
- **100+ active users** regularly using email ingestion
- Hitting Cloudflare's 100 messages/day free tier limit
- Need webhook retry logic, bounce handling, or spam filtering at scale
- Deliverability issues (Mailgun has enterprise-grade IP reputation)

**Migration is a 1-day job — no code changes needed, just infrastructure:**

1. **Create Mailgun account** → add `hub.constructinv.com` domain → verify DNS
2. **Update DNS on IONOS**: swap the MX records from Hostinger → Mailgun mail servers
3. **Create Mailgun catch-all route**: `match_recipient(".*@hub.constructinv.com")` → forward to `POST /api/hub/inbound-email`
4. **Add Railway env var**: `MAILGUN_SIGNING_KEY` for webhook signature verification
5. **Update inbound handler** in `server/routes/hub.js`: change signature verification from Cloudflare to Mailgun format (15 min of code)
6. **Test**: Send a test email to any alias → confirm it hits the inbox

That's it. The rest of the system (DB, API, frontend) doesn't change at all. The `source: 'email_ingest'` flag in `hub_uploads` already tracks where docs came from.

---

#### Inbound email handler location
`server/routes/hub.js` → `POST /api/hub/inbound-email` (to be built in Phase 3)

#### Email alias format (unchanged regardless of provider)
`{trade-slug}-{project-id}@hub.constructinv.com`
Example: `plumbing-123@hub.constructinv.com`

#### Hostinger account details
- Plan: Business
- Email plan: Starter Business Email Free Trial (expires 2027-03-09, auto-renewal ON)
- Current domain: `@varshylinc.com`, 1/5 mailboxes used
- `varshylinc.com` domain is registered at another provider (not Hostinger)
- hPanel: hpanel.hostinger.com

---

## QA & Testing Standards — 7-Layer Test Suite

**Installed: April 7, 2026. ALWAYS run all 7 layers before any push.**

When Vagish says "test", "QA", "what's broken", "run tests", "regression", "stress test", "find bugs", "check if this works", or any testing phrase — run ALL 7 layers in order. No exceptions. No skipping.

### The 7 Layers

| # | Layer | Command | What It Catches | Time |
|---|-------|---------|-----------------|------|
| 1 | Architecture Sanity | `node tests/arch/arch-sanity.js` | Fix applied to wrong file; formulas missing from live route files | ~2s |
| 2 | Static QA | `node qa_test.js` | 121 pattern checks; CO math in BOTH server.js AND payApps.js | ~3s |
| 3 | Mutation Watchdog | `node tests/mutation/mutation-watchdog.js` | Blind spots in qa_test.js itself (if it doesn't catch a formula break, that's a bug) | ~30s |
| 4 | TypeScript | `cd client && npx tsc --noEmit` | Type errors that fail silently in JavaScript | ~15s |
| 5 | Vite Build | `cd client && npm run build` | Build failures — if this fails, Railway deploys nothing | ~30s |
| 6 | Math Unit Tests | `npx playwright test tests/unit/ --reporter=list` | 13 G702 formula correctness tests — pure math, no network | ~10s |
| 7 | E2E + Contracts | `TEST_BASE_URL=https://construction-ai-billing-staging.up.railway.app npx playwright test tests/e2e/ --reporter=list` | API regressions, CO math cross-layer, contract shapes | ~30s |

**Total: ~2 minutes. Run all 7 every time.**

### Test File Locations

```
construction-ai-billing/
├── tests/
│   ├── arch/arch-sanity.js              ← Layer 1: reads server/app.js, verifies formulas in live routes
│   ├── mutation/mutation-watchdog.js    ← Layer 3: breaks formulas, confirms qa_test.js catches them
│   ├── unit/g702math.test.ts            ← Layer 6: 13 pure G702 formula tests
│   └── e2e/
│       ├── construction-billing.spec.ts ← Layer 7a: 21 auth/CRUD/PDF/email tests
│       ├── co-math-crosslayer.spec.ts   ← Layer 7b: 7 cross-layer CO math tests (H=$27,500 target)
│       ├── api-contracts.spec.ts        ← Layer 7c: 9 API shape contract tests
│       └── test-sov.csv                 ← Test SOV (5 lines, $65k total)
├── qa_test.js                           ← Layer 2: 121 static checks (MODULE 7C added Apr 7)
└── .github/workflows/ci.yml            ← CI pipeline: all 7 layers on every push to staging/main
```

### Why Each Layer Exists

**Layer 1 — Architecture Sanity**: Catches "fixed the wrong file." In April 2026, a CO math fix was applied to `server.js` but the live server uses `server/routes/payApps.js`. Invoices showed wrong amounts. This layer reads `server/app.js`, finds which route files are mounted, and verifies critical formulas exist in ALL of them.

**Layer 2 — Static QA**: 121 pattern checks. After the wrong-file bug, MODULE 7C was added to check `server/routes/payApps.js` specifically: void filter on tCO (3×), `+tCO` in due formula (3×), retainage-release ternary (3×).

**Layer 3 — Mutation Watchdog**: Breaks 4 critical formulas, runs qa_test.js, verifies the breaks ARE detected. If a mutation passes qa_test.js, that formula is a blind spot — the test suite would not catch that bug in production. First run in April 2026 caught 3/4 blind spots, prompting MODULE 7C.

**Layer 6 — Math Unit Tests**: 13 pure G702 tests covering all 9 columns (A-I), CO math, voided CO exclusion, balance-to-finish, edge cases. No network. Fast.

**Layer 7b — CO Cross-Layer**: Creates real project on staging, verifies H=$27,500 in server HTML/PDF/email. Proves the CO math is consistent across all 3 generation routes.

**Layer 7c — API Contracts**: Records which fields must exist in API responses. Fails if a field is renamed (e.g., `amount_due` → `amountDue`) BEFORE the frontend silently breaks.

### The "Fixed the Wrong File" Bug Class

**Root cause discovered April 7, 2026:** The codebase has two server files:
- `server.js` — legacy monolithic file, NOT what runs in production
- `server/routes/payApps.js` — the ACTUAL live route file, loaded via `server/app.js`

Any fix applied to `server.js` alone will NOT affect production. ALWAYS check `server/app.js` to see which files are actually mounted, and apply fixes to those files. The architecture sanity test (Layer 1) enforces this automatically.

### CI Pipeline

Every push to `staging` or `main` triggers `.github/workflows/ci.yml`:
- `static` job: Layers 1 + 2 + 3 (fast, no network)
- `build` job: Layers 4 + 5 (TypeScript + Vite)
- `unit` job: Layer 6 (G702 math)
- `e2e` job: Layer 7 (only on push, not PRs — polls staging until healthy)

Required GitHub Secrets: `TEST_EMAIL`, `TEST_PASSWORD`, `STAGING_URL`

### Staging Test Accounts

| User | Email | Password |
|------|-------|----------|
| Mike Rodriguez | mike.rodriguez.test@constructinv.com | TestPass123! |
| Sarah Chen | sarah.chen.test@constructinv.com | TestPass123! |

Staging URL: `https://construction-ai-billing-staging.up.railway.app`

### Quick Start (run all 7 layers)

```bash
cd /sessions/sharp-sleepy-carson/mnt/construction-ai-billing

node tests/arch/arch-sanity.js
node qa_test.js
node tests/mutation/mutation-watchdog.js
cd client && npx tsc --noEmit && cd ..
cd client && npm run build && cd ..
npx playwright test tests/unit/ --reporter=list
TEST_BASE_URL=https://construction-ai-billing-staging.up.railway.app \
  npx playwright test tests/e2e/ --reporter=list
```

### Report Format

```
QA Report — Construction AI Billing — [Date]
=============================================
Layer 1  Architecture Sanity:   ✅/❌  X/32
Layer 2  Static QA:             ✅/❌  X/121
Layer 3  Mutation Watchdog:     ✅/❌  X/4 caught
Layer 4  TypeScript:            ✅/❌
Layer 5  Vite Build:            ✅/❌
Layer 6  Math Unit Tests:       ✅/❌  X/13
Layer 7a E2E Integration:       ✅/❌  X/21
Layer 7b CO Cross-Layer:        ✅/❌  X/7
Layer 7c API Contracts:         ✅/❌  X/9
-----------------------------------------
TOTAL: 207 checks
```

---

## Notes & Ideas (parking lot)
- Switch Stripe to live mode (needs Vagish approval)
- Create $64/month Stripe Price on prod_UHoK09nnd940UV
- Subcontractor recursive ecosystem (subs can create branches for THEIR vendors) — V2
- SignNow integration for e-signatures on lien releases — future
- Playwright E2E browser tests — Module 7 Phase B
- Payment follow-up emails + "Mark as Paid" cron job — approved, not yet built
- Net 30 as default payment terms — approved, not yet built

## Version History
| Date | Changes | Summary |
|------|---------|---------|
| Apr 6, 2026 | Initial Brain creation | Created from ConstructInvoice AI project context + Exp1_ConstructInv3 Project Hub PRD session. Captured all product state, tech stack, decisions, and strategy. |
| Apr 6, 2026 | Infrastructure decision: email ingestion | Replaced Mailgun plan with Hostinger + Cloudflare Email Workers (free). Full migration path to Mailgun documented for when user base hits 100-200 users. |
| Apr 6, 2026 | Project Hub Phase 1 shipped to staging | Full backend (18 endpoints, 5 DB tables) + frontend (Hub tab, DocDetail, Trades, MagicLink) pushed to staging branch. |
| Apr 7, 2026 | 7-Layer QA test suite built + installed | Architecture sanity (32 checks), mutation watchdog (4 mutations), API contract tests (9 tests), CO cross-layer tests rewritten (7 tests). qa_test.js expanded to 121 checks (MODULE 7C). GitHub Actions CI wired. Discovered + fixed "fixed the wrong file" bug: CO math was in server.js only, not live payApps.js. All 207 checks passing. e2e-qa skill updated to trigger on all test/QA phrases. |
