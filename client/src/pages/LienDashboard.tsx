/**
 * LienDashboard — Lien Deadline Countdown
 * Shows lien notice deadlines from ARIA lien alerts, not waiver documents.
 * Route: /lien (protected)
 *
 * Data source: GET /api/aria/lien-alerts
 * Returns { count, alerts: [{ project_id, project_name, days_remaining, deadline_date, state, notice_type }] }
 */

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Clock, CheckCircle, FileText, ChevronRight, Bell } from 'lucide-react'
import { api } from '@/api/client'
import { safeValidate } from '@/lib/schemas'
import { z } from 'zod'

// ─── Zod schema ──────────────────────────────────────────────────────────────

const LienAlertSchema = z.object({
  project_id: z.number(),
  project_name: z.string(),
  days_remaining: z.number().nullable().optional(),
  deadline_date: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  notice_type: z.string().nullable().optional(),
  lien_amount: z.union([z.string().transform(Number), z.number()]).nullable().optional(),
})

const LienAlertsResponseSchema = z.object({
  count: z.number().optional(),
  alerts: z.array(LienAlertSchema).optional(),
})

type LienAlert = z.infer<typeof LienAlertSchema>

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getUrgencyColor(days: number | null | undefined): string {
  if (days == null) return '#94a3b8'
  if (days < 0) return '#dc2626'       // overdue
  if (days <= 7) return '#dc2626'      // critical
  if (days <= 14) return '#ea580c'     // urgent
  if (days <= 30) return '#d97706'     // warning
  return '#059669'                     // ok
}

function getUrgencyBg(days: number | null | undefined): string {
  if (days == null) return '#f1f5f9'
  if (days < 0) return '#fef2f2'
  if (days <= 7) return '#fef2f2'
  if (days <= 14) return '#fff7ed'
  if (days <= 30) return '#fffbeb'
  return '#ecfdf5'
}

