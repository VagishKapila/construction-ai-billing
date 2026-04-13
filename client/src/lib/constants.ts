/**
 * Application constants
 * Single source of truth for configuration values used throughout the app
 */

// ============================================================================
// PAYMENT TERMS
// ============================================================================

export const PAYMENT_TERMS = [
  'Due on receipt',
  'Net 7',
  'Net 15',
  'Net 30',
  'Net 45',
  'Net 60',
] as const

export type PaymentTermType = (typeof PAYMENT_TERMS)[number]

// ============================================================================
// JURISDICTIONS
// ============================================================================

export const JURISDICTIONS = [
  'california',
  'texas',
  'florida',
  'new_york',
  'general',
] as const

export type JurisdictionType = (typeof JURISDICTIONS)[number]

// ============================================================================
// PAY APP STATUSES
// ============================================================================

export interface PayAppStatusConfig {
  label: string
  color: string
  bgColor: string
  textColor: string
}

export const PAY_APP_STATUSES: Record<string, PayAppStatusConfig> = {
  draft: {
    label: 'Draft',
    color: 'gray',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-800',
  },
  submitted: {
    label: 'Submitted',
    color: 'blue',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
  },
  paid: {
    label: 'Paid',
    color: 'green',
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
  },
  processing: {
    label: 'Processing',
    color: 'amber',
    bgColor: 'bg-amber-100',
    textColor: 'text-amber-800',
  },
  bad_debt: {
    label: 'Bad Debt',
    color: 'red',
    bgColor: 'bg-red-100',
    textColor: 'text-red-800',
  },
}

export const PAYMENT_STATUSES: Record<string, PayAppStatusConfig> = {
  unpaid: {
    label: 'Unpaid',
    color: 'gray',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-800',
  },
  partial: {
    label: 'Partial',
    color: 'amber',
    bgColor: 'bg-amber-100',
    textColor: 'text-amber-800',
  },
  paid: {
    label: 'Paid',
    color: 'green',
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
  },
  processing: {
    label: 'Processing',
    color: 'blue',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
  },
  bad_debt: {
    label: 'Bad Debt',
    color: 'red',
    bgColor: 'bg-red-100',
    textColor: 'text-red-800',
  },
}

// ============================================================================
// TRIAL & SUBSCRIPTION
// ============================================================================

export const DEFAULT_RETAINAGE = 10 // percentage
export const TRIAL_DURATION_DAYS = 90
export const PRO_PRICE_MONTHLY = 64 // $64/month

// ============================================================================
// STRIPE FEES
// ============================================================================

export const ACH_FEE = 25 // flat $25 per ACH transaction
export const CARD_FEE_PERCENT = 3.3 // 3.3% of transaction amount
export const CARD_FEE_FIXED = 0.4 // $0.40 fixed per transaction

/**
 * Calculate total processing fee for a card payment
 * @param amount - The payment amount in dollars
 * @returns Total processing fee in dollars
 */
export function calculateCardProcessingFee(amount: number): number {
  return (amount * CARD_FEE_PERCENT) / 100 + CARD_FEE_FIXED
}

// ============================================================================
// APP BRANDING
// ============================================================================

export const APP_NAME = 'ConstructInvoice AI'
export const SUPPORT_EMAIL = 'vaakapila@gmail.com'

// ============================================================================
// LIEN WAIVER TYPES
// ============================================================================

export const LIEN_WAIVER_TYPES = ['conditional', 'unconditional'] as const

export type LienWaiverType = (typeof LIEN_WAIVER_TYPES)[number]

export const LIEN_WAIVER_TYPE_LABELS: Record<LienWaiverType, string> = {
  conditional: 'Conditional Waiver',
  unconditional: 'Unconditional Waiver',
}

// ============================================================================
// PROJECT STATUSES
// ============================================================================

export const PROJECT_STATUSES = ['active', 'completed', 'archived'] as const

export type ProjectStatusType = (typeof PROJECT_STATUSES)[number]

// ============================================================================
// FILE UPLOAD LIMITS
// ============================================================================

export const MAX_LOGO_SIZE_BYTES = 100 * 1024 // 100KB for logos
export const MAX_SIGNATURE_SIZE_BYTES = 100 * 1024 // 100KB for signatures
export const MAX_SOV_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB for SOV files

// Supported SOV file types
export const SOV_FILE_TYPES = ['.xlsx', '.xls', '.csv', '.pdf', '.docx', '.doc']

// ============================================================================
// DATE FORMATS
// ============================================================================

export const ISO_DATE_FORMAT = 'YYYY-MM-DD'
export const DISPLAY_DATE_FORMAT = 'MMM DD, YYYY'
export const SHORT_DATE_FORMAT = 'MM/DD/YY'

// ============================================================================
// PAGINATION
// ============================================================================

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

// ============================================================================
// RETRY & TIMEOUT
// ============================================================================

export const API_TIMEOUT_MS = 30_000 // 30 seconds
export const RETRY_ATTEMPTS = 3
export const RETRY_DELAY_MS = 1_000

// ============================================================================
// FEATURE FLAGS
// ============================================================================

export const FEATURES = {
  TRIAL_SYSTEM_ENABLED: true,
  STRIPE_PAYMENTS_ENABLED: true,
  AI_ASSISTANT_ENABLED: true,
  ADMIN_DASHBOARD_ENABLED: true,
  LIEN_WAIVERS_ENABLED: true,
} as const
