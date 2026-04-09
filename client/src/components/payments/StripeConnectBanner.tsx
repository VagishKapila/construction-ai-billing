/**
 * StripeConnectBanner — Dashboard banner for GCs without Stripe Connect
 *
 * Shows a yellow/orange warning when the GC has no connected Stripe account,
 * encouraging them to complete onboarding to accept payments.
 * Disappears (with animation) once the account becomes active.
 */

import { motion, AnimatePresence } from 'framer-motion'
import { CreditCard, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStripeAccount } from '@/hooks/useStripeAccount'

export function StripeConnectBanner() {
  const { isActive, isPending, isLoading, startOnboarding } = useStripeAccount()

  // Don't render during initial load or when fully active
  if (isLoading || isActive) return null

  return (
    <AnimatePresence>
      {isPending ? (
        // Connected but incomplete — needs to finish Stripe onboarding
        <motion.div
          key="stripe-pending"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-4.5 h-4.5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Finish setting up payments
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Your Stripe account is connected but not yet verified. Complete setup to start accepting invoice payments.
              </p>
            </div>
          </div>
          <Button
            onClick={startOnboarding}
            size="sm"
            className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white gap-2 rounded-xl"
          >
            Finish Setup
            <ArrowRight className="w-4 h-4" />
          </Button>
        </motion.div>
      ) : (
        // No Stripe account at all — main CTA
        <motion.div
          key="stripe-unconnected"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 p-4 flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center shrink-0 mt-0.5">
              <CreditCard className="w-4.5 h-4.5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-orange-900">
                Set up payments to get paid
              </p>
              <p className="text-xs text-orange-700 mt-0.5">
                Connect your bank account to receive invoice payments directly. Takes 2 minutes.
              </p>
            </div>
          </div>
          <Button
            onClick={startOnboarding}
            size="sm"
            className="shrink-0 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white gap-2 rounded-xl shadow-sm hover:shadow-md hover:shadow-orange-200/50 transition-all"
          >
            <CreditCard className="w-4 h-4" />
            Connect Stripe
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * StripeActiveBadge — Small green "Payments active" badge for the dashboard header
 * Only renders when the account IS active
 */
export function StripeActiveBadge() {
  const { isActive, isLoading } = useStripeAccount()

  if (isLoading || !isActive) return null

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 border border-green-200"
    >
      <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
      <span className="text-xs font-medium text-green-700">Payments active</span>
    </motion.div>
  )
}
