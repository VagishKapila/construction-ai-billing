/**
 * Payments API — Stripe Connect integration, payment links, and payment tracking
 */

import type {
  ApiResponse,
  ConnectedAccount,
  Payment,
  PaymentPageData,
} from '@/types';
import { api } from './client';

// ============================================================================
// REQUEST TYPES
// ============================================================================

export interface CheckoutSessionRequest {
  payment_method: 'ach' | 'card';
}

export interface PaymentReceivedRequest {
  received: boolean;
}

export interface BadDebtRequest {
  reason?: string;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface StripeConnectResponse {
  url: string;
}

export interface PaymentLinkResponse {
  token: string;
  url: string;
}

export interface CheckoutSessionResponse {
  url: string;
  session_id?: string;
}

export interface PaymentVerifyResponse {
  status: string;
  payment_status?: string;
  amount_paid?: number;
}

export interface PaymentsListResponse {
  payments: Payment[];
  summary: {
    total: number;
    pending: number;
    succeeded: number;
  };
}

// ============================================================================
// STRIPE CONNECT
// ============================================================================

/**
 * Start Stripe Connect onboarding for the current user
 * Redirects to Stripe Express onboarding URL
 */
export async function startStripeConnect(): Promise<ApiResponse<StripeConnectResponse>> {
  return api.post<StripeConnectResponse>('/api/stripe/connect', {});
}

/**
 * Get current Stripe connected account status
 * Returns account info if user has completed onboarding
 */
export async function getStripeAccountStatus(): Promise<ApiResponse<ConnectedAccount>> {
  return api.get<ConnectedAccount>('/api/stripe/account-status');
}

/**
 * Get a link to the Stripe Express dashboard
 * Allows user to manage their account, view payouts, etc.
 */
export async function getStripeDashboardLink(): Promise<ApiResponse<StripeConnectResponse>> {
  return api.post<StripeConnectResponse>('/api/stripe/dashboard-link', {});
}

// ============================================================================
// PAYMENT LINKS & CHECKOUT
// ============================================================================

/**
 * Generate a payment link for a pay app
 * Creates a unique token and returns the public URL for sharing with payer
 */
export async function generatePaymentLink(
  payAppId: number,
): Promise<ApiResponse<PaymentLinkResponse>> {
  return api.post<PaymentLinkResponse>(`/api/pay-apps/${payAppId}/payment-link`, {});
}

/**
 * Get payment page data (public endpoint, no auth required)
 * Used by pay.html to display invoice details before payment
 */
export async function getPaymentPageData(
  token: string,
): Promise<ApiResponse<PaymentPageData>> {
  // This endpoint is public and doesn't require auth
  // We make the request without relying on the client's token
  const url = `/api/pay/${token}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch payment page data: HTTP ${response.status}`);
  }
  return response.json() as Promise<ApiResponse<PaymentPageData>>;
}

/**
 * Create Stripe Checkout session for payment
 * Returns URL to redirect user to Stripe Checkout
 */
export async function createCheckoutSession(
  token: string,
  data: CheckoutSessionRequest,
): Promise<ApiResponse<CheckoutSessionResponse>> {
  return api.post<CheckoutSessionResponse>(`/api/pay/${token}/checkout`, data);
}

/**
 * Verify payment status for a given payment link token
 * Called after user returns from Stripe Checkout (fallback if webhook delayed)
 */
export async function verifyPayment(token: string): Promise<ApiResponse<PaymentVerifyResponse>> {
  return api.post<PaymentVerifyResponse>(`/api/pay/${token}/verify`, {});
}

// ============================================================================
// PAYMENT TRACKING
// ============================================================================

/**
 * Get list of all payments for the current user (GC)
 * Returns individual payments with summary stats
 */
export async function getPayments(): Promise<ApiResponse<PaymentsListResponse>> {
  return api.get<PaymentsListResponse>('/api/payments');
}

/**
 * Mark a pay app as bad debt (uncollectable)
 */
export async function markBadDebt(
  payAppId: number,
  reason?: string,
): Promise<ApiResponse<void>> {
  return api.post<void>(`/api/pay-apps/${payAppId}/bad-debt`, { reason });
}

/**
 * Undo bad debt marking on a pay app
 */
export async function undoBadDebt(payAppId: number): Promise<ApiResponse<void>> {
  return api.post<void>(`/api/pay-apps/${payAppId}/undo-bad-debt`, {});
}

/**
 * Toggle payment received status on a pay app
 * Used to manually mark an offline payment as received
 */
export async function togglePaymentReceived(
  payAppId: number,
  received: boolean,
): Promise<ApiResponse<void>> {
  return api.post<void>(`/api/pay-apps/${payAppId}/payment-received`, {
    received,
  });
}
