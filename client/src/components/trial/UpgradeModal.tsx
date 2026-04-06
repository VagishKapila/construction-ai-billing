import type { ReactNode } from 'react'
import { useState } from 'react'
import { X, Check, Crown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { api } from '@/api/client'

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * UpgradeModal — Premium upgrade dialog
 *
 * Displays Pro plan details with pricing and benefits.
 * Triggers Stripe Checkout when user clicks "Upgrade Now".
 * Shows loading state while creating checkout session.
 *
 * Props:
 * - isOpen: Whether modal is visible
 * - onClose: Callback when user closes modal
 */
export function UpgradeModal({ isOpen, onClose }: UpgradeModalProps): ReactNode {
  const [loading, setLoading] = useState(false)

  if (!isOpen) {
    return null
  }

  /**
   * Handle upgrade button click
   * Creates Stripe Checkout session and redirects
   */
  const handleUpgrade = async () => {
    try {
      setLoading(true)

      const response = await api.post<{ url: string }>('/api/trial/upgrade', {})

      if (response.data?.url) {
        window.location.href = response.data.url
      } else {
        console.error('No checkout URL returned')
      }
    } catch (error) {
      console.error('Failed to create checkout session:', error)
      setLoading(false)
    }
  }

  /**
   * Benefits list — shown with checkmarks
   */
  const benefits = [
    'Unlimited projects & pay applications',
    'Accept payments through invoices',
    'Advanced reporting with sort/filter',
    'Priority AI assistant',
    'Mobile-optimized with offline access',
    'Custom email templates',
    'Bulk operations',
  ]

  return (
    <>
      {/* Modal backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className={cn(
            'bg-white rounded-lg shadow-lg max-w-md w-full',
            'animate-in fade-in zoom-in-95 duration-200',
          )}
          role="dialog"
          aria-labelledby="upgrade-modal-title"
          aria-modal="true"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-[#e8e8f0]">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary-600" />
              <h2
                id="upgrade-modal-title"
                className="text-lg font-semibold text-gray-900"
              >
                Upgrade to Pro
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Pricing */}
            <div className="bg-primary-50 rounded-lg p-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-gray-900">$40</span>
                <span className="text-gray-600">/month</span>
              </div>
              <p className="text-sm text-gray-600 mt-2">Cancel anytime</p>
            </div>

            {/* Benefits list */}
            <div className="space-y-3">
              {benefits.map((benefit) => (
                <div key={benefit} className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-success-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700">{benefit}</p>
                </div>
              ))}
            </div>

            {/* Messaging */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-sm text-gray-700">
                Your support helps other contractors use this for free and keeps our servers running.
              </p>
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex gap-3 p-6 border-t border-[#e8e8f0]">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={loading}
            >
              Not now
            </Button>
            <Button
              onClick={handleUpgrade}
              loading={loading}
              className="flex-1"
            >
              Upgrade Now
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
