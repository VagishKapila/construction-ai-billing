/**
 * OnboardingFlow — Two-step new user onboarding experience
 *
 * Step 1: Company Setup — captures company name, phone, license #, logo
 * Step 2: Meet ARIA — animated showcase of ARIA's AI features
 *
 * On completion: calls POST /api/onboarding/complete → redirect to /dashboard
 * Guard: if user already completed onboarding, redirect to /dashboard immediately
 */

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useSettings } from '@/hooks/useSettings'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DollarSign,
  Zap,
  FileText,
  Search,
  TrendingUp,
  ArrowRight,
  Upload,
  X,
  Building2,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StepOneForm {
  companyName: string
  contactPhone: string
  licenseNumber: string
}

// ---------------------------------------------------------------------------
// Step 1: Company Setup
// ---------------------------------------------------------------------------

interface StepOneProps {
  userName: string
  onContinue: () => void
}

function StepOne({ userName, onContinue }: StepOneProps) {
  const { saveSettings, uploadLogo } = useSettings()
  const [form, setForm] = useState<StepOneForm>({
    companyName: '',
    contactPhone: '',
    licenseNumber: '',
  })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file || !file.type.startsWith('image/')) return
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.companyName.trim()) {
      setError('Company name is required')
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveSettings({
        company_name: form.companyName.trim(),
        contact_phone: form.contactPhone.trim() || null,
        license_number: form.licenseNumber.trim() || null,
        notifications_pay_app: true,
        notifications_payment: true,
        notifications_overdue: true,
        notifications_lien: true,
      } as Parameters<typeof saveSettings>[0])

      if (logoFile) {
        await uploadLogo(logoFile)
      }

      onContinue()
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Extract first name for greeting
  const firstName = userName.split(' ')[0] || 'there'

  return (
    <div className="w-full max-w-lg mx-auto">
      {/* Progress */}
      <div className="flex items-center gap-3 mb-8">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">1</span>
          </div>
          <span className="text-sm font-semibold text-indigo-600">Company Setup</span>
        </div>
        <div className="flex-1 h-px bg-gray-200" />
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
            <span className="text-gray-400 text-xs font-bold">2</span>
          </div>
          <span className="text-sm text-gray-400">Meet ARIA</span>
        </div>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Hey {firstName}! Set up your workspace
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            This auto-fills all future projects — takes 30 seconds.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Company Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Company name <span className="text-red-500">*</span>
            </label>
            <Input
              autoFocus
              autoComplete="organization"
              placeholder="ABC General Contractors"
              value={form.companyName}
              onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
              required
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Business phone
            </label>
            <Input
              type="tel"
              autoComplete="tel"
              placeholder="(555) 123-4567"
              value={form.contactPhone}
              onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))}
            />
          </div>

          {/* License Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Contractor license #{' '}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <Input
              placeholder="CSLB #1234567"
              value={form.licenseNumber}
              onChange={(e) => setForm((p) => ({ ...p, licenseNumber: e.target.value }))}
            />
          </div>

          {/* Logo Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Company logo{' '}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>

            {logoPreview ? (
              <div className="relative inline-block">
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="h-20 w-auto max-w-[200px] object-contain rounded-lg border border-gray-200 p-2"
                />
                <button
                  type="button"
                  onClick={() => {
                    setLogoPreview(null)
                    setLogoFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ) : (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-xl border-2 border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all p-8 flex flex-col items-center gap-2 text-center"
              >
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Upload className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Drag & drop or click to upload</p>
                  <p className="text-xs text-gray-400 mt-0.5">PNG, JPG, SVG — shows on every invoice PDF</p>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/svg+xml"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* CTA */}
          <Button
            type="submit"
            disabled={saving || !form.companyName.trim()}
            className="w-full h-11 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white rounded-xl font-semibold gap-2 mt-2"
          >
            {saving ? 'Saving...' : 'Continue →'}
          </Button>

          <button
            type="button"
            onClick={onContinue}
            className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Skip for now
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2: Meet ARIA
// ---------------------------------------------------------------------------

