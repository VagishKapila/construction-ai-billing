/**
 * Project Hub Types — Document management, trades, uploads, and comments
 */

export interface Trade {
  id: number;
  project_id: number;
  name: string;
  company_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  magic_link_token: string;
  email_alias: string | null;
  status: 'active' | 'inactive';
  invite_sent_at: string | null;
  created_at: string;
  upload_count?: number;
  pending_count?: number;
}

export type DocType = 'invoice' | 'lien_waiver' | 'rfi' | 'photo' | 'submittal' | 'daily_report' | 'change_order' | 'compliance' | 'drawing' | 'other';
export type UploadStatus = 'pending' | 'approved' | 'rejected';

export interface HubUpload {
  id: number;
  project_id: number;
  trade_id: number;
  trade_name: string;
  company_name: string | null;
  filename: string;
  original_name: string;
  doc_type: DocType;
  status: UploadStatus;
  amount: string | null;
  version: number;
  parent_upload_id: number | null;
  rejection_reason: string | null;
  source: 'web_app' | 'magic_link' | 'email_ingest';
  uploaded_by: string;
  notes: string | null;
  created_at: string;
  approved_at: string | null;
}

export interface HubComment {
  id: number;
  upload_id: number;
  author_name: string;
  text: string;
  is_rfi_reply: boolean;
  is_rejection: boolean;
  created_at: string;
}

export interface HubStats {
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  trade_count: number;
}

export interface TeamRole {
  role: 'office' | 'pm' | 'superintendent';
  user_id: number | null;
  name: string | null;
}

export interface MagicLinkInfo {
  project_name: string;
  trade_name: string;
  company_name: string | null;
  uploads: HubUpload[];
}
