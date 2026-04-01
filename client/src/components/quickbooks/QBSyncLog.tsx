/**
 * QuickBooks Sync Log
 * Table showing sync history for projects or globally
 * Displays sync status, dates, QB entity IDs, and errors
 */

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import * as QB from '@/api/quickbooks';
import type { QBSyncLogEntry } from '@/api/quickbooks';

interface QBSyncLogProps {
  projectId?: number;
}

export function QBSyncLog({ projectId }: QBSyncLogProps) {
  const [entries, setEntries] = useState<QBSyncLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    loadSyncLog();
  }, [projectId]);

  async function loadSyncLog() {
    try {
      setLoading(true);
      setError(null);

      const response = projectId
        ? await QB.getProjectSyncLog(projectId)
        : await QB.getSyncLog();

      if (response.data) {
        // Sort by synced_at descending (newest first)
        const sorted = [...response.data].sort(
          (a, b) => new Date(b.synced_at).getTime() - new Date(a.synced_at).getTime()
        );
        setEntries(sorted);
      } else {
        setError(response.error || 'Failed to load sync log');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-blue-600" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-50 text-green-700 border-green-200">Success</Badge>;
      case 'pending':
        return <Badge className="bg-blue-50 text-blue-700 border-blue-200">Pending</Badge>;
      case 'failed':
        return <Badge variant="danger">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSyncDirectionLabel = (direction: string) => {
    return direction === 'push' ? 'To QB' : 'From QB';
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sync History</CardTitle>
          <CardDescription>
            {projectId ? 'Project sync history' : 'All sync operations'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sync History</CardTitle>
        <CardDescription>
          {projectId ? 'Project sync history' : 'All sync operations'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-md mb-4">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {entries.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-600 text-sm">
              {projectId ? 'No sync history for this project' : 'No sync operations yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {entries.map((entry) => (
              <div key={entry.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  className="w-full text-left hover:bg-gray-50 transition-colors p-3 flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {getStatusIcon(entry.sync_status)}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-gray-900">
                          {entry.qb_entity_type}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {getSyncDirectionLabel(entry.sync_direction)}
                        </Badge>
                        {getStatusBadge(entry.sync_status)}
                      </div>

                      <p className="text-xs text-gray-600 mt-1">
                        {entry.project_name && (
                          <>
                            <span>{entry.project_name}</span>
                            {entry.sync_type && <span> • {entry.sync_type}</span>}
                          </>
                        )}
                      </p>

                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(entry.synced_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${
                      expandedId === entry.id ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Expanded details */}
                {expandedId === entry.id && (
                  <div className="border-t border-gray-200 bg-gray-50 p-3 space-y-2 text-sm">
                    {entry.qb_entity_id && (
                      <div>
                        <p className="text-xs text-gray-600">QB ID</p>
                        <p className="font-mono text-xs text-gray-900">{entry.qb_entity_id}</p>
                      </div>
                    )}

                    {entry.error_message && (
                      <div>
                        <p className="text-xs text-gray-600">Error</p>
                        <p className="text-xs text-red-700 bg-red-50 p-2 rounded border border-red-200">
                          {entry.error_message}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {entry.sync_type && (
                        <div>
                          <p className="text-gray-600">Type</p>
                          <p className="font-medium">{entry.sync_type}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-gray-600">Status</p>
                        <p className="font-medium">{entry.sync_status}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
