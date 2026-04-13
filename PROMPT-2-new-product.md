# Session Starter Prompt — New Product
# Paste this at the start of any Cowork session when starting a brand new product

---

You are starting a new product for Varshyl Inc. Follow the setup checklist and build standards below before writing any code.

## Company Context
- **Varshyl Inc** — parent company. Existing products: Construction AI Billing, DocuFlow, Sleepy Eyes, SnapClaps
- **Sentio Development Inc** — general contracting company
- All new products follow the same stack, QA standards, and build workflow

## Default Stack (always — no exceptions)
- React 19 + TypeScript + Vite 6 + Tailwind CSS v4 + shadcn/ui
- Node.js + Express + PostgreSQL (Railway)
- Framer Motion + Three.js for animations
- Zod for runtime API validation
- MSW (Mock Service Worker) + Vitest for component tests
- Playwright for E2E tests

## Tools — Use Without Asking
- **Magic (21st.dev MCP)** — all React components (navbars, dashboards, forms, cards, modals)
- **Stitch (Google)** — UI wireframes first, then build with Magic
- **Nano Banana 2** — all images, illustrations, icons (never placeholders)
- **ECC Zenith skill** — every backend route/service/DB design
- **UI/UX Pro Max skill** — every frontend layout/component/color decision

## New Product Setup Checklist

### Step 1 — Architecture & Planning
```bash
# Run skills in order:
# 1. brainstorming skill — understand what we're really building
# 2. product-management:write-spec — turn it into a PRD
# 3. plan-eng-review — architecture review before any code
# 4. writing-plans — implementation plan
```

### Step 2 — Project Scaffold
```bash
# Create Railway project (staging + production environments)
# Create GitHub repo under VagishKapila organization
# Set up auto-deploy: staging branch → staging env, main branch → production

mkdir my-new-product && cd my-new-product
git init
npm init -y

# Client scaffold
npm create vite@latest client -- --template react-ts
cd client
npm install zod framer-motion @radix-ui/react-* lucide-react tailwind-merge
npm install -D vitest @vitest/browser jsdom msw @testing-library/react @testing-library/jest-dom @testing-library/user-event

# Add test scripts to client/package.json:
# "test:unit": "vitest run"
# "test:unit:watch": "vitest"
```

### Step 3 — QA Infrastructure (copy from construction-ai-billing)
```bash
# Copy these files as baseline for any new React product:
cp -r construction-ai-billing/client/src/lib/schemas.ts new-product/client/src/lib/
cp -r construction-ai-billing/client/src/mocks/ new-product/client/src/mocks/
cp -r construction-ai-billing/client/src/test/setup.ts new-product/client/src/test/
cp construction-ai-billing/client/vitest.config.ts new-product/client/

# Initialize MSW service worker
cd new-product/client && npx msw init public/ && cd ../..

# Copy QA scaffold
node ~/varshyl-qa-scaffold/init.js /path/to/new-product
```

### Step 4 — Database & Backend
```bash
# Create db.js with schema and ALTER TABLE migrations (runs on startup)
# Create server/app.js as Express entry point
# Create server/routes/ directory
# Create server/features/flags.js with all feature flags OFF by default
# Create server/middleware/auth.js (JWT + adminAuth)
# Create server/middleware/rateLimiter.js (auth 20/15min, pay 10/1min, api 200/1min)
# Create server/utils/logger.js (Pino structured logging)
```

### Step 5 — Zod + MSW Setup for New Product
```typescript
// client/src/lib/schemas.ts — define schemas for all API responses
import { z } from 'zod'

export const UserSchema = z.object({ id: z.number(), email: z.string() })
export const MyEntitySchema = z.object({ /* your fields */ })

// safeValidate: throws in DEV (immediate feedback), returns null in PROD (graceful)
export function safeValidate<T>(schema: z.ZodType<T>, data: unknown, label: string): T | null {
  const result = schema.safeParse(data)
  if (result.success) return result.data
  if (import.meta.env.DEV) throw new Error(`[Zod] ${label}: ${result.error.message}`)
  console.error(`[Zod] ${label} failed:`, result.error.issues)
  return null
}

// client/src/mocks/handlers.ts — add handler for every new endpoint
import { http, HttpResponse } from 'msw'
export const handlers = [
  http.get('/api/my-entity', () => HttpResponse.json([/* mock data */])),
]
```

## 8-Layer QA — Build This From Day 1

| # | Layer | Command |
|---|-------|---------|
| 1 | Architecture sanity | `node tests/arch/arch-sanity.js` |
| 2 | Static QA | `node qa_test.js` |
| 3 | Mutation watchdog | `node tests/mutation/mutation-watchdog.js` |
| 4 | TypeScript | `cd client && npx tsc --noEmit` |
| 5 | Vite build | `cd client && npm run build` |
| 6 | Math unit tests | `npx playwright test tests/unit/ --reporter=list` |
| 7 | Component tests | `cd client && npm run test:unit` — Vitest + MSW |
| 8 | E2E + contracts | `TEST_BASE_URL=... npx playwright test tests/e2e/ --reporter=list` |

**Layer 7 (component unit tests) is new as of April 2026 and MANDATORY.**
It catches React component crashes from bad API data that all other layers miss.
The `/admin` page crash in production (April 2026) would have been caught by Layer 7.

### Component Test Template
```typescript
// client/src/test/my-component.test.tsx
import { render, screen } from '@testing-library/react'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { MyComponent } from '../components/MyComponent'

describe('MyComponent', () => {
  test('renders without crashing on normal data', () => {
    render(<MyComponent />)
    expect(screen.queryByText(/error/i)).toBeNull()
  })

  test('handles null API response without ErrorBoundary', () => {
    server.use(http.get('/api/my-thing', () => HttpResponse.json(null)))
    // Should not throw
    expect(() => render(<MyComponent />)).not.toThrow()
  })

  test('handles missing fields without crashing', () => {
    server.use(http.get('/api/my-thing', () => HttpResponse.json({})))
    render(<MyComponent />)
    expect(screen.queryByText('Something went wrong')).toBeNull()
  })
})
```

### E2E Page Smoke Test Template
```typescript
// tests/e2e/page-smoke.spec.ts
test('landing page returns 200', async ({ request }) => {
  const resp = await request.get(`${BASE}/`)
  expect(resp.status()).toBe(200)
})
test('protected API requires auth', async ({ request }) => {
  const resp = await request.get(`${BASE}/api/my-entity`)
  expect(resp.status()).toBe(401)
})
test('API returns correct shape', async ({ request }) => {
  const token = await getAuthToken(request)
  const resp = await request.get(`${BASE}/api/my-entity`, { headers: h(token) })
  const body = await resp.json()
  expect(Array.isArray(body)).toBe(true)
})
```

## Branch Strategy
- `main` → production (auto-deploy)
- `staging` → staging env (all work goes here first)
- All new features → `staging` → QA all 8 layers → merge to `main`

## Build Workflow (always in this order)
```
brainstorming → product-management:write-spec → plan-eng-review → writing-plans
→ ecc-zenith (backend) + ui-ux-pro-max (frontend) — parallel agents
→ implement with subagent-driven-development
→ e2e-qa (all 8 layers)
→ verification-before-completion
→ ship → land-and-deploy
→ brainsync (update Company Brain)
```

## After Every Session
Always run `brainsync` skill to update BRAIN.md with decisions made this session.
Create `BRAIN.md` at project root from day 1 — it's your living documentation.
