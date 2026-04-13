/**
 * Trial & Subscription API
 * Handles trial status, upgrades, and subscription management
 *
 * NOTE: Zod validation schemas available in @/lib/schemas.ts:
 * - TrialStatusSchema — validates trial status response shape
 *
 * To add validation to any function:
 *   import { safeValidate, TrialStatusSchema } from '@/lib/schemas'
 *   const validated = safeValidate(TrialStatusSchema, res.data, 'getTrialStatus')
 *   // Use validated object safely
 */

import type { ApiResponse } from '@/types'
import { api } from './client'

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface TrialStatusResponse {
  daysRemaining: number | null
  isExpired: boolean
  isActive: boolean
  isPro: boolean
  isFreeOverride: boolean
  isTrialGated: boolean
  subscriptionStatus: string
  planType: string
  trialEndDate: string | null
}

export interface UpgradeResponse {
  url: string // Stripe Checkout URL
}

// ============================================================================
// API CALLS
// ============================================================================

/**
 * Get current user's trial/subscription status
 */
export async function getTrialStatus(): Promise<ApiResponse<TrialStatusResponse>> {
  return api.get<TrialStatusResponse>('/api/trial/status')
}

/**
 * Start upgrade flow
 * Creates and returns a Stripe Checkout session URL
 */
export async function startUpgrade(): Promise<ApiResponse<UpgradeResponse>> {
  return api.post<UpgradeResponse>('/api/trial/upgrade', {})
}
