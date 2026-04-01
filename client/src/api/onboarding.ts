/**
 * Onboarding API — Tour completion and reset endpoints
 */

import { api } from './client';
import type { ApiResponse } from '@/types';

/**
 * Mark onboarding tour as completed
 * Sets has_completed_onboarding flag to true in database
 */
export async function completeOnboarding(): Promise<ApiResponse<{ message: string }>> {
  return api.post('/api/onboarding/complete');
}

/**
 * Reset onboarding tour
 * Sets has_completed_onboarding flag back to false, allows re-triggering tour
 * Used when user clicks "Replay Tour" in Settings
 */
export async function resetOnboarding(): Promise<ApiResponse<{ message: string }>> {
  return api.post('/api/onboarding/reset');
}
