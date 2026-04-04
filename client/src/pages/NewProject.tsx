import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronLeft, Check } from 'lucide-react'
import type { CreateProjectData } from '@/api/projects'
import { saveSOVLines } from '@/api/projects'
import { createPayApp } from '@/api/payApps'
import { useProjects } from '@/hooks/useProjects'
import { useSettings } from '@/hooks/useSettings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/PageHeader'
import { SOVUpload, type SOVRow } from '@/components/sov/SOVUpload'
import { SOVTable } from '@/components/sov/SOVTable'
import { PAYMENT_TERMS, JURISDICTIONS, DEFAULT_RETAINAGE } from '@/lib/constants'
import { formatCurrency } from '@/lib/formatters'

type Step = 1 | 2 | 3

/**
 * NewProject — 3-step wizard for creating a new project
 * Step 1: Project Information
 * Step 2: Upload Schedule of Values
 * Step 3: Review & Create
 */
export function NewProject() {
  const navigate = useNavigate()
  const { createProject } = useProjects()
  const { settings } = useSettings()

  // Wizard state
  const [currentStep, setCurrentStep] = useState<Step>(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state — contractor auto-fills from company settings, retainage uses ?? to allow 0
  const [formData, setFormData] = useState<CreateProjectData>({
    name: '',
    number: '',
    owner: '',
    contractor: settings?.company_name || '',
    architect: '',
    contact_name: settings?.contact_name || '',
    contact_phone: settings?.contact_phone || '',
    contact_email: settings?.contact_email || '',
    building_area: '',
    original_contract: undefined,
    contract_date: '',
    est_date: '',
    payment_terms: settings?.default_payment_terms || 'Due on receipt',
    default_retainage: settings?.default_retainage ?? DEFAULT_RETAINAGE,
    address: '',
    owner_email: '',
    owner_phone: '',
    jurisdiction: 'california',
    include_architect: false,
    include_retainage: true,
  })

  // Track if settings were applied (they may load async after mount)
  const settingsApplied = useRef(false)

  useEffect(() => {
    if (settings && !settingsApplied.current) {
      settingsApplied.current = true
      setFormData((prev) => ({
        ...prev,
        contractor: prev.contractor || settings.company_name || '',
        contact_name: prev.contact_name || settings.contact_name || '',
        contact_phone: prev.contact_phone || settings.contact_phone || '',
        contact_email: prev.contact_email || settings.contact_email || '',
        payment_terms: prev.payment_terms || settings.default_payment_terms || 'Due on receipt',
        default_retainage: prev.default_retainage ?? settings.default_retainage ?? DEFAULT_RETAINAGE,
      }))
    }
  }, [settings])

  const [sovRows, setSovRows] = useState<SOVRow[]>([])

  const handleInputChange = (
    field: keyof CreateProjectData,
    value: string | number | boolean
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const validateStep1 = (): boolean => {
    if (!formData.name.trim()) {
      setError('Project Name is required')
      return false
    }
    if (!formData.owner?.trim()) {
      setError('Owner / Client Name is required')
      return false
    }
    setError(null)
    return true
  }

  const validateStep2 = (): boolean => {
    // Step 2 is optional (SOV can be added later)
    setError(null)
    return true
  }

  const handleNextStep = () => {
    if (currentStep === 1 && !validateStep1()) return
    if (currentStep === 2 && !validateStep2()) return

    if (currentStep < 3) {
      setCurrentStep((currentStep + 1) as Step)
    }
  }

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as Step)
    }
  }

  const handleCreateProject = async () => {
    if (!validateStep1()) return

    setIsLoading(true)
    setError(null)

    try {
      // Create project
      const project = await createProject(formData)

      if (!project) {
        throw new Error('Failed to create project')
      }

      // Save SOV lines if any were uploaded
      if (sovRows.length > 0) {
        const sovData = sovRows.map((row, idx) => ({
          item_id: row.item_id || `${idx + 1}`,
          description: row.description,
          scheduled_value: row.scheduled_value,
          sort_order: idx,
        }))

        await saveSOVLines(project.id, sovData)
      }

      // Auto-create first pay app and navigate directly to it
      try {
        const payAppResponse = await createPayApp(project.id, {})

        if (payAppResponse.data) {
          navigate(`/projects/${project.id}/pay-app/${payAppResponse.data.id}`)
          return
        }
      } catch {
        // If pay app creation fails, fall back to project detail
      }

      // Fallback: navigate to project detail if pay app creation failed
      navigate(`/projects/${project.id}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create project'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <PageHeader
        title="Create New Project"
        description="Set up your project and upload your Schedule of Values"
      />

      {/* Error message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Progress Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          {[1, 2, 3].map((step) => (
            <div key={step} className="flex items-center">
              {/* Circle */}
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                  step < currentStep
                    ? 'bg-primary-600 text-white'
                    : step === currentStep
                      ? 'bg-primary-600 text-white ring-2 ring-primary-300'
                      : 'bg-gray-200 text-gray-600'
                }`}
              >
                {step < currentStep ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <span>{step}</span>
                )}
              </div>

              {/* Connector line */}
              {step < 3 && (
                <div
                  className={`h-1 flex-1 mx-2 transition-all ${
                    step < currentStep ? 'bg-primary-600' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step labels */}
        <div className="flex justify-between text-sm">
          <span
            className={`font-medium ${
              currentStep === 1 ? 'text-primary-600' : 'text-text-secondary'
            }`}
          >
            Project Info
          </span>
          <span
            className={`font-medium ${
              currentStep === 2 ? 'text-primary-600' : 'text-text-secondary'
            }`}
          >
            Upload SOV
          </span>
          <span
            className={`font-medium ${
              currentStep === 3 ? 'text-primary-600' : 'text-text-secondary'
            }`}
          >
            Review
          </span>
        </div>
      </div>

      {/* Step 1: Project Information */}
      {currentStep === 1 && (
        <Card className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Project Name */}
            <Input
              label="Project Name *"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="e.g., Elm Street Addition"
              required
            />

            {/* Project Number */}
            <Input
              label="Project Number"
              value={formData.number || ''}
              onChange={(e) => handleInputChange('number', e.target.value)}
              placeholder="e.g., PROJ-2024-001"
            />

            {/* Owner / Client Name */}
            <Input
              label="Owner / Client Name *"
              value={formData.owner || ''}
              onChange={(e) => handleInputChange('owner', e.target.value)}
              placeholder="e.g., John Doe"
              required
            />

            {/* General Contractor */}
            <Input
              label="General Contractor"
              value={formData.contractor || ''}
              onChange={(e) => handleInputChange('contractor', e.target.value)}
              placeholder="Your company name"
              helperText="Auto-filled from settings"
            />

            {/* Architect */}
            <Input
              label="Architect"
              value={formData.architect || ''}
              onChange={(e) => handleInputChange('architect', e.target.value)}
              placeholder="Architect name (optional)"
            />

            {/* Contact Name */}
            <Input
              label="Contact Name"
              value={formData.contact_name || ''}
              onChange={(e) => handleInputChange('contact_name', e.target.value)}
              placeholder="Your name"
            />

            {/* Contact Phone */}
            <Input
              label="Contact Phone"
              type="tel"
              value={formData.contact_phone || ''}
              onChange={(e) => handleInputChange('contact_phone', e.target.value)}
              placeholder="(555) 123-4567"
            />

            {/* Contact Email */}
            <Input
              label="Contact Email"
              type="email"
              value={formData.contact_email || ''}
              onChange={(e) => handleInputChange('contact_email', e.target.value)}
              placeholder="your@email.com"
            />

            {/* Building Area */}
            <Input
              label="Building Area"
              value={formData.building_area || ''}
              onChange={(e) => handleInputChange('building_area', e.target.value)}
              placeholder="e.g., 5,000 sq ft"
            />

            {/* Original Contract Amount */}
            <Input
              label="Original Contract Amount"
              type="text"
              inputMode="decimal"
              value={
                formData.original_contract
                  ? new Intl.NumberFormat('en-US').format(formData.original_contract)
                  : ''
              }
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9.]/g, '')
                const parsed = parseFloat(raw)
                handleInputChange('original_contract', isNaN(parsed) ? 0 : parsed)
              }}
              placeholder="0.00"
            />

            {/* Contract Date */}
            <Input
              label="Contract Date"
              type="date"
              value={formData.contract_date || ''}
              onChange={(e) => handleInputChange('contract_date', e.target.value)}
            />

            {/* Estimated Completion Date */}
            <Input
              label="Estimated Completion"
              type="date"
              value={formData.est_date || ''}
              onChange={(e) => handleInputChange('est_date', e.target.value)}
            />

            {/* Payment Terms */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Payment Terms
              </label>
              <select
                value={formData.payment_terms || 'Due on receipt'}
                onChange={(e) => handleInputChange('payment_terms', e.target.value)}
                className="flex h-10 w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {PAYMENT_TERMS.map((term) => (
                  <option key={term} value={term}>
                    {term}
                  </option>
                ))}
              </select>
            </div>

            {/* Default Retainage % */}
            <Input
              label="Default Retainage %"
              type="number"
              value={formData.default_retainage ?? DEFAULT_RETAINAGE}
              onChange={(e) => {
                const val = e.target.value
                handleInputChange('default_retainage', val === '' ? 0 : parseFloat(val))
              }}
              placeholder="10"
              min="0"
              max="100"
              step="0.5"
            />

            {/* Jurisdiction */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Jurisdiction
              </label>
              <select
                value={formData.jurisdiction || 'california'}
                onChange={(e) => handleInputChange('jurisdiction', e.target.value)}
                className="flex h-10 w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {JURISDICTIONS.map((j) => (
                  <option key={j} value={j}>
                    {j.replace('_', ' ').charAt(0).toUpperCase() + j.slice(1).replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

            {/* Include Architect Certificate */}
            <div className="flex items-center gap-3 pt-6">
              <input
                type="checkbox"
                id="include-architect"
                checked={formData.include_architect ?? false}
                onChange={(e) => handleInputChange('include_architect', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="include-architect" className="text-sm font-medium text-gray-900">
                Include Architect Certificate for Payment
              </label>
            </div>

            {/* Address */}
            <Input
              label="Address"
              value={formData.address || ''}
              onChange={(e) => handleInputChange('address', e.target.value)}
              placeholder="Project address"
              className="md:col-span-2"
            />

            {/* Owner Email */}
            <Input
              label="Owner Email"
              type="email"
              value={formData.owner_email || ''}
              onChange={(e) => handleInputChange('owner_email', e.target.value)}
              placeholder="owner@email.com"
            />

            {/* Owner Phone */}
            <Input
              label="Owner Phone"
              type="tel"
              value={formData.owner_phone || ''}
              onChange={(e) => handleInputChange('owner_phone', e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>

          {/* Navigation */}
          <div className="flex justify-end pt-6 border-t border-border">
            <Button
              onClick={handleNextStep}
              className="bg-primary-600 hover:bg-primary-700"
            >
              Next: Upload SOV
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: Upload Schedule of Values */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <Card className="p-8">
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              Schedule of Values
            </h2>
            <p className="text-text-secondary mb-6">
              Upload your SOV file (Excel, CSV, PDF, or Word) to get started. You can also add
              this later if you prefer.
            </p>

            <SOVUpload onParsed={setSovRows} initialRows={sovRows} />
          </Card>

          {/* Navigation */}
          <div className="flex justify-between pt-6">
            <Button
              onClick={handlePrevStep}
              variant="outline"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={handleNextStep}
              className="bg-primary-600 hover:bg-primary-700"
            >
              Next: Review
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Create */}
      {currentStep === 3 && (
        <div className="space-y-6">
          {/* Project Summary */}
          <Card className="p-8">
            <h2 className="text-lg font-semibold text-text-primary mb-6">Project Summary</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                  Project Name
                </p>
                <p className="text-text-primary font-medium mt-1">{formData.name}</p>
              </div>

              {formData.number && (
                <div>
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                    Project Number
                  </p>
                  <p className="text-text-primary font-medium mt-1">{formData.number}</p>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                  Owner / Client
                </p>
                <p className="text-text-primary font-medium mt-1">{formData.owner}</p>
              </div>

              {formData.contractor && (
                <div>
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                    General Contractor
                  </p>
                  <p className="text-text-primary font-medium mt-1">{formData.contractor}</p>
                </div>
              )}

              {formData.original_contract && (
                <div>
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                    Contract Amount
                  </p>
                  <p className="text-text-primary font-medium mt-1">
                    {formatCurrency(formData.original_contract)}
                  </p>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                  Payment Terms
                </p>
                <p className="text-text-primary font-medium mt-1">{formData.payment_terms}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                  Default Retainage
                </p>
                <p className="text-text-primary font-medium mt-1">{formData.default_retainage}%</p>
              </div>

              {formData.contact_name && (
                <div>
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                    Contact Name
                  </p>
                  <p className="text-text-primary font-medium mt-1">{formData.contact_name}</p>
                </div>
              )}
            </div>
          </Card>

          {/* SOV Summary */}
          {sovRows.length > 0 && (() => {
            const sovTotal = sovRows.reduce((sum, r) => sum + (r.scheduled_value || 0), 0)
            const contractAmt = formData.original_contract || 0
            const variance = sovTotal - contractAmt
            const variancePct = contractAmt > 0 ? (variance / contractAmt) * 100 : 0
            const isMatch = Math.abs(variance) <= 1
            return (
            <Card className="p-8">
              <h2 className="text-lg font-semibold text-text-primary mb-6">
                Schedule of Values
              </h2>
              <p className="text-sm text-text-secondary mb-4">
                {sovRows.length} line items • Total: {formatCurrency(sovTotal)}
              </p>

              {/* SOV vs Contract Mismatch Warning */}
              {contractAmt > 0 && !isMatch && (
                <div className="mb-4 p-4 rounded-lg border" style={{ background: '#FFF8E1', borderColor: '#F59E0B' }}>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <span className="font-semibold text-amber-800">
                        SOV vs contract variance detected
                      </span>
                      <div className="text-sm text-amber-900 mt-1">
                        Contract: <strong>{formatCurrency(contractAmt)}</strong> &middot;
                        SOV Total: <strong>{formatCurrency(sovTotal)}</strong> &middot;
                        Variance: <strong>{variance >= 0 ? '+' : ''}{formatCurrency(Math.abs(variance))} ({variancePct >= 0 ? '+' : ''}{variancePct.toFixed(2)}%)</strong>
                      </div>
                      <p className="text-xs text-amber-700 mt-1">
                        Your SOV total differs from the contract sum by {formatCurrency(Math.abs(variance))}. Review your SOV line items.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleInputChange('original_contract', sovTotal)}
                      className="bg-amber-500 hover:bg-amber-600 text-white text-xs whitespace-nowrap"
                    >
                      Fix: use SOV total
                    </Button>
                  </div>
                </div>
              )}

              {contractAmt > 0 && isMatch && (
                <div className="mb-4 p-3 rounded-lg border border-green-200 bg-green-50">
                  <span className="text-sm font-medium text-green-700">SOV matches contract sum</span>
                </div>
              )}
              <SOVTable
                lines={sovRows.map((r, idx) => ({
                  id: idx,
                  project_id: 0,
                  item_id: r.item_id,
                  description: r.description,
                  scheduled_value: r.scheduled_value,
                  sort_order: idx,
                }))}
              />
            </Card>
            )
          })()}

          {/* Navigation */}
          <div className="flex justify-between pt-6">
            <Button
              onClick={handlePrevStep}
              variant="outline"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={isLoading}
              className="bg-primary-600 hover:bg-primary-700"
            >
              {isLoading ? 'Creating Project...' : 'Create Project'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
