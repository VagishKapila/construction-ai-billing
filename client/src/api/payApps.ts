/**
 * Pay Applications API — G702/G703 pay app CRUD and PDF generation
 */

import type {
  ApiResponse,
  PayApp,
  ChangeOrder,
} from '@/types';
import { api } from './client';

// ============================================================================
// REQUEST TYPES
// ============================================================================

export interface CreatePayAppRequest {
  period_start?: string;
  period_end?: string;
  period_label?: string;
}

export interface PayAppLineRequest {
  sov_line_id: number;
  this_pct: number;
  retainage_pct: number;
  stored_materials?: number;
}

export interface ChangeOrderRequest {
  description: string;
  amount: number;
}

export interface EmailPayAppRequest {
  to: string;
  cc?: string;
  subject?: string;
  message?: string;
  include_lien_waiver?: boolean;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Server returns a FLAT response: { ...payAppFields, lines: [...], change_orders: [...], attachments: [...] }
 * Each line includes SOV data (item_id, description, scheduled_value) from the SQL JOIN.
 * The usePayApp hook manually parses this into structured objects.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GetPayAppResponse = Record<string, any>;

// ============================================================================
// PAY APP CRUD
// ============================================================================

/**
 * Get all pay apps for a project
 */
export async function getPayApps(projectId: number): Promise<ApiResponse<PayApp[]>> {
  return api.get<PayApp[]>(`/api/projects/${projectId}/payapps`);
}

/**
 * Get all deleted pay apps for a project
 */
export async function getDeletedPayApps(projectId: number): Promise<ApiResponse<PayApp[]>> {
  return api.get<PayApp[]>(`/api/projects/${projectId}/payapps/deleted`);
}

/**
 * Create a new pay app for a project
 */
export async function createPayApp(
  projectId: number,
  data: CreatePayAppRequest,
): Promise<ApiResponse<PayApp>> {
  return api.post<PayApp>(`/api/projects/${projectId}/payapps`, data);
}

/**
 * Get a single pay app with all related data (lines, change orders, etc.)
 */
export async function getPayApp(id: number): Promise<ApiResponse<GetPayAppResponse>> {
  return api.get<GetPayAppResponse>(`/api/payapps/${id}`);
}

/**
 * Update pay app header (status, notes, po_number, etc.)
 */
export async function updatePayApp(
  id: number,
  data: Partial<PayApp>,
): Promise<ApiResponse<PayApp>> {
  return api.put<PayApp>(`/api/payapps/${id}`, data);
}

/**
 * Save pay app line items with work completion percentages and retainage
 */
export async function savePayAppLines(
  id: number,
  lines: PayAppLineRequest[],
): Promise<ApiResponse<void>> {
  return api.put<void>(`/api/payapps/${id}/lines`, { lines });
}

/**
 * Soft delete a pay app
 */
export async function deletePayApp(id: number): Promise<ApiResponse<void>> {
  return api.del<void>(`/api/payapps/${id}`);
}

/**
 * Restore a deleted pay app
 */
export async function restorePayApp(id: number): Promise<ApiResponse<void>> {
  return api.post<void>(`/api/payapps/${id}/restore`, {});
}

/**
 * Unsubmit a pay app, reverting it from submitted back to draft
 */
export async function unsubmitPayApp(id: number): Promise<ApiResponse<void>> {
  return api.post<void>(`/api/payapps/${id}/unsubmit`, {});
}

// ============================================================================
// PDF & EMAIL
// ============================================================================

/**
 * Download pay app as PDF (G702/G703)
 * Returns a Blob that can be opened, saved, or printed
 */
export async function downloadPayAppPDF(id: number): Promise<Blob> {
  const token = api.getToken();
  const res = await fetch(`/api/payapps/${id}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Failed to download PDF');
  return res.blob();
}

/**
 * Send pay app via email with optional lien waiver attachment
 */
export async function emailPayApp(
  id: number,
  data: EmailPayAppRequest,
): Promise<ApiResponse<void>> {
  return api.post<void>(`/api/payapps/${id}/email`, data);
}

// ============================================================================
// CHANGE ORDERS
// ============================================================================

/**
 * Create a change order for a pay app
 */
export async function createChangeOrder(
  payAppId: number,
  data: ChangeOrderRequest,
): Promise<ApiResponse<ChangeOrder>> {
  return api.post<ChangeOrder>(`/api/payapps/${payAppId}/changeorders`, data);
}

/**
 * Update a change order
 */
export async function updateChangeOrder(
  id: number,
  data: Partial<ChangeOrder>,
): Promise<ApiResponse<ChangeOrder>> {
  return api.put<ChangeOrder>(`/api/changeorders/${id}`, data);
}

/**
 * Delete a change order
 */
export async function deleteChangeOrder(id: number): Promise<ApiResponse<void>> {
  return api.del<void>(`/api/changeorders/${id}`);
}
