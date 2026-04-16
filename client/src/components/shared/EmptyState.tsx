import type React from 'react'
import { motion } from 'framer-motion'

interface EmptyStateProps {
  firstName?: string
  onCreateProject?: () => void
  // Legacy props (used by CashFlow, PaymentsDashboard) — render as generic empty state
  icon?: React.ReactNode
  title?: string
  description?: string
}

export function EmptyState({ firstName, onCreateProject, icon, title, description }: EmptyStateProps) {
  // Legacy mode: icon/title/description passed directly
  if (title && !onCreateProject) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] px-4 text-center">
        {icon && <div className="mb-4 text-[#94a3b8]">{icon}</div>}
        <h3 className="font-['DM_Serif_Display'] text-xl font-bold text-[#0f172a] mb-2">{title}</h3>
        {description && <p className="text-[#64748b] text-sm">{description}</p>}
      </div>
    )
  }
  // Default: onboarding empty state for new users
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-2xl"
      >
        <h1 className="font-['DM_Serif_Display'] text-4xl font-bold text-[#0f172a] mb-2">
          Welcome to ConstructInvoice AI{firstName ? `, ${firstName}` : ''}! 🎉
        </h1>

        <p className="text-[#64748b] text-lg mb-8 font-['DM_Sans']">
          Get paid faster with AI-powered G702/G703 billing. Let's create your first project.
        </p>

        {/* 3-step preview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[
            {
              num: 1,
              title: 'Upload your SOV',
              desc: 'Schedule of Values - Excel, PDF, or CSV',
            },
            {
              num: 2,
              title: 'ARIA detects trades',
              desc: 'AI identifies work items & categories',
            },
            {
              num: 3,
              title: 'Generate invoice',
              desc: 'AIA G702/G703 PDF ready to send',
            },
          ].map((step) => (
            <motion.div
              key={step.num}
              whileHover={{ y: -4 }}
              className="bg-white rounded-[12px] border border-[#e2e8f0] p-6 shadow-[0_4px_24px_rgba(37,99,235,0.08)]"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#2563eb] text-white font-bold text-sm mb-3">
                {step.num}
              </div>
              <h3 className="font-['DM_Sans'] font-bold text-[#0f172a] text-sm mb-1">
                {step.title}
              </h3>
              <p className="text-xs text-[#94a3b8]">{step.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* CTA Button */}
        <motion.button
          whileHover={{ scale: 1.02, boxShadow: '0 8px 40px rgba(37,99,235,0.12)' }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onCreateProject?.()}
          className="px-6 py-3 bg-[#2563eb] text-white font-bold rounded-[8px] hover:bg-[#1d4ed8] transition-all"
        >
          Create Your First Project →
        </motion.button>
      </motion.div>
    </div>
  )
}
