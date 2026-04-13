---
name: e2e-qa
description: >
  Full 8-layer QA test suite for all Varshyl products. ALWAYS use this skill — without
  exception — whenever Vagish says "run tests", "test this", "QA this", "test my product",
  "test my software", "what's broken", "write e2e tests", "write integration tests",
  "run playwright", "check if this works", "do QA", "regression test", "stress test",
  "find bugs", or ANY variation of testing, QA, or verification. Also triggers automatically
  after any major feature build. Covers construction-ai-billing, DocuFlow, SnapClaps,
  Sleepy Eyes, and any new product. Runs all 8 layers: architecture sanity, static QA,
  mutation watchdog, TypeScript check, Vite build, math unit tests, component unit tests
  (Vitest + MSW), E2E integration + contract tests. Never skip layers. Never ask which
  tests to run — just run them all.
---

# E2E QA — Full 8-Layer Test Suite

When Vagish says "test", "QA", "what's broken", "run tests", "regression", "stress test",
"find bugs", or anything about testing — **run all 8 layers below in order, every time**.
Never run just one layer. Never ask which tests to run. Just run them all and report results.

---

## THE 8 LAYERS (always run in this order)

| # | Layer | Command | Catches | Time |
|---|-------|---------|---------|------|
| 1 | Architecture sanity | `node tests/arch/arch-sanity.js` | Fix applied to wrong file; formulas missing from live routes | ~2s |
| 2 | Static QA | `node qa_test.js` | Pattern regressions, file integrity | ~3s |
| 3 | Mutation watchdog | `node tests/mutation/mutation-watchdog.js` | Blind spots in the test suite itself | ~30s |
| 4 | TypeScript | `cd client && npx tsc --noEmit` | Type errors that break silently | ~15s |
| 5 | Vite build | `cd client && npm run build` | Build failures before deploy | ~30s |
| 6 | Math unit tests | `npx playwright test tests/unit/ --reporter=list` | G702 formula correctness | ~10s |
| 7 | Component unit tests | `cd client && npm run test:unit` | React component crashes with bad API data; ErrorBoundary fires; Zod shape mismatches | ~15s |
| 8 | E2E + contracts | `TEST_BASE_URL=... npx playwright test tests/e2e/ --reporter=list` | API regressions, CO math, contract shapes, page smoke tests, 401 enforcement | ~45s |

**Total: ~2.5 minutes. Run all 8. No exceptions.**

---

## Quick Start — Construction AI Billing

```bash
cd /sessions/sharp-sleepy-carson/mnt/construction-ai-billing

# Layer 1
node tests/arch/arch-sanity.js

# Layer 2
node qa_test.js

# Layer 3
node tests/mutation/mutation-watchdog.js

# Layer 4
cd client && npx tsc --noEmit && cd ..

# Layer 5
cd client && npm run build && cd ..

# Layer 6
npx playwright test tests/unit/ --reporter=list

# Layer 7 — NEW: Component unit tests (Vitest + MSW)
cd client && npm run test:unit && cd ..

# Layer 8 — E2E + smoke + contract tests
TEST_BASE_URL=https://construction-ai-billing-staging.up.railway.app \
  npx playwright test tests/e2e/ --reporter=list
```

---

## Why Each Layer Exists

**Layer 1 — Architecture Sanity** (`tests/arch/arch-sanity.js`)
Catches "fixed the wrong file." In April 2026 a CO math fix was applied to `server.js`
but the live server uses `server/routes/payApps.js`. Invoices showed wrong amounts for
weeks. This layer reads `server/app.js`, finds which route files are actually mounted,
and verifies critical formulas exist in ALL of them. Run this first.

**Layer 2 — Static QA** (`qa_test.js`)
157 pattern checks: CO math in both `server.js` AND `server/routes/payApps.js`, void
filter on tCO (3x in each), retainage-release ternary, Step4/Step6 client math, logo
auth token, file size limits, two-file architecture.

**Layer 3 — Mutation Watchdog** (`tests/mutation/mutation-watchdog.js`)
Temporarily breaks critical formulas, runs qa_test.js, verifies the breaks are detected.
If a mutation passes qa_test.js, that formula is a blind spot — the test suite would not
catch that bug in production.

**Layer 4 — TypeScript** (`cd client && npx tsc --noEmit`)
A renamed API field causes `undefined` in JavaScript silently. TypeScript catches it at
compile time before it reaches users.

