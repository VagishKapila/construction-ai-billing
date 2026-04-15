import React from 'react'
import { motion } from 'framer-motion'

interface KPICardProps {
  label: string
  value: string | number
  subValue?: string
  icon?: React.ReactNode
  trend?: 'up' | 'down' | 'flat'
  onClick?: () => void
  isMoney?: boolean
}

export function KPICard({
  label,
  value,
  subValue,
  icon,
  trend,
  onClick,
  isMoney,
}: KPICardProps) {
  const fontFamily = isMoney ? 'font-mono' : 'font-sans'

  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '0 8px 40px rgba(37,99,235,0.12)' }}
      onClick={onClick}
      className={`bg-white rounded-[12px] border border-[#e2e8f0] shadow-[0_4px_24px_rgba(37,99,235,0.08)] p-6 transition-all ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <span className="text-sm text-[#64748b] font-['DM_Sans']">{label}</span>
        {icon && <div className="text-[#2563eb]">{icon}</div>}
      </div>

      <div className={`text-3xl font-bold text-[#0f172a] ${fontFamily} mb-2`}>
        {value}
      </div>

      {subValue && <p className="text-xs text-[#94a3b8] font-['DM_Sans']">{subValue}</p>}

      {trend && (
        <div className={`text-xs font-medium mt-2 ${
          trend === 'up' ? 'text-[#00b87a]' : trend === 'down' ? 'text-[#dc2626]' : 'text-[#64748b]'
        }`}>
          {trend === 'up' ? '↑ ' : trend === 'down' ? '↓ ' : '→ '}
          {trend === 'up' ? 'Increased' : trend === 'down' ? 'Decreased' : 'Flat'}
        </div>
      )}
    </motion.div>
  )
}
