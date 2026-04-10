/**
 * CashFlowForecast
 * 30-day cash flow projection for the main dashboard
 * Shows expected inflows, outflows, and net cash position
 */

import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

interface ForecastDay {
  date: string;
  projected_inflow: number;
  projected_outflow: number;
  net: number;
}

interface ForecastSummary {
  total_projected_inflow: number;
  total_projected_outflow: number;
  net_30_day: number;
}

interface ForecastData {
  data: ForecastDay[];
  summary: ForecastSummary;
}

export const CashFlowForecast: React.FC = () => {
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [summary, setSummary] = useState<ForecastSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchForecast = async () => {
      try {
        const token = localStorage.getItem('ci_token');
        const response = await fetch('/api/aria/cash-forecast', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) throw new Error('Failed to fetch forecast');

        const result: ForecastData = await response.json();
        setForecast(result.data || []);
        setSummary(result.summary || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error('[CashFlowForecast]', err);
      } finally {
        setLoading(false);
      }
    };

    fetchForecast();
  }, []);

  const formatCurrency = (value: number) => {
    return `$${(value / 1000).toFixed(0)}k`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 animate-pulse">
        <div className="h-6 w-48 bg-gray-200 rounded mb-4" />
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-5/6" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-xl shadow-sm p-6">
        <h3 className="font-semibold text-red-600 mb-2">Error Loading Forecast</h3>
        <p className="text-sm text-gray-600">{error}</p>
      </div>
    );
  }

  if (forecast.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 text-center">
        <h3 className="font-semibold text-gray-800 mb-2">30-Day Cash Flow Forecast</h3>
        <p className="text-sm text-gray-500">No submitted pay apps in the next 30 days</p>
        <p className="text-xs text-gray-400 mt-2">Create and submit pay applications to see projections</p>
      </div>
    );
  }

  const chartData = forecast.map((day) => ({
    ...day,
    date: formatDate(day.date),
  }));

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">30-Day Cash Flow Forecast</h3>
          <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
            <span className="w-2 h-2 rounded-full bg-cyan-500" />
            Powered by ARIA
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
          <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 12 }} stroke="#94a3b8" />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
            }}
            formatter={(value: any) => `$${(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            labelFormatter={(label: any) => `Date: ${label}`}
          />
          <Legend />
          <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="5 5" />
          <Bar dataKey="projected_inflow" fill="#2563eb" name="Projected In" />
          <Bar dataKey="projected_outflow" fill="#dc2626" name="Projected Out" />
        </BarChart>
      </ResponsiveContainer>

      {summary && (
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Expected In</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">
              ${summary.total_projected_inflow.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Expected Out</p>
            <p className="text-2xl font-bold text-red-900 mt-1">
              ${summary.total_projected_outflow.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div
            className={`rounded-lg p-4 border ${
              summary.net_30_day >= 0
                ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200'
                : 'bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200'
            }`}
          >
            <p className={`text-xs font-semibold uppercase tracking-wide ${summary.net_30_day >= 0 ? 'text-green-600' : 'text-amber-600'}`}>Net Position</p>
            <p className={`text-2xl font-bold mt-1 ${summary.net_30_day >= 0 ? 'text-green-900' : 'text-amber-900'}`}>
              ${summary.net_30_day.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashFlowForecast;
