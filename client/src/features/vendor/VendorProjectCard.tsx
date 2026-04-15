/**
 * VendorProjectCard — Status Variants for Vendor Projects
 * Shows project with colored left stripe indicating urgency:
 * - Needs Upload (red)
 * - Pending Review (amber)
 * - Approved (green) with Early Pay option
 * - Rejected (red) with Resubmit button
 * - Paid (green)
 */

import { motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Clock, XCircle, DollarSign, Upload, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/formatters'
import type { Project } from '@/types'

interface VendorProjectCardProps {
  project: Project & { contractor?: string | null }
  status: 'needs_upload' | 'pending' | 'approved' | 'rejected' | 'paid'
  amount?: number | null
  rejectionReason?: string | null
  approvedAt?: string | null
  paidAt?: string | null
  onUpload: () => void
  onResubmit?: () => void
  onEarlyPay?: () => void
}

const statusConfig = {
  needs_upload: {
    stripe: '#dc2626', // red
    icon: AlertCircle,
    label: '⚠️ Invoice Needed',
    action: 'Upload Invoice',
    accent: 'bg-red-50 border-red-200',
    badgeClass: 'bg-red-100 text-red-700 border-red-300',
  },
  pending: {
    stripe: '#f59e0b', // amber
    icon: Clock,
    label: '⏳ Awaiting Approval',
    action: 'View Status',
    accent: 'bg-amber-50 border-amber-200',
    badgeClass: 'bg-amber-100 text-amber-700 border-amber-300',
  },
  approved: {
    stripe: '#22c55e', // green
    icon: CheckCircle2,
    label: '✅ Approved',
    action: 'Early Pay',
    accent: 'bg-green-50 border-green-200',
    badgeClass: 'bg-green-100 text-green-700 border-green-300',
  },
  rejected: {
    stripe: '#dc2626', // red
    icon: XCircle,
    label: '⚠️ Rejected',
    action: 'Fix & Resubmit',
    accent: 'bg-red-50 border-red-200',
    badgeClass: 'bg-red-100 text-red-700 border-red-300',
  },
  paid: {
    stripe: '#22c55e', // green
    icon: DollarSign,
    label: '✅ Paid',
    action: 'View Details',
    accent: 'bg-green-50 border-green-200',
    badgeClass: 'bg-green-100 text-green-700 border-green-300',
  },
}

export default function VendorProjectCard({
  project,
  status,
  amount,
  rejectionReason,
  approvedAt,
  paidAt,
  onUpload,
  onResubmit,
  onEarlyPay,
}: VendorProjectCardProps) {
  const config = statusConfig[status]
  const Icon = config.icon

  const handleAction = () => {
    if (status === 'needs_upload') onUpload()
    else if (status === 'pending') onUpload()
    else if (status === 'approved') onEarlyPay?.()
    else if (status === 'rejected') onResubmit?.()
    else if (status === 'paid') onUpload() // View details
  }

  const isUrgent = status === 'needs_upload' || status === 'rejected'

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="group relative"
    >
      <Card
        className={`relative overflow-hidden border-l-4 p-6 transition-all ${
          isUrgent ? 'shadow-lg border-l-red-500' : 'border-l-orange-500 hover:shadow-lg'
        }`}
        style={{ borderLeftColor: config.stripe }}
      >
        {/* Status Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3 flex-1">
            <Icon className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">{project.address || project.name}</h3>
              <p className="text-sm text-gray-600 mt-0.5">For: {project.contractor || 'N/A'}</p>
            </div>
          </div>
          <Badge className={`${config.badgeClass} border ml-2`}>{config.label}</Badge>
        </div>

        {/* Amount Display (if applicable) */}
        {amount && (
          <div className={`${config.accent} border rounded-lg p-3 mb-4`}>
            <p className="text-xs font-medium text-gray-600 mb-1">Amount</p>
            <p className="text-xl font-mono font-bold text-gray-900">{formatCurrency(amount)}</p>
          </div>
        )}

        {/* Contract Value */}
        {project.original_contract && (
          <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 mb-4">
            <p className="text-xs font-medium text-orange-600 mb-1">Contract Value</p>
            <p className="text-lg font-mono font-semibold text-orange-900">{formatCurrency(project.original_contract)}</p>
          </div>
        )}

        {/* Rejection Reason (if rejected) */}
        {status === 'rejected' && rejectionReason && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-xs font-medium text-red-700 mb-1">Rejection Reason</p>
            <p className="text-sm text-red-700">{rejectionReason}</p>
          </div>
        )}

        {/* Status Timeline Info */}
        {(approvedAt || paidAt) && (
          <div className="text-xs text-gray-500 mb-4">
            {paidAt && (
              <p>
                <span className="font-medium text-green-700">Paid:</span> {new Date(paidAt).toLocaleDateString()}
              </p>
            )}
            {approvedAt && !paidAt && (
              <p>
                <span className="font-medium text-orange-700">Approved:</span> {new Date(approvedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {/* Early Pay CTA (approved only) */}
        {status === 'approved' && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-teal-50 border border-teal-200 rounded-lg p-3 mb-4"
          >
            <div className="flex items-start gap-2">
              <TrendingUp className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-teal-700">Early Payment Available</p>
                <p className="text-xs text-teal-600 mt-0.5">Get paid today for a 1.5% fee</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Action Button */}
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            onClick={handleAction}
            className={`w-full font-semibold transition-all ${
              status === 'needs_upload'
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : status === 'pending'
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : status === 'rejected'
                    ? 'bg-orange-500 hover:bg-orange-600 text-white'
                    : status === 'approved'
                      ? 'bg-teal-500 hover:bg-teal-600 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            {status === 'needs_upload' && (
              <>
                <Upload className="w-4 h-4 mr-2 inline" />
                {config.action}
              </>
            )}
            {status === 'pending' && (
              <>
                <Clock className="w-4 h-4 mr-2 inline" />
                {config.action}
              </>
            )}
            {status === 'approved' && (
              <>
                <TrendingUp className="w-4 h-4 mr-2 inline" />
                {config.action}
              </>
            )}
            {status === 'rejected' && (
              <>
                <Upload className="w-4 h-4 mr-2 inline" />
                {config.action}
              </>
            )}
            {status === 'paid' && (
              <>
                <DollarSign className="w-4 h-4 mr-2 inline" />
                {config.action}
              </>
            )}
          </Button>
        </motion.div>

        {/* Hover Accent */}
        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-lg" />
      </Card>
    </motion.div>
  )
}
