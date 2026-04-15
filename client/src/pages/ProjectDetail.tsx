import { useMemo, useState, useEffect } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Upload, FileText, ChevronRight, Paperclip, CheckCircle2, AlertTriangle, ReceiptText, TableProperties, FolderOpen, Scale, X, Lock, RotateCcw, Trophy, Inbox, Plus, Zap } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { PayApp, SOVLine } from '@/types'
import { useProject } from '@/hooks/useProject'
import { useTrial } from '@/hooks/useTrial'
import { createPayApp } from '@/api/payApps'
import { getProjectReconciliation, completeProject, reopenProject, createProjectChangeOrder, updateChangeOrderStatus, recordManualPayment, type ReconciliationReport } from '@/api/projects'
import { QBSyncButton, QBEstimateImport } from '@/components/quickbooks'
import { HubTab } from '@/components/hub/HubTab'
import OrbitalCanvas from '@/components/hub/OrbitalCanvas'
import { VendorDetailPanel } from '@/features/hub'
import type { Trade as VDPTrade } from '@/features/hub'
import type { Trade as HubTrade } from '@/types/hub'
import { getTrades } from '@/api/hub'
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

/* ─────────────────────────────────────────────────────────
   SUBCOMPONENTS — Moved up for clarity
   ───────────────────────────────────────────────────────── */

interface PayAppRowProps {
  payApp: PayApp
  projectId: number
  onPaymentRecorded?: () => void
  isRecordingPayment?: boolean
  recordPaymentForm?: { amount: string; method: string; checkNumber: string; notes: string }
  onRecordPaymentChange?: (field: string, value: string) => void
  onRecordPaymentSubmit?: () => void
  showRecordPaymentForm?: boolean
  onShowRecordPaymentChange?: (show: boolean) => void
}

