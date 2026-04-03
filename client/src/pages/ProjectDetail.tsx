import { useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Upload, FileText, ChevronRight } from 'lucide-react'
import type { PayApp, SOVLine } from '@/types'
import { useProject } from '@/hooks/useProject'
import { useTrial } from '@/hooks/useTrial'
import { createPayApp } from '@/api/payApps'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatDate } from '@/lib/formatters'

interface TabConfig {
  id: string
  label: string
}

const TABS: TabConfig[] = [
  { id: 'payapps', label: 'Pay Applications' },
  { id: 'sov', label: 'Schedule of Values' },
  { id: 'changeorders', label: 'Change Orders' },
  { id: 'documents', label: 'Documents' },
]

function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: string
  onTabChange: (tabId: string) => void
}) {
  return (
    <div className="border-b border-border">
      <div className="flex gap-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-1 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

interface PayAppRowProps {
  payApp: PayApp
  projectId: number
}

function PayAppRow({ payApp, projectId }: PayAppRowProps) {
  const statusVariantMap: Record<string, 'default' | 'success' | 'warning'> = {
    draft: 'warning',
    submitted: 'default',
    paid: 'success',
  }

  return (
    <Card interactive className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-semibold text-text-primary">
              Pay Application #{payApp.app_number}
            </h3>
            <Badge variant={statusVariantMap[payApp.status] || 'default'}>
              {payApp.status.charAt(0).toUpperCase() + payApp.status.slice(1)}
            </Badge>
          </div>
          <div className="mt-2 grid grid-cols-2 sm:flex sm:gap-6 text-sm">
            <div>
              <p className="text-text-muted">Period</p>
              <p className="text-text-primary font-medium">
                {payApp.period_label || formatDate(payApp.period_start)}
              </p>
            </div>
            <div>
              <p className="text-text-muted">Amount Due</p>
              <p className="text-text-primary font-mono tabular-nums font-semibold">
                {formatCurrency(payApp.amount_due)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <Link to={`/projects/${projectId}/pay-app/${payApp.id}`}>
            <Button variant="outline" size="sm">
              {payApp.status === 'draft' ? 'Edit' : 'View'}
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  )
}

interface SOVTableProps {
  lines: SOVLine[]
  isLoading: boolean
}

function SOVTable({ lines, isLoading }: SOVTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    )
  }

  if (lines.length === 0) {
    return (
      <EmptyState
        icon={Upload}
        title="No Schedule of Values"
        description="Upload a Schedule of Values to get started"
      />
    )
  }

  const total = lines.reduce((sum, line) => sum + (Number(line.scheduled_value) || 0), 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 font-semibold text-text-primary">
              Item
            </th>
            <th className="text-left py-3 px-4 font-semibold text-text-primary">
              Description
            </th>
            <th className="text-right py-3 px-4 font-semibold text-text-primary">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-b border-border hover:bg-primary-50">
              <td className="py-3 px-4 text-text-secondary">
                {line.item_id || '—'}
              </td>
              <td className="py-3 px-4 text-text-primary font-medium">
                {line.description}
              </td>
              <td className="py-3 px-4 text-right text-text-primary font-mono tabular-nums">
                {formatCurrency(Number(line.scheduled_value) || 0)}
              </td>
            </tr>
          ))}
          <tr className="font-semibold bg-primary-50 border-t-2 border-primary-200">
            <td colSpan={2} className="py-3 px-4 text-text-primary">
              Total
            </td>
            <td className="py-3 px-4 text-right text-text-primary font-mono tabular-nums">
              {formatCurrency(total)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const projectId = Number(id)
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('payapps')
  const [isCreatingPayApp, setIsCreatingPayApp] = useState(false)

  const { project, sovLines, payApps, isLoading, error } =
    useProject(projectId)
  const { isTrialGated } = useTrial()

  /**
   * Create a new pay app and navigate to it
   * This avoids navigating to /pay-app/new which causes "Invalid pay app ID"
   */
  const handleCreatePayApp = async () => {
    if (isCreatingPayApp || isTrialGated) return
    setIsCreatingPayApp(true)
    try {
      // Auto-generate period label and dates (matching old app.html behavior)
      const now = new Date()
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
      const periodLabel = `${months[now.getMonth()]} ${now.getFullYear()}`
      const periodStart = now.toISOString().split('T')[0]
      // Period end = last day of current month
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      const periodEnd = endDate.toISOString().split('T')[0]

      const response = await createPayApp(projectId, {
        period_label: periodLabel,
        period_start: periodStart,
        period_end: periodEnd,
      })
      if (response.data) {
        navigate(`/projects/${projectId}/pay-app/${response.data.id}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create pay application'
      alert(msg)
    } finally {
      setIsCreatingPayApp(false)
    }
  }

  // Sort pay apps by app_number descending (newest first)
  const sortedPayApps = useMemo(
    () =>
      [...payApps].sort((a, b) => b.app_number - a.app_number),
    [payApps]
  )

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="space-y-8">
        <PageHeader title="Project Not Found" />
        <EmptyState
          icon={FileText}
          title="Project not found"
          description="The project you're looking for doesn't exist or has been deleted"
          actions={
            <Link to="/dashboard">
              <Button>Back to Dashboard</Button>
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Trial Gated Banner */}
      {isTrialGated && (
        <div className="rounded-lg bg-warning-50 border border-warning-200 p-4">
          <p className="text-sm text-warning-700">
            <strong>Trial ended.</strong> This project is in read-only mode.
          </p>
        </div>
      )}

      {/* Page Header */}
      <PageHeader
        title={project.name}
        description={`Contract Amount: ${formatCurrency(project.original_contract)}`}
        actions={
          <Button
            disabled={isTrialGated || isCreatingPayApp}
            onClick={handleCreatePayApp}
          >
            {isCreatingPayApp ? 'Creating...' : 'New Pay Application'}
          </Button>
        }
      />

      {/* Project Info Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        {project.owner && (
          <div className="bg-card rounded-lg p-4 border border-border">
            <p className="text-text-muted text-xs font-medium uppercase tracking-wide">
              Owner
            </p>
            <p className="text-text-primary font-medium mt-1">{project.owner}</p>
          </div>
        )}
        {project.contractor && (
          <div className="bg-card rounded-lg p-4 border border-border">
            <p className="text-text-muted text-xs font-medium uppercase tracking-wide">
              Contractor
            </p>
            <p className="text-text-primary font-medium mt-1">
              {project.contractor}
            </p>
          </div>
        )}
        {project.contract_date && (
          <div className="bg-card rounded-lg p-4 border border-border">
            <p className="text-text-muted text-xs font-medium uppercase tracking-wide">
              Contract Date
            </p>
            <p className="text-text-primary font-medium mt-1">
              {formatDate(project.contract_date)}
            </p>
          </div>
        )}
        {project.payment_terms && (
          <div className="bg-card rounded-lg p-4 border border-border">
            <p className="text-text-muted text-xs font-medium uppercase tracking-wide">
              Payment Terms
            </p>
            <p className="text-text-primary font-medium mt-1">
              {project.payment_terms}
            </p>
          </div>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg bg-danger-50 border border-danger-200 p-4">
          <p className="text-sm text-danger-700">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab Content */}
      <div>
        {activeTab === 'payapps' && (
          <div className="space-y-4">
            {sortedPayApps.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No pay applications"
                description="Create your first pay application to track progress on this project"
                actions={
                  <Button
                    disabled={isTrialGated || isCreatingPayApp}
                    onClick={handleCreatePayApp}
                  >
                    {isCreatingPayApp ? 'Creating...' : 'Create Pay Application'}
                  </Button>
                }
              />
            ) : (
              <div className="space-y-4">
                {sortedPayApps.map((payApp) => (
                  <PayAppRow
                    key={payApp.id}
                    payApp={payApp}
                    projectId={projectId}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'sov' && (
          <SOVTable lines={sovLines} isLoading={isLoading} />
        )}

        {activeTab === 'changeorders' && (
          <Card className="p-6">
            <EmptyState
              icon={FileText}
              title="No change orders"
              description="Change orders from pay applications will appear here"
            />
          </Card>
        )}

        {activeTab === 'documents' && (
          <Card className="p-6">
            <EmptyState
              icon={FileText}
              title="No documents"
              description="Uploaded documents and lien waivers will appear here"
            />
          </Card>
        )}
      </div>
    </div>
  )
}
