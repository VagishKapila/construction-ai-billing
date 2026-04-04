import { useMemo, useState, useEffect } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Upload, FileText, ChevronRight, Paperclip, CheckCircle2, AlertTriangle, ReceiptText, TableProperties, FolderOpen, Scale, X, Lock, RotateCcw, Trophy } from 'lucide-react'
import type { PayApp, SOVLine } from '@/types'
import { useProject } from '@/hooks/useProject'
import { useTrial } from '@/hooks/useTrial'
import { createPayApp } from '@/api/payApps'
import { getProjectReconciliation, completeProject, reopenProject, type ReconciliationReport } from '@/api/projects'
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
  icon: React.ComponentType<{ className?: string }>
  accent?: boolean
}

const TABS: TabConfig[] = [
  { id: 'payapps', label: 'Pay Applications', icon: ReceiptText },
  { id: 'sov', label: 'Schedule of Values', icon: TableProperties },
  { id: 'changeorders', label: 'Change Orders', icon: FileText },
  { id: 'documents', label: 'Documents', icon: FolderOpen },
  { id: 'reconciliation', label: 'Reconciliation', icon: Scale, accent: true },
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
      <div className="flex gap-1 sm:gap-4 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-3.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? tab.accent
                    ? 'border-emerald-500 text-emerald-700 bg-emerald-50/50'
                    : 'border-primary-500 text-primary-600'
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-gray-50'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive && tab.accent ? 'text-emerald-600' : ''}`} />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface PayAppRowProps {
  payApp: PayApp
  projectId: number
}

