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
      plan_type: 'free_trial',
      trial_start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      trial_end_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    })
  }),

  // Project pay apps
  http.get('/api/projects/:id/pay-apps', () => {
    return HttpResponse.json([
      {
        id: 1,
        pay_app_number: 1,
        project_id: 1,
        amount_due: 85950,
        status: 'paid',
        created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        period_label: 'March 2026',
      },
      {
        id: 2,
        pay_app_number: 2,
        project_id: 1,
        amount_due: 67440,
        status: 'submitted',
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        period_label: 'April 1-13, 2026',
      },
    ])
  }),

  // Trades list
  http.get('/api/projects/:id/hub/trades', () => {
    return HttpResponse.json([
      {
        id: 1,
        project_id: 1,
        trade_name: 'Plumbing',
        company_name: 'Pacific Plumbing',
        status: 'active',
        trust_score: 712,
        email_alias: 'plumbing-elm@hub.constructinv.com',
        contact_email: 'dispatcher@pacificplumbing.com',
      },
      {
        id: 2,
        project_id: 1,
        trade_name: 'Electrical',
        company_name: 'City Electric',
        status: 'active',
        trust_score: 568,
        email_alias: 'electrical-elm@hub.constructinv.com',
        contact_email: 'office@cityelectric.com',
      },
      {
        id: 3,
        project_id: 1,
        trade_name: 'HVAC',
        company_name: null,
        status: 'invited',
        trust_score: null,
        email_alias: 'hvac-elm@hub.constructinv.com',
        contact_email: null,
      },
    ])
  }),

  // Hub uploads
  http.get('/api/projects/:id/hub/uploads', () => {
    return HttpResponse.json([
      {
        id: 1,
        project_id: 1,
        trade_id: 1,
        filename: 'invoices_march.pdf',
        doc_type: 'invoice',
        status: 'approved',
        source: 'email_ingest',
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        amount: 18500,
        company_name: 'Pacific Plumbing',
        trade_name: 'Plumbing',
        trust_score: 712,
      },
      {
        id: 2,
        project_id: 1,
        trade_id: 2,
        filename: 'lien_waiver_unconditional.pdf',
        doc_type: 'lien_waiver',
        status: 'approved',
        source: 'web_app',
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        amount: null,
        company_name: 'City Electric',
        trade_name: 'Electrical',
        trust_score: 568,
      },
    ])
  }),

  // Stripe account status
  http.get('/api/stripe/account-status', () => {
    return HttpResponse.json({
      connected: true,
      charges_enabled: true,
      payouts_enabled: true,
    })
  }),

  // Reports summary
  http.get('/api/reports/summary', () => {
    return HttpResponse.json({
      total_pipeline: 268233,
      total_billed: 85950,
      total_outstanding: 0,
      total_retainage: 8595,
      total_collected: 85950,
    })
  }),

  // ARIA lien alerts
  http.get('/api/aria/lien-alerts', () => {
    return HttpResponse.json([])
  }),

  // Hub trades (alternate route pattern)
  http.get('/api/hub/projects/:id/trades', () => {
    return HttpResponse.json([
      {
        id: 1,
        project_id: 1,
        trade_name: 'Plumbing',
        company_name: 'Pacific Plumbing',
        status: 'active',
        trust_score: 712,
        trust_score_cached: 712,
        email_alias: 'plumbing-elm@hub.constructinv.com',
        contact_email: 'dispatcher@pacificplumbing.com',
      },
    ])
  }),

  // Trial status
  http.get('/api/trial/status', () => {
    return HttpResponse.json({
      user_id: 1,
      subscription_status: 'trial',
      plan_type: 'free_trial',
      trial_start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      trial_end_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      days_remaining: 60,
      is_expired: false,
      is_pro: false,
    })
  }),
]
