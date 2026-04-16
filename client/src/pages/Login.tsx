import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Building2, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isNetworkError, setIsNetworkError] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setError('')
    setIsNetworkError(false)
    setIsLoading(true)

    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed'
      // Detect network/server-unreachable errors vs credential errors
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
          <h1 className="text-2xl font-bold text-white">Sign in to your account</h1>
          <p className="mt-2 text-sm text-gray-400">Welcome back. Enter your credentials to continue.</p>
        </div>

        {/* Form card */}
        <form
          onSubmit={handleSubmit}
          className="bg-[#0d1320] border border-white/8 rounded-2xl shadow-2xl p-8 space-y-5"
        >
          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm">{error}</p>
                {isNetworkError && (
                  <div className="mt-2 flex items-center gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleSubmit()}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Try again
                    </button>
                    <Link
                      to="/status"
                      className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Check server status
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Email */}
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

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-3 pr-11 bg-[#111827] border border-white/10 rounded-xl text-white placeholder-gray-500 text-sm
                  focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Forgot Password */}
          <div className="text-right">
            <Link
              to="/forgot-password"
              className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Forgot password?
            </Link>
          </div>

          {/* Sign In Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500
              text-white font-semibold text-sm rounded-xl transition-all shadow-lg shadow-emerald-500/20
              disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/8" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-[#0d1320] px-3 text-gray-500">or</span>
            </div>
          </div>

          {/* Google OAuth */}
          <button
            type="button"
            disabled={isLoading}
            onClick={() => { window.location.href = '/api/auth/google' }}
            className="w-full py-3 px-4 bg-transparent border border-white/10 hover:border-white/20 hover:bg-white/5
              text-white text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2
              disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>
        </form>

        {/* Sign Up Link */}
        <div className="text-center mt-6">
          <p className="text-gray-500 text-sm">
            Don't have an account?{' '}
            <Link to="/register" className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
