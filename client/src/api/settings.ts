/**
 * Settings API — Company settings, logo, signature uploads
 */

import type { ApiResponse, CompanySettings } from '@/types';
import { api } from './client';

// ============================================================================
// REQUEST TYPES
// ============================================================================

export interface UpdateSettingsRequest {
  company_name?: string;
  default_payment_terms?: string;
  default_retainage?: number;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  credit_card_enabled?: boolean;
  // Address + license
  company_address?: string;
  company_city?: string;
  company_state?: string;
  company_zip?: string;
  license_number?: string;
}

export interface FileUploadResponse {
  filename: string;
}

export interface NudgeSettings {
  disable_trial_nudges?: boolean;
  disable_pro_nudges?: boolean;
  last_nudge_date?: string;
  nudge_dismissed_until?: string;
}

export interface JobNumberResponse {
  jobNumber: string;
}

// ============================================================================
// SETTINGS CRUD
// ============================================================================

/**
 * Get company settings for current user
 */
export async function getSettings(): Promise<ApiResponse<CompanySettings>> {
  return api.get<CompanySettings>('/api/settings');
}

/**
 * Save company settings
 */
export async function saveSettings(
  data: UpdateSettingsRequest,
): Promise<ApiResponse<CompanySettings>> {
  return api.post<CompanySettings>('/api/settings', data);
}

// ============================================================================
// FILE UPLOADS
// ============================================================================

/**
 * Upload company logo
 * Accepts: PNG, JPG, SVG, GIF
 * Max size: 5MB (enforced server-side)
 */
export async function uploadLogo(file: File): Promise<ApiResponse<FileUploadResponse>> {
  const formData = new FormData();
  formData.append('file', file);
  return api.upload<FileUploadResponse>('/api/settings/logo', formData);
}

/**
 * Get logo URL
 * Returns path to serve logo image
 */
export function getLogoUrl(): string {
  return '/api/settings/logo';
}

/**
 * Upload signature image
 * Accepts: PNG, JPG, SVG, GIF
 * Max size: 5MB (enforced server-side)
 */
export async function uploadSignature(file: File): Promise<ApiResponse<FileUploadResponse>> {
  const formData = new FormData();
  formData.append('file', file);
  return api.upload<FileUploadResponse>('/api/settings/signature', formData);
}

/**
 * Get signature URL
 * Returns path to serve signature image
 */
export function getSignatureUrl(): string {
  return '/api/settings/signature';
}

// ============================================================================
// NUDGE SETTINGS
// ============================================================================

/**
 * Save nudge/prompt settings (e.g., disable trial/pro upgrade nudges)
 */
export async function saveNudgeSettings(data: NudgeSettings): Promise<ApiResponse<void>> {
  return api.post<void>('/api/settings/nudges', data);
}

// ============================================================================
// JOB NUMBERS
// ============================================================================

/**
 * Get the next auto-generated job number
 * Used to pre-fill the job number field in new project wizard
 */
export async function getNextJobNumber(): Promise<ApiResponse<JobNumberResponse>> {
  return api.get<JobNumberResponse>('/api/settings/job-number/next');
}
