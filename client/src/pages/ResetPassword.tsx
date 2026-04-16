import { useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, Building2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import * as authApi from '@/api/auth'

export function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const token = searchParams.get('reset') || searchParams.get('token') || ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setIsLoading(true)
    try {
      const response = await authApi.resetPassword(token, password)
      if (response.error) {
        setError(response.error)
      } else {
        setSuccess(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setIsLoading(false)
    }
  }

  const inputClass =
    'w-full px-4 py-3 bg-[#111827] border border-white/10 rounded-xl text-white placeholder-gray-500 text-sm ' +
    'focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition-all'

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
          <h1 className="text-2xl font-bold text-white">Create new password</h1>
        </div>

        <div className="bg-[#0d1320] border border-white/8 rounded-2xl shadow-2xl p-8">
          {success ? (
            <div className="space-y-5 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              </div>
              <div>
                <p className="text-white font-semibold mb-1">Password reset</p>
                <p className="text-sm text-gray-400">You can now sign in with your new password.</p>
              </div>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500
                  text-white font-semibold text-sm rounded-xl transition-all shadow-lg shadow-emerald-500/20"
              >
                Go to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {!token && (
                <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 px-4 py-3 rounded-xl">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p className="text-sm">Invalid reset link. Please request a new one.</p>
                </div>
              )}

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">New Password</label>
                <div className="relative">
                  <input id="password" type={showPassword ? 'text' : 'password'} value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" required
                    className={`${inputClass} pr-11`} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                    tabIndex={-1} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">Confirm Password</label>
                <div className="relative">
                  <input id="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required
                    className={`${inputClass} pr-11`} />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                    tabIndex={-1} aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={isLoading || !token}
                className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500
                  text-white font-semibold text-sm rounded-xl transition-all shadow-lg shadow-emerald-500/20
                  disabled:opacity-60 disabled:cursor-not-allowed">
                {isLoading ? 'Resetting...' : 'Reset Password'}
              </button>

              <div className="text-center">
                <Link to="/login" className="text-sm text-gray-400 hover:text-white transition-colors">
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
