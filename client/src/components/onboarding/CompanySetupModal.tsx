/**
 * CompanySetupModal — Onboarding Step 1
 *
 * Shown to new users on first login before the guided tour.
 * Captures full company profile with browser autofill support.
 * Fields: company name, address, city, state, ZIP, phone, license #, logo.
 * All address fields have proper autocomplete attributes for Chrome/Safari autofill.
 */

import { useState } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { Building2, Upload, X, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface CompanySetupModalProps {
  isOpen: boolean
  onComplete: () => void
  onSkip: () => void
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]

export function CompanySetupModal({ isOpen, onComplete, onSkip }: CompanySetupModalProps) {
  const { saveSettings, uploadLogo } = useSettings()

  const [form, setForm] = useState({
    companyName: '',
    companyAddress: '',
    companyCity: '',
    companyState: '',
    companyZip: '',
    contactPhone: '',
    licenseNumber: '',
  })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const set = (field: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    const url = URL.createObjectURL(file)
    setLogoPreview(url)
  }

  const handleSave = async () => {
    if (!form.companyName.trim()) {
      setError('Company name is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveSettings({
        company_name: form.companyName.trim(),
        company_address: form.companyAddress.trim() || null,
        company_city: form.companyCity.trim() || null,
        company_state: form.companyState.trim() || null,
        company_zip: form.companyZip.trim() || null,
        contact_phone: form.contactPhone.trim() || null,
        license_number: form.licenseNumber.trim() || null,
        // Ensure notification defaults are all ON for new users
        notifications_pay_app: true,
        notifications_payment: true,
        notifications_overdue: true,
        notifications_lien: true,
      } as any)

      if (logoFile) {
        await uploadLogo(logoFile)
      }

      onComplete()
    } catch (e) {
      console.error('[CompanySetupModal] save failed', e)
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
        onClick={onSkip}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Set up your company</h2>
              <p className="text-xs text-gray-500">Step 1 of 2 — auto-fills all future projects</p>
            </div>
          </div>
          <button
            onClick={onSkip}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Skip setup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Company Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Name <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              autoComplete="organization"
              autoFocus
              value={form.companyName}
              onChange={(e) => set('companyName', e.target.value)}
              placeholder="ABC General Contractors LLC"
              className="w-full"
            />
            <p className="text-xs text-gray-400 mt-1">
              Chrome/Safari will suggest saved company info — select it to fill all fields at once
            </p>
          </div>

          {/* Street Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Street Address
            </label>
            <Input
              type="text"
              autoComplete="street-address"
              value={form.companyAddress}
              onChange={(e) => set('companyAddress', e.target.value)}
              placeholder="123 Main Street, Suite 100"
            />
          </div>

          {/* City / State / ZIP — 3 columns */}
          <div className="grid grid-cols-5 gap-2">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <Input
                type="text"
                autoComplete="address-level2"
                value={form.companyCity}
                onChange={(e) => set('companyCity', e.target.value)}
                placeholder="Los Angeles"
              />
            </div>
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <select
                autoComplete="address-level1"
                value={form.companyState}
                onChange={(e) => set('companyState', e.target.value)}
                className="w-full h-10 px-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">—</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
              <Input
                type="text"
                autoComplete="postal-code"
                value={form.companyZip}
                onChange={(e) => set('companyZip', e.target.value)}
                placeholder="90210"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone <span className="text-gray-400 text-xs font-normal">(optional)</span>
            </label>
            <Input
              type="tel"
              autoComplete="tel"
              value={form.contactPhone}
              onChange={(e) => set('contactPhone', e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>

          {/* License Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contractor License # <span className="text-gray-400 text-xs font-normal">(optional)</span>
            </label>
            <Input
              type="text"
              value={form.licenseNumber}
              onChange={(e) => set('licenseNumber', e.target.value)}
              placeholder="CSLB #123456"
            />
          </div>

          {/* Logo Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Company Logo <span className="text-gray-400 text-xs font-normal">(optional — appears on PDFs)</span>
            </label>
            <div className="flex items-center gap-3">
              {logoPreview ? (
                <div className="relative">
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="h-12 w-auto max-w-[120px] object-contain border border-gray-200 rounded-lg p-1"
                  />
                  <button
                    onClick={() => { setLogoFile(null); setLogoPreview(null) }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center"
                  >
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                  <Upload className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-500">Upload logo</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/svg+xml"
                    onChange={handleLogoChange}
                    className="sr-only"
                  />
                </label>
              )}
              <p className="text-xs text-gray-400">PNG, JPG, or SVG — max 5MB</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 rounded-b-2xl flex items-center justify-between gap-3">
          <button
            onClick={onSkip}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Skip for now
          </button>
          <Button
            onClick={handleSave}
            disabled={saving || !form.companyName.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 px-6"
          >
            {saving ? 'Saving…' : (
              <>
                Continue
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default CompanySetupModal
