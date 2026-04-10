import React from 'react';

const MAX_SCORE = 763;

const TIER_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  platinum: { bg: '#f5f3ff', color: '#7c3aed', label: 'Platinum' },
  gold:     { bg: '#fef9c3', color: '#d97706', label: 'Gold' },
  silver:   { bg: '#f1f5f9', color: '#64748b', label: 'Silver' },
  bronze:   { bg: '#fef3c7', color: '#ea580c', label: 'Bronze' },
  review:   { bg: '#fef2f2', color: '#dc2626', label: 'Under Review' },
};

function getTierName(score: number): string {
  if (score >= 687) return 'platinum';
  if (score >= 534) return 'gold';
  if (score >= 381) return 'silver';
  if (score >= 229) return 'bronze';
  return 'review';
}

interface TrustScoreBadgeProps {
  score: number;
  maxScore?: number;
  size?: 'sm' | 'md' | 'lg';
  showTier?: boolean;
}

const TrustScoreBadge: React.FC<TrustScoreBadgeProps> = ({ score, maxScore = MAX_SCORE, size = 'md', showTier = true }) => {
  const tierName = getTierName(score);
  const tier = TIER_STYLES[tierName];
  const fontSizes = { sm: 12, md: 14, lg: 16 };
  const paddings = { sm: '2px 8px', md: '4px 10px', lg: '6px 14px' };
  const fs = fontSizes[size];

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontWeight: 700, color: '#0f172a', fontSize: fs }}>
        {score}/{maxScore}
      </span>
      {showTier && (
        <span style={{ background: tier.bg, color: tier.color, padding: paddings[size], borderRadius: 20, fontWeight: 600, fontSize: fs - 1, whiteSpace: 'nowrap' as const }}>
          {tier.label}
        </span>
      )}
    </div>
  );
};

export { MAX_SCORE, getTierName, TIER_STYLES };
export default TrustScoreBadge;
