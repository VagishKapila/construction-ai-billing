/**
 * Runtime API Response Validation with Zod
 *
 * These schemas validate API responses at runtime to catch contract mismatches
 * between backend and frontend early. They match the ACTUAL backend response shapes,
 * not the frontend TypeScript types (which may differ).
 *
 * Usage: In API client functions, call safeValidate() before mapping the response:
 *
 *   const res = await fetch(...)
 *   const validated = safeValidate(AdminStatsRawSchema, res.data, 'getAdminStats')
 *   if (!validated) return { error: 'Invalid response shape' }
 *   // Now safe to map validated.revenue.avg_contract, etc.
 */

import { z } from 'zod';

// ============================================================================
// HELPER FUNCTION
// ============================================================================

/**
 * Validates data against a Zod schema and logs/throws on mismatch
 * In dev: throws immediately so we catch contract violations fast
 * In prod: logs error and returns null so app doesn't crash
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string,
): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errorSummary = result.error.flatten();
    console.error(`[Zod] Schema mismatch in ${context}:`, errorSummary);

    // In dev: throw so we catch it immediately
    if (import.meta.env.DEV) {
      throw new Error(
        `API contract violation in ${context}: ${JSON.stringify(errorSummary.fieldErrors || errorSummary.formErrors)}`,
      );
    }
    // In prod: log and return null
    return null;
  }
  return result.data;
}

// ============================================================================
// USER & AUTHENTICATION SCHEMAS
// ============================================================================

export const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
  email_verified: z.boolean(),
  google_id: z.string().optional(),
  platform_role: z.enum(['user', 'admin']),
  trial_start_date: z.string().datetime().optional(),
  trial_end_date: z.string().datetime().optional(),
  subscription_status: z.enum(['trial', 'active', 'canceled', 'past_due', 'free_override']),
  plan_type: z.enum(['free_trial', 'pro', 'free_override']),
  stripe_customer_id: z.string().optional(),
  stripe_connect_id: z.string().optional(),
  payments_enabled: z.boolean(),
  has_completed_onboarding: z.boolean(),
  blocked: z.boolean(),
  created_at: z.string().datetime(),
});

export type UserSchemaType = z.infer<typeof UserSchema>;

export const AuthResponseSchema = z.object({
  user: UserSchema,
  token: z.string().optional(),
});

// ============================================================================
// ADMIN STATS SCHEMA — CRITICAL (the one that crashed production)
// ============================================================================

/**
 * Raw admin stats response from backend — NESTED structure
 * Backend returns: { users: {total}, revenue: {avg_contract, pipeline, total_billed}, ... }
 * Frontend then maps to flat AdminStats structure
 */
export const AdminStatsRawSchema = z.object({
  users: z.object({
    total: z.union([z.string().transform(Number), z.number()]),
    last7: z.union([z.string().transform(Number), z.number()]).optional(),
  }),
  projects: z.object({
    total: z.union([z.string().transform(Number), z.number()]),
    last7: z.union([z.string().transform(Number), z.number()]).optional(),
  }),
  payapps: z.object({
    total: z.union([z.string().transform(Number), z.number()]),
    submitted: z.union([z.string().transform(Number), z.number()]).optional(),
    last7: z.union([z.string().transform(Number), z.number()]).optional(),
  }),
  events: z.object({
    total: z.union([z.string().transform(Number), z.number()]),
    last24h: z.union([z.string().transform(Number), z.number()]),
  }),
  revenue: z.object({
    pipeline: z.union([z.string().transform(Number), z.number()]),
    total_billed: z.union([z.string().transform(Number), z.number()]),
    avg_contract: z.union([z.string().transform(Number), z.number()]),
    billed_by_month: z
      .array(
        z.object({
          month: z.string().optional(),
          month_dt: z.string().optional(),
          billed: z.union([z.string().transform(Number), z.number()]),
        }),
      )
      .optional(),
  }),
  recentErrors: z
    .object({
      rows: z.array(z.any()).optional(),
    })
    .optional(),
  slowRequests: z.array(z.any()).optional(),
  topEvents: z.array(z.any()).optional(),
  dailySignups: z.array(z.any()).optional(),
  featureUsage: z.array(z.any()).optional(),
  subscriptions: z.any().optional(),
});

export type AdminStatsRawType = z.infer<typeof AdminStatsRawSchema>;

// ============================================================================
// PROJECT SCHEMAS
// ============================================================================

