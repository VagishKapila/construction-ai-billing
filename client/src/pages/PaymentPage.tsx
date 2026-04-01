import type { ReactNode } from 'react'
import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronDown, ChevronUp, CheckCircle, AlertCircle } from 'lucide-react'

interface PayAppData {
  project_name: string
  project_number: string
  project_owner: string
  app_number: number
  period_label: string
  company_name: string
  logo_filename: string | null
  contact_name: string
  contact_email: string
  amount_due: number
  amount_paid: number
  total_due: number
  payment_status: 'unpaid' | 'partial' | 'paid' | 'processing' | 'bad_debt'
  has_pending_payment: boolean
  bad_debt: boolean
  retainage_held: number
  retainage_pct: number
  cc_fee: number
  ach_fee: number
  stripe_account_id: string
  po_number: string | null
  lines: Array<{
    item_id: string
    description: string
    scheduled_value: number
    this_period: number
  }>
  pay_app_id: string
  credit_card_enabled: boolean
}

type PaymentMethod = 'ach' | 'card'
type PageState = 'loading' | 'not_found' | 'success' | 'error' | 'paid' | 'processing' | 'bad_debt' | 'normal'

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

export function PaymentPage() {
  const { token } = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('ach')
  const [isProcessing, setIsProcessing] = useState(false)
  const [pageState, setPageState] = useState<PageState>('loading')
  const [payAppData, setPayAppData] = useState<PayAppData | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [showInvoiceDetails, setShowInvoiceDetails] = useState(false)

  // Load pay app data on mount
  useEffect(() => {
    const loadPayAppData = async () => {
      try {
        if (!token) {
          setPageState('not_found')
          return
        }

        const response = await fetch(`/api/pay/${token}`)
        if (!response.ok) {
          if (response.status === 404) {
            setPageState('not_found')
          } else {
            setPageState('error')
            setErrorMessage('Failed to load invoice')
          }
          return
        }

        const data = (await response.json()) as PayAppData
        setPayAppData(data)

        // Determine page state
        if (data.bad_debt) {
          setPageState('bad_debt')
        } else if (data.payment_status === 'paid') {
          setPageState('paid')
        } else if (data.has_pending_payment || data.payment_status === 'processing') {
          setPageState('processing')
        } else {
          setPageState('normal')
        }
      } catch (err) {
        setPageState('error')
        setErrorMessage(err instanceof Error ? err.message : 'An error occurred')
      }
    }

    loadPayAppData()
  }, [token])

  // Handle success redirect verification
  useEffect(() => {
    const verifyPayment = async () => {
      if (searchParams.get('success') !== 'true' || !token) return

      try {
        const sessionId = searchParams.get('session_id')
        const verifyResponse = await fetch(`/api/pay/${token}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        })

        if (verifyResponse.ok) {
          setPageState('success')
          // Reload data to get updated payment status
          const response = await fetch(`/api/pay/${token}`)
          if (response.ok) {
            const data = (await response.json()) as PayAppData
            setPayAppData(data)
          }
        }
      } catch (err) {
        console.error('Payment verification failed:', err)
      }
    }

    verifyPayment()
  }, [token, searchParams])

  const handlePayment = async () => {
    if (!token || !payAppData) return

    setIsProcessing(true)
    try {
      const checkoutResponse = await fetch(`/api/pay/${token}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: paymentMethod }),
      })

      if (!checkoutResponse.ok) {
        const error = (await checkoutResponse.json()) as { error?: string }
        setErrorMessage(error.error || 'Failed to create payment session')
        setPageState('error')
        return
      }

      const { url } = (await checkoutResponse.json()) as { url: string }
      window.location.href = url
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Payment failed')
      setPageState('error')
    } finally {
      setIsProcessing(false)
    }
  }

  // Render different states
  if (pageState === 'loading') {
    return <LoadingState />
  }

  if (pageState === 'not_found') {
    return (
      <ErrorState
        title="Invoice Not Found"
        message="This payment link is invalid or has expired. Please contact the contractor for a new link."
      />
    )
  }

  if (pageState === 'error') {
    return <ErrorState title="Error" message={errorMessage} />
  }

  if (pageState === 'success') {
    return (
      <SuccessState
        amount={payAppData?.amount_due || 0}
        company={payAppData?.company_name || 'Contractor'}
      />
    )
  }

  if (pageState === 'paid') {
    return (
      <PaidState
        company={payAppData?.company_name || 'Contractor'}
        amount={payAppData?.total_due || 0}
      />
    )
  }

  if (pageState === 'processing') {
    return (
      <ProcessingState
        company={payAppData?.company_name || 'Contractor'}
        amount={payAppData?.amount_due || 0}
      />
    )
  }

  if (pageState === 'bad_debt') {
    return (
      <BadDebtState company={payAppData?.company_name || 'Contractor'} />
    )
  }

  if (!payAppData) {
    return <LoadingState />
  }

  // Normal payment state
  const totalAmount = payAppData.amount_due
  const achTotal = totalAmount + payAppData.ach_fee
  const cardFeeAmount = (totalAmount * (payAppData.cc_fee / 100))
  const cardTotal = totalAmount + cardFeeAmount

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4 sm:py-12 sm:px-6">
      <div className="max-w-2xl mx-auto">
        {/* Header with Logo */}
        <div className="text-center mb-8">
          {payAppData.logo_filename && (
            <div className="mb-6 flex justify-center">
              <img
                src={`/api/settings/logo?file=${encodeURIComponent(
                  payAppData.logo_filename
                )}`}
                alt={payAppData.company_name}
                className="h-12 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            </div>
          )}
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">
            Pay Invoice
          </h1>
          <p className="text-slate-600 mt-2">
            Secure payment processing via Stripe
          </p>
        </div>

        {/* Invoice Details Card */}
        <Card className="p-6 sm:p-8 mb-6 border border-slate-200 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 pb-6 border-b border-slate-200">
            <div>
              <p className="text-xs sm:text-sm font-medium text-slate-500 uppercase tracking-wide">
                Project
              </p>
              <p className="font-semibold text-slate-900 mt-1">
                {payAppData.project_name}
              </p>
              {payAppData.project_number && (
                <p className="text-xs text-slate-600 mt-1">
                  #{payAppData.project_number}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs sm:text-sm font-medium text-slate-500 uppercase tracking-wide">
                Pay Application
              </p>
              <p className="font-semibold text-slate-900 mt-1">
                #{payAppData.app_number}
              </p>
              {payAppData.period_label && (
                <p className="text-xs text-slate-600 mt-1">
                  {payAppData.period_label}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs sm:text-sm font-medium text-slate-500 uppercase tracking-wide">
                General Contractor
              </p>
              <p className="font-semibold text-slate-900 mt-1">
                {payAppData.company_name}
              </p>
            </div>
            <div>
              <p className="text-xs sm:text-sm font-medium text-slate-500 uppercase tracking-wide">
                Project Owner
              </p>
              <p className="font-semibold text-slate-900 mt-1">
                {payAppData.project_owner}
              </p>
            </div>
          </div>

          {/* Invoice Breakdown */}
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Gross This Period</span>
              <span className="text-slate-900 font-medium">
                {formatCurrency(payAppData.lines.reduce((sum, line) => sum + line.this_period, 0))}
              </span>
            </div>
            {payAppData.retainage_pct > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">
                  Less: Retainage ({payAppData.retainage_pct}%)
                </span>
                <span className="text-slate-900 font-medium">
                  -{formatCurrency(payAppData.retainage_held)}
                </span>
              </div>
            )}
            {payAppData.amount_paid > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Previous Payments</span>
                <span className="text-slate-900 font-medium">
                  -{formatCurrency(payAppData.amount_paid)}
                </span>
              </div>
            )}
            <div className="border-t border-slate-200 pt-3 flex justify-between">
              <span className="font-semibold text-slate-900">Amount Due Now</span>
              <span className="text-2xl font-bold text-indigo-600">
                {formatCurrency(totalAmount)}
              </span>
            </div>
          </div>

          {/* View Invoice Details */}
          <button
            onClick={() => setShowInvoiceDetails(!showInvoiceDetails)}
            className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium text-sm transition-colors"
          >
            {showInvoiceDetails ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            {showInvoiceDetails ? 'Hide' : 'View'} Invoice Details
          </button>

          {showInvoiceDetails && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-2 font-semibold text-slate-900">
                        Description
                      </th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-900">
                        Scheduled
                      </th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-900">
                        This Period
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {payAppData.lines.map((line) => (
                      <tr
                        key={line.item_id}
                        className="border-b border-slate-100 hover:bg-slate-50"
                      >
                        <td className="py-2 px-2 text-slate-700">
                          {line.description}
                        </td>
                        <td className="text-right py-2 px-2 text-slate-600">
                          {formatCurrency(line.scheduled_value)}
                        </td>
                        <td className="text-right py-2 px-2 text-slate-900 font-medium">
                          {formatCurrency(line.this_period)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>

        {/* Payment Method Selection Card */}
        <Card className="p-6 sm:p-8 border border-slate-200 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">
            Payment Method
          </h2>

          <div className="space-y-3 mb-8">
            {/* ACH Option */}
            <label
              className="flex items-start gap-4 p-4 border-2 rounded-lg cursor-pointer transition-all"
              style={{
                borderColor:
                  paymentMethod === 'ach'
                    ? 'rgb(79, 70, 229)'
                    : 'rgb(226, 232, 240)',
                backgroundColor:
                  paymentMethod === 'ach'
                    ? 'rgb(238, 242, 255)'
                    : 'rgb(255, 255, 255)',
              }}
            >
              <input
                type="radio"
                name="paymentMethod"
                value="ach"
                checked={paymentMethod === 'ach'}
                onChange={() => setPaymentMethod('ach')}
                className="mt-1 w-4 h-4 cursor-pointer"
              />
              <div className="flex-1">
                <p className="font-semibold text-slate-900">
                  ACH Bank Transfer{' '}
                  <Badge variant="default" className="ml-2 bg-green-100 text-green-800">
                    Recommended
                  </Badge>
                </p>
                <p className="text-sm text-slate-600 mt-1">
                  1-2 business days • No fee for you
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  The $25 processing fee is paid by the contractor. You pay
                  exactly {formatCurrency(totalAmount)}.
                </p>
              </div>
            </label>

            {/* Card Option */}
            {payAppData.credit_card_enabled && (
              <label
                className="flex items-start gap-4 p-4 border-2 rounded-lg cursor-pointer transition-all"
                style={{
                  borderColor:
                    paymentMethod === 'card'
                      ? 'rgb(79, 70, 229)'
                      : 'rgb(226, 232, 240)',
                  backgroundColor:
                    paymentMethod === 'card'
                      ? 'rgb(238, 242, 255)'
                      : 'rgb(255, 255, 255)',
                }}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="card"
                  checked={paymentMethod === 'card'}
                  onChange={() => setPaymentMethod('card')}
                  className="mt-1 w-4 h-4 cursor-pointer"
                />
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">
                    Credit/Debit Card
                  </p>
                  <p className="text-sm text-slate-600 mt-1">
                    Instant • Processing fee added to total
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    You'll pay {formatCurrency(cardTotal)} total (invoice +{' '}
                    {formatCurrency(cardFeeAmount)} processing fee).
                  </p>
                </div>
              </label>
            )}
          </div>

          {/* Payment Summary */}
          <div className="bg-slate-50 rounded-lg p-4 mb-8 space-y-2 border border-slate-200">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Invoice Amount</span>
              <span className="text-slate-900 font-medium">
                {formatCurrency(totalAmount)}
              </span>
            </div>

            {paymentMethod === 'ach' && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Processing Fee</span>
                <span className="text-slate-700">
                  ${payAppData.ach_fee.toFixed(2)} (paid by contractor)
                </span>
              </div>
            )}

            {paymentMethod === 'card' && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Processing Fee</span>
                <span className="text-slate-900 font-medium">
                  +{formatCurrency(cardFeeAmount)}
                </span>
              </div>
            )}

            <div className="border-t border-slate-300 pt-2 flex justify-between font-semibold">
              <span className="text-slate-900">Total Due</span>
              <span className="text-lg text-indigo-600">
                {formatCurrency(
                  paymentMethod === 'ach' ? achTotal : cardTotal
                )}
              </span>
            </div>
          </div>

          {/* Pay Button */}
          <Button
            onClick={handlePayment}
            disabled={isProcessing}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 font-semibold text-base transition-colors disabled:opacity-70"
          >
            {isProcessing ? 'Processing...' : 'Pay Now'}
          </Button>

          {/* Security Notice */}
          <p className="text-xs text-slate-500 text-center mt-4">
            🔒 This page is secured with SSL encryption. Your payment is
            processed securely by Stripe.
          </p>
        </Card>

        {/* Contact Info Footer */}
        {(payAppData.contact_name || payAppData.contact_email) && (
          <div className="mt-8 text-center text-sm text-slate-600">
            <p className="font-medium text-slate-900">Questions?</p>
            <p className="mt-1">
              Contact{' '}
              {payAppData.contact_name && (
                <span className="font-medium">{payAppData.contact_name}</span>
              )}
              {payAppData.contact_name && payAppData.contact_email && ' at '}
              {payAppData.contact_email && (
                <a
                  href={`mailto:${payAppData.contact_email}`}
                  className="text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  {payAppData.contact_email}
                </a>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// Loading State
function LoadingState(): ReactNode {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Pay Invoice</h1>
        </div>

        <Card className="p-8 mb-6">
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-8 w-1/2 mt-6" />
            <Skeleton className="h-4 w-full mt-6" />
            <Skeleton className="h-4 w-full" />
          </div>
        </Card>

        <Card className="p-8">
          <Skeleton className="h-6 w-1/3 mb-6" />
          <div className="space-y-3 mb-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-12 w-full" />
        </Card>
      </div>
    </div>
  )
}

// Error State
interface ErrorStateProps {
  title: string
  message: string
}

function ErrorState({ title, message }: ErrorStateProps): ReactNode {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4 flex items-center justify-center">
      <div className="max-w-md mx-auto text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-slate-900 mb-2">{title}</h1>
        <p className="text-slate-600 mb-6">{message}</p>
        <Button
          onClick={() => window.location.href = '/'}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          Return Home
        </Button>
      </div>
    </div>
  )
}

// Success State
interface SuccessStateProps {
  amount: number
  company: string
}

function SuccessState({ amount, company }: SuccessStateProps): ReactNode {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4 flex items-center justify-center">
      <div className="max-w-md mx-auto text-center">
        <div className="bg-green-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-12 h-12 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Payment Submitted Successfully
        </h1>
        <p className="text-slate-600 mb-2">
          Thank you for your payment of {formatCurrency(amount)}
        </p>
        <p className="text-sm text-slate-500 mb-6">
          {company} will receive confirmation shortly.
        </p>
        <Button
          onClick={() => window.location.href = '/'}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          Close
        </Button>
      </div>
    </div>
  )
}

// Paid State
interface PaidStateProps {
  company: string
  amount: number
}

function PaidState({ company, amount }: PaidStateProps): ReactNode {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4 flex items-center justify-center">
      <div className="max-w-md mx-auto text-center">
        <div className="bg-green-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-12 h-12 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Payment Received
        </h1>
        <p className="text-slate-600 mb-2">
          This invoice has been fully paid.
        </p>
        <p className="text-sm text-slate-500 mb-2">
          Amount: {formatCurrency(amount)}
        </p>
        <p className="text-sm text-slate-500 mb-6">
          Contractor: {company}
        </p>
        <Button
          onClick={() => window.location.href = '/'}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          Close
        </Button>
      </div>
    </div>
  )
}

// Processing State
interface ProcessingStateProps {
  company: string
  amount: number
}

function ProcessingState({ company, amount }: ProcessingStateProps): ReactNode {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4 flex items-center justify-center">
      <div className="max-w-md mx-auto text-center">
        <div className="bg-blue-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4 animate-pulse">
          <CheckCircle className="w-12 h-12 text-blue-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Payment Processing
        </h1>
        <p className="text-slate-600 mb-2">
          Your payment of {formatCurrency(amount)} is being processed.
        </p>
        <p className="text-sm text-slate-500 mb-6">
          For ACH transfers, funds will arrive in 1-2 business days.
          {company} will be notified once the payment clears.
        </p>
        <Button
          onClick={() => window.location.href = '/'}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          Close
        </Button>
      </div>
    </div>
  )
}

// Bad Debt State
interface BadDebtStateProps {
  company: string
}

function BadDebtState({ company }: BadDebtStateProps): ReactNode {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4 flex items-center justify-center">
      <div className="max-w-md mx-auto text-center">
        <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Invoice Unavailable
        </h1>
        <p className="text-slate-600 mb-6">
          This invoice has been marked as uncollectable. Please contact {company}{' '}
          directly if you have questions.
        </p>
        <Button
          onClick={() => window.location.href = '/'}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          Close
        </Button>
      </div>
    </div>
  )
}
