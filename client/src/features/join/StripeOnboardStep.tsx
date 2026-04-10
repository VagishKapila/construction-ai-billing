import React, { useState } from 'react';

interface StripeOnboardStepProps {
  token: string;
  onComplete: () => void;
  onSkip: () => void;
}

const StripeOnboardStep: React.FC<StripeOnboardStepProps> = ({ token, onComplete, onSkip }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/stripe/sub-connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await resp.json();
      if (data.url) {
        // After Stripe onboarding, it will redirect back to join.html — call onComplete there
        onComplete();
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to start onboarding');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect. Try again.');
      setLoading(false);
    }
  };

  const benefits = [
    { icon: '💰', title: 'Direct ACH Payments', desc: 'Get paid in 1-2 business days, $25 flat fee' },
    { icon: '🔒', title: 'Secure & Encrypted', desc: 'Bank-level security via Stripe Connect' },
    { icon: '⚡', title: 'Takes 2 Minutes', desc: 'Connect once, get paid automatically on every job' },
  ];

  return (
    <div style={{
      background: '#ffffff',
      border: '1.5px solid #e2e8f0',
      borderRadius: 12,
      padding: 32,
      maxWidth: 440,
      width: '100%',
      boxShadow: '0 4px 24px rgba(37,99,235,0.08)',
      fontFamily: 'Inter, sans-serif'
    }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
        Get Paid Faster
      </h2>
      <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
        Connect your bank to receive direct payments when invoices are approved. Optional — connect later in Settings.
      </p>

      {benefits.map(b => (
        <div key={b.title} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{b.icon}</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{b.title}</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>{b.desc}</div>
          </div>
        </div>
      ))}

      {error && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 12, padding: '8px', background: '#fef2f2', borderRadius: 6 }}>{error}</p>}

      <button
        onClick={handleConnect}
        disabled={loading}
        style={{
          width: '100%', height: 48, background: loading ? '#a78bfa' : '#7c3aed',
          color: '#ffffff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 15,
          cursor: loading ? 'not-allowed' : 'pointer', marginTop: 20, fontFamily: 'inherit',
          transition: 'all 0.2s'
        }}
      >
        {loading ? 'Opening Stripe...' : 'Connect Bank — 2 minutes'}
      </button>

      <button
        onClick={onSkip}
        style={{
          width: '100%', background: 'none', border: 'none', color: '#64748b',
          fontSize: 14, cursor: 'pointer', marginTop: 12, textDecoration: 'underline',
          padding: '8px 0', fontFamily: 'inherit'
        }}
      >
        Skip for now →
      </button>
    </div>
  );
};

export default StripeOnboardStep;
