import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import * as authApi from '@/api/auth'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [isNetworkError, setIsNetworkError] = useState(false)

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setError('')
    setIsNetworkError(false)
    setIsLoading(true)

    try {
      const response = await authApi.forgotPassword(email)
      if (response.error) {
        setError(response.error)
      } else {
        setSubmitted(true)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send reset email'
      const isNetwork =
        msg.toLowerCase().includes('unable to reach') ||
        msg.toLowerCase().includes('failed to fetch') ||
        msg.toLowerCase().includes('network') ||
        msg.toLowerCase().includes('server')
      setIsNetworkError(isNetwork)
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0f1a] px-4">
      {/* Ambient glow */}
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
          <h1 className="text-2xl font-bold text-white">Reset your password</h1>
        </div>

        <div className="bg-[#0d1320] border border-white/8 rounded-2xl shadow-2xl p-8">
          {submitted ? (
            <div className="space-y-5 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              </div>
              <div>
                <p className="text-white font-semibold mb-1">Check your email</p>
                <p className="text-sm text-gray-400">
                  We sent a password reset link to <span className="text-white">{email}</span>.
                  It may take a few minutes to arrive.
                </p>
              </div>
              <p className="text-sm text-gray-500">
                Didn't receive it?{' '}
                <button
                  onClick={() => setSubmitted(false)}
                  className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                >
                  Try again
                </button>
              </p>
              <Link
                to="/login"
                className="block text-sm text-gray-400 hover:text-white transition-colors"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{error}</p>
                    {isNetworkError && (
                      <button
                        type="button"
                        onClick={() => handleSubmit()}
                        disabled={isLoading}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Try again
                      </button>
                    )}
                  </div>
                </div>
              )}

              <p className="text-sm text-gray-400">
                Enter your email and we'll send you a link to reset your password.
              </p>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-4 py-3 bg-[#111827] border border-white/10 rounded-xl text-white placeholder-gray-500 text-sm
                    focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500
                  text-white font-semibold text-sm rounded-xl transition-all shadow-lg shadow-emerald-500/20
                  disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <div className="text-center">
                <Link
                  to="/login"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
