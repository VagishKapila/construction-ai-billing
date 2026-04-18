import { useState } from 'react';
import { AlertCircle, Mail, Copy, Loader2 } from 'lucide-react';
import type { OutstandingInvoice } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/formatters';

interface CollectionAlertsProps {
  overdue: OutstandingInvoice[];
  isLoading: boolean;
}

interface FollowUpDraft {
  payAppId: number;
  draft: string;
  daysOverdue: number;
  amount: number;
}

/**
 * Collection Alerts — shows overdue invoices with AI follow-up draft feature
 * Positioned at the top of the Cash Flow page as the priority alert section
 */
export function CollectionAlerts({ overdue, isLoading }: CollectionAlertsProps) {
  const [selectedPayAppId, setSelectedPayAppId] = useState<number | null>(null);
  const [followUpDraft, setFollowUpDraft] = useState<FollowUpDraft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [showDraftModal, setShowDraftModal] = useState(false);

  const authHeader = (): Record<string, string> => {
    const token = localStorage.getItem('token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  };

  const generateFollowUpDraft = async (payAppId: number) => {
    setSelectedPayAppId(payAppId);
    setDraftLoading(true);
    setDraftError(null);
    setFollowUpDraft(null);

    try {
      const res = await fetch(`/api/collection/followup-draft/${payAppId}`, {
        method: 'POST',
        headers: authHeader(),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate draft');
      }

      const data = await res.json();
      setFollowUpDraft(data);
      setShowDraftModal(true);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setDraftLoading(false);
    }
  };

  const recordFollowUp = async (type: string) => {
    if (!selectedPayAppId || !followUpDraft) return;

    try {
      const res = await fetch(`/api/collection/followup-record/${selectedPayAppId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(),
        },
        body: JSON.stringify({
          followup_type: type,
          notes: followUpDraft.draft,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to record follow-up');
      }

      // Close modal and reset
      setShowDraftModal(false);
      setFollowUpDraft(null);
      setSelectedPayAppId(null);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : 'Failed to record follow-up');
    }
  };

  const copyDraftToClipboard = () => {
    if (followUpDraft?.draft) {
      navigator.clipboard.writeText(followUpDraft.draft);
    }
  };

  // If no overdue items, show nothing
  if (!isLoading && overdue.length === 0) {
    return null;
  }

  return (
    <>
      {/* Overdue Alerts Card */}
      {overdue.length > 0 && (
        <Card className="p-6 border-l-4 border-l-red-500 bg-red-50 mb-6">
          <div className="flex gap-4">
            <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-red-900 mb-4">
                {overdue.length} Invoice{overdue.length !== 1 ? 's' : ''} Overdue
              </h3>

              {/* Overdue Items List */}
              <div className="space-y-3">
                {overdue.map((invoice) => (
                  <div key={invoice.id} className="bg-white rounded-lg p-3 border border-red-200">
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900">PA #{invoice.app_number}</p>
                          <p className="text-xs text-gray-600 truncate">{invoice.project_name}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-mono font-semibold text-gray-900">
                            {formatCurrency(invoice.amount_due)}
                          </p>
                          <p className="text-xs font-medium text-red-600">
                            {invoice.days_overdue}d overdue
                          </p>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => generateFollowUpDraft(invoice.id)}
                          disabled={draftLoading || isLoading}
                          className="flex-1"
                        >
                          {draftLoading && selectedPayAppId === invoice.id ? (
                            <>
                              <Loader2 size={14} className="mr-1 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Mail size={14} className="mr-1" />
                              Draft Follow-up
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Follow-up Draft Modal */}
      {showDraftModal && followUpDraft && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  AI Follow-up Draft — PA #{followUpDraft.payAppId}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {followUpDraft.daysOverdue} days overdue • {formatCurrency(followUpDraft.amount)}
                </p>
              </div>

              {/* Error Message */}
              {draftError && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  {draftError}
                </div>
              )}

              {/* Draft Text */}
              <div className="mb-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{followUpDraft.draft}</p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyDraftToClipboard}
                  className="flex-1 min-w-[120px]"
                >
                  <Copy size={14} className="mr-1" />
                  Copy to Clipboard
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => recordFollowUp('email_sent')}
                  className="flex-1 min-w-[120px]"
                >
                  <Mail size={14} className="mr-1" />
                  Mark as Sent
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowDraftModal(false);
                    setFollowUpDraft(null);
                  }}
                  className="min-w-[100px]"
                >
                  Close
                </Button>
              </div>

              {/* Hint */}
              <p className="text-xs text-gray-500 mt-4">
                Tip: Copy the draft, customize it, and send via your email client. Then click "Mark as Sent" to log it.
              </p>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
