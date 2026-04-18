/**
 * FollowUpQueue
 * Shows all overdue invoices requiring follow-up
 * Displays tone recommendations and allows sending follow-up emails
 */

import React, { useEffect, useState } from 'react';

interface PayAppWithTone {
  id: number;
  app_number: string;
  project_name: string;
  owner_email: string;
  owner_name: string;
  amount_due: number;
  days_overdue: number;
  tone: 'gentle' | 'firm' | 'final';
}

export const FollowUpQueue: React.FC = () => {
  const [queue, setQueue] = useState<PayAppWithTone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [sentId, setSentId] = useState<number | null>(null);

  useEffect(() => {
    fetchQueue();
  }, []);

  const fetchQueue = async () => {
    try {
      const token = localStorage.getItem('ci_token');
      const response = await fetch('/api/aria/follow-up-queue', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch queue');

      const result = await response.json();
      setQueue(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('[FollowUpQueue]', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendFollowUp = async (payAppId: number) => {
    setSendingId(payAppId);
    try {
      const token = localStorage.getItem('ci_token');
      const response = await fetch(`/api/aria/trigger-follow-up/${payAppId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error('Failed to send follow-up');

      setSentId(payAppId);
      setTimeout(() => setSentId(null), 3000);

      // Refresh queue
      await fetchQueue();
    } catch (err) {
      console.error('[Send Follow-Up Error]', err);
      alert('Failed to send follow-up. Please try again.');
    } finally {
      setSendingId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-4 animate-pulse">
              <div className="grid grid-cols-5 gap-4 mb-2">
                <div className="h-4 bg-gray-200 rounded col-span-2" />
                <div className="h-4 bg-gray-200 rounded" />
                <div className="h-4 bg-gray-200 rounded" />
                <div className="h-4 bg-gray-200 rounded" />
              </div>
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-xl shadow-sm p-6">
        <h3 className="font-semibold text-red-600 mb-2">Error Loading Queue</h3>
        <p className="text-sm text-gray-600">{error}</p>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 text-center">
        <p className="text-lg font-semibold text-gray-800 mb-1">No Overdue Invoices</p>
        <p className="text-sm text-gray-500">You're all caught up — all invoices are being paid on time.</p>
      </div>
    );
  }

  const getToneBadgeColor = (tone: string) => {
    switch (tone) {
      case 'gentle':
        return 'bg-green-100 text-green-800';
      case 'firm':
        return 'bg-amber-100 text-amber-800';
      case 'final':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Follow-Up Queue</h3>
        <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
          <span className="w-2 h-2 rounded-full bg-cyan-500" />
          ARIA-Recommended Follow-Ups
        </p>
      </div>

      <div className="space-y-3">
        {queue.map((payApp) => (
          <div key={payApp.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-center">
              <div className="md:col-span-2">
                <p className="font-semibold text-gray-900">{payApp.project_name}</p>
                <p className="text-sm text-gray-500">#{payApp.app_number}</p>
                <p className="text-xs text-gray-400 mt-1">{payApp.owner_name}</p>
              </div>

              <div>
                <p className="text-sm text-gray-600 font-semibold">
                  ${payApp.amount_due.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-gray-400">Amount Due</p>
              </div>

              <div>
                <p className="text-sm font-semibold text-red-600">{payApp.days_overdue}d</p>
                <p className="text-xs text-gray-400">Overdue</p>
              </div>

              <div>
                <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${getToneBadgeColor(payApp.tone)}`}>
                  {payApp.tone}
                </span>
              </div>

              <div>
                <button
                  onClick={() => handleSendFollowUp(payApp.id)}
                  disabled={sendingId === payApp.id}
                  className={`w-full px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                    sentId === payApp.id
                      ? 'bg-green-100 text-green-800'
                      : sendingId === payApp.id
                        ? 'bg-gray-400 text-white'
                        : 'bg-cyan-600 hover:bg-cyan-700 text-white'
                  }`}
                >
                  {sentId === payApp.id ? '✓ Sent' : sendingId === payApp.id ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200 text-center">
        <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
          <span className="w-2 h-2 rounded-full bg-cyan-500" />
          {queue.length} invoice{queue.length !== 1 ? 's' : ''} awaiting action
        </p>
      </div>
    </div>
  );
};

export default FollowUpQueue;
