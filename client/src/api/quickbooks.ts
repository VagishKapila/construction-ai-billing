/**
 * QuickBooks Integration API — OAuth, sync, and estimate import
 */

import type { ApiResponse } from '@/types';
import { api } from './client';

// ============================================================================
// QUICKBOOKS TYPES
// ============================================================================

export interface QBConnectionStatus {
  connected: boolean;
  company_name?: string;
  realm_id?: string;
  last_sync_at?: string;
  sandbox?: boolean;
}

export interface QBSyncResult {
  success: boolean;
  synced: { type: string; qb_id: string }[];
  errors: { type: string; message: string }[];
}

export interface QBSyncLogEntry {
  id: number;
  project_id: number;
  project_name?: string;
  pay_app_id?: number;
  sync_type: string;
  sync_direction: string;
  qb_entity_type: string;
  qb_entity_id?: string;
  sync_status: string;
  error_message?: string;
  synced_at: string;
}

export interface QBEstimate {
  id: string;
  doc_number: string;
  customer_name: string;
  total_amount: number;
  txn_date: string;
  status: string;
  line_items: { description: string; amount: number }[];
}

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

/**
 * Get QuickBooks connection status for current user
 */
export async function getQBStatus(): Promise<ApiResponse<QBConnectionStatus>> {
  return api.get<QBConnectionStatus>('/api/quickbooks/status');
}

/**
 * Get OAuth URL to connect to QuickBooks
 */
export async function getQBConnectUrl(): Promise<ApiResponse<{ url: string }>> {
  return api.get<{ url: string }>('/api/quickbooks/connect');
}

/**
 * Disconnect QuickBooks account
 */
export async function disconnectQB(): Promise<ApiResponse<void>> {
  return api.post<void>('/api/quickbooks/disconnect');
}

// ============================================================================
// SYNC OPERATIONS
// ============================================================================

/**
 * Sync a project to QuickBooks
 */
export async function syncProject(projectId: number): Promise<ApiResponse<QBSyncResult>> {
  return api.post<QBSyncResult>(`/api/quickbooks/sync/${projectId}`);
}

/**
 * Get full sync log for all projects
 */
export async function getSyncLog(): Promise<ApiResponse<QBSyncLogEntry[]>> {
  return api.get<QBSyncLogEntry[]>('/api/quickbooks/sync-log');
}

/**
 * Get sync log for a specific project
 */
export async function getProjectSyncLog(projectId: number): Promise<ApiResponse<QBSyncLogEntry[]>> {
  return api.get<QBSyncLogEntry[]>(`/api/quickbooks/sync-log/${projectId}`);
}

// ============================================================================
// ESTIMATES (PATH B)
// ============================================================================

/**
 * Get list of estimates from QuickBooks
 */
export async function getQBEstimates(): Promise<ApiResponse<QBEstimate[]>> {
  return api.get<QBEstimate[]>('/api/quickbooks/estimates');
}

/**
 * Import a QuickBooks estimate as a Schedule of Values for a project
 */
export async function importQBEstimate(
  estimateId: string,
  projectId: number,
): Promise<ApiResponse<void>> {
  return api.post<void>('/api/quickbooks/import-estimate', {
    estimate_id: estimateId,
    project_id: projectId,
  });
}
