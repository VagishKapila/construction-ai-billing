import React, { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface SidebarSectionProps {
  title: string
  count?: number
  dotColor?: string
  children: React.ReactNode
  defaultExpanded?: boolean
}

export function SidebarSection({
  title,
  count,
  dotColor,
  children,
  defaultExpanded = true,
}: SidebarSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#f8fafc] rounded transition-colors"
      >
        <div className="flex items-center gap-2 flex-1 text-left">
          {dotColor && (
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: dotColor }}
            />
          )}
          <span className="text-sm font-semibold text-[#0f172a]">{title}</span>
          {count !== undefined && (
            <span className="ml-auto text-xs text-[#94a3b8] font-medium">{count}</span>
          )}
        </div>
        <span className="text-[#64748b] text-lg">{isExpanded ? '−' : '+'}</span>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="pl-6 mt-1"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
