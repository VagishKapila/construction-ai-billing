import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface EarlyPaymentRequest {
  id: number;
  hub_upload_id: number;
  amount: number;
  fee_amount: number;
  net_amount: number;
  status: string;
  created_at: string;
  project_name: string;
  trade_name: string;
  invoice_filename: string;
}

interface EarlyPayApprovalCardProps {
  request: EarlyPaymentRequest;
  onApproved?: (requestId: number) => void;
  onDeclined?: (requestId: number) => void;
}

const EarlyPayApprovalCard: React.FC<EarlyPayApprovalCardProps> = ({
  request,
  onApproved,
  onDeclined,
}) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/early-pay/approve/${request.id}`, {
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
        title: 'Approved',
        description: result.data?.message || 'Early payment request approved',
      });

      onApproved?.(request.id);
    } catch (err) {
      console.error('Failed to approve:', err);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to approve early payment',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDecline = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/early-pay/reject/${request.id}`, {
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
        title: 'Declined',
        description: 'Early payment request has been declined',
      });

      onDeclined?.(request.id);
    } catch (err) {
      console.error('Failed to decline:', err);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to decline early payment',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(request.amount);

  const formattedFee = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(request.fee_amount);

  const formattedNet = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(request.net_amount);

  return (
    <Card className="border-l-4 border-l-[#db2777] bg-white rounded-xl">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">{request.trade_name}</CardTitle>
            <CardDescription className="text-xs text-gray-600">
              {request.project_name}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-[#db2777]">{formattedAmount}</div>
            <p className="text-xs text-gray-500">Invoice amount</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Breakdown */}
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Processing fee (2.5%):</span>
            <span className="font-medium text-red-600">-{formattedFee}</span>
          </div>
          <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-semibold">
            <span>GC sends via ACH:</span>
            <span className="text-green-700">{formattedNet}</span>
          </div>
        </div>

        {/* File info */}
        <div className="text-xs text-gray-500">
          <p>Invoice: {request.invoice_filename}</p>
          <p>Requested: {new Date(request.created_at).toLocaleDateString()}</p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleApprove}
            disabled={isLoading}
            className="flex-1 bg-[#db2777] hover:bg-[#c41f5d] text-white font-medium"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              `Approve & Send $${(request.net_amount / 100).toFixed(2)}`
            )}
          </Button>
          <Button
            onClick={handleDecline}
            disabled={isLoading}
            variant="ghost"
            className="flex-1 border border-red-200 text-red-600 hover:bg-red-50"
          >
            Decline
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default EarlyPayApprovalCard;
