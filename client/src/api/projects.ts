/**
 * Projects API — Project CRUD and Schedule of Values (SOV)
 */

import type { ApiResponse, Project, SOVLine } from '@/types';
import { api } from './client';

// ============================================================================
// REQUEST TYPES
// ============================================================================

export interface CreateProjectData {
  name: string;
  number?: string;
  owner?: string;
  contractor?: string;
  architect?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  building_area?: string;
  original_contract?: number;
  contract_date?: string;
  est_date?: string;
  payment_terms?: string;
  default_retainage?: number;
  address?: string;
  owner_email?: string;
  owner_phone?: string;
  jurisdiction?: string;
  include_architect?: boolean;
  include_retainage?: boolean;
}

export interface SOVParseResponse {
  rows: SOVLine[];
  filename: string;
}

export interface SOVUpload {
  id: number;
  project_id: number;
  filename: string;
  original_name: string;
  uploaded_at: string;
  line_count: number;
}

// ============================================================================
// PROJECT CRUD
// ============================================================================

/**
 * Get all projects for the current user
 */
export async function getProjects(): Promise<ApiResponse<Project[]>> {
  return api.get<Project[]>('/api/projects');
}

/**
 * Create a new project
 */
export async function createProject(data: CreateProjectData): Promise<ApiResponse<Project>> {
  return api.post<Project>('/api/projects', data);
}

/**
 * Update an existing project
 */
export async function updateProject(
  id: number,
  data: Partial<CreateProjectData>,
): Promise<ApiResponse<Project>> {
  return api.put<Project>(`/api/projects/${id}`, data);
}

/**
 * Full update including SOV lines and other nested data
 */
export async function updateProjectFull(
  id: number,
  data: unknown,
): Promise<ApiResponse<Project>> {
  return api.put<Project>(`/api/projects/${id}/full`, data);
}

/**
 * Soft delete a project
 */
export async function deleteProject(id: number): Promise<ApiResponse<void>> {
  return api.del<void>(`/api/projects/${id}`);
}

// ============================================================================
// SCHEDULE OF VALUES (SOV)
// ============================================================================

/**
 * Get all SOV lines for a project
 */
export async function getSOVLines(projectId: number): Promise<ApiResponse<SOVLine[]>> {
  return api.get<SOVLine[]>(`/api/projects/${projectId}/sov`);
}

/**
 * Get all change orders across all pay apps for a project
 */
export async function getProjectChangeOrders(projectId: number): Promise<ApiResponse<any[]>> {
  return api.get<any[]>(`/api/projects/${projectId}/change-orders`);
}

/**
 * Get all attachments across all pay apps for a project
 */
export async function getProjectAttachments(projectId: number): Promise<ApiResponse<any[]>> {
  return api.get<any[]>(`/api/projects/${projectId}/attachments`);
}

/**
 * Save SOV lines for a project
 */
export async function saveSOVLines(
  projectId: number,
  lines: Partial<SOVLine>[],
): Promise<ApiResponse<SOVLine[]>> {
  return api.post<SOVLine[]>(`/api/projects/${projectId}/sov`, { lines });
}

/**
 * Upload and parse a SOV file (XLSX, CSV, PDF, DOCX)
 * Returns parsed rows and filename
 */
export async function parseSOV(file: File): Promise<ApiResponse<SOVParseResponse>> {
  const formData = new FormData();
  formData.append('file', file);
  return api.upload<SOVParseResponse>('/api/sov/parse', formData);
}

/**
 * Get SOV upload history for a project
 */
export async function getSOVUploads(projectId: number): Promise<ApiResponse<SOVUpload[]>> {
  return api.get<SOVUpload[]>(`/api/projects/${projectId}/sov/uploads`);
}

// ============================================================================
// RECONCILIATION
// ============================================================================

export interface ReconciliationInvoice {
  app_number: number;
  period_label: string;
  status: string;
  is_retainage_release: boolean;
  amount_due: number;
  retention_held: number;
  amount_paid: number;
  payment_status: string;
  submitted_at: string | null;
}

export interface ReconciliationReport {
  project_name: string;
  original_contract: number;
  total_change_orders: number;
  adjusted_contract: number;
  invoices: ReconciliationInvoice[];
  summary: {
    total_billed: number;
    total_retainage_held: number;
    total_retainage_released: number;
    total_work_completed: number;
    total_paid: number;
    total_outstanding: number;
    variance: number;
    is_fully_reconciled: boolean;
  };
}

/**
 * Get full billing reconciliation report for a project
 */
export async function getProjectReconciliation(projectId: number): Promise<ApiResponse<ReconciliationReport>> {
  return api.get<ReconciliationReport>(`/api/projects/${projectId}/reconciliation`);
}