function getUrgencyLabel(days: number | null | undefined): string {
  if (days == null) return 'No deadline set'
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} overdue`
  if (days === 0) return 'Due TODAY'
  if (days === 1) return '1 day left'
  return `${days} days left`
}

function getUrgencyIcon(days: number | null | undefined) {
  if (days == null) return <Clock size={20} />
  if (days < 0 || days <= 7) return <AlertTriangle size={20} />
  if (days <= 30) return <Clock size={20} />
  return <CheckCircle size={20} />
}

function formatDeadlineDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.24 } },
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function LienDashboard() {
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState<LienAlert[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    api.get<unknown>('/api/aria/lien-alerts')
      .then(res => {
        const validated = safeValidate(LienAlertsResponseSchema, res.data, 'lienAlerts')
        if (validated?.alerts) {
          // Sort: overdue first, then closest deadline
          const sorted = [...validated.alerts].sort((a, b) => {
            const da = a.days_remaining ?? 999
            const db = b.days_remaining ?? 999
            return da - db
          })
          setAlerts(sorted)
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  // ── Derived stats ──────────────────────────────────────────────────────────
  const criticalCount = alerts.filter(a => (a.days_remaining ?? 999) <= 7).length
  const warningCount = alerts.filter(a => {
    const d = a.days_remaining ?? 999
    return d > 7 && d <= 30
  }).length
  const okCount = alerts.filter(a => (a.days_remaining ?? 999) > 30).length

  if (isLoading) {
    return (
      <div className="space-y-4" style={{ padding: '24px' }}>
        <div style={{ height: 32, width: 200, background: '#e2e8f0', borderRadius: 6, marginBottom: 8 }} className="animate-pulse" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 88, background: '#e2e8f0', borderRadius: 12 }} className="animate-pulse" />
          ))}
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: 80, background: '#e2e8f0', borderRadius: 12 }} className="animate-pulse" />
        ))}
      </div>
    )
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (alerts.length === 0) {
    return (
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
        style={{ padding: '24px' }}
      >
        <motion.div variants={fadeUp}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>
            Lien Deadlines
          </h1>
          <p style={{ fontSize: 13, color: '#888', fontFamily: "'DM Sans', sans-serif" }}>
            Preliminary notice and lien filing deadlines across all projects
          </p>
        </motion.div>

        <motion.div
          variants={fadeUp}
          style={{
            marginTop: 48,
            textAlign: 'center',
            padding: '56px 32px',
            background: '#f5f3ff',
            borderRadius: 16,
            border: '2px dashed #ddd6fe',
          }}
        >
          <Bell size={48} style={{ color: '#c4b5fd', margin: '0 auto 16px' }} />
          <p style={{ fontSize: 17, fontWeight: 600, color: '#1a1a2e', marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>
            No lien deadlines tracked yet
          </p>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24, maxWidth: 360, margin: '0 auto 24px', fontFamily: "'DM Sans', sans-serif" }}>
            ARIA monitors your active projects for preliminary notice and lien filing deadlines.
            As projects progress, deadline countdowns will appear here.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#7c3aed',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Go to Projects <ChevronRight size={16} />
          </button>
        </motion.div>
      </motion.div>
    )
  }

  // ── Full Dashboard ─────────────────────────────────────────────────────────
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
      style={{ padding: '24px' }}
    >
      {/* Header */}
      <motion.div variants={fadeUp} style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginBottom: 4, fontFamily: "'DM Sans', sans-serif" }}>
          Lien Deadlines
        </h1>
        <p style={{ fontSize: 13, color: '#888', fontFamily: "'DM Sans', sans-serif" }}>
          ARIA is monitoring {alerts.length} lien deadline{alerts.length !== 1 ? 's' : ''} across your projects
        </p>
      </motion.div>

      {/* KPI Summary Row */}
      <motion.div
        variants={fadeUp}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}
      >
        {[
          { label: 'Critical (≤7 days)', value: criticalCount, color: '#dc2626', bg: '#fef2f2', icon: <AlertTriangle size={20} /> },
          { label: 'Warning (≤30 days)', value: warningCount, color: '#d97706', bg: '#fffbeb', icon: <Clock size={20} /> },
          { label: 'On Track (>30 days)', value: okCount, color: '#059669', bg: '#ecfdf5', icon: <CheckCircle size={20} /> },
        ].map(card => (
          <div
            key={card.label}
            style={{ background: card.bg, borderRadius: 12, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 10, background: card.color + '20',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: card.color, flexShrink: 0,
            }}>
              {card.icon}
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#1a1a2e', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
                {card.value}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>
                {card.label}
              </div>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Alert Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {alerts.map(alert => {
          const urgencyColor = getUrgencyColor(alert.days_remaining)
          const urgencyBg = getUrgencyBg(alert.days_remaining)

          return (
            <motion.div
              key={`${alert.project_id}-${alert.notice_type}`}
              variants={fadeUp}
              whileHover={{ y: -1, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
              onClick={() => navigate(`/projects/${alert.project_id}`)}
              style={{
                background: '#fff',
                borderRadius: 12,
                border: `1.5px solid ${urgencyColor}30`,
                padding: '16px 20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
              }}
            >
              {/* Urgency indicator */}
              <div style={{
                width: 48, height: 48, borderRadius: 10,
                background: urgencyBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: urgencyColor, flexShrink: 0,
              }}>
                {getUrgencyIcon(alert.days_remaining)}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e', fontFamily: "'DM Sans', sans-serif" }}>
                    {alert.project_name}
                  </span>
                  {alert.notice_type && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px',
                      borderRadius: 20, background: urgencyColor + '15', color: urgencyColor,
                      fontFamily: "'DM Sans', sans-serif", textTransform: 'capitalize',
                    }}>
                      {alert.notice_type.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', fontFamily: "'DM Sans', sans-serif" }}>
                  {alert.state && `${alert.state} · `}
                  Deadline: {formatDeadlineDate(alert.deadline_date)}
                  {alert.lien_amount != null && ` · ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(alert.lien_amount))}`}
                </div>
              </div>

              {/* Countdown */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 20, fontWeight: 700, color: urgencyColor, lineHeight: 1,
                }}>
                  {alert.days_remaining != null && alert.days_remaining < 0
                    ? `−${Math.abs(alert.days_remaining)}`
                    : alert.days_remaining != null ? `${alert.days_remaining}` : '—'}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
                  {getUrgencyLabel(alert.days_remaining)}
                </div>
              </div>

              <ChevronRight size={16} style={{ color: '#94a3b8', flexShrink: 0 }} />
            </motion.div>
          )
        })}
      </div>

      {/* Footer note */}
      <motion.div
        variants={fadeUp}
        style={{
          marginTop: 28,
          padding: '12px 16px',
          background: '#f8fafc',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <FileText size={14} style={{ color: '#64748b', flexShrink: 0 }} />
        <p style={{ fontSize: 12, color: '#64748b', fontFamily: "'DM Sans', sans-serif" }}>
          Lien deadlines vary by state. Always verify with a licensed attorney in your jurisdiction.
          ARIA provides estimates based on project and contract dates.
        </p>
      </motion.div>
    </motion.div>
  )
}
