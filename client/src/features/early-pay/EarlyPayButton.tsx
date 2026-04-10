import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import EarlyPayModal from './EarlyPayModal';

interface EarlyPayButtonProps {
  hubUploadId: number;
  amount: number;
  docType?: string;
  status?: string;
  onRequested?: () => void;
}

interface EligibilityData {
  eligible: boolean;
  reason: string;
  fee_pct: number;
  estimated_fee: number;
  net_amount: number;
}

const EarlyPayButton: React.FC<EarlyPayButtonProps> = ({
  hubUploadId,
  amount,
  docType = 'invoice',
  status = 'pending',
  onRequested,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [eligibility, setEligibility] = useState<EligibilityData | null>(null);
  const [ineligibleReason, setIneligibleReason] = useState<string | null>(null);

  // Only show button if it's an approved invoice
  const shouldShow = docType === 'invoice' && status === 'approved';

  const checkEligibility = async () => {
    setIsLoading(true);
    setIneligibleReason(null);
    try {
      const response = await fetch(`/api/early-pay/eligibility/${hubUploadId}`);
      const result = await response.json();

      if (result.error) {
        setIneligibleReason(result.error);
        return;
      }

      setEligibility(result.data);

      if (result.data?.eligible) {
        setIsOpen(true);
      } else {
        setIneligibleReason(result.data?.reason || 'This invoice is not eligible for early payment');
      }
    } catch (err) {
      console.error('Failed to check eligibility:', err);
      setIneligibleReason('Failed to check eligibility. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!shouldShow) {
    return null;
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={checkEligibility}
          disabled={isLoading}
          title="Request early payment with a 2.5% processing fee"
          className="text-xs font-medium border-[#db2777] text-[#db2777] hover:bg-[#fdf2f8]"
        >
          {isLoading ? 'Checking...' : 'Request Early Pay'}
        </Button>
        {ineligibleReason && (
          <p className="text-xs text-red-600 max-w-[180px]">{ineligibleReason}</p>
        )}
      </div>

      {eligibility && (
        <EarlyPayModal
          hubUploadId={hubUploadId}
          amount={amount}
          eligibility={eligibility}
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onRequested={() => {
            setIsOpen(false);
            onRequested?.();
          }}
        />
      )}
    </>
  );
};

export default EarlyPayButton;
