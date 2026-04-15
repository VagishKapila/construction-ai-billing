import React from 'react'
import { motion } from 'framer-motion'
import { MoneyDisplay } from './MoneyDisplay'
import { StatusChip } from './StatusChip'

interface VendorDetailPanelProps {
  trade: {
    id: number
    trade_name: string
    company_name?: string | null
    status?: string | null
    trust_score?: number | null
    email_alias?: string | null
    contact_email?: string | null
  }
  recentDocs?: Array<{
    id: number
    filename: string
    doc_type?: string | null
    status: string
    created_at: string
    amount?: number | null
  }>
  onApprove?: (docId: number) => void
  onReject?: (docId: number) => void
  onClose: () => void
  onEarlyPay?: () => void
}

function getTrustTier(score?: number | null): string {
  if (!score) return 'Review'
  if (score >= 600) return 'Platinum'
  if (score >= 450) return 'Gold'
  if (score >= 300) return 'Silver'
  if (score >= 150) return 'Bronze'
  return 'Review'
}

export function VendorDetailPanel({
  trade,
  recentDocs = [],
  onApprove,
  onReject,
  onClose,
  onEarlyPay,
}: VendorDetailPanelProps) {
  const trustTier = getTrustTier(trade.trust_score)

  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      className="w-72 bg-white rounded-[12px] border border-[#e2e8f0] shadow-[0_4px_24px_rgba(37,99,235,0.08)] flex flex-col"
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-[#e2e8f0]">
        <div className="flex-1">
          <h3 className="font-bold text-[#0f172a] mb-1">{trade.company_name || trade.trade_name}</h3>
          <p className="text-xs text-[#64748b]">{trade.trade_name}</p>
        </div>
        <button
          onClick={onClose}
          className="text-[#94a3b8] hover:text-[#0f172a] text-xl font-bold"
        >
          ✕
        </button>
      </div>

      {/* Trust Score */}
      <div className="px-4 py-3 border-b border-[#e2e8f0]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-[#94a3b8]">Trust Score</span>
          <span className="text-sm font-bold text-[#7c3aed]">{trade.trust_score || 'N/A'}/763</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[#7c3aed]">{trustTier}</span>
          <div className="w-32 h-2 bg-[#e2e8f0] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#7c3aed]"
              style={{ width: `${Math.min((trade.trust_score || 0) / 763 * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Contact Info */}
      {(trade.email_alias || trade.contact_email) && (
        <div className="px-4 py-3 border-b border-[#e2e8f0] space-y-2">
          {trade.email_alias && (
            <div className="text-xs">
              <span className="text-[#94a3b8] block mb-1">Email Alias</span>
              <span className="text-[#0f172a] font-mono text-[10px]">{trade.email_alias}</span>
            </div>
          )}
          {trade.contact_email && (
            <div className="text-xs">
              <span className="text-[#94a3b8] block mb-1">Contact Email</span>
              <span className="text-[#0f172a] font-mono text-[10px]">{trade.contact_email}</span>
            </div>
          )}
        </div>
      )}

      {/* Recent Docs */}
      {recentDocs.length > 0 && (
        <div className="px-4 py-3 border-b border-[#e2e8f0] flex-1 overflow-y-auto">
          <h4 className="text-xs font-semibold text-[#0f172a] mb-2">Recent Docs</h4>
          <div className="space-y-2">
            {recentDocs.map((doc) => (
              <div key={doc.id} className="text-xs border border-[#e2e8f0] rounded p-2">
                <div className="font-medium text-[#0f172a] truncate mb-1">{doc.filename}</div>
                <div className="flex items-center justify-between mb-2">
                  <StatusChip status={doc.status} />
                  {doc.amount && <MoneyDisplay amount={doc.amount} size="sm" />}
                </div>
                <div className="flex gap-1">
                  {onApprove && (
                    <button
                      onClick={() => onApprove(doc.id)}
                      className="text-[10px] px-2 py-1 text-[#00b87a] hover:bg-[#f0fdf4] rounded transition-colors"
                    >
                      ✓ Approve
                    </button>
                  )}
                  {onReject && (
                    <button
                      onClick={() => onReject(doc.id)}
                      className="text-[10px] px-2 py-1 text-[#dc2626] hover:bg-[#fef2f2] rounded transition-colors"
                    >
                      ✕ Reject
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer CTA */}
      {onEarlyPay && (
        <div className="px-4 py-3 border-t border-[#e2e8f0]">
          <button
            onClick={onEarlyPay}
            className="w-full px-3 py-2 text-xs font-semibold text-[#0891b2] hover:bg-[#ecf9ff] rounded transition-colors"
          >
            Early Pay Option →
          </button>
        </div>
      )}
    </motion.div>
  )
}
