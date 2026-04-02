/**
 * PayAppEditor — G702/G703 Construction Billing Editor
 * 6-step wizard flow matching the original app.html:
 *   Step 1: G703 — Billing (Schedule of Values) with bulk % apply
 *   Step 2: Change Orders
 *   Step 3: Attachments
 *   Step 4: G702 — Summary & Notes
 *   Step 5: Lien Waiver
 *   Step 6: Preview & Send
 */

import { useState, useCallback, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Save,
  Download,
  Mail,
  Plus,
  Trash2,
  Paperclip,
  Shield,
} from 'lucide-react'
import type { PayAppLineComputed, ChangeOrder } from '@/types'
import { usePayApp } from '@/hooks/usePayApp'
import { useTrial } from '@/hooks/useTrial'
import { formatCurrency, formatPercent, formatDate } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

type Step = 1 | 2 | 3 | 4 | 5 | 6

const STEP_LABELS: Record<Step, string> = {
  1: 'G703 — Billing',
  2: 'Change Orders',
  3: 'Attachments',
  4: 'G702 — Summary',
  5: 'Lien Waiver',
  6: 'Preview & Send',
}

// Icons available for future use in step tabs
// const STEP_ICONS: Record<Step, React.ReactNode> = { ... }

// ============================================================================
// EMAIL MODAL
// ============================================================================

interface EmailFormData {
  to: string
  cc?: string
  subject: string
  message: string
  includeLienWaiver: boolean
  includePaymentLink: boolean
}

function EmailModal({
  isOpen,
  isLoading,
  onClose,
  onSubmit,
  defaultTo = '',
  defaultCC = '',
  payAppNumber,
  projectName,
}: {
  isOpen: boolean
  isLoading: boolean
  onClose: () => void
  onSubmit: (data: EmailFormData) => void
  defaultTo?: string
  defaultCC?: string
  payAppNumber?: number
  projectName?: string
}) {
  const [formData, setFormData] = useState<EmailFormData>({
    to: defaultTo,
    cc: defaultCC,
    subject: `Payment Application #${payAppNumber || ''} — ${projectName || ''}`,
    message: 'Please review the attached payment application.',
    includeLienWaiver: true,
    includePaymentLink: true,
  })

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      to: defaultTo,
      cc: defaultCC,
      subject: `Payment Application #${payAppNumber || ''} — ${projectName || ''}`,
    }))
  }, [defaultTo, defaultCC, payAppNumber, projectName])

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
      setFormData((prev) => ({ ...prev, [name]: value }))
    }
  }

  if (!isOpen) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', duration: 0.4 }}
      >
        <Card className="w-full max-w-md p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            Send Pay Application
          </h2>
          <p className="text-sm text-text-secondary mb-4">
            The client will receive a professional email with the G702/G703 PDF attached.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              onSubmit(formData)
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">To *</label>
              <Input type="email" name="to" value={formData.to} onChange={handleChange} placeholder="owner@example.com" required />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">CC (optional)</label>
              <Input type="email" name="cc" value={formData.cc} onChange={handleChange} placeholder="another@example.com" />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Subject</label>
              <Input type="text" name="subject" value={formData.subject} onChange={handleChange} />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Message</label>
              <textarea
                name="message"
                value={formData.message}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-text-primary text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="includeLienWaiver" checked={formData.includeLienWaiver} onChange={handleChange} className="rounded" />
                <span className="text-sm text-text-secondary">Attach lien waiver to email</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="includePaymentLink" checked={formData.includePaymentLink} onChange={handleChange} className="rounded" />
                <span className="text-sm text-text-secondary">Include "Pay Now" button in email</span>
              </label>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white">
                {isLoading ? 'Sending...' : 'Send & Mark Submitted'}
              </Button>
            </div>
          </form>
        </Card>
      </motion.div>
    </motion.div>
  )
}

// ============================================================================
// STEP TAB BAR
// ============================================================================