export const ProjectSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  name: z.string(),
  number: z.string().optional(),
  job_number: z.string().optional(),
  owner: z.string().optional(),
  contractor: z.string().optional(),
  architect: z.string().optional(),
  contact: z.string().optional(),
  contact_name: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_email: z.string().optional(),
  owner_email: z.string().optional(),
  owner_phone: z.string().optional(),
  building_area: z.string().optional(),
  address: z.string().optional(),
  jurisdiction: z.string().optional(),
  original_contract: z.union([z.string().transform(Number), z.number()]).optional(),
  contract_date: z.string().optional(),
  est_date: z.string().optional(),
  payment_terms: z.string().optional(),
  default_retainage: z.union([z.string().transform(Number), z.number()]).optional(),
  payment_due_date: z.string().optional(),
  retention_due_date: z.string().optional(),
  status: z.enum(['active', 'completed']).optional(),
  completed_at: z.string().optional(),
  include_architect: z.boolean(),
  include_retainage: z.boolean(),
  contract_filename: z.string().optional(),
  contract_original_name: z.string().optional(),
  qb_customer_id: z.string().optional(),
  qb_project_id: z.string().optional(),
  qb_sync_status: z.string().optional(),
  qb_last_synced_at: z.string().optional(),
  pay_app_count: z.union([z.string().transform(Number), z.number()]).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type ProjectSchemaType = z.infer<typeof ProjectSchema>;

// ============================================================================
// PAY APP SCHEMAS
// ============================================================================

export const PayAppLineSchema = z.object({
  id: z.number().optional(),
  pay_app_id: z.number(),
  sov_line_id: z.number(),
  description: z.string(),
  scheduled_value: z.union([z.string().transform(Number), z.number()]),
  work_completed_prev: z.union([z.string().transform(Number), z.number()]),
  work_completed_this: z.union([z.string().transform(Number), z.number()]),
  retainage_pct: z.union([z.string().transform(Number), z.number()]),
  item_id: z.string().optional(),
});

export const PayAppSchema = z.object({
  id: z.number(),
  project_id: z.number(),
  user_id: z.number(),
  status: z.enum(['draft', 'submitted', 'approved', 'paid', 'partial']).optional(),
  period_start: z.string().optional(),
  period_end: z.string().optional(),
  cert_date: z.string().optional(),
  submitted_at: z.string().optional(),
  amount_due: z.union([z.string().transform(Number), z.number()]).optional(),
  amount_paid: z.union([z.string().transform(Number), z.number()]).optional(),
  payment_status: z.enum(['draft', 'pending', 'processing', 'partial', 'paid']).optional(),
  payment_link_token: z.string().optional(),
  payment_due_date: z.string().optional(),
  lines: z.array(PayAppLineSchema).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  deleted_at: z.string().optional(),
});

export type PayAppSchemaType = z.infer<typeof PayAppSchema>;

// ============================================================================
// SETTINGS SCHEMAS
// ============================================================================

export const SettingsSchema = z.object({
  user_id: z.number().optional(),
  company_name: z.string().optional(),
  default_payment_terms: z.string().optional(),
  default_retainage: z.union([z.string().transform(Number), z.number()]).optional(),
  logo_filename: z.string().optional(),
  signature_filename: z.string().optional(),
  contact_name: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_email: z.string().optional(),
  stripe_connect_id: z.string().optional(),
  stripe_charges_enabled: z.boolean().optional(),
  stripe_payouts_enabled: z.boolean().optional(),
  qb_connected: z.boolean().optional(),
});

export type SettingsSchemaType = z.infer<typeof SettingsSchema>;

// ============================================================================
// TRIAL & SUBSCRIPTION SCHEMAS
// ============================================================================

export const TrialStatusSchema = z.object({
  user_id: z.number(),
  subscription_status: z.enum(['trial', 'active', 'canceled', 'past_due', 'free_override']),
  plan_type: z.enum(['free_trial', 'pro', 'free_override']),
  trial_start_date: z.string().datetime(),
  trial_end_date: z.string().datetime(),
  days_remaining: z.number().optional(),
  is_expired: z.boolean().optional(),
  is_pro: z.boolean().optional(),
  stripe_customer_id: z.string().optional(),
  stripe_subscription_id: z.string().optional(),
});

export type TrialStatusSchemaType = z.infer<typeof TrialStatusSchema>;

// ============================================================================
// ADMIN USER SCHEMAS
// ============================================================================

export const AdminUserSchema = UserSchema.extend({
  project_count: z.union([z.string().transform(Number), z.number()]).optional(),
  pay_app_count: z.union([z.string().transform(Number), z.number()]).optional(),
  total_billed: z.union([z.string().transform(Number), z.number()]).optional(),
});

export type AdminUserSchemaType = z.infer<typeof AdminUserSchema>;

// ============================================================================
// CHART DATA SCHEMAS
// ============================================================================

