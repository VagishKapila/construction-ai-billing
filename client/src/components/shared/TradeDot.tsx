import { useState } from 'react'
import { motion } from 'framer-motion'

interface TradeDotProps {
  tradeName: string
  companyName?: string
  trustScore?: number
  status?: 'active' | 'pending' | 'overdue' | 'invited'
  onClick?: () => void
}

const statusColors: Record<string, string> = {
  active: '#2563eb',
  pending: '#d97706',
  overdue: '#dc2626',
  invited: '#94a3b8',
}

export function TradeDot({ tradeName, companyName, trustScore, status = 'active', onClick }: TradeDotProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const letter = tradeName.charAt(0).toUpperCase()
  const color = statusColors[status] ?? '#2563eb'

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <motion.button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        whileHover={{ scale: 1.15 }}
        style={{ width: 28, height: 28, borderRadius: '50%', background: color, color: '#fff', fontWeight: 700, fontSize: 12, border: 'none', cursor: onClick ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        title={tradeName}
      >
        {letter}
      </motion.button>
      {showTooltip && (
        <div style={{ position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)', background: '#0f172a', color: '#e2e8f0', padding: '6px 10px', borderRadius: 6, fontSize: 11, whiteSpace: 'nowrap', zIndex: 100, pointerEvents: 'none' }}>
          <div style={{ fontWeight: 700 }}>{tradeName}</div>
          {companyName && <div style={{ color: '#94a3b8' }}>{companyName}</div>}
          {trustScore != null && <div style={{ color: '#0891b2' }}>{trustScore}/763</div>}
        </div>
      )}
    </div>
  )
}