function StepTabs({ currentStep, onStepChange }: { currentStep: Step; onStepChange: (s: Step) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-2 -mx-1 px-1">
      {([1, 2, 3, 4, 5, 6] as Step[]).map((step) => (
        <button
          key={step}
          onClick={() => onStepChange(step)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
            step === currentStep
              ? 'bg-primary-600 text-white shadow-md'
              : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
          }`}
        >
          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
            step === currentStep ? 'bg-white/20 text-white' : 'bg-gray-300 text-gray-600'
          }`}>
            {step}
          </span>
          <span className="hidden sm:inline">{STEP_LABELS[step]}</span>
        </button>
      ))}
    </div>
  )
}

// ============================================================================
// STEP NAVIGATION FOOTER
// ============================================================================

function StepNav({
  currentStep,
  onPrev,
  onNext,
  nextLabel,
  onSaveAndNext,
  isSaving,
}: {
  currentStep: Step
  onPrev: () => void
  onNext: () => void
  nextLabel?: string
  onSaveAndNext?: () => void
  isSaving?: boolean
}) {
  return (
    <div className="flex justify-between items-center pt-6 border-t border-border mt-6">
      {currentStep > 1 ? (
        <Button onClick={onPrev} variant="outline" className="gap-1">
          <ChevronLeft className="w-4 h-4" />
          Back
        </Button>
      ) : (
        <div />
      )}

      <span className="text-sm text-text-muted">
        Step {currentStep} of 6
      </span>

      {currentStep < 6 ? (
        <Button
          onClick={onSaveAndNext || onNext}
          disabled={isSaving}
          className="gap-1 bg-primary-600 hover:bg-primary-700"
        >
          {isSaving ? 'Saving...' : nextLabel || `Next: ${STEP_LABELS[(currentStep + 1) as Step]}`}
          <ChevronRight className="w-4 h-4" />
        </Button>
      ) : (
        <div />
      )}
    </div>
  )
}

// ============================================================================
// STEP 1: G703 — BILLING TABLE WITH BULK APPLY
// ============================================================================

