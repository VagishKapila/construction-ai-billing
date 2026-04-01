/**
 * useReports Hook — Reports and analytics data
 * Handles dashboard stats, revenue summaries, and exports
 */

import { useState, useEffect, useCallback } from 'react';
import { downloadBlob } from '@/lib/download';
import * as reportsApi from '@/api/reports';

export interface UseReportsReturn {
  stats: reportsApi.DashboardStats | null;
  revenueSummary: reportsApi.RevenueSummary | null;
  payAppRows: reportsApi.PayAppReport[];
  isLoading: boolean;
  error: string | null;
  filters: reportsApi.ReportFilters;
  setFilters: (filters: reportsApi.ReportFilters) => void;
  exportCSV: () => Promise<void>;
  exportPDF: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useReports(): UseReportsReturn {
  const [stats, setStats] = useState<reportsApi.DashboardStats | null>(null);
  const [revenueSummary, setRevenueSummary] = useState<reportsApi.RevenueSummary | null>(null);
  const [payAppRows, setPayAppRows] = useState<reportsApi.PayAppReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<reportsApi.ReportFilters>({});

  /**
   * Fetch all report data
   */
  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch stats
      const statsResponse = await reportsApi.getStats();
      if (statsResponse.data) {
        setStats(statsResponse.data);
      } else if (statsResponse.error) {
        setError(statsResponse.error);
      }

      // Fetch revenue summary
      const revenuePeriod = filters.from && filters.to ? `${filters.from}_${filters.to}` : undefined;
      const revenueResponse = await reportsApi.getRevenueSummary(revenuePeriod);
      if (revenueResponse.data) {
        setRevenueSummary(revenueResponse.data);
      }

      // Fetch filtered pay apps
      const payAppsResponse = await reportsApi.getReportPayApps(filters);
      if (payAppsResponse.data) {
        setPayAppRows(payAppsResponse.data);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load reports';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  /**
   * Load on mount and when filters change
   */
  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Export as CSV
   */
  const exportCSV = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      const blob = await reportsApi.exportCSV(filters);

      const filename = `PayApps-${new Date().toISOString().split('T')[0]}.csv`;
      downloadBlob(blob, filename);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export CSV';
      setError(message);
    }
  }, [filters]);

  /**
   * Export as PDF
   */
  const exportPDF = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      const blob = await reportsApi.exportReportPDF();

      const filename = `Report-${new Date().toISOString().split('T')[0]}.pdf`;
      downloadBlob(blob, filename);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export PDF';
      setError(message);
    }
  }, []);

  return {
    stats,
    revenueSummary,
    payAppRows,
    isLoading,
    error,
    filters,
    setFilters,
    exportCSV,
    exportPDF,
    refresh,
  };
}
