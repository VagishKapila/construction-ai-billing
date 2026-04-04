/**
 * API Client Singleton & Modules
 * Central export point for all API functionality
 */

export { api } from './client';

// Auth module
export * from './auth';

// Projects & SOV
export * from './projects';
export type { CreateProjectData, SOVParseResponse, SOVUpload } from './projects';

// Pay Applications
export * from './payApps';
export type {
  CreatePayAppRequest,
  PayAppLineRequest,
  ChangeOrderRequest,
  EmailPayAppRequest,
  GetPayAppResponse,
} from './payApps';

// Settings
export * from './settings';
export type {
  UpdateSettingsRequest,
  FileUploadResponse,
  NudgeSettings,
  JobNumberResponse,
} from './settings';

// Payments & Stripe
export * from './payments';
export type {
  CheckoutSessionRequest,
  PaymentReceivedRequest,
  BadDebtRequest,
  StripeConnectResponse,
  PaymentLinkResponse,
  CheckoutSessionResponse,
  PaymentVerifyResponse,
  PaymentsListResponse,
} from './payments';

// Reports & Analytics
export * from './reports';
export type {
  ReportFilters,
  ReportExportFilters,
  DashboardStats,
  RevenueSummary,
  PayAppReport,
  OtherInvoiceReport,
} from './reports';

// Admin
export * from './admin';
export type {
  BlockUserRequest,
  ExtendTrialRequest,
  AskAIRequest,
  AdminUser,
  PayAppActivityData,
  PipelineByUserData,
  AskAIResponse,
  FeedbackItem,
  SupportRequest,
} from './admin';

// Onboarding
export * from './onboarding';
