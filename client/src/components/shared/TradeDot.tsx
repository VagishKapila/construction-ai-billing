import React, { useState } from 'react'
import { motion } from 'framer-motion'

interface TradeDotProps {
  tradeName: string
  companyName?: string
  trustScore?: number
  status?: 'active' | 'pending' | 'overdue' | 'invited'
  onClick?: () => void
}

const statusColorMap = {
  active: '#2563eb',
  pending: '#d97706',
  overdue: '#dc2626',
  invited: '#64748b',
}

const statusBgMap = {
  active: 'bg-[#2563eb]',
  pending: 'bg-[#d97706]',
  overdue: 'bg-[#dc2626]',
  invited: 'bg-[#64748b]',
}

export function TradeDot({
  tradeName,
  companyName,
  trustScore,
  status = 'active',
  onClick,
}: TradeDotProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const letter = tradeName.charAt(0).toUpperCase()
  const bgColor = statusBgMap[status]

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <motion.div
        whileHover={{ scale: 1.15 }}
        onClick={onClick}
        className={`w-10 h-10 rounded-full ${bgColor} text-white flex items-center justify-center font-bold text-sm cursor-pointer transition-all`}
      >
        {letter}
      </motion.div>

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-[#0f172a] text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
          <div className="font-semibold">{tradeName}</div>
          {companyName && <div className="text-[#94a3b8]">{companyName}</div>}
          {trustScore && <div className="text-[#7c3aed]">Trust: {trustScore}/763</div>}
        </div>
      )}
    </div>
  )
}
