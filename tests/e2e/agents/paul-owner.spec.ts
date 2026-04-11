import { test, expect } from '@playwright/test'

/**
 * PAUL — Owner/Payer agent
 * Tests the public pay page and Stripe checkout flow.
 * Uses a known payment token from staging test data.
 */

const BASE_URL = process.env.TEST_BASE_URL || 'https://construction-ai-billing-staging.up.railway.app'

test.describe('Paul — Owner/Payer Workflow', () => {
  test.setTimeout(30000)

  test('1. Pay page endpoint exists and returns JSON', async ({ request }) => {
    // Use a dummy token — we expect 404 (not found) but NOT 500 (server error)
    const res = await request.get(`${BASE_URL}/api/pay/dummy_token_test_12345`)
    // 404 = token not found (expected), 200 = token exists (also fine)
    // What we do NOT want: 500 (server crash) or "Missing method or amount" error
    expect([200, 404]).toContain(res.status())
    const body = await res.json()
    // Should be a proper JSON error response, not an HTML error page
    expect(body).toBeDefined()
    expect(typeof body).toBe('object')
  })

  test('2. Pay page responds with correct stripe_status fields', async ({ request }) => {
    const TEST_PAY_TOKEN = process.env.TEST_PAY_TOKEN || ''
    if (!TEST_PAY_TOKEN) {
      // Skip if no test token available — this test requires staging data
      test.skip()
      return
    }
    const res = await request.get(`${BASE_URL}/api/pay/${TEST_PAY_TOKEN}`)
    if (res.status() === 404) {
      test.skip() // Token expired or not available
      return
    }
    expect(res.status()).toBe(200)
    const body = await res.json()
    // Must have stripe_status field (added in our latest fix)
    expect(body).toHaveProperty('stripe_status')
    expect(['none', 'pending', 'ready']).toContain(body.stripe_status)
    // Must have amount_due
    expect(body).toHaveProperty('amount_due')
    expect(typeof body.amount_due).toBe('number')
  })

  test('3. Checkout with no token returns 404', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/pay/invalid_token_xyz/checkout`, {
      data: { method: 'ach', amount: 1000 },
    })
    expect([400, 404]).toContain(res.status())
    const body = await res.json()
    expect(body.error).toBeDefined()
    // Should NOT be 'Missing method or amount' — that means request reached wrong branch
    expect(body.error).not.toBe('Missing method or amount')
  })

  test('4. Health check — database connected', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('healthy')
    expect(body.database).toBe('connected')
    expect(body.timestamp).toBeDefined()
    expect(body.version).toBeDefined()
  })

  test('5. Pay HTML page loads (not a 500)', async ({ request }) => {
    // Verify the /pay/:token route serves HTML, not a crash
    const res = await request.get(`${BASE_URL}/pay/test_token_12345`)
    // Should serve pay.html (200) even with invalid token — JS handles the 404
    expect([200, 404]).toContain(res.status())
  })
})
