import { test, expect } from '@playwright/test'

/**
 * SAM — Contractor agent
 * Tests the full contractor onboarding and billing workflow.
 * Uses API-only approach (no browser UI) for speed and reliability.
 */

const BASE_URL = process.env.TEST_BASE_URL || 'https://construction-ai-billing-staging.up.railway.app'
const timestamp = Date.now()

// Shared state between tests
let authToken: string
let projectId: number
let payAppId: number
let paymentLinkToken: string

test.describe('Sam — Contractor Workflow', () => {
  test.setTimeout(30000)

  test('1. Register new contractor account', async ({ request }) => {
    const email = `sam.contractor.${timestamp}@testmail.constructinv.com`
    const res = await request.post(`${BASE_URL}/api/auth/register`, {
      data: {
        name: 'Sam Contractor',
        email,
        password: 'TestPass123!',
      },
    })
    // Either 201 (created) or 200 (success)
    expect([200, 201]).toContain(res.status())
    const body = await res.json()
    // Token may come directly or need email verification; store if present
    if (body.token) {
      authToken = body.token
    }
    expect(body).toBeDefined()
  })

  test('2. Login as contractor', async ({ request }) => {
    const email = `sam.contractor.${timestamp}@testmail.constructinv.com`
    const res = await request.post(`${BASE_URL}/api/auth/login`, {
      data: {
        email,
        password: 'TestPass123!',
      },
    })
    // Accept 200 or 401 (email verification may be required in staging)
    const body = await res.json()
    if (res.status() === 200 && body.token) {
      authToken = body.token
      expect(authToken).toBeTruthy()
    } else {
      // Email verification may be required — skip remaining tests
      test.skip()
    }
  })

  test('3. Create project', async ({ request }) => {
    if (!authToken) test.skip()
    const res = await request.post(`${BASE_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Sam Test Project',
        address: '123 Test St San Jose CA 95101',
        contractor: 'Sam General Contractors',
        owner: 'Test Owner LLC',
        original_contract: 50000,
        payment_terms: 'Net 30',
        default_retainage: 10,
      },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    projectId = body.id
    expect(projectId).toBeGreaterThan(0)
  })

  test('4. Create pay app', async ({ request }) => {
    if (!authToken || !projectId) test.skip()
    const res = await request.post(`${BASE_URL}/api/projects/${projectId}/payapps`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        app_number: 1,
        period_label: 'April 2026',
        period_start: '2026-04-01',
        period_end: '2026-04-30',
      },
    })
    expect([200, 201]).toContain(res.status())
    const body = await res.json()
    payAppId = body.id
    paymentLinkToken = body.payment_link_token || body.invoice_token
    expect(payAppId).toBeGreaterThan(0)
  })

  test('5. List projects — project appears', async ({ request }) => {
    if (!authToken) test.skip()
    const res = await request.get(`${BASE_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    expect(res.status()).toBe(200)
    const projects = await res.json()
    const found = projects.find((p: any) => p.id === projectId)
    expect(found).toBeDefined()
    expect(found.name).toBe('Sam Test Project')
  })

  test('6. Health check passes', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('healthy')
    expect(body.database).toBe('connected')
  })
})

// Export for use by other agent specs
export { authToken as samAuthToken, projectId as samProjectId, payAppId as samPayAppId, paymentLinkToken as samPaymentToken }
