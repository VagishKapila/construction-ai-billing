/**
 * Project Hub API — Trades, uploads, comments, and document management
 */

import type { ApiResponse } from '@/types';
import type {
  Trade,
  HubUpload,
  HubComment,
  HubStats,
  TeamRole,
  MagicLinkInfo,
} from '@/types/hub';
import { api } from './client';

// ============================================================================
// TRADES
// ============================================================================

/**
 * Get all trades for a project
 */
export async function getTrades(projectId: number): Promise<ApiResponse<Trade[]>> {
  return api.get<Trade[]>(`/api/projects/${projectId}/hub/trades`);
}

/**
 * Add a new trade to a project
 */
export async function addTrade(
  projectId: number,
  data: {
    name: string;
    company_name?: string;
    contact_name?: string;
    contact_email?: string;
  },
): Promise<ApiResponse<Trade>> {
  return api.post<Trade>(`/api/projects/${projectId}/hub/trades`, data);
}

/**
 * Update a trade
 */
export async function updateTrade(
  projectId: number,
  tradeId: number,
  data: Partial<Trade>,
): Promise<ApiResponse<Trade>> {
  return api.put<Trade>(`/api/projects/${projectId}/hub/trades/${tradeId}`, data);
}

/**
 * Delete a trade
 */
export async function deleteTrade(projectId: number, tradeId: number): Promise<ApiResponse<void>> {
  return api.del<void>(`/api/projects/${projectId}/hub/trades/${tradeId}`);
}

/**
 * Send (or resend) invite to a trade
 */
export async function inviteTrade(projectId: number, tradeId: number): Promise<ApiResponse<{ ok: boolean; message: string }>> {
  return api.post(`/api/projects/${projectId}/hub/trades/${tradeId}/resend-invite`, {});
}

// ============================================================================
// INBOX & UPLOADS
// ============================================================================

/**
 * Get inbox for a project (all uploads with optional filters)
 */
export async function getInbox(
  projectId: number,
  filters?: {
    status?: 'all' | 'pending' | 'approved' | 'rejected';
    doc_type?: string;
  },
): Promise<ApiResponse<HubUpload[]>> {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== 'all') params.append('status', filters.status);
  if (filters?.doc_type) params.append('doc_type', filters.doc_type);

  const query = params.toString() ? `?${params.toString()}` : '';
  return api.get<HubUpload[]>(`/api/projects/${projectId}/hub/inbox${query}`);
}

/**
 * Get a single upload with its comments
 */
export async function getUpload(
  projectId: number,
  uploadId: number,
): Promise<ApiResponse<{ upload: HubUpload; comments: HubComment[] }>> {
  return api.get<{ upload: HubUpload; comments: HubComment[] }>(
    `/api/projects/${projectId}/hub/uploads/${uploadId}`,
  );
}

/**
 * Update upload status (approve/reject)
 */
export async function updateUploadStatus(
  projectId: number,
  uploadId: number,
  action: 'approve' | 'reject',
  rejection_reason?: string,
): Promise<ApiResponse<HubUpload>> {
  const data: Record<string, string> = { action };
  if (rejection_reason) data.rejection_reason = rejection_reason;

  return api.put<HubUpload>(
    `/api/projects/${projectId}/hub/uploads/${uploadId}/status`,
    data,
  );
}

/**
 * Add a comment to an upload
 */
export async function addComment(
  projectId: number,
  uploadId: number,
  text: string,
  is_rfi_reply?: boolean,
): Promise<ApiResponse<HubComment>> {
  return api.post<HubComment>(
    `/api/projects/${projectId}/hub/uploads/${uploadId}/comments`,
    { text, is_rfi_reply: is_rfi_reply ?? false },
  );
}

/**
 * Trigger browser download of an upload
 */
export function downloadUpload(projectId: number, uploadId: number): void {
  const token = localStorage.getItem('ci_token');
  const baseUrl = import.meta.env.VITE_API_URL || '';
  const url = `${baseUrl}/api/projects/${projectId}/hub/uploads/${uploadId}/download`;

  const link = document.createElement('a');
  link.href = url;
  if (token) {
    link.setAttribute('Authorization', `Bearer ${token}`);
  }
  link.setAttribute('download', '');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Upload a new document
 */
export async function uploadDocument(
  projectId: number,
  formData: FormData,
): Promise<ApiResponse<HubUpload>> {
  return api.upload<HubUpload>(
    `/api/projects/${projectId}/hub/uploads`,
    formData,
  );
}

// ============================================================================
// STATS & OVERVIEW
// ============================================================================

/**
 * Get hub statistics for a project
 */
export async function getHubStats(projectId: number): Promise<ApiResponse<HubStats>> {
  return api.get<HubStats>(`/api/projects/${projectId}/hub/stats`);
}

// ============================================================================
// TEAM ROLES
// ============================================================================

/**
 * Get team roles assigned to a project
 */
export async function getTeamRoles(projectId: number): Promise<ApiResponse<TeamRole[]>> {
  return api.get<TeamRole[]>(`/api/projects/${projectId}/hub/team`);
}

/**
 * Update team role assignments
 */
export async function updateTeamRoles(
  projectId: number,
  roles: Record<'office' | 'pm' | 'superintendent', number | null>,
): Promise<ApiResponse<void>> {
  return api.put<void>(`/api/projects/${projectId}/hub/team`, { roles });
}

// ============================================================================
// MAGIC LINK (NO AUTH)
// ============================================================================

/**
 * Get project/trade info from magic link token (no auth required)
 */
export async function getMagicLinkInfo(token: string): Promise<ApiResponse<MagicLinkInfo>> {
  const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/hub/${token}`);

  if (!response.ok) {
    throw new Error(`Failed to load magic link: ${response.status}`);
  }

  const raw = await response.json();
  if ('data' in raw) {
    return raw as ApiResponse<MagicLinkInfo>;
  }
  return { data: raw as MagicLinkInfo } as ApiResponse<MagicLinkInfo>;
}

/**
 * Upload document via magic link (no auth required)
 */
export async function magicLinkUpload(
  token: string,
  formData: FormData,
): Promise<ApiResponse<HubUpload>> {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL || ''}/api/hub/${token}/upload`,
    {
      method: 'POST',
      body: formData,
    },
  );

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  const raw = await response.json();
  if ('data' in raw) {
    return raw as ApiResponse<HubUpload>;
  }
  return { data: raw as HubUpload } as ApiResponse<HubUpload>;
}
