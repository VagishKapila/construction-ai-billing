/**
 * QuickBooks Connection Card
 * Settings page component showing QB connection status and controls
 * States: Not connected | Connected | Loading | Error
 */

import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import * as QB from '@/api/quickbooks';
import type { QBConnectionStatus } from '@/api/quickbooks';

const QB_COLOR = '#2CA01C'; // QuickBooks brand green

interface QBConnectionCardProps {
  onStatusChange?: (status: QBConnectionStatus) => void;
}

export function QBConnectionCard({ onStatusChange }: QBConnectionCardProps) {
  const [status, setStatus] = useState<QBConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    try {
      setLoading(true);
      setError(null);
      const response = await QB.getQBStatus();
      if (response.data) {
        setStatus(response.data);
        onStatusChange?.(response.data);
      } else {
        setError(response.error || 'Failed to load QB status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    try {
      const response = await QB.getQBConnectUrl();
      if (response.data?.url) {
        window.location.href = response.data.url;
      } else {
        setError(response.error || 'Failed to get connect URL');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  }

  async function handleDisconnect() {
    if (!confirm('Are you sure you want to disconnect QuickBooks? Synced data will not be affected.')) {
      return;
    }

    try {
      setDisconnecting(true);
      setError(null);
      const response = await QB.disconnectQB();
      if (!response.error) {
        setStatus({ connected: false });
        onStatusChange?.({ connected: false });
      } else {
        setError(response.error || 'Failed to disconnect');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>QuickBooks Integration</CardTitle>
          <CardDescription>Connect your QuickBooks Online account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-10 w-40" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span>QuickBooks Integration</span>
              {status?.connected && (
                <CheckCircle2 className="w-5 h-5" style={{ color: QB_COLOR }} />
              )}
            </CardTitle>
            <CardDescription>
              Sync projects and estimates with QuickBooks Online
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-md">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {status?.connected ? (
          <>
            {/* Connected state */}
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Company Name</p>
                <p className="text-sm font-medium text-gray-900">{status.company_name}</p>
              </div>

              {status.last_sync_at && (
                <div>
                  <p className="text-sm text-gray-600">Last Synced</p>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(status.last_sync_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Badge variant="outline" style={{ backgroundColor: QB_COLOR, color: 'white', borderColor: QB_COLOR }}>
                  {status.sandbox ? 'Sandbox' : 'Production'}
                </Badge>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.open('https://qbo.intuit.com', '_blank');
                }}
                className="flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Open QuickBooks
              </Button>

              <Button
                variant="destructive"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnecting}
              >
                {disconnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    Disconnecting...
                  </>
                ) : (
                  'Disconnect'
                )}
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Not connected state */}
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Connect your QuickBooks Online account to:
              </p>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li>Sync projects and estimates</li>
                <li>Track billing and payments</li>
                <li>Maintain data consistency</li>
              </ul>
            </div>

            <Button
              onClick={handleConnect}
              className="w-full"
              style={{ backgroundColor: QB_COLOR }}
            >
              Connect QuickBooks
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