**Layer 5 — Vite Build** (`cd client && npm run build`)
Import errors and config issues that only appear at compile time. Failed build means
Railway deploys nothing.

**Layer 6 — Math Unit Tests** (`tests/unit/g702math.test.ts`)
13 pure G702 formula tests, no network: all 9 columns (A-I), CO math (added to H at full
value, no retainage on COs), voided CO exclusion, balance-to-finish, aggregates, edge cases.

**Layer 7 — Component Unit Tests** (`cd client && npm run test:unit`) — ADDED APR 2026
Vitest + MSW (Mock Service Worker) runs React components in a jsdom environment.
Catches post-data-load crashes that previous layers couldn't see:
- Components that crash when API returns unexpected shape (caught the `/admin` ErrorBoundary crash)
- Zod schema validation failures in safeValidate()
- Missing null checks that only surface after render
Files: `client/src/test/admin-crash.test.tsx`, `client/src/mocks/handlers.ts`
Infrastructure: `client/vitest.config.ts`, `client/src/test/setup.ts`, `client/src/lib/schemas.ts`

**Layer 8 — E2E + Contract Tests** (`tests/e2e/`)
- `construction-billing.spec.ts` (21 tests): Auth, projects, pay apps, settings, COs, reconciliation
- `co-math-crosslayer.spec.ts` (7 tests): Creates real project on staging, verifies H=$27,500 in server HTML/PDF
- `api-contract-crash.spec.ts` (10 tests): Strict API response shape validation — fails if field renamed before frontend breaks
- `page-smoke.spec.ts` (14 tests): Every public page returns 200, auth enforcement (401), response types

---

## Test File Map (Construction AI Billing)

```
client/
  src/
    lib/schemas.ts               <- Zod schemas for all API responses
    mocks/
      handlers.ts                <- MSW request handlers (mock API responses)
      server.ts                  <- MSW node server (for Vitest)
      browser.ts                 <- MSW browser worker (for manual testing)
    test/
      setup.ts                   <- Vitest global setup (MSW lifecycle)
      admin-crash.test.tsx       <- Layer 7 component crash tests
  vitest.config.ts               <- Vitest config (jsdom, globals, path alias)
tests/
  arch/arch-sanity.js            <- Layer 1 (32 checks)
  mutation/mutation-watchdog.js  <- Layer 3 (4 mutations)
  unit/g702math.test.ts          <- Layer 6 (13 tests)
  e2e/
    construction-billing.spec.ts <- Layer 8a (21 tests)
    co-math-crosslayer.spec.ts   <- Layer 8b (7 tests)
    api-contract-crash.spec.ts   <- Layer 8c (10 tests) — shared auth token, rate-limit safe
    page-smoke.spec.ts           <- Layer 8d (14 tests) — page health + auth enforcement
    test-sov.csv
qa_test.js                       <- Layer 2 (157 checks)
```

---

## When to Run Which Layers

| Situation | Layers |
|-----------|--------|
| "Run QA" / "What's broken?" / "Test this" | All 8 |
| After ANY code change | 1, 2, 3, 4, 5 |
| After G702/CO math change | All 8 |
| After adding a new route file | 1, 2, 3 |
| Before merging to main | All 8 |
| After client-only UI change | 4, 5, 6, 7 |
| After API response shape change | 7, 8 |

When in doubt: run all 8.

---

## Staging Test Accounts (Construction AI Billing)

| User | Email | Password |
|------|-------|----------|
| Mike Rodriguez | mike.rodriguez.test@constructinv.com | TestPass123! |
| Sarah Chen | sarah.chen.test@constructinv.com | TestPass123! |

Staging URL: https://construction-ai-billing-staging.up.railway.app

---

## Result Report Format

```
QA Report — Construction AI Billing — [Date]
=============================================
Layer 1  Architecture Sanity:   ✅ 32/32
Layer 2  Static QA:             ✅ 157/157
Layer 3  Mutation Watchdog:     ✅ 4/4 caught
Layer 4  TypeScript:            ✅ clean
Layer 5  Vite Build:            ✅ success
Layer 6  Math Unit Tests:       ✅ 13/13
Layer 7  Component Unit Tests:  ✅ 2/2
Layer 8a E2E Integration:       ✅ 21/21
Layer 8b CO Cross-Layer:        ✅ 7/7
Layer 8c API Contracts:         ✅ 10/10
Layer 8d Page Smoke:            ✅ 14/14
-----------------------------------------
TOTAL: 277 checks
```

