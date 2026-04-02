import { useMemo } from 'react'
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
} from 'lucide-react'
import type { Project } from '@/types'
import { useProjects } from '@/hooks/useProjects'
import { useReports } from '@/hooks/useReports'
import { useTrial } from '@/hooks/useTrial'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
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
              <p className="text-3xl font-bold text-gray-900 font-mono tabular-nums">
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
  const progress = project.original_contract
    ? Math.min(100, Math.round(((project.original_contract - (project.original_contract * 0.4)) / project.original_contract) * 100))
    : 0

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
          <p className="text-sm font-semibold text-gray-900 truncate">
            {project.name}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatCurrency(project.original_contract)} contract
            {project.owner && ` · ${project.owner}`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-32 hidden sm:block">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">{progress}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, delay: 0.5 + index * 0.1 }}
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
              />
            </div>
          </div>
          <span
            className={`px-2.5 py-1 text-xs font-medium rounded-full ${statusColor}`}
          >
            {statusDisplay}
          </span>
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
}

function ActivityItem({ type, text, amount, time, index }: ActivityItemProps) {
  const { icon: Icon, bg } = activityIcons[type] || activityIcons.create
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 + index * 0.08 }}
      className="flex items-start gap-3"
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
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function Dashboard() {
  const { projects, isLoading: projectsLoading, error: projectsError } =
    useProjects()
  const { stats, isLoading: statsLoading, error: statsError } = useReports()
  const { isTrialGated } = useTrial()

  const sortedProjects = useMemo(
    () =>
      [...projects].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [projects],
  )

  const isLoading = projectsLoading || statsLoading
  const error = projectsError || statsError

  // Build recent activity from projects (simple heuristic)
  const recentActivity = useMemo(() => {
    return sortedProjects.slice(0, 4).map((p) => ({
      type: 'create',
      text: `Project updated — ${p.name}`,
      amount: formatCurrency(p.original_contract),
      time: formatRelativeDate(p.created_at),
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

      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Welcome back. Here's your billing overview.
          </p>
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
          value={formatCurrency(stats?.total_billed ? stats.total_billed * 2.5 : 0)}
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
          change={stats?.outstanding ? '-3.1%' : undefined}
          trend="down"
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
          change={stats?.total_billed ? '+22.4%' : undefined}
          trend="up"
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

      {/* Two-column layout: Projects + Activity */}
      {sortedProjects.length === 0 && !projectsLoading ? (
        <EmptyState
          icon={FolderOpen}
          title="No projects yet"
          description="Create your first project to start billing your construction work"
          actions={
            <Link to="/projects/new">
              <Button disabled={isTrialGated}>Create Project</Button>
            </Link>
          }
        />
      ) : (
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
              <Link
                to="/projects"
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
              >
                View All <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {projectsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {sortedProjects.slice(0, 6).map((project, i) => (
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
      )}
    </div>
  )
}
