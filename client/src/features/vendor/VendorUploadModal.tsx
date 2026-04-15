/**
 * VendorUploadModal — Multi-step document upload with orange theme
 * Steps: 1) Select doc type 2) Enter amount (if invoice) 3) Upload file 4) Submit
 * Full orange theming, Framer Motion animations
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Upload,
  AlertCircle,
  CheckCircle2,
  Loader,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/formatters'

interface VendorUploadModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (docType: string, amount: number | null) => void
  projectId?: number
}

const DOC_TYPES = [
  { id: 'invoice', label: '📄 Invoice', description: 'Project invoice' },
  { id: 'lien_waiver', label: '📋 Lien Waiver', description: 'Conditional or unconditional' },
  { id: 'rfi', label: '❓ RFI', description: 'Request for information' },
  { id: 'photo', label: '📸 Photo', description: 'Job site photo' },
  { id: 'daily_report', label: '📊 Daily Report', description: 'Daily progress report' },
  { id: 'other', label: '📎 Other', description: 'Other document' },
]

type Step = 'select_type' | 'enter_amount' | 'upload_file' | 'success'

export default function VendorUploadModal({
  isOpen,
  onClose,
  onSuccess,
  projectId,
}: VendorUploadModalProps) {
  const [step, setStep] = useState<Step>('select_type')
  const [selectedDocType, setSelectedDocType] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetModal = () => {
    setStep('select_type')
    setSelectedDocType(null)
    setAmount('')
    setFile(null)
    setNotes('')
    setError(null)
  }

  const handleClose = () => {
    resetModal()
    onClose()
  }

  const handleSelectDocType = (docType: string) => {
    setSelectedDocType(docType)
    if (docType === 'invoice') {
      setStep('enter_amount')
    } else {
      setStep('upload_file')
    }
  }

  const handleAmountNext = () => {
    if (!amount || isNaN(parseFloat(amount))) {
      setError('Please enter a valid amount')
      return
    }
    setError(null)
    setStep('upload_file')
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0])
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const handleSubmit = async () => {
    if (!file || !selectedDocType) {
      setError('Missing required fields')
      return
    }

    setIsSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('doc_type', selectedDocType)
      if (projectId) formData.append('project_id', String(projectId))
      if (amount) formData.append('amount', amount)
      if (notes) formData.append('notes', notes)

      const response = await fetch('/api/hub/upload-document', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Upload failed')
      }

      setStep('success')
      setTimeout(() => {
        onSuccess(selectedDocType, amount ? parseFloat(amount) : null)
        handleClose()
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/40 z-50"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="sticky top-0 bg-gradient-to-r from-orange-500 to-orange-600 text-white p-6 flex items-center justify-between">
                <h2 className="text-xl font-bold">
                  {step === 'select_type' && '📎 Upload Document'}
                  {step === 'enter_amount' && '💰 Enter Amount'}
                  {step === 'upload_file' && '📤 Select File'}
                  {step === 'success' && '✅ Success'}
                </h2>
                <button
                  onClick={handleClose}
                  className="text-white/80 hover:text-white transition-colors"
                  aria-label="Close"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex gap-3"
                  >
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                    <p className="text-sm text-red-700">{error}</p>
                  </motion.div>
                )}

                {/* Step: Select Doc Type */}
                <AnimatePresence mode="wait">
                  {step === 'select_type' && (
                    <motion.div
                      key="select_type"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-3"
                    >
                      <p className="text-sm text-gray-600 mb-4">What type of document are you uploading?</p>
                      {DOC_TYPES.map((docType) => (
                        <motion.button
                          key={docType.id}
                          onClick={() => handleSelectDocType(docType.id)}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className={`w-full p-4 text-left rounded-lg border-2 transition-all ${
                            selectedDocType === docType.id
                              ? 'border-orange-500 bg-orange-50'
                              : 'border-gray-200 hover:border-orange-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-gray-900">{docType.label}</p>
                              <p className="text-xs text-gray-600 mt-1">{docType.description}</p>
                            </div>
                            {selectedDocType === docType.id && (
                              <CheckCircle2 className="w-5 h-5 text-orange-500" />
                            )}
                          </div>
                        </motion.button>
                      ))}
                    </motion.div>
                  )}

                  {/* Step: Enter Amount */}
                  {step === 'enter_amount' && (
                    <motion.div
                      key="enter_amount"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Invoice Amount
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-gray-600">
                            $
                          </span>
                          <input
                            type="number"
                            value={amount}
                            onChange={(e) => {
                              setAmount(e.target.value)
                              setError(null)
                            }}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                            className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:border-orange-500 focus:outline-none transition-colors"
                            autoFocus
                          />
                        </div>
                        {amount && (
                          <p className="text-sm text-gray-600 mt-2">
                            {formatCurrency(parseFloat(amount) || 0)}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* Step: Upload File */}
                  {step === 'upload_file' && (
                    <motion.div
                      key="upload_file"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      {/* File Dropzone */}
                      <div
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
                          dragActive
                            ? 'border-orange-500 bg-orange-50'
                            : file
                              ? 'border-green-300 bg-green-50'
                              : 'border-gray-300 bg-gray-50 hover:border-orange-400'
                        }`}
                      >
                        <input
                          type="file"
                          onChange={handleFileChange}
                          className="hidden"
                          id="file-input"
                        />
                        <label htmlFor="file-input" className="cursor-pointer block">
                          {file ? (
                            <>
                              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" />
                              <p className="font-semibold text-green-700">{file.name}</p>
                              <p className="text-xs text-green-600 mt-1">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                            </>
                          ) : (
                            <>
                              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                              <p className="font-semibold text-gray-900">Drop file here or click to select</p>
                              <p className="text-xs text-gray-600 mt-1">PDF, JPG, PNG, DOC up to 50 MB</p>
                            </>
                          )}
                        </label>
                      </div>

                      {/* Notes Field */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Notes (optional)
                        </label>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Add any notes about this document..."
                          rows={3}
                          className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-orange-500 focus:outline-none transition-colors"
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* Step: Success */}
                  {step === 'success' && (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-center space-y-4 py-8"
                    >
                      <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 0.6 }}
                      >
                        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
                      </motion.div>
                      <h3 className="text-xl font-bold text-gray-900">Document Uploaded!</h3>
                      <p className="text-sm text-gray-600">
                        Your contractor will review it soon. You'll get notified when they respond.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer - Action Buttons */}
              {step !== 'success' && (
                <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-6 flex gap-3 justify-end">
                  {(step === 'enter_amount' || step === 'upload_file') && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (step === 'upload_file') {
                          if (selectedDocType === 'invoice') {
                            setStep('enter_amount')
                          } else {
                            setStep('select_type')
                          }
                        } else {
                          setStep('select_type')
                        }
                      }}
                      className="gap-2"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Back
                    </Button>
                  )}

                  <Button
                    onClick={() => {
                      if (step === 'select_type') {
                        // Should not reach here
                      } else if (step === 'enter_amount') {
                        handleAmountNext()
                      } else if (step === 'upload_file') {
                        handleSubmit()
                      }
                    }}
                    disabled={
                      isSubmitting ||
                      (step === 'upload_file' && !file) ||
                      (step === 'enter_amount' && !amount)
                    }
                    className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        {step === 'upload_file' ? 'Submit' : 'Next'}
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