function PayAppRow({
  payApp,
  projectId,
  onPaymentRecorded: _onPaymentRecorded,
  isRecordingPayment = false,
  recordPaymentForm,
  onRecordPaymentChange,
  onRecordPaymentSubmit,
  showRecordPaymentForm = false,
  onShowRecordPaymentChange,
}: PayAppRowProps) {
  const navigate = useNavigate()
  const statusVariantMap: Record<string, 'default' | 'success' | 'warning'> = {
    draft: 'warning',
    submitted: 'default',
    paid: 'success',
  }
  const displayStatus = payApp.payment_status === 'paid' ? 'paid' : payApp.status

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
            <Badge variant={statusVariantMap[displayStatus] || 'default'}>
              {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
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
            {payApp.payment_status === 'paid' && payApp.last_payment_method && (
              <div className="col-span-2 sm:col-span-1">
                <p className="text-text-muted">Payment</p>
                <p className="text-emerald-700 font-medium text-sm flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Paid via {payApp.last_payment_method}
                  {payApp.last_check_number ? ` #${payApp.last_check_number}` : ''}
                  {payApp.last_payment_amount ? ` · ${formatCurrency(payApp.last_payment_amount)}` : ''}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          {onShowRecordPaymentChange && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onShowRecordPaymentChange(!showRecordPaymentForm)
              }}
            >
              {payApp.payment_status === 'paid' ? 'Edit Payment' : 'Record Payment'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); navigate(payAppUrl) }}>
            {payApp.status === 'draft' ? 'Edit' : 'View'}
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>

      {showRecordPaymentForm && recordPaymentForm && onRecordPaymentChange && onRecordPaymentSubmit && (
        <div
          className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm font-medium text-blue-900">Record Payment</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-muted">Amount</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={recordPaymentForm.amount}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9.]/g, '')
                  onRecordPaymentChange('amount', raw)
                }}
                onBlur={(e) => {
                  const num = parseFloat(e.target.value.replace(/,/g, ''))
                  if (!isNaN(num)) {
                    onRecordPaymentChange('amount', num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
                  }
                }}
                onFocus={(e) => {
                  onRecordPaymentChange('amount', e.target.value.replace(/,/g, ''))
                }}
                className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted">Payment Method</label>
              <select
                value={recordPaymentForm.method}
                onChange={(e) => onRecordPaymentChange('method', e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-white"
              >
                <option value="Check">Check</option>
                <option value="ACH">ACH</option>
                <option value="Wire">Wire Transfer</option>
                <option value="Cash">Cash</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          {recordPaymentForm.method === 'Check' && (
            <div>
              <label className="text-xs font-medium text-text-muted">Check Number</label>
              <input
                type="text"
                placeholder="e.g., 12345"
                value={recordPaymentForm.checkNumber}
                onChange={(e) => onRecordPaymentChange('checkNumber', e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-text-muted">Notes (optional)</label>
            <input
              type="text"
              placeholder="e.g., Received 4/6/2026"
              value={recordPaymentForm.notes}
              onChange={(e) => onRecordPaymentChange('notes', e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onShowRecordPaymentChange?.(false) }}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onRecordPaymentSubmit() }}
              disabled={isRecordingPayment || !recordPaymentForm.amount}
            >
              {isRecordingPayment ? 'Recording...' : 'Record Payment'}
            </Button>
          </div>
        </div>
      )}
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border">
          <tr className="text-text-muted font-medium">
            <th className="text-left py-2 px-4">#</th>
            <th className="text-left py-2 px-4">Description</th>
            <th className="text-right py-2 px-4">Scheduled Value</th>
            <th className="text-right py-2 px-4">% Billed</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => (
            <tr key={line.id} className="border-b border-border hover:bg-gray-50">
              <td className="py-3 px-4 text-text-muted">{idx + 1}</td>
              <td className="py-3 px-4 font-medium text-text-primary">{line.description}</td>
              <td className="py-3 px-4 text-right font-mono text-text-primary">
                {formatCurrency(line.scheduled_value)}
              </td>
              <td className="py-3 px-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-emerald-500 h-2 rounded-full"
                      style={{ width: `${line.percent_complete || 0}%` }}
                    />
                  </div>
                  <span className="font-medium text-text-primary min-w-12 text-right">
                    {(line.percent_complete || 0).toFixed(0)}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   MAIN COMPONENT — Split-screen command center
   ───────────────────────────────────────────────────────── */

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const projectId = Number(id)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // State: Left panel & core
  const [activeTab, setActiveTab] = useState('payapps')
  const [isCreatingPayApp, setIsCreatingPayApp] = useState(false)
  const [reconciliation, setReconciliation] = useState<ReconciliationReport | null>(null)
  const [reconLoading, setReconLoading] = useState(false)
  const [successBanner, setSuccessBanner] = useState<string | null>(null)
  const [isCompletingJob, setIsCompletingJob] = useState(false)
  const [isReopeningJob, setIsReopeningJob] = useState(false)
  const [qbConnected, setQbConnected] = useState(false)
  const [showAddCO, setShowAddCO] = useState(false)
  const [coForm, setCoForm] = useState({ description: '', amount: '' })
  const [isSubmittingCO, setIsSubmittingCO] = useState(false)
  const [recordPaymentOpen, setRecordPaymentOpen] = useState<number | null>(null)
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'Check', checkNumber: '', notes: '' })
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false)

  // State: Right panel — Orbital/Hub ecosystem
  const [hubView, setHubView] = useState<'orbital' | 'inbox'>('orbital')
  const [hubTrades, setHubTrades] = useState<HubTrade[]>([])
  const [selectedTrade, setSelectedTrade] = useState<VDPTrade | null>(null)

  // Data hooks
  const { project, sovLines, payApps, changeOrders, attachments, isLoading, error, refresh } =
    useProject(projectId)
  const { isTrialGated } = useTrial()

  // Derived state
  const isJobCompleted = project?.status === 'completed'
  const isFullyBilled = reconciliation?.summary?.is_fully_reconciled ?? false
  const nextPayAppNumber = (payApps[payApps.length - 1]?.app_number ?? 0) + 1

  // Calculate ready-to-bill amount (total scheduled - total billed)
  const readyToBill = useMemo(() => {
    if (!reconciliation?.summary) return 0
    const { total_work_completed = 0, total_billed = 0 } = reconciliation.summary
    return Math.max(0, total_work_completed - total_billed)
  }, [reconciliation])

  // Success banner effect
  useEffect(() => {
    const sent = searchParams.get('sent')
    if (sent) {
      const paNum = sent.replace('pa', '#')
      setSuccessBanner(`Pay Application ${paNum} sent successfully!`)
      searchParams.delete('sent')
      setSearchParams(searchParams, { replace: true })
      const timer = setTimeout(() => setSuccessBanner(null), 8000)
      return () => clearTimeout(timer)
    }
  }, [searchParams, setSearchParams])

  // Load reconciliation
  useEffect(() => {
    if (projectId && !reconciliation && (activeTab === 'reconciliation' || payApps.length > 0)) {
      setReconLoading(true)
      getProjectReconciliation(projectId)
        .then(res => { if (res.data) setReconciliation(res.data) })
        .catch(() => {})
        .finally(() => setReconLoading(false))
    }
  }, [activeTab, projectId, reconciliation, payApps.length])

  // Check QB connection status
  useEffect(() => {
    const checkQBStatus = async () => {
      try {
        const response = await fetch('/api/quickbooks/status', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`,
          },
        })
        if (response.ok) {
          const data = await response.json()
          setQbConnected(data.connected === true)
        }
      } catch {
        setQbConnected(false)
      }
    }
    checkQBStatus()
  }, [])

  // Load hub trades when orbital view is active
  useEffect(() => {
    if (hubView !== 'orbital' || !projectId) return
    getTrades(projectId)
      .then(res => { if (res.data) setHubTrades(res.data) })
      .catch(() => {})
  }, [hubView, projectId])

  // Handlers
  const handleCreatePayApp = async () => {
    if (isCreatingPayApp || isTrialGated) return
    try {
      setIsCreatingPayApp(true)
      const newPayApp = await createPayApp(projectId, 'web')
      if (newPayApp?.id) {
        navigate(`/projects/${projectId}/pay-app/${newPayApp.id}`)
      }
    } catch (err) {
      console.error('Failed to create pay app:', err)
    } finally {
      setIsCreatingPayApp(false)
    }
  }

  const handleAddChangeOrder = async () => {
    if (isSubmittingCO || !coForm.description.trim() || !coForm.amount.trim()) {
      alert('Please fill in all fields')
      return
    }
    try {
      setIsSubmittingCO(true)
      const amount = parseFloat(coForm.amount.replace(/[^0-9.-]/g, ''))
      await createProjectChangeOrder(projectId, {
        description: coForm.description,
        amount,
      })
      setCoForm({ description: '', amount: '' })
      setShowAddCO(false)
      await refresh()
    } catch (err) {
      console.error('Failed to add change order:', err)
      alert('Failed to add change order')
    } finally {
      setIsSubmittingCO(false)
    }
  }

  const handleRecordPayment = async (payAppId: number) => {
    if (isSubmittingPayment || !paymentForm.amount) return
    try {
      setIsSubmittingPayment(true)
      const amount = parseFloat(paymentForm.amount.replace(/[^0-9.-]/g, ''))
      await recordManualPayment(projectId, payAppId, {
        amount,
        method: paymentForm.method,
        check_number: paymentForm.method === 'Check' ? paymentForm.checkNumber : undefined,
        notes: paymentForm.notes || undefined,
      })
      setRecordPaymentOpen(null)
      setPaymentForm({ amount: '', method: 'Check', checkNumber: '', notes: '' })
      await refresh()
    } catch (err) {
      console.error('Failed to record payment:', err)
      alert('Failed to record payment')
    } finally {
      setIsSubmittingPayment(false)
    }
  }

  const handleCompleteJob = async () => {
    if (isCompletingJob) return
    try {
      setIsCompletingJob(true)
      await completeProject(projectId)
      await refresh()
    } catch (err) {
      console.error('Failed to complete project:', err)
      alert('Failed to complete project')
    } finally {
      setIsCompletingJob(false)
    }
  }

  const handleReopenJob = async () => {
    if (isReopeningJob) return
    try {
      setIsReopeningJob(true)
      await reopenProject(projectId)
      await refresh()
    } catch (err) {
      console.error('Failed to reopen project:', err)
      alert('Failed to reopen project')
    } finally {
      setIsReopeningJob(false)
    }
  }

  // Orbital planets from trades
  const orbitalPlanets = useMemo(() => {
    return hubTrades.map((trade, idx) => {
      const trustColorMap: Record<string, string> = {
        high: '#00b87a',
        medium: '#2563eb',
        low: '#d97706',
      }
      const trustTier = (trade.trust_tier as 'high' | 'medium' | 'low') ?? 'medium'
      return {
        name: trade.trade_name || `Trade ${idx + 1}`,
        initials: (trade.trade_name?.[0] || 'T').toUpperCase(),
        color: trustColorMap[trustTier],
        orbitRadius: 80 + idx * 20,
        speed: 1 + idx * 0.15,
        size: 16,
        trustScore: trade.trust_score ?? 0,
      }
    })
  }, [hubTrades])

  // Handle planet click in orbital
  const handleOrbitalPlanetClick = (tradeName: string) => {
    const trade = hubTrades.find(t => t.trade_name === tradeName)
    if (trade) {
      const vdpTrade: VDPTrade = {
        id: trade.id,
        name: trade.trade_name,
        company_name: trade.company_name || '',
        contact_email: trade.contact_email || '',
        status: trade.status || 'pending',
        email_alias: trade.email_alias,
        invoice_total: trade.invoice_total,
        last_upload_at: trade.last_upload_at,
        doc_count: trade.doc_count,
        unread_count: trade.unread_count,
        trust_score: trade.trust_score,
        trust_tier: trade.trust_tier,
      }
      setSelectedTrade(vdpTrade)
    }
  }

  // Handle loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid grid-cols-3 gap-6 mb-8">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-text-primary mb-2">Project not found</h2>
          <p className="text-text-muted mb-6">We couldn't load the project details.</p>
          <Button onClick={() => navigate('/projects')}>Back to Projects</Button>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════
  // MAIN RENDER — Split-screen layout
  // ═══════════════════════════════════════════════════════

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)' }} className="bg-gray-50">
      {/* LEFT PANEL — 55% — Financial data, scrollable, white */}
      <div
        style={{
          width: '55%',
          overflowY: 'auto',
          background: '#ffffff',
          borderRight: '1.5px solid #e2e8f0',
          padding: '24px',
        }}
        className="flex flex-col gap-6"
      >
        {/* Back link */}
        <Link to="/projects" className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
          <ChevronRight className="w-4 h-4 rotate-180" />
          Back to Projects
        </Link>

        {/* Success banner */}
        <AnimatePresence>
          {successBanner && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded"
            >
              <p className="text-emerald-800 font-medium flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                {successBanner}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header: Project name + status */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="text-3xl font-bold text-text-primary font-serif">{project.name}</h1>
            {isJobCompleted && (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5" />
                Completed
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <p className="text-text-muted">Owner</p>
              <p className="font-medium text-text-primary">{project.owner || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-text-muted">Contract Amount</p>
              <p className="font-mono font-semibold text-text-primary">{formatCurrency(project.original_contract || 0)}</p>
            </div>
            <div>
              <p className="text-text-muted">Terms</p>
              <p className="font-medium text-text-primary">{project.payment_terms || 'Net 30'}</p>
            </div>
          </div>
        </div>

        {/* HERO CTA: Create Pay App */}
        {!isJobCompleted && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-r from-blue-50 to-cyan-50 border-l-4 border-blue-500 rounded-lg p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-blue-900 mb-1">Ready to bill</p>
                <p className="text-2xl font-bold text-blue-950 font-mono">{formatCurrency(readyToBill)}</p>
                <p className="text-xs text-blue-700 mt-2">
                  {payApps.length === 0
                    ? 'Create your first pay application'
                    : `Next: Pay Application #${nextPayAppNumber}`}
                </p>
              </div>
              <Button
                onClick={handleCreatePayApp}
                disabled={isCreatingPayApp || isTrialGated}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center gap-2"
              >
                {isCreatingPayApp ? '...' : <>
                  <Zap className="w-4 h-4" />
                  Create Pay App
                </>}
              </Button>
            </div>
          </motion.div>
        )}

        {/* Job completed state */}
        {isJobCompleted && (
          <Card className="bg-emerald-50 border-emerald-200 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-emerald-900 mb-1">Job Completed</h3>
                <p className="text-sm text-emerald-700">
                  All line items have been billed. You can reopen this project to add more pay applications if needed.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReopenJob}
                disabled={isReopeningJob}
              >
                {isReopeningJob ? 'Reopening...' : 'Reopen Job'}
              </Button>
            </div>
          </Card>
        )}

        {/* Financial KPI grid */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-5">
            <p className="text-xs text-text-muted uppercase tracking-wide">Contract Amount</p>
            <p className="text-xl font-bold text-text-primary font-mono mt-2">
              {formatCurrency(project.original_contract || 0)}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs text-text-muted uppercase tracking-wide">Total Change Orders</p>
            <p className="text-xl font-bold text-text-primary font-mono mt-2">
              {formatCurrency(changeOrders.reduce((sum, co) => sum + (co.amount || 0), 0))}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs text-text-muted uppercase tracking-wide">Total Billed</p>
            <p className="text-xl font-bold text-emerald-700 font-mono mt-2">
              {formatCurrency(reconciliation?.summary?.total_billed || 0)}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs text-text-muted uppercase tracking-wide">Retention Held</p>
            <p className="text-xl font-bold text-amber-700 font-mono mt-2">
              {formatCurrency(reconciliation?.summary?.total_retainage_held || 0)}
            </p>
          </Card>
        </div>

        {/* Tabs */}
        <div className="border-b border-border">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-3.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                    isActive
                      ? tab.accent
                        ? 'border-emerald-500 text-emerald-700'
                        : 'border-blue-500 text-blue-700'
                      : 'border-transparent text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1">
          {activeTab === 'payapps' && (
            <div className="space-y-4">
              {payApps.length === 0 ? (
                <EmptyState
                  icon={ReceiptText}
                  title="No Pay Applications"
                  description="Create your first pay application to get started"
                />
              ) : (
                payApps.map(pa => (
                  <PayAppRow
                    key={pa.id}
                    payApp={pa}
                    projectId={projectId}
                    recordPaymentForm={paymentForm}
                    showRecordPaymentForm={recordPaymentOpen === pa.id}
                    onShowRecordPaymentChange={(show) => setRecordPaymentOpen(show ? pa.id : null)}
                    onRecordPaymentChange={(field, value) =>
                      setPaymentForm(prev => ({ ...prev, [field]: value }))
                    }
                    onRecordPaymentSubmit={() => handleRecordPayment(pa.id)}
                    isRecordingPayment={isSubmittingPayment}
                  />
                ))
              )}
            </div>
          )}

          {activeTab === 'sov' && (
            <div className="space-y-4">
              {sovLines.length === 0 ? (
                <EmptyState
                  icon={Upload}
                  title="No Schedule of Values"
                  description="Upload a Schedule of Values to get started"
                />
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-text-primary">{sovLines.length} Line Items</h3>
                    {qbConnected && <QBEstimateImport projectId={projectId} />}
                  </div>
                  <SOVTable lines={sovLines} isLoading={false} />
                </>
              )}
            </div>
          )}

          {activeTab === 'changeorders' && (
            <div className="space-y-4">
              {changeOrders.length > 0 && (
                <div className="space-y-3">
                  {changeOrders.map(co => (
                    <Card key={co.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold text-text-primary">{co.description}</h4>
                          <p className="text-sm text-text-muted mt-1">{formatDate(co.created_at)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-lg text-text-primary">
                            {formatCurrency(co.amount)}
                          </p>
                          <Badge variant="outline" className="mt-1">
                            {co.status}
                          </Badge>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
              <div className="space-y-3">
                <Button
                  variant="outline"
                  onClick={() => setShowAddCO(!showAddCO)}
                  className="w-full"
                >
                  {showAddCO ? 'Cancel' : '+ Add Change Order'}
                </Button>
                {showAddCO && (
                  <Card className="p-4 space-y-3">
                    <div>
                      <label className="text-xs font-medium text-text-muted">Description</label>
                      <input
                        type="text"
                        value={coForm.description}
                        onChange={e => setCoForm({ ...coForm, description: e.target.value })}
                        placeholder="e.g., Additional site work"
                        className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-muted">Amount</label>
                      <input
                        type="text"
                        value={coForm.amount}
                        onChange={e => setCoForm({ ...coForm, amount: e.target.value })}
                        placeholder="0.00"
                        className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm"
                      />
                    </div>
                    <Button
                      onClick={handleAddChangeOrder}
                      disabled={isSubmittingCO}
                      className="w-full"
                    >
                      {isSubmittingCO ? 'Adding...' : 'Add Change Order'}
                    </Button>
                  </Card>
                )}
              </div>
            </div>
          )}

          {activeTab === 'documents' && (
            <div>
              {attachments.length === 0 ? (
                <EmptyState
                  icon={FolderOpen}
                  title="No Documents"
                  description="Upload project documents here"
                />
              ) : (
                <div className="space-y-3">
                  {attachments.map(att => (
                    <Card key={att.id} className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-text-primary">{att.filename}</p>
                        <p className="text-xs text-text-muted mt-1">{formatDate(att.created_at)}</p>
                      </div>
                      <Button variant="outline" size="sm">
                        <FileText className="w-4 h-4" />
                      </Button>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'reconciliation' && (
            <div>
              {reconLoading ? (
                <Skeleton className="h-64" />
              ) : reconciliation ? (
                <div className="space-y-4">
                  <Card className={`p-4 ${isFullyBilled ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-sm font-medium ${isFullyBilled ? 'text-emerald-900' : 'text-amber-900'}`}>
                          {isFullyBilled ? '✓ Fully Reconciled' : 'Reconciliation pending'}
                        </p>
                        <p className={`text-xs mt-1 ${isFullyBilled ? 'text-emerald-700' : 'text-amber-700'}`}>
                          All work completed has been billed
                        </p>
                      </div>
                    </div>
                  </Card>
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="p-4">
                      <p className="text-xs text-text-muted">Total Work Completed</p>
                      <p className="text-lg font-bold text-text-primary font-mono mt-1">
                        {formatCurrency(reconciliation.summary?.total_work_completed || 0)}
                      </p>
                    </Card>
                    <Card className="p-4">
                      <p className="text-xs text-text-muted">Total Billed</p>
                      <p className="text-lg font-bold text-text-primary font-mono mt-1">
                        {formatCurrency(reconciliation.summary?.total_billed || 0)}
                      </p>
                    </Card>
                    <Card className="p-4">
                      <p className="text-xs text-text-muted">Total Retainage</p>
                      <p className="text-lg font-bold text-amber-700 font-mono mt-1">
                        {formatCurrency(reconciliation.summary?.total_retainage_held || 0)}
                      </p>
                    </Card>
                    <Card className="p-4">
                      <p className="text-xs text-text-muted">Balance to Finish</p>
                      <p className="text-lg font-bold text-text-primary font-mono mt-1">
                        {formatCurrency((reconciliation.summary?.total_work_completed || 0) - (reconciliation.summary?.total_billed || 0))}
                      </p>
                    </Card>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL — 45% — Dark orbital + hub ecosystem */}
      <div
        style={{
          width: '45%',
          display: 'flex',
          flexDirection: 'column',
          background: '#04070f',
        }}
        className="overflow-hidden relative"
      >
        {/* Toggle bar — orbital / inbox / invite */}
        <div className="bg-slate-900 border-b border-slate-700 p-3 flex items-center gap-2">
          <button
            onClick={() => setHubView('orbital')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              hubView === 'orbital'
                ? 'bg-white text-slate-900'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            🪐 Orbital
          </button>
          <button
            onClick={() => setHubView('inbox')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              hubView === 'inbox'
                ? 'bg-white text-slate-900'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            📥 Inbox
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden relative">
          {hubView === 'orbital' && (
            <div className="relative w-full h-full">
              {hubTrades.length > 0 ? (
                <>
                  <OrbitalCanvas
                    planets={orbitalPlanets}
                    onPlanetHover={(name) => {
                      // Could be used for tooltip, but orbital handles this internally
                    }}
                  />
                  {/* Vendor detail panel slides in from right */}
                  <AnimatePresence>
                    {selectedTrade && (
                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="absolute right-0 top-0 bottom-0 w-72 bg-white border-l border-slate-200 shadow-2xl z-50"
                      >
                        <VendorDetailPanel
                          trade={selectedTrade}
                          projectAddress={project?.address || ''}
                          onClose={() => setSelectedTrade(null)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center p-6 text-center">
                  <div>
                    <p className="text-slate-400 text-sm">No trades added yet</p>
                    <p className="text-slate-500 text-xs mt-1">Add trades to see the orbital ecosystem</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {hubView === 'inbox' && (
            <div className="w-full h-full overflow-hidden">
              <HubTab projectId={projectId} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
