/**
 * StripeGateModal — Blocks email-send actions when GC has no Stripe Connect
 *
 * Shows when a GC tries to send a pay app invoice without having connected
 * their Stripe account. Offers two paths:
 *   1. "Set up payments" → triggers Stripe Connect onboarding
 *   2. "Save as draft only" → dismisses and saves without sending
 */

import { motion, AnimatePresence } from 'framer-motion'
import { CreditCard, X, ArrowRight, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStripeAccount } from '@/hooks/useStripeAccount'

interface StripeGateModalProps {
  isOpen: boolean
  onClose: () => void
  /** Called when user confirms they want to save as draft without connecting Stripe */
  onSaveAsDraft: () => void
}

export function StripeGateModal({ isOpen, onClose, onSaveAsDraft }: StripeGateModalProps) {
  const { startOnboarding } = useStripeAccount()

  const handleSetupPayments = async () => {
    onClose()
    await startOnboarding()
  }

  const handleSaveAsDraft = () => {
    onSaveAsDraft()
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-50 px-4"
          >
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
              {/* Header bar */}
              <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-orange-600" />
                  </div>
                  <p className="text-sm font-semibold text-orange-900">Payment setup required</p>
                </div>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5">
                <h3 className="text-base font-bold text-gray-900">
                  Connect Stripe before sending invoices
                </h3>
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                  You need to connect your bank account to receive invoice payments directly.
                  It takes about 2 minutes and allows owners to pay you via ACH or credit card.
                </p>

                <div className="mt-5 space-y-3">
                  <Button
                    onClick={handleSetupPayments}
                    className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white rounded-xl gap-2 shadow-sm"
                  >
                    <CreditCard className="w-4 h-4" />
                    Set up payments
                    <ArrowRight className="w-4 h-4 ml-auto" />
                  </Button>

                  <Button
                    onClick={handleSaveAsDraft}
                    variant="outline"
                    className="w-full rounded-xl gap-2 text-gray-600 border-gray-200 hover:bg-gray-50"
                  >
                    <FileText className="w-4 h-4" />
                    Save as draft only
                  </Button>
                </div>

                <p className="text-xs text-gray-400 mt-4 text-center">
                  Your pay application data is saved. You can send it later after connecting Stripe.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
