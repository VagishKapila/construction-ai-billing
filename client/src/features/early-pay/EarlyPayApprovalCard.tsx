import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  const handleApprove = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/early-pay/approve/${request.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (result.error) {
        setFeedback({ type: 'error', msg: result.error });
        return;
      }

      setFeedback({ type: 'success', msg: result.data?.message || 'Early payment approved and sent' });
      onApproved?.(request.id);
    } catch (err) {
      console.error('Failed to approve:', err);
      setFeedback({ type: 'error', msg: 'Failed to approve early payment. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDecline = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/early-pay/reject/${request.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (result.error) {
        setFeedback({ type: 'error', msg: result.error });
        return;
      }

      setFeedback({ type: 'success', msg: 'Early payment request declined' });
      onDeclined?.(request.id);
    } catch (err) {
      console.error('Failed to decline:', err);
      setFeedback({ type: 'error', msg: 'Failed to decline. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

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
            <div className="text-2xl font-bold text-[#db2777]">{fmt(request.amount)}</div>
            <p className="text-xs text-gray-500">Invoice amount</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Processing fee (2.5%):</span>
            <span className="font-medium text-red-600">-{fmt(request.fee_amount)}</span>
          </div>
          <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-semibold">
            <span>You send via ACH:</span>
            <span className="text-green-700">{fmt(request.net_amount)}</span>
          </div>
        </div>

        <div className="text-xs text-gray-500">
          <p>Invoice: {request.invoice_filename}</p>
          <p>Requested: {new Date(request.created_at).toLocaleDateString()}</p>
        </div>

        {feedback && (
          <p className={`text-xs p-2 rounded ${
            feedback.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
          }`}>
            {feedback.msg}
          </p>
        )}

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
              `Approve & Send ${fmt(request.net_amount)}`
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
