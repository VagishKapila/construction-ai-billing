import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Upload, FileText, ChevronRight, CheckCircle2, AlertTriangle, ReceiptText, TableProperties, FolderOpen, Scale, Trophy, Zap, UserPlus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { PayApp, SOVLine } from '@/types'
import { useProject } from '@/hooks/useProject'
import { useTrial } from '@/hooks/useTrial'
import { createPayApp } from '@/api/payApps'
import { getProjectReconciliation, reopenProject, createProjectChangeOrder, recordManualPayment, type ReconciliationReport } from '@/api/projects'
import { HubTab } from '@/components/hub/HubTab'
import { VendorDetailPanel } from '@/components/shared/VendorDetailPanel'
import { InlineAlert } from '@/components/shared/InlineAlert'
import { ARIAStrip } from '@/components/shared/ARIAStrip'
import type { Trade as HubTrade } from '@/types/hub'
import { getTrades } from '@/api/hub'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatDate } from '@/lib/formatters'

// ─── Google Fonts injection (DM Serif Display + JetBrains Mono) ────────────────
const FONT_LINK = 'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=JetBrains+Mono:wght@400;600&display=swap'
if (typeof document !== 'undefined' && !document.querySelector(`link[href="${FONT_LINK}"]`)) {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = FONT_LINK
  document.head.appendChild(link)
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TabConfig {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  accent?: boolean
}

interface OrbitalPlanet {
  name: string
  initials: string
  color: string
  orbitRadius: number
  speed: number
  size: number
  trustScore?: number
  tradeRef: HubTrade
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS: TabConfig[] = [
  { id: 'payapps', label: 'Pay Applications', icon: ReceiptText },
  { id: 'sov', label: 'Schedule of Values', icon: TableProperties },
  { id: 'changeorders', label: 'Change Orders', icon: FileText },
  { id: 'documents', label: 'Documents', icon: FolderOpen },
  { id: 'reconciliation', label: 'Reconciliation', icon: Scale, accent: true },
]

const TRUST_COLORS: Record<string, string> = {
  high: '#00b87a',
  medium: '#2563eb',
  low: '#d97706',
}

// ─── TRADE INVITE TYPES ────────────────────────────────────────────────────────

const TRADE_TYPES = [
  'Plumbing', 'Electrical', 'HVAC', 'Framing', 'Concrete',
  'Roofing', 'Painting', 'Drywall', 'Flooring', 'Landscaping',
]

// ─── SUBCOMPONENT: PayAppRow ──────────────────────────────────────────────────

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

// ─── SUBCOMPONENT: SOVTable ───────────────────────────────────────────────────

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
        icon={<Upload />}
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
                      style={{ width: `${(line as any)?.percent_complete || 0}%` }}
                    />
                  </div>
                  <span className="font-medium text-text-primary min-w-12 text-right">
                    {((line as any)?.percent_complete || 0).toFixed(0)}%
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

// ─── SUBCOMPONENT: FullscreenOrbitalCanvas ────────────────────────────────────
// Fills the entire right panel — responsive canvas, star field background

interface FullscreenOrbitalProps {
  planets: OrbitalPlanet[]
  onPlanetClick?: (trade: HubTrade) => void
}

function FullscreenOrbitalCanvas({ planets, onPlanetClick }: FullscreenOrbitalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hoveredRef = useRef<string | null>(null)
  const speedRef = useRef<number>(1)
  const anglesRef = useRef<Record<string, number>>({})
  const animIdRef = useRef<number>(0)

  // Initialize angles spread evenly
  useEffect(() => {
    planets.forEach((p, i) => {
      if (!(p.name in anglesRef.current)) {
        anglesRef.current[p.name] = (i / Math.max(planets.length, 1)) * Math.PI * 2
      }
    })
  }, [planets])

  // Resize canvas to fill container
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const ro = new ResizeObserver(() => {
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
    })
    ro.observe(container)
    canvas.width = container.clientWidth
    canvas.height = container.clientHeight

    return () => ro.disconnect()
  }, [])

  // Draw loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Draw stars once (static star field)
    const stars: Array<{ x: number; y: number; r: number; a: number }> = []
    for (let i = 0; i < 120; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 1.2 + 0.3,
        a: Math.random() * 0.7 + 0.3,
      })
    }

    function draw() {
      if (!canvas || !ctx) return
      const W = canvas.width
      const H = canvas.height
      const cx = W / 2
      const cy = H / 2

      // Background
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#04070f'
      ctx.fillRect(0, 0, W, H)

      // Star field
      stars.forEach((s) => {
        ctx.beginPath()
        ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(200,220,255,${s.a})`
        ctx.fill()
      })

      // Orbit rings + planets
      const baseOrbit = Math.min(W, H) * 0.18
      planets.forEach((planet, idx) => {
        const orbitR = baseOrbit + idx * (Math.min(W, H) * 0.055)

        // Orbit ring
        ctx.beginPath()
        ctx.arc(cx, cy, orbitR, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,255,255,0.07)'
        ctx.lineWidth = 1
        ctx.stroke()

        // Advance angle unless frozen by hover
        if (hoveredRef.current !== planet.name) {
          anglesRef.current[planet.name] =
            (anglesRef.current[planet.name] || 0) + planet.speed * speedRef.current * 0.005
        }

        const angle = anglesRef.current[planet.name] || 0
        const px = cx + Math.cos(angle) * orbitR
        const py = cy + Math.sin(angle) * orbitR
        const isHovered = hoveredRef.current === planet.name
        const r = isHovered ? planet.size * 1.2 : planet.size

        // Glow ring on hover
        if (isHovered) {
          ctx.beginPath()
          ctx.arc(px, py, r + 4, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(255,255,255,0.6)'
          ctx.lineWidth = 2
          ctx.stroke()
        }

        // Planet body
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fillStyle = planet.color
        ctx.fill()

        // Initial letter
        ctx.fillStyle = '#fff'
        ctx.font = `bold ${Math.max(9, r * 0.6)}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(planet.initials.substring(0, 3).toUpperCase(), px, py)

        // Trust score below planet on hover
        if (isHovered && planet.trustScore) {
          ctx.fillStyle = 'rgba(255,255,255,0.85)'
          ctx.font = `10px Inter, sans-serif`
          ctx.fillText(`${planet.trustScore}/763`, px, py + r + 12)
        }
      })

      // Center HUB sun
      const sunR = Math.min(W, H) * 0.045
      const sunGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, sunR)
      sunGrad.addColorStop(0, '#fde68a')
      sunGrad.addColorStop(1, '#f59e0b')
      ctx.beginPath()
      ctx.arc(cx, cy, sunR, 0, Math.PI * 2)
      ctx.fillStyle = sunGrad
      ctx.fill()
      ctx.fillStyle = '#0f172a'
      ctx.font = `bold ${Math.max(7, sunR * 0.38)}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('HUB', cx, cy)

      animIdRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animIdRef.current)
    }
  }, [planets])

  // Mouse events
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const W = canvas.width
    const H = canvas.height
    const cx = W / 2
    const cy = H / 2
    const baseOrbit = Math.min(W, H) * 0.18

    let found: string | null = null
    planets.forEach((planet, idx) => {
      const orbitR = baseOrbit + idx * (Math.min(W, H) * 0.055)
      const angle = anglesRef.current[planet.name] || 0
      const px = cx + Math.cos(angle) * orbitR
      const py = cy + Math.sin(angle) * orbitR
      const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2)
      if (dist < planet.size + 8) {
        found = planet.name
      }
    })
    hoveredRef.current = found
    if (canvas) {
      canvas.style.cursor = found ? 'pointer' : 'default'
    }
  }, [planets])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !onPlanetClick) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const W = canvas.width
    const H = canvas.height
    const cx = W / 2
    const cy = H / 2
    const baseOrbit = Math.min(W, H) * 0.18

    planets.forEach((planet, idx) => {
      const orbitR = baseOrbit + idx * (Math.min(W, H) * 0.055)
      const angle = anglesRef.current[planet.name] || 0
      const px = cx + Math.cos(angle) * orbitR
      const py = cy + Math.sin(angle) * orbitR
      const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2)
      if (dist < planet.size + 8) {
        onPlanetClick(planet.tradeRef)
      }
    })
  }, [planets, onPlanetClick])

  if (planets.length === 0) {
    return (
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center"
        style={{ background: '#04070f' }}
      >
        <div className="text-center px-6">
          <p className="text-slate-500 text-4xl mb-3">🪐</p>
          <p className="text-slate-400 text-sm font-medium">No trades added yet</p>
          <p className="text-slate-600 text-xs mt-1">Add trades to watch them orbit</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full h-full" style={{ background: '#04070f' }}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        className="w-full h-full"
      />
    </div>
  )
}

// ─── SUBCOMPONENT: InviteView ─────────────────────────────────────────────────

interface InviteViewProps {
  projectId: number
  joinCode?: string
}

function InviteView({ projectId: _projectId, joinCode }: InviteViewProps) {
  const [copiedCode, setCopiedCode] = useState(false)
  const [selectedTrade, setSelectedTrade] = useState<string | null>(null)
  const [inviteSent, setInviteSent] = useState<string | null>(null)

  const handleCopyCode = () => {
    if (joinCode) {
      navigator.clipboard.writeText(joinCode)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    }
  }

  const handleQuickInvite = (tradeType: string) => {
    setSelectedTrade(tradeType)
    setInviteSent(tradeType)
    setTimeout(() => setInviteSent(null), 3000)
  }

  return (
    <div className="p-5 space-y-5 overflow-y-auto h-full" style={{ background: '#04070f' }}>
      {/* Join Code */}
      <div
        className="rounded-xl p-4 border"
        style={{ background: '#0d1526', borderColor: '#1e3a5f' }}
      >
        <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wide">Project Join Code</p>
        <div className="flex items-center gap-3">
          <code
            className="text-xl font-bold tracking-widest flex-1"
            style={{ fontFamily: 'JetBrains Mono, monospace', color: '#f59e0b' }}
          >
            {joinCode || '——————'}
          </code>
          <button
            onClick={handleCopyCode}
            disabled={!joinCode}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: copiedCode ? '#00b87a' : '#2563eb',
              color: '#fff',
            }}
          >
            {copiedCode ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">Share this code with trades to join the Hub</p>
      </div>

      {/* Quick Invite by Trade */}
      <div>
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-3">Quick Invite by Trade</p>
        <div className="grid grid-cols-2 gap-2">
          {TRADE_TYPES.map((trade) => (
            <button
              key={trade}
              onClick={() => handleQuickInvite(trade)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left"
              style={{
                background: selectedTrade === trade ? '#1e3a5f' : '#0d1526',
                color: inviteSent === trade ? '#00b87a' : '#94a3b8',
                border: `1px solid ${inviteSent === trade ? '#00b87a' : '#1e3a5f'}`,
              }}
            >
              <UserPlus className="w-3 h-3 flex-shrink-0" />
              {inviteSent === trade ? '✓ Invited' : trade}
            </button>
          ))}
        </div>
      </div>

      {/* Help text */}
      <div
        className="rounded-xl p-4 border text-xs"
        style={{ background: '#0a0f1e', borderColor: '#1e293b', color: '#64748b' }}
      >
        <p className="font-medium text-slate-400 mb-1">How it works</p>
        <p>Trades receive a magic link — no account creation needed. They can upload invoices, lien waivers, and compliance docs directly to this project.</p>
      </div>
    </div>
  )
}

// ─── SUBCOMPONENT: ARIAInsightsPanel ─────────────────────────────────────────

interface ARIAInsight {
  type: 'warning' | 'info' | 'success'
  message: string
}

interface ARIAInsightsPanelProps {
  insights: ARIAInsight[]
  totalOutstanding: number
  overdueCount: number
}

function ARIAInsightsPanel({ insights, totalOutstanding, overdueCount }: ARIAInsightsPanelProps) {
  return (
    <div
      className="border-t px-4 py-3 space-y-2 flex-shrink-0"
      style={{ borderColor: '#0d2440', background: '#040c1a' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">✨</span>
        <span className="text-xs font-semibold" style={{ color: '#0891b2' }}>ARIA Insights</span>
      </div>

      {insights.length === 0 ? (
        <p className="text-xs" style={{ color: '#475569' }}>
          No alerts for this project. Everything looks good.
        </p>
      ) : (
        <div className="space-y-1.5">
          {insights.map((insight, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-xs rounded-lg px-3 py-2"
              style={{
                background: insight.type === 'warning' ? 'rgba(220,38,38,0.12)' : insight.type === 'info' ? 'rgba(8,145,178,0.12)' : 'rgba(0,184,122,0.12)',
                color: insight.type === 'warning' ? '#fca5a5' : insight.type === 'info' ? '#67e8f9' : '#6ee7b7',
              }}
            >
              <span className="flex-shrink-0">{insight.type === 'warning' ? '⚠️' : insight.type === 'info' ? 'ℹ️' : '✓'}</span>
              <span>{insight.message}</span>
            </div>
          ))}
        </div>
      )}

      {overdueCount > 0 && (
        <div className="text-xs pt-1" style={{ color: '#dc2626' }}>
          {overdueCount} overdue payment{overdueCount > 1 ? 's' : ''} · {formatCurrency(totalOutstanding)} outstanding
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT — Split-screen command center
// ═══════════════════════════════════════════════════════════════════════════════

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const projectId = Number(id)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // ─── Left panel state ───────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('payapps')
  const [isCreatingPayApp, setIsCreatingPayApp] = useState(false)
  const [reconciliation, setReconciliation] = useState<ReconciliationReport | null>(null)
  const [reconLoading, setReconLoading] = useState(false)
  const [successBanner, setSuccessBanner] = useState<string | null>(null)
  const [isReopeningJob, setIsReopeningJob] = useState(false)
  const [_qbConnected, _setQbConnected] = useState(false)
  const [showAddCO, setShowAddCO] = useState(false)
  const [coForm, setCoForm] = useState({ description: '', amount: '' })
  const [isSubmittingCO, setIsSubmittingCO] = useState(false)
  const [recordPaymentOpen, setRecordPaymentOpen] = useState<number | null>(null)
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'Check', checkNumber: '', notes: '' })
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false)

  // ─── Right panel state ──────────────────────────────────────────────────────
  const [hubView, setHubView] = useState<'orbital' | 'inbox' | 'invite'>('orbital')
  const [hubTrades, setHubTrades] = useState<HubTrade[]>([])
  const [selectedTrade, setSelectedTrade] = useState<HubTrade | null>(null)

  // ─── Data hooks ─────────────────────────────────────────────────────────────
  const { project, sovLines, payApps, changeOrders, attachments, isLoading, error, refresh } =
    useProject(projectId)
  const { isTrialGated } = useTrial()

  // ─── Derived state ──────────────────────────────────────────────────────────
  const isJobCompleted = project?.status === 'completed'
  const nextPayAppNumber = (payApps[payApps.length - 1]?.app_number ?? 0) + 1

  const readyToBill = useMemo(() => {
    const contractAmount = Number(project?.original_contract) || 0
    if (!reconciliation?.summary) {
      // No pay apps yet — full contract is available to bill
      const totalBilledFromPayApps = payApps.reduce((sum, pa) => sum + (Number(pa.amount_due) || 0), 0)
      return Math.max(0, contractAmount - totalBilledFromPayApps)
    }
    const { total_work_completed = 0, total_billed = 0 } = reconciliation.summary
    return Math.max(0, total_work_completed - total_billed)
  }, [reconciliation, project, payApps])

  const isFullyBilled = reconciliation?.summary?.is_fully_reconciled ?? false

  // ─── ARIA Insights derived ──────────────────────────────────────────────────
  const ariaInsights = useMemo<ARIAInsight[]>(() => {
    const alerts: ARIAInsight[] = []
    const overduePayApps = payApps.filter(
      pa => pa.status === 'submitted' && pa.payment_status !== 'paid' &&
        pa.period_end && new Date(pa.period_end).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000
    )
    if (overduePayApps.length > 0) {
      alerts.push({ type: 'warning', message: `ARIA found: ${overduePayApps.length} pay app${overduePayApps.length > 1 ? 's' : ''} unpaid past due date` })
    }
    const totalCOs = changeOrders.reduce((sum, co) => sum + (co.amount || 0), 0)
    if (totalCOs > 0) {
      alerts.push({ type: 'info', message: `ARIA found: ${formatCurrency(totalCOs)} in change orders — verify SOV is updated` })
    }
    if (reconciliation?.summary?.total_retainage_held && (reconciliation.summary.total_retainage_held as number) > 10000) {
      alerts.push({ type: 'info', message: `ARIA found: ${formatCurrency(reconciliation.summary.total_retainage_held as number)} retainage held — consider release` })
    }
    return alerts
  }, [payApps, changeOrders, reconciliation])

  const overdueCount = useMemo(() => {
    return payApps.filter(pa => pa.status === 'submitted' && pa.payment_status !== 'paid').length
  }, [payApps])

  const totalOutstanding = useMemo(() => {
    return payApps
      .filter(pa => pa.status === 'submitted' && pa.payment_status !== 'paid')
      .reduce((sum, pa) => sum + (pa.amount_due || 0), 0)
  }, [payApps])

  // ─── ARIA inline alerts for left panel ─────────────────────────────────────
  const leftPanelAlerts = useMemo(() => {
    const alerts: Array<{ type: 'lien' | 'overdue' | 'retention' | 'info'; message: string; days?: number }> = []
    if (overdueCount > 0) {
      alerts.push({ type: 'overdue', message: `${overdueCount} pay app${overdueCount > 1 ? 's' : ''} awaiting payment — ${formatCurrency(totalOutstanding)} outstanding` })
    }
    const totalCOs = changeOrders.reduce((sum, co) => sum + (co.amount || 0), 0)
    if (totalCOs > 50000) {
      alerts.push({ type: 'retention', message: `${formatCurrency(totalCOs)} in change orders may affect retainage calculation` })
    }
    return alerts
  }, [overdueCount, totalOutstanding, changeOrders])

  // ─── Build orbital planets from hub trades ──────────────────────────────────
  const orbitalPlanets = useMemo<OrbitalPlanet[]>(() => {
    return hubTrades.map((trade, idx) => {
      const trustTier = ((trade as any).trust_tier as string) ?? 'medium'
      return {
        name: (trade as any).trade_name || `Trade ${idx + 1}`,
        initials: ((trade as any).trade_name?.substring(0, 3) || 'TRD').toUpperCase(),
        color: TRUST_COLORS[trustTier] || TRUST_COLORS.medium,
        orbitRadius: 80 + idx * 25,
        speed: 1 + idx * 0.15,
        size: 18,
        trustScore: (trade as any).trust_score ?? 0,
        tradeRef: trade,
      }
    })
  }, [hubTrades])

  // ─── Effects ────────────────────────────────────────────────────────────────

  // Success banner from URL param
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

  // Check QB connection
  useEffect(() => {
    const checkQBStatus = async () => {
      try {
        const response = await fetch('/api/quickbooks/status', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` },
        })
        if (response.ok) {
          const data = await response.json()
          _setQbConnected(data.connected === true)
        }
      } catch {
        _setQbConnected(false)
      }
    }
    checkQBStatus()
  }, [])

  // Load hub trades
  useEffect(() => {
    if (!projectId) return
    getTrades(projectId)
      .then(res => { if (res.data) setHubTrades(res.data) })
      .catch(() => {})
  }, [projectId])

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleCreatePayApp = async () => {
    if (isCreatingPayApp || isTrialGated) return
    try {
      setIsCreatingPayApp(true)
      const newPayApp = await createPayApp(projectId, {})
      if ((newPayApp as any)?.data?.id || (newPayApp as any)?.id) {
        navigate(`/projects/${projectId}/pay-app/${(newPayApp as any)?.data?.id || (newPayApp as any)?.id}`)
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
      await createProjectChangeOrder(projectId, { description: coForm.description, amount })
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
        payment_method: paymentForm.method,
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

  const handlePlanetClick = useCallback((trade: HubTrade) => {
    setSelectedTrade(prev => prev?.id === trade.id ? null : trade)
  }, [])

  // ─── Loading / error states ──────────────────────────────────────────────────

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
          <Button onClick={() => navigate('/dashboard')}>Back to Projects</Button>
        </div>
      </div>
    )
  }

  // ─── Derive a display label — prefer address, fallback to name ────────────────
  const displayAddress = project.address || project.name
  const contractorInitials = (project.contractor || 'CON')
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div
      data-testid="project-detail-split"
      style={{ display: 'flex', height: 'calc(100vh - 64px)', background: '#f0f4fa' }}
      className="-mx-4 sm:-mx-6 md:-mx-8 -mt-4 md:-mt-6 -mb-20 md:-mb-4"
    >
      {/* ═════════════════════════════════════════════════════════════════════
          LEFT PANEL — 55% — Financial command center, scrollable
      ═════════════════════════════════════════════════════════════════════ */}
      <div
        data-testid="left-panel"
        style={{
          width: '55%',
          overflowY: 'auto',
          background: '#ffffff',
          borderRight: '1.5px solid #e2e8f0',
          boxShadow: '0 4px 24px rgba(37,99,235,0.08)',
          padding: '28px 28px 40px',
        }}
        className="flex flex-col gap-5"
      >
        {/* Back button */}
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-medium self-start"
          style={{ color: '#2563eb' }}
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Dashboard
        </Link>

        {/* Success banner */}
        <AnimatePresence>
          {successBanner && (
            <ARIAStrip
              message={successBanner}
              variant="success"
            />
          )}
        </AnimatePresence>

        {/* ─── Project Header ──────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Address as primary title */}
              <h1
                className="text-2xl sm:text-3xl font-bold leading-tight truncate"
                style={{ fontFamily: '"DM Serif Display", Georgia, serif', color: '#0f172a' }}
              >
                📍 {displayAddress}
              </h1>

              {/* Owner + Terms row */}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className="text-sm text-text-muted">
                  Owner: <span className="font-semibold text-text-primary">{project.owner || 'Unknown'}</span>
                </span>
                <Badge
                  className="text-xs"
                  style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}
                >
                  {project.payment_terms || 'Net 30'}
                </Badge>
                {isJobCompleted && (
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 flex items-center gap-1">
                    <Trophy className="w-3 h-3" />
                    Completed
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Contract amount — JetBrains Mono */}
          <div className="flex items-baseline gap-3">
            <p
              className="text-3xl font-bold tracking-tight"
              style={{ fontFamily: '"JetBrains Mono", monospace', color: '#0f172a' }}
            >
              {formatCurrency(project.original_contract || 0)}
            </p>
            <span className="text-xs text-text-muted uppercase tracking-wide">Contract Value</span>
          </div>
        </div>

        {/* ─── Hero CTA Box ─────────────────────────────────────────────── */}
        {!isJobCompleted && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl p-5"
            style={{
              background: 'linear-gradient(135deg, #1d4ed8 0%, #0891b2 100%)',
              boxShadow: '0 4px 20px rgba(37,99,235,0.25)',
            }}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-blue-100 text-xs font-medium mb-1">Ready to bill</p>
                <p
                  className="text-2xl font-bold text-white"
                  style={{ fontFamily: '"JetBrains Mono", monospace' }}
                >
                  {formatCurrency(readyToBill)}
                </p>
                <p className="text-blue-200 text-xs mt-1">
                  {payApps.length === 0
                    ? 'Create your first pay application'
                    : `Create Pay App #${nextPayAppNumber}`}
                </p>
              </div>
              <Button
                onClick={handleCreatePayApp}
                disabled={isCreatingPayApp || isTrialGated}
                className="flex-shrink-0 font-semibold"
                style={{ background: '#ffffff', color: '#1d4ed8' }}
              >
                {isCreatingPayApp ? '...' : (
                  <>
                    <Zap className="w-4 h-4 mr-1.5" />
                    Create Pay App #{nextPayAppNumber}
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        )}

        {/* Job completed banner */}
        {isJobCompleted && (
          <Card className="bg-emerald-50 border-emerald-200 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-emerald-900 flex items-center gap-2">
                  <Trophy className="w-4 h-4" /> Job Completed
                </h3>
                <p className="text-sm text-emerald-700 mt-1">
                  All line items have been billed. Reopen to add more pay apps.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleReopenJob} disabled={isReopeningJob}>
                {isReopeningJob ? 'Reopening...' : 'Reopen Job'}
              </Button>
            </div>
          </Card>
        )}

        {/* ─── ARIA Alert Stack ─────────────────────────────────────────── */}
        {leftPanelAlerts.length > 0 && (
          <div className="space-y-2">
            {leftPanelAlerts.map((alert, i) => (
              <InlineAlert
                key={i}
                type={alert.type}
                message={alert.message}
              />
            ))}
          </div>
        )}

        {/* ─── Financial Summary Grid (2x2) ─────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4" style={{ border: '1.5px solid #e2e8f0', boxShadow: '0 4px 24px rgba(37,99,235,0.08)' }}>
            <p className="text-xs text-text-muted uppercase tracking-wide">Contract Value</p>
            <p
              className="text-lg font-bold text-text-primary mt-1.5"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            >
              {formatCurrency(project.original_contract || 0)}
            </p>
          </Card>
          <Card className="p-4" style={{ border: '1.5px solid #e2e8f0', boxShadow: '0 4px 24px rgba(37,99,235,0.08)' }}>
            <p className="text-xs text-text-muted uppercase tracking-wide">Change Orders</p>
            <p
              className="text-lg font-bold mt-1.5"
              style={{ fontFamily: '"JetBrains Mono", monospace', color: '#ea6c00' }}
            >
              {formatCurrency(changeOrders.reduce((sum, co) => sum + (co.amount || 0), 0))}
            </p>
          </Card>
          <Card className="p-4" style={{ border: '1.5px solid #e2e8f0', boxShadow: '0 4px 24px rgba(37,99,235,0.08)' }}>
            <p className="text-xs text-text-muted uppercase tracking-wide">Total Billed</p>
            <p
              className="text-lg font-bold mt-1.5"
              style={{ fontFamily: '"JetBrains Mono", monospace', color: '#00b87a' }}
            >
              {formatCurrency(reconciliation?.summary?.total_billed || 0)}
            </p>
          </Card>
          <Card className="p-4" style={{ border: '1.5px solid #e2e8f0', boxShadow: '0 4px 24px rgba(37,99,235,0.08)' }}>
            <p className="text-xs text-text-muted uppercase tracking-wide">Retention Held</p>
            <p
              className="text-lg font-bold mt-1.5"
              style={{ fontFamily: '"JetBrains Mono", monospace', color: '#d97706' }}
            >
              {formatCurrency(reconciliation?.summary?.total_retainage_held || 0)}
            </p>
          </Card>
        </div>

        {/* ─── Tabs ─────────────────────────────────────────────────────── */}
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

        {/* ─── Tab Content ──────────────────────────────────────────────── */}
        <div className="flex-1 pb-8">
          {activeTab === 'payapps' && (
            <div className="space-y-4">
              {payApps.length === 0 ? (
                <EmptyState
                  icon={<ReceiptText />}
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
                  icon={<Upload />}
                  title="No Schedule of Values"
                  description="Upload a Schedule of Values to get started"
                />
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-text-primary">{sovLines.length} Line Items</h3>
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
                          <p
                            className="font-bold text-lg text-text-primary"
                            style={{ fontFamily: '"JetBrains Mono", monospace' }}
                          >
                            {formatCurrency(co.amount)}
                          </p>
                          <Badge variant="outline" className="mt-1">{co.status}</Badge>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
              <div className="space-y-3">
                <Button variant="outline" onClick={() => setShowAddCO(!showAddCO)} className="w-full">
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
                    <Button onClick={handleAddChangeOrder} disabled={isSubmittingCO} className="w-full">
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
                  icon={<FolderOpen />}
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
                    <p className={`text-sm font-medium ${isFullyBilled ? 'text-emerald-900' : 'text-amber-900'}`}>
                      {isFullyBilled ? '✓ Fully Reconciled' : 'Reconciliation pending'}
                    </p>
                  </Card>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Work Completed', val: reconciliation.summary?.total_work_completed || 0, color: '#0f172a' },
                      { label: 'Total Billed', val: reconciliation.summary?.total_billed || 0, color: '#00b87a' },
                      { label: 'Retainage Held', val: reconciliation.summary?.total_retainage_held || 0, color: '#d97706' },
                      {
                        label: 'Balance to Finish',
                        val: (reconciliation.summary?.total_work_completed || 0) - (reconciliation.summary?.total_billed || 0),
                        color: '#2563eb',
                      },
                    ].map(({ label, val, color }) => (
                      <Card key={label} className="p-4">
                        <p className="text-xs text-text-muted">{label}</p>
                        <p
                          className="text-lg font-bold mt-1"
                          style={{ fontFamily: '"JetBrains Mono", monospace', color }}
                        >
                          {formatCurrency(val as number)}
                        </p>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          RIGHT PANEL — 45% — Dark orbital + hub ecosystem, sticky
      ═════════════════════════════════════════════════════════════════════ */}
      <div
        data-testid="right-panel"
        style={{
          width: '45%',
          display: 'flex',
          flexDirection: 'column',
          background: '#04070f',
          position: 'sticky',
          top: 0,
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* ─── Toggle bar: Orbital / Inbox / Invite ─────────────────────── */}
        <div
          style={{ background: '#0a0f1e', borderBottom: '1px solid #1a2840' }}
          className="px-4 py-3 flex items-center gap-2 flex-shrink-0"
        >
          {/* Contractor initials badge */}
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mr-1"
            style={{ background: '#2563eb' }}
          >
            {contractorInitials}
          </div>

          <button
            data-testid="toggle-orbital"
            onClick={() => setHubView('orbital')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              hubView === 'orbital' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-200'
            }`}
            style={{ background: hubView === 'orbital' ? '#f1f5f9' : 'transparent' }}
          >
            🪐 Orbital
          </button>

          <button
            data-testid="toggle-inbox"
            onClick={() => setHubView('inbox')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
              hubView === 'inbox' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-200'
            }`}
            style={{ background: hubView === 'inbox' ? '#f1f5f9' : 'transparent' }}
          >
            📥 Inbox
            {hubTrades.length > 0 && (
              <span
                className="rounded-full text-[10px] font-bold px-1.5 py-0.5"
                style={{ background: '#dc2626', color: '#fff', minWidth: '18px', textAlign: 'center' }}
              >
                {hubTrades.length}
              </span>
            )}
          </button>

          <button
            data-testid="toggle-invite"
            onClick={() => setHubView('invite')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
              hubView === 'invite' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-200'
            }`}
            style={{ background: hubView === 'invite' ? '#f1f5f9' : 'transparent' }}
          >
            <UserPlus className="w-3 h-3" />
            Invite
          </button>
        </div>

        {/* ─── Main content area ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden relative">
          {/* ORBITAL VIEW */}
          {hubView === 'orbital' && (
            <div className="w-full h-full relative">
              <FullscreenOrbitalCanvas
                planets={orbitalPlanets}
                onPlanetClick={handlePlanetClick}
              />

              {/* Orbital legend — bottom-left overlay */}
              <div
                className="absolute bottom-4 left-4 flex flex-col gap-1.5 p-3 rounded-xl"
                style={{ background: 'rgba(10,15,30,0.85)', backdropFilter: 'blur(8px)' }}
              >
                {[
                  { label: 'Active', color: '#00b87a' },
                  { label: 'Pending', color: '#2563eb' },
                  { label: 'Overdue', color: '#dc2626' },
                  { label: 'Invited', color: '#94a3b8' },
                ].map(({ label, color }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span className="text-[10px]" style={{ color: '#94a3b8' }}>{label}</span>
                  </div>
                ))}
              </div>

              {/* VendorDetailPanel slide-in */}
              <AnimatePresence>
                {selectedTrade && (
                  <motion.div
                    key="vendor-panel"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 40 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 280 }}
                    className="absolute right-0 top-0 bottom-0 z-50"
                    style={{ width: '270px' }}
                  >
                    <VendorDetailPanel
                      trade={{
                        id: (selectedTrade as any).id,
                        trade_name: (selectedTrade as any).trade_name || (selectedTrade as any).name || 'Trade',
                        company_name: (selectedTrade as any).company_name,
                        status: (selectedTrade as any).status,
                        trust_score: (selectedTrade as any).trust_score,
                        email_alias: (selectedTrade as any).email_alias,
                        contact_email: (selectedTrade as any).contact_email,
                      }}
                      onClose={() => setSelectedTrade(null)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* INBOX VIEW */}
          {hubView === 'inbox' && (
            <div className="w-full h-full overflow-hidden">
              <HubTab projectId={projectId} />
            </div>
          )}

          {/* INVITE VIEW */}
          {hubView === 'invite' && (
            <InviteView
              projectId={projectId}
              joinCode={(project as any).join_code}
            />
          )}
        </div>

        {/* ─── ARIA Insights strip (always visible, below view) ──────────── */}
        <ARIAInsightsPanel
          insights={ariaInsights}
          overdueCount={overdueCount}
          totalOutstanding={totalOutstanding}
        />
      </div>
    </div>
  )
}
