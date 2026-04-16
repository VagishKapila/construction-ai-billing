/**
 * /status — Server status page
 * Shows live health check result from /api/health endpoint.
 * Linked from auth error messages so users can verify the server is up.
 */

import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Building2, CheckCircle2, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react'

interface HealthData {
  status: 'healthy' | 'degraded'
  timestamp: string
  version: string
  database: 'connected' | 'error'
}

export function Status() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const check = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/health')
      if (!res.ok && res.status !== 503) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as HealthData
      setHealth(data)
    } catch (err) {
      setError(
        err instanceof TypeError
          ? 'Server is unreachable. The service may be down.'
          : (err instanceof Error ? err.message : 'Unknown error')
      )
      setHealth(null)
    } finally {
      setLoading(false)
      setLastChecked(new Date())
    }
  }, [])

  useEffect(() => {
    check()
    // Auto-refresh every 30 seconds
    const interval = setInterval(check, 30_000)
    return () => clearInterval(interval)
  }, [check])

  const isHealthy = health?.status === 'healthy'
  const isDown = !!error

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0f1a] px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">ConstructInvoice AI</span>
          </div>
          <h1 className="text-2xl font-bold text-white">System Status</h1>
        </div>

        <div className="bg-[#0d1320] border border-white/8 rounded-2xl shadow-2xl p-8 space-y-6">
          {/* Status indicator */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {loading ? (
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              ) : isDown ? (
                <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
              ) : isHealthy ? (
                <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] animate-pulse" />
              ) : (
                <div className="w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b]" />
              )}
              <span className="text-white font-semibold">
                {loading ? 'Checking...' : isDown ? 'Service Unavailable' : isHealthy ? 'All Systems Operational' : 'Degraded Performance'}
              </span>
            </div>
            <button
              onClick={check}
              disabled={loading}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Details */}
          {!loading && (
            <div className="space-y-3">
              {error ? (
                <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p className="text-sm">{error}</p>
                </div>
              ) : health ? (
                <>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-gray-400">API Server</span>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm text-emerald-400">Online</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-gray-400">Database</span>
                    <div className="flex items-center gap-1.5">
                      {health.database === 'connected' ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span className="text-sm text-emerald-400">Connected</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          <span className="text-sm text-amber-400">Error</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-400">Version</span>
                    <span className="text-sm text-gray-300">{health.version}</span>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {/* Last checked */}
          {lastChecked && (
            <p className="text-xs text-gray-600 text-center">
              Last checked: {lastChecked.toLocaleTimeString()} · Auto-refreshes every 30s
            </p>
          )}
        </div>

        <div className="text-center mt-6 space-y-2">
          <Link to="/login" className="block text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
            Back to Sign In
          </Link>
          {(isDown || !isHealthy) && (
            <p className="text-xs text-gray-600">
              If this persists, contact{' '}
              <a href="mailto:vaakapila@gmail.com" className="text-gray-400 hover:text-white transition-colors">
                support
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
