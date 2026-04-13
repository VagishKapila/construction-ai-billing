# Session Starter Prompt — Existing Product
# Paste this at the start of any Cowork session for an existing product

---

You are working on a production Varshyl Inc product. Read and follow all active rules below before doing anything.

## Product Context
- **Varshyl Inc** — parent company. Active products: Construction AI Billing, DocuFlow, Sleepy Eyes, SnapClaps
- **Sentio Development Inc** — general contracting company
- Always read the project's CLAUDE.md and BRAIN.md before touching any code
- **Product is LIVE with real users** — treat every change as production risk

## Default Stack (always)
- React 19 + TypeScript + Vite 6 + Tailwind CSS v4 + shadcn/ui
- Node.js + Express + PostgreSQL
- Framer Motion + Three.js + Remotion for animations/3D
- Zod for runtime API validation (`client/src/lib/schemas.ts`)
- MSW (Mock Service Worker) for component tests
- Vitest for unit tests, Playwright for E2E

## Tools — Use Without Asking
- **Magic (21st.dev MCP)** — all React components
- **Stitch (Google)** — UI wireframes and layout planning
- **Nano Banana 2** — all images and illustrations (never use placeholders)
- **ECC Zenith skill** — every backend change, no exceptions
- **UI/UX Pro Max skill** — every frontend change, no exceptions

## Workflow — Every Time
1. Read CLAUDE.md + BRAIN.md
2. `brainstorming` skill → `writing-plans` skill before any code
3. Parallel agents for any multi-layer task (backend agent + frontend agent + QA agent)
4. Feature flag OFF while building
5. All work to `staging` branch first, then `main` after QA passes

## 8-Layer QA — Run ALL 8 Before Any Push

```bash
# Run from project root (e.g. /path/to/construction-ai-billing)

node tests/arch/arch-sanity.js                                    # Layer 1
node qa_test.js                                                   # Layer 2
node tests/mutation/mutation-watchdog.js                          # Layer 3
cd client && npx tsc --noEmit && cd ..                           # Layer 4
cd client && npm run build && cd ..                               # Layer 5
npx playwright test tests/unit/ --reporter=list                   # Layer 6
cd client && npm run test:unit && cd ..                           # Layer 7 — Vitest + MSW
TEST_BASE_URL=https://[staging-url] \
  npx playwright test tests/e2e/ --reporter=list                  # Layer 8
```

**Never push if any layer fails.** Fix root cause, re-run all 8.

### What Each Layer Catches
| Layer | What it catches |
|-------|----------------|
| 1 — Arch sanity | Fix applied to wrong file (happened April 2026 — invoices wrong for weeks) |
| 2 — Static QA | Pattern regressions, formula presence, file integrity |
| 3 — Mutation watchdog | Blind spots in the test suite itself |
| 4 — TypeScript | Renamed API fields that break silently at runtime |
| 5 — Vite build | Import errors only visible at compile time |
| 6 — Math unit tests | G702 formula correctness (13 pure function tests) |
| 7 — Component tests | React crashes with bad API data; ErrorBoundary fires (caught admin crash April 2026) |
| 8 — E2E + contracts | API regressions, CO math, page smoke tests, 401 enforcement |

### New QA Infrastructure (added April 2026)
- **`client/src/lib/schemas.ts`** — Zod schemas for all API responses. Use `safeValidate()` for any new API call
- **`client/src/mocks/handlers.ts`** — MSW handlers. Add a handler for every new endpoint
- **`client/src/test/`** — Vitest component tests. Add a crash test for every new major component
- **`tests/e2e/page-smoke.spec.ts`** — 14 smoke tests. Add new pages when routes are added
- **`tests/e2e/api-contract-crash.spec.ts`** — 10 contract tests. Add new endpoint shapes when APIs change
- When adding a new API endpoint: add Zod schema → MSW handler → component crash test → contract test

## Branch Rules
- All work → `staging` branch first
- Test on staging env → pass all 8 QA layers → merge to `main`
- Hotfixes only go directly to `main`
- Claude pushes to GitHub (explicitly authorized by Vagish)

## What NEVER Changes Without Discussion
- G702/G703 math formulas (13 unit tests protect them)
- Stripe fee amounts ($25 ACH, 3.3%+$0.40 CC, 1.5% early pay)
- `sk_live_` keys — never switch to test mode
- Email sending logic (risk of spamming real users)

## Role Language
- Never "GC" → always "Contractor"
- Blue theme = Contractor, Orange theme = Vendor/Sub

## After Every Session
Always run `brainsync` skill to update BRAIN.md with decisions made this session.
