import type { ReactNode } from 'react'
import { useState, useEffect } from 'react'
import { X, AlertTriangle, Clock, Info } from 'lucide-react'
import { useTrial } from '@/hooks/useTrial'
import { cn } from '@/lib/cn'

interface TrialBannerProps {
  onUpgradeClick?: () => void
}

/**
 * TrialBanner — Shows trial status and upgrade prompts
 *
 * Displays different banners based on trial state:
 * - Active trial, > 30 days: hidden
 * - Active trial, 7-30 days: info banner with subtle upgrade prompt
 * - Active trial, < 7 days: warning banner with urgent upgrade prompt
 * - Trial expired: alert banner with upgrade CTA
 * - Pro user or free override: hidden
 *
 * Banner is dismissible with 7-day localStorage expiry per variant
 */
export function TrialBanner({ onUpgradeClick }: TrialBannerProps): ReactNode {
  const { daysRemaining, isExpired, isActive, isPro, isFreeOverride, isTrialGated } = useTrial()
  const [dismissed, setDismissed] = useState(false)

  /**
   * Load dismiss state from localStorage on mount
   * Expires after 7 days
   */
  useEffect(() => {
    try {
      const stored = localStorage.getItem('trial_banner_dismissed')
      if (stored) {
        const { timestamp } = JSON.parse(stored)
        const age = Date.now() - timestamp
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000

        // Keep dismissed if < 7 days old
        if (age < sevenDaysMs) {
          setDismissed(true)
        } else {
          localStorage.removeItem('trial_banner_dismissed')
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [])

  /**
   * Determine which banner to show
   */
  if (isPro || isFreeOverride || !isActive && !isExpired || dismissed) {
    return null
  }

  // Calculate variant based on days remaining
  const isUrgent = daysRemaining !== null && daysRemaining < 7
  const isWarning = daysRemaining !== null && daysRemaining < 30
  const isExpiredGated = isTrialGated

  if (!isActive && !isExpiredGated) {
    return null
  }

  /**
   * Handle dismiss — store in localStorage with expiry
   */
  const handleDismiss = (variant: string) => {
    try {
      localStorage.setItem(
        'trial_banner_dismissed',
        JSON.stringify({ timestamp: Date.now(), variant })
      )
    } catch {
      // Ignore localStorage errors
    }
    setDismissed(true)
  }

  /**
   * Expired trial banner
   */
  if (isExpiredGated) {
    return (
      <div className="bg-danger-50 border-b border-danger-200 px-4 sm:px-6 md:px-8 py-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-danger-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-danger-900">
              Your 90-day trial has ended
            </p>
            <p className="text-sm text-danger-800 mt-1">
              You can still view your projects and pay applications, but creating new ones requires Pro.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <button
                onClick={onUpgradeClick}
                className={cn(
                  'inline-flex items-center justify-center px-4 py-2 rounded-md',
                  'text-sm font-medium text-white',
                  'bg-danger-600 hover:bg-danger-700',
                  'transition-colors duration-200',
                  'active:scale-95'
                )}
              >
                Upgrade to Pro — $64/month
              </button>
              <a
                href="mailto:vaakapila@gmail.com"
                className={cn(
                  'inline-flex items-center justify-center px-4 py-2 rounded-md',
                  'text-sm font-medium text-danger-700',
                  'bg-danger-100 hover:bg-danger-150',
                  'transition-colors duration-200',
                  'active:scale-95'
                )}
              >
                Can't afford it? Email us →
              </a>
            </div>
          </div>
          <button
            onClick={() => handleDismiss('expired')}
            className="text-danger-600 hover:text-danger-700 flex-shrink-0 transition-colors"
            aria-label="Dismiss banner"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    )
  }

  /**
   * Active trial warning (< 7 days remaining)
   */
  if (isUrgent && isActive) {
    return (
      <div className="bg-warning-50 border-b border-warning-200 px-4 sm:px-6 md:px-8 py-4">
        <div className="flex items-start gap-3">
          <Clock className="h-5 w-5 text-warning-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-warning-900">
              Your trial ends in {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'}!
            </p>
            <p className="text-sm text-warning-800 mt-1">
              Upgrade to Pro to keep creating pay applications.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <button
                onClick={onUpgradeClick}
                className={cn(
                  'inline-flex items-center justify-center px-4 py-2 rounded-md',
                  'text-sm font-medium text-white',
                  'bg-warning-600 hover:bg-warning-700',
                  'transition-colors duration-200',
                  'active:scale-95'
                )}
              >
                Upgrade Now
              </button>
            </div>
          </div>
          <button
            onClick={() => handleDismiss('urgent')}
            className="text-warning-600 hover:text-warning-700 flex-shrink-0 transition-colors"
            aria-label="Dismiss banner"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    )
  }

  /**
   * Active trial info (7-30 days remaining)
   */
  if (isWarning && isActive && daysRemaining !== null && daysRemaining >= 7) {
    return (
      <div className="bg-primary-50 border-b border-primary-200 px-4 sm:px-6 md:px-8 py-3">
        <div className="flex items-center gap-3">
          <Info className="h-5 w-5 text-primary-600 flex-shrink-0" />
          <p className="text-sm text-primary-800 flex-1">
            Your free trial ends in {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'}.{' '}
            <button
              onClick={onUpgradeClick}
              className="font-semibold text-primary-700 hover:text-primary-800 underline underline-offset-2 transition-colors"
            >
              Upgrade to Pro →
            </button>
          </p>
          <button
            onClick={() => handleDismiss('info')}
            className="text-primary-600 hover:text-primary-700 flex-shrink-0 transition-colors"
            aria-label="Dismiss banner"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    )
  }

  return null
}