function PayAppRow({ payApp, projectId }: PayAppRowProps) {
  const navigate = useNavigate()
  const statusVariantMap: Record<string, 'default' | 'success' | 'warning'> = {
    draft: 'warning',
    submitted: 'default',
    paid: 'success',
  }

  const payAppUrl = `/projects/${projectId}/pay-app/${payApp.id}`

  return (
    <Card
      interactive
      className="p-4 sm:p-6 cursor-pointer transition-colors hover:bg-gray-50"
      onClick={() => navigate(payAppUrl)}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base sm:text-lg font-semibold text-text-primary">
              {payApp.is_retainage_release
                ? 'Final Retainage Release'
                : `Pay Application #${payApp.app_number}`}
            </h3>
            <Badge variant={statusVariantMap[payApp.status] || 'default'}>
              {payApp.status.charAt(0).toUpperCase() + payApp.status.slice(1)}
            </Badge>
            {payApp.is_retainage_release && (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                Retainage Release
              </Badge>
            )}
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
          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); navigate(payAppUrl) }}>
            {payApp.status === 'draft' ? 'Edit' : 'View'}
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('payapps')
  const [isCreatingPayApp, setIsCreatingPayApp] = useState(false)
  const [reconciliation, setReconciliation] = useState<ReconciliationReport | null>(null)
  const [reconLoading, setReconLoading] = useState(false)
  const [successBanner, setSuccessBanner] = useState<string | null>(null)
  const [isCompletingJob, setIsCompletingJob] = useState(false)
  const [isReopeningJob, setIsReopeningJob] = useState(false)

  const { project, sovLines, payApps, changeOrders, attachments, isLoading, error, refresh } =
    useProject(projectId)
  const { isTrialGated } = useTrial()

  // Derived: is the project completed?
  const isJobCompleted = project?.status === 'completed'

  // Derived: is the project fully billed? (all SOV lines at 100% from last pay app)
  const isFullyBilled = reconciliation?.summary?.is_fully_reconciled ?? false

  // Show success banner when redirected from email send
  useEffect(() => {
    const sent = searchParams.get('sent')
    if (sent) {
      const paNum = sent.replace('pa', '#')
      setSuccessBanner(`Pay Application ${paNum} sent successfully!`)
      // Clear the param from URL without navigation
      searchParams.delete('sent')
      setSearchParams(searchParams, { replace: true })
      // Auto-dismiss after 8 seconds
      const timer = setTimeout(() => setSuccessBanner(null), 8000)
      return () => clearTimeout(timer)
    }
  }, [searchParams, setSearchParams])

  // Load reconciliation when tab is active OR eagerly when project has pay apps
  // (needed to know if job is fully billed for the completed state)
  useEffect(() => {
    if (projectId && !reconciliation && (activeTab === 'reconciliation' || payApps.length > 0)) {
      setReconLoading(true)
      getProjectReconciliation(projectId)
        .then(res => { if (res.data) setReconciliation(res.data) })
        .catch(() => {})
        .finally(() => setReconLoading(false))
    }
  }, [activeTab, projectId, reconciliation, payApps.length])

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
      const periodLabel = `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`
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

  // Mark job as completed
  const handleCompleteJob = async () => {
    if (isCompletingJob) return
    if (!confirm('Mark this job as completed? This will prevent creating new pay applications. You can reopen the project later if needed.')) return
    setIsCompletingJob(true)
    try {
      await completeProject(projectId)
      await refresh()
      setReconciliation(null) // Force reload reconciliation data
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to complete project'
      alert(msg)
    } finally {
      setIsCompletingJob(false)
    }
  }

  // Reopen a completed job
  const handleReopenJob = async () => {
    if (isReopeningJob) return
    if (!confirm('Reopen this project? This will allow creating new pay applications again.')) return
    setIsReopeningJob(true)
    try {
      await reopenProject(projectId)
      await refresh()
      setReconciliation(null) // Force reload reconciliation data
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reopen project'
      alert(msg)
    } finally {
      setIsReopeningJob(false)
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
      {/* Success Banner */}
      {successBanner && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-300 p-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">{successBanner}</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                Check the <button onClick={() => setActiveTab('reconciliation')} className="underline font-semibold hover:text-emerald-800">Reconciliation</button> tab to verify all invoices add up to the contract total.
              </p>
            </div>
          </div>
          <button onClick={() => setSuccessBanner(null)} className="text-emerald-400 hover:text-emerald-600 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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
      />
      {isJobCompleted && (
        <div className="-mt-4">
          <Badge variant="success" className="text-xs">
            <Trophy className="w-3 h-3 mr-1" /> Completed
          </Badge>
        </div>
      )}

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
            {/* Job Completed Banner */}
            {isJobCompleted && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-300 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Trophy className="w-6 h-6 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-base font-semibold text-emerald-800">Job Completed</p>
                      <p className="text-sm text-emerald-600 mt-1">
                        All billing for this project is finished. No new pay applications can be created.
                        {project?.completed_at && (
                          <span className="block text-xs text-emerald-500 mt-1">
                            Completed on {formatDate(project.completed_at)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isReopeningJob}
                    onClick={handleReopenJob}
                    className="flex-shrink-0 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                  >
                    <RotateCcw className="w-4 h-4 mr-1.5" />
                    {isReopeningJob ? 'Reopening...' : 'Reopen Job'}
                  </Button>
                </div>
              </div>
            )}

            {/* Fully billed suggestion — show when reconciled but not yet completed */}
            {!isJobCompleted && isFullyBilled && payApps.length > 0 && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    <p className="text-sm text-blue-800">
                      <strong>All billing is complete.</strong> Ready to close out this job?
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={isCompletingJob}
                    onClick={handleCompleteJob}
                    className="flex-shrink-0 bg-blue-600 hover:bg-blue-700"
                  >
                    <Lock className="w-4 h-4 mr-1.5" />
                    {isCompletingJob ? 'Completing...' : 'Mark Job Complete'}
                  </Button>
                </div>
              </div>
            )}

            {/* Create next pay app button — hidden for completed jobs */}
            {!isTrialGated && !isJobCompleted && (
              <div className="flex justify-end">
                <Button
                  disabled={isCreatingPayApp}
                  onClick={handleCreatePayApp}
                >
                  {isCreatingPayApp
                    ? 'Creating...'
                    : sortedPayApps.length === 0
                      ? 'Create Pay Application #1'
                      : `Create Pay Application #${Math.max(...payApps.map(p => p.app_number)) + 1}`}
                </Button>
              </div>
            )}

            {sortedPayApps.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No pay applications yet"
                description="Create your first pay application to track progress on this project"
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
          changeOrders.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                icon={FileText}
                title="No change orders"
                description="Change orders from pay applications will appear here"
              />
            </Card>
          ) : (
            <Card className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-border">
                      <th className="text-left py-3 px-4 font-semibold text-text-primary">CO #</th>
                      <th className="text-left py-3 px-4 font-semibold text-text-primary">Description</th>
                      <th className="text-left py-3 px-4 font-semibold text-text-primary">Pay App</th>
                      <th className="text-left py-3 px-4 font-semibold text-text-primary">Status</th>
                      <th className="text-right py-3 px-4 font-semibold text-text-primary">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changeOrders.map((co: any) => (
                      <tr key={co.id} className="border-b border-border hover:bg-primary-50">
                        <td className="py-3 px-4 text-text-secondary">{co.co_number || '—'}</td>
                        <td className="py-3 px-4 text-text-primary font-medium">{co.description}</td>
                        <td className="py-3 px-4 text-text-secondary">#{co.app_number}</td>
                        <td className="py-3 px-4">
                          <Badge variant={co.status === 'approved' ? 'success' : 'warning'}>
                            {co.status || 'pending'}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right text-text-primary font-mono tabular-nums">
                          {formatCurrency(Number(co.amount) || 0)}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold bg-primary-50 border-t-2 border-primary-200">
                      <td colSpan={4} className="py-3 px-4 text-text-primary">Total Change Orders</td>
                      <td className="py-3 px-4 text-right text-text-primary font-mono tabular-nums">
                        {formatCurrency(changeOrders.reduce((s: number, co: any) => s + (Number(co.amount) || 0), 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          )
        )}

        {activeTab === 'documents' && (
          attachments.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                icon={FileText}
                title="No documents"
                description="Uploaded documents and lien waivers will appear here"
              />
            </Card>
          ) : (
            <Card className="p-6">
              <div className="space-y-3">
                {attachments.map((att: any) => (
                  <div key={att.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <Paperclip className="w-4 h-4 text-text-muted" />
                      <div>
                        <p className="text-sm font-medium text-text-primary">{att.original_name || att.filename}</p>
                        <p className="text-xs text-text-muted">
                          Pay App #{att.app_number}
                          {att.file_size ? ` • ${(att.file_size / 1024).toFixed(0)} KB` : ''}
                        </p>
                      </div>
                    </div>
                    <a
                      href={`/uploads/${att.filename}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      View
                    </a>
                  </div>
                ))}
              </div>
            </Card>
          )
        )}

        {activeTab === 'reconciliation' && (
          reconLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : !reconciliation ? (
            <Card className="p-6">
              <EmptyState
                icon={FileText}
                title="No billing data"
                description="Submit pay applications to see reconciliation"
              />
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Reconciliation Status */}
              <Card className={`p-4 border-2 ${reconciliation.summary.is_fully_reconciled ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
                <div className="flex items-center gap-3">
                  {reconciliation.summary.is_fully_reconciled ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
                  )}
                  <div>
                    <p className={`font-semibold ${reconciliation.summary.is_fully_reconciled ? 'text-emerald-800' : 'text-amber-800'}`}>
                      {reconciliation.summary.is_fully_reconciled
                        ? 'Fully Reconciled — All invoices add up to the contract amount'
                        : `Variance: ${formatCurrency(Math.abs(reconciliation.summary.variance))} remaining to bill`}
                    </p>
                    <p className={`text-sm mt-0.5 ${reconciliation.summary.is_fully_reconciled ? 'text-emerald-600' : 'text-amber-600'}`}>
                      Contract: {formatCurrency(reconciliation.adjusted_contract)} | Work Completed: {formatCurrency(reconciliation.summary.total_work_completed || (reconciliation.summary.total_billed + reconciliation.summary.total_retainage_held))}
                    </p>
                  </div>
                </div>
              </Card>

              {/* Contract Summary */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-text-primary mb-4">Contract Summary</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-text-muted uppercase tracking-wide">Original Contract</p>
                    <p className="text-lg font-mono font-semibold text-text-primary">{formatCurrency(reconciliation.original_contract)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted uppercase tracking-wide">Change Orders</p>
                    <p className="text-lg font-mono font-semibold text-text-primary">{formatCurrency(reconciliation.total_change_orders)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted uppercase tracking-wide">Adjusted Contract</p>
                    <p className="text-lg font-mono font-semibold text-primary-600">{formatCurrency(reconciliation.adjusted_contract)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted uppercase tracking-wide">Total Paid</p>
                    <p className="text-lg font-mono font-semibold text-emerald-600">{formatCurrency(reconciliation.summary.total_paid)}</p>
                  </div>
                </div>
              </Card>

              {/* Invoice Breakdown */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-text-primary mb-4">Invoice Breakdown</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-border">
                        <th className="text-left py-3 px-3 font-semibold text-text-primary">#</th>
                        <th className="text-left py-3 px-3 font-semibold text-text-primary">Period</th>
                        <th className="text-left py-3 px-3 font-semibold text-text-primary">Status</th>
                        <th className="text-right py-3 px-3 font-semibold text-text-primary">Amount Due</th>
                        <th className="text-right py-3 px-3 font-semibold text-text-primary">Retainage Held</th>
                        <th className="text-right py-3 px-3 font-semibold text-text-primary">Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconciliation.invoices.map((inv) => (
                        <tr key={inv.app_number} className={`border-b border-border ${inv.is_retainage_release ? 'bg-emerald-50' : 'hover:bg-primary-50'}`}>
                          <td className="py-3 px-3 text-text-secondary">
                            {inv.is_retainage_release ? 'RR' : inv.app_number}
                          </td>
                          <td className="py-3 px-3 text-text-primary font-medium">
                            {inv.period_label || '—'}
                            {inv.is_retainage_release && (
                              <span className="ml-2 text-xs text-emerald-600 font-semibold">RETAINAGE RELEASE</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <Badge variant={inv.status === 'submitted' ? 'default' : inv.status === 'paid' ? 'success' : 'warning'}>
                              {inv.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums">{formatCurrency(inv.amount_due)}</td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums">{formatCurrency(inv.retention_held)}</td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-600">{formatCurrency(inv.amount_paid)}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold bg-primary-50 border-t-2 border-primary-200">
                        <td colSpan={3} className="py-3 px-3 text-text-primary">Totals (Billed)</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">{formatCurrency(reconciliation.summary.total_billed)}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">{formatCurrency(reconciliation.summary.total_retainage_held)}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-600">{formatCurrency(reconciliation.summary.total_paid)}</td>
                      </tr>
                      {reconciliation.summary.total_retainage_released > 0 && (
                        <tr className="font-semibold bg-emerald-50/50">
                          <td colSpan={3} className="py-3 px-3 text-emerald-700">+ Retainage Released</td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-700">{formatCurrency(reconciliation.summary.total_retainage_released)}</td>
                          <td className="py-3 px-3"></td>
                          <td className="py-3 px-3"></td>
                        </tr>
                      )}
                      <tr className="font-bold bg-primary-100 border-t border-primary-300">
                        <td colSpan={3} className="py-3 px-3 text-text-primary">Work Completed</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">{formatCurrency(reconciliation.summary.total_work_completed || (reconciliation.summary.total_billed + reconciliation.summary.total_retainage_held))}</td>
                        <td className="py-3 px-3"></td>
                        <td className="py-3 px-3"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {reconciliation.summary.total_outstanding > 0 && (
                  <p className="mt-3 text-sm text-amber-600 font-medium">
                    Outstanding balance: {formatCurrency(reconciliation.summary.total_outstanding)}
                  </p>
                )}
              </Card>
            </div>
          )
        )}
      </div>
    </div>
  )
}
