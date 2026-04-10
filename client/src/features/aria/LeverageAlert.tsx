/**
 * LeverageAlert
 * Shows the best time to send follow-up based on payer payment patterns
 * Displays leverage score and days-to-pay estimate
 */

import React, { useEffect, useState } from 'react';

interface LeverageTiming {
  project_id: number;
  avg_days_to_pay: number;
  best_day_to_send: string;
  leverage_score: number;
  recommendation: string;
}

interface LeverageAlertProps {
  projectId: number;
}

export const LeverageAlert: React.FC<LeverageAlertProps> = ({ projectId }) => {
  const [timing, setTiming] = useState<LeverageTiming | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTiming = async () => {
      try {
        const token = localStorage.getItem('jwt_token');
        const response = await fetch(`/api/aria/leverage-timing/${projectId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) throw new Error('Failed to fetch leverage timing');

        const result = await response.json();
        setTiming(result.data || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error('[LeverageAlert]', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTiming();
  }, [projectId]);

  if (loading) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 animate-pulse">
        <div className="h-5 w-32 bg-amber-200 rounded mb-2" />
        <div className="h-4 w-48 bg-amber-200 rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm text-amber-700">Could not load timing data</p>
      </div>
    );
  }

  if (!timing) {
    return null;
  }

  const scorePercent = (timing.leverage_score / 10) * 100;
  const scoreColor = timing.leverage_score >= 7 ? 'bg-green-500' : timing.leverage_score >= 5 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="flex items-start justify-between mb-3">
        <h4 className="font-semibold text-amber-900">Best Time to Follow-Up</h4>
        <span className="text-sm font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded">{timing.best_day_to_send}</span>
      </div>

      <p className="text-sm text-amber-800 mb-3">
        <span className="font-semibold">Typical payment window:</span> {timing.avg_days_to_pay} days
      </p>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Leverage Score</span>
          <span className="text-sm font-bold text-amber-900">{timing.leverage_score}/10</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className={`h-2 rounded-full ${scoreColor}`} style={{ width: `${scorePercent}%` }} />
        </div>
      </div>

      <p className="text-xs text-amber-700 italic">{timing.recommendation}</p>
    </div>
  );
};

export default LeverageAlert;
