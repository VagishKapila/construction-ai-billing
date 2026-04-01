/**
 * UpgradeNudge — Gentle, non-intrusive upgrade prompts
 *
 * Appears as a slide-in card from bottom-right based on:
 * - 30-day trial milestone
 * - 60-day trial milestone
 * - 5+ pay apps created
 * - Random value messaging
 *
 * Behavior:
 * - Max 1 nudge per session (checked via sessionStorage)
 * - Dismissible with "Not now" → stays dismissed 7 days (localStorage)
 * - Never shows if user is Pro or Free Override
 * - Never shows if < 7 days remaining (TrialBanner handles that)
 * - Warm, supportive tone, never aggressive
 *
 * Design:
 * - Slide-in card from bottom-right
 * - Soft shadow, white bg, subtle indigo left border
 * - Crown icon, warm message, "Upgrade" + "Not now" buttons
 * - Smooth animations (transform + opacity)
 * - Max width 380px, mobile responsive
 */

import type { ReactNode } from 'react'
import { useState, useEffect } from 'react'
import { X, Crown } from 'lucide-react'
import { useNudge } from '@/hooks/useNudge'
import { cn } from '@/lib/cn'

interface UpgradeNudgeProps {
  payAppCount?: number
  onUpgradeClick?: () => void
}

/**
 * UpgradeNudge Component
 */
export function UpgradeNudge({ payAppCount = 0, onUpgradeClick }: UpgradeNudgeProps): ReactNode {
  const { nudge, message, dismiss } = useNudge(payAppCount)
  const [isVisible, setIsVisible] = useState(false)

  /**
   * Determine visibility on mount or when nudge changes
   */
  useEffect(() => {
    if (nudge) {
      // Small delay for smooth animation entrance
      const timer = setTimeout(() => {
        setIsVisible(true)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [nudge])

  if (!nudge) {
    return null
  }

  /**
   * Handle "Not now" dismiss
   */
  const handleDismiss = () => {
    setIsVisible(false)
    dismiss()

    // Wait for animation to complete before unmounting
    setTimeout(() => {
      // Component will unmount when nudge becomes null
    }, 300)
  }

  /**
   * Handle upgrade click
   */
  const handleUpgrade = () => {
    dismiss()
    if (onUpgradeClick) {
      onUpgradeClick()
    }
  }

  return (
    <>
      {/* Backdrop overlay — click to dismiss */}
      {isVisible && (
        <div
          className={cn(
            'fixed inset-0 z-30 transition-opacity duration-300',
            isVisible ? 'bg-black/20 opacity-100' : 'bg-black/0 opacity-0 pointer-events-none',
          )}
          onClick={handleDismiss}
          aria-hidden="true"
        />
      )}

      {/* Nudge card — slide in from bottom-right */}
      <div
        className={cn(
          'fixed bottom-6 right-6 z-40',
          'w-full max-w-[380px] mx-4 sm:mx-0',
          'transition-all duration-300 ease-out',
          isVisible
            ? 'translate-y-0 opacity-100'
            : 'translate-y-8 opacity-0 pointer-events-none',
        )}
      >
        <div
          className={cn(
            'bg-white rounded-lg shadow-lg overflow-hidden',
            'border-l-4 border-primary-500',
            'hover:shadow-xl transition-shadow duration-200',
          )}
          role="dialog"
          aria-labelledby="nudge-title"
          aria-modal="false"
        >
          {/* Card header with close button */}
          <div className="flex items-start justify-between p-4 pb-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Crown className="h-5 w-5 text-primary-600 flex-shrink-0" />
              <h3
                id="nudge-title"
                className="text-sm font-semibold text-gray-900 leading-tight"
              >
                Upgrade to Pro
              </h3>
            </div>
            <button
              onClick={handleDismiss}
              className={cn(
                'p-1 text-gray-400 hover:text-gray-600',
                'transition-colors duration-200',
                'flex-shrink-0 -mr-1 -mt-1',
              )}
              aria-label="Dismiss nudge"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Card body */}
          <div className="px-4 py-3">
            <p className="text-sm text-gray-700 leading-relaxed">
              {message}
            </p>
          </div>

          {/* Card footer — action buttons */}
          <div className="flex gap-3 p-4 pt-3 border-t border-gray-100 bg-gray-50">
            <button
              onClick={handleDismiss}
              className={cn(
                'flex-1 px-3 py-2 rounded-md',
                'text-sm font-medium text-gray-700',
                'bg-white border border-gray-300',
                'hover:bg-gray-50 hover:border-gray-400',
                'transition-all duration-200',
                'active:scale-95',
              )}
            >
              Not now
            </button>
            <button
              onClick={handleUpgrade}
              className={cn(
                'flex-1 px-3 py-2 rounded-md',
                'text-sm font-medium text-white',
                'bg-primary-600 hover:bg-primary-700',
                'transition-all duration-200',
                'active:scale-95',
              )}
            >
              Upgrade
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
