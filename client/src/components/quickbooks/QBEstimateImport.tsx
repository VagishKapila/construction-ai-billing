/**
 * QuickBooks Estimate Import
 * Modal/panel for importing QB estimates as Schedule of Values
 * Used in New Project wizard — Path B
 */

import { useEffect, useState } from 'react';
import { Loader2, AlertCircle, CheckCircle2, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import * as QB from '@/api/quickbooks';
import type { QBEstimate } from '@/api/quickbooks';

interface QBEstimateImportProps {
  projectId: number;
  onImportComplete?: () => void;
  onError?: (error: string) => void;
}

type Step = 'select' | 'preview' | 'importing';

export function QBEstimateImport({ projectId, onImportComplete, onError }: QBEstimateImportProps) {
  const [step, setStep] = useState<Step>('select');
  const [estimates, setEstimates] = useState<QBEstimate[]>([]);
  const [selectedEstimate, setSelectedEstimate] = useState<QBEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadEstimates();
  }, []);

  async function loadEstimates() {
    try {
      setLoading(true);
      setError(null);

      const response = await QB.getQBEstimates();
      if (response.data) {
        setEstimates(response.data);
      } else {
        setError(response.error || 'Failed to load estimates');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!selectedEstimate) return;

    try {
      setImporting(true);
      setError(null);

      const response = await QB.importQBEstimate(selectedEstimate.id, projectId);

      if (!response.error) {
        setStep('importing');
        // Simulate import completing
        setTimeout(() => {
          onImportComplete?.();
        }, 1500);
      } else {
        setError(response.error || 'Import failed');
        onError?.(response.error || 'Import failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      setError(message);
      onError?.(message);
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import from QuickBooks</CardTitle>
          <CardDescription>Load an estimate as your Schedule of Values</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  // Success state
  if (step === 'importing') {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-6 text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" />
          <div>
            <p className="font-medium text-green-900">Import Complete</p>
            <p className="text-sm text-green-700">
              Estimate imported as Schedule of Values
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Preview step
  if (step === 'preview' && selectedEstimate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChevronRight className="w-4 h-4" />
            Review Estimate
          </CardTitle>
          <CardDescription>Confirm before importing</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Estimate header */}
          <div className="space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex justify-between items-start gap-2">
              <div>
                <p className="text-sm text-gray-600">Estimate #</p>
                <p className="font-medium text-gray-900">{selectedEstimate.doc_number}</p>
              </div>
              <Badge variant="outline">{selectedEstimate.status}</Badge>
            </div>

            <div>
              <p className="text-sm text-gray-600">Customer</p>
              <p className="font-medium text-gray-900">{selectedEstimate.customer_name}</p>
            </div>

            <div>
              <p className="text-sm text-gray-600">Total Amount</p>
              <p className="text-lg font-semibold text-gray-900">
                ${selectedEstimate.total_amount.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-600">Date</p>
              <p className="font-medium text-gray-900">
                {new Date(selectedEstimate.txn_date).toLocaleDateString('en-US')}
              </p>
            </div>
          </div>

          {/* Line items */}
          <div>
            <p className="text-sm font-medium text-gray-900 mb-2">
              Line Items ({selectedEstimate.line_items.length})
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {selectedEstimate.line_items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-start gap-2 p-2 bg-gray-50 rounded">
                  <p className="text-sm text-gray-700 flex-1">{item.description}</p>
                  <p className="text-sm font-medium text-gray-900 whitespace-nowrap">
                    ${item.amount.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setStep('select');
                setSelectedEstimate(null);
              }}
              disabled={importing}
            >
              Back
            </Button>
            <Button
              onClick={handleImport}
              disabled={importing}
              className="flex-1"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Importing...
                </>
              ) : (
                'Import as SOV'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Select step
  return (
    <Card>
      <CardHeader>
        <CardTitle>Import from QuickBooks</CardTitle>
        <CardDescription>Select an estimate to use as your Schedule of Values</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {error && (
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-md">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {estimates.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-600 text-sm">No estimates found in QuickBooks</p>
            <p className="text-gray-500 text-xs mt-1">
              Create an estimate in QuickBooks and try again
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {estimates.map((estimate) => (
              <button
                key={estimate.id}
                onClick={() => {
                  setSelectedEstimate(estimate);
                  setStep('preview');
                }}
                className={`w-full text-left p-3 border rounded-lg transition-all ${
                  selectedEstimate?.id === estimate.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-start gap-2 mb-1">
                  <div>
                    <p className="font-medium text-sm text-gray-900">
                      #{estimate.doc_number}
                    </p>
                    <p className="text-xs text-gray-600">{estimate.customer_name}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {estimate.status}
                  </Badge>
                </div>

                <div className="flex justify-between items-center">
                  <p className="text-xs text-gray-500">
                    {estimate.line_items.length} item{estimate.line_items.length !== 1 ? 's' : ''}
                  </p>
                  <p className="font-semibold text-sm text-gray-900">
                    ${estimate.total_amount.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
