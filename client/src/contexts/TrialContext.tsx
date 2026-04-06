/**
 * Trial Context — Provides access to useTrial hook and upgrade helpers
 * This context is primarily a convenience wrapper around useTrial hook
 * and is NOT a replacement for useAuth
 */

import React from 'react'
import { useTrial } from '@/hooks/useTrial'
import { useTrialContext as useTrialContextHook } from '@/hooks/useTrial'

export { useTrial, useTrialContext }

/**
 * Re-export from hooks for convenience
 * This file maintains backward compatibility
 */
export type { UseTrialReturn } from '@/hooks/useTrial'
