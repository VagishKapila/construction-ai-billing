/**
 * ConstructInvoice AI — TypeScript Types
 * Complete type definitions for the G702/G703 construction billing platform
 */

// ============================================================================
// USER & AUTHENTICATION
// ============================================================================

export interface User {
  id: number;
  name: string;
  email: string;
  email_verified: boolean;
  google_id?: string;
  platform_role: 'user' | 'admin';

  // Trial & Subscription
  trial_start_date?: string; // ISO 8601
  trial_end_date?: string; // ISO 8601
  subscription_status: 'trial' | 'active' | 'canceled' | 'past_due' | 'free_override';
  plan_type: 'free_trial' | 'pro' | 'free_override';

  // Stripe
  stripe_customer_id?: string;
  stripe_connect_id?: string;

  // Feature flags
  payments_enabled: boolean;
  has_completed_onboarding: boolean;

  // Account status
  blocked: boolean;
  created_at: string; // ISO 8601
}

export interface AuthTokens {
  token: string;
  user: User;
}

// ============================================================================
// PROJECTS & SCHEDULE OF VALUES
// ============================================================================

export interface Project {
  id: number;
  user_id: number;

  // Basic info
  name: string;
  number?: string;
  job_number?: string;

  // Parties
  owner?: string;
  contractor?: string;
  architect?: string;

  // Contact info
  contact?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  owner_email?: string;
  owner_phone?: string;

  // Project details
  building_area?: string;
  address?: string;
  jurisdiction?: string;

  // Financial terms
  original_contract?: number;
  contract_date?: string; // ISO 8601
  est_date?: string; // ISO 8601
  payment_terms?: string; // e.g., "Net 30", "Due on receipt"
  default_retainage?: number; // percentage
  payment_due_date?: string; // ISO 8601
  retention_due_date?: string; // ISO 8601

  // Project status
  status?: 'active' | 'completed';
  completed_at?: string; // ISO 8601

  // Settings
  include_architect: boolean;
  include_retainage: boolean;

  // Files
  contract_filename?: string;
  contract_original_name?: string;

  // Aggregates (from projects list query)
  pay_app_count?: number;

  // Timestamps
  created_at: string; // ISO 8601
}

export interface SOVLine {
  id: number;
  project_id: number;
  item_id?: string; // e.g., "1.0", "2.1"
  description: string;
  scheduled_value: number;
  sort_order: number;
}

// ============================================================================
// PAY APPLICATIONS (G702/G703)
// ============================================================================

export interface PayApp {
  id: number;
  project_id: number;

  // Numbering & timing
  app_number: number;
  period_start: string; // ISO 8601
  period_end: string; // ISO 8601
  period_label?: string; // e.g., "July 2025", "Month 3"

  // Status
  status: 'draft' | 'submitted' | 'paid';
  payment_status: 'unpaid' | 'partial' | 'paid' | 'processing' | 'bad_debt';
  deleted_at?: string; // ISO 8601

  // Certification (architect sign-off)
  architect_certified: boolean;
  architect_name?: string;
  architect_date?: string; // ISO 8601

  // Notes & PO
  notes?: string;
  po_number?: string;
  special_notes?: string;

  // Financial
  amount_due: number;
  retention_held: number;
  amount_paid: number;

  // Payment links & tracking
  payment_link_token?: string;
  payment_due_date?: string; // ISO 8601

  // Retainage release
  is_retainage_release?: boolean;

  // Timestamps
  submitted_at?: string; // ISO 8601
  created_at: string; // ISO 8601
}

export interface PayAppLine {
  id: number;
  pay_app_id: number;
  sov_line_id: number;

  // Percentages (work completed)
  prev_pct: number; // Previous percentage (0-100)
  this_pct: number; // This period percentage (0-100)

  // Retainage
  retainage_pct: number; // Retainage percentage for this line (0-100)

  // Stored materials
  stored_materials: number; // Optional stored materials amount
}

/**
 * PayAppLine with computed G702/G703 columns
 * Extends PayAppLine with all calculated values (Col A through Col I)
 */
export interface PayAppLineComputed extends PayAppLine {
  // From SOV
  scheduledValue: number; // Col A
  description: string;
  item_id: string; // SOV item identifier (e.g., "1.0", "2.1")

  // Computed columns (G702/G703)
  prevAmount: number; // Col B — Work completed from previous (prev_pct × scheduledValue)
  thisAmount: number; // Col C — Work completed this period (this_pct × scheduledValue)
  totalCompleted: number; // Col D — Total work completed (prevAmount + thisAmount)
  retainageHeld: number; // Col E — Retainage held (retainage_pct × totalCompleted)
  totalEarned: number; // Col F — Total earned (totalCompleted - retainageHeld)
  prevCertificates: number; // Col G — Previous certificates (sum of previous Col F)
  currentDue: number; // Col H — Current payment due (totalEarned - prevCertificates)
  balanceToFinish: number; // Col I — Balance to finish (scheduledValue - totalEarned)
}

export interface Attachment {
  id: number;
  pay_app_id: number;
  filename: string;
  original_name: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string; // ISO 8601
}

export interface ChangeOrder {
  id: number;
  pay_app_id: number;
  co_number: number;
  description: string;
  amount: number;
  status: 'draft' | 'approved' | 'rejected';
  created_at: string; // ISO 8601
}

// ============================================================================
// COMPANY SETTINGS & CONFIGURATION
// ============================================================================

export interface CompanySettings {
  id: number;
  user_id: number;

  // Company identity
  company_name?: string;

  // Defaults
  default_payment_terms?: string; // e.g., "Net 30"
  default_retainage?: number; // percentage

