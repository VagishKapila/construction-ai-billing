/**
 * Reports API — Dashboard stats, revenue summaries, and exports
 */

import type { ApiResponse } from '@/types';
import { api } from './client';

// ============================================================================
// REQUEST TYPES
// ============================================================================

export interface ReportFilters {
  project_id?: number;
  status?: string;
  from?: string;
  to?: string;
}

export interface ReportExportFilters {
  project_id?: number;
  status?: string;
  from?: string;
  to?: string;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface DashboardStats {
  projects: number;
  payapps: number;
  total_billed: number;
  outstanding: number;
}

export interface RevenueSummary {
  period: string;
  total_scheduled_value: number;
  total_certified: number;
  total_earned: number;
  total_retainage: number;
  total_paid: number;
  outstanding: number;
}

export interface PayAppReport {
  id: number;
  pay_app_id: number;
  project_id: number;
  project_name: string;
  app_number: number;
  period_label: string;
  period_start: string;
  period_end: string;
  status: string;
  amount_certified: number;
  retainage_held: number;
  amount_due: number;
  amount_paid: number;
  payment_status: string;
  submitted_at: string;
}

export interface OtherInvoiceReport {
  id: number;
  project_id: number;
  project_name: string;
  invoice_number: string;
  category: string;
  description: string;
  vendor: string;
  amount: number;
  invoice_date: string;
  due_date: string;
  status: string;
}

// ============================================================================
// DASHBOARD STATS
// ============================================================================

/**
 * Get dashboard KPIs for the current user
 * Returns high-level stats: project count, pay app count, billed, outstanding
 */
export async function getStats(): Promise<ApiResponse<DashboardStats>> {
  return api.get<DashboardStats>('/api/stats');
}

/**
 * Get revenue summary for a period
 * Returns scheduled value, certified amount, earned, retainage, paid, outstanding
 */
export async function getRevenueSummary(
  period?: string,
): Promise<ApiResponse<RevenueSummary>> {
  const url = period ? `/api/revenue/summary?period=${period}` : '/api/revenue/summary';
  return api.get<RevenueSummary>(url);
}

// ============================================================================
// FILTERED REPORTS
// ============================================================================

/**
 * Get filtered list of pay applications
 * Supports filtering by project, status, date range
 */
export async function getReportPayApps(
  filters?: ReportFilters,
): Promise<ApiResponse<PayAppReport[]>> {
  const params = new URLSearchParams();
  if (filters?.project_id) params.append('project_id', filters.project_id.toString());
  if (filters?.status) params.append('status', filters.status);
  if (filters?.from) params.append('from', filters.from);
  if (filters?.to) params.append('to', filters.to);

  const url = `/api/reports/pay-apps${params.toString() ? `?${params}` : ''}`;
  return api.get<PayAppReport[]>(url);
}

/**
 * Get filtered list of other invoices (non-pay-app invoices)
 * Future feature for tracking supplemental invoices, RFI costs, etc.
 */
export async function getReportOtherInvoices(
  filters?: ReportFilters,
): Promise<ApiResponse<OtherInvoiceReport[]>> {
  const params = new URLSearchParams();
  if (filters?.project_id) params.append('project_id', filters.project_id.toString());
  if (filters?.from) params.append('from', filters.from);
  if (filters?.to) params.append('to', filters.to);

  const url = `/api/reports/other-invoices${params.toString() ? `?${params}` : ''}`;
  return api.get<OtherInvoiceReport[]>(url);
}

// ============================================================================
// EXPORTS (CSV, PDF)
// ============================================================================

/**
 * Export filtered pay apps as CSV
 * Returns a Blob that can be saved to disk or opened in a spreadsheet app
 */
export async function exportCSV(filters?: ReportExportFilters): Promise<Blob> {
  const token = api.getToken();
  const params = new URLSearchParams();
  if (filters?.project_id) params.append('project_id', filters.project_id.toString());
  if (filters?.status) params.append('status', filters.status);
  if (filters?.from) params.append('from', filters.from);
  if (filters?.to) params.append('to', filters.to);

  const url = `/api/reports/export/csv${params.toString() ? `?${params}` : ''}`;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Failed to export CSV');
  return res.blob();
}

/**
 * Export revenue report as PDF
 * Returns a Blob containing a formatted PDF report with charts and summaries
 */
export async function exportReportPDF(): Promise<Blob> {
  const token = api.getToken();
  const res = await fetch('/api/revenue/report/pdf', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Failed to export report PDF');
  return res.blob();
}
