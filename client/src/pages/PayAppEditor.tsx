/**
 * PayAppEditor — G702/G703 Construction Billing Editor
 * Core component for entering work completed percentages and generating pay applications
 *
 * CRITICAL: All G702/G703 math is handled by the backend and displayed here.
 * User ONLY edits Column C (Work Completed This Period %) and retainage %.
 * All other columns are computed and display-only.
 */

import { useState, useCallback, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  AlertTriangle,
  Save,
  Download,
  Mail,
  Plus,
} from 'lucide-react'
import type { PayAppLineComputed } from '@/types'
import { usePayApp } from '@/hooks/usePayApp'
import { useTrial } from '@/hooks/useTrial'
import { formatCurrency, formatPercent, formatDate } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

// ============================================================================
// EMAIL MODAL
// ============================================================================

interface EmailModalProps {
  isOpen: boolean
  isLoading: boolean
  onClose: () => void
  onSubmit: (data: EmailFormData) => void
  defaultTo?: string
  defaultCC?: string
}

interface EmailFormData {
  to: string
  cc?: string
  subject: string
  message: string
  includeLienWaiver: boolean
}

function EmailModal({
  isOpen,
  isLoading,
  onClose,
  onSubmit,
  defaultTo = '',
  defaultCC = '',
}: EmailModalProps) {
  const [formData, setFormData] = useState<EmailFormData>({
    to: defaultTo,
    cc: defaultCC,
    subject: 'Payment Application',
    message: 'Please review the attached payment application.',
    includeLienWaiver: false,
  })

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = e.target
    if (type === 'checkbox') {
      setFormData((prev) => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked,
      }))
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }))
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Send Pay Application
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              To
            </label>
            <Input
              type="email"
              name="to"
              value={formData.to}
              onChange={handleChange}
              placeholder="owner@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              CC (optional)
            </label>
            <Input
              type="email"
              name="cc"
              value={formData.cc}
              onChange={handleChange}
              placeholder="another@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Subject
            </label>
            <Input
              type="text"
              name="subject"
              value={formData.subject}
              onChange={handleChange}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Message
            </label>
            <textarea
              name="message"
              value={formData.message}
              onChange={handleChange}
              rows={4}
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-text-primary"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="includeLienWaiver"
              checked={formData.includeLienWaiver}
              onChange={handleChange}
              className="rounded"
            />
            <span className="text-sm text-text-secondary">
              Include lien waiver PDF
            </span>
          </label>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? 'Sending...' : 'Send'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

// ============================================================================
// CHANGE ORDER SECTION
// ============================================================================

interface ChangeOrderFormState {
  description: string
  amount: string
}

function ChangeOrdersSection() {
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<ChangeOrderFormState>({
    description: '',
    amount: '',
  })

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleAddCO = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: Add change order via API
    console.log('Add CO:', formData)
    setFormData({ description: '', amount: '' })
    setShowForm(false)
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-text-primary">Change Orders</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm(!showForm)}
          className="gap-1"
        >
          <Plus className="w-4 h-4" />
          Add CO
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleAddCO} className="space-y-3 mb-4 p-3 bg-gray-50 rounded-lg border border-border">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Description
            </label>
            <Input
              type="text"
              name="description"
              value={formData.description}
              onChange={handleFormChange}
              placeholder="Change order description"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Amount
            </label>
            <Input
              type="number"
              step="0.01"
              name="amount"
              value={formData.amount}
              onChange={handleFormChange}
              placeholder="0.00"
              required
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="sm">
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-2 text-sm text-text-muted">
        <p>No change orders yet</p>
      </div>
    </Card>
  )
}

// ============================================================================
// NOTES SECTION
// ============================================================================

interface NotesSectionProps {
  poNumber: string
  notes: string
  onPoChange: (value: string) => void
  onNotesChange: (value: string) => void
}

