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

import { useState, useCallback, useEffect, useRef } from 'react'
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
import type { PayAppLineComputed, ChangeOrder, LienDocument, Attachment } from '@/types'
import { usePayApp } from '@/hooks/usePayApp'
import { getLienDocs, createLienDoc, downloadLienDocPDF } from '@/api/lienWaivers'
import { uploadAttachment, deleteAttachment as deleteAttachmentApi } from '@/api/attachments'
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
          {/* Email info banner — matches old app.html */}
          <div className="rounded-lg bg-gradient-to-r from-blue-50 to-green-50 border border-blue-100 p-3 mb-4">
            <p className="text-xs font-semibold text-blue-800 mb-1">📧 What your client receives:</p>
            <p className="text-xs text-blue-700">
              Professional invoice email with your G702/G703 PDF, lien waiver, and a "Pay Now" button. They click it and pay by ACH or card — money goes straight to your bank.
            </p>
          </div>

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
                <input type="checkbox" name="includePaymentLink" checked={formData.includePaymentLink} onChange={handleChange} className="rounded accent-blue-600" />
                <span className="text-sm text-text-secondary">Include "Pay Now" button in email <span className="text-green-600 text-xs">(ACH or card — get paid faster)</span></span>
              </label>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                {isLoading ? '⏳ Sending…' : '📤 Send & Mark Submitted'}
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
              {lines.map((line, idx) => (
                <tr key={line.sov_line_id} className="border-b border-border hover:bg-gray-50">
                  <td className="px-3 py-2 text-text-muted text-xs font-medium">{line.item_id || idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-text-primary">{line.description}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(line.scheduledValue)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-text-secondary">{formatCurrency(line.prevAmount)}</td>
                  <td className="px-3 py-2 text-center font-mono tabular-nums text-text-secondary">{formatPercent(line.prev_pct, 0)}</td>
                  <td className="px-3 py-2 bg-primary-50 border-x border-primary-200">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={Number(line.this_pct) || 0}
                      onChange={(e) => {
                        const pct = parseFloat(e.target.value) || 0
                        onLinePercentChange(line.sov_line_id, Math.max(0, Math.min(100, pct)))
                      }}
                      className="w-20 px-2 py-1 text-center text-sm font-mono border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums font-medium">{formatCurrency(line.thisAmount)}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={Number(line.retainage_pct) || 0}
                      onChange={(e) => {
                        const pct = parseFloat(e.target.value) || 0
                        onLineRetainageChange(line.sov_line_id, Math.max(0, Math.min(100, pct)))
                      }}
                      className="w-16 px-1 py-1 text-center text-xs font-mono border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
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
// STEP 3: ATTACHMENTS — File upload, list, and delete
// ============================================================================

function Step3Attachments({
  payAppId,
  attachments,
  onRefresh,
}: {
  payAppId: number
  attachments: Attachment[]
  onRefresh: () => Promise<void>
}) {
  const [isUploading, setIsUploading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setIsUploading(true)
    try {
      for (const file of Array.from(files)) {
        await uploadAttachment(payAppId, file)
      }
      await onRefresh()
    } catch (err) {
      alert('Upload error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (attachmentId: number) => {
    if (!confirm('Remove this attachment?')) return
    try {
      await deleteAttachmentApi(attachmentId)
      await onRefresh()
    } catch (err) {
      alert('Delete error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  const getExtBadge = (name: string) => {
    const ext = (name || '').split('.').pop()?.toUpperCase().slice(0, 4) || '?'
    return ext
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-text-primary mb-4">Attachments</h3>

      {/* Upload Zone */}
      <label
        className={`block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all mb-4 ${
          isDragOver
            ? 'border-primary-400 bg-primary-50 shadow-inner'
            : 'border-border hover:border-primary-300 hover:bg-gray-50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
      >
        <input
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {isUploading ? (
          <div className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-primary-600">Uploading...</span>
          </div>
        ) : (
          <>
            <Paperclip className="w-8 h-8 text-text-muted mx-auto mb-2" />
            <p className="text-text-secondary text-sm mb-1">
              Click to attach photos, signed docs, lien waivers, change order backups
            </p>
            <p className="text-xs text-text-muted">PDF, JPG, PNG, DOCX supported &bull; Max 25MB per file</p>
          </>
        )}
      </label>

      {/* Attachment List */}
      {attachments.length > 0 ? (
        <div className="space-y-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg border border-border"
            >
              {/* Extension badge */}
              <div className="w-7 h-7 rounded bg-primary-100 text-primary-700 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                {getExtBadge(att.original_name)}
              </div>
              {/* Filename */}
              <span className="flex-1 text-sm text-text-primary truncate">{att.original_name}</span>
              {/* Size */}
              <span className="text-xs text-text-muted flex-shrink-0">
                {att.file_size ? Math.round(att.file_size / 1024) + ' KB' : ''}
              </span>
              {/* Delete */}
              <button
                onClick={() => handleDelete(att.id)}
                className="text-red-500 hover:text-red-700 p-1 flex-shrink-0"
                title="Remove attachment"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-muted">No attachments yet.</p>
      )}
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
// STEP 5: LIEN WAIVER — fully wired to server API
// ============================================================================

function Step5LienWaiver({
  payApp,
  project,
  totals,
}: {
  payApp: any
  project: any
  totals: any
}) {
  const [lienDocs, setLienDocs] = useState<LienDocument[]>([])
  const [isLoadingDocs, setIsLoadingDocs] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [docType, setDocType] = useState<LienDocument['doc_type']>('conditional_waiver')
  const [signatoryName, setSignatoryName] = useState('')
  const [signatoryTitle, setSignatoryTitle] = useState('')
  const [throughDate, setThroughDate] = useState('')
  const [amount, setAmount] = useState('')
  const [makerOfCheck, setMakerOfCheck] = useState('')
  const [checkPayableTo, setCheckPayableTo] = useState('')

  const autoGenRef = useRef(false)

  // Load existing lien docs on mount, then auto-generate if none linked
  useEffect(() => {
    if (!project?.id) return
    setIsLoadingDocs(true)
    getLienDocs(project.id)
      .then(async (res) => {
        if (res.data) {
          // Filter to this pay app's docs
          const docs = (Array.isArray(res.data) ? res.data : []).filter(
            (d: LienDocument) => d.pay_app_id === payApp?.id
          )
          setLienDocs(docs)

          // Auto-generate conditional waiver if none linked and we have enough data
          const amtDue = totals?.totalCurrentDue || 0
          const sigName = project?.contact_name || ''
          if (docs.length === 0 && amtDue > 0 && sigName && !autoGenRef.current) {
            autoGenRef.current = true
            try {
              const autoRes = await createLienDoc(project.id, {
                doc_type: 'conditional_waiver',
                signatory_name: sigName,
                signatory_title: '',
                through_date: payApp?.period_end ? payApp.period_end.split('T')[0] : new Date().toISOString().split('T')[0],
                amount: amtDue,
                maker_of_check: project.owner || '',
                check_payable_to: project.contractor || '',
                pay_app_id: payApp?.id,
                jurisdiction: (project as any).jurisdiction || 'california',
              })
              if (autoRes.data) {
                setLienDocs([autoRes.data as LienDocument])
              }
            } catch (autoErr) {
              console.error('Auto-generate lien waiver failed:', autoErr)
            }
          }
        }
      })
      .catch(() => setError('Failed to load lien documents'))
      .finally(() => setIsLoadingDocs(false))
  }, [project?.id, payApp?.id, totals?.totalCurrentDue, project?.contact_name])

  // Pre-fill form from project/pay app data
  useEffect(() => {
    if (project) {
      setMakerOfCheck(project.owner || '')
      setCheckPayableTo(project.contractor || '')
    }
    if (payApp) {
      setThroughDate(payApp.period_end ? payApp.period_end.split('T')[0] : '')
    }
    if (totals) {
      setAmount(String(Math.round((totals.totalCurrentDue || 0) * 100) / 100))
    }
  }, [project, payApp, totals])

  const handleCreate = async () => {
    if (!signatoryName.trim()) {
      setError('Signatory name is required')
      return
    }
    setIsCreating(true)
    setError(null)
    try {
      const res = await createLienDoc(project.id, {
        doc_type: docType,
        signatory_name: signatoryName,
        signatory_title: signatoryTitle || undefined,
        through_date: throughDate || undefined,
        amount: amount ? parseFloat(amount) : undefined,
        maker_of_check: makerOfCheck || undefined,
        check_payable_to: checkPayableTo || undefined,
        pay_app_id: payApp?.id,
        jurisdiction: project.jurisdiction || 'california',
      })
      if (res.data) {
        setLienDocs((prev) => [res.data as LienDocument, ...prev])
        setShowForm(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lien waiver')
    } finally {
      setIsCreating(false)
    }
  }

  const handleDownload = async (docId: number) => {
    try {
      const blob = await downloadLienDocPDF(docId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lien-waiver-${docId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Failed to download lien waiver PDF')
    }
  }

  const DOC_TYPE_LABELS: Record<string, string> = {
    preliminary_notice: 'Preliminary Notice',
    conditional_waiver: 'Conditional Waiver — Progress Payment',
    unconditional_waiver: 'Unconditional Waiver — Progress Payment',
    conditional_final_waiver: 'Conditional Waiver — Final Payment',
    unconditional_final_waiver: 'Unconditional Waiver — Final Payment',
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-2">Lien Waiver</h3>
        <p className="text-sm text-text-secondary mb-6">
          A conditional waiver is auto-generated when you submit the pay app. You can also create additional waivers manually below.
        </p>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Existing lien docs */}
        {isLoadingDocs ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : lienDocs.length > 0 ? (
          <div className="space-y-3 mb-6">
            <h4 className="text-sm font-medium text-text-primary">Existing Waivers</h4>
            {lienDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-4 rounded-lg border border-border bg-white hover:bg-gray-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
                  </p>
                  <div className="flex gap-4 text-xs text-text-muted mt-1">
                    {doc.amount != null && <span>Amount: {formatCurrency(doc.amount)}</span>}
                    {doc.through_date && <span>Through: {formatDate(doc.through_date)}</span>}
                    <span>Created: {formatDate(doc.created_at)}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownload(doc.id)}
                  className="gap-1 flex-shrink-0 ml-3"
                >
                  <Download className="w-3 h-3" />
                  PDF
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center mb-6">
            <Shield className="w-8 h-8 text-text-muted mx-auto mb-2" />
            <p className="text-sm text-text-secondary">
              No lien waivers yet. One will be auto-generated when you submit this pay app.
            </p>
          </div>
        )}

        {/* Create new waiver */}
        {!showForm ? (
          <Button variant="outline" onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Create Lien Waiver Manually
          </Button>
        ) : (
          <Card className="p-5 border-primary-200 bg-primary-50/30">
            <h4 className="text-sm font-semibold text-text-primary mb-4">New Lien Waiver</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-text-secondary mb-1">Waiver Type</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as LienDocument['doc_type'])}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white"
                >
                  <option value="conditional_waiver">Conditional Waiver — Progress Payment</option>
                  <option value="unconditional_waiver">Unconditional Waiver — Progress Payment</option>
                  <option value="conditional_final_waiver">Conditional Waiver — Final Payment</option>
                  <option value="unconditional_final_waiver">Unconditional Waiver — Final Payment</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Signatory Name *</label>
                <Input value={signatoryName} onChange={(e) => setSignatoryName(e.target.value)} placeholder="John Smith" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Signatory Title</label>
                <Input value={signatoryTitle} onChange={(e) => setSignatoryTitle(e.target.value)} placeholder="Project Manager" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Through Date</label>
                <Input type="date" value={throughDate} onChange={(e) => setThroughDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Amount</label>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Maker of Check</label>
                <Input value={makerOfCheck} onChange={(e) => setMakerOfCheck(e.target.value)} placeholder="Property Owner" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Check Payable To</label>
                <Input value={checkPayableTo} onChange={(e) => setCheckPayableTo(e.target.value)} placeholder="Your Company" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button onClick={handleCreate} disabled={isCreating} className="gap-2">
                <Shield className="w-4 h-4" />
                {isCreating ? 'Creating...' : 'Generate Waiver'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </Card>
        )}
      </Card>

      <p className="text-xs text-text-muted text-center">
        Lien waivers are optional. Skip this step if not needed for this billing period.
      </p>
    </div>
  )
}

// ============================================================================
// STEP 6: PREVIEW & SEND
// ============================================================================

function Step6Preview({
  payApp,
  project,
  totals,
  computedLines,
  changeOrders,
  onDownloadPDF,
  onOpenEmail,
  isTrialGated,
  isDownloading = false,
}: {
  payApp: any
  project: any
  totals: any
  computedLines: PayAppLineComputed[]
  changeOrders: ChangeOrder[]
  onDownloadPDF: () => void
  onOpenEmail: () => void
  isTrialGated: boolean
  isDownloading?: boolean
}) {
  // Lien waiver state for "Download + Lien Waiver" button
  const [linkedLienDocId, setLinkedLienDocId] = useState<number | null>(null)

  useEffect(() => {
    if (!project?.id || !payApp?.id) return
    getLienDocs(project.id)
      .then((res) => {
        if (res.data) {
          const linked = (Array.isArray(res.data) ? res.data : []).filter(
            (d: LienDocument) => d.pay_app_id === payApp.id
          )
          if (linked.length > 0) setLinkedLienDocId(linked[0].id)
        }
      })
      .catch(() => { /* silent */ })
  }, [project?.id, payApp?.id])

  // Compute G702 fields A-I
  const originalContract = Number(project?.original_contract) || 0
  const netChangeOrders = changeOrders
    .filter((co) => co.status === 'approved')
    .reduce((sum, co) => sum + Number(co.amount), 0)
  const contractSumToDate = originalContract + netChangeOrders
  const totalCompleted = totals?.totalCompleted || 0
  const retainageToDate = totals?.totalRetainage || 0
  const earnedLessRetainage = totals?.totalEarned || 0
  const prevCertificates = totals?.totalPrevCertificates || 0
  const currentPaymentDue = totals?.totalCurrentDue || 0
  const balanceToFinish = contractSumToDate - totalCompleted + retainageToDate

  // SOV vs Contract mismatch
  const sovSum = computedLines.reduce((s, l) => s + (Number(l.scheduledValue) || 0), 0)
  const hasMismatch = originalContract > 0 && sovSum > 0 && Math.abs(sovSum - originalContract) > 1

  const showRetainage = project?.include_retainage !== false

  const handleDownloadWithLien = () => {
    onDownloadPDF()
    if (linkedLienDocId) {
      const token = localStorage.getItem('ci_token')
      window.open(`/api/lien-docs/${linkedLienDocId}/pdf?token=${encodeURIComponent(token || '')}`, '_blank')
    }
  }

  return (
    <div className="space-y-6">
      {/* Contract mismatch warning */}
      {hasMismatch && (
        <div className="p-4 rounded-lg border" style={{ background: '#FFF8E1', borderColor: '#F59E0B' }}>
          <span className="font-semibold text-amber-800">Contract sum mismatch</span>
          <span className="text-sm text-amber-900 ml-3">
            Contract: <strong>{formatCurrency(originalContract)}</strong> — SOV total: <strong>{formatCurrency(sovSum)}</strong>
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={onDownloadPDF} disabled={isTrialGated || isDownloading} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
          {isDownloading ? (
            <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Generating PDF...</>
          ) : (
            <><Download className="w-4 h-4" /> Download Pay App PDF</>
          )}
        </Button>
        {linkedLienDocId && (
          <Button onClick={handleDownloadWithLien} disabled={isTrialGated} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Download className="w-4 h-4" />
            Download + Lien Waiver
          </Button>
        )}
        <Button onClick={onOpenEmail} disabled={isTrialGated} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
          <Mail className="w-4 h-4" />
          {payApp?.status === 'submitted' ? 'Resend' : 'Send & Mark Submitted'}
        </Button>
        {payApp?.payment_link_token && (
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              const url = `${window.location.origin}/pay/${payApp.payment_link_token}`
              navigator.clipboard.writeText(url)
              alert('Payment link copied to clipboard!')
            }}
          >
            Copy Payment Link
          </Button>
        )}
      </div>

      {/* ================================================================
          AIA G702/G703 DOCUMENT PREVIEW
          Matches the professional AIA format from the original app.html
          ================================================================ */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #ccc',
          borderRadius: 4,
          padding: 20,
          fontFamily: "'Times New Roman', serif",
          fontSize: '9pt',
          color: '#000',
          maxWidth: 800,
          margin: '0 auto',
        }}
      >
        {/* === G702 HEADER === */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '120px 1fr 180px',
            gap: 10,
            alignItems: 'start',
            borderBottom: '2px solid #000',
            paddingBottom: 8,
            marginBottom: 8,
          }}
        >
          {/* Logo */}
          <div
            style={{
              width: 110,
              height: 60,
              border: '1px dashed #ccc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <img
              src="/varshyl-logo.png"
              alt="Logo"
              style={{ maxHeight: 56, maxWidth: 106, objectFit: 'contain' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>

          {/* Title */}
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '13pt', fontWeight: 'bold', marginBottom: 2, fontFamily: "'Times New Roman', serif" }}>
              Application and Certificate for Payment
            </h1>
            <h2 style={{ fontSize: '10pt', fontWeight: 'normal', fontFamily: "'Times New Roman', serif", margin: 0 }}>
              Document G702
            </h2>
            <p style={{ fontSize: '8pt', color: '#555', margin: '2px 0 0' }}>
              TO OWNER: {project?.owner || '—'} &nbsp;&nbsp; PROJECT: {project?.name || '—'}
            </p>
            <p style={{ fontSize: '8pt', color: '#555', margin: 0 }}>
              FROM CONTRACTOR: {project?.contractor || '—'}
              {project?.include_architect !== false && (
                <> &nbsp;&nbsp; ARCHITECT: {project?.architect || '—'}</>
              )}
            </p>
          </div>

          {/* App Number */}
          <div style={{ textAlign: 'right', fontSize: '9pt' }}>
            Application #<strong style={{ fontSize: '11pt' }}>{payApp?.app_number}</strong>
            <div style={{ fontSize: '8pt', marginTop: 4 }}>Period: {payApp?.period_label || '—'}</div>
            <div style={{ fontSize: '8pt' }}>Contract date: {formatDate(project?.contract_date)}</div>
            {payApp?.po_number && (
              <div style={{ fontSize: '7pt', marginTop: 2, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                PO #: <span style={{ fontWeight: 600 }}>{payApp.po_number}</span>
              </div>
            )}
          </div>
        </div>

        {/* Payment Terms Banner */}
        {project?.payment_terms && (
          <div
            style={{
              fontSize: '8pt',
              padding: '4px 8px',
              background: '#fffbe6',
              border: '1px solid #e6d800',
              borderRadius: 3,
              marginBottom: 6,
            }}
          >
            Payment Terms: {project.payment_terms}
            {payApp?.payment_due_date && (
              <> &nbsp;|&nbsp; Due: {formatDate(payApp.payment_due_date)}</>
            )}
          </div>
        )}

        {/* === G702 SUMMARY GRID (A-I) === */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 0,
            border: '1px solid #000',
            marginBottom: 6,
          }}
        >
          {/* Row 1: A | F */}
          <div style={{ padding: '4px 8px', borderRight: '1px solid #000', borderBottom: '1px solid #000', fontSize: '8.5pt' }}>
            <span style={{ fontSize: '7pt', color: '#555', display: 'block', marginBottom: 1 }}>A. Original Contract Sum</span>
            <span style={{ fontWeight: 'bold' }}>{formatCurrency(originalContract)}</span>
          </div>
          <div style={{ padding: '4px 8px', borderBottom: '1px solid #000', fontSize: '8.5pt' }}>
            <span style={{ fontSize: '7pt', color: '#555', display: 'block', marginBottom: 1 }}>F. Total Earned Less Retainage (D-E)</span>
            <span style={{ fontWeight: 'bold' }}>{formatCurrency(earnedLessRetainage)}</span>
          </div>

          {/* Row 2: B | G */}
          <div style={{ padding: '4px 8px', borderRight: '1px solid #000', borderBottom: '1px solid #000', fontSize: '8.5pt' }}>
            <span style={{ fontSize: '7pt', color: '#555', display: 'block', marginBottom: 1 }}>B. Net Change by Change Orders</span>
            <span style={{ fontWeight: 'bold' }}>{formatCurrency(netChangeOrders)}</span>
          </div>
          <div style={{ padding: '4px 8px', borderBottom: '1px solid #000', fontSize: '8.5pt' }}>
            <span style={{ fontSize: '7pt', color: '#555', display: 'block', marginBottom: 1 }}>G. Less Previous Certificates for Payment</span>
            <span style={{ fontWeight: 'bold' }}>{formatCurrency(prevCertificates)}</span>
          </div>

          {/* Row 3: C | H (highlighted) */}
          <div style={{ padding: '4px 8px', borderRight: '1px solid #000', borderBottom: '1px solid #000', fontSize: '8.5pt' }}>
            <span style={{ fontSize: '7pt', color: '#555', display: 'block', marginBottom: 1 }}>C. Contract Sum to Date (A+B)</span>
            <span style={{ fontWeight: 'bold' }}>{formatCurrency(contractSumToDate)}</span>
          </div>
          <div style={{ padding: '4px 8px', borderBottom: '1px solid #000', fontSize: '8.5pt', background: '#fffbe6' }}>
            <span style={{ fontSize: '7pt', color: '#555', display: 'block', marginBottom: 1 }}>H. CURRENT PAYMENT DUE</span>
            <span style={{ fontWeight: 'bold', fontSize: '13pt', color: '#2563eb' }}>{formatCurrency(currentPaymentDue)}</span>
          </div>

          {/* Row 4: D | I */}
          <div style={{ padding: '4px 8px', borderRight: '1px solid #000', borderBottom: '1px solid #000', fontSize: '8.5pt' }}>
            <span style={{ fontSize: '7pt', color: '#555', display: 'block', marginBottom: 1 }}>D. Total Completed &amp; Stored to Date</span>
            <span style={{ fontWeight: 'bold' }}>{formatCurrency(totalCompleted)}</span>
          </div>
          <div style={{ padding: '4px 8px', borderBottom: '1px solid #000', fontSize: '8.5pt' }}>
            <span style={{ fontSize: '7pt', color: '#555', display: 'block', marginBottom: 1 }}>I. Balance to Finish, Plus Retainage</span>
            <span style={{ fontWeight: 'bold' }}>{formatCurrency(balanceToFinish)}</span>
          </div>

          {/* Row 5: E | empty */}
          <div style={{ padding: '4px 8px', borderRight: '1px solid #000', fontSize: '8.5pt' }}>
            <span style={{ fontSize: '7pt', color: '#555', display: 'block', marginBottom: 1 }}>E. Retainage to Date</span>
            <span style={{ fontWeight: 'bold' }}>{formatCurrency(retainageToDate)}</span>
          </div>
          <div style={{ padding: '4px 8px', fontSize: '8.5pt' }}></div>
        </div>

        {/* === DISTRIBUTION === */}
        <div
          style={{
            border: '1px solid #000',
            padding: '6px 10px',
            marginBottom: 6,
            fontSize: '8pt',
          }}
        >
          <div style={{ fontWeight: 'bold', fontSize: '8pt', marginBottom: 4, textTransform: 'uppercase' }}>
            Distribution to:
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 11, height: 11, border: '1px solid #000', background: '#2563eb', flexShrink: 0 }} />
              <span>Owner</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 11, height: 11, border: '1px solid #000', flexShrink: 0 }} />
              <span>Architect</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 11, height: 11, border: '1px solid #000', flexShrink: 0 }} />
              <span>Contractor file</span>
            </div>
          </div>
        </div>

        {/* === SIGNATURE BOXES === */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
          {/* Contractor Signature */}
          <div style={{ border: '1px solid #000', padding: 8, minHeight: 80, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '7pt', fontWeight: 'bold', textTransform: 'uppercase', borderBottom: '0.5px solid #ccc', marginBottom: 4, paddingBottom: 2 }}>
              Contractor&apos;s Signed Certification
            </div>
            <p style={{ fontSize: '7.5pt', color: '#555', marginBottom: 8, margin: '0 0 8px' }}>
              The undersigned Contractor certifies that to the best of the Contractor&apos;s knowledge,
              information and belief the Work covered by this Application for Payment has been
              completed in accordance with the Contract Documents.
            </p>
            <div style={{ flex: 1, minHeight: 8 }} />
            <div style={{ borderBottom: '1px solid #000', marginTop: 4, marginBottom: 3 }} />
            <div style={{ fontSize: '7pt', color: '#555' }}>
              Authorized Signature &nbsp;&nbsp;&nbsp; Date: ____________
            </div>
          </div>

          {/* Architect Signature */}
          {project?.include_architect !== false && (
            <div style={{ border: '1px solid #000', padding: 8, minHeight: 80, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '7pt', fontWeight: 'bold', textTransform: 'uppercase', borderBottom: '0.5px solid #ccc', marginBottom: 4, paddingBottom: 2 }}>
                Architect&apos;s Certificate for Payment
              </div>
              <p style={{ fontSize: '7.5pt', color: '#555', margin: '0 0 4px' }}>
                In accordance with the Contract Documents, the Architect certifies to the Owner that the
                Work has progressed to the point indicated and the quality of the Work is in accordance
                with the Contract Documents.
              </p>
              <div style={{ fontSize: '8pt', marginBottom: 4 }}>
                Amount Certified: <strong>{formatCurrency(currentPaymentDue)}</strong>
              </div>
              <div style={{ flex: 1, minHeight: 8 }} />
              <div style={{ borderBottom: '1px solid #000', marginTop: 4, marginBottom: 3 }} />
              <div style={{ fontSize: '7pt', color: '#555' }}>
                Architect Signature &nbsp;&nbsp;&nbsp; Date: ____________
              </div>
            </div>
          )}
        </div>

        {/* === NOTES === */}
        {payApp?.special_notes && (
          <div style={{ marginTop: 8, padding: '6px 10px', background: '#fafafa', border: '1px solid #ddd', borderRadius: 4, fontSize: '8pt', color: '#333' }}>
            <strong>Notes:</strong> <span style={{ whiteSpace: 'pre-line' }}>{payApp.special_notes}</span>
          </div>
        )}

        {/* === G703 CONTINUATION SHEET === */}
        <div style={{ marginTop: 14, borderTop: '2px solid #000', paddingTop: 8 }}>
          <div style={{ fontSize: '11pt', fontWeight: 'bold', textAlign: 'center', marginBottom: 4, fontFamily: "'Times New Roman', serif" }}>
            Continuation Sheet — Document G703
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '7.5pt',
                fontFamily: "'Times New Roman', serif",
              }}
            >
              <thead>
                <tr style={{ background: '#f0f0f0' }}>
                  <th style={{ border: '1px solid #999', padding: '3px 4px', textAlign: 'left', width: 55 }}>Item</th>
                  <th style={{ border: '1px solid #999', padding: '3px 4px', textAlign: 'left' }}>Description of Work</th>
                  <th style={{ border: '1px solid #999', padding: '3px 4px', textAlign: 'right', width: 80 }}>Scheduled Value</th>
                  <th style={{ border: '1px solid #999', padding: '3px 4px', textAlign: 'right', width: 75 }}>Work Prev. Billed</th>
                  <th style={{ border: '1px solid #999', padding: '3px 4px', textAlign: 'right', width: 65 }}>Work This Period</th>
                  <th style={{ border: '1px solid #999', padding: '3px 4px', textAlign: 'right', width: 65 }}>Total Completed</th>
                  <th style={{ border: '1px solid #999', padding: '3px 4px', textAlign: 'right', width: 45 }}>% Comp.</th>
                  {showRetainage && (
                    <>
                      <th style={{ border: '1px solid #999', padding: '3px 4px', textAlign: 'right', width: 45 }}>Ret.%</th>
                      <th style={{ border: '1px solid #999', padding: '3px 4px', textAlign: 'right', width: 70 }}>Retainage $</th>
                    </>
                  )}
                  <th style={{ border: '1px solid #999', padding: '3px 4px', textAlign: 'right', width: 70 }}>Balance to Finish</th>
                </tr>
              </thead>
              <tbody>
                {computedLines.map((line, idx) => {
                  const sv = Number(line.scheduledValue) || 0
                  const isZero = sv === 0
                  const pctComplete = sv > 0 ? ((Number(line.prevAmount) + Number(line.thisAmount)) / sv * 100) : 0

                  return (
                    <tr key={line.id || idx} style={isZero ? { background: '#f9f9f9' } : undefined}>
                      <td style={{ border: '1px solid #999', padding: '2px 4px' }}>{line.item_id || idx + 1}</td>
                      <td style={{ border: '1px solid #999', padding: '2px 4px' }}>
                        {line.description || '—'}
                        {isZero && <span style={{ color: '#999', fontStyle: 'italic', marginLeft: 4 }}>(Included)</span>}
                      </td>
                      <td style={{ border: '1px solid #999', padding: '2px 4px', textAlign: 'right' }}>{formatCurrency(sv)}</td>
                      <td style={{ border: '1px solid #999', padding: '2px 4px', textAlign: 'right' }}>{formatCurrency(line.prevAmount)}</td>
                      <td style={{ border: '1px solid #999', padding: '2px 4px', textAlign: 'right' }}>{formatCurrency(line.thisAmount)}</td>
                      <td style={{ border: '1px solid #999', padding: '2px 4px', textAlign: 'right' }}>{formatCurrency(line.totalCompleted)}</td>
                      <td style={{ border: '1px solid #999', padding: '2px 4px', textAlign: 'right' }}>{pctComplete.toFixed(1)}%</td>
                      {showRetainage && (
                        <>
                          <td style={{ border: '1px solid #999', padding: '2px 4px', textAlign: 'right' }}>{formatPercent(line.retainage_pct)}</td>
                          <td style={{ border: '1px solid #999', padding: '2px 4px', textAlign: 'right' }}>{formatCurrency(line.retainageHeld)}</td>
                        </>
                      )}
                      <td style={{ border: '1px solid #999', padding: '2px 4px', textAlign: 'right' }}>{formatCurrency(line.balanceToFinish)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f0f0f0', fontWeight: 'bold' }}>
                  <td style={{ border: '1px solid #999', padding: '3px 4px' }} colSpan={2}>GRAND TOTAL</td>
                  <td style={{ border: '1px solid #999', padding: '3px 4px', textAlign: 'right' }}>{formatCurrency(totals?.totalScheduled || 0)}</td>
                  <td style={{ border: '1px solid #999', padding: '3px 4px', textAlign: 'right' }}>{formatCurrency(totals?.totalPrevAmount || 0)}</td>
                  <td style={{ border: '1px solid #999', padding: '3px 4px', textAlign: 'right' }}>{formatCurrency(totals?.totalThisAmount || 0)}</td>
                  <td style={{ border: '1px solid #999', padding: '3px 4px', textAlign: 'right' }}>{formatCurrency(totals?.totalCompleted || 0)}</td>
                  <td style={{ border: '1px solid #999', padding: '3px 4px', textAlign: 'right' }}>
                    {(totals?.totalScheduled > 0 ? (totals.totalCompleted / totals.totalScheduled * 100) : 0).toFixed(1)}%
                  </td>
                  {showRetainage && (
                    <>
                      <td style={{ border: '1px solid #999', padding: '3px 4px', textAlign: 'right' }}>—</td>
                      <td style={{ border: '1px solid #999', padding: '3px 4px', textAlign: 'right' }}>{formatCurrency(totals?.totalRetainage || 0)}</td>
                    </>
                  )}
                  <td style={{ border: '1px solid #999', padding: '3px 4px', textAlign: 'right' }}>{formatCurrency(totals?.totalBalanceToFinish || 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Branding footer */}
        <div style={{ marginTop: 12, textAlign: 'center', paddingTop: 8, borderTop: '1px solid #eee' }}>
          <div style={{ fontSize: '11pt', letterSpacing: '0.3px', marginBottom: 3 }}>
            <span style={{ color: '#6B2FA0', fontWeight: 'bold' }}>Construct</span>
            <span style={{ color: '#E87722', fontWeight: 'bold' }}>Invoice</span>{' '}
            <span style={{ color: '#009B8D', fontWeight: 'bold' }}>AI</span>
          </div>
          <div style={{ fontSize: '8pt', color: '#777', marginBottom: 3, fontStyle: 'italic' }}>
            $0 to use — pay it forward instead: feed a child, help a neighbor
          </div>
          <a href="https://constructinv.varshyl.com" style={{ fontSize: '8pt', color: '#2563eb', textDecoration: 'none' }}>
            constructinv.varshyl.com
          </a>
        </div>
      </div>

      <p className="text-xs text-text-muted text-center">
        The client will receive a professional invoice email with the G702/G703 PDF, lien waiver (if attached), and optional &quot;Pay Now&quot; button.
      </p>
    </div>
  )
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export function PayAppEditor() {
  const { id: projectId, appId } = useParams<{ id: string; appId: string }>()
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
    downloadPDF: _downloadPDF,
    emailPayApp,
    updatePayApp,
    addChangeOrder,
    deleteChangeOrder,
    attachments,
    refresh,
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
  const [isDownloading, setIsDownloading] = useState(false)
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

  // Download PDF — fetch blob then trigger download (no blank tab)
  const handleDownloadPDF = useCallback(async () => {
    if (isTrialGated) {
      alert('Your trial has ended. Please upgrade to continue.')
      return
    }
    setIsDownloading(true)
    try {
      const token = localStorage.getItem('ci_token')
      const res = await fetch(`/api/payapps/${payAppId}/pdf?token=${encodeURIComponent(token || '')}`)
      if (!res.ok) throw new Error('PDF generation failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const projectName = (project as any)?.name?.replace(/\s+/g, '_') || 'Project'
      a.download = `PayApp_${payApp?.app_number || ''}_${projectName}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      if (payApp?.status === 'draft') {
        try {
          await updatePayApp({ status: 'submitted' } as any)
        } catch { /* auto-submit is best-effort */ }
      }
    } catch (err) {
      alert('Failed to download PDF. Please try again.')
    } finally {
      setIsDownloading(false)
    }
  }, [payAppId, payApp?.status, payApp?.app_number, project, updatePayApp, isTrialGated])

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
          include_payment_link: formData.includePaymentLink,
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
            <Button onClick={handleDownloadPDF} disabled={isDownloading} size="sm" variant="outline" className="gap-1">
              {isDownloading ? (
                <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" /> Generating...</>
              ) : (
                <><Download className="w-4 h-4" /> PDF</>
              )}
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

        {currentStep === 3 && (
          <Step3Attachments
            payAppId={payAppId}
            attachments={attachments}
            onRefresh={refresh}
          />
        )}

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

        {currentStep === 5 && (
          <Step5LienWaiver
            payApp={payApp}
            project={project}
            totals={totals}
          />
        )}

        {currentStep === 6 && (
          <Step6Preview
            payApp={payApp}
            project={project}
            totals={totals}
            computedLines={computedLines}
            changeOrders={changeOrders}
            onDownloadPDF={handleDownloadPDF}
            onOpenEmail={() => setIsEmailModalOpen(true)}
            isTrialGated={isTrialGated}
            isDownloading={isDownloading}
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
        defaultCC=""
        payAppNumber={payApp.app_number}
        projectName={project.name}
      />
    </div>
  )
}
