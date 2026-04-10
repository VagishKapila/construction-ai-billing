import { useEffect, useState } from 'react';
import {
  BarChart, Bar, PieChart, Pie, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';
import { Download, Loader } from 'lucide-react';

interface HubReportsProps {
  projectId: number;
}

interface Summary {
  total_docs: number;
  approved: number;
  pending: number;
  rejected: number;
  total_trades: number;
}

interface ReportData {
  docs_by_trade: Array<{ trade_name: string; count: number }>;
  rejection_reasons: Array<{ category: string; count: number }>;
  trust_score_history: Array<{ date: string; score: number; trade_name: string }>;
  summary: Summary;
}

const COLORS = ['#dc2626', '#d97706', '#7c3aed', '#0891b2', '#059669'];

export default function HubReports({ projectId }: HubReportsProps) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/hub-reports`);
        const json = await response.json();

        if (json.error) {
          setError(json.error);
          return;
        }

        setData(json.data);
      } catch (err) {
        setError('Failed to load reports');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [projectId]);

  const handleExport = async () => {
    setExporting(true);
    try {
      window.location.href = `/api/projects/${projectId}/hub-reports/export`;
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-e2e8f0 p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading reports...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-xl border border-e2e8f0 p-6">
        <div className="text-center py-12">
          <p className="text-red-600">{error || 'Failed to load reports'}</p>
        </div>
      </div>
    );
  }

  // Process trust score history for line chart (group by date, average scores)
  const trustScoreByDate: Record<string, { date: string; score: number; trades: Record<string, number> }> = {};
  data.trust_score_history.forEach(item => {
    if (!trustScoreByDate[item.date]) {
      trustScoreByDate[item.date] = { date: item.date, score: 0, trades: {} };
    }
    trustScoreByDate[item.date].trades[item.trade_name] = item.score;
    trustScoreByDate[item.date].score = Math.max(trustScoreByDate[item.date].score, item.score);
  });
  const trustScoreChartData = Object.values(trustScoreByDate).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      {/* Header with Export Button */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Hub Reports</h2>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium flex items-center gap-2 hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {exporting ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Export CSV
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-e2e8f0 p-4">
          <div className="text-sm text-gray-600">Total Documents</div>
          <div className="text-2xl font-bold text-gray-900">{data.summary.total_docs}</div>
        </div>
        <div className="bg-white rounded-xl border border-e2e8f0 p-4">
          <div className="text-sm text-gray-600">Approved</div>
          <div className="text-2xl font-bold text-green-600">{data.summary.approved}</div>
        </div>
        <div className="bg-white rounded-xl border border-e2e8f0 p-4">
          <div className="text-sm text-gray-600">Rejected</div>
          <div className="text-2xl font-bold text-red-600">{data.summary.rejected}</div>
        </div>
        <div className="bg-white rounded-xl border border-e2e8f0 p-4">
          <div className="text-sm text-gray-600">Total Trades</div>
          <div className="text-2xl font-bold text-blue-600">{data.summary.total_trades}</div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Documents by Trade */}
        <div className="bg-white rounded-xl border border-e2e8f0 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Documents by Trade</h3>
          {data.docs_by_trade.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.docs_by_trade}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="trade_name" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-gray-500 py-12">No data available</p>
          )}
        </div>

        {/* Rejection Reasons */}
        <div className="bg-white rounded-xl border border-e2e8f0 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Rejection Reasons</h3>
          {data.rejection_reasons.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.rejection_reasons}
                  dataKey="count"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                >
                  {data.rejection_reasons.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12">
              <p className="text-green-600 font-medium">No rejections — great track record!</p>
            </div>
          )}
        </div>
      </div>

      {/* Trust Score History */}
      <div className="bg-white rounded-xl border border-e2e8f0 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Trust Score History (90 days)</h3>
        {trustScoreChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trustScoreChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={[0, 763]} />
              <Tooltip />
              <Legend />
              <ReferenceLine y={381} stroke="#fbbf24" strokeDasharray="5 5" label={{ value: 'Silver (381)', position: 'right' }} />
              <ReferenceLine y={534} stroke="#eab308" strokeDasharray="5 5" label={{ value: 'Gold (534)', position: 'right' }} />
              <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2} dot={false} name="Trust Score" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-center text-gray-500 py-12">No historical data yet</p>
        )}
      </div>
    </div>
  );
}
