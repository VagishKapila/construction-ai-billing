import React from 'react';
import { getTierName, TIER_STYLES, MAX_SCORE } from './TrustScoreBadge';

interface VendorScoreViewProps {
  score: number;
  showDetails?: boolean;
  vendorName?: string;
}

const VendorScoreView: React.FC<VendorScoreViewProps> = ({ score, showDetails = true }) => {
  const tierName = getTierName(score);
  const tier = TIER_STYLES[tierName];
  const percentage = (score / MAX_SCORE) * 100;

  return (
    <div
      style={{
        padding: 20,
        background: tier.bg,
        border: `2px solid ${tier.color}`,
        borderRadius: 12,
        maxWidth: 400,
      }}
    >
      {/* Title */}
      <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', marginBottom: 12 }}>
        Trust Score
      </div>

      {/* Big Score Display */}
      <div
        style={{
          fontSize: 48,
          fontWeight: 900,
          color: tier.color,
          textAlign: 'center',
          marginBottom: 4,
        }}
      >
        {score}
      </div>

      {/* Tier Badge */}
      <div
        style={{
          textAlign: 'center',
          padding: 8,
          background: tier.color,
          color: '#fff',
          borderRadius: 6,
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 16,
        }}
      >
        {tier.label}
      </div>

      {/* Progress Bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ height: 10, background: '#ffffff', borderRadius: 5, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              background: tier.color,
              width: `${percentage}%`,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <div
          style={{
            fontSize: 11,
            color: '#6b7280',
            marginTop: 6,
            textAlign: 'center',
          }}
        >
          {percentage.toFixed(0)}% of maximum
        </div>
      </div>

      {showDetails && (
        <div style={{ paddingTop: 16, borderTop: `1px solid ${tier.color}` }}>
          {/* Tier Ranges */}
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1f2937', marginBottom: 8 }}>
            Tier Ranges
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { name: 'Platinum', min: 687 },
              { name: 'Gold', min: 534 },
              { name: 'Silver', min: 381 },
              { name: 'Bronze', min: 229 },
              { name: 'Under Review', min: 0 },
            ].map((tier) => (
              <div
                key={tier.name}
                style={{
                  padding: 8,
                  background: '#ffffff',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 500,
                  color: '#4b5563',
                }}
              >
                {tier.name}: {tier.min}+
              </div>
            ))}
          </div>

          {/* What it Means */}
          <div style={{ marginTop: 12, fontSize: 11, color: '#6b7280', lineHeight: 1.6 }}>
            <strong style={{ color: '#1f2937' }}>What this means:</strong>
            {tierName === 'platinum' && ' You are an exceptional vendor! Keep up the great work.'}
            {tierName === 'gold' && ' You have a strong record. A few more approvals will get you to Platinum.'}
            {tierName === 'silver' && ' You are a reliable vendor. Work towards Gold by reducing rejections.'}
            {tierName === 'bronze' && ' You are building your record. Focus on quality submissions.'}
            {tierName === 'review' && ' Your submissions are under review. Follow feedback to improve.'}
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorScoreView;
