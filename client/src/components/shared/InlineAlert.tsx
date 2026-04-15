import React from 'react'
import { motion } from 'framer-motion'

interface InlineAlertProps {
  type: 'lien' | 'retention' | 'overdue' | 'info' | 'success'
  message: string
  actionLabel?: string
  onAction?: () => void
  daysRemaining?: number
}

const colorMap = {
  lien: { border: '#7c3aed', bg: '#f5f3ff', text: '#6d28d9' },
  retention: { border: '#d97706', bg: '#fffbeb', text: '#b45309' },
  overdue: { border: '#dc2626', bg: '#fef2f2', text: '#b91c1c' },
  info: { border: '#0891b2', bg: '#ecf9ff', text: '#0e7490' },
  success: { border: '#00b87a', bg: '#f0fdf4', text: '#15803d' },
}

export function InlineAlert({
  type,
  message,
  actionLabel,
  onAction,
  daysRemaining,
}: InlineAlertProps) {
  const colors = colorMap[type]

  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border-l-4`}
      style={{
        borderLeftColor: colors.border,
        backgroundColor: colors.bg,
      }}
    >
      <span style={{ color: colors.text }} className="text-sm font-medium flex-1">
        {message}
        {daysRemaining !== undefined && daysRemaining > 0 && (
          <span className="ml-1 font-semibold">({daysRemaining} days)</span>
        )}
      </span>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{ color: colors.text }}
          className="text-xs font-semibold hover:underline whitespace-nowrap"
        >
          {actionLabel} →
        </button>
      )}
    </motion.div>
  )
}
