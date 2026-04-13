/**
 * Auth API — User authentication endpoints
 *
 * NOTE: Zod validation schemas available in @/lib/schemas.ts:
 * - UserSchema — validates user object shape
 * - AuthResponseSchema — validates { user, token } shape
 *
 * To add validation to any function:
 *   import { safeValidate, AuthResponseSchema } from '@/lib/schemas'
 *   const validated = safeValidate(AuthResponseSchema, res.data, 'login')
 *   // Use validated.user and validated.token safely
 */

import { api } from './client';
import type { AuthTokens, User, ApiResponse } from '@/types';

/**
 * Register a new user
 */
export async function register(
  name: string,
  email: string,
  password: string,
): Promise<ApiResponse<AuthTokens>> {
  return api.post<AuthTokens>('/api/auth/register', {
    name,
    email,
    password,
  });
}

/**
 * Login with email and password
 */
export async function login(
  email: string,
  password: string,
): Promise<ApiResponse<AuthTokens>> {
  return api.post<AuthTokens>('/api/auth/login', {
    email,
    password,
  });
}

/**
 * Google OAuth authentication
 * @param credential JWT token from Google Sign-In
 */
export async function googleAuth(credential: string): Promise<ApiResponse<AuthTokens>> {
  return api.post<AuthTokens>('/api/auth/google', {
    credential,
  });
}

/**
 * Request password reset email
 */
export async function forgotPassword(email: string): Promise<ApiResponse<{ message: string }>> {
  return api.post('/api/auth/forgot-password', {
    email,
  });
}

/**
 * Reset password with reset token
 */
export async function resetPassword(
  token: string,
  password: string,
): Promise<ApiResponse<AuthTokens>> {
  return api.post<AuthTokens>('/api/auth/reset-password', {
    token,
    password,
  });
}

/**
 * Get current user
 */
export async function getMe(): Promise<ApiResponse<User>> {
  return api.get<User>('/api/auth/me');
}

/**
 * Verify email with verification token
 */
export async function verifyEmail(token: string): Promise<ApiResponse<{ message: string }>> {
  return api.get(`/api/auth/verify/${token}`);
}
