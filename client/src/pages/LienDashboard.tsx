/**
 * LienDashboard — Lien Waiver Status & Deadlines
 * Shows lien waivers across all projects with deadlines and filing status.
 * Route: /lien (protected)
 */

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { AlertTriangle, FileCheck, Clock, Download, ChevronRight, FolderOpen } from 'lucide-react'
import { getLienDocs, downloadLienDocPDF } from '@/api/lienWaivers'
import { useProjects } from '@/hooks/useProjects'
import type { LienDocument } from '@/types'

interface ProjectLienGroup {
  projectId: number
  projectName: string
  docs: LienDocument[]
  hasOverdue: boolean
  hasDueSoon: boolean
}

const DOC_TYPE_LABELS: Record<string, string> = {
  preliminary_notice: 'Preliminary Notice',
  conditional_waiver: 'Conditional Progress Waiver',
  unconditional_waiver: 'Unconditional Progress Waiver',
  conditional_final_waiver: 'Conditional Final Waiver',
  unconditional_final_waiver: 'Unconditional Final Waiver',
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
}

export function LienDashboard() {
  const { projects, isLoading: projectsLoading } = useProjects()
  const [groups, setGroups] = useState<ProjectLienGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [downloading, setDownloading] = useState<number | null>(null)

  useEffect(() => {
    if (projectsLoading || !projects.length) {
      if (!projectsLoading) setIsLoading(false)
      return
    }

    const fetchAll = async () => {
      const settled = await Promise.allSettled(
        projects.map(async (p) => {
          const res = await getLienDocs(p.id)
          return { project: p, docs: res.data ?? [] }
        }),
      )

      const built: ProjectLienGroup[] = settled
        .filter((r): r is PromiseFulfilledResult<{ project: typeof projects[0]; docs: LienDocument[] }> => r.status === 'fulfilled')
        .map(({ value: { project, docs } }) => ({
          projectId: project.id,
          projectName: project.name,
          docs,
          hasOverdue: false, // lien waivers don't have due dates in current schema
          hasDueSoon: false,
        }))
        .filter((g) => g.docs.length > 0)

      setGroups(built)
      setIsLoading(false)
    }

    fetchAll()
  }, [projects, projectsLoading])

  const handleDownload = async (docId: number, docType: string) => {
    setDownloading(docId)
    try {
      const blob = await downloadLienDocPDF(docId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lien-waiver-${docType}-${docId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download failed:', err)
    } finally {
      setDownloading(null)
    }
  }

  const totalDocs = groups.reduce((s, g) => s + g.docs.length, 0)
  const conditionalCount = groups.reduce(
    (s, g) => s + g.docs.filter((d) => d.doc_type.startsWith('conditional')).length,
    0,
  )
  const unconditionalCount = totalDocs - conditionalCount

  if (isLoading || projectsLoading) {
    return (
      <div className="space-y-4">
        <div className="h-28 bg-purple-100 rounded-xl animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <motion.div
      variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-bold text-[#1a1a2e]">Lien Waivers</h1>
        <p className="text-sm text-[#888888] mt-1">
          Conditional and unconditional waivers across all active projects
        </p>
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={fadeUp} className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Waivers', value: totalDocs, icon: <FileCheck size={20} />, color: '#7c3aed', bg: '#f5f3ff' },
          { label: 'Conditional', value: conditionalCount, icon: <AlertTriangle size={20} />, color: '#d97706', bg: '#fffbeb' },
          { label: 'Unconditional', value: unconditionalCount, icon: <Clock size={20} />, color: '#059669', bg: '#ecfdf5' },
        ].map((card) => (
          <div
            key={card.label}
            style={{ background: card.bg, borderRadius: 12, padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}
          >
            <div
              style={{
                width: 44, height: 44, borderRadius: 10, background: card.color + '20',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: card.color,
              }}
            >
              {card.icon}
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', fontFamily: "'JetBrains Mono',monospace" }}>
                {card.value}
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{card.label}</div>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Project Groups */}
      {groups.length === 0 ? (
        <motion.div
          variants={fadeUp}
          className="text-center py-20 rounded-xl border-2 border-dashed border-purple-200 bg-purple-50"
        >
          <FolderOpen className="w-14 h-14 text-purple-300 mx-auto mb-4" />
          <p className="text-lg font-semibold text-gray-900 mb-2">No lien waivers yet</p>
          <p className="text-sm text-gray-500 mb-6">
            Generate lien waivers from any project's pay application.
          </p>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 bg-purple-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors"
          >
            Go to Projects <ChevronRight size={16} />
          </Link>
        </motion.div>
      ) : (
        groups.map((group) => (
          <motion.div
            key={group.projectId}
            variants={fadeUp}
            className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm overflow-hidden"
          >
            {/* Group Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-purple-50 border-b border-purple-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                  <FileCheck size={16} className="text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-[#1a1a2e] text-sm">{group.projectName}</h3>
                  <p className="text-xs text-[#888888]">{group.docs.length} lien document{group.docs.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <Link
                to={`/projects/${group.projectId}`}
                className="text-xs text-purple-600 font-semibold hover:underline flex items-center gap-1"
              >
                View Project <ChevronRight size={12} />
              </Link>
            </div>

            {/* Docs List */}
            <div className="divide-y divide-[#f1f5f9]">
              {group.docs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        background: doc.doc_type.startsWith('unconditional') ? '#10b981' : '#f59e0b',
                      }}
                    />
                    <div>
                      <p className="text-sm font-medium text-[#1a1a2e]">
                        {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                      </p>
                      <p className="text-xs text-[#888888] mt-0.5">
                        {doc.signatory_name && `Signed by ${doc.signatory_name}`}
                        {doc.amount != null && ` · ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(doc.amount)}`}
                        {doc.through_date && ` · Through ${new Date(doc.through_date).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(doc.id, doc.doc_type)}
                    disabled={downloading === doc.id}
                    className="flex items-center gap-1.5 text-xs text-purple-600 font-semibold hover:text-purple-800 transition-colors disabled:opacity-40"
                  >
                    <Download size={14} />
                    {downloading === doc.id ? 'Downloading…' : 'Download PDF'}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        ))
      )}
    </motion.div>
  )
}
