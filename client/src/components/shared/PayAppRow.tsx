import React from 'react'
import { motion } from 'framer-motion'
import { MoneyDisplay } from './MoneyDisplay'
import { StatusChip } from './StatusChip'

interface PayAppRowProps {
  payApp: {
    id: number
    pay_app_number: number
    status: string
    amount_due?: number | null
    period_label?: string | null
    created_at: string
  }
  projectId: number
  onDownloadPdf: (payAppId: number) => void
  onSendEmail: (payAppId: number) => void
  onShareLink: (payAppId: number) => void
}

export function PayAppRow({
  payApp,
  projectId,
  onDownloadPdf,
  onSendEmail,
  onShareLink,
}: PayAppRowProps) {
  const periodLabel = payApp.period_label || new Date(payApp.created_at).toLocaleDateString()

  return (
    <motion.div
      whileHover={{ backgroundColor: '#f8fafc' }}
      className="flex items-center justify-between px-4 py-3 border-b border-[#e2e8f0] hover:bg-[#f8fafc] transition-colors"
    >
      <div className="flex items-center gap-6 flex-1 min-w-0">
        <span className="text-sm font-semibold text-[#0f172a] w-8"># {payApp.pay_app_number}</span>
        <span className="text-sm text-[#64748b] flex-1 truncate">{periodLabel}</span>
        <div className="w-24">
          <MoneyDisplay amount={payApp.amount_due} size="sm" />
        </div>
        <StatusChip status={payApp.status} />
      </div>

      <div className="flex items-center gap-2">
        <motion.button
          whileHover={{ scale: 1.05 }}
          onClick={() => onDownloadPdf(payApp.id)}
          className="p-2 hover:bg-[#e2e8f0] rounded text-[#2563eb] font-medium text-xs h-8 w-8 flex items-center justify-center"
          title="Download PDF"
        >
          ↓
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          onClick={() => onSendEmail(payApp.id)}
          className="p-2 hover:bg-[#e2e8f0] rounded text-[#2563eb] font-medium text-xs h-8 w-8 flex items-center justify-center"
          title="Send Email"
        >
          ✉
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          onClick={() => onShareLink(payApp.id)}
          className="p-2 hover:bg-[#e2e8f0] rounded text-[#2563eb] font-medium text-xs h-8 w-8 flex items-center justify-center"
          title="Share Link"
        >
          🔗
        </motion.button>
      </div>
    </motion.div>
  )
}
