import { http, HttpResponse } from 'msw'

export const handlers = [
  // Admin stats — returns the NESTED shape the backend actually sends
  http.get('/api/admin/stats', () => {
    return HttpResponse.json({
      users: { total: 5, last7: 1 },
      projects: { total: 12 },
      payapps: { total: 34, submitted: 10, last7: 3 },
      events: { total: 200, last24h: 8 },
      revenue: {
        pipeline: 1250000,
        total_billed: 890000,
        avg_contract: 45000,
        billed_by_month: [],
      },
      subscriptions: { trial_users: 3, pro_users: 2, free_override_users: 0, expiring_this_week: 1 },
      recentErrors: [],
      slowRequests: [],
      topEvents: [],
      dailySignups: [],
      featureUsage: [],
    })
  }),

  // Projects list
  http.get('/api/projects', () => {
    return HttpResponse.json([
      { id: 1, name: 'Test Project', status: 'active', original_contract: 100000 }
    ])
  }),

  // Settings
  http.get('/api/settings', () => {
    return HttpResponse.json({
      company_name: 'Test Co',
      contact_name: 'Test User',
      contact_email: 'test@test.com',
      contact_phone: '555-1234',
      default_payment_terms: 'Net 30',
      default_retainage: 10,
    })
  }),

  // Trial status / subscription
  http.get('/api/subscription', () => {
    return HttpResponse.json({
      subscription_status: 'trial',
      trial_end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      plan_type: 'free_trial',
    })
  }),

  // Auth me
  http.get('/api/auth/me', () => {
    return HttpResponse.json({
      id: 1,
      name: 'Test User',
      email: 'test@test.com',
      subscription_status: 'trial',
    })
  }),
]