function NotesSection({
  poNumber,
  notes,
  onPoChange,
  onNotesChange,
}: NotesSectionProps) {
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-text-primary mb-4">Notes & Details</h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            PO Number
          </label>
          <Input
            type="text"
            value={poNumber}
            onChange={(e) => onPoChange(e.target.value)}
            placeholder="Optional PO number"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            Special Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Add any notes or comments for this pay application..."
            rows={4}
            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-text-primary"
          />
        </div>
      </div>
    </Card>
  )
}

// ============================================================================
// G702/G703 SUMMARY SIDEBAR
// ============================================================================

interface G702SummaryProps {
  payAppNumber?: number
  originalContract?: number
  totals: any | null
  isLoading: boolean
}

function G702Summary({
  originalContract = 0,
  totals,
  isLoading,
}: G702SummaryProps) {
  if (isLoading || !totals) {
    return (
      <Card className="p-6">
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
        </div>
      </Card>
    )
  }

  const retainagePct =
    totals.totalCompleted > 0
      ? ((totals.totalRetainage / totals.totalCompleted) * 100).toFixed(1)
      : '0.0'

  return (
    <Card className="p-6 bg-gradient-to-br from-primary-50 to-primary-25">
      <h3 className="text-lg font-semibold text-text-primary mb-4">
        G702 Summary
      </h3>

      <div className="space-y-3 text-sm">
        {/* Original Contract Sum */}
        <div className="flex justify-between">
          <span className="text-text-secondary">Original Contract Sum</span>
          <span className="font-medium text-text-primary font-mono tabular-nums">
            {formatCurrency(originalContract)}
          </span>
        </div>

        <hr className="border-primary-200" />

        {/* Total Completed & Stored */}
        <div className="flex justify-between">
          <span className="text-text-secondary">Total Completed to Date (D)</span>
          <span className="font-medium text-text-primary font-mono tabular-nums">
            {formatCurrency(totals.totalCompleted)}
          </span>
        </div>

        {/* Retainage */}
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-text-secondary">Retainage (E)</span>
            <span className="font-medium text-text-primary font-mono tabular-nums">
              {formatCurrency(totals.totalRetainage)}
            </span>
          </div>
          <div className="flex justify-between text-xs text-text-muted ml-4">
            <span>{formatPercent(parseFloat(retainagePct), 1)} of Work</span>
          </div>
        </div>

        {/* Total Earned Less Retainage */}
        <div className="flex justify-between">
          <span className="text-text-secondary">Total Earned Less Retainage (F)</span>
          <span className="font-medium text-text-primary font-mono tabular-nums">
            {formatCurrency(totals.totalEarned)}
          </span>
        </div>

        {/* Previous Certificates */}
        <div className="flex justify-between">
          <span className="text-text-secondary">Less Previous Certificates (G)</span>
          <span className="font-medium text-text-primary font-mono tabular-nums">
            {formatCurrency(totals.totalPrevCertificates)}
          </span>
        </div>

        <hr className="border-primary-200" />

        {/* CURRENT PAYMENT DUE — PROMINENT */}
        <div className="bg-white/60 rounded-lg p-3 border border-primary-300">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-text-primary">
              Current Payment Due (H)
            </span>
            <span className="text-2xl font-bold text-primary-600 font-mono tabular-nums">
              {formatCurrency(totals.totalCurrentDue)}
            </span>
          </div>
        </div>

        {/* Balance to Finish */}
        <div className="flex justify-between">
          <span className="text-text-secondary">Balance to Finish Including Retainage (I)</span>
          <span className="font-medium text-text-primary font-mono tabular-nums">
            {formatCurrency(totals.totalBalanceToFinish)}
          </span>
        </div>
      </div>
    </Card>
  )
}

// ============================================================================
// G703 CONTINUATION SHEET TABLE
// ============================================================================

interface G703TableProps {
  lines: PayAppLineComputed[]
  isLoading: boolean
  isDirty: boolean
  onLinePercentChange: (sovLineId: number, thisPct: number) => void
  onLineRetainageChange: (sovLineId: number, retainagePct: number) => void
}

