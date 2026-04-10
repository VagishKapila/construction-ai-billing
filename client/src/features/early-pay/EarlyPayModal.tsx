import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRequest = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/early-pay/request/${hubUploadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (result.error) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error,
        });
        return;
      }

      toast({
        title: 'Request Sent',
        description: 'Your early payment request has been sent to the GC for approval.',
      });

      onRequested();
    } catch (err) {
      console.error('Failed to request early payment:', err);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to submit early payment request',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formattedInvoiceAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);

  const formattedFee = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(eligibility.estimated_fee);

  const formattedNet = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(eligibility.net_amount);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle>Request Early Payment</DialogTitle>
          <DialogDescription>
            Receive your payment early with a small processing fee
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-6">
          {/* Invoice amount */}
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Invoice amount:</span>
            <span className="font-semibold">{formattedInvoiceAmount}</span>
          </div>

          {/* Fee breakdown */}
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">
              Processing fee ({(eligibility.fee_pct * 100).toFixed(1)}%):
            </span>
            <span className="font-semibold text-red-600">-{formattedFee}</span>
          </div>

          {/* Separator */}
          <div className="border-t border-gray-200"></div>

          {/* You receive */}
          <div className="flex justify-between items-center bg-green-50 p-3 rounded-lg">
            <span className="text-sm font-medium text-gray-700">You receive:</span>
            <span className="font-bold text-green-700">{formattedNet}</span>
          </div>

          {/* Disclaimer */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              Early payment is subject to GC approval. Funds typically arrive within 1-2 business days
              via ACH.
            </p>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRequest}
            disabled={isSubmitting}
            className="bg-[#db2777] hover:bg-[#c41f5d] text-white"
          >
            {isSubmitting ? 'Requesting...' : 'Request Early Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EarlyPayModal;
