/**
 * useNudge Hook — Determines which upgrade nudge (if any) to show
 *
 * Logic:
 * - Check if user is Pro or Free Override → return null
 * - Check if already shown in this session → return null
 * - Check if dismissed in last 7 days → return null
 * - Priority order: 60day > 30day > 5payapps > value
 * - Return the nudge type and message
 */

import { useMemo } from 'react'
import { useTrial } from './useTrial'

export type NudgeType = '30day' | '60day' | '5payapps' | 'value'

export interface UseNudgeReturn {
  nudge: NudgeType | null
  message: string
  dismiss: () => void
}

type NudgeMessages = Record<NudgeType, string>

const NUDGE_MESSAGES: NudgeMessages = {
  '30day': 'Enjoying ConstructInvoice AI? Going Pro helps us keep this free for contractors who need it.',
  '60day': 'Your trial ends in 30 days. Want to lock in Pro now? $64/month — cancel anytime.',
  '5payapps': 'You\'ve generated 5+ pay applications! Pro users get advanced reporting and priority AI support.',
  'value': 'Your support helps other contractors use this for free and keeps our servers running.',
}

export function useNudge(payAppCount: number = 0): UseNudgeReturn {
  const { daysRemaining, isActive, isPro, isFreeOverride } = useTrial()

  /**
   * Determine which nudge to show
   */
  const { nudge, message } = useMemo(() => {
    // Don't show if user is Pro or Free Override
    if (isPro || isFreeOverride) {
      return { nudge: null, message: '' }
    }

    // Don't show if trial is not active
    if (!isActive || daysRemaining === null) {
      return { nudge: null, message: '' }
    }

    // Don't show if < 7 days remaining (TrialBanner handles that)
    if (daysRemaining < 7) {
      return { nudge: null, message: '' }
    }

    // Check localStorage for dismissed nudge (7-day expiry)
    try {
      const stored = localStorage.getItem('nudge_dismissed_at')
      if (stored) {
        const dismissedAt = parseInt(stored, 10)
        const age = Date.now() - dismissedAt
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000

        if (age < sevenDaysMs) {
          // Still within 7-day dismiss window
          return { nudge: null, message: '' }
        }
      }
    } catch {
      // Ignore localStorage errors
    }

    // Check sessionStorage for already shown in this session
    try {
      const shown = sessionStorage.getItem('nudge_shown_this_session')
      if (shown) {
        return { nudge: null, message: '' }
      }
    } catch {
      // Ignore sessionStorage errors
    }

    // Priority order: 60day > 30day > 5payapps > value

    // 60-day nudge: after 60 days (30 days remaining or less)
    if (daysRemaining <= 30) {
      return { nudge: '60day' as NudgeType, message: NUDGE_MESSAGES['60day'] }
    }

    // 30-day nudge: after 30 days (60 days remaining or less)
    if (daysRemaining <= 60) {
      return { nudge: '30day' as NudgeType, message: NUDGE_MESSAGES['30day'] }
    }

    // 5-payapps nudge: after creating 5+ pay apps
    if (payAppCount >= 5) {
      return { nudge: '5payapps' as NudgeType, message: NUDGE_MESSAGES['5payapps'] }
    }

    // Value nudge: random occasional (50% chance on every eligible check)
    // Only show if we haven't shown anything else and user has been active
    if (Math.random() > 0.5) {
      return { nudge: 'value' as NudgeType, message: NUDGE_MESSAGES['value'] }
    }

    return { nudge: null, message: '' }
  }, [daysRemaining, isActive, isPro, isFreeOverride, payAppCount])

  /**
   * Dismiss — mark as shown this session + dismissed for 7 days
   */
  const dismiss = () => {
    try {
      sessionStorage.setItem('nudge_shown_this_session', 'true')
      localStorage.setItem('nudge_dismissed_at', Date.now().toString())
    } catch {
      // Ignore storage errors
    }
  }

  return { nudge, message, dismiss }
}
