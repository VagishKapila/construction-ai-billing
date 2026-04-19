/**
 * Dashboard — Main view for ConstructInvoice AI
 * Layout: ARIAStrip → Hero row → KPI row → Filter chips → Project cards
 *
 * CASE 1: Zero projects → EmptyState (onboarding)
 * CASE 2: Has projects → Full dashboard with ARIA briefing, hero cards, KPIs, filter+sort, project list
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, type Variants } from 'framer-motion'

import { useProjects } from '@/hooks/useProjects'
import { useReports } from '@/hooks/useReports'
import { useTrial } from '@/hooks/useTrial'
import { useAuth } from '@/contexts/AuthContext'

import { ARIAStrip } from '@/components/shared/ARIAStrip'
import { KPICard } from '@/components/shared/KPICard'
import { ProjectCard } from '@/components/shared/ProjectCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { StripeConnectBanner } from '@/components/payments/StripeConnectBanner'

import { formatMoney } from '@/utils/formatMoney'
import { safeValidate } from '@/lib/schemas'
import { api } from '@/api/client'

import { z } from 'zod'
import type { Project } from '@/types'
import { Link } from 'react-router-dom'

// ─── Zod Schemas for per-project API responses ────────────────────────────────

const PayAppSummarySchema = z.object({
  id: z.number(),
  app_number: z.number(),
  project_id: z.number().optional(),
  status: z.string(),
  amount_due: z.union([z.string().transform(Number), z.number()]).nullable().optional(),
  period_label: z.string().nullable().optional(),
  created_at: z.string(),
  payment_link_token: z.string().nullable().optional(),
  payment_status: z.string().nullable().optional(),
  payment_due_date: z.string().nullable().optional(),
})

const TradeSummarySchema = z.object({
  id: z.number(),
  trade_name: z.string(),
  company_name: z.string().nullable().optional(),
  trust_score: z.union([z.string().transform(Number), z.number()]).nullable().optional(),
  status: z.string().nullable().optional(),
})

const LienAlertsResponseSchema = z.object({
  count: z.number().optional(),
  alerts: z.array(z.object({
    project_id: z.number(),
    project_name: z.string(),
    days_remaining: z.number().nullable().optional(),
  })).optional(),
})

type PayAppSummary = z.infer<typeof PayAppSummarySchema>
type TradeSummary = z.infer<typeof TradeSummarySchema>

// ─── Animation variants ───────────────────────────────────────────────────────

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
}

const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28 } },
}

// ─── Filter / Sort types ──────────────────────────────────────────────────────

const FILTER_CHIPS = ['All', '🔴 Overdue', '⚠️ Lien Due', '💰 Ready to Bill', '📥 New Docs'] as const
type FilterChip = typeof FILTER_CHIPS[number]

const SORT_OPTIONS = [
  { value: 'aria', label: '🤖 ARIA: Urgent first' },
  { value: 'date', label: '📅 Date (newest)' },
  { value: 'amount', label: '💰 Amount (highest)' },
  { value: 'alpha', label: '🔤 A–Z' },
] as const
type SortOption = typeof SORT_OPTIONS[number]['value']

// ─── Per-project data (fetched lazily in ProjectCard via ProjectCardWrapper) ──

interface ProjectRowData {
  project: Project
  payApps: PayAppSummary[]
  trades: TradeSummary[]
  isOverdue: boolean
  hasNewDocs: boolean
  urgency: 'urgent' | 'action' | 'healthy'
}

// ─── Determine urgency for ARIA sort ─────────────────────────────────────────

function getUrgency(_project: Project, payApps: PayAppSummary[]): 'urgent' | 'action' | 'healthy' {
  const hasOverdue = payApps.some(pa => pa.payment_status === 'overdue' || pa.status === 'overdue')
  if (hasOverdue) return 'urgent'
  const hasSubmitted = payApps.some(pa => pa.status === 'submitted' && pa.payment_status !== 'paid')
  if (hasSubmitted) return 'action'
  return 'healthy'
}

// ─── Sort projects by ARIA urgency ───────────────────────────────────────────

function sortByARIA(rows: ProjectRowData[]): ProjectRowData[] {
  const PRIORITY: Record<string, number> = { urgent: 0, action: 1, healthy: 2 }
  return [...rows].sort((a, b) => {
    const pa = PRIORITY[a.urgency] ?? 3
    const pb = PRIORITY[b.urgency] ?? 3
    if (pa !== pb) return pa - pb
    // secondary: alphabetical
    return a.project.name.localeCompare(b.project.name)
  })
}

// ─── ProjectCardWrapper: fetches pay apps + trades per project ────────────────

function ProjectCardWrapper({
  project,
  onReady,
}: {
  project: Project
  onReady: (data: ProjectRowData) => void
}) {
  const navigate = useNavigate()

  const [payApps, setPayApps] = useState<PayAppSummary[]>([])
  const [trades, setTrades] = useState<TradeSummary[]>([])
  const [fetched, setFetched] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [paRes, trRes] = await Promise.allSettled([
          api.get<unknown>(`/api/projects/${project.id}/pay-apps`),
          api.get<unknown>(`/api/hub/projects/${project.id}/trades`),
        ])

        if (cancelled) return

        let resolvedPayApps: PayAppSummary[] = []
        if (paRes.status === 'fulfilled' && Array.isArray(paRes.value?.data)) {
          const validated = paRes.value.data.map((pa: unknown) =>
            safeValidate(PayAppSummarySchema, pa, `payApp-${project.id}`)
          ).filter(Boolean) as PayAppSummary[]
          resolvedPayApps = validated
        }

        let resolvedTrades: TradeSummary[] = []
        if (trRes.status === 'fulfilled' && Array.isArray(trRes.value?.data)) {
          const validated = trRes.value.data.map((t: unknown) =>
            safeValidate(TradeSummarySchema, t, `trade-${project.id}`)
          ).filter(Boolean) as TradeSummary[]
          resolvedTrades = validated
        }

        setPayApps(resolvedPayApps)
        setTrades(resolvedTrades)
        setFetched(true)

        const isOverdue = resolvedPayApps.some(
          pa => pa.payment_status === 'overdue' || pa.status === 'overdue'
        )
        const urgency = getUrgency(project, resolvedPayApps)
        onReady({
          project,
          payApps: resolvedPayApps,
          trades: resolvedTrades,
          isOverdue,
          hasNewDocs: false,
          urgency,
        })
      } catch {
        setFetched(true)
      }
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  const handleCreatePayApp = useCallback(() => {
    navigate(`/projects/${project.id}`)
  }, [navigate, project.id])

  const handleArchive = useCallback(() => {
    // Archive action — navigate to project for now
    navigate(`/projects/${project.id}`)
  }, [navigate, project.id])

  const handleClick = useCallback(() => {
    navigate(`/projects/${project.id}`)
  }, [navigate, project.id])

  const handleDownloadPdf = useCallback((payAppId: number) => {
    window.open(`/api/payapps/${payAppId}/pdf`, '_blank')
  }, [])

  const handleSendEmail = useCallback((payAppId: number) => {
    navigate(`/projects/${project.id}/pay-app/${payAppId}?send=1`)
  }, [navigate, project.id])

  const handleShareLink = useCallback((payAppId: number) => {
    const pa = payApps.find(p => p.id === payAppId)
    if (pa?.payment_link_token) {
      navigator.clipboard?.writeText(`${window.location.origin}/pay/${pa.payment_link_token}`)
    }
  }, [payApps])

  if (!fetched) {
    return (
      <div
        style={{
          height: 120,
          background: '#fff',
          borderRadius: 12,
          marginBottom: 12,
          border: '1.5px solid #e2e8f0',
          opacity: 0.6,
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
    )
  }

  return (
    <motion.div variants={fadeUpItem}>
      <ProjectCard
        project={project}
        trades={trades}
        payApps={payApps}
        urgency={getUrgency(project, payApps)}
        onCreatePayApp={handleCreatePayApp}
        onArchive={handleArchive}
        onClick={handleClick}
        onDownloadPdf={handleDownloadPdf}
        onSendEmail={handleSendEmail}
        onShareLink={handleShareLink}
      />
    </motion.div>
  )
}

// ─── Hero Card: Ready to Bill ─────────────────────────────────────────────────

function ReadyToBillCard({
  readyToBill,
  totalPipeline,
  totalBilled,
  pendingPayApps,
  approvedInvoices,
  onCTA,
  onCardClick,
}: {
  readyToBill: number
  totalPipeline: number
  totalBilled: number
  pendingPayApps: number
  approvedInvoices: number
  onCTA: () => void
  onCardClick: () => void
}) {
  return (
    <motion.div
      variants={fadeUpItem}
      whileHover={{ y: -2, boxShadow: '0 8px 40px rgba(37,99,235,0.22)' }}
      style={{
        flex: 2,
        background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
        borderRadius: 14,
        padding: 28,
        color: '#fff',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
      onClick={onCardClick}
    >
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '1px',
        textTransform: 'uppercase',
        opacity: 0.85,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        READY TO BILL
      </div>

      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 36,
        fontWeight: 700,
        letterSpacing: '-0.5px',
        lineHeight: 1.1,
        margin: '4px 0',
      }}>
        {formatMoney(readyToBill)}
      </div>

      <div style={{ fontSize: 13, opacity: 0.85, fontFamily: "'DM Sans', sans-serif" }}>
        Contract: {formatMoney(totalPipeline)} · Billed: {formatMoney(totalBilled)}
      </div>

      <div style={{ fontSize: 12, opacity: 0.75, fontFamily: "'DM Sans', sans-serif" }}>
        {pendingPayApps} pay app{pendingPayApps !== 1 ? 's' : ''} pending
        {approvedInvoices > 0 ? ` · ${approvedInvoices} invoice${approvedInvoices !== 1 ? 's' : ''} approved` : ''}
      </div>

      <motion.div
        whileHover={{ scale: 1.03, boxShadow: '0 6px 20px rgba(0,0,0,0.15)' }}
        whileTap={{ scale: 0.98 }}
        onClick={(e) => { e.stopPropagation(); onCTA() }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 10,
          padding: '12px 24px',
          background: '#fff',
          color: '#2563eb',
          borderRadius: 9,
          fontWeight: 700,
          fontSize: 15,
          cursor: 'pointer',
          alignSelf: 'flex-start',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        📄 Create Pay App →
      </motion.div>
    </motion.div>
  )
}

// ─── Hero Card: Lien Deadlines ────────────────────────────────────────────────

function LienDeadlinesCard({
  lienCount,
  urgentDays,
}: {
  lienCount: number
  urgentDays: number | null
}) {
  const navigate = useNavigate()
  const isUrgent = urgentDays !== null && urgentDays < 30

  return (
    <motion.div
      variants={fadeUpItem}
      whileHover={{ y: -2, boxShadow: '0 8px 40px rgba(124,58,237,0.15)' }}
      onClick={() => navigate('/lien')}
      style={{
        flex: 1,
        background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
        border: '1.5px solid #ddd6fe',
        borderRadius: 14,
        padding: 24,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '1px',
        textTransform: 'uppercase',
        color: '#7c3aed',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        ⚠️ LIEN DEADLINES
      </div>

      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 36,
        fontWeight: 700,
        color: '#7c3aed',
        lineHeight: 1.1,
        margin: '4px 0',
      }}>
        {lienCount}
      </div>

      <div style={{ fontSize: 13, color: '#64748b', fontFamily: "'DM Sans', sans-serif" }}>
        notices due this month
      </div>

      {isUrgent && urgentDays !== null && (
        <div style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#dc2626',
          fontFamily: "'JetBrains Mono', monospace",
          marginTop: 4,
        }}>
          {urgentDays} day{urgentDays !== 1 ? 's' : ''} — URGENT
        </div>
      )}

      <div style={{
        fontSize: 12,
        color: '#7c3aed',
        fontWeight: 600,
        marginTop: 8,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        View Lien Alerts →
      </div>
    </motion.div>
  )
}

// ─── Hero Card: Retention Held ────────────────────────────────────────────────

function RetentionHeldCard({
  retentionHeld,
  projectCount,
}: {
  retentionHeld: number
  projectCount: number
}) {
  const navigate = useNavigate()

  return (
    <motion.div
      variants={fadeUpItem}
      whileHover={{ y: -2, boxShadow: '0 8px 40px rgba(217,119,6,0.15)' }}
      onClick={() => navigate('/retention')}
      style={{
        flex: 1,
        background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
        border: '1.5px solid #fde68a',
        borderRadius: 14,
        padding: 24,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '1px',
        textTransform: 'uppercase',
        color: '#d97706',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        💰 RETENTION HELD
      </div>

      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 36,
        fontWeight: 700,
        color: '#92400e',
        lineHeight: 1.1,
        margin: '4px 0',
      }}>
        {formatMoney(retentionHeld)}
      </div>

      <div style={{ fontSize: 13, color: '#64748b', fontFamily: "'DM Sans', sans-serif" }}>
        Across {projectCount} project{projectCount !== 1 ? 's' : ''}
      </div>

      <div style={{
        fontSize: 12,
        color: '#d97706',
        fontWeight: 600,
        marginTop: 8,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        View Retention Breakdown →
      </div>
    </motion.div>
  )
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div style={{ padding: 24, background: '#f0f4fa', minHeight: '100%' }}>
      {/* ARIA strip skeleton */}
      <div style={{ height: 68, background: '#e2e8f0', borderRadius: 12, marginBottom: 20, opacity: 0.7 }} />
      {/* Hero row skeleton */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <div style={{ flex: 2, height: 180, background: '#e2e8f0', borderRadius: 14, opacity: 0.7 }} />
        <div style={{ flex: 1, height: 180, background: '#e2e8f0', borderRadius: 14, opacity: 0.7 }} />
        <div style={{ flex: 1, height: 180, background: '#e2e8f0', borderRadius: 14, opacity: 0.7 }} />
      </div>
      {/* KPI row skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 20 }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{ height: 90, background: '#e2e8f0', borderRadius: 12, opacity: 0.7 }} />
        ))}
      </div>
      {/* Project cards skeleton */}
      {[1, 2, 3].map(i => (
        <div key={i} style={{ height: 130, background: '#e2e8f0', borderRadius: 12, marginBottom: 14, opacity: 0.7 }} />
      ))}
    </div>
  )
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────