If anything fails: do NOT push. Fix the root cause, re-run all 8, then push.

---

## QA Infrastructure — How It Works

### Zod Runtime Validation (`client/src/lib/schemas.ts`)
Every API response is now validated against a Zod schema at the boundary:
```typescript
import { safeValidate, ProjectSchema } from '@/lib/schemas'
const validated = safeValidate(ProjectSchema, res.data, 'getProject')
// validated is typed and safe to use — or null if shape is wrong
```
- In DEV: throws immediately on shape mismatch (crashes the page, you see it instantly)
- In PROD: returns null gracefully (component gets empty state, no ErrorBoundary fire)
The admin page crash (April 2026) was caused by exactly this — backend returned nested
`{ revenue: { avg_contract } }` but frontend expected flat `avg_contract_size`. Zod would
have caught it immediately in development.

### MSW (Mock Service Worker) (`client/src/mocks/`)
Intercepts network requests in Vitest component tests:
```typescript
// handlers.ts — control what the API returns in tests
rest.get('/api/admin/stats', (req, res, ctx) => res(ctx.json({ ... })))
```
Lets you test how components handle bad API data (null, wrong type, missing fields)
without needing a running server.

### Adding New Component Tests
Create files in `client/src/test/`:
```typescript
import { render, screen } from '@testing-library/react'
import { server } from '../mocks/server'
import { rest } from 'msw'
import { MyComponent } from '../components/MyComponent'

test('handles null API response without crashing', () => {
  server.use(rest.get('/api/thing', (req, res, ctx) => res(ctx.json(null))))
  render(<MyComponent />)
  expect(screen.queryByText('Error')).toBeNull()
})
```

---

## Adding Tests for New Features

1. `qa_test.js` — static pattern check for any new critical formula
2. `tests/unit/g702math.test.ts` — pure function test if feature involves math
3. `client/src/lib/schemas.ts` — add Zod schema for new API response
4. `client/src/mocks/handlers.ts` — add MSW handler for new endpoint
5. `client/src/test/*.test.tsx` — component crash test with bad mock data
6. `tests/e2e/construction-billing.spec.ts` — API integration test
7. `tests/e2e/api-contract-crash.spec.ts` — add new fields to contract shape
8. `tests/e2e/page-smoke.spec.ts` — add new page if added public route
9. `tests/mutation/mutation-watchdog.js` — add mutation + verify qa_test.js catches it

---

## CI Pipeline

Every push to `staging` or `main` triggers `.github/workflows/ci.yml`.
Required GitHub Secrets: `TEST_EMAIL`, `TEST_PASSWORD`, `STAGING_URL`.

---

## Common Failure Fix Map

| Failure | Cause | Fix |
|---------|-------|-----|
| Layer 1: formula missing in payApps.js | Fix applied to server.js (wrong file) | Apply fix to `server/routes/payApps.js` |
| Layer 2: tCO void filter count wrong | New route missing void filter | Add filter to new route |
| Layer 3: mutation not caught | qa_test.js missing check | Add check to qa_test.js |
| Layer 6: balance-to-finish wrong | g702math.ts changed | Revert or fix the math |
| Layer 7: component crash | API shape mismatch | Add Zod schema + fix the mapping |
| Layer 8b: H not $27,500 | CO math missing from HTML/PDF/email route | Add `+tCO` to `due` in payApps.js |
| Layer 8c: field missing | API field renamed/removed | Check recent backend changes |
| Layer 8c: 502 on tests | Railway mid-deploy during test run | Wait 2 min and re-run |
| Layer 8d: 401 not returned | Auth middleware missing from route | Add auth middleware |

---

## Other Products

| Product | Tests |
|---------|-------|
| SnapClaps | Manual: blog pages return 200, affiliate links present |
| DocuFlow | TBD — scaffold 7-layer suite when building |
| Sleepy Eyes | TBD — scaffold 7-layer suite when building |

When testing a new product, scaffold using this same 8-layer pattern.
Copy `client/src/lib/schemas.ts`, `client/src/mocks/`, `client/src/test/setup.ts`, and
`client/vitest.config.ts` as the baseline for any new React product.
