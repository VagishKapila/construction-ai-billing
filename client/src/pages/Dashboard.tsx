import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FolderOpen,
  Clock,
  TrendingUp,
  TrendingDown,
  Plus,
  ArrowUpRight,
  Building2,
  FileText,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react'
import type { Project } from '@/types'
import { useProjects } from '@/hooks/useProjects'
import { useReports } from '@/hooks/useReports'
import { useTrial } from '@/hooks/useTrial'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spotlight } from '@/components/aceternity/spotlight'
import {
  CardContainer,
  CardBody,
  CardItem,
} from '@/components/aceternity/3d-card'
import {
  formatCurrency,
  formatRelativeDate,
} from '@/lib/formatters'
import { StripeConnectBanner, StripeActiveBadge } from '@/components/payments/StripeConnectBanner'
import { CashFlowForecast } from '@/features/aria/CashFlowForecast'

// ---------------------------------------------------------------------------
// Animation Variants
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// KPI Card — 3D tilt with gradient icon
// ---------------------------------------------------------------------------

interface KPICardProps {
  icon: React.ElementType
  label: string
  value: string
  change?: string
  trend?: 'up' | 'down'
  gradient: string
  isLoading: boolean
  delay?: number
}

function KPICard({
  icon: Icon,
  label,
  value,
  change,
  trend,
  gradient,
  isLoading,
  delay = 0,
}: KPICardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
    >
      <CardContainer containerClassName="w-full">
        <CardBody className="relative w-full h-auto rounded-2xl bg-white border-2 border-gray-100 p-5 shadow-sm hover:shadow-lg hover:shadow-indigo-500/5 transition-shadow">
          <CardItem translateZ={20} className="w-full">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {label}
              </p>
              <div
                className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}
              >
                <Icon className="w-4.5 h-4.5 text-white" />
              </div>
            </div>
          </CardItem>
          <CardItem translateZ={40} className="w-full mt-3">
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-xl sm:text-2xl lg:text-xl xl:text-2xl 2xl:text-3xl font-bold text-gray-900 font-mono tabular-nums truncate">
                {value}
              </p>
            )}
          </CardItem>
          {change && (
            <CardItem translateZ={15} className="w-full mt-2">
              <div className="flex items-center gap-1.5">
                {trend === 'up' ? (
                  <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                )}
                <span
                  className={`text-xs font-medium ${
                    trend === 'up' ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {change}
                </span>
                <span className="text-xs text-gray-400">vs last month</span>
              </div>
            </CardItem>
          )}
        </CardBody>
      </CardContainer>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Project Row — animated with hover effects
// ---------------------------------------------------------------------------

interface ProjectRowProps {
  project: Project
  index: number
}

function ProjectRow({ project, index }: ProjectRowProps) {
  const statusDisplay =
    project.payment_terms === 'draft'
      ? 'Draft'
      : project.payment_terms === 'in progress'
        ? 'In Progress'
        : 'Active'

  const statusColor =
    statusDisplay === 'Draft'
      ? 'bg-gray-50 text-gray-600 border border-gray-200'
      : statusDisplay === 'In Progress'
        ? 'bg-amber-50 text-amber-700 border border-amber-200'
        : 'bg-green-50 text-green-700 border border-green-200'

  const payAppCount = project.pay_app_count || 0

  return (
    <Link to={`/projects/${project.id}`}>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 + index * 0.08 }}
        whileHover={{ x: 4, backgroundColor: 'rgba(99,102,241,0.03)' }}
        className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-indigo-200/50 transition-all cursor-pointer"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {project.name}
            </p>
            {payAppCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
                <FileText className="w-3 h-3" />
                {payAppCount}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatCurrency(project.original_contract)} contract
            {project.owner && ` · ${project.owner}`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span
            className={`px-2.5 py-1 text-xs font-medium rounded-full ${statusColor}`}
          >
            {statusDisplay}
          </span>
          <ArrowUpRight className="w-4 h-4 text-gray-400 shrink-0" />
        </div>
      </motion.div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Activity Item
// ---------------------------------------------------------------------------

const activityIcons: Record<string, { icon: React.ElementType; bg: string }> = {
  payment: { icon: CreditCard, bg: 'bg-green-50 text-green-600' },
  submit: { icon: FileText, bg: 'bg-blue-50 text-blue-600' },
  alert: { icon: AlertCircle, bg: 'bg-red-50 text-red-600' },
  create: { icon: FolderOpen, bg: 'bg-indigo-50 text-indigo-600' },
}

interface ActivityItemProps {
  type: string
  text: string
  amount?: string
  time: string
  index: number
  projectId?: number
}

function ActivityItem({ type, text, amount, time, index, projectId }: ActivityItemProps) {
  const { icon: Icon, bg } = activityIcons[type] || activityIcons.create
  const content = (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 + index * 0.08 }}
      whileHover={projectId ? { x: 3, backgroundColor: 'rgba(99,102,241,0.03)' } : undefined}
      className={`flex items-start gap-3 p-2 rounded-lg -mx-2 ${projectId ? 'cursor-pointer hover:bg-gray-50 transition-colors' : ''}`}
    >
      <div
        className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${bg}`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700 leading-snug">{text}</p>
        <div className="flex items-center gap-2 mt-1">
          {amount && (
            <span className="text-xs font-semibold text-gray-900">{amount}</span>
          )}
          <span className="text-xs text-gray-400">{time}</span>
        </div>
      </div>
      {projectId && <ArrowUpRight className="w-3.5 h-3.5 text-gray-400 mt-1 shrink-0" />}
    </motion.div>
  )
  return projectId ? <Link to={`/projects/${projectId}`}>{content}</Link> : content
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function Dashboard() {
  const { projects, isLoading: projectsLoading, error: projectsError } =
    useProjects()
  const { stats, isLoading: statsLoading, error: statsError } = useReports()
  const { isTrialGated } = useTrial()
  const { user } = useAuth()

  const sortedProjects = useMemo(
    () =>
      [...projects].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [projects],
  )

  // Compute total pipeline from actual project contract amounts
  const totalPipeline = useMemo(
    () => projects.reduce((sum, p) => sum + parseFloat(String(p.original_contract || '0')), 0),
    [projects],
  )

  const [showAllProjects, setShowAllProjects] = useState(false)
  const [ariaCTADismissed, setAriaCTADismissed] = useState(() => {
    try { return localStorage.getItem('aria_cta_dismissed') === '1' } catch { return false }
  })

  const isLoading = projectsLoading || statsLoading
  const error = projectsError || statsError

  // Dismiss the floating CTA and persist to localStorage
  const handleDismissAriaCTA = () => {
    setAriaCTADismissed(true)
    try { localStorage.setItem('aria_cta_dismissed', '1') } catch { /* noop */ }
  }

  // Show floating ARIA CTA when: onboarding complete + no projects + not dismissed
  const showAriaCTA =
    user?.has_completed_onboarding === true &&
    !projectsLoading &&
    sortedProjects.length === 0 &&
    !ariaCTADismissed

  const displayedProjects = showAllProjects
    ? sortedProjects
    : sortedProjects.slice(0, 6)

  // Build recent activity from projects with links
  const recentActivity = useMemo(() => {
    return sortedProjects.slice(0, 4).map((p) => ({
      type: 'create' as const,
      text: `Project updated — ${p.name}`,
      amount: formatCurrency(p.original_contract),
      time: formatRelativeDate(p.created_at),
      projectId: p.id,
    }))
  }, [sortedProjects])

  return (
    <div className="space-y-8">
      {/* Trial Gated Banner */}
      <AnimatePresence>
        {isTrialGated && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-xl bg-amber-50 border border-amber-200 p-4"
          >
            <p className="text-sm text-amber-700">
              <strong>Trial ended.</strong> You can view existing projects in
              read-only mode.
              <Link
                to="/settings"
                className="ml-2 font-semibold text-amber-700 underline hover:text-amber-800"
              >
                Upgrade to Pro
              </Link>
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stripe Connect Banner — shown when GC has no connected account */}
      <StripeConnectBanner />

      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-gray-500">
              Welcome back. Here's your billing overview.
            </p>
            <StripeActiveBadge />
          </div>
        </div>
        <Link to="/projects/new">
          <motion.div
            whileHover={{
              scale: 1.03,
              boxShadow: '0 4px 20px rgba(99,102,241,0.3)',
            }}
            whileTap={{ scale: 0.97 }}
          >
            <Button
              disabled={isTrialGated}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white rounded-xl"
            >
              <Plus className="w-4 h-4" />
              New Project
            </Button>
          </motion.div>
        </Link>
      </motion.div>

      {/* KPI Cards — 3D tilt */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <KPICard
          icon={Building2}
          label="Total Pipeline"
          value={formatCurrency(totalPipeline)}
          gradient="from-indigo-500 to-purple-600"
          isLoading={isLoading}
          delay={0}
        />
        <KPICard
          icon={FileText}
          label="Total Billed"
          value={formatCurrency(stats?.total_billed || 0)}
          gradient="from-blue-500 to-cyan-500"
          isLoading={isLoading}
          delay={0.1}
        />
        <KPICard
          icon={Clock}
          label="Outstanding"
          value={formatCurrency(stats?.outstanding || 0)}
          gradient="from-amber-500 to-orange-500"
          isLoading={isLoading}
          delay={0.2}
        />
        <KPICard
          icon={CheckCircle2}
          label="Collected"
          value={formatCurrency(
            (stats?.total_billed || 0) - (stats?.outstanding || 0),
          )}
          gradient="from-green-500 to-emerald-500"
          isLoading={isLoading}
          delay={0.3}
        />
      </div>

      {/* Error State */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="rounded-xl bg-red-50 border border-red-200 p-4"
          >
            <p className="text-sm text-red-700">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cash Flow Forecast */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div className="rounded-2xl bg-white border-2 border-gray-100 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-5">30-Day Cash Flow Forecast</h2>
          <CashFlowForecast />
        </div>
      </motion.div>

      {/* Two-column layout: Projects + Activity — always visible */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Projects list */}
        <Spotlight
          className="lg:col-span-3 rounded-2xl bg-white border-2 border-gray-100 p-6"
          fill="#6366f1"
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">
              Active Projects
            </h2>
            {sortedProjects.length > 6 && (
              <button
                onClick={() => setShowAllProjects(!showAllProjects)}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
              >
                {showAllProjects ? 'Show Less' : `View All (${sortedProjects.length})`}
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {sortedProjects.length === 0 && !projectsLoading ? (
            /* Rich empty state — shown immediately, no skeleton loaders */
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
                <span className="text-3xl" role="img" aria-label="construction">🏗️</span>
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1.5">
                Create your first project
              </h3>
              <p className="text-sm text-gray-500 max-w-xs mb-6">
                Add your project details and schedule of values to start generating G702/G703 pay applications.
              </p>
              <Link to="/projects/new">
                <Button
                  disabled={isTrialGated}
                  className="bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white rounded-xl gap-2 px-6"
                >
                  <Plus className="w-4 h-4" />
                  New Project
                </Button>
              </Link>
            </motion.div>
          ) : projectsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {displayedProjects.map((project, i) => (
                <ProjectRow key={project.id} project={project} index={i} />
              ))}
            </div>
          )}
        </Spotlight>

        {/* Activity feed */}
        <Spotlight
          className="lg:col-span-2 rounded-2xl bg-white border-2 border-gray-100 p-6"
          fill="#8b5cf6"
        >
          <h2 className="text-lg font-bold text-gray-900 mb-5">
            Recent Activity
          </h2>
          {recentActivity.length > 0 ? (
            <div className="space-y-4">
              {recentActivity.map((activity, i) => (
                <ActivityItem key={i} index={i} {...activity} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              Activity will appear here as you create projects and pay apps.
            </p>
          )}
        </Spotlight>
      </div>

      {/* Floating ARIA CTA — shown after onboarding, disappears once project created or dismissed */}
      <AnimatePresence>
        {showAriaCTA && (
          <motion.div
            key="aria-cta"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="fixed bottom-6 right-6 z-30 max-w-xs w-full"
          >
            <div className="bg-white rounded-2xl border-2 border-indigo-100 shadow-xl shadow-indigo-500/10 p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xl" role="img" aria-label="construction">🏗️</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 leading-snug">
                  Create your first project to activate ARIA
                </p>
                <p className="text-xs text-gray-500 mt-0.5 mb-3">
                  ARIA starts working the moment your project goes live.
                </p>
                <Link to="/projects/new">
                  <Button
                    size="sm"
                    className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white rounded-xl gap-1.5 text-xs h-8"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Project →
                  </Button>
                </Link>
              </div>
              <button
                onClick={handleDismissAriaCTA}
                className="p-1 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