function Step1G703({
  lines,
  isDirty,
  onLinePercentChange,
  onLineRetainageChange,
}: {
  lines: PayAppLineComputed[]
  isDirty: boolean
  onLinePercentChange: (sovLineId: number, thisPct: number) => void
  onLineRetainageChange: (sovLineId: number, retainagePct: number) => void
}) {
  const [bulkPct, setBulkPct] = useState(20)

  const applyBulk = () => {
    lines.forEach((line) => {
      const maxPct = 100 - (line.prev_pct || 0)
      const pct = Math.min(bulkPct, maxPct)
      onLinePercentChange(line.sov_line_id, pct)
    })
  }

  const clearAll = () => {
    lines.forEach((line) => {
      onLinePercentChange(line.sov_line_id, 0)
    })
  }

  return (
    <div className="space-y-4">
      {/* Bulk Apply Bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-text-primary">
            Apply billing % to all lines:
          </label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0"
              max="100"
              step="1"
              value={bulkPct}
              onChange={(e) => setBulkPct(parseInt(e.target.value) || 0)}
              className="w-20 text-center"
            />
            <span className="text-sm text-text-secondary">%</span>
          </div>
          <Button onClick={applyBulk} size="sm" className="bg-primary-600 hover:bg-primary-700">
            Apply to all
          </Button>
          <Button onClick={clearAll} size="sm" variant="outline">
            Clear all
          </Button>
          <span className="text-xs text-text-muted ml-auto">
            Retainage % editable per line
          </span>
        </div>
      </Card>

      {/* Unsaved warning */}
      {isDirty && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-800">
            You have unsaved changes. Click "Save & Next" to keep your updates.
          </p>
        </div>
      )}

      {/* G703 Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: '950px' }}>
            <thead>
              <tr className="border-b-2 border-primary-600 bg-primary-50">
                <th className="px-3 py-2 text-left font-semibold text-text-primary" style={{ width: 65 }}>Item</th>
                <th className="px-3 py-2 text-left font-semibold text-text-primary" style={{ minWidth: 180 }}>Description</th>
                <th className="px-3 py-2 text-right font-semibold text-text-primary" style={{ width: 105 }}>Sched. Value</th>
                <th className="px-3 py-2 text-right font-semibold text-text-primary" style={{ width: 95 }}>Prev. Billed</th>
                <th className="px-3 py-2 text-center font-semibold text-text-primary" style={{ width: 60 }}>% Prev.</th>
                <th className="px-3 py-2 text-center font-semibold text-primary-700 bg-primary-100" style={{ width: 90 }}>% This Period</th>
                <th className="px-3 py-2 text-right font-semibold text-text-primary" style={{ width: 100 }}>This Period $</th>
                <th className="px-3 py-2 text-center font-semibold text-text-primary" style={{ width: 58 }}>Ret. %</th>
                <th className="px-3 py-2 text-right font-semibold text-text-primary" style={{ width: 90 }}>Retainage $</th>
                <th className="px-3 py-2 text-right font-semibold text-text-primary" style={{ width: 110 }}>Total Complete</th>
                <th className="px-3 py-2 text-right font-semibold text-text-primary" style={{ width: 88 }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.sov_line_id} className="border-b border-border hover:bg-gray-50">
                  <td className="px-3 py-2 text-text-muted text-xs font-medium">{line.id}</td>
                  <td className="px-3 py-2 font-medium text-text-primary">{line.description}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(line.scheduledValue)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-text-secondary">{formatCurrency(line.prevAmount)}</td>
                  <td className="px-3 py-2 text-center font-mono tabular-nums text-text-secondary">{formatPercent(line.prev_pct, 0)}</td>
                  <td className="px-3 py-2 bg-primary-50 border-x border-primary-200">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={line.this_pct}
                      onChange={(e) => {
                        const pct = parseFloat(e.target.value) || 0
                        onLinePercentChange(line.sov_line_id, Math.max(0, Math.min(100, pct)))
                      }}
                      className="w-16 mx-auto text-center text-sm font-mono"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums font-medium">{formatCurrency(line.thisAmount)}</td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={line.retainage_pct}
                      onChange={(e) => {
                        const pct = parseFloat(e.target.value) || 0
                        onLineRetainageChange(line.sov_line_id, Math.max(0, Math.min(100, pct)))
                      }}
                      className="w-14 mx-auto text-center text-xs font-mono"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-text-secondary">{formatCurrency(line.retainageHeld)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums font-medium">{formatCurrency(line.totalCompleted)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-text-secondary">{formatCurrency(line.balanceToFinish)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-primary-600">
              <tr className="font-semibold">
                <td colSpan={2} className="px-3 py-3 text-right text-text-primary">Totals</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(lines.reduce((s, l) => s + l.scheduledValue, 0))}</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(lines.reduce((s, l) => s + l.prevAmount, 0))}</td>
                <td className="px-3 py-3" />
                <td className="px-3 py-3 bg-primary-50" />
                <td className="px-3 py-3 text-right font-mono tabular-nums text-primary-700">{formatCurrency(lines.reduce((s, l) => s + l.thisAmount, 0))}</td>
                <td className="px-3 py-3" />
                <td className="px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(lines.reduce((s, l) => s + l.retainageHeld, 0))}</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(lines.reduce((s, l) => s + l.totalCompleted, 0))}</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(lines.reduce((s, l) => s + l.balanceToFinish, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {lines.length === 0 && (
          <div className="text-center py-8 text-text-muted">
            <p>No line items in this pay application. Upload an SOV in the project settings first.</p>
          </div>
        )}
      </Card>
    </div>
  )
}

// ============================================================================
// STEP 2: CHANGE ORDERS
// ============================================================================

function Step2ChangeOrders({
  changeOrders,
  onAdd,
  onDelete,
}: {
  changeOrders: ChangeOrder[]
  onAdd: (data: { description: string; amount: number }) => Promise<ChangeOrder | null>
  onDelete: (id: number) => Promise<boolean>
}) {
  const [showForm, setShowForm] = useState(false)
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!desc.trim() || !amount) return
    setIsAdding(true)
    await onAdd({ description: desc, amount: parseFloat(amount) || 0 })
    setDesc('')
    setAmount('')
    setShowForm(false)
    setIsAdding(false)
  }

  const total = changeOrders.reduce((s, co) => s + (Number(co.amount) || 0), 0)

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-text-primary">Change Order Log</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-1 bg-primary-600 hover:bg-primary-700">
          <Plus className="w-4 h-4" />
          Add C/O
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="space-y-3 mb-4 p-4 bg-gray-50 rounded-lg border border-border">
          <Input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Change order description" required />
          <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount ($)" required />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isAdding}>
              {isAdding ? 'Saving...' : 'Save'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {changeOrders.length > 0 ? (
        <div className="space-y-2">
          {changeOrders.map((co, idx) => (
            <div key={co.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-text-muted bg-gray-200 px-2 py-0.5 rounded">CO-{idx + 1}</span>
                <span className="text-sm text-text-primary">{co.description}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono font-semibold tabular-nums text-primary-600">
                  {formatCurrency(Number(co.amount) || 0)}
                </span>
                <button onClick={() => onDelete(co.id)} className="text-red-500 hover:text-red-700 p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          <div className="flex justify-end pt-3 border-t border-border mt-3">
            <span className="text-sm font-semibold">
              Total change orders: <span className="text-primary-600 font-mono ml-2">{formatCurrency(total)}</span>
            </span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-muted">No change orders yet. Click "+ Add C/O" to add one.</p>
      )}
    </Card>
  )
}

// ============================================================================
// STEP 3: ATTACHMENTS (placeholder for now — functional in old UI)
// ============================================================================

function Step3Attachments() {
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-text-primary mb-4">Attachments</h3>
      <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
        <Paperclip className="w-10 h-10 text-text-muted mx-auto mb-3" />
        <p className="text-text-secondary mb-1">
          Click to attach photos, signed docs, lien waivers, change order backups
        </p>
        <p className="text-xs text-text-muted">PDF, JPG, PNG, DOCX supported</p>
      </div>
    </Card>
  )
}

// ============================================================================
// STEP 4: G702 SUMMARY + PERIOD + NOTES
// ============================================================================

function Step4Summary({
  payApp,
  project,
  totals,
  changeOrders,
  notes,
  poNumber,
  periodLabel,
  periodStart,
  periodEnd,
  onNotesChange,
  onPoChange,
  onPeriodLabelChange,
  onPeriodStartChange,
  onPeriodEndChange,
}: {
  payApp: any
  project: any
  totals: any
  changeOrders: ChangeOrder[]
  notes: string
  poNumber: string
  periodLabel: string
  periodStart: string
  periodEnd: string
  onNotesChange: (v: string) => void
  onPoChange: (v: string) => void
  onPeriodLabelChange: (v: string) => void
  onPeriodStartChange: (v: string) => void
  onPeriodEndChange: (v: string) => void
}) {
  const originalContract = Number(project?.original_contract) || 0
  const coTotal = changeOrders.reduce((s, co) => s + (Number(co.amount) || 0), 0)
  const contractToDate = originalContract + coTotal
  const retainagePct = totals?.totalCompleted > 0
    ? ((totals.totalRetainage / totals.totalCompleted) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="space-y-6">
      {/* Billing Period & PO */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Billing Period & Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Period Label" value={periodLabel} onChange={(e) => onPeriodLabelChange(e.target.value)} placeholder="e.g. January 2026" />
          <Input label="PO / Reference #" value={poNumber} onChange={(e) => onPoChange(e.target.value)} placeholder="e.g. PO-2026-0042" />
          <Input label="Period Start" type="date" value={periodStart} onChange={(e) => onPeriodStartChange(e.target.value)} />
          <Input label="Period End" type="date" value={periodEnd} onChange={(e) => onPeriodEndChange(e.target.value)} />
        </div>
      </Card>

      {/* Notes */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Notes</h3>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="e.g. ACH info, payment terms, special conditions..."
          rows={4}
          className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-text-primary text-sm"
        />
      </Card>

      {/* G702 Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Project Info */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Project Info</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-text-secondary">Project</span><span className="font-medium">{project?.name}</span></div>
            <div className="flex justify-between"><span className="text-text-secondary">Owner</span><span className="font-medium">{project?.owner || '—'}</span></div>
            <div className="flex justify-between"><span className="text-text-secondary">Contractor</span><span className="font-medium">{project?.contractor || '—'}</span></div>
            <div className="flex justify-between"><span className="text-text-secondary">Application #</span><span className="font-medium">{payApp?.app_number}</span></div>
          </div>
        </Card>

        {/* G702 Summary */}
        <Card className="p-6 bg-gradient-to-br from-primary-50 to-white">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">G702 Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">A. Original Contract Sum</span>
              <span className="font-mono tabular-nums font-medium">{formatCurrency(originalContract)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">B. Net Change by C/O</span>
              <span className="font-mono tabular-nums font-medium">{formatCurrency(coTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">C. Contract Sum to Date (A+B)</span>
              <span className="font-mono tabular-nums font-medium">{formatCurrency(contractToDate)}</span>
            </div>
            <hr className="border-primary-200 my-2" />
            <div className="flex justify-between">
              <span className="text-text-secondary">D. Total Completed & Stored</span>
              <span className="font-mono tabular-nums font-medium">{formatCurrency(totals?.totalCompleted || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">E. Retainage ({retainagePct}%)</span>
              <span className="font-mono tabular-nums font-medium">{formatCurrency(totals?.totalRetainage || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">F. Total Earned Less Retainage</span>
              <span className="font-mono tabular-nums font-medium">{formatCurrency(totals?.totalEarned || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">G. Less Previous Certificates</span>
              <span className="font-mono tabular-nums font-medium">{formatCurrency(totals?.totalPrevCertificates || 0)}</span>
            </div>
            <hr className="border-primary-200 my-2" />
            <div className="bg-white/60 rounded-lg p-3 border border-primary-300">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-text-primary">H. Current Payment Due</span>
                <span className="text-2xl font-bold text-primary-600 font-mono tabular-nums">
                  {formatCurrency(totals?.totalCurrentDue || 0)}
                </span>
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">I. Balance to Finish + Retainage</span>
              <span className="font-mono tabular-nums font-medium">{formatCurrency(totals?.totalBalanceToFinish || 0)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

// ============================================================================
// STEP 5: LIEN WAIVER (placeholder — functional in old UI)
// ============================================================================

function Step5LienWaiver() {
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-text-primary mb-2">Lien Waiver</h3>
      <p className="text-sm text-text-secondary mb-6">
        A conditional waiver is auto-created with each pay app. You can also create additional waivers here.
        They'll be included as page 3 of the PDF.
      </p>

      <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
        <Shield className="w-10 h-10 text-text-muted mx-auto mb-3" />
        <p className="text-sm text-text-secondary">
          Lien waiver generation is available — skip if not needed for this pay app.
        </p>
      </div>

      <p className="text-xs text-text-muted text-center mt-4">
        Lien waiver is optional — skip if not needed for this pay app
      </p>
    </Card>
  )
}

// ============================================================================
// STEP 6: PREVIEW & SEND
// ============================================================================

function Step6Preview({
  payApp,
  project,
  totals,
  onDownloadPDF,
  onOpenEmail,
  isTrialGated,
}: {
  payApp: any
  project: any
  totals: any
  onDownloadPDF: () => void
  onOpenEmail: () => void
  isTrialGated: boolean
}) {
  return (
    <div className="space-y-6">
      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={onDownloadPDF} disabled={isTrialGated} className="gap-2 bg-primary-600 hover:bg-primary-700">
          <Download className="w-4 h-4" />
          Download Pay App PDF
        </Button>
        <Button onClick={onOpenEmail} disabled={isTrialGated} className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white">
          <Mail className="w-4 h-4" />
          Send & Mark Submitted
        </Button>
      </div>

      {/* Invoice Preview */}
      <Card className="overflow-hidden">
        <div className="bg-primary-600 text-white p-4">
          <h3 className="text-lg font-semibold">Application and Certificate for Payment</h3>
          <p className="text-primary-200 text-sm">Document G702 — AIA Format</p>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-text-muted text-xs uppercase tracking-wide">Project</span>
              <p className="font-medium text-text-primary">{project?.name}</p>
            </div>
            <div>
              <span className="text-text-muted text-xs uppercase tracking-wide">Application #</span>
              <p className="font-medium text-text-primary">{payApp?.app_number}</p>
            </div>
            <div>
              <span className="text-text-muted text-xs uppercase tracking-wide">Owner</span>
              <p className="font-medium text-text-primary">{project?.owner || '—'}</p>
            </div>
            <div>
              <span className="text-text-muted text-xs uppercase tracking-wide">Contractor</span>
              <p className="font-medium text-text-primary">{project?.contractor || '—'}</p>
            </div>
            <div>
              <span className="text-text-muted text-xs uppercase tracking-wide">Period</span>
              <p className="font-medium text-text-primary">{payApp?.period_label || '—'}</p>
            </div>
            <div>
              <span className="text-text-muted text-xs uppercase tracking-wide">Contract Date</span>
              <p className="font-medium text-text-primary">{formatDate(project?.contract_date)}</p>
            </div>
          </div>

          <hr className="border-border" />

          {/* Financial summary */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Total Completed & Stored to Date</span><span className="font-mono font-medium">{formatCurrency(totals?.totalCompleted || 0)}</span></div>
            <div className="flex justify-between"><span>Less Retainage</span><span className="font-mono font-medium">{formatCurrency(totals?.totalRetainage || 0)}</span></div>
            <div className="flex justify-between"><span>Total Earned Less Retainage</span><span className="font-mono font-medium">{formatCurrency(totals?.totalEarned || 0)}</span></div>
            <div className="flex justify-between"><span>Less Previous Certificates</span><span className="font-mono font-medium">{formatCurrency(totals?.totalPrevCertificates || 0)}</span></div>
          </div>

          <div className="bg-primary-50 border-2 border-primary-300 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <span className="font-bold text-lg text-text-primary">CURRENT PAYMENT DUE</span>
              <span className="text-3xl font-bold text-primary-600 font-mono tabular-nums">
                {formatCurrency(totals?.totalCurrentDue || 0)}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <p className="text-xs text-text-muted text-center">
        The client will receive a professional invoice email with the G702/G703 PDF, lien waiver (if attached), and optional "Pay Now" button.
      </p>
    </div>
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
    changeOrders,
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
    addChangeOrder,
    deleteChangeOrder,
  } = usePayApp(payAppId)

  const { isTrialGated } = useTrial()

  // Step state
  const [currentStep, setCurrentStep] = useState<Step>(1)

  // Form state
  const [notes, setNotes] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [periodLabel, setPeriodLabel] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
  const [isEmailLoading, setIsEmailLoading] = useState(false)

  // Sync from payApp
  useEffect(() => {
    if (payApp) {
      setNotes(payApp.special_notes || '')
      setPoNumber(payApp.po_number || '')
      setPeriodLabel(payApp.period_label || '')
      setPeriodStart(payApp.period_start ? payApp.period_start.split('T')[0] : '')
      setPeriodEnd(payApp.period_end ? payApp.period_end.split('T')[0] : '')
    }
  }, [payApp])

  // Save handler
  const handleSave = useCallback(async () => {
    if (isTrialGated) {
      alert('Your trial has ended. Please upgrade to continue.')
      return
    }
    setIsSaving(true)
    try {
      await saveLines()
      await updatePayApp({
        special_notes: notes,
        po_number: poNumber,
        period_label: periodLabel,
        period_start: periodStart || undefined,
        period_end: periodEnd || undefined,
      } as any)
    } finally {
      setIsSaving(false)
    }
  }, [saveLines, updatePayApp, notes, poNumber, periodLabel, periodStart, periodEnd, isTrialGated])

  // Save & advance to next step
  const handleSaveAndNext = useCallback(async () => {
    await handleSave()
    if (currentStep < 6) {
      setCurrentStep((currentStep + 1) as Step)
    }
  }, [handleSave, currentStep])

  // Download PDF
  const handleDownloadPDF = useCallback(async () => {
    if (isTrialGated) {
      alert('Your trial has ended. Please upgrade to continue.')
      return
    }
    await downloadPDF()
  }, [downloadPDF, isTrialGated])

  // Email submit
  const handleEmailSubmit = useCallback(
    async (formData: EmailFormData) => {
      if (isTrialGated) {
        alert('Your trial has ended. Please upgrade to continue.')
        setIsEmailModalOpen(false)
        return
      }

      setIsEmailLoading(true)
      try {
        // Save first
        await handleSave()

        const success = await emailPayApp({
          to: formData.to,
          cc: formData.cc,
          subject: formData.subject,
          message: formData.message,
          include_lien_waiver: formData.includeLienWaiver,
        })

        if (success) {
          setIsEmailModalOpen(false)
          if (payApp?.status === 'draft') {
            await updatePayApp({ status: 'submitted' } as any)
          }
          alert('Pay application sent successfully!')
        }
      } finally {
        setIsEmailLoading(false)
      }
    },
    [emailPayApp, updatePayApp, payApp, isTrialGated, handleSave],
  )

  // Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner />
      </div>
    )
  }

  // Error
  if (error || !payApp || !project) {
    return (
      <div className="space-y-4">
        <PageHeader title="Pay Application" description="Error loading pay application" />
        <Card className="p-6 border-red-200 bg-red-50">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-900">{error || 'Pay application not found'}</p>
              <Button onClick={() => navigate(-1)} variant="outline" className="mt-3">
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

  return (
    <div className="space-y-6 pb-8">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Link
            to={`/projects/${projectId}`}
            className="text-primary-600 hover:text-primary-700 flex items-center gap-1 text-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Project
          </Link>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text-primary">
              Pay Application #{payApp.app_number}
            </h1>
            <Badge className={statusColor}>{payApp.status}</Badge>
          </div>
          <div className="flex gap-2">
            {payApp.status === 'draft' && (
              <Button onClick={handleSave} disabled={!isDirty || isSaving} size="sm" variant="outline" className="gap-1">
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            )}
            <Button onClick={handleDownloadPDF} size="sm" variant="outline" className="gap-1">
              <Download className="w-4 h-4" />
              PDF
            </Button>
          </div>
        </div>
        <p className="text-text-secondary text-sm mt-1">{project.name}</p>
      </motion.div>

      {/* Step Tabs */}
      <StepTabs currentStep={currentStep} onStepChange={setCurrentStep} />

      {/* Step Content */}
      <motion.div
        key={currentStep}
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
      >
        {currentStep === 1 && (
          <Step1G703
            lines={computedLines}
            isDirty={isDirty}
            onLinePercentChange={updateLinePercent}
            onLineRetainageChange={updateLineRetainage}
          />
        )}

        {currentStep === 2 && (
          <Step2ChangeOrders
            changeOrders={changeOrders}
            onAdd={addChangeOrder}
            onDelete={deleteChangeOrder}
          />
        )}

        {currentStep === 3 && <Step3Attachments />}

        {currentStep === 4 && (
          <Step4Summary
            payApp={payApp}
            project={project}
            totals={totals}
            changeOrders={changeOrders}
            notes={notes}
            poNumber={poNumber}
            periodLabel={periodLabel}
            periodStart={periodStart}
            periodEnd={periodEnd}
            onNotesChange={setNotes}
            onPoChange={setPoNumber}
            onPeriodLabelChange={setPeriodLabel}
            onPeriodStartChange={setPeriodStart}
            onPeriodEndChange={setPeriodEnd}
          />
        )}

        {currentStep === 5 && <Step5LienWaiver />}

        {currentStep === 6 && (
          <Step6Preview
            payApp={payApp}
            project={project}
            totals={totals}
            onDownloadPDF={handleDownloadPDF}
            onOpenEmail={() => setIsEmailModalOpen(true)}
            isTrialGated={isTrialGated}
          />
        )}
      </motion.div>

      {/* Step Navigation Footer */}
      <StepNav
        currentStep={currentStep}
        onPrev={() => setCurrentStep((currentStep - 1) as Step)}
        onNext={() => setCurrentStep((currentStep + 1) as Step)}
        onSaveAndNext={currentStep === 1 ? handleSaveAndNext : undefined}
        nextLabel={currentStep === 1 ? 'Save & Next: Change Orders' : undefined}
        isSaving={isSaving}
      />

      {/* Email Modal */}
      <EmailModal
        isOpen={isEmailModalOpen}
        isLoading={isEmailLoading}
        onClose={() => setIsEmailModalOpen(false)}
        onSubmit={handleEmailSubmit}
        defaultTo={(project as any)?.owner_email || ''}
        defaultCC={(project as any)?.contact_email || ''}
        payAppNumber={payApp.app_number}
        projectName={project.name}
      />
    </div>
  )
}
