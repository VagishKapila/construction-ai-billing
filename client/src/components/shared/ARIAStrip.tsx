import { motion } from 'framer-motion'

interface ARIAStripProps {
  message: string
  actionLabel?: string
  onAction?: () => void
  variant?: 'morning' | 'alert' | 'success'
}

const variantStyles = {
  morning: {
    bg: 'from-[#0f172a] to-[#1e3a5f]',
    accent: '#0891b2',
    emoji: '⚡',
  },
  alert: {
    bg: 'from-[#7c3aed] to-[#5b21b6]',
    accent: '#a78bfa',
    emoji: '⚠️',
  },
  success: {
    bg: 'from-[#00b87a] to-[#059669]',
    accent: '#6ee7b7',
    emoji: '✓',
  },
}

export function ARIAStrip({ message, actionLabel, onAction, variant = 'morning' }: ARIAStripProps) {
  const style = variantStyles[variant]

  return (
    <motion.div
      whileHover={{ opacity: 0.95 }}
      className={`flex items-center gap-4 bg-gradient-to-r ${style.bg} text-white px-4 py-3 rounded-[12px] mb-4`}
    >
      <div
        className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg"
        style={{ backgroundColor: style.accent, color: '#0f172a' }}
      >
        {style.emoji}
      </div>

      <p className="text-sm font-medium flex-1 text-[#e2e8f0]">{message}</p>

      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-3 py-1 rounded text-xs font-semibold transition-all"
          style={{
            backgroundColor: style.accent,
            color: '#0f172a',
          }}
        >
          {actionLabel}
        </button>
      )}
    </motion.div>
  )
}