const ARIA_FEATURES = [
  {
    icon: DollarSign,
    text: 'Chases overdue invoices before you have to ask',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    icon: Zap,
    text: 'Tells you when to act while crew is still on site',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  {
    icon: FileText,
    text: 'Generates lien notices the day a California project starts',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    icon: Search,
    text: 'Catches change orders you forgot to bill',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
  {
    icon: TrendingUp,
    text: 'Forecasts your cash 30 days ahead',
    color: 'text-teal-600',
    bg: 'bg-teal-50',
  },
]

interface StepTwoProps {
  onComplete: () => void
  completing: boolean
}

function StepTwo({ onComplete, completing }: StepTwoProps) {
  const [visibleCount, setVisibleCount] = useState(0)
  const [showTagline, setShowTagline] = useState(false)

  // Stagger items in at 600ms each
  useEffect(() => {
    if (visibleCount < ARIA_FEATURES.length) {
      const timer = setTimeout(() => {
        setVisibleCount((c) => c + 1)
      }, 600)
      return () => clearTimeout(timer)
    } else {
      // All shown — wait 1s then show tagline
      const timer = setTimeout(() => setShowTagline(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [visibleCount])

  return (
    <div className="w-full max-w-lg mx-auto">
      {/* Progress */}
      <div className="flex items-center gap-3 mb-8">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
            <span className="text-indigo-400 text-xs font-bold">✓</span>
          </div>
          <span className="text-sm text-indigo-400">Company Setup</span>
        </div>
        <div className="flex-1 h-px bg-teal-400" />
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center">
            <span className="text-white text-xs font-bold">2</span>
          </div>
          <span className="text-sm font-semibold text-teal-600">Meet ARIA</span>
        </div>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
        {/* Header — ARIA personal AI assistant */}
        <div className="mb-8 text-center">
          <div className="relative inline-block mb-4">
            {/* ARIA avatar — professional AI assistant */}
            <div className="w-20 h-20 rounded-full mx-auto overflow-hidden border-4 border-teal-100 shadow-xl shadow-teal-100">
              <img
                src="https://api.dicebear.com/9.x/personas/svg?seed=ARIA&backgroundColor=b6e3f4&hair=shortCurls&eyes=open&nose=mediumRound&mouth=smile&skinColor=ae9a7b&hairColor=2c1b18&clothingColor=059669"
                alt="ARIA — Your AI billing assistant"
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fallback to gradient avatar if image fails
                  const parent = (e.target as HTMLImageElement).parentElement
                  if (parent) {
                    parent.innerHTML = '<div class="w-full h-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center"><span class="text-white text-3xl font-bold">A</span></div>'
                  }
                }}
              />
            </div>
            {/* Online indicator */}
            <span className="absolute bottom-1 right-1 w-4 h-4 bg-green-400 border-2 border-white rounded-full" />
          </div>
          <div className="inline-flex items-center gap-1.5 bg-teal-50 border border-teal-100 rounded-full px-3 py-1 mb-3">
            <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-pulse" />
            <span className="text-xs font-semibold text-teal-700 uppercase tracking-wide">Your AI Billing Assistant</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Meet ARIA</h1>
          <p className="text-sm text-gray-500 mt-1.5">
            While you're on the job, ARIA helps you get paid faster
          </p>
        </div>

        {/* Feature list */}
        <div className="space-y-3 mb-8">
          {ARIA_FEATURES.map((feature, i) => {
            const Icon = feature.icon
            const isVisible = i < visibleCount
            return (
              <div
                key={i}
                style={{
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible ? 'translateY(0)' : 'translateY(12px)',
                  transition: 'opacity 0.4s ease, transform 0.4s ease',
                }}
                className="flex items-center gap-3 rounded-xl border border-gray-100 p-3.5"
              >
                <div
                  className={`w-9 h-9 rounded-lg ${feature.bg} flex items-center justify-center shrink-0`}
                >
                  <Icon className={`w-4.5 h-4.5 ${feature.color}`} />
                </div>
                <p className="text-sm font-medium text-gray-800">{feature.text}</p>
              </div>
            )
          })}
        </div>

        {/* Tagline + CTA */}
        <div
          style={{
            opacity: showTagline ? 1 : 0,
            transform: showTagline ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.5s ease, transform 0.5s ease',
          }}
        >
          <p className="text-center text-lg font-bold text-gray-900 mb-5">
            You build it. ARIA gets you paid.
          </p>
          <Button
            onClick={onComplete}
            disabled={completing}
            className="w-full h-11 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-500 text-white rounded-xl font-semibold gap-2 shadow-sm shadow-teal-200"
          >
            {completing ? 'Setting up...' : 'Take me to my dashboard →'}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main OnboardingFlow
// ---------------------------------------------------------------------------

export function OnboardingFlow() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2>(1)
  const [completing, setCompleting] = useState(false)

  // Guard: already onboarded → go to dashboard
  useEffect(() => {
    if (user?.has_completed_onboarding) {
      navigate('/dashboard', { replace: true })
    }
  }, [user, navigate])

  const handleComplete = async () => {
    setCompleting(true)
    try {
      await api.post('/api/onboarding/complete')
      await refreshUser()
      // Small delay so refreshUser can propagate before navigation
      navigate('/dashboard', { replace: true })
    } catch {
      // Best-effort — navigate anyway
      navigate('/dashboard', { replace: true })
    } finally {
      setCompleting(false)
    }
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 flex items-center justify-center px-4 py-12">
      {/* Subtle background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-indigo-100/40 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-teal-100/40 blur-3xl" />
      </div>

      {/* Logo */}
      <div className="absolute top-6 left-8 flex items-center gap-2">
        <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
          <Building2 className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-gray-700">ConstructInvoice AI</span>
      </div>

      <div className="relative w-full">
        {step === 1 ? (
          <StepOne userName={user.name || ''} onContinue={() => setStep(2)} />
        ) : (
          <StepTwo onComplete={handleComplete} completing={completing} />
        )}
      </div>
    </div>
  )
}
