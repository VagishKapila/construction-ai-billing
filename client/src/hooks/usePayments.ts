/**
 * usePayments Hook — Payments dashboard and tracking
 */

import { useState, useEffect, useCallback } from 'react';
import type { Payment } from '@/types';
import * as paymentsApi from '@/api/payments';

export interface UsePaymentsReturn {
  payments: Payment[];
  summary: paymentsApi.PaymentsListResponse['summary'] | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePayments(): UsePaymentsReturn {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<paymentsApi.PaymentsListResponse['summary'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch all payments
   */
  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await paymentsApi.getPayments();

      if (response.error) {
        setError(response.error);
        setPayments([]);
        setSummary(null);
      } else if (response.data) {
        setPayments(response.data.payments);
        setSummary(response.data.summary);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load payments';
      setError(message);
      setPayments([]);
      setSummary(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Load on mount
   */
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    payments,
    summary,
    isLoading,
    error,
    refresh,
  };
}
