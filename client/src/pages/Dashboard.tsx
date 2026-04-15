/**
 * Dashboard — Main Contractor view
 * State 1: Empty (no projects) → EmptyState
 * State 2: With projects → KPI cards + project list + filters
 *
 * Design System:
 * - Background: #f0f4fa, Cards: #ffffff + border
 * - Blue #2563eb primary, Orange #ea6c00 secondary
 * - Green #00b87a, Amber #d97706, Red #dc2626
 * - Headlines: DM Serif Display, Body: DM Sans, Money: JetBrains Mono
 * - Framer Motion: staggerChildren for list, whileHover for cards
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2,
  FileText,
  Clock,
  CheckCircle2,
  Plus,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'

import type { Project } from '@/types'
import { useProjects } from '@/hooks/useProjects'
import { useReports } from '@/hooks/useReports'
import { useTrial } from '@/hooks/useTrial'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatCurrency,
} from '@/lib/formatters'
import { StripeConnectBanner } from '@/components/payments/StripeConnectBanner'
import { CashFlowForecast } from '@/features/aria/CashFlowForecast'

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
}

const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25 } },
}

// ============================================================================
// KPI CARD
// ============================================================================

interface KPICardProps {
  icon: React.ElementType
  label: string
  value: string
  trend?: 'up' | 'down'
  change?: string
  gradient: string
  isLoading: boolean
  onClick?: () => void
}

function KPICard({
  icon: Icon,
  label,
  value,
  trend,
  change,
  gradient,
  isLoading,
  onClick,
}: KPICardProps) {
  return (
    <motion.div variants={cardVariants}>
      <div
        onClick={onClick}
        className={`rounded-2xl bg-white border-1.5 border-[#e2e8f0] shadow-[0_4px_24px_rgba(37,99,235,0.08)] p-6 ${
          onClick ? 'cursor-pointer hover:shadow-[0_8px_40px_rgba(37,99,235,0.12)] hover:border-[#2563eb]/20' : ''
        } transition-all duration-200`}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs font-medium text-[#64748b] uppercase tracking-0.5">
              {label}
            </p>
            <div className="mt-3">
              {isLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <p
                  className="text-2xl font-bold text-[#0f172a]"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {value}
                </p>
              )}
            </div>
            {change && !isLoading && (
              <div className="mt-2 flex items-center gap-1">
                {trend === 'up' ? (
                  <TrendingUp className="w-3.5 h-3.5 text-[#00b87a]" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-[#dc2626]" />
                )}
                <span
                  className={`text-xs font-medium ${
                    trend === 'up'
                      ? 'text-[#00b87a]'
                      : 'text-[#dc2626]'
                  }`}
                >
                  {change}
                </span>
              </div>
            )}
          </div>
          <div
            className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0`}
          >
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ============================================================================
// PROJECT ROW
// ============================================================================

interface ProjectRowProps {
  project: Project
  index?: number
}

function ProjectRow({ project }: ProjectRowProps) {
  const payAppCount = project.pay_app_count || 0
  const statusDisplay =
    project.status === 'completed'
      ? 'Completed'
      : project.payment_terms === 'draft'
        ? 'Draft'
        : project.payment_terms === 'in progress'
          ? 'In Progress'
          : 'Active'

  const statusColor =
    statusDisplay === 'Completed'
      ? 'bg-[#f0fdf4] text-[#15803d] border border-[#86efac]'
      : statusDisplay === 'Draft'
        ? 'bg-[#f8f9fa] text-[#64748b] border border-[#e2e8f0]'
        : statusDisplay === 'In Progress'
          ? 'bg-[#fffbeb] text-[#b45309] border border-[#fcd34d]'
          : 'bg-[#eff6ff] text-[#0284c7] border border-[#bae6fd]'

  return (
    <motion.div variants={itemVariants}>
      <Link to={`/projects/${project.id}`}>
        <div
          className="flex items-center justify-between p-4 rounded-xl border-1.5 border-[#e2e8f0]
          bg-white hover:bg-[#f8f9fa] hover:border-[#2563eb]/20 hover:shadow-[0_4px_16px_rgba(37,99,235,0.08)]
          transition-all duration-200 cursor-pointer"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[#0f172a] truncate">
                {project.name}
              </p>
              {payAppCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium
                  rounded-full bg-[#eff6ff] text-[#2563eb] border border-[#bae6fd] shrink-0">
                  <FileText className="w-3 h-3" />
                  {payAppCount}
                </span>
              )}
            </div>
            <p className="text-xs text-[#64748b] mt-1">
              {formatCurrency(project.original_contract || 0)} contract
              {project.owner && ` · ${project.owner}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1.5 text-xs font-medium rounded-full ${statusColor}`}>
              {statusDisplay}
            </span>
            <ArrowUpRight className="w-4 h-4 text-[#94a3b8] flex-shrink-0" />
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

// ============================================================================
// FILTER CHIP
// ============================================================================

interface FilterChipProps {
  icon: string
  label: string
  count?: number
  active: boolean
  onClick: () => void
}

function FilterChip({ icon, label, count, active, onClick }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all flex items-center gap-1.5 ${
        active
          ? 'bg-[#2563eb] text-white'
          : 'bg-white border-1.5 border-[#e2e8f0] text-[#64748b] hover:border-[#2563eb]/30'
      }`}
    >
      {icon && <span>{icon}</span>}
      {label}
      {count !== undefined && <span className="text-[0.7rem]">({count})</span>}
    </button>
  )
}

// ============================================================================
// EMPTY STATE
// ============================================================================

function EmptyState() {
  const { isTrialGated } = useTrial()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white border-1.5 border-[#e2e8f0] p-12 text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-[#eff6ff] flex items-center justify-center mx-auto mb-4">
        <Building2 className="w-8 h-8 text-[#2563eb]" />
      </div>
      <h2 className="text-lg font-bold text-[#0f172a] mb-2">
        Welcome to ConstructInvoice AI
      </h2>
      <p className="text-sm text-[#64748b] max-w-sm mx-auto mb-6">
        Create your first project and upload a Schedule of Values to start generating G702/G703 pay applications instantly.
      </p>
      <Link to="/projects/new">
        <Button
          disabled={isTrialGated}
          className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl gap-2 inline-flex"
        >
          <Plus className="w-4 h-4" />
          Create First Project
        </Button>
      </Link>
    </motion.div>
  )
}

// ============================================================================
// MAIN DASHBOARD
// ============================================================================

export function Dashboard() {
  const { projects, isLoading: projectsLoading } = useProjects()
  const { stats, isLoading: statsLoading } = useReports()
  const { isTrialGated } = useTrial()
  const { user } = useAuth()

  const [filterType, setFilterType] = useState<'all' | 'overdue' | 'lien' | 'ready' | 'new'>('all')

  // Compute KPI values
  const totalPipeline = useMemo(
    () => projects.reduce((sum, p) => sum + parseFloat(String(p.original_contract || '0')), 0),
    [projects],
  )

  const totalBilled = stats?.total_billed || 0
  const totalOutstanding = stats?.outstanding || 0
  const totalCollected = totalBilled - totalOutstanding

  // Simulated filter counts (replace with real data)
  const filterCounts = useMemo(
    () => ({
      overdue: 0,
      lien: 0,
      ready: 0,
      new: 0,
    }),
    [],
  )

  // Sort projects by creation date
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [projects],
  )

  const isLoading = projectsLoading || statsLoading
  const hasProjects = !isLoading && sortedProjects.length > 0

  return (
    <div className="min-h-screen bg-[#f0f4fa] p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Trial banner */}
        <AnimatePresence>
          {isTrialGated && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-xl bg-[#fef3c7] border-1.5 border-[#fcd34d] p-4"
            >
              <p className="text-sm text-[#92400e]">
                <strong>Trial ended.</strong> You can view existing projects in read-only mode.{' '}
                <Link
                  to="/settings"
                  className="font-semibold text-[#b45309] underline hover:text-[#92400e]"
                >
                  Upgrade to Pro
                </Link>
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stripe banner */}
        <StripeConnectBanner />

        {/* Page header */}
        {hasProjects && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between"
          >
            <div>
              <h1 className="text-2xl font-bold text-[#0f172a]">Dashboard</h1>
              <p className="text-sm text-[#64748b] mt-1">
                Welcome back, {user?.name || 'Contractor'}. Here's your billing overview.
              </p>
            </div>
            <Link to="/projects/new">
              <Button
                disabled={isTrialGated}
                className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl gap-2"
              >
                <Plus className="w-4 h-4" />
                New Project
              </Button>
            </Link>
          </motion.div>
        )}

        {/* Content */}
        {!hasProjects && !isLoading ? (
          <EmptyState />
        ) : (
          <>
            {/* KPI Cards */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5"
            >
              <KPICard
                icon={Building2}
                label="Total Pipeline"
                value={formatCurrency(totalPipeline)}
                gradient="from-[#2563eb] to-[#1d4ed8]"
                isLoading={isLoading}
              />
              <KPICard
                icon={FileText}
                label="Total Billed"
                value={formatCurrency(totalBilled)}
                trend="up"
                change="+8.2%"
                gradient="from-[#00b87a] to-[#059669]"
                isLoading={isLoading}
              />
              <KPICard
                icon={Clock}
                label="Outstanding"
                value={formatCurrency(totalOutstanding)}
                trend="down"
                change="-2.1%"
                gradient="from-[#d97706] to-[#ea6c00]"
                isLoading={isLoading}
              />
              <KPICard
                icon={CheckCircle2}
                label="Collected"
                value={formatCurrency(totalCollected)}
                trend="up"
                change="+12.5%"
                gradient="from-[#7c3aed] to-[#6d28d9]"
                isLoading={isLoading}
              />
            </motion.div>

            {/* Cash Flow Forecast */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="rounded-2xl bg-white border-1.5 border-[#e2e8f0] p-6
              shadow-[0_4px_24px_rgba(37,99,235,0.08)]"
            >
              <h2 className="text-lg font-bold text-[#0f172a] mb-6">
                30-Day Cash Flow Forecast
              </h2>
              <CashFlowForecast />
            </motion.div>

            {/* Filter chips */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex gap-2 overflow-x-auto pb-2"
            >
              <FilterChip
                icon="📋"
                label="All"
                active={filterType === 'all'}
                onClick={() => setFilterType('all')}
              />
              <FilterChip
                icon="🔴"
                label="Overdue"
                count={filterCounts.overdue}
                active={filterType === 'overdue'}
                onClick={() => setFilterType('overdue')}
              />
              <FilterChip
                icon="⚠️"
                label="Lien Due"
                count={filterCounts.lien}
                active={filterType === 'lien'}
                onClick={() => setFilterType('lien')}
              />
              <FilterChip
                icon="💰"
                label="Ready to Bill"
                count={filterCounts.ready}
                active={filterType === 'ready'}
                onClick={() => setFilterType('ready')}
              />
              <FilterChip
                icon="📥"
                label="New Docs"
                count={filterCounts.new}
                active={filterType === 'new'}
                onClick={() => setFilterType('new')}
              />
            </motion.div>

            {/* Project list */}
            <div className="rounded-2xl bg-white border-1.5 border-[#e2e8f0] p-6
            shadow-[0_4px_24px_rgba(37,99,235,0.08)]">
              <h2 className="text-lg font-bold text-[#0f172a] mb-4">
                Active Projects
              </h2>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 rounded-xl" />
                  ))}
                </div>
              ) : (
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="space-y-3"
                >
                  {sortedProjects.length === 0 ? (
                    <p className="text-sm text-[#94a3b8] text-center py-8">
                      No projects yet. Create one to get started.
                    </p>
                  ) : (
                    sortedProjects.map((project, i) => (
                      <ProjectRow
                        key={project.id}
                        project={project}
                        index={i}
                      />
                    ))
                  )}
                </motion.div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
