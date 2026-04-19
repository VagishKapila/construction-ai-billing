/**
 * RetentionBreakdown — Per-project retention held view
 * Route: /retention (protected)
 *
 * Data source: GET /api/reports/summary
 * Shows: per-project table + ARIA intelligence + action buttons
 */

import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, DollarSign, TrendingUp, FileText, Mail } from 'lucide-react'
import { api } from '@/api/client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectSummary {
  id: number
  name: string
  number: string | null
  status: string
  original_contract: number
  total_scheduled: number
  total_work_completed: number
  total_retainage: number
  payapp_count: number
}

interface SummaryResponse {
  projects: ProjectSummary[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMoney(val: number | string | null | undefined): string {
  const n = Number(val) || 0
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

const fadeUp = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.22 } } }
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }

// ─── Main Component ───────────────────────────────────────────────────────────

export function RetentionBreakdown() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<SummaryResponse>('/api/reports/summary')
      .then(res => {
        const data = res.data
        // Filter to only projects with retainage > 0
        const withRetainage = (data?.projects || []).filter(p => Number(p.total_retainage) > 0)
        setProjects(withRetainage)
      })
      .catch(() => setError('Failed to load retention data'))
      .finally(() => setLoading(false))
  }, [])

  const totalRetention = useMemo(() => projects.reduce((s, p) => s + Number(p.total_retainage), 0), [projects])
  const totalContract = useMemo(() => projects.reduce((s, p) => s + Number(p.original_contract || p.total_scheduled), 0), [projects])

  // ARIA intelligence tips
  const ariaTips = useMemo(() => {
    const tips: string[] = []
    const nearlyComplete = projects.filter(p => {
      const pct = Number(p.total_work_completed) / (Number(p.total_scheduled) || 1)
      return pct >= 0.9
    })
    if (nearlyComplete.length > 0) {
      tips.push(`${nearlyComplete.length} project${nearlyComplete.length > 1 ? 's are' : ' is'} ≥90% complete — consider requesting retention release now.`)
    }
    if (totalRetention > 50000) {
      tips.push(`You have ${formatMoney(totalRetention)} in retention across ${projects.length} projects. In California, retention must be released within 45 days of project completion (Civil Code §8812).`)
    }
    if (projects.length > 0) {
      tips.push(`To request retention release, send a written notice to the project owner with the completed work documentation and your lien waiver.`)
    }
    return tips
  }, [projects, totalRetention])

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '32px 24px', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* Header */}
        <motion.div initial="hidden" animate="visible" variants={stagger}>
          <motion.div variants={fadeUp} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#64748b', fontSize: 14, fontWeight: 600, padding: '6px 0',
              }}
            >
              <ArrowLeft size={16} /> Dashboard
            </button>
          </motion.div>

          <motion.div variants={fadeUp} style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: 0, lineHeight: 1.2 }}>
              Retention Held
            </h1>
            <p style={{ fontSize: 15, color: '#64748b', margin: '6px 0 0', fontWeight: 400 }}>
              {loading ? 'Loading…' : `${formatMoney(totalRetention)} across ${projects.length} active project${projects.length !== 1 ? 's' : ''}`}
            </p>
          </motion.div>

          {/* Summary KPI row */}
          {!loading && projects.length > 0 && (
            <motion.div variants={fadeUp} style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
              {[
                { label: 'Total Retention', value: formatMoney(totalRetention), icon: <DollarSign size={18} />, color: '#d97706' },
                { label: 'Total Contract', value: formatMoney(totalContract), icon: <TrendingUp size={18} />, color: '#2563eb' },
                { label: 'Projects', value: String(projects.length), icon: <FileText size={18} />, color: '#059669' },
              ].map(kpi => (
                <div key={kpi.label} style={{
                  flex: '1 1 180px',
                  background: '#fff',
                  borderRadius: 12,
                  border: '1px solid #e2e8f0',
                  padding: '16px 20px',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{ color: kpi.color, flexShrink: 0 }}>{kpi.icon}</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{kpi.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', fontFamily: "'JetBrains Mono', monospace" }}>{kpi.value}</div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {/* Per-project table */}
          {loading ? (
            <motion.div variants={fadeUp} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 32, textAlign: 'center', color: '#94a3b8' }}>
              Loading retention data…
            </motion.div>
          ) : error ? (
            <motion.div variants={fadeUp} style={{ background: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca', padding: 24, color: '#dc2626' }}>
              {error}
            </motion.div>
          ) : projects.length === 0 ? (
            <motion.div variants={fadeUp} style={{
              background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
              padding: 48, textAlign: 'center',
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>💰</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>No retention held</div>
              <div style={{ fontSize: 14, color: '#64748b' }}>Submit pay applications with retainage to track it here.</div>
            </motion.div>
          ) : (
            <motion.div variants={fadeUp}>
              {/* Desktop table */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['Project', 'Contract', 'Billed', '% Complete', 'Retention', 'Rate', 'Status', ''].map(h => (
                        <th key={h} style={{
                          padding: '12px 16px', textAlign: h === '' ? 'center' : 'left',
                          fontSize: 11, fontWeight: 700, color: '#64748b',
                          textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p, i) => {
                      const contract = Number(p.original_contract) || Number(p.total_scheduled) || 0
                      const billed = Number(p.total_work_completed) || 0
                      const retention = Number(p.total_retainage) || 0
                      const pctComplete = contract > 0 ? Math.round((billed / contract) * 100) : 0
                      const retentionRate = billed > 0 ? Math.round((retention / billed) * 100) : 0
                      const isNearComplete = pctComplete >= 90
                      const statusColor = p.status === 'completed' ? '#059669' : '#2563eb'
                      const statusBg = p.status === 'completed' ? '#ecfdf5' : '#eff6ff'

                      return (
                        <tr
                          key={p.id}
                          onClick={() => navigate(`/projects/${p.id}`)}
                          style={{
                            borderBottom: i < projects.length - 1 ? '1px solid #f1f5f9' : 'none',
                            cursor: 'pointer',
                            transition: 'background 0.12s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '14px 16px', maxWidth: 220 }}>
                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {p.name}
                            </div>
                            {p.number && <div style={{ fontSize: 12, color: '#94a3b8' }}>#{p.number}</div>}
                            {isNearComplete && (
                              <span style={{ fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#d97706', borderRadius: 4, padding: '1px 6px', marginTop: 2, display: 'inline-block' }}>
                                RELEASE ELIGIBLE
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '14px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#374151' }}>
                            {formatMoney(contract)}
                          </td>
                          <td style={{ padding: '14px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#374151' }}>
                            {formatMoney(billed)}
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, maxWidth: 80, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(pctComplete, 100)}%`, height: '100%', background: isNearComplete ? '#059669' : '#2563eb', borderRadius: 3 }} />
                              </div>
                              <span style={{ fontSize: 13, fontWeight: 600, color: isNearComplete ? '#059669' : '#374151', minWidth: 36 }}>{pctComplete}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '14px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: '#92400e' }}>
                            {formatMoney(retention)}
                          </td>
                          <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748b' }}>
                            {retentionRate}%
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, background: statusBg, color: statusColor, borderRadius: 6, padding: '3px 10px', textTransform: 'capitalize' }}>
                              {p.status || 'active'}
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => {
                                  const subject = encodeURIComponent(`Retention Release Request — ${p.name}`)
                                  const body = encodeURIComponent(`Dear Owner,\n\nWe are writing to formally request the release of retention funds held on the above project.\n\nProject: ${p.name}${p.number ? ` (#${p.number})` : ''}\nRetention Held: ${formatMoney(retention)}\nWork Completed: ${pctComplete}%\n\nPlease release the retention funds per our contract terms.\n\nThank you,\n[Your Name]`)
                                  window.open(`mailto:?subject=${subject}&body=${body}`)
                                }}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 4,
                                  background: '#fff7ed', color: '#d97706', border: '1px solid #fde68a',
                                  borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600,
                                  cursor: 'pointer', whiteSpace: 'nowrap',
                                }}
                                title="Draft retention release email"
                              >
                                <Mail size={12} /> Request Release
                              </button>
                              <button
                                onClick={() => navigate(`/projects/${p.id}`)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 4,
                                  background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
                                  borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600,
                                  cursor: 'pointer', whiteSpace: 'nowrap',
                                }}
                              >
                                <FileText size={12} /> View Pay Apps
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {/* Totals row */}
                  <tfoot>
                    <tr style={{ background: '#fffbeb', borderTop: '2px solid #fde68a' }}>
                      <td style={{ padding: '14px 16px', fontWeight: 800, fontSize: 14, color: '#0f172a' }}>TOTAL</td>
                      <td style={{ padding: '14px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700 }}>{formatMoney(totalContract)}</td>
                      <td colSpan={2} />
                      <td style={{ padding: '14px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 800, color: '#92400e' }}>{formatMoney(totalRetention)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </motion.div>
          )}

          {/* ARIA Intelligence */}
          {!loading && ariaTips.length > 0 && (
            <motion.div variants={fadeUp} style={{
              marginTop: 28,
              background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
              border: '1.5px solid #fde68a',
              borderRadius: 12,
              padding: 20,
            }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#d97706', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                🤖 ARIA INTELLIGENCE
              </div>
              <ul style={{ margin: 0, padding: '0 0 0 18px', listStyle: 'disc' }}>
                {ariaTips.map((tip, i) => (
                  <li key={i} style={{ fontSize: 14, color: '#78350f', lineHeight: 1.55, marginBottom: i < ariaTips.length - 1 ? 8 : 0 }}>
                    {tip}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

        </motion.div>
      </div>
    </div>
  )
}
