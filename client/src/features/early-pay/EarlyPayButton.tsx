import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import EarlyPayModal from './EarlyPayModal';

interface EarlyPayButtonProps {
  hubUploadId: number;
  amount: number;
  docType?: string;
  status?: string;
  onRequested?: () => void;
}

interface EligibilityResponse {
  data: {
    eligible: boolean;
    reason: string;
    fee_pct: number;
    estimated_fee: number;
    net_amount: number;
  } | null;
  error: string | null;
}

const EarlyPayButton: React.FC<EarlyPayButtonProps> = ({
  hubUploadId,
  amount,
  docType = 'invoice',
  status = 'pending',
  onRequested,
}) => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [eligibility, setEligibility] = useState<EligibilityResponse['data'] | null>(null);

  // Only show button if it's an approved invoice
  const shouldShow = docType === 'invoice' && status === 'approved';

  const checkEligibility = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/early-pay/eligibility/${hubUploadId}`);
      const result: EligibilityResponse = await response.json();

      if (result.error) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error,
        });
        return;
      }

      setEligibility(result.data);

      if (result.data?.eligible) {
        setIsOpen(true);
      } else {
        toast({
          variant: 'destructive',
          title: 'Not Eligible',
          description: result.data?.reason || 'This invoice is not eligible for early payment',
        });
      }
    } catch (err) {
      console.error('Failed to check eligibility:', err);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to check early payment eligibility',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!shouldShow) {
    return null;
  }

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={checkEligibility}
              disabled={isLoading}
              className="text-xs font-medium border-[#db2777] text-[#db2777] hover:bg-[#fdf2f8]"
            >
              {isLoading ? 'Checking...' : 'Request Early Pay'}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">Request early payment with a 2.5% processing fee</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

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
