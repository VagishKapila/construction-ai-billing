/**
 * VendorDashboard — Orange Universe for Subs & Vendors
 * Complete view of projects the vendor works on, documents submitted, payment status, and trust score.
 * ORANGE THEME throughout — primary #ea6c00, light #fff7ed, page bg #fef9f5
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Building2, FileText, AlertCircle, X, Link2, ChevronRight } from 'lucide-react'
import type { Project } from '@/types'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/formatters'
import { MAX_SCORE, getTierName } from '@/features/trust/TrustScoreBadge'
import TrustScoreBreakdown from '@/features/trust/TrustScoreBreakdown'
import VendorProjectCard from '@/features/vendor/VendorProjectCard'
import VendorUploadModal from '@/features/vendor/VendorUploadModal'

interface VendorProject extends Project {
  status_badge?: 'needs_upload' | 'pending' | 'approved' | 'rejected' | 'paid'
  last_submission_date?: string
  last_submission_amount?: number
  rejection_reason?: string
  payment_date?: string
  trust_score?: number
}

interface VendorDocument {
  id: number
  project_id: number
  project_name: string
  doc_type: string
  amount?: number
  submitted_at: string
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'paid'
  rejection_reason?: string
}

export function VendorDashboard() {
  const [myProjects, setMyProjects] = useState<VendorProject[]>([])
  const [myDocuments, setMyDocuments] = useState<VendorDocument[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>()
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [trustScore, setTrustScore] = useState(500)
  const [trustScoreId, setTrustScoreId] = useState<number>(0)
  const [trustScoreOpen, setTrustScoreOpen] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('auth_token') || ''
        const headers = { 'Authorization': `Bearer ${token}` }

        // Fetch vendor's projects
        const projectsRes = await fetch('/api/hub/my-projects', { headers })
        if (projectsRes.ok) {
          const data = await projectsRes.json()
          setMyProjects(data.data || [])
        }

        // Fetch vendor's documents
        const docsRes = await fetch('/api/hub/my-documents', { headers })
        if (docsRes.ok) {
          const data = await docsRes.json()
          setMyDocuments(data.data || [])
        }

        // Fetch trust score
        const scoreRes = await fetch('/api/hub/trust-score', { headers })
        if (scoreRes.ok) {
          const data = await scoreRes.json()
          setTrustScore(data.score || 500)
          if (data.id) setTrustScoreId(data.id)
        }
      } catch (err) {
        console.error('Failed to fetch vendor data:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-6 bg-[#fef9f5] min-h-screen p-6">
        <div className="h-12 bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-orange-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const filteredProjects =
    filterStatus === 'all'
      ? myProjects
      : myProjects.filter((p) => p.status_badge === filterStatus)

  const filteredDocuments =
    filterStatus === 'all'
      ? myDocuments
      : myDocuments.filter((d) => d.status === filterStatus)

  const tierName = getTierName(trustScore)
  const tierLabels: Record<string, string> = {
    platinum: 'Platinum',
    gold: 'Gold',
    silver: 'Silver',
    bronze: 'Bronze',
    review: 'Under Review',
  }

  const handleJoinProject = async () => {
    if (!joinCode.trim()) return
    setJoinLoading(true)
    setJoinError(null)
    try {
      const token = localStorage.getItem('auth_token') || ''
      const res = await fetch('/api/hub/join', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ join_code: joinCode.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setJoinError(data.error || 'Invalid code — check with your contractor')
      } else {
        window.location.reload()
      }
    } catch {
      setJoinError('Network error — please try again')
    } finally {
      setJoinLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#fef9f5] p-6 space-y-8">
      {/* Header Strip — Orange Gradient */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl p-8 shadow-lg"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white font-display">🔧 Vendor Portal</h1>
            <p className="text-orange-100 mt-2">Manage your projects, upload documents, and track your trust score</p>
          </div>
          <button
            onClick={() => setTrustScoreOpen(true)}
            className="text-right group hover:opacity-90 transition-opacity"
            aria-label="View trust score breakdown"
          >
            <div className="text-sm text-orange-100 mb-2">Your Trust Score</div>
            <div className="text-4xl font-bold text-white font-mono">
              {trustScore}<span className="text-lg text-orange-100">/{MAX_SCORE}</span>
            </div>
            <div className="text-xs text-orange-100 mt-1 flex items-center justify-end gap-1">
              {tierLabels[tierName]}
              <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>
        </div>
      </motion.div>

      {/* Trust Score Banner — Purple Card */}
      {trustScore < 687 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-purple-50 to-purple-100 border-2 border-purple-200 rounded-xl p-4"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-purple-900">Your Trust Score: {trustScore}/763 — {tierLabels[tierName]}</h3>
              <p className="text-sm text-purple-700 mt-1">
                {tierName === 'review' && 'Your submissions are under review. Follow feedback to improve.'}
                {tierName === 'bronze' && 'You are building your record. Focus on quality submissions to reach Silver.'}
                {tierName === 'silver' && 'You are a reliable vendor. Work towards Gold by reducing rejections.'}
                {tierName === 'gold' && 'You have a strong record. A few more approvals will get you to Platinum.'}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Filter Chips — Orange Active State */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'needs_upload', 'pending', 'approved', 'rejected', 'paid'].map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-2 rounded-full font-medium transition-all text-sm ${
              filterStatus === status
                ? 'bg-orange-500 text-white shadow-md'
                : 'bg-white text-gray-700 border border-gray-200 hover:border-orange-300'
            }`}
          >
            {status === 'all' && 'All'}
            {status === 'needs_upload' && '⚠️ Needs Upload'}
            {status === 'pending' && '⏳ Pending Review'}
            {status === 'approved' && '✅ Approved'}
            {status === 'rejected' && '❌ Rejected'}
            {status === 'paid' && '💰 Paid'}
          </button>
        ))}
      </div>

      {/* My Projects — Status Variants */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">My Projects</h2>
          <span className="text-sm font-medium text-orange-600">{filteredProjects.length} projects</span>
        </div>

        {filteredProjects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-xl bg-white border-2 border-orange-200 overflow-hidden"
          >
            {filterStatus === 'all' ? (
              <div className="p-10 text-center">
                <Building2 className="w-16 h-16 text-orange-300 mx-auto mb-4" />
                <p className="text-lg font-semibold text-gray-900 mb-2">You haven't joined any projects yet</p>
                <p className="text-sm text-gray-500 mb-6">Enter a join code from your contractor, or open the magic link they emailed you.</p>

                {/* Join code input */}
                <div className="max-w-sm mx-auto space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => { setJoinCode(e.target.value); setJoinError(null) }}
                      onKeyDown={(e) => e.key === 'Enter' && handleJoinProject()}
                      placeholder="Enter join code (e.g. PLM-7X2K)"
                      className="flex-1 border border-orange-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                    <button
                      onClick={handleJoinProject}
                      disabled={joinLoading || !joinCode.trim()}
                      className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                    >
                      {joinLoading ? '...' : 'Join'}
                    </button>
                  </div>
                  {joinError && <p className="text-sm text-red-600">{joinError}</p>}

                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Link2 size={12} />
                    <span>No code? Ask your contractor to send you a magic link invite.</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-16 text-center">
                <Building2 className="w-16 h-16 text-orange-300 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-900 mb-2">No {filterStatus} projects</p>
                <p className="text-sm text-gray-600">Try a different filter</p>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project, idx) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
              >
                <VendorProjectCard
                  project={project}
                  status={project.status_badge || 'needs_upload'}
                  amount={project.last_submission_amount}
                  rejectionReason={project.rejection_reason}
                  approvedAt={project.last_submission_date}
                  paidAt={project.payment_date}
                  onUpload={() => {
                    setSelectedProjectId(project.id)
                    setUploadModalOpen(true)
                  }}
                  onResubmit={() => {
                    setSelectedProjectId(project.id)
                    setUploadModalOpen(true)
                  }}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Document History Table */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Document History</h2>
        <Card className="overflow-hidden border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-orange-50 border-b-2 border-orange-200">
                <tr>
                  <th className="text-left px-6 py-4 font-semibold text-gray-900">Project</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-900">Document Type</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-900">Submitted</th>
                  <th className="text-right px-6 py-4 font-semibold text-gray-900">Amount</th>
                  <th className="text-center px-6 py-4 font-semibold text-gray-900">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">No documents yet</p>
                    </td>
                  </tr>
                ) : (
                  filteredDocuments.map((doc) => (
                    <tr key={doc.id} className="border-b border-gray-100 hover:bg-orange-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{doc.project_name}</td>
                      <td className="px-6 py-4 text-gray-700">
                        {doc.doc_type === 'invoice' && '📄 Invoice'}
                        {doc.doc_type === 'lien_waiver' && '📋 Lien Waiver'}
                        {doc.doc_type === 'rfi' && '❓ RFI'}
                        {doc.doc_type === 'photo' && '📸 Photo'}
                        {doc.doc_type === 'daily_report' && '📊 Daily Report'}
                        {doc.doc_type === 'other' && '📎 Document'}
                      </td>
                      <td className="px-6 py-4 text-gray-600 text-xs">
                        {new Date(doc.submitted_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-gray-900">
                        {doc.amount ? formatCurrency(doc.amount) : '—'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {doc.status === 'approved' && (
                          <Badge className="bg-green-100 text-green-700 border-green-300">✅ Approved</Badge>
                        )}
                        {doc.status === 'pending' && (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-300">⏳ Pending</Badge>
                        )}
                        {doc.status === 'rejected' && (
                          <Badge className="bg-red-100 text-red-700 border-red-300">❌ Rejected</Badge>
                        )}
                        {doc.status === 'paid' && (
                          <Badge className="bg-green-100 text-green-700 border-green-300">💰 Paid</Badge>
                        )}
                        {doc.status === 'draft' && (
                          <Badge className="bg-gray-100 text-gray-700 border-gray-300">📝 Draft</Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Trust Score Slide-out Panel */}
      <AnimatePresence>
        {trustScoreOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setTrustScoreOpen(false)}
            />
            <motion.div
              key="panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-900">Trust Score Breakdown</h2>
                <button
                  onClick={() => setTrustScoreOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <TrustScoreBreakdown
                  score={trustScore}
                  maxScore={MAX_SCORE}
                  trustScoreId={trustScoreId}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating Upload Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          setSelectedProjectId(undefined)
          setUploadModalOpen(true)
        }}
        className="fixed bottom-8 right-8 w-16 h-16 bg-orange-500 hover:bg-orange-600 text-white rounded-full shadow-2xl flex items-center justify-center text-2xl z-40 md:w-auto md:px-6 md:h-auto md:py-3 md:gap-2 md:rounded-full transition-all"
      >
        <Upload className="w-6 h-6" />
        <span className="hidden md:inline font-semibold">Upload</span>
      </motion.button>

      {/* Upload Modal */}
      <VendorUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={(docType, amount) => {
          console.log('Document uploaded:', { docType, amount, projectId: selectedProjectId })
          setUploadModalOpen(false)
          // Refresh documents list
          window.location.reload()
        }}
        projectId={selectedProjectId}
      />
    </div>
  )
}
