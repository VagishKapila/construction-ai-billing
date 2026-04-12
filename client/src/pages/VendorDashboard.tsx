import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Upload,
  Building2,
  FileText,
} from 'lucide-react'
import type { Project } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/formatters'
import TrustScoreBadge from '@/features/trust/TrustScoreBadge'

export function VendorDashboard() {
  const [myProjects, setMyProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Fetch projects where current user is a vendor/trade
    const fetchMyProjects = async () => {
      try {
        const response = await fetch('/api/hub/my-projects', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`,
          },
        })
        if (response.ok) {
          const data = await response.json()
          setMyProjects(data.data || [])
        }
      } catch (err) {
        console.error('Failed to fetch vendor projects:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchMyProjects()
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-12 bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header Strip */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl p-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Vendor Portal</h1>
            <p className="text-orange-100 mt-1">Manage your projects and documents</p>
          </div>
          <Badge className="bg-white/20 text-white border-white/30">
            🔧 Vendor
          </Badge>
        </div>
      </motion.div>

      {/* My Projects */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">My Projects</h2>
          <span className="text-sm text-gray-500">{myProjects.length} projects</span>
        </div>

        {myProjects.length === 0 ? (
          <div className="text-center py-12 rounded-lg bg-gray-50 border border-gray-200">
            <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-sm text-gray-600">No projects assigned yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myProjects.map((project) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <Card className="p-5 border-l-4 border-l-orange-500 hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{project.address || project.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">GC: {project.contractor || 'N/A'}</p>
                    </div>
                    <Badge className="bg-orange-100 text-orange-700 border-orange-200">
                      Active
                    </Badge>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3 mb-4">
                    <p className="text-xs text-orange-600 font-medium">Contract Value</p>
                    <p className="text-lg font-mono text-orange-900">
                      {formatCurrency(project.original_contract || 0)}
                    </p>
                  </div>
                  <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Document
                  </Button>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* My Documents */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-4">My Documents</h2>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-gray-900">Project</th>
                  <th className="text-left px-6 py-3 font-semibold text-gray-900">Doc Type</th>
                  <th className="text-left px-6 py-3 font-semibold text-gray-900">Date</th>
                  <th className="text-left px-6 py-3 font-semibold text-gray-900">Amount</th>
                  <th className="text-left px-6 py-3 font-semibold text-gray-900">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-200 hover:bg-gray-50">
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm">No documents uploaded yet</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Trust Score */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Your Trust Score</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Overall rating</p>
            <TrustScoreBadge score={500} size="lg" />
          </div>
          <div className="text-right">
            <p className="text-2xl font-mono font-bold text-gray-900">500<span className="text-gray-500">/763</span></p>
            <p className="text-xs text-gray-500 mt-1">Quality + Reliability</p>
          </div>
        </div>
      </div>
    </div>
  )
}
