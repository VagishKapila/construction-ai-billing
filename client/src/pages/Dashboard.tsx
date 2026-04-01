import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  FolderOpen,
  DollarSign,
  Clock,
  TrendingUp,
} from 'lucide-react'
import type { Project } from '@/types'
import { useProjects } from '@/hooks/useProjects'
import { useReports } from '@/hooks/useReports'
import { useTrial } from '@/hooks/useTrial'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import {
  formatCurrency,
  formatRelativeDate,
} from '@/lib/formatters'

interface KPICardProps {
  icon: React.ReactNode
  label: string
  value: string
  isLoading: boolean
}

function KPICard({ icon, label, value, isLoading }: KPICardProps) {
  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center">
          <div className="text-primary-600">{icon}</div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-muted">{label}</p>
          {isLoading ? (
            <Skeleton className="h-8 w-24 mt-2" />
          ) : (
            <p className="text-2xl font-bold text-text-primary mt-1 font-mono tabular-nums">
              {value}
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}

interface ProjectCardProps {
  project: Project
}

function ProjectCard({ project }: ProjectCardProps) {
  const statusDisplay =
    project.payment_terms === 'draft'
      ? 'Draft'
      : project.payment_terms === 'in progress'
        ? 'In Progress'
        : 'Active'

  return (
    <Link to={`/projects/${project.id}`}>
      <Card
        interactive
        className="p-6"
      >
        <div className="flex justify-between items-start gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-text-primary truncate">
              {project.name}
            </h3>
            {project.owner && (
              <p className="text-sm text-text-secondary mt-1">
                Owner: {project.owner}
              </p>
            )}
          </div>
          <Badge variant="default" className="flex-shrink-0">
            {statusDisplay}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-text-muted text-xs font-medium uppercase tracking-wide">
              Contract
            </p>
            <p className="text-text-primary font-mono tabular-nums mt-1">
              {formatCurrency(project.original_contract)}
            </p>
          </div>
          <div>
            <p className="text-text-muted text-xs font-medium uppercase tracking-wide">
              Last Pay App
            </p>
            <p className="text-text-primary mt-1">
              {project.created_at ? formatRelativeDate(project.created_at) : '—'}
            </p>
          </div>
        </div>
      </Card>
    </Link>
  )
}

export function Dashboard() {
  const { projects, isLoading: projectsLoading, error: projectsError } =
    useProjects()
  const { stats, isLoading: statsLoading, error: statsError } = useReports()
  const { isTrialGated } = useTrial()

  // Sort projects by creation date, most recent first
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
    [projects]
  )

  const isLoading = projectsLoading || statsLoading
  const error = projectsError || statsError

  return (
    <div className="space-y-8">
      {/* Trial Gated Banner */}
      {isTrialGated && (
        <div className="rounded-lg bg-warning-50 border border-warning-200 p-4">
          <p className="text-sm text-warning-700">
            <strong>Trial ended.</strong> You can view existing projects in read-only mode.
            <Link
              to="/settings"
              className="ml-2 font-semibold text-warning-700 underline hover:text-warning-800"
            >
              Upgrade to Pro
            </Link>
          </p>
        </div>
      )}

      {/* Page Header */}
      <PageHeader
        title="Projects"
        description="Manage your construction projects and pay applications"
        actions={
          <Link to="/projects/new">
            <Button disabled={isTrialGated}>
              New Project
            </Button>
          </Link>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={<FolderOpen className="w-6 h-6" />}
          label="Active Projects"
          value={stats?.projects.toString() || '0'}
          isLoading={isLoading}
        />
        <KPICard
          icon={<DollarSign className="w-6 h-6" />}
          label="Total Billed"
          value={formatCurrency(stats?.total_billed || 0)}
          isLoading={isLoading}
        />
        <KPICard
          icon={<Clock className="w-6 h-6" />}
          label="Outstanding"
          value={formatCurrency(stats?.outstanding || 0)}
          isLoading={isLoading}
        />
        <KPICard
          icon={<TrendingUp className="w-6 h-6" />}
          label="This Month"
          value={formatCurrency(0)}
          isLoading={isLoading}
        />
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg bg-danger-50 border border-danger-200 p-4">
          <p className="text-sm text-danger-700">{error}</p>
        </div>
      )}

      {/* Projects List */}
      {sortedProjects.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No projects yet"
          description="Create your first project to start billing your construction work"
          actions={
            <Link to="/projects/new">
              <Button disabled={isTrialGated}>
                Create Project
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Your Projects
            </h2>
            <p className="text-sm text-text-secondary mt-1">
              {sortedProjects.length} project{sortedProjects.length !== 1 ? 's' : ''} total
            </p>
          </div>

          {projectsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-48 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sortedProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