export function Dashboard() {
  const navigate = useNavigate()
  const { projects, isLoading } = useProjects()
  const { stats, revenueSummary } = useReports()
  const { isTrialGated } = useTrial()
  const { user } = useAuth()

  const [activeFilter, setActiveFilter] = useState<FilterChip>('All')
  const [sortBy, setSortBy] = useState<SortOption>('aria')
  const [rowDataMap, setRowDataMap] = useState<Map<number, ProjectRowData>>(new Map())
  const [lienCount, setLienCount] = useState<number>(0)
  const [lienUrgentDays, setLienUrgentDays] = useState<number | null>(null)

  const firstName = user?.name?.split(' ')[0] || ''

  // ── Fetch lien alerts ──────────────────────────────────────────────────────
  useEffect(() => {
    if (projects.length === 0) return
    api.get<unknown>('/api/aria/lien-alerts')
      .then(res => {
        const validated = safeValidate(LienAlertsResponseSchema, res.data, 'lienAlerts')
        if (validated) {
          setLienCount(validated.count ?? validated.alerts?.length ?? 0)
          const urgent = validated.alerts?.find(a => a.days_remaining !== null && a.days_remaining !== undefined && a.days_remaining < 30)
          setLienUrgentDays(urgent?.days_remaining ?? null)
        }
      })
      .catch(() => {})
  }, [projects.length])

  // ── Callback from ProjectCardWrapper when it finishes loading ─────────────
  const handleProjectReady = useCallback((data: ProjectRowData) => {
    setRowDataMap(prev => {
      const next = new Map(prev)
      next.set(data.project.id, data)
      return next
    })
  }, [])

  // ── Derived values ─────────────────────────────────────────────────────────
  const totalPipeline = projects.reduce((s, p) => s + (Number(p.original_contract) || 0), 0)
  const totalBilled = stats?.total_billed ?? 0
  const totalOutstanding = stats?.outstanding ?? 0
  // Use actual collected amount from payments table (not derived)
  const totalCollected = stats?.total_paid ?? Math.max(0, totalBilled - totalOutstanding)
  const readyToBill = Math.max(0, totalPipeline - totalBilled)
  const retentionHeld =
    stats?.total_retention != null && stats.total_retention > 0
      ? Number(stats.total_retention)
      : revenueSummary?.total_retainage != null
        ? Number(revenueSummary.total_retainage)
        : 0

  // Count pending pay apps from loaded row data
  const pendingPayApps = Array.from(rowDataMap.values()).reduce((n, row) => {
    return n + row.payApps.filter(pa => pa.status === 'submitted' || pa.status === 'draft').length
  }, 0)

  // Count approved invoices from loaded row data
  const approvedInvoices = Array.from(rowDataMap.values()).reduce((n, row) => {
    return n + row.payApps.filter(pa => pa.status === 'approved').length
  }, 0)

  // ── ARIA message ───────────────────────────────────────────────────────────
  const urgentCount = Array.from(rowDataMap.values()).filter(r => r.urgency === 'urgent').length
  const pendingDocsCount = Array.from(rowDataMap.values()).filter(r => r.hasNewDocs).length
  const ariaMessage = (() => {
    if (urgentCount > 0) {
      return `Good morning, ${firstName}. ${urgentCount} project${urgentCount !== 1 ? 's' : ''} need${urgentCount === 1 ? 's' : ''} attention${pendingDocsCount > 0 ? ` · ${pendingDocsCount} hub doc${pendingDocsCount !== 1 ? 's' : ''} pending` : ''}.`
    }
    if (totalOutstanding > 0) {
      return `Good morning, ${firstName}. ${formatMoney(totalOutstanding)} outstanding across ${projects.length} project${projects.length !== 1 ? 's' : ''}. Click to view cash flow.`
    }
    return `Good morning, ${firstName}. ARIA is monitoring ${projects.length} project${projects.length !== 1 ? 's' : ''}. Everything looks on track.`
  })()

  // ── Filter + Sort projects ─────────────────────────────────────────────────
  const filteredProjects = projects.filter(p => {
    if (activeFilter === 'All') return true
    const row = rowDataMap.get(p.id)
    if (!row) return false
    if (activeFilter === '🔴 Overdue') return row.isOverdue
    if (activeFilter === '⚠️ Lien Due') return false // would need lien per-project data
    if (activeFilter === '💰 Ready to Bill') {
      const contract = Number(p.original_contract) || 0
      const billed = row.payApps.reduce((s, pa) => s + (Number(pa.amount_due) || 0), 0)
      return contract > billed
    }
    if (activeFilter === '📥 New Docs') return row.hasNewDocs
    return true
  })

  const sortedProjects = (() => {
    const rows = filteredProjects.map(p => rowDataMap.get(p.id) ?? {
      project: p, payApps: [], trades: [], isOverdue: false, hasNewDocs: false, urgency: 'healthy' as const
    })

    if (sortBy === 'aria') return sortByARIA(rows).map(r => r.project)
    if (sortBy === 'date') return [...filteredProjects].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    if (sortBy === 'amount') return [...filteredProjects].sort((a, b) =>
      (Number(b.original_contract) || 0) - (Number(a.original_contract) || 0)
    )
    if (sortBy === 'alpha') return [...filteredProjects].sort((a, b) => a.name.localeCompare(b.name))
    return filteredProjects
  })()

  // ── Most recent active project for CTA ────────────────────────────────────
  const mostRecentProject = projects.find(p => p.status !== 'completed') ?? projects[0]

  const handleCreatePayAppCTA = useCallback(() => {
    if (mostRecentProject) {
      navigate(`/projects/${mostRecentProject.id}`)
    } else {
      navigate('/projects/new')
    }
  }, [navigate, mostRecentProject])

  const scrollToProjects = useCallback(() => {
    const el = document.getElementById('project-cards')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return <DashboardSkeleton />
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!isLoading && projects.length === 0) {
    return (
      <EmptyState
        firstName={firstName}
        onCreateProject={() => navigate('/projects/new')}
      />
    )
  }

  // ── Full Dashboard ─────────────────────────────────────────────────────────
  return (
    <div
      data-testid="dashboard"
      style={{ padding: 24, background: '#f0f4fa', minHeight: '100%' }}
    >
      {/* Stripe Connect Banner */}
      <StripeConnectBanner />

      {/* Trial expired banner */}
      {isTrialGated && (
        <div style={{
          background: '#fef3c7',
          border: '1px solid #fde68a',
          borderRadius: 8,
          padding: '10px 16px',
          marginBottom: 16,
          fontSize: 13,
          color: '#92400e',
          fontWeight: 600,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          ⏰ Your trial has ended.{' '}
          <Link to="/settings#billing" style={{ color: '#2563eb' }}>
            Upgrade to Pro
          </Link>{' '}
          to continue creating pay apps.
        </div>
      )}

      <motion.div variants={staggerContainer} initial="hidden" animate="visible">

        {/* ── ROW 1: ARIA Strip ───────────────────────────────────────────── */}
        <motion.div variants={fadeUpItem}>
          <ARIAStrip
            message={ariaMessage}
            variant={urgentCount > 0 ? 'alert' : totalOutstanding > 0 ? 'alert' : 'morning'}
            actionLabel={urgentCount > 0 ? 'View Urgent →' : totalOutstanding > 0 ? 'View Cash Flow →' : undefined}
            onAction={urgentCount > 0 ? () => setActiveFilter('🔴 Overdue') : totalOutstanding > 0 ? () => navigate('/cash-flow') : undefined}
          />
        </motion.div>

        {/* ── ROW 2: Hero Row ─────────────────────────────────────────────── */}
        <motion.div
          variants={fadeUpItem}
          style={{
            display: 'flex',
            gap: 16,
            marginBottom: 20,
            flexWrap: 'wrap',
          }}
        >
          <ReadyToBillCard
            readyToBill={readyToBill}
            totalPipeline={totalPipeline}
            totalBilled={totalBilled}
            pendingPayApps={pendingPayApps}
            approvedInvoices={approvedInvoices}
            onCTA={handleCreatePayAppCTA}
            onCardClick={scrollToProjects}
          />
          <LienDeadlinesCard
            lienCount={lienCount}
            urgentDays={lienUrgentDays}
          />
          <RetentionHeldCard
            retentionHeld={retentionHeld}
            projectCount={projects.length}
          />
        </motion.div>

        {/* ── ROW 3: KPI Cards ────────────────────────────────────────────── */}
        <motion.div
          variants={fadeUpItem}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 12,
            marginBottom: 20,
          }}
          className="kpi-grid"
        >
          <KPICard
            label="Pipeline"
            value={formatMoney(totalPipeline)}
            isMoney
            onClick={scrollToProjects}
          />
          <KPICard
            label="Outstanding"
            value={formatMoney(totalOutstanding)}
            isMoney
            onClick={() => navigate('/cash-flow')}
          />
          <KPICard
            label="Collected"
            value={formatMoney(totalCollected)}
            isMoney
            onClick={() => navigate('/payments')}
          />
          <KPICard
            label="Hub Docs Pending"
            value={pendingDocsCount > 0 ? String(pendingDocsCount) : '—'}
            onClick={scrollToProjects}
          />
          <KPICard
            label="Avg Days to Pay"
            value="—"
            onClick={() => navigate('/reports')}
          />
        </motion.div>

        {/* ── ROW 4: Filter chips + sort dropdown ─────────────────────────── */}
        <motion.div
          variants={fadeUpItem}
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
          data-testid="filter-row"
        >
          {FILTER_CHIPS.map(chip => (
            <button
              key={chip}
              data-testid={`filter-chip-${chip}`}
              onClick={() => setActiveFilter(chip)}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                border: '1.5px solid',
                borderColor: activeFilter === chip ? '#2563eb' : '#e2e8f0',
                background: activeFilter === chip ? '#2563eb' : '#fff',
                color: activeFilter === chip ? '#fff' : '#1e293b',
                transition: 'all 0.15s ease',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {chip}{chip === 'All' ? ` (${projects.length})` : ''}
            </button>
          ))}

          <div style={{ marginLeft: 'auto' }}>
            <select
              data-testid="sort-select"
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortOption)}
              style={{
                padding: '8px 12px',
                border: '1.5px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 12,
                background: '#fff',
                cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                color: '#1e293b',
              }}
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </motion.div>

        {/* ── ROW 5: Project cards ─────────────────────────────────────────── */}
        <motion.div
          id="project-cards"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          data-testid="project-list"
        >
          {sortedProjects.length === 0 ? (
            <motion.div
              variants={fadeUpItem}
              style={{
                textAlign: 'center',
                padding: '48px 24px',
                background: '#fff',
                borderRadius: 12,
                border: '1.5px solid #e2e8f0',
                color: '#64748b',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              No projects match this filter.{' '}
              <button
                onClick={() => setActiveFilter('All')}
                style={{
                  color: '#2563eb',
                  fontWeight: 600,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Show all
              </button>
            </motion.div>
          ) : (
            sortedProjects.map(project => (
              <div key={project.id} style={{ marginBottom: 14 }}>
                <ProjectCardWrapper
                  project={project}
                  onReady={handleProjectReady}
                />
              </div>
            ))
          )}
        </motion.div>

      </motion.div>
    </div>
  )
}

export default Dashboard
