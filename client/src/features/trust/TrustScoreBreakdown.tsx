import React, { useState, useEffect } from 'react';
import { getTierName, TIER_STYLES } from './TrustScoreBadge';

interface TrustEvent {
  id: number;
  event_type: string;
  score_delta: number;
  score_after: number;
  rejection_category: string | null;
  coaching_note: string | null;
  created_at: string;
}

interface TrustScoreBreakdownProps {
  score: number;
  maxScore: number;
  trustScoreId: number;
}

const TrustScoreBreakdown: React.FC<TrustScoreBreakdownProps> = ({ score, maxScore, trustScoreId }) => {
  const [history, setHistory] = useState<TrustEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/trust/history/${trustScoreId}`);
        if (!response.ok) throw new Error('Failed to fetch history');
        const { data } = await response.json();
        setHistory(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [trustScoreId]);

  const tierName = getTierName(score);
  const tier = TIER_STYLES[tierName];
  const percentage = (score / maxScore) * 100;

  return (
    <div style={{ padding: 20, background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
      {/* Score Bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, color: '#1f2937' }}>Trust Score Performance</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: tier.color }}>{score}/{maxScore}</span>
        </div>
        <div style={{ height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              background: tier.color,
              width: `${percentage}%`,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
          {percentage.toFixed(0)}% ({tier.label})
        </div>
      </div>

      {/* Coaching Tip */}
      <div
        style={{
          padding: 12,
          background: tier.bg,
          border: `1px solid ${tier.color}`,
          borderRadius: 6,
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: tier.color, marginBottom: 4 }}>AI Coaching</div>
        {history.length > 0 && history[0].coaching_note ? (
          <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.5 }}>
            {history[0].coaching_note}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#6b7280', fontStyle: 'italic' }}>
            Keep submitting high-quality invoices to improve your score.
          </div>
        )}
      </div>

      {/* History */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', marginBottom: 12 }}>Recent Activity</div>
        {loading ? (
          <div style={{ fontSize: 13, color: '#6b7280' }}>Loading history...</div>
        ) : error ? (
          <div style={{ fontSize: 13, color: '#dc2626' }}>Error: {error}</div>
        ) : history.length === 0 ? (
          <div style={{ fontSize: 13, color: '#6b7280' }}>No events yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.map((event) => (
              <div
                key={event.id}
                style={{
                  padding: 10,
                  background: '#f9fafb',
                  borderRadius: 6,
                  borderLeft: `3px solid ${event.score_delta >= 0 ? '#10b981' : '#ef4444'}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2937', textTransform: 'capitalize' }}>
                    {event.event_type.replace(/_/g, ' ')}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: event.score_delta >= 0 ? '#10b981' : '#ef4444',
                    }}
                  >
                    {event.score_delta >= 0 ? '+' : ''}{event.score_delta}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>
                  Score: {event.score_after}/{763}
                </div>
                {event.rejection_category && (
                  <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>
                    Category: {event.rejection_category.replace(/_/g, ' ')}
                  </div>
                )}
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 6 }}>
                  {new Date(event.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrustScoreBreakdown;
