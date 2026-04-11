# AI Testing Team — Sam, Mike, Paul

Three Playwright agent specs that simulate real users in E2E tests.

## Who They Are

| Agent | Role | What they test |
|-------|------|----------------|
| **Sam** | Contractor | Register → create project → create pay app → verify it appears |
| **Mike** | Vendor/Sub | Login → access Hub uploads → check trust score → verify rate limiting |
| **Paul** | Owner/Payer | Pay page loads → stripe_status field present → checkout 404s correctly |

## Running

```bash
# All three agents
npx playwright test tests/e2e/agents/ --reporter=list

# Single agent
npx playwright test tests/e2e/agents/sam-contractor.spec.ts

# With staging URL
TEST_BASE_URL=https://construction-ai-billing-staging.up.railway.app \
npx playwright test tests/e2e/agents/
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TEST_BASE_URL` | No (has default) | Staging or production URL |
| `TEST_EMAIL` | No (has default) | Mike's test account email |
| `TEST_PASSWORD` | No (has default) | Mike's test account password |
| `TEST_PAY_TOKEN` | No | Paul's test payment token (from staging pay app) |

## Interpreting Failures

**Sam fails at step 2 (login):** Email verification may be required. Check if `REQUIRE_EMAIL_VERIFICATION=false` is set on staging.

**Mike fails at step 1 (login):** Test account doesn't exist on this environment. Create it via the admin test harness endpoint: `POST /api/admin/test/create-test-gc`

**Paul fails at step 2 (stripe_status):** The API may not have the stripe_status field yet. Ensure the latest deploy is live.

**Any agent fails with 500:** Check Sentry — a real error occurred that needs investigation.

## When These Run

- Automatically: after all other e2e tests (playwright.config.ts `projects`)
- In CI: GitHub Actions `e2e` workflow runs on every staging push
- Manually: `npx playwright test tests/e2e/agents/`
