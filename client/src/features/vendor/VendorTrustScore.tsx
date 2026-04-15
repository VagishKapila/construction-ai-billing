/**
 * VendorTrustScore — Purple card showing trust score with tiers and events
 * Displays: score ring, tier badge, tier explanation, event history
 * Tiers: Platinum (687+), Gold (534+), Silver (381+), Bronze (229+), Review (0-228)
 */

import { motion } from 'framer-motion'
import { TrendingUp, AlertCircle, CheckCircle2, XCircle, Trophy } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface TrustScoreEvent {
  type: string
  description: string
  points: number
  date: string
}

interface VendorTrustScoreProps {
  score: number // 0-763
  vendorName?: string
  events?: TrustScoreEvent[]
  maxScore?: number
}

const TIERS = {
  platinum: {
    min: 687,
    label: 'Platinum',
    color: '#7c3aed',
    bg: '#f5f3ff',
    icon: Trophy,
    description: 'You are an exceptional vendor! Keep up the great work.',
  },
  gold: {
    min: 534,
    label: 'Gold',
    color: '#d97706',
    bg: '#fef3c7',
    icon: TrendingUp,
    description: 'You have a strong record. A few more approvals will get you to Platinum.',
  },
  silver: {
    min: 381,
    label: 'Silver',
    color: '#64748b',
    bg: '#f1f5f9',
    icon: CheckCircle2,
    description: 'You are a reliable vendor. Work towards Gold by reducing rejections.',
  },
  bronze: {
    min: 229,
    label: 'Bronze',
    color: '#ea580c',
    bg: '#fef9c3',
    icon: AlertCircle,
    description: 'You are building your record. Focus on quality submissions.',
  },
  review: {
    min: 0,
    label: 'Under Review',
    color: '#dc2626',
    bg: '#fef2f2',
    icon: XCircle,
    description: 'Your submissions are under review. Follow feedback to improve.',
  },
}

function getTierName(score: number): keyof typeof TIERS {
  if (score >= 687) return 'platinum'
  if (score >= 534) return 'gold'
  if (score >= 381) return 'silver'
  if (score >= 229) return 'bronze'
  return 'review'
}

export default function VendorTrustScore({
  score,
  vendorName,
  events = [],
  maxScore = 763,
}: VendorTrustScoreProps) {
  const tierName = getTierName(score)
  const tier = TIERS[tierName]
  const Icon = tier.icon
  const percentage = (score / maxScore) * 100

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <Card className="overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-50 to-purple-100 border-b border-purple-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900">Trust Score</h3>
              {vendorName && <p className="text-sm text-gray-600 mt-1">Vendor: {vendorName}</p>}
            </div>
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="flex-shrink-0"
            >
              <Icon className="w-8 h-8" style={{ color: tier.color }} />
            </motion.div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          {/* Score Display */}
          <div className="text-center space-y-3">
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-5xl font-bold text-gray-900">{score}</span>
              <span className="text-2xl text-gray-400">/{maxScore}</span>
            </div>

            {/* Tier Badge */}
            <div className="flex justify-center">
              <Badge
                className="px-4 py-2 text-sm font-semibold border"
                style={{ background: tier.bg, color: tier.color, borderColor: tier.color }}
              >
                {tier.label}
              </Badge>
            </div>

            {/* Progress Bar */}
            <div className="pt-2">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ background: tier.color }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">{percentage.toFixed(0)}% of maximum</p>
            </div>
          </div>

          {/* Tier Description */}
          <div
            className="rounded-lg p-4 border-l-4"
            style={{ background: tier.bg, borderLeftColor: tier.color }}
          >
            <p className="text-sm text-gray-700">{tier.description}</p>
          </div>

          {/* Tier Ranges */}
          <div className="border-t border-gray-200 pt-6">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Score Ranges</h4>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TIERS).map(([key, tierData]) => (
                <div
                  key={key}
                  className={`p-3 rounded-lg text-xs font-medium transition-all ${
                    tierName === key
                      ? 'bg-orange-100 text-orange-900 border border-orange-300'
                      : 'bg-gray-50 text-gray-600 border border-gray-200'
                  }`}
                >
                  <p>{tierData.label}</p>
                  <p className="font-mono text-xs mt-1">{tierData.min}+</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Events (if provided) */}
          {events && events.length > 0 && (
            <div className="border-t border-gray-200 pt-6">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Recent Activity</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {events.slice(0, 5).map((event, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100"
                  >
                    <div className="text-xs font-mono font-bold text-orange-600 flex-shrink-0 mt-0.5">
                      {event.points > 0 ? '+' : ''}{event.points}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900">{event.description}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{new Date(event.date).toLocaleDateString()}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  )
}
