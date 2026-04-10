import React, { useState } from 'react';
import { Button } from '@/components/ui/button';

interface Eligibility {
  eligible: boolean;
  reason: string;
  fee_pct: number;
  estimated_fee: number;
  net_amount: number;
}

interface EarlyPayModalProps {
  hubUploadId: number;
  amount: number;
  eligibility: Eligibility;
  isOpen: boolean;
  onClose: () => void;
  onRequested: () => void;
}

const EarlyPayModal: React.FC<EarlyPayModalProps> = ({
  hubUploadId,
  amount,
  eligibility,
  isOpen,
  onClose,
  onRequested,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleRequest = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/early-pay/request/${hubUploadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        onRequested();
      }, 1200);
    } catch (err) {
      console.error('Failed to request early payment:', err);
      setError('Failed to submit early payment request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6 z-10">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Request Early Payment</h2>
          <p className="text-sm text-gray-500 mt-1">Receive your payment early with a small processing fee</p>
        </div>

        {success ? (
          <div className="py-6 text-center">
            <div className="text-green-600 text-2xl mb-2">✓</div>
            <p className="font-medium text-gray-900">Request sent!</p>
            <p className="text-sm text-gray-500 mt-1">Your GC has been notified and will review the request.</p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Invoice amount:</span>
              <span className="font-semibold">{fmt(amount)}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">
                Processing fee ({(eligibility.fee_pct * 100).toFixed(1)}%):
              </span>
              <span className="font-semibold text-red-600">-{fmt(eligibility.estimated_fee)}</span>
            </div>

            <div className="border-t border-gray-200" />

            <div className="flex justify-between items-center bg-green-50 p-3 rounded-lg">
              <span className="text-sm font-medium text-gray-700">You receive:</span>
              <span className="font-bold text-green-700">{fmt(eligibility.net_amount)}</span>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800">
                Early payment is subject to GC approval. Funds typically arrive within 1–2 business days via ACH.
              </p>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 p-2 rounded">{error}</p>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="ghost" onClick={onClose} disabled={isSubmitting} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleRequest}
                disabled={isSubmitting}
                className="flex-1 bg-[#db2777] hover:bg-[#c41f5d] text-white"
              >
                {isSubmitting ? 'Requesting...' : 'Request Early Payment'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EarlyPayModal;
