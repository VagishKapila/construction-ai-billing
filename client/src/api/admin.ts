/**
 * Admin API — Admin dashboard, user management, analytics, and support
 */

import type { ApiResponse, User, AdminStats } from '@/types';
import { api } from './client';
import { safeValidate, AdminStatsRawSchema } from '@/lib/schemas';

// ============================================================================
// REQUEST TYPES
// ============================================================================

export interface BlockUserRequest {
  block: boolean;
  reason?: string;
}

export interface ExtendTrialRequest {
  days: number;
}

export interface AskAIRequest {
  question: string;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface AdminUser extends User {
  project_count?: number;
  pay_app_count?: number;
  total_billed?: number;
}

export interface PayAppActivityData {
  date: string;
  count: number;
  revenue: number;
}

export interface PipelineByUserData {
  user_name: string;
  user_id: number;
  total_pipeline: number;
  total_billed: number;
  conversion_pct: number;
}

export interface AskAIResponse {
  answer: string;
  citations?: string[];
}

export interface FeedbackItem {
  id: number;
  user_id: number;
  category: 'bug' | 'feature_request' | 'general' | 'support';
  message: string;
  page_context?: string;
  created_at: string;
}

export interface SupportRequest {
  id: number;
  user_id: number;
  user_email: string;
  subject: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
  resolved_at?: string;
}

// ============================================================================
// STATS & ANALYTICS
// ============================================================================

/**
 * Get admin dashboard stats
 * KPIs: users, projects, pay apps, events today, revenue metrics
 * Only accessible to users with admin role
 *
 * CRITICAL: This endpoint was causing production crashes because the backend
 * returned nested { revenue: { avg_contract } } but the frontend expected flat
 * { avg_contract_size }. We now validate the raw response with Zod before mapping.
 */
export async function getAdminStats(): Promise<ApiResponse<AdminStats>> {
  // Fetch raw response from backend
  const res = await api.get<Record<string, any>>('/api/admin/stats');
  if (!res.data) return res as ApiResponse<AdminStats>;

  // Validate raw response shape against actual backend contract
  const validated = safeValidate(AdminStatsRawSchema, res.data, 'getAdminStats');
  if (!validated) {
    console.error('[API] Admin stats validation failed — returning empty stats');
    return {
      error: 'Invalid response shape from server',
      data: {
        users_count: 0,
        projects_count: 0,
        pay_apps_count: 0,
        events_today: 0,
        total_pipeline: 0,
        total_billed: 0,
        avg_contract_size: 0,
      },
    };
  }

  // Safe to map nested response to flat structure now that we've validated it
  const flat: AdminStats = {
    users_count:       parseInt(String(validated.users?.total ?? 0)),
    projects_count:    parseInt(String(validated.projects?.total ?? 0)),
    pay_apps_count:    parseInt(String(validated.payapps?.total ?? 0)),
    events_today:      parseInt(String(validated.events?.last24h ?? 0)),
    total_pipeline:    parseFloat(String(validated.revenue?.pipeline ?? 0)),
    total_billed:      parseFloat(String(validated.revenue?.total_billed ?? 0)),
    avg_contract_size: parseFloat(String(validated.revenue?.avg_contract ?? 0)),
  };
  return { data: flat, error: res.error };
}

/**
 * Get list of all users with their metadata
 * Includes project count, pay app count, total billed
 * Only accessible to admins
 */
export async function getAdminUsers(): Promise<ApiResponse<AdminUser[]>> {
  return api.get<AdminUser[]>('/api/admin/users');
}

/**
 * Get pay app activity chart data
 * Returns daily pay app creation and revenue data for the last 30 days
 */
export async function getPayAppActivityChart(): Promise<ApiResponse<PayAppActivityData[]>> {
  return api.get<PayAppActivityData[]>('/api/admin/chart/payapp-activity');
}

/**
 * Get pipeline vs billed chart data by user
 * Shows each user's total pipeline, billed amount, and conversion percentage
 */
export async function getPipelineByUserChart(): Promise<ApiResponse<PipelineByUserData[]>> {
  return api.get<PipelineByUserData[]>('/api/admin/chart/pipeline-by-user');
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

/**
 * Block or unblock a user account
 * Blocked users cannot log in
 */
export async function toggleBlockUser(
  id: number,
  block: boolean,
  reason?: string,
): Promise<ApiResponse<void>> {
  return api.post<void>(`/api/admin/users/${id}/block`, { block, reason });
}

/**
 * Delete a user account and all associated data
 * This is a permanent operation
 */
export async function deleteUser(id: number): Promise<ApiResponse<void>> {
  return api.del<void>(`/api/admin/users/${id}`);
}

/**
 * Extend a user's trial by N days
 */
export async function extendTrial(id: number, days: number): Promise<ApiResponse<void>> {
  return api.post<void>(`/api/admin/users/${id}/extend-trial`, { days });
}

/**
 * Set a user to free override (waive payment indefinitely)
 */
export async function setFreeOverride(id: number): Promise<ApiResponse<void>> {
  return api.post<void>(`/api/admin/users/${id}/set-free-override`, {});
}

/**
 * Manually upgrade a user to Pro tier
 */
export async function upgradeToPro(id: number): Promise<ApiResponse<void>> {
  return api.post<void>(`/api/admin/users/${id}/upgrade-pro`, {});
}

/**
 * Reset a user's trial back to trial status
 */
export async function resetTrial(id: number): Promise<ApiResponse<void>> {
  return api.post<void>(`/api/admin/users/${id}/reset-trial`, {});
}

// ============================================================================
// AI ASSISTANT
// ============================================================================

/**
 * Ask Claude a question using the admin context
 * Can be used for insights, troubleshooting, or general questions
 */
export async function askAI(question: string): Promise<ApiResponse<AskAIResponse>> {
  return api.post<AskAIResponse>('/api/admin/ask', { question });
}

// ============================================================================
// FEEDBACK & SUPPORT
// ============================================================================

/**
 * Get user feedback inbox
 * Includes bug reports, feature requests, and general feedback
 */
export async function getFeedback(): Promise<ApiResponse<FeedbackItem[]>> {
  return api.get<FeedbackItem[]>('/api/admin/feedback');
}

/**
 * Get support requests
 * Tracks user support tickets with priority and status
 */
export async function getSupportRequests(): Promise<ApiResponse<SupportRequest[]>> {
  return api.get<SupportRequest[]>('/api/admin/support-requests');
}