function G703Table({
  lines,
  isLoading,
  isDirty,
  onLinePercentChange,
  onLineRetainageChange,
}: G703TableProps) {
  const handlePercentInput = (sovLineId: number, value: string) => {
    const pct = parseFloat(value) || 0
    onLinePercentChange(sovLineId, Math.max(0, Math.min(100, pct)))
  }

  const handleRetainageInput = (sovLineId: number, value: string) => {
    const pct = parseFloat(value) || 0
    onLineRetainageChange(sovLineId, Math.max(0, Math.min(100, pct)))
  }

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-2">
          <div className="h-8 bg-gray-200 rounded" />
          <div className="h-8 bg-gray-200 rounded" />
          <div className="h-8 bg-gray-200 rounded" />
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      {isDirty && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-800">
            You have unsaved changes. Click Save to keep your updates.
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-primary-600 bg-primary-50">
              <th className="px-3 py-2 text-left font-semibold text-text-primary w-12">
                #
              </th>
              <th className="px-3 py-2 text-left font-semibold text-text-primary">
                Description
              </th>
              <th className="px-3 py-2 text-right font-semibold text-text-primary min-w-[120px]">
                A: Scheduled Value
              </th>
              <th className="px-3 py-2 text-right font-semibold text-text-primary min-w-[110px]">
                B: Prev Work
              </th>
              <th className="px-3 py-2 text-center font-semibold text-text-primary min-w-[130px] bg-primary-100">
                <div className="text-xs font-medium text-primary-700">C: Work This Period %</div>
                <div className="text-xs text-primary-600 font-normal">Amount</div>
              </th>
              <th className="px-3 py-2 text-right font-semibold text-text-primary min-w-[110px]">
                D: Total Work
              </th>
              <th className="px-3 py-2 text-center font-semibold text-text-primary min-w-[110px]">
                <div className="text-xs font-medium">E: Retainage %</div>
              </th>
              <th className="px-3 py-2 text-right font-semibold text-text-primary min-w-[110px]">
                F: Earned
              </th>
              <th className="px-3 py-2 text-right font-semibold text-text-primary min-w-[110px]">
                G: Prev Certs
              </th>
              <th className="px-3 py-2 text-right font-semibold text-text-primary min-w-[120px] bg-success-50">
                <div className="text-primary-700">H: Due This Period</div>
              </th>
              <th className="px-3 py-2 text-right font-semibold text-text-primary min-w-[110px]">
                I: Balance to Finish
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.sov_line_id} className="border-b border-border hover:bg-gray-50">
                {/* Item Number */}
                <td className="px-3 py-2 text-text-muted text-xs font-medium w-12">
                  {line.id}
                </td>

                {/* Description */}
                <td className="px-3 py-2">
                  <div className="font-medium text-text-primary">
                    {line.description}
                  </div>
                </td>

                {/* A: Scheduled Value */}
                <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary">
                  {formatCurrency(line.scheduledValue)}
                </td>

                {/* B: Previous Work */}
                <td className="px-3 py-2 text-right font-mono tabular-nums text-text-secondary">
                  {formatCurrency(line.prevAmount)}
                </td>

                {/* C: Work This Period (EDITABLE) */}
                <td className="px-3 py-2 bg-primary-50 border-l-2 border-primary-200">
                  <div className="space-y-1">
                    <div className="flex gap-1 items-center justify-center">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={line.this_pct}
                        onChange={(e) =>
                          handlePercentInput(line.sov_line_id, e.target.value)
                        }
                        className="w-16 text-center text-sm font-mono"
                        placeholder="0"
                      />
                      <span className="text-xs text-text-secondary">%</span>
                    </div>
                    <div className="text-center text-xs font-mono tabular-nums text-text-secondary">
                      {formatCurrency(line.thisAmount)}
                    </div>
                  </div>
                </td>

                {/* D: Total Work */}
                <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary font-medium">
                  {formatCurrency(line.totalCompleted)}
                </td>

                {/* E: Retainage % (EDITABLE) */}
                <td className="px-3 py-2">
                  <div className="flex justify-center">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={line.retainage_pct}
                      onChange={(e) =>
                        handleRetainageInput(line.sov_line_id, e.target.value)
                      }
                      className="w-16 text-center text-sm font-mono"
                      placeholder="0"
                    />
                  </div>
                </td>

                {/* F: Total Earned */}
                <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary font-medium">
                  {formatCurrency(line.totalEarned)}
                </td>

                {/* G: Previous Certificates */}
                <td className="px-3 py-2 text-right font-mono tabular-nums text-text-secondary">
                  {formatCurrency(line.prevCertificates)}
                </td>

                {/* H: Payment Due This Period */}
                <td className="px-3 py-2 text-right font-mono tabular-nums text-success-600 font-bold bg-success-50">
                  {formatCurrency(line.currentDue)}
                </td>

                {/* I: Balance to Finish */}
                <td className="px-3 py-2 text-right font-mono tabular-nums text-text-secondary">
                  {formatCurrency(line.balanceToFinish)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lines.length === 0 && (
        <div className="text-center py-8 text-text-muted">
          <p>No line items in this pay application</p>
        </div>
      )}
    </Card>
  )
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export function PayAppEditor() {
  const { projectId, appId } = useParams<{ projectId: string; appId: string }>()
  const navigate = useNavigate()
  const payAppId = appId ? Number(appId) : 0

  const {
    payApp,
    computedLines,
    project,
    totals,
    isLoading,
    error,
    isDirty,
    updateLinePercent,
    updateLineRetainage,
    saveLines,
    downloadPDF,
    emailPayApp,
    updatePayApp,
  } = usePayApp(payAppId)

  const { isTrialGated } = useTrial()

  const [notes, setNotes] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
  const [isEmailLoading, setIsEmailLoading] = useState(false)

  // Sync notes/PO from payApp
  useEffect(() => {
    if (payApp) {
      setNotes(payApp.special_notes || '')
      setPoNumber(payApp.po_number || '')
    }
  }, [payApp])

  // Handle save
  const handleSave = useCallback(async () => {
    if (isTrialGated) {
      alert('Your trial has ended. Please upgrade to continue.')
      return
    }

    setIsSaving(true)
    try {
      const success = await saveLines()
      if (success) {
        // Also save notes and PO
        await updatePayApp({
          special_notes: notes,
          po_number: poNumber,
        })
      }
    } finally {
      setIsSaving(false)
    }
  }, [saveLines, updatePayApp, notes, poNumber, isTrialGated])

  // Handle download
  const handleDownloadPDF = useCallback(async () => {
    if (isTrialGated) {
      alert('Your trial has ended. Please upgrade to continue.')
      return
    }
    await downloadPDF()
  }, [downloadPDF, isTrialGated])

  // Handle email
  const handleEmailSubmit = useCallback(
    async (formData: any) => {
      if (isTrialGated) {
        alert('Your trial has ended. Please upgrade to continue.')
        setIsEmailModalOpen(false)
        return
      }

      setIsEmailLoading(true)
      try {
        const success = await emailPayApp({
          to: formData.to,
          cc: formData.cc,
          subject: formData.subject,
          message: formData.message,
          include_lien_waiver: formData.includeLienWaiver,
        })

        if (success) {
          setIsEmailModalOpen(false)
          // Update pay app status if it was draft
          if (payApp?.status === 'draft') {
            await updatePayApp({ status: 'submitted' })
          }
        }
      } finally {
        setIsEmailLoading(false)
      }
    },
    [emailPayApp, updatePayApp, payApp, isTrialGated],
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    )
  }

  if (error || !payApp || !project) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Pay Application"
          description="Error loading pay application"
        />
        <Card className="p-6 border-red-200 bg-red-50">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-900">
                {error || 'Pay application not found'}
              </p>
              <Button
                onClick={() => navigate(-1)}
                variant="outline"
                className="mt-3"
              >
                Go Back
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const statusColor =
    payApp.status === 'draft'
      ? 'bg-gray-100 text-gray-800'
      : payApp.status === 'submitted'
        ? 'bg-blue-100 text-blue-800'
        : 'bg-green-100 text-green-800'

  const periodLabel = payApp.period_label || formatDate(payApp.period_start)

  return (
    <div className="space-y-8 pb-8">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              to={`/projects/${projectId}`}
              className="text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Project
            </Link>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-text-primary">
              Pay Application #{payApp.app_number}
            </h1>
            <Badge className={statusColor}>{payApp.status}</Badge>
          </div>
          <p className="text-text-secondary">
            {project.name} • {periodLabel}
          </p>
        </div>

        {/* Action Buttons Top Right */}
        <div className="flex flex-wrap gap-2 justify-end">
          {payApp.status === 'draft' && (
            <Button
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              className="gap-2"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          )}

          <Button
            onClick={handleDownloadPDF}
            variant="outline"
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            PDF
          </Button>

          {payApp.status === 'draft' && (
            <Button
              onClick={() => setIsEmailModalOpen(true)}
              variant="outline"
              className="gap-2"
            >
              <Mail className="w-4 h-4" />
              Email
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: G703 Table + Notes */}
        <div className="lg:col-span-2 space-y-6">
          {/* G703 Table */}
          <G703Table
            lines={computedLines}
            isLoading={isLoading}
            isDirty={isDirty}
            onLinePercentChange={updateLinePercent}
            onLineRetainageChange={updateLineRetainage}
          />

          {/* Change Orders */}
          <ChangeOrdersSection />

          {/* Notes & Details */}
          <NotesSection
            poNumber={poNumber}
            notes={notes}
            onPoChange={setPoNumber}
            onNotesChange={setNotes}
          />
        </div>

        {/* Right Column: G702 Summary + Action Buttons */}
        <div className="space-y-6">
          {/* G702 Summary */}
          <G702Summary
            payAppNumber={payApp.app_number}
            originalContract={project.original_contract}
            totals={totals}
            isLoading={isLoading}
          />

          {/* Action Buttons Sidebar */}
          <div className="space-y-2">
            {payApp.status === 'draft' && (
              <Button
                onClick={handleSave}
                disabled={!isDirty || isSaving}
                className="w-full gap-2"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            )}

            <Button
              onClick={handleDownloadPDF}
              variant="outline"
              className="w-full gap-2"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </Button>

            {payApp.status === 'draft' && (
              <Button
                onClick={() => setIsEmailModalOpen(true)}
                variant="outline"
                className="w-full gap-2"
              >
                <Mail className="w-4 h-4" />
                Send & Submit
              </Button>
            )}
          </div>

          {/* Payment Status Card */}
          {payApp.payment_status !== 'unpaid' && (
            <Card className="p-6 border-green-200 bg-green-50">
              <div className="space-y-2">
                <h4 className="font-semibold text-green-900">Payment Status</h4>
                <p className="text-sm text-green-700 capitalize">
                  {payApp.payment_status === 'partial'
                    ? `Partially Paid (${formatCurrency(payApp.amount_paid)})`
                    : payApp.payment_status === 'paid'
                      ? `Paid (${formatCurrency(payApp.amount_paid)})`
                      : 'Processing'}
                </p>
              </div>
            </Card>
          )}

          {/* Timestamps */}
          {payApp.submitted_at && (
            <Card className="p-4 bg-gray-50">
              <div className="text-xs text-text-muted space-y-1">
                <div>
                  <span className="font-medium">Submitted:</span>{' '}
                  {formatDate(payApp.submitted_at)}
                </div>
                <div>
                  <span className="font-medium">Created:</span>{' '}
                  {formatDate(payApp.created_at)}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Email Modal */}
      <EmailModal
        isOpen={isEmailModalOpen}
        isLoading={isEmailLoading}
        onClose={() => setIsEmailModalOpen(false)}
        onSubmit={handleEmailSubmit}
        defaultTo={project.owner_email || ''}
        defaultCC={project.contact_email || ''}
      />
    </div>
  )
}
