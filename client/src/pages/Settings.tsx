import { useState, useCallback, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useSettings } from '@/hooks/useSettings'
import { useTrial } from '@/hooks/useTrial'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import * as paymentsApi from '@/api/payments'
import { QBConnectionCard, QBSyncLog } from '@/components/quickbooks'
import { PAYMENT_TERMS, PRO_PRICE_MONTHLY, SUPPORT_EMAIL } from '@/lib/constants'
import {
  Upload,
  Check,
  Building2,
  User,
  CreditCard,
  Bell,
  Shield,
  ExternalLink,
  Unlink,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react'

interface ProfileFormState {
  companyName: string
  companyAddress: string
  companyCity: string
  companyState: string
  companyZip: string
  licenseNumber: string
  defaultPaymentTerms: string
  defaultRetainage: string
}

interface ContactFormState {
  contactName: string
  contactPhone: string
  contactEmail: string
}

interface NotificationFormState {
  emailOnPaymentReceived: boolean
  emailWeeklySummary: boolean
  emailOverdueReminder: boolean
  reminderEmail: string
}

type ToastType = 'success' | 'error'

interface Toast {
  type: ToastType
  message: string
}

export function Settings() {
  const { user } = useAuth()
  const { settings, saveSettings, uploadLogo, uploadSignature } = useSettings()
  const { daysRemaining, isExpired, isPro, trialEndDate } = useTrial()

  // Profile form state
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    companyName: '',
    companyAddress: '',
    companyCity: '',
    companyState: '',
    companyZip: '',
    licenseNumber: '',
    defaultPaymentTerms: 'Due on receipt',
    defaultRetainage: '10',
  })
  const [profileSaving, setProfileSaving] = useState(false)

  // Contact form state
  const [contactForm, setContactForm] = useState<ContactFormState>({
    contactName: '',
    contactPhone: '',
    contactEmail: '',
  })
  const [contactSaving, setContactSaving] = useState(false)

  // Logo & signature state
  const [logoUploading, setLogoUploading] = useState(false)
  const [signatureUploading, setSignatureUploading] = useState(false)
  const [logoBlobUrl, setLogoBlobUrl] = useState<string | null>(null)
  const [signatureBlobUrl, setSignatureBlobUrl] = useState<string | null>(null)
  const logoUrlRef = useRef<string | null>(null)
  const sigUrlRef = useRef<string | null>(null)

  // Stripe state
  const [stripeAccount, setStripeAccount] = useState<any>(null)
  const [stripeLoading, setStripeLoading] = useState(false)
  const [stripeDisconnecting, setStripeDisconnecting] = useState(false)
  const [creditCardEnabled, setCreditCardEnabled] = useState(false)

  // Notification form state
  const [notificationForm, setNotificationForm] = useState<NotificationFormState>({
    emailOnPaymentReceived: true,
    emailWeeklySummary: true,
    emailOverdueReminder: false,
    reminderEmail: '',
  })
  const [notificationSaving, setNotificationSaving] = useState(false)

  // Toast notifications
  const [toast, setToast] = useState<Toast | null>(null)

  // Initialize forms from settings
  useEffect(() => {
    if (settings) {
      setProfileForm({
        companyName: settings.company_name || '',
        companyAddress: (settings as any).company_address || '',
        companyCity: (settings as any).company_city || '',
        companyState: (settings as any).company_state || '',
        companyZip: (settings as any).company_zip || '',
        licenseNumber: (settings as any).license_number || '',
        defaultPaymentTerms: settings.default_payment_terms || 'Due on receipt',
        defaultRetainage: String(settings.default_retainage || 10),
      })
      setContactForm({
        contactName: settings.contact_name || '',
        contactPhone: settings.contact_phone || '',
        contactEmail: settings.contact_email || '',
      })
      setCreditCardEnabled(settings.credit_card_enabled || false)
      setNotificationForm((prev) => ({
        ...prev,
        reminderEmail: settings.contact_email || user?.email || '',
      }))
    }
  }, [settings, user?.email])

  // Fetch logo and signature images with auth headers (img src can't send JWT)
  useEffect(() => {
    const token = localStorage.getItem('ci_token')
    if (!token) return

    // Fetch logo
    if (settings?.logo_filename) {
      fetch('/api/settings/logo', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.blob() : null))
        .then((blob) => {
          if (blob) {
            if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current)
            const url = URL.createObjectURL(blob)
            logoUrlRef.current = url
            setLogoBlobUrl(url)
          }
        })
        .catch(() => {})
    } else {
      setLogoBlobUrl(null)
    }

    // Fetch signature
    if (settings?.signature_filename) {
      fetch('/api/settings/signature', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.blob() : null))
        .then((blob) => {
          if (blob) {
            if (sigUrlRef.current) URL.revokeObjectURL(sigUrlRef.current)
            const url = URL.createObjectURL(blob)
            sigUrlRef.current = url
            setSignatureBlobUrl(url)
          }
        })
        .catch(() => {})
    } else {
      setSignatureBlobUrl(null)
    }

    return () => {
      if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current)
      if (sigUrlRef.current) URL.revokeObjectURL(sigUrlRef.current)
    }
  }, [settings?.logo_filename, settings?.signature_filename])

  // Load Stripe account status; also handle return from Stripe onboarding
  useEffect(() => {
    const loadStripeStatus = async () => {
      try {
        setStripeLoading(true)
        const response = await paymentsApi.getStripeAccountStatus()
        if (response.data) {
          setStripeAccount(response.data)
          // If just returned from Stripe onboarding, show appropriate toast
          const params = new URLSearchParams(window.location.search)
          const setup = params.get('payments_setup')
          if (setup === 'complete') {
            const data = response.data as any
            if (data?.charges_enabled) {
              setToast({ type: 'success', message: '🎉 Stripe connected! You can now accept invoice payments.' })
              setTimeout(() => setToast(null), 4000)
            } else {
              setToast({ type: 'error', message: 'Stripe onboarding incomplete — please finish setup.' })
              setTimeout(() => setToast(null), 4000)
            }
            // Clean the URL param
            window.history.replaceState({}, '', window.location.pathname)
          } else if (setup === 'refresh') {
            setToast({ type: 'error', message: 'Stripe onboarding link expired. Click "Connect Stripe" to try again.' })
            setTimeout(() => setToast(null), 4000)
            window.history.replaceState({}, '', window.location.pathname)
          }
        }
      } catch (err) {
        console.error('Failed to load Stripe account status:', err)
      } finally {
        setStripeLoading(false)
      }
    }
    loadStripeStatus()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showToast = useCallback((type: ToastType, message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }, [])

  // Profile form handlers
  const handleProfileChange = (field: keyof ProfileFormState, value: string) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleProfileSave = async () => {
    setProfileSaving(true)
    try {
      const result = await saveSettings({
        company_name: profileForm.companyName,
        company_address: profileForm.companyAddress || null,
        company_city: profileForm.companyCity || null,
        company_state: profileForm.companyState || null,
        company_zip: profileForm.companyZip || null,
        license_number: profileForm.licenseNumber || null,
        default_payment_terms: profileForm.defaultPaymentTerms,
        default_retainage: parseFloat(profileForm.defaultRetainage) || 0,
        // Always include contact fields to prevent them being cleared
        contact_name: settings?.contact_name || contactForm.contactName,
        contact_phone: settings?.contact_phone || contactForm.contactPhone,
        contact_email: settings?.contact_email || contactForm.contactEmail,
      } as any)
      if (result) {
        showToast('success', 'Company profile updated')
      } else {
        showToast('error', 'Failed to save company profile')
      }
    } catch (err) {
      showToast('error', 'Failed to save company profile')
    } finally {
      setProfileSaving(false)
    }
  }

  // Contact form handlers
  const handleContactChange = (field: keyof ContactFormState, value: string) => {
    setContactForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleContactSave = async () => {
    setContactSaving(true)
    try {
      const result = await saveSettings({
        contact_name: contactForm.contactName,
        contact_phone: contactForm.contactPhone,
        contact_email: contactForm.contactEmail,
        // Always include company profile fields to prevent them being cleared
        company_name: settings?.company_name || profileForm.companyName,
        default_payment_terms: settings?.default_payment_terms || profileForm.defaultPaymentTerms,
        default_retainage: (settings?.default_retainage ?? null) ?? (parseFloat(profileForm.defaultRetainage) || 0),
      })
      if (result) {
        showToast('success', 'Contact information updated')
      } else {
        showToast('error', 'Failed to save contact information')
      }
    } catch (err) {
      showToast('error', 'Failed to save contact information')
    } finally {
      setContactSaving(false)
    }
  }

  // Logo upload handler
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLogoUploading(true)
    try {
      const result = await uploadLogo(file)
      if (result) {
        showToast('success', 'Logo uploaded successfully')
      } else {
        showToast('error', 'Failed to upload logo')
      }
    } catch (err) {
      showToast('error', 'Failed to upload logo')
    } finally {
      setLogoUploading(false)
    }
  }

  // Signature upload handler
  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSignatureUploading(true)
    try {
      const result = await uploadSignature(file)
      if (result) {
        showToast('success', 'Signature uploaded successfully')
      } else {
        showToast('error', 'Failed to upload signature')
      }
    } catch (err) {
      showToast('error', 'Failed to upload signature')
    } finally {
      setSignatureUploading(false)
    }
  }

  // Stripe handlers
  const handleConnectStripe = async () => {
    setStripeLoading(true)
    try {
      const response = await paymentsApi.startStripeConnect()
      if (response.data?.url) {
        window.open(response.data.url, '_blank')
      } else {
        showToast('error', 'Failed to start Stripe onboarding')
      }
    } catch (err) {
      showToast('error', 'Failed to start Stripe onboarding')
    } finally {
      setStripeLoading(false)
    }
  }

  const handleOpenStripeDashboard = async () => {
    setStripeLoading(true)
    try {
      const response = await paymentsApi.getStripeDashboardLink()
      if (response.data?.url) {
        window.open(response.data.url, '_blank')
      } else {
        showToast('error', 'Failed to open Stripe dashboard')
      }
    } catch (err) {
      showToast('error', 'Failed to open Stripe dashboard')
    } finally {
      setStripeLoading(false)
    }
  }

  const handleDisconnectStripe = async () => {
    if (!window.confirm('Disconnect your Stripe account? You will no longer be able to accept payments until you reconnect.')) return
    setStripeDisconnecting(true)
    try {
      await paymentsApi.disconnectStripe()
      setStripeAccount(null)
      showToast('success', 'Stripe account disconnected')
    } catch (err) {
      showToast('error', 'Failed to disconnect Stripe')
    } finally {
      setStripeDisconnecting(false)
    }
  }

  // Notification form handlers
  const handleNotificationChange = (
    field: keyof NotificationFormState,
    value: boolean | string,
  ) => {
    setNotificationForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleNotificationSave = async () => {
    setNotificationSaving(true)
    try {
      const result = await saveSettings({
        reminder_7before: notificationForm.emailOnPaymentReceived,
        reminder_due: notificationForm.emailWeeklySummary,
        reminder_7after: notificationForm.emailOverdueReminder,
        reminder_email: notificationForm.reminderEmail || undefined,
        // Always include all other settings to prevent them being cleared
        company_name: settings?.company_name || profileForm.companyName,
        default_payment_terms: settings?.default_payment_terms || profileForm.defaultPaymentTerms,
        default_retainage: (settings?.default_retainage ?? null) ?? (parseFloat(profileForm.defaultRetainage) || 0),
        contact_name: settings?.contact_name || contactForm.contactName,
        contact_phone: settings?.contact_phone || contactForm.contactPhone,
        contact_email: settings?.contact_email || contactForm.contactEmail,
      } as any)
      if (result) {
        showToast('success', 'Notification preferences saved')
      } else {
        showToast('error', 'Failed to save notification preferences')
      }
    } catch (err) {
      showToast('error', 'Failed to save notification preferences')
    } finally {
      setNotificationSaving(false)
    }
  }

  const handleChangePassword = () => {
    window.location.href = '/forgot-password'
  }

  const handleDeleteAccount = () => {
    if (
      confirm(
        'Are you sure you want to delete your account? This action cannot be undone.',
      )
    ) {
      showToast('error', 'Account deletion not yet implemented')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top">
          <div
            className={`rounded-lg p-4 ${
              toast.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            <p className="text-sm font-medium">{toast.message}</p>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Page Header */}
        <PageHeader
          title="Settings"
          description="Configure your account and company information"
        />

        {/* Section 1: Company Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary-600" />
              Company Profile
            </CardTitle>
            <CardDescription>
              Your company information used across projects
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Company Name */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  autoComplete="organization"
                  value={profileForm.companyName}
                  onChange={(e) =>
                    handleProfileChange('companyName', e.target.value)
                  }
                  placeholder="ABC General Contractors LLC"
                />
              </div>

              {/* Street Address */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Street Address
                </label>
                <Input
                  type="text"
                  autoComplete="street-address"
                  value={profileForm.companyAddress}
                  onChange={(e) => handleProfileChange('companyAddress', e.target.value)}
                  placeholder="123 Main Street"
                />
              </div>

              {/* City / State / ZIP */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">City</label>
                  <Input
                    type="text"
                    autoComplete="address-level2"
                    value={profileForm.companyCity}
                    onChange={(e) => handleProfileChange('companyCity', e.target.value)}
                    placeholder="Los Angeles"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">State</label>
                  <Input
                    type="text"
                    autoComplete="address-level1"
                    maxLength={2}
                    value={profileForm.companyState}
                    onChange={(e) => handleProfileChange('companyState', e.target.value.toUpperCase())}
                    placeholder="CA"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">ZIP</label>
                  <Input
                    type="text"
                    autoComplete="postal-code"
                    value={profileForm.companyZip}
                    onChange={(e) => handleProfileChange('companyZip', e.target.value)}
                    placeholder="90210"
                  />
                </div>
              </div>

              {/* License Number */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Contractor License # <span className="text-gray-400 text-xs font-normal">(optional)</span>
                </label>
                <Input
                  type="text"
                  value={profileForm.licenseNumber}
                  onChange={(e) => handleProfileChange('licenseNumber', e.target.value)}
                  placeholder="CSLB #123456"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Default Payment Terms
                </label>
                <select
                  value={profileForm.defaultPaymentTerms}
                  onChange={(e) =>
                    handleProfileChange('defaultPaymentTerms', e.target.value)
                  }
                  className="w-full px-3 py-2 rounded-lg border border-border text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-600"
                >
                  {PAYMENT_TERMS.map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Default Retainage %
                </label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={profileForm.defaultRetainage}
                  onChange={(e) =>
                    handleProfileChange('defaultRetainage', e.target.value)
                  }
                  placeholder="10"
                />
              </div>
              <Button
                onClick={handleProfileSave}
                disabled={profileSaving}
                className="bg-primary-600 hover:bg-primary-700 text-white"
              >
                {profileSaving ? 'Saving...' : 'Save Profile'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary-600" />
              Contact Information
            </CardTitle>
            <CardDescription>
              Auto-fills new projects with your contact details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Contact Name
                </label>
                <Input
                  type="text"
                  autoComplete="name"
                  value={contactForm.contactName}
                  onChange={(e) =>
                    handleContactChange('contactName', e.target.value)
                  }
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Contact Phone
                </label>
                <Input
                  type="tel"
                  autoComplete="tel"
                  value={contactForm.contactPhone}
                  onChange={(e) =>
                    handleContactChange('contactPhone', e.target.value)
                  }
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Contact Email
                </label>
                <Input
                  type="email"
                  value={contactForm.contactEmail}
                  onChange={(e) =>
                    handleContactChange('contactEmail', e.target.value)
                  }
                  placeholder="your@email.com"
                />
              </div>
              <Button
                onClick={handleContactSave}
                disabled={contactSaving}
                className="bg-primary-600 hover:bg-primary-700 text-white"
              >
                {contactSaving ? 'Saving...' : 'Save Contact Info'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Logo & Signature */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary-600" />
              Logo & Signature
            </CardTitle>
            <CardDescription>
              Upload files for your G702/G703 documents
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Logo Upload */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-3">
                  Company Logo
                </label>
                {settings?.logo_filename && logoBlobUrl && (
                  <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-border">
                    <img
                      src={logoBlobUrl}
                      alt="Company Logo"
                      className="h-12 object-contain"
                    />
                    <p className="text-xs text-text-muted mt-2">
                      {settings.logo_original_name}
                    </p>
                  </div>
                )}
                <label className="block relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={logoUploading}
                    className="hidden"
                  />
                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary-500 transition-colors cursor-pointer bg-white">
                    <Upload className="w-6 h-6 text-text-muted mx-auto mb-2" />
                    <p className="text-sm font-medium text-text-primary">
                      {logoUploading ? 'Uploading...' : 'Click to upload'}
                    </p>
                    <p className="text-xs text-text-muted mt-1">
                      PNG or JPG (max 100KB)
                    </p>
                  </div>
                </label>
              </div>

              {/* Signature Upload */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-3">
                  Signature
                </label>
                {settings?.signature_filename && signatureBlobUrl && (
                  <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-border">
                    <img
                      src={signatureBlobUrl}
                      alt="Signature"
                      className="h-12 object-contain"
                    />
                    <p className="text-xs text-text-muted mt-2">Signature on file</p>
                  </div>
                )}
                <label className="block relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleSignatureUpload}
                    disabled={signatureUploading}
                    className="hidden"
                  />
                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary-500 transition-colors cursor-pointer bg-white">
                    <Upload className="w-6 h-6 text-text-muted mx-auto mb-2" />
                    <p className="text-sm font-medium text-text-primary">
                      {signatureUploading ? 'Uploading...' : 'Click to upload'}
                    </p>
                    <p className="text-xs text-text-muted mt-1">
                      PNG or JPG (max 100KB)
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Stripe Connect */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary-600" />
              Accept Payments
            </CardTitle>
            <CardDescription>
              Connect Stripe to accept ACH and credit card payments on your invoices
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stripeLoading && !stripeAccount ? (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-50 border border-gray-200">
                <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-text-secondary">Checking Stripe status…</p>
              </div>
            ) : stripeAccount?.connected ? (
              <div className="space-y-4">
                {/* Status row */}
                {stripeAccount.charges_enabled ? (
                  <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-200">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center">
                        <Check className="w-4.5 h-4.5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-green-900">
                          Payments active
                        </p>
                        <p className="text-xs text-green-700 mt-0.5">
                          {stripeAccount.business_name
                            ? `${stripeAccount.business_name} · `
                            : ''}
                          ACH + credit card enabled
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-green-100 text-green-800 border border-green-200">Active</Badge>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-4 bg-amber-50 rounded-xl border border-amber-200">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
                        <AlertTriangle className="w-4.5 h-4.5 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-amber-900">
                          Onboarding incomplete
                        </p>
                        <p className="text-xs text-amber-700 mt-0.5">
                          Finish your Stripe setup to start accepting payments
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-amber-100 text-amber-800 border border-amber-200">Pending</Badge>
                  </div>
                )}

                {/* Payment method toggle */}
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Payment methods</p>
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-primary">ACH bank transfer</span>
                      <Badge className="text-xs bg-blue-50 text-blue-700 border border-blue-100">$25 flat fee</Badge>
                    </div>
                    <input
                      type="checkbox"
                      checked
                      readOnly
                      className="w-4 h-4 rounded accent-primary-600"
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-primary">Credit card</span>
                      <Badge className="text-xs bg-gray-50 text-gray-600 border border-gray-200">3.3% + $0.40</Badge>
                    </div>
                    <input
                      type="checkbox"
                      checked={creditCardEnabled}
                      onChange={(e) => setCreditCardEnabled(e.target.checked)}
                      className="w-4 h-4 rounded accent-primary-600"
                    />
                  </label>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-2">
                  {!stripeAccount.charges_enabled ? (
                    <Button
                      onClick={handleConnectStripe}
                      disabled={stripeLoading}
                      className="flex-1 bg-primary-600 hover:bg-primary-700 text-white gap-2"
                    >
                      Finish Setup
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      onClick={handleOpenStripeDashboard}
                      disabled={stripeLoading}
                      variant="outline"
                      className="flex-1 gap-2"
                    >
                      Manage in Stripe
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    onClick={handleDisconnectStripe}
                    disabled={stripeDisconnecting}
                    variant="outline"
                    className="gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                  >
                    <Unlink className="w-4 h-4" />
                    {stripeDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-orange-50 border border-orange-100">
                  <p className="text-sm text-orange-800 font-medium mb-1">
                    Not connected
                  </p>
                  <p className="text-xs text-orange-700 leading-relaxed">
                    Connect your bank account to receive invoice payments via ACH transfer ($25 flat) or credit card (3.3% + $0.40). Takes about 3 minutes.
                  </p>
                </div>
                <Button
                  onClick={handleConnectStripe}
                  disabled={stripeLoading}
                  className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white gap-2 rounded-xl"
                >
                  <CreditCard className="w-4 h-4" />
                  {stripeLoading ? 'Connecting…' : 'Connect Stripe'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 5: QuickBooks Integration */}
        <QBConnectionCard />
        <QBSyncLog />

        {/* Section 6: Subscription & Billing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary-600" />
              Subscription & Billing
            </CardTitle>
            <CardDescription>Manage your plan and billing information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isPro ? (
                <>
                  <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div>
                      <p className="text-sm font-medium text-blue-900">Pro Plan</p>
                      <p className="text-xs text-blue-700 mt-1">
                        ${PRO_PRICE_MONTHLY}/month
                      </p>
                    </div>
                    <Badge className="bg-blue-100 text-blue-800">Active</Badge>
                  </div>
                  <Button variant="outline" className="w-full">
                    Manage Subscription
                  </Button>
                </>
              ) : isExpired ? (
                <>
                  <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <div>
                      <p className="text-sm font-medium text-amber-900">Trial Ended</p>
                      <p className="text-xs text-amber-700 mt-1">Upgrade to continue</p>
                    </div>
                    <Badge className="bg-amber-100 text-amber-800">Expired</Badge>
                  </div>
                  <Button className="w-full bg-primary-600 hover:bg-primary-700 text-white">
                    Upgrade to Pro
                  </Button>
                  <p className="text-xs text-text-muted text-center">
                    Can't afford it?{' '}
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary-600 hover:underline">
                      Contact us
                    </a>
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                    <div>
                      <p className="text-sm font-medium text-indigo-900">Free Trial</p>
                      <p className="text-xs text-indigo-700 mt-1">
                        {daysRemaining !== null
                          ? `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`
                          : 'Trial active'}
                      </p>
                      {trialEndDate && (
                        <p className="text-xs text-indigo-500 mt-0.5">
                          Ends {new Date(trialEndDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                    <Badge className="bg-indigo-100 text-indigo-800">Active</Badge>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full transition-all"
                      style={{
                        width: `${Math.max(0, ((90 - (daysRemaining || 0)) / 90) * 100)}%`,
                      }}
                    />
                  </div>
                  <Button className="w-full bg-primary-600 hover:bg-primary-700 text-white">
                    Upgrade to Pro
                  </Button>
                  <p className="text-xs text-text-muted text-center">
                    Can't afford it?{' '}
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary-600 hover:underline">
                      Contact us
                    </a>
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Section 6: Notifications & Reminders */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary-600" />
              Notifications & Reminders
            </CardTitle>
            <CardDescription>Configure when we send you emails</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-3">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">All notifications default ON — uncheck to opt out</p>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notificationForm.emailOnPaymentReceived}
                    onChange={(e) =>
                      handleNotificationChange('emailOnPaymentReceived', e.target.checked)
                    }
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm text-text-primary">
                    Pay application activity (new pay apps, status changes)
                  </span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notificationForm.emailWeeklySummary}
                    onChange={(e) =>
                      handleNotificationChange('emailWeeklySummary', e.target.checked)
                    }
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm text-text-primary">
                    Payment received (ACH confirmations, card payments)
                  </span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notificationForm.emailOverdueReminder}
                    onChange={(e) =>
                      handleNotificationChange('emailOverdueReminder', e.target.checked)
                    }
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm text-text-primary">
                    Overdue invoice reminders
                  </span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked={true}
                    onChange={(e) =>
                      saveSettings({ notifications_lien: e.target.checked } as any)
                    }
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm text-text-primary">
                    California lien deadline alerts (preliminary notice, mechanics lien)
                  </span>
                </label>
              </div>
              <Separator />
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Reminder Email Address
                </label>
                <Input
                  type="email"
                  value={notificationForm.reminderEmail}
                  onChange={(e) =>
                    handleNotificationChange('reminderEmail', e.target.value)
                  }
                />
              </div>
              <Button
                onClick={handleNotificationSave}
                disabled={notificationSaving}
                className="bg-primary-600 hover:bg-primary-700 text-white"
              >
                {notificationSaving ? 'Saving...' : 'Save Preferences'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Section 7: Account */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary-600" />
              Account
            </CardTitle>
            <CardDescription>Manage your account security and settings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-text-primary">Email</p>
                <p className="text-sm text-text-muted mt-1">{user?.email}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">Name</p>
                <p className="text-sm text-text-muted mt-1">{user?.name}</p>
              </div>
              <Separator />
              <div className="space-y-2">
                <Button
                  onClick={handleChangePassword}
                  variant="outline"
                  className="w-full"
                >
                  Change Password
                </Button>
                <Button
                  onClick={handleDeleteAccount}
                  variant="outline"
                  className="w-full text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  Delete Account
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
