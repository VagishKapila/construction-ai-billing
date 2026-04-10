/**
 * LienAlert
 * Shows California preliminary notice deadline and urgency
 * Allows download of preliminary notice PDF
 */

import React, { useEffect, useState } from 'react';

interface LienAlertData {
  id: number;
  project_id: number;
  work_start_date: string;
  preliminary_notice_due: string;
  mechanics_lien_deadline: string;
  stop_payment_deadline: string;
  alert_day_15_sent: boolean;
  alert_day_19_sent: boolean;
  alert_day_20_sent: boolean;
}

interface LienAlertProps {
  projectId: number;
}

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const getDaysRemaining = (dateStr: string) => {
  const deadline = new Date(dateStr);
  const today = new Date();
  const diff = deadline.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const getUrgencyColor = (daysRemaining: number): string => {
  if (daysRemaining > 5) return 'bg-green-50 border-green-200';
  if (daysRemaining > 3) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
};

const getUrgencyTextColor = (daysRemaining: number): string => {
  if (daysRemaining > 5) return 'text-green-800';
  if (daysRemaining > 3) return 'text-amber-800';
  return 'text-red-800';
};

const getUrgencyBadgeColor = (daysRemaining: number): string => {
  if (daysRemaining > 5) return 'bg-green-100 text-green-800';
  if (daysRemaining > 3) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
};

export const LienAlert: React.FC<LienAlertProps> = ({ projectId }) => {
  const [alert, setAlert] = useState<LienAlertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    const fetchAlert = async () => {
      try {
        const token = localStorage.getItem('jwt_token');
        const response = await fetch('/api/aria/lien-alerts', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) throw new Error('Failed to fetch lien alerts');

        const result = await response.json();
        const projectAlert = result.data?.find((a: LienAlertData) => a.project_id === projectId);
        setAlert(projectAlert || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error('[LienAlert]', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAlert();
  }, [projectId]);

  const handleDownloadPdf = async () => {
    if (!alert) return;

    setDownloadingPdf(true);
    try {
      const token = localStorage.getItem('jwt_token');
      const response = await fetch(`/api/aria/lien-alerts/${projectId}/pdf`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to download PDF');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `preliminary-notice-${projectId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('[Download PDF Error]', err);
      window.alert('Failed to download PDF. Please try again.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 animate-pulse">
        <div className="h-5 w-40 bg-purple-200 rounded mb-2" />
        <div className="h-4 w-48 bg-purple-200 rounded" />
      </div>
    );
  }

  if (error) {
    return null;
  }

  if (!alert) {
    return null;
  }

  const daysRemaining = getDaysRemaining(alert.preliminary_notice_due);
  const isUrgent = daysRemaining <= 7;

  if (daysRemaining < 0) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h4 className="font-semibold text-red-900 mb-2">⚖️ Preliminary Notice Deadline Passed</h4>
        <p className="text-sm text-red-800 mb-3">
          The deadline for providing preliminary notice was {Math.abs(daysRemaining)} days ago. Mechanics lien rights may be affected.
        </p>
        <p className="text-xs text-red-700">Consult with legal counsel regarding any mechanics lien issues.</p>
      </div>
    );
  }

  return (
    <div className={`border rounded-lg p-4 ${getUrgencyColor(daysRemaining)}`}>
      <div className="flex items-start justify-between mb-3">
        <h4 className={`font-semibold ${getUrgencyTextColor(daysRemaining)}`}>⚖️ CA Preliminary Notice Due</h4>
        {isUrgent && <span className={`text-xs font-bold px-2 py-1 rounded ${getUrgencyBadgeColor(daysRemaining)}`}>URGENT</span>}
      </div>

      <div className="space-y-2 mb-4 text-sm">
        <div>
          <span className="font-medium text-gray-700">Work Started:</span> {formatDate(alert.work_start_date)}
        </div>
        <div>
          <span className="font-medium text-gray-700">Notice Due:</span> {formatDate(alert.preliminary_notice_due)}
        </div>
        <div className={`font-semibold ${getUrgencyTextColor(daysRemaining)}`}>
          {daysRemaining === 1 ? '1 day remaining' : `${daysRemaining} days remaining`}
        </div>
      </div>

      <button
        onClick={handleDownloadPdf}
        disabled={downloadingPdf}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white text-sm font-semibold py-2 rounded-md transition-colors"
      >
        {downloadingPdf ? 'Downloading...' : 'Download Preliminary Notice PDF'}
      </button>

      <p className="text-xs text-gray-600 mt-3">
        Required by California Civil Code §8202. Send to all parties to preserve mechanics lien rights.
      </p>
    </div>
  );
};

export default LienAlert;
