import { useState, useEffect } from 'react';
import type { OutstandingInvoice, CashFlowForecast, PayerPattern } from '../types';

const API = import.meta.env.VITE_API_URL || '';

// Must match TOKEN_KEY in client/src/api/client.ts
const TOKEN_KEY = 'ci_token';

function authHeader(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export function useCashFlow() {
  const [outstanding, setOutstanding] = useState<OutstandingInvoice[]>([]);
  const [forecast, setForecast] = useState<CashFlowForecast | null>(null);
  const [payerPatterns, setPayerPatterns] = useState<PayerPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [outRes, foreRes, payerRes] = await Promise.all([
          fetch(`${API}/api/collection/outstanding`, { headers: authHeader() }),
          fetch(`${API}/api/collection/forecast`, { headers: authHeader() }),
          fetch(`${API}/api/collection/payer-patterns`, { headers: authHeader() }),
        ]);
        if (outRes.ok) {
          const data = await outRes.json();
          setOutstanding(data.data || []);
        }
        if (foreRes.ok) {
          const data = await foreRes.json();
          setForecast(data);
        }
        if (payerRes.ok) {
          const data = await payerRes.json();
          setPayerPatterns(data.data || []);
        }
      } catch (e) {
        setError('Failed to load cash flow data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return { outstanding, forecast, payerPatterns, loading, error };
}
