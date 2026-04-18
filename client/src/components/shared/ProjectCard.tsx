import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MoneyDisplay } from './MoneyDisplay'
import { StatusChip } from './StatusChip'
import { TradeDot } from './TradeDot'
import { InlineAlert } from './InlineAlert'
import { PayAppRow } from './PayAppRow'

interface ProjectCardProps {
  project: {
    id: number
    name: string
    owner?: string | null
    owner_email?: string | null
    original_contract?: number | null
    payment_terms?: string | null
    status?: string | null
    pay_app_count?: number
  }
  trades?: Array<{
    id: number
    trade_name: string
    company_name?: string | null
    trust_score?: number | null
    status?: string | null
  }>
  payApps?: Array<{
    id: number
    app_number: number
    status: string
    amount_due?: number | null
    period_label?: string | null
    created_at: string
  }>
  alerts?: Array<{
    type: 'lien' | 'retention' | 'overdue' | 'info'
    message: string
    actionLabel?: string
    daysRemaining?: number
  }>
  urgency?: 'urgent' | 'action' | 'healthy'
  onCreatePayApp: (projectId: number) => void
  onArchive: (projectId: number) => void
  onClick: (projectId: number) => void
  onDownloadPdf?: (payAppId: number) => void
  onSendEmail?: (payAppId: number) => void
  onShareLink?: (payAppId: number) => void
}

const urgencyColorMap = {
  urgent: '#dc2626',
  action: '#d97706',
  healthy: '#00b87a',
}

export function ProjectCard({
  project,
  trades = [],
  payApps = [],
  alerts = [],
  urgency = 'healthy',
  onCreatePayApp,
  onArchive,
  onClick,
  onDownloadPdf = () => {},
  onSendEmail = () => {},
  onShareLink = () => {},
}: ProjectCardProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [isHovering, setIsHovering] = useState(false)

  const stripeColor = urgencyColorMap[urgency]
  const visibleTrades = trades.slice(0, 8)

  return (
    <motion.div
      whileHover={isHovering ? undefined : { y: -4 }}
      onHoverStart={() => setIsHovering(true)}
      onHoverEnd={() => setIsHovering(false)}
      className="bg-white rounded-[12px] border border-[#e2e8f0] shadow-[0_4px_24px_rgba(37,99,235,0.08)] overflow-hidden"
    >
      {/* Left stripe */}
      <div
        className="absolute top-0 left-0 w-1 h-full"
        style={{ backgroundColor: stripeColor }}
      />

      <div className="pl-5">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#e2e8f0]">
          <button
            onClick={() => onClick(project.id)}
            className="flex items-center gap-3 flex-1 text-left"
          >
            <span className="font-['DM_Serif_Display'] text-lg font-bold text-[#0f172a] hover:text-[#2563eb]">
              {project.name}
            </span>
          </button>

          <div className="flex items-center gap-2">
            {project.status && <StatusChip status={project.status} />}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-[#64748b] hover:text-[#0f172a] font-bold text-lg h-8 w-8 flex items-center justify-center"
            >
              {isExpanded ? '−' : '+'}
            </button>
          </div>
        </div>

        {/* Project details row */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-[#e2e8f0]">
          <div className="flex items-center gap-8">
            {project.owner && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-[#94a3b8]">Owner</span>
                <span className="text-sm font-semibold text-[#0f172a]">{project.owner}</span>
              </div>
            )}
            {project.original_contract !== null && project.original_contract !== undefined && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-[#94a3b8]">Contract</span>
                <MoneyDisplay amount={project.original_contract} size="sm" />
              </div>
            )}
            {project.payment_terms && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-[#94a3b8]">Terms</span>
                <span className="text-sm font-semibold text-[#0f172a]">{project.payment_terms}</span>
              </div>
            )}
          </div>
        </div>

        {/* Trades row */}
        {visibleTrades.length > 0 && (
          <div className="px-4 py-3 flex items-center gap-2 border-b border-[#e2e8f0]">
            {visibleTrades.map((trade) => (
              <TradeDot
                key={trade.id}
                tradeName={trade.trade_name}
                companyName={trade.company_name || undefined}
                trustScore={trade.trust_score || undefined}
                status={(trade.status as any) || 'active'}
              />
            ))}
            {trades.length > 8 && (
              <span className="text-xs text-[#94a3b8] ml-2 font-semibold">
                +{trades.length - 8}
              </span>
            )}
          </div>
        )}

        {/* Alerts */}
        <AnimatePresence>
          {isExpanded && alerts.length > 0 && (
            <div className="px-4 py-3 space-y-2 border-b border-[#e2e8f0]">
              {alerts.map((alert, i) => (
                <InlineAlert
                  key={i}
                  type={alert.type}
                  message={alert.message}
                  actionLabel={alert.actionLabel}
                  daysRemaining={alert.daysRemaining}
                />
              ))}
            </div>
          )}
        </AnimatePresence>

        {/* Pay Apps section */}
        <AnimatePresence>
          {isExpanded && payApps.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-b border-[#e2e8f0]"
            >
              {payApps.map((payApp) => (
                <PayAppRow
                  key={payApp.id}
                  payApp={payApp}
                  projectId={project.id}
                  onDownloadPdf={onDownloadPdf}
                  onSendEmail={onSendEmail}
                  onShareLink={onShareLink}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-4 py-3 gap-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            onClick={() => onCreatePayApp(project.id)}
            className="px-4 py-2 bg-[#2563eb] text-white text-sm font-semibold rounded-md hover:bg-[#1d4ed8] transition-colors"
          >
            + Pay App
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={() => onArchive(project.id)}
            className="px-4 py-2 text-[#64748b] text-sm font-semibold hover:text-[#dc2626] transition-colors"
          >
            Archive
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}