  // Uploaded files
  logo_filename?: string;
  logo_original_name?: string;
  signature_filename?: string;

  // Contact
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;

  // Feature flags
  credit_card_enabled: boolean;

  // Timestamps
  created_at?: string; // ISO 8601
}

// ============================================================================
// PAYMENTS & STRIPE INTEGRATION
// ============================================================================

export interface Payment {
  id: number;
  pay_app_id: number;
  project_id: number;
  user_id: number;

  // Stripe references
  stripe_payment_intent_id?: string;
  stripe_checkout_session_id?: string;
  payment_token?: string;

  // Financial
  amount: number;
  processing_fee: number;
  platform_fee: number;

  // Method & status
  payment_method: 'ach' | 'card';
  payment_status: 'pending' | 'succeeded' | 'processing' | 'failed';

  // Payer info
  payer_name?: string;
  payer_email?: string;
  payer_phone?: string;

  // Timestamps
  paid_at?: string; // ISO 8601
  failed_at?: string; // ISO 8601
  failure_reason?: string;
  created_at: string; // ISO 8601
}

export interface ConnectedAccount {
  id: number;
  user_id: number;

  // Stripe
  stripe_account_id: string;
  account_status: 'pending' | 'active' | 'restricted';
  charges_enabled: boolean;
  payouts_enabled: boolean;

  // Business info
  business_name?: string;
  payout_schedule?: 'daily' | 'weekly' | 'monthly';

  // Timestamps
  onboarded_at?: string; // ISO 8601
  created_at: string; // ISO 8601
}

// ============================================================================
// LIEN WAIVERS & DOCUMENTS
// ============================================================================

export interface LienDocument {
  id: number;
  project_id: number;
  pay_app_id?: number;

  // Type & jurisdiction
  doc_type: 'preliminary_notice' | 'conditional_waiver' | 'unconditional_waiver' | 'conditional_final_waiver' | 'unconditional_final_waiver';
  jurisdiction?: string;

  // Document details
  filename?: string;
  through_date?: string; // ISO 8601
  amount: number;

  // Check info
  maker_of_check?: string;
  check_payable_to?: string;

  // Signatory
  signatory_name?: string;
  signatory_title?: string;

  // Timestamps
  signed_at?: string; // ISO 8601
  created_at: string; // ISO 8601
}

// ============================================================================
// ANALYTICS & FEEDBACK
// ============================================================================

export interface Feedback {
  id: number;
  user_id: number;

  category: 'bug' | 'feature_request' | 'general' | 'support';
  message: string;
  page_context?: string;

  created_at: string; // ISO 8601
}

export interface AnalyticsEvent {
  id: number;
  user_id: number;

  event: string; // e.g., "pay_app_created", "pdf_generated", "payment_submitted"
  meta?: Record<string, unknown>; // arbitrary event metadata

  created_at: string; // ISO 8601
}

// ============================================================================
// OTHER INVOICES (future feature)
// ============================================================================

export interface OtherInvoice {
  id: number;
  project_id: number;
  user_id: number;

  invoice_number?: string;
  category?: string;
  description: string;
  vendor?: string;

  amount: number;
  invoice_date?: string; // ISO 8601
  due_date?: string; // ISO 8601
  status: 'draft' | 'submitted' | 'paid' | 'overdue';
  notes?: string;

  attachment_filename?: string;

  created_at: string; // ISO 8601
}

// ============================================================================
// API RESPONSE WRAPPERS & PAGINATION
// ============================================================================

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
  count?: number;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sort?: string;
  order: 'asc' | 'desc';
}

// ============================================================================
// ADMIN & ANALYTICS
// ============================================================================

export interface AdminStats {
  users_count: number;
  projects_count: number;
  pay_apps_count: number;
  events_today: number;

  total_pipeline: number; // Sum of all original_contract across active projects
  total_billed: number; // Sum of amount_paid across all payments
  avg_contract_size: number; // average original_contract
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Response from payment page public endpoint (no auth required)
 * Used by pay.html to display invoice details
 */
export interface PaymentPageData {
  payAppId: number;
  projectId: number;
  projectName: string;
  appNumber: number;
  periodLabel: string;

  // Line items with computed values
  lines: PayAppLineComputed[];

  // Summary
  totalScheduledValue: number;
  totalCompleted: number;
  totalEarned: number;
  currentDue: number;
  retainageHeld: number;
  retainingPct: number;

  // Payment status
  paymentStatus: string; // 'unpaid' | 'partial' | 'paid' | 'processing' | 'bad_debt'
  amountPaid: number;
  amountDue: number;
  hasPendingPayment: boolean;

  // Company & contact
  contractorName?: string;
  contactEmail?: string;
  ownerName?: string;
  ownerEmail?: string;

  // Timestamps
  submittedAt?: string;
}

/**
 * Request payload for creating/updating a pay application
 */
export interface CreatePayAppRequest {
  projectId: number;
  periodStart: string; // ISO 8601
  periodEnd: string; // ISO 8601

  lines: {
    sovLineId: number;
    prevPct: number;
    thisPct: number;
    retainagePct: number;
    storedMaterials?: number;
  }[];

  notes?: string;
  poNumber?: string;
  specialNotes?: string;
}

/**
 * Request payload for Stripe payment
 */
export interface CheckoutRequest {
  paymentMethod: 'ach' | 'card';
  payerName?: string;
  payerEmail?: string;
  payerPhone?: string;
}

/**
 * Webhook event from Stripe
 */
export interface StripeWebhookEvent {
  id: string;
  type: string;
  created: number;
  data: {
    object: Record<string, unknown>;
    previous_attributes?: Record<string, unknown>;
  };
}
