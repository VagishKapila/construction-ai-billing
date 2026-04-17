/**
 * Dashboard — Redesigned to match constructiinv_dashboard_final.html mockup
 * ARIA strip → Hero row → KPI row → Filter chips → Project cards (expanded)
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useProjects } from '@/hooks/useProjects'
import { useReports } from '@/hooks/useReports'
import { useTrial } from '@/hooks/useTrial'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/api/client'
import { formatCurrency } from '@/lib/formatters'
import { StripeConnectBanner } from '@/components/payments/StripeConnectBanner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PayAppSummary {
  id: number
  pay_app_number: number
  status: string
  amount_due?: number | null
  period_label?: string | null
  created_at: string
  payment_link_token?: string | null
}

// ─── Animation variants ───────────────────────────────────────────────────────

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
}
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28 } },
}

// ─── ARIA Strip ───────────────────────────────────────────────────────────────

function ARIAStrip({ userName }: { userName: string }) {
  const first = userName.split(' ')[0] || 'there'
  return (
    <motion.div
      variants={fadeUp}
      onClick={() => {}}
      style={{
        background: 'linear-gradient(135deg,#0f172a,#1e3a5f)',
        borderRadius: 12,
        padding: '18px 24px',
        color: '#e2e8f0',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        cursor: 'pointer',
        transition: 'box-shadow .15s',
      }}
      whileHover={{ boxShadow: '0 4px 20px rgba(15,23,42,0.35)' }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        background: 'linear-gradient(135deg,#0891b2,#06b6d4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, flexShrink: 0,
      }}>✨</div>
      <div style={{ flex: 1, fontSize: 14 }}>
        <strong style={{ color: '#fff' }}>Good morning, {first}.</strong>{' '}
        <span style={{ color: '#cbd5e1' }}>ARIA is monitoring your projects — check the Hub for new vendor documents.</span>
      </div>
      <Link to='/cash-flow' style={{ fontSize: 12, color: '#0891b2', fontWeight: 600, whiteSpace: 'nowrap', textDecoration: 'none' }} onClick={e => e.stopPropagation()}>Show me →</Link>
    </motion.div>
  )
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({ label, value, color, href }: { label: string; value: string; color: string; href: string }) {
  return (
    <Link to={href} style={{ textDecoration: 'none', display: 'block' }}>
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -2, boxShadow: '0 8px 40px rgba(37,99,235,0.12)' }}
      style={{
        background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12,
        padding: 16, textAlign: 'center', cursor: 'pointer',
        boxShadow: '0 4px 24px rgba(37,99,235,0.08)', transition: 'all .15s',
      }}
    >
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{label}</div>
    </motion.div>
    </Link>
  )
}

// ─── Trade Dot ────────────────────────────────────────────────────────────────

const TRADE_COLORS = ['#2563eb','#059669','#d97706','#7c3aed','#dc2626','#0891b2','#ea6c00','#0f172a']

function TradeDot({ letter, tooltip, color, onClick }: { letter: string; tooltip: string; color: string; onClick?: () => void }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <motion.div
        whileHover={{ scale: 1.25 }}
        onHoverStart={() => setShow(true)}
        onHoverEnd={() => setShow(false)}
        onClick={(e) => { e.stopPropagation(); onClick?.() }}
        style={{
          width: 22, height: 22, borderRadius: '50%',
          background: color, color: '#fff',
          fontSize: 9, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', zIndex: 1,
        }}
      >
        {letter}
      </motion.div>
      {show && (
        <div style={{
          position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)',
          background: '#0f172a', color: '#fff', padding: '4px 8px',
          borderRadius: 4, fontSize: 10, whiteSpace: 'nowrap', zIndex: 20,
          pointerEvents: 'none',
        }}>{tooltip}</div>
      )}
    </div>
  )
}

// ─── Pay App Row ──────────────────────────────────────────────────────────────

function PayAppRow({ pa, projectId }: { pa: PayAppSummary; projectId: number }) {
  const statusColor: Record<string, string> = {
    paid: '#00b87a', submitted: '#2563eb', draft: '#94a3b8', overdue: '#dc2626', partial: '#d97706',
  }
  const color = statusColor[pa.status] ?? '#94a3b8'
  return (
    <Link
      to={`/projects/${projectId}/pay-app/${pa.id}`}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 0', borderBottom: '1px solid #f8fafc', fontSize: 13,
        textDecoration: 'none', color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600 }}>#{pa.pay_app_number}</span>
        <span style={{ color: '#64748b', fontSize: 12 }}>{pa.period_label || pa.created_at?.slice(0,10)}</span>
        <span style={{
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 600,
        }}>{pa.amount_due != null ? formatCurrency(pa.amount_due) : '—'}</span>
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: 4,
          fontSize: 10, fontWeight: 700, background: color + '20', color,
          textTransform: 'uppercase',
        }}>{pa.status}</span>
      </div>
      <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
        {[
          { label: '↓ PDF', action: () => window.open(`/api/payapps/${pa.id}/pdf`, '_blank') },
          { label: '✉ Send', action: () => { window.location.href = `/projects/${projectId}/pay-app/${pa.id}?send=1` } },
          { label: '🔗 Share', action: () => { if (pa.payment_link_token) navigator.clipboard?.writeText(`${window.location.origin}/pay/${pa.payment_link_token}`) } },
        ].map(btn => (
          <button
            key={btn.label}
            onClick={btn.action}
            style={{
              padding: '4px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
              cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b',
              transition: 'all .1s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor='#2563eb'; e.currentTarget.style.color='#2563eb' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='#e2e8f0'; e.currentTarget.style.color='#64748b' }}
          >{btn.label}</button>
        ))}
      </div>
    </Link>
  )
}

// ─── Project Card ─────────────────────────────────────────────────────────────

interface ProjectCardProps {
  project: {
    id: number; name: string; owner?: string | null;
    original_contract?: number | null; payment_terms?: string | null;
    status?: string | null; pay_app_count?: number;
  }
}

function ProjectCard({ project }: ProjectCardProps) {
  const [expanded, setExpanded] = useState(true)
  const [payApps, setPayApps] = useState<PayAppSummary[]>([])
  const [trades, setTrades] = useState<Array<{ id: number; trade_name: string; company_name?: string | null; status?: string | null }>>([])

  useEffect(() => {
    api.get<PayAppSummary[]>(`/api/projects/${project.id}/pay-apps`)
      .then(r => { if (r.data) setPayApps(Array.isArray(r.data) ? r.data : []) })
      .catch(() => {})
    api.get<Array<{ id: number; trade_name: string; company_name?: string | null }>>(`/api/hub/projects/${project.id}/trades`)
      .then(r => { if (r.data) setTrades(Array.isArray(r.data) ? r.data : []) })
      .catch(() => {})
  }, [project.id])

  return (
    <motion.div variants={fadeUp} style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ display: 'flex' }}>
        <div style={{ width: 5, flexShrink: 0, background: '#00b87a' }} />
        <div style={{
          flex: 1, background: '#fff', border: '1.5px solid #e2e8f0',
          borderLeft: 'none', borderRadius: '0 12px 12px 0', overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(37,99,235,0.08)',
        }}>
          {/* Header */}
          <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <Link
                to={`/projects/${project.id}`}
                style={{ textDecoration: 'none', color: '#0f172a', fontFamily: "'DM Serif Display',serif", fontSize: 16, display: 'block', marginBottom: 4 }}
              >
                📍 {project.name}
              </Link>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                {project.owner && <>{project.owner} · </>}
                {project.original_contract != null && (
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>
                    {formatCurrency(project.original_contract)}
                  </span>
                )}
                {project.payment_terms && <> · {project.payment_terms}</>}
              </div>
              {trades.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                  {trades.slice(0, 8).map((t, i) => (
                    <Link key={t.id} to={`/projects/${project.id}`} style={{ textDecoration: 'none' }}>
                      <TradeDot
                        letter={t.trade_name.charAt(0).toUpperCase()}
                        tooltip={`${t.trade_name}${t.company_name ? ' — ' + t.company_name : ''}`}
                        color={TRADE_COLORS[i % TRADE_COLORS.length]}
                      />
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, marginLeft: 12 }}>
              <Link
                to={`/projects/${project.id}`}
                style={{
                  padding: '6px 14px', borderRadius: 8,
                  background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 11,
                  textDecoration: 'none', display: 'inline-block',
                }}
              >+ Pay App</Link>
              <button
                onClick={() => setExpanded(v => !v)}
                style={{
                  width: 28, height: 28, borderRadius: 6, border: '1.5px solid #e2e8f0',
                  background: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b',
                }}
              >{expanded ? '−' : '+'}</button>
            </div>
          </div>

          {/* Pay apps */}
          {expanded && (
            <div style={{ borderTop: '1px solid #f1f5f9', padding: '0 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 6px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <span>Pay Applications ({payApps.length})</span>
                <Link to={`/projects/${project.id}`} style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>View project →</Link>
              </div>
              {payApps.length === 0 ? (
                <div style={{ padding: '12px 0', color: '#94a3b8', fontSize: 13 }}>
                  No pay apps yet — <Link to={`/projects/${project.id}`} style={{ color: '#2563eb', fontWeight: 600 }}>open project to create one</Link>
                </div>
              ) : (
                payApps.slice(0, 5).map(pa => <PayAppRow key={pa.id} pa={pa} projectId={project.id} />)
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ firstName }: { firstName: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center', padding: '80px 24px', maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 36, color: '#0f172a', marginBottom: 8 }}>
        Welcome to ConstructInvoice AI{firstName ? `, ${firstName}` : ''}! 🎉
      </h1>
      <p style={{ color: '#64748b', fontSize: 16, marginBottom: 40 }}>Get paid faster with AI-powered G702/G703 billing.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 40 }}>
        {[
          { n: 1, t: 'Upload your SOV', d: 'Excel, PDF, or CSV' },
          { n: 2, t: 'ARIA detects trades', d: 'AI finds work items & vendors' },
          { n: 3, t: 'Generate invoice', d: 'AIA G702/G703 PDF ready to send' },
        ].map(s => (
          <motion.div key={s.n} whileHover={{ y: -4 }} style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 24, boxShadow: '0 4px 24px rgba(37,99,235,0.08)' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>{s.n}</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{s.t}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.d}</div>
          </motion.div>
        ))}
      </div>
      <motion.button
        whileHover={{ scale: 1.02, boxShadow: '0 8px 40px rgba(37,99,235,0.2)' }}
  
        style={{ padding: '14px 32px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 16, cursor: 'pointer' }}
      >Create Your First Project →</motion.button>
    </motion.div>
  )
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────

const FILTERS = ['All', '🔴 Overdue', '⚠️ Lien Due', '💰 Ready to Bill', '📥 New Docs'] as const
type Filter = typeof FILTERS[number]

export function Dashboard() {
  const { projects, isLoading } = useProjects()
  const { stats, revenueSummary } = useReports()
  const { isTrialGated } = useTrial()
  const { user } = useAuth()
  const [filter, setFilter] = useState<Filter>('All')

  const firstName = user?.name?.split(' ')[0] || ''
  const totalPipeline = projects.reduce((s, p) => s + (Number(p.original_contract) || 0), 0)
  const totalBilled = stats?.total_billed ?? 0
  const totalOutstanding = stats?.outstanding ?? 0
  const totalCollected = Math.max(0, totalBilled - (stats?.outstanding ?? 0))
  // Ready to Bill = remaining contract amount not yet billed (not outstanding invoices)
  const readyToBill = Math.max(0, totalPipeline - totalBilled)
  // Retention held: use revenueSummary if available, otherwise estimate at 10%
  const retentionHeld = (revenueSummary?.total_retainage ?? null) !== null
    ? (revenueSummary?.total_retainage ?? 0)
    : totalBilled * 0.1

  if (isLoading) {
    return (
      <div style={{ padding: 24 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: 120, background: '#fff', borderRadius: 12, marginBottom: 16, opacity: 0.5 }} />
        ))}
      </div>
    )
  }

  if (!isLoading && projects.length === 0) {
    return <EmptyState firstName={firstName} />
  }

  return (
    <div style={{ padding: 24, background: '#f0f4fa', minHeight: '100%' }}>
      <StripeConnectBanner />
      {isTrialGated && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#92400e', fontWeight: 600 }}>
          ⏰ Your trial has ended. <Link to="/settings#billing" style={{ color: '#2563eb' }}>Upgrade to Pro</Link> to continue creating pay apps.
        </div>
      )}

      <motion.div variants={stagger} initial="hidden" animate="visible">

        {/* ARIA Strip */}
        <ARIAStrip userName={user?.name || ''} />

        {/* Hero row */}
        <motion.div variants={fadeUp} style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          {/* Ready to Bill CTA */}
          <Link to='/projects' style={{ flex: 2, textDecoration: 'none', display: 'block' }}>
          <motion.div
            whileHover={{ y: -2, boxShadow: '0 8px 40px rgba(37,99,235,0.18)' }}
            style={{ background: 'linear-gradient(135deg,#2563eb,#0ea5e9)', borderRadius: 14, padding: 24, color: '#fff', cursor: 'pointer', height: '100%' }}
          >
            <div style={{ fontSize: 12, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 1 }}>Ready to Bill</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 32, fontWeight: 700, margin: '4px 0' }}>
              {formatCurrency(readyToBill)}
            </div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>
              Contract: {formatCurrency(totalPipeline)} · Billed: {formatCurrency(totalBilled)}
            </div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 12 }}>across {projects.length} active projects</div>
            <div style={{ display: 'inline-block', padding: '10px 24px', background: '#fff', color: '#2563eb', borderRadius: 8, fontWeight: 700, fontSize: 14 }}>
              📄 Create Pay App →
            </div>
          </motion.div>
          </Link>

          {/* Lien Deadlines */}
          <Link to='/lien' style={{ flex: 1, textDecoration: 'none', display: 'block' }}>
          <motion.div
            whileHover={{ y: -2, boxShadow: '0 8px 40px rgba(124,58,237,0.12)' }}
            style={{ borderRadius: 14, padding: 24, cursor: 'pointer', background: 'linear-gradient(135deg,#f5f3ff,#ede9fe)', border: '1.5px solid #ddd6fe', height: '100%' }}
          >
            <div style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>⚠️ Lien Deadlines</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 36, fontWeight: 700, color: '#7c3aed' }}>0</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>notices due this month</div>
            <div style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600, marginTop: 8 }}>View Lien Alerts →</div>
          </motion.div>
          </Link>

          {/* Retention Held */}
          <Link to='/reports' style={{ flex: 1, textDecoration: 'none', display: 'block' }}>
          <motion.div
            whileHover={{ y: -2, boxShadow: '0 8px 40px rgba(217,119,6,0.12)' }}
            style={{ borderRadius: 14, padding: 24, cursor: 'pointer', background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '1.5px solid #fde68a', height: '100%' }}
          >
            <div style={{ fontSize: 12, color: '#d97706', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>💰 Retention Held</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 36, fontWeight: 700, color: '#92400e' }}>
              {formatCurrency(retentionHeld)}
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>across active projects</div>
            <div style={{ fontSize: 12, color: '#d97706', fontWeight: 600, marginTop: 8 }}>View in Reports →</div>
          </motion.div>
          </Link>
        </motion.div>

        {/* KPI Row */}
        <motion.div variants={fadeUp} style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 20 }}>
          <KPICard label="Pipeline" value={formatCurrency(totalPipeline)} color="#2563eb" href='/reports' />
          <KPICard label="Outstanding" value={formatCurrency(totalOutstanding)} color="#d97706" href='/payments' />
          <KPICard label="Collected" value={formatCurrency(totalCollected)} color="#00b87a" href='/payments' />
          <KPICard label="Hub Docs Pending" value="—" color="#0891b2" href='/payments' />
          <KPICard label="Avg Days to Pay" value="—" color="#00b87a" href='/reports' />
        </motion.div>

        {/* Filter + Sort */}
        <motion.div variants={fadeUp} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', border: '1.5px solid',
                borderColor: filter === f ? '#2563eb' : '#e2e8f0',
                background: filter === f ? '#2563eb' : '#fff',
                color: filter === f ? '#fff' : '#1e293b',
                transition: 'all .15s',
              }}
            >{f}{f === 'All' ? ` (${projects.length})` : ''}</button>
          ))}
          <div style={{ marginLeft: 'auto' }}>
            <select style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 12, background: '#fff', cursor: 'pointer' }}>
              <option>🤖 ARIA: Urgent first</option>
              <option>📅 Date (newest)</option>
              <option>💰 Amount (highest)</option>
              <option>🔤 A–Z</option>
            </select>
          </div>
        </motion.div>

        {/* Project Cards */}
        {projects.map(p => (
          <ProjectCard key={p.id} project={p} />
        ))}

      </motion.div>
    </div>
  )
}

export default Dashboard