export const PayAppActivityDataSchema = z.object({
  date: z.string(),
  count: z.union([z.string().transform(Number), z.number()]),
  revenue: z.union([z.string().transform(Number), z.number()]),
});

export const PipelineByUserDataSchema = z.object({
  user_name: z.string(),
  user_id: z.number(),
  total_pipeline: z.union([z.string().transform(Number), z.number()]),
  total_billed: z.union([z.string().transform(Number), z.number()]),
  conversion_pct: z.union([z.string().transform(Number), z.number()]).optional(),
});

// ============================================================================
// API RESPONSE WRAPPER SCHEMAS
// ============================================================================

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema.optional(),
    error: z.string().optional(),
    message: z.string().optional(),
  });

// ============================================================================
// HUB & TRADE SCHEMAS
// ============================================================================

export const TradeSchema = z.object({
  id: z.number(),
  project_id: z.number(),
  trade_name: z.string(),
  company_name: z.string().nullable().optional(),
  status: z.enum(['active', 'pending', 'overdue', 'invited']).nullable().optional(),
  trust_score: z.union([z.string().transform(Number), z.number()]).nullable().optional(),
  email_alias: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
});

export type TradeSchemaType = z.infer<typeof TradeSchema>;

export const HubUploadSchema = z.object({
  id: z.number(),
  project_id: z.number(),
  trade_id: z.number().nullable().optional(),
  filename: z.string(),
  doc_type: z
    .enum(['invoice', 'lien_waiver', 'rfi', 'photo', 'submittal', 'daily_report', 'change_order', 'compliance', 'drawing', 'other'])
    .nullable()
    .optional(),
  status: z.enum(['draft', 'submitted', 'approved', 'rejected']).nullable().optional(),
  source: z.enum(['web_app', 'magic_link', 'email_ingest']).nullable().optional(),
  created_at: z.string(),
  amount: z.union([z.string().transform(Number), z.number()]).nullable().optional(),
  company_name: z.string().nullable().optional(),
  trade_name: z.string().nullable().optional(),
  trust_score: z.union([z.string().transform(Number), z.number()]).nullable().optional(),
});

export type HubUploadSchemaType = z.infer<typeof HubUploadSchema>;

// ============================================================================
// CONVENIENCE TYPE ALIASES (simpler names used in shared components)
// ============================================================================

// Simple project type for shared component props (subset of ProjectSchemaType)
export type Project = {
  id: number
  name: string
  address?: string | null
  owner?: string | null
  owner_name?: string | null
  owner_email?: string | null
  contract_amount?: number | null
  original_contract?: number | null
  payment_terms?: string | null
  retainage_pct?: number | null
  default_retainage?: number | null
  status?: string | null
  pay_app_count?: number | null
  created_at?: string
}

// Simple pay app type for shared component props
export type PayApp = {
  id: number
  pay_app_number: number
  project_id: number
  amount?: number | null
  amount_due?: number | null
  status: string
  created_at: string
  pay_token?: string | null
  po_number?: string | null
  notes?: string | null
  submitted_at?: string | null
  period_label?: string | null
  payment_status?: string | null
}

// Simple hub upload type
export type HubUpload = {
  id: number
  project_id: number
  trade_id?: number | null
  filename: string
  doc_type?: string | null
  status: string
  source?: string | null
  created_at: string
  amount?: number | null
  rejection_reason?: string | null
  trade_name?: string | null
  company_name?: string | null
}

// Simple trade type for shared component props
export type Trade = {
  id: number
  project_id: number
  trade_name: string
  company_name?: string | null
  status?: string | null
  trust_score_cached?: number | null
  trust_score?: number | null
  email_alias?: string | null
  contact_email?: string | null
}

// Lien alert type
export const LienAlertSchema = z.object({
  id: z.number(),
  project_id: z.number(),
  alert_type: z.string(),
  deadline_date: z.string(),
  days_remaining: z.number().nullable().optional(),
  state: z.string(),
})
export type LienAlert = z.infer<typeof LienAlertSchema>

// Revenue summary
export const RevenueSummarySchema = z.object({
  total_pipeline: z.union([z.string().transform(Number), z.number()]).nullable().optional(),
  total_billed: z.union([z.string().transform(Number), z.number()]).nullable().optional(),
  total_outstanding: z.union([z.string().transform(Number), z.number()]).nullable().optional(),
  total_collected: z.union([z.string().transform(Number), z.number()]).nullable().optional(),
  total_retainage: z.union([z.string().transform(Number), z.number()]).nullable().optional(),
})
export type RevenueSummary = z.infer<typeof RevenueSummarySchema>
