import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      // TODO: Call forgot password API
      console.log('Reset password email sent to:', email)
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-primary-600 mb-2">
            ConstructInvoice AI
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Reset your password</h1>
        </div>

        {/* Form */}
        <div className="bg-white rounded-lg shadow-md p-8">
          {submitted ? (
            <div className="space-y-4 text-center">
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                Check your email for a password reset link. It may take a few minutes to arrive.
              </div>
              <p className="text-gray-600">
                Didn't receive an email?{' '}
                <button
                  onClick={() => setSubmitted(false)}
                  className="text-primary-600 hover:text-primary-700 font-medium"
                >
                  Try again
                </button>
              </p>
              <Link to="/login" className="block text-primary-600 hover:text-primary-700 font-medium">
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              <p className="text-gray-600">
                Enter your email address and we'll send you a link to reset your password.
              </p>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email address
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary-600 hover:bg-primary-700"
              >
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </Button>

              <div className="text-center">
                <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
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
