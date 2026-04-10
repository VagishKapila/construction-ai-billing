/**
 * ARIAInsights
 * Aggregated insight cards for a project (Hub tab)
 * Shows overdue invoices, lien alerts, CO leakage, and all-clear state
 */

import React, { useEffect, useState } from 'react';

interface Insight {
  type: 'overdue_invoices' | 'lien_deadline' | 'co_leakage' | 'all_clear';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'danger';
  action_label: string | null;
  action_url: string | null;
}

interface ARIAInsightsProps {
  projectId: number;
}

const severityStyles = {
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: '💡',
    textColor: 'text-blue-800',
    leftBorder: 'border-l-4 border-l-blue-500',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: '⚠️',
    textColor: 'text-amber-800',
    leftBorder: 'border-l-4 border-l-amber-500',
  },
  danger: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: '🚨',
    textColor: 'text-red-800',
    leftBorder: 'border-l-4 border-l-red-500',
  },
};

export const ARIAInsights: React.FC<ARIAInsightsProps> = ({ projectId }) => {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        const token = localStorage.getItem('jwt_token');
        const response = await fetch(`/api/aria/insights/${projectId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) throw new Error('Failed to fetch insights');

        const result = await response.json();
        setInsights(result.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error('[ARIAInsights]', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, [projectId]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
          <div className="h-5 w-32 bg-gray-200 rounded mb-2" />
          <div className="h-4 w-48 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-700 font-semibold">Could not load insights</p>
        <p className="text-xs text-red-600 mt-1">{error}</p>
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
        <p className="text-sm font-semibold text-blue-800">No Insights Available</p>
        <p className="text-xs text-blue-700 mt-1">ARIA is monitoring your project</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {insights.map((insight, idx) => {
        const style = severityStyles[insight.severity];

        return (
          <div key={idx} className={`${style.bg} ${style.border} border rounded-lg p-4 ${style.leftBorder}`}>
            <div className="flex items-start justify-between mb-2">
              <h4 className={`font-semibold ${style.textColor}`}>{insight.title}</h4>
              <span className="text-lg">{style.icon}</span>
            </div>

            <p className={`text-sm ${style.textColor} mb-3`}>{insight.message}</p>

            {insight.action_label && insight.action_url && (
              <a
                href={insight.action_url}
                className={`inline-block text-sm font-semibold px-3 py-1.5 rounded-md transition-colors ${
                  insight.severity === 'danger'
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : insight.severity === 'warning'
                      ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                }`}
              >
                {insight.action_label}
              </a>
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-center pt-2">
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-cyan-500" />
          Powered by ARIA Cash Intelligence
        </p>
      </div>
    </div>
  );
};

export default ARIAInsights;
