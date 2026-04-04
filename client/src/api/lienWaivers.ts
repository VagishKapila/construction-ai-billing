/**
 * Lien Waivers API — CRUD and PDF operations for lien documents
 */

import type { ApiResponse, LienDocument } from '@/types';
import { api } from './client';

// ============================================================================
// REQUEST TYPES
// ============================================================================

export interface CreateLienDocRequest {
  doc_type: LienDocument['doc_type'];
  signatory_name: string;
  signatory_title?: string;
  through_date?: string;
  amount?: number;
  maker_of_check?: string;
  check_payable_to?: string;
  pay_app_id?: number;
  jurisdiction?: string;
}

// ============================================================================
// LIEN DOCUMENT CRUD
// ============================================================================

/**
 * Get all lien documents for a project
 */
export async function getLienDocs(projectId: number): Promise<ApiResponse<LienDocument[]>> {
  return api.get<LienDocument[]>(`/api/projects/${projectId}/lien-docs`);
}

/**
 * Create a new lien document (generates PDF on server)
 */
export async function createLienDoc(
  projectId: number,
  data: CreateLienDocRequest,
): Promise<ApiResponse<LienDocument>> {
  return api.post<LienDocument>(`/api/projects/${projectId}/lien-docs`, data);
}

/**
 * Download lien document PDF as Blob
 */
export async function downloadLienDocPDF(docId: number): Promise<Blob> {
  const token = api.getToken();
  const res = await fetch(`/api/lien-docs/${docId}/pdf${token ? `?token=${token}` : ''}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Failed to download lien waiver PDF');
  return res.blob();
}
