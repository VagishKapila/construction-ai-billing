/**
 * QuickBooks Sync Button
 * Button component for syncing a project to QuickBooks
 * States: not_synced | syncing | synced | error
 */

import { useState } from 'react';
import { Loader2, Check, AlertCircle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import * as QB from '@/api/quickbooks';

interface QBSyncButtonProps {
  projectId: number;
  qbSyncStatus?: string; // 'not_synced' | 'syncing' | 'synced' | 'error'
  onSyncComplete?: (result: QB.QBSyncResult) => void;
  onSyncError?: (error: string) => void;
  variant?: 'icon' | 'button';
}

export function QBSyncButton({
  projectId,
  qbSyncStatus = 'not_synced',
  onSyncComplete,
  onSyncError,
  variant = 'button',
}: QBSyncButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState<QB.QBSyncResult | null>(null);

  async function handleSync() {
    try {
      setSyncing(true);
      setShowResult(false);

      const response = await QB.syncProject(projectId);

      if (response.data) {
        setResult(response.data);
        setShowResult(true);
        onSyncComplete?.(response.data);

        // Auto-hide result after 3 seconds if successful
        if (response.data.success) {
          setTimeout(() => setShowResult(false), 3000);
        }
      } else {
        const error = response.error || 'Sync failed';
        onSyncError?.(error);
        setShowResult(true);
        setResult({ success: false, synced: [], errors: [{ type: 'sync', message: error }] });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Sync failed';
      onSyncError?.(error);
      setShowResult(true);
      setResult({ success: false, synced: [], errors: [{ type: 'sync', message: error }] });
    } finally {
      setSyncing(false);
    }
  }

  const isSynced = qbSyncStatus === 'synced';
  const hasError = qbSyncStatus === 'error';

  if (variant === 'icon') {
    return (
      <div className="relative inline-block">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="p-2 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={isSynced ? 'Re-sync to QuickBooks' : 'Sync to QuickBooks'}
        >
          {syncing ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
          ) : isSynced ? (
            <Check className="w-4 h-4 text-green-600" />
          ) : hasError ? (
            <AlertCircle className="w-4 h-4 text-red-500" />
          ) : (
            <RotateCw className="w-4 h-4 text-gray-400" />
          )}
        </button>
      </div>
    );
  }

  // Button variant
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          onClick={handleSync}
          disabled={syncing}
          variant={hasError ? 'destructive' : isSynced ? 'secondary' : 'default'}
          size="sm"
          className="gap-2"
        >
          {syncing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Syncing...
            </>
          ) : isSynced ? (
            <>
              <Check className="w-4 h-4" />
              Synced
              <RotateCw className="w-4 h-4" />
            </>
          ) : hasError ? (
            <>
              <AlertCircle className="w-4 h-4" />
              Retry
            </>
          ) : (
            <>
              <RotateCw className="w-4 h-4" />
              Sync to QuickBooks
            </>
          )}
        </Button>

        {isSynced && (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            Synced
          </Badge>
        )}

        {hasError && (
          <Badge variant="danger">Failed</Badge>
        )}
      </div>

      {/* Result toast */}
      {showResult && result && (
        <div
          className={`p-3 rounded-md text-sm ${
            result.success
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {result.success ? (
            <p>
              Synced {result.synced.length} item{result.synced.length !== 1 ? 's' : ''}
              {result.errors.length > 0 && ` with ${result.errors.length} error(s)`}
            </p>
          ) : (
            <div>
              <p className="font-medium">Sync failed</p>
              {result.errors.length > 0 && (
                <ul className="mt-1 space-y-1">
                  {result.errors.slice(0, 3).map((err, i) => (
                    <li key={i} className="text-xs opacity-90">
                      {err.type}: {err.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
