const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      email VARCHAR(200) UNIQUE NOT NULL,
      password_hash VARCHAR(200) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(300) NOT NULL,
      number VARCHAR(100),
      owner VARCHAR(300),
      contractor VARCHAR(300),
      architect VARCHAR(300),
      contact VARCHAR(300),
      contact_name VARCHAR(200),
      contact_phone VARCHAR(100),
      contact_email VARCHAR(200),
      building_area VARCHAR(100),
      original_contract NUMERIC(14,2) DEFAULT 0,
      contract_date DATE,
      est_date DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sov_lines (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      item_id VARCHAR(50),
      description TEXT,
      scheduled_value NUMERIC(14,2) DEFAULT 0,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sov_uploads (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      filename VARCHAR(300),
      original_name VARCHAR(300),
      file_size INTEGER,
      mime_type VARCHAR(100),
      row_count INTEGER DEFAULT 0,
      uploaded_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS pay_apps (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      app_number INTEGER NOT NULL,
      period_start DATE,
      period_end DATE,
      period_label VARCHAR(100),
      status VARCHAR(50) DEFAULT 'draft',
      architect_certified NUMERIC(14,2),
      architect_name VARCHAR(200),
      architect_date DATE,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS pay_app_lines (
      id SERIAL PRIMARY KEY,
      pay_app_id INTEGER REFERENCES pay_apps(id) ON DELETE CASCADE,
      sov_line_id INTEGER REFERENCES sov_lines(id) ON DELETE CASCADE,
      prev_pct NUMERIC(6,2) DEFAULT 0,
      this_pct NUMERIC(6,2) DEFAULT 0,
      retainage_pct NUMERIC(6,2) DEFAULT 10,
      stored_materials NUMERIC(14,2) DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS change_orders (
      id SERIAL PRIMARY KEY,
      pay_app_id INTEGER REFERENCES pay_apps(id) ON DELETE CASCADE,
      co_number INTEGER,
      description TEXT,
      amount NUMERIC(14,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS attachments (
      id SERIAL PRIMARY KEY,
      pay_app_id INTEGER REFERENCES pay_apps(id) ON DELETE CASCADE,
      filename VARCHAR(300),
      original_name VARCHAR(300),
      file_size INTEGER,
      mime_type VARCHAR(100),
      uploaded_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS company_settings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      company_name VARCHAR(300),
      default_payment_terms VARCHAR(100) DEFAULT 'Due on receipt',
      default_retainage NUMERIC(5,2) DEFAULT 10,
      logo_filename VARCHAR(300),
      logo_original_name VARCHAR(300),
      signature_filename VARCHAR(300),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS dist_owner      BOOLEAN DEFAULT TRUE;
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS dist_architect  BOOLEAN DEFAULT FALSE;
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS dist_contractor BOOLEAN DEFAULT FALSE;
    -- Fix: architect was wrongly defaulting to TRUE — change default and fix existing rows
    ALTER TABLE pay_apps ALTER COLUMN dist_architect SET DEFAULT FALSE;
    UPDATE pay_apps SET dist_architect = FALSE WHERE dist_architect = TRUE;
    ALTER TABLE projects  ADD COLUMN IF NOT EXISTS default_retainage NUMERIC(5,2) DEFAULT 10;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id          VARCHAR(200);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified     BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(200);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_sent_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked            BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason     TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash_col  VARCHAR(200);
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS contact_name  VARCHAR(200);
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(100);
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS contact_email VARCHAR(200);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS analytics_events (
      id         BIGSERIAL PRIMARY KEY,
      user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      event      VARCHAR(100) NOT NULL,
      meta       JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_analytics_event    ON analytics_events(event);
    CREATE INDEX IF NOT EXISTS idx_analytics_user     ON analytics_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_created  ON analytics_events(created_at);

    -- Phase 1: Roles, job numbers, contracts, lien docs, feedback
    ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_role VARCHAR(50) DEFAULT 'user';
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS job_number VARCHAR(50);
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS jurisdiction VARCHAR(50) DEFAULT 'california';
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS job_number_format VARCHAR(200);
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS job_number_seq INTEGER DEFAULT 0;

    CREATE TABLE IF NOT EXISTS team_members (
      id SERIAL PRIMARY KEY,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      email VARCHAR(200) NOT NULL,
      name VARCHAR(200),
      role VARCHAR(50) DEFAULT 'field',
      invite_token VARCHAR(200),
      invite_accepted BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_team_owner_email
      ON team_members(owner_user_id, email);

    CREATE TABLE IF NOT EXISTS contracts (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      filename VARCHAR(500),
      original_name VARCHAR(500),
      file_size INTEGER,
      contract_type VARCHAR(100) DEFAULT 'unknown',
      extracted JSONB DEFAULT '{}',
      uploaded_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lien_documents (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      pay_app_id INTEGER REFERENCES pay_apps(id) ON DELETE SET NULL,
      doc_type VARCHAR(50) NOT NULL,
      filename VARCHAR(500),
      jurisdiction VARCHAR(50) DEFAULT 'california',
      through_date DATE,
      amount NUMERIC(14,2),
      maker_of_check VARCHAR(300),
      check_payable_to VARCHAR(300),
      signatory_name VARCHAR(200),
      signatory_title VARCHAR(200),
      signed_at TIMESTAMPTZ,
      signatory_ip VARCHAR(100),
      sent_at TIMESTAMPTZ,
      sent_to VARCHAR(500),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      category VARCHAR(50) DEFAULT 'other',
      message TEXT,
      screenshot_filename VARCHAR(500),
      page_context VARCHAR(500),
      digest_sent BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_digest ON feedback(digest_sent, created_at);

    -- Revenue & reminders
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS payment_due_date DATE;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS retention_due_date DATE;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS address VARCHAR(500);
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_email VARCHAR(300);
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_phone VARCHAR(50);
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS amount_due NUMERIC(14,2);
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS retention_held NUMERIC(14,2);
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS invoice_token VARCHAR(100) UNIQUE;
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS payment_due_date DATE;
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id);
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS po_number VARCHAR(100);
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS special_notes TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_sent_at TIMESTAMPTZ;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS reminder_7before BOOLEAN DEFAULT TRUE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS reminder_due BOOLEAN DEFAULT TRUE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS reminder_7after BOOLEAN DEFAULT TRUE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS reminder_retention BOOLEAN DEFAULT TRUE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS reminder_email VARCHAR(300);
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS reminder_phone VARCHAR(50);
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS credit_card_enabled BOOLEAN DEFAULT FALSE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS nudge_30day BOOLEAN DEFAULT TRUE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS nudge_60day BOOLEAN DEFAULT TRUE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS nudge_5payapps BOOLEAN DEFAULT TRUE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS nudge_dismiss_days INTEGER DEFAULT 7;

    -- Company address fields + license number + per-user notification preferences
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS company_address VARCHAR(500);
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS company_city    VARCHAR(200);
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS company_state   VARCHAR(100);
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS company_zip     VARCHAR(20);
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS license_number  VARCHAR(100);
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS notifications_pay_app  BOOLEAN DEFAULT TRUE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS notifications_payment  BOOLEAN DEFAULT TRUE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS notifications_overdue  BOOLEAN DEFAULT TRUE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS notifications_lien     BOOLEAN DEFAULT TRUE;

    -- Contract document upload (optional signed contract attached to project)
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_filename VARCHAR(300);
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_original_name VARCHAR(300);

    -- Per-project payment terms (overrides company default in AIA preview)
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(100);

    -- Payment received flag for revenue tracking
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS payment_received BOOLEAN DEFAULT FALSE;
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS payment_received_at TIMESTAMPTZ;

    -- Module 1: Trial & Subscription System (Mar 28 2026)
    ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_start_date TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'trial';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_type VARCHAR(50) DEFAULT 'free_trial';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(200);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(200);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN DEFAULT FALSE;

    -- Backfill existing users: give them 90 days from NOW (not from signup)
    -- This prevents instant-expiry for users who registered before the trial system existed
    UPDATE users SET trial_start_date = NOW() WHERE trial_start_date IS NULL;
    UPDATE users SET trial_end_date = NOW() + INTERVAL '90 days' WHERE trial_end_date IS NULL;
    UPDATE users SET subscription_status = 'trial' WHERE subscription_status IS NULL;
    UPDATE users SET plan_type = 'free_trial' WHERE plan_type IS NULL;

    CREATE TABLE IF NOT EXISTS reminder_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      pay_app_id INTEGER,
      reminder_type VARCHAR(50) NOT NULL,
      sent_to VARCHAR(300),
      sent_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_reminder_log ON reminder_log(user_id, reminder_type, sent_at);

    -- Stripe Connect: GC connected accounts
    CREATE TABLE IF NOT EXISTS connected_accounts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      stripe_account_id VARCHAR(200) NOT NULL,
      account_status VARCHAR(50) DEFAULT 'pending',
      charges_enabled BOOLEAN DEFAULT FALSE,
      payouts_enabled BOOLEAN DEFAULT FALSE,
      business_name VARCHAR(300),
      payout_schedule VARCHAR(50) DEFAULT 'every_2_days',
      onboarded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_connected_stripe_id ON connected_accounts(stripe_account_id);

    -- Payments: tracks every payment from owner to GC
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      pay_app_id INTEGER REFERENCES pay_apps(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      stripe_payment_intent_id VARCHAR(200),
      stripe_checkout_session_id VARCHAR(200),
      payment_token VARCHAR(100) UNIQUE NOT NULL,
      amount NUMERIC(14,2) NOT NULL,
      processing_fee NUMERIC(14,2) DEFAULT 0,
      platform_fee NUMERIC(14,2) DEFAULT 0,
      payment_method VARCHAR(50),
      payment_status VARCHAR(50) DEFAULT 'pending',
      payer_name VARCHAR(300),
      payer_email VARCHAR(300),
      payer_phone VARCHAR(100),
      paid_at TIMESTAMPTZ,
      failed_at TIMESTAMPTZ,
      failure_reason TEXT,
      refunded_at TIMESTAMPTZ,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_payments_pay_app ON payments(pay_app_id);
    CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(payment_status);
    CREATE INDEX IF NOT EXISTS idx_payments_token ON payments(payment_token);

    -- Pay app payment tracking columns
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'unpaid';
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(14,2) DEFAULT 0;
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS payment_link_token VARCHAR(100);
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS bad_debt BOOLEAN DEFAULT FALSE;
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS bad_debt_at TIMESTAMPTZ;
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS bad_debt_reason TEXT;

    -- Payment follow-up tracking
    CREATE TABLE IF NOT EXISTS payment_followups (
      id SERIAL PRIMARY KEY,
      payment_id INTEGER REFERENCES payments(id) ON DELETE CASCADE,
      pay_app_id INTEGER REFERENCES pay_apps(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      followup_type VARCHAR(50) NOT NULL,
      scheduled_date DATE,
      sent_at TIMESTAMPTZ,
      response VARCHAR(50),
      response_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_followups_payapp ON payment_followups(pay_app_id);
    ALTER TABLE payment_followups ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

    -- User Stripe Connect columns
    ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_connect_id VARCHAR(200);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS payments_enabled BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN DEFAULT FALSE;

    -- Optional G702/G703 sections per project (Mar 30 2026)
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS include_architect BOOLEAN DEFAULT TRUE;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS include_retainage BOOLEAN DEFAULT TRUE;

    -- Other invoices: non-contract items (permits, materials, misc) tracked per project
    CREATE TABLE IF NOT EXISTS other_invoices (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      invoice_number VARCHAR(100),
      category VARCHAR(100) DEFAULT 'other',
      description TEXT,
      vendor VARCHAR(300),
      amount NUMERIC(14,2) DEFAULT 0,
      invoice_date DATE DEFAULT CURRENT_DATE,
      due_date DATE,
      status VARCHAR(50) DEFAULT 'sent',
      notes TEXT,
      attachment_filename VARCHAR(300),
      attachment_original_name VARCHAR(300),
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_other_invoices_project ON other_invoices(project_id);
    CREATE INDEX IF NOT EXISTS idx_other_invoices_user ON other_invoices(user_id);

    -- Backfill: existing draft other invoices → sent
    UPDATE other_invoices SET status = 'sent' WHERE status = 'draft';

    -- App-level settings (Stripe price IDs, feature flags, etc.)
    CREATE TABLE IF NOT EXISTS app_settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- QuickBooks Online Integration (Phase 8, Apr 2026)
    CREATE TABLE IF NOT EXISTS quickbooks_connections (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      realm_id VARCHAR(100) NOT NULL,          -- QB company ID
      access_token_enc TEXT NOT NULL,           -- encrypted access token
      refresh_token_enc TEXT NOT NULL,          -- encrypted refresh token
      token_expires_at TIMESTAMPTZ NOT NULL,
      company_name VARCHAR(300),
      company_id VARCHAR(100),
      sandbox BOOLEAN DEFAULT FALSE,
      connected_at TIMESTAMPTZ DEFAULT NOW(),
      last_sync_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_qb_realm ON quickbooks_connections(realm_id);

    CREATE TABLE IF NOT EXISTS quickbooks_sync_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      pay_app_id INTEGER REFERENCES pay_apps(id) ON DELETE SET NULL,
      sync_type VARCHAR(50) NOT NULL,           -- 'project', 'invoice', 'payment', 'estimate_import'
      sync_direction VARCHAR(20) NOT NULL,      -- 'push' (to QB) or 'pull' (from QB)
      qb_entity_type VARCHAR(50),              -- 'Customer', 'Invoice', 'Payment', 'Estimate'
      qb_entity_id VARCHAR(100),              -- QB entity ID
      sync_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'success', 'error', 'skipped'
      request_payload JSONB,
      response_payload JSONB,
      error_message TEXT,
      synced_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_qb_sync_project ON quickbooks_sync_log(project_id);
    CREATE INDEX IF NOT EXISTS idx_qb_sync_user ON quickbooks_sync_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_qb_sync_status ON quickbooks_sync_log(sync_status);

    -- Add QB mapping columns to projects
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS qb_customer_id VARCHAR(100);
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS qb_project_id VARCHAR(100);
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS qb_sync_status VARCHAR(50) DEFAULT 'not_synced';
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS qb_last_synced_at TIMESTAMPTZ;

    -- Add QB mapping columns to pay apps
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS qb_invoice_id VARCHAR(100);
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS qb_payment_id VARCHAR(100);
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS qb_sync_status VARCHAR(50) DEFAULT 'not_synced';

    -- Final retainage release tracking
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS is_retainage_release BOOLEAN DEFAULT FALSE;

    -- Email send tracking (Bug Fix 3)
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS email_sent_count INT DEFAULT 0;

    -- Project status: active (default) or completed (job finished, no more pay apps)
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

    -- Module 1: Trial & Subscription System (additional columns for full implementation)
    ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

    -- Module 3: Onboarding Walkthrough (tracked per user)
    -- Note: has_completed_onboarding already added above (line 243)

    -- Module 4: AI Assistant Training — conversation history
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      messages JSONB DEFAULT '[]',
      context_type VARCHAR(50) DEFAULT 'general',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_conversations_context ON ai_conversations(context_type);

    -- Module 5: Reporting Module — saved reports
    CREATE TABLE IF NOT EXISTS saved_reports (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(300) NOT NULL,
      filters JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_saved_reports_user ON saved_reports(user_id);

    -- Module 6: Pro Upgrade Nudges — nudge tracking per user
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_nudge_shown_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS nudge_dismissed_until TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS total_nudges_shown INTEGER DEFAULT 0;

    -- Nudge analytics tracking
    CREATE TABLE IF NOT EXISTS nudge_analytics (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      nudge_type VARCHAR(100),
      shown_at TIMESTAMPTZ DEFAULT NOW(),
      dismissed_at TIMESTAMPTZ,
      clicked_at TIMESTAMPTZ,
      action VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_nudge_analytics_user ON nudge_analytics(user_id);
    CREATE INDEX IF NOT EXISTS idx_nudge_analytics_type ON nudge_analytics(nudge_type);

    -- Module 7: QA & Testing (optional: tracking for test data identification)
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN DEFAULT FALSE;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_test_project BOOLEAN DEFAULT FALSE;

    -- Module 8: Project Hub — Phase 1 Document Intake (Apr 2026)
    CREATE TABLE IF NOT EXISTS project_trades (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      company_name VARCHAR(300),
      contact_name VARCHAR(200),
      contact_email VARCHAR(200),
      magic_link_token VARCHAR(100) UNIQUE,
      email_alias VARCHAR(300),
      status VARCHAR(50) DEFAULT 'active',
      invite_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hub_uploads (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      trade_id INTEGER REFERENCES project_trades(id) ON DELETE CASCADE,
      filename VARCHAR(300),
      original_name VARCHAR(300),
      file_size INTEGER,
      mime_type VARCHAR(100),
      doc_type VARCHAR(50) DEFAULT 'other',
      status VARCHAR(50) DEFAULT 'pending',
      amount NUMERIC(14,2),
      version INTEGER DEFAULT 1,
      parent_upload_id INTEGER REFERENCES hub_uploads(id),
      rejection_reason TEXT,
      source VARCHAR(50) DEFAULT 'web_app',
      uploaded_by VARCHAR(200),
      approved_by INTEGER REFERENCES users(id),
      approved_at TIMESTAMPTZ,
      stale_warning_sent_at TIMESTAMPTZ,
      stale_escalation_sent_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hub_comments (
      id SERIAL PRIMARY KEY,
      upload_id INTEGER REFERENCES hub_uploads(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      author_name VARCHAR(200),
      text TEXT NOT NULL,
      is_rfi_reply BOOLEAN DEFAULT false,
      is_rejection BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hub_team_roles (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(50) NOT NULL,
      UNIQUE(project_id, role)
    );

    CREATE TABLE IF NOT EXISTS hub_notifications (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      upload_id INTEGER REFERENCES hub_uploads(id),
      user_id INTEGER REFERENCES users(id),
      trigger_type VARCHAR(50),
      message TEXT,
      read BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_project_trades_project ON project_trades(project_id);
    CREATE INDEX IF NOT EXISTS idx_hub_uploads_project ON hub_uploads(project_id);
    CREATE INDEX IF NOT EXISTS idx_hub_uploads_trade ON hub_uploads(trade_id);
    CREATE INDEX IF NOT EXISTS idx_hub_uploads_status ON hub_uploads(status);
    CREATE INDEX IF NOT EXISTS idx_hub_comments_upload ON hub_comments(upload_id);
    CREATE INDEX IF NOT EXISTS idx_hub_notifications_user ON hub_notifications(user_id, read);

    -- Manual payments tracking (Fix 2: recording offline/check payments)
    CREATE TABLE IF NOT EXISTS manual_payments (
      id SERIAL PRIMARY KEY,
      pay_app_id INTEGER REFERENCES pay_apps(id) ON DELETE CASCADE,
      amount NUMERIC(14,2) NOT NULL,
      payment_method VARCHAR(50) DEFAULT 'check',
      check_number VARCHAR(100),
      payment_date DATE DEFAULT CURRENT_DATE,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_manual_payments_payapp ON manual_payments(pay_app_id);

    -- Trust Score Engine (Apr 2026) — vendor performance tracking
    CREATE TABLE IF NOT EXISTS vendor_trust_scores (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      vendor_email VARCHAR(300),
      score INTEGER DEFAULT 500,
      tier VARCHAR(50) DEFAULT 'silver',
      max_score INTEGER DEFAULT 763,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_vendor_trust_project ON vendor_trust_scores(project_id);
    -- idx_vendor_trust_email intentionally omitted: vendor_email column is dropped by Hub v2 migration below

    CREATE TABLE IF NOT EXISTS vendor_trust_events (
      id SERIAL PRIMARY KEY,
      vendor_trust_score_id INTEGER REFERENCES vendor_trust_scores(id) ON DELETE CASCADE,
      event_type VARCHAR(50) NOT NULL,
      score_delta INTEGER NOT NULL,
      score_after INTEGER NOT NULL,
      rejection_category VARCHAR(100),
      coaching_note TEXT,
      upload_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    -- idx_vendor_trust_events_score intentionally omitted: vendor_trust_score_id column is dropped by Hub v2 migration below
    CREATE INDEX IF NOT EXISTS idx_vendor_trust_events_type ON vendor_trust_events(event_type);

    -- Vendor Address Book (Apr 2026) — trade partners, subs, suppliers
    CREATE TABLE IF NOT EXISTS vendor_address_book (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_name VARCHAR(255) NOT NULL,
      contact_name VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(20),
      trade_type VARCHAR(100),
      address TEXT,
      notes TEXT,
      import_source VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(owner_id, email)
    );
    -- idx_vendor_book_owner intentionally omitted: owner_id column is dropped by Hub v2 migration below (replaced by owner_user_id)
    CREATE INDEX IF NOT EXISTS idx_vendor_book_trade ON vendor_address_book(trade_type);
    CREATE INDEX IF NOT EXISTS idx_vendor_book_email ON vendor_address_book(email);

    -- Hub Close-Out Events (Apr 2026) — project close-out ZIP packages
    CREATE TABLE IF NOT EXISTS hub_close_out_events (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      zip_filename VARCHAR(300),
      docs_included INTEGER DEFAULT 0,
      pay_apps_included INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_hub_closeout_project ON hub_close_out_events(project_id);
    CREATE INDEX IF NOT EXISTS idx_hub_closeout_created ON hub_close_out_events(created_at);

    -- Early Payment System (Apr 2026) — sub early access to payment, Stripe fee, GC approval gate
    ALTER TABLE project_trades ADD COLUMN IF NOT EXISTS early_pay_eligible BOOLEAN DEFAULT true;
    ALTER TABLE project_trades ADD COLUMN IF NOT EXISTS gc_early_pay_override BOOLEAN DEFAULT false;

    ALTER TABLE hub_uploads ADD COLUMN IF NOT EXISTS early_pay_requested BOOLEAN DEFAULT false;
    ALTER TABLE hub_uploads ADD COLUMN IF NOT EXISTS early_pay_request_id INTEGER;

    CREATE TABLE IF NOT EXISTS early_payment_requests (
      id SERIAL PRIMARY KEY,
      hub_upload_id INTEGER REFERENCES hub_uploads(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      trade_id INTEGER REFERENCES project_trades(id),
      requested_by VARCHAR(200),
      amount NUMERIC(14,2) NOT NULL,
      fee_pct NUMERIC(5,4) DEFAULT 0.025,
      fee_amount NUMERIC(14,2),
      net_amount NUMERIC(14,2),
      status VARCHAR(50) DEFAULT 'pending',
      stripe_payment_intent_id VARCHAR(200),
      stripe_transfer_id VARCHAR(200),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    -- idx_early_payment_hub_upload intentionally omitted: hub_upload_id column is dropped by Hub v2 migration below (replaced by upload_id)
    CREATE INDEX IF NOT EXISTS idx_early_payment_project ON early_payment_requests(project_id);
    CREATE INDEX IF NOT EXISTS idx_early_payment_status ON early_payment_requests(status);

    -- Project join codes (Agent 3 — sub registration via codes)
    CREATE TABLE IF NOT EXISTS project_join_codes (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      code VARCHAR(20) UNIQUE NOT NULL,
      trade_type VARCHAR(100),
      created_by INTEGER REFERENCES users(id),
      expires_at TIMESTAMPTZ,
      used_at TIMESTAMPTZ,
      used_by INTEGER REFERENCES users(id),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_join_codes_project ON project_join_codes(project_id);
    CREATE INDEX IF NOT EXISTS idx_join_codes_code ON project_join_codes(code);

    -- Payer trust scores (per payer email + project)
    CREATE TABLE IF NOT EXISTS payer_trust_scores (
      id SERIAL PRIMARY KEY,
      payer_email VARCHAR(255) NOT NULL,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      avg_days_to_pay NUMERIC(6,2),
      payment_count INTEGER DEFAULT 0,
      last_payment_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(payer_email, project_id)
    );

    -- ARIA follow-up log (tracks sent follow-up emails)
    CREATE TABLE IF NOT EXISTS aria_follow_up_log (
      id SERIAL PRIMARY KEY,
      pay_app_id INTEGER REFERENCES pay_apps(id) ON DELETE CASCADE,
      follow_up_day INTEGER,
      tone VARCHAR(20),
      days_overdue INTEGER,
      resend_message_id VARCHAR(200),
      email_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_aria_follow_up_pay_app ON aria_follow_up_log(pay_app_id);

    -- ARIA lien alerts (CA preliminary notice deadlines)
    CREATE TABLE IF NOT EXISTS aria_lien_alerts (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      state VARCHAR(10) DEFAULT 'CA',
      work_start_date DATE,
      preliminary_notice_due DATE,
      mechanics_lien_deadline DATE,
      alert_day_15_sent BOOLEAN DEFAULT false,
      alert_day_19_sent BOOLEAN DEFAULT false,
      alert_day_20_sent BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_aria_lien_project ON aria_lien_alerts(project_id);

    -- Cash flow forecasts (30-day projections, upserted daily)
    CREATE TABLE IF NOT EXISTS cash_flow_forecasts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      forecast_date DATE NOT NULL,
      projected_inflow NUMERIC(14,2) DEFAULT 0,
      projected_outflow NUMERIC(14,2) DEFAULT 0,
      projected_net_flow NUMERIC(14,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, forecast_date)
    );
    CREATE INDEX IF NOT EXISTS idx_cash_forecast_user ON cash_flow_forecasts(user_id);
    -- idx_cash_forecast_date intentionally omitted: forecast_date column is dropped by Hub v2 migration below

    -- Hub close-out events (ZIP export records)
    ALTER TABLE hub_close_out_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

    -- ARIA knowledge events (for admin insights)
    CREATE TABLE IF NOT EXISTS aria_knowledge_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      question TEXT,
      category VARCHAR(100),
      answer_given TEXT,
      was_helpful BOOLEAN,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    -- idx_aria_knowledge_user intentionally omitted: user_id column is dropped by Hub v2 migration below

    -- User role fields for sub/gc distinction
    ALTER TABLE users ADD COLUMN IF NOT EXISTS joined_via_code VARCHAR(20);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS user_role VARCHAR(20) DEFAULT 'gc';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS company_trade VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name VARCHAR(300);

    -- Trade fields for early pay
    ALTER TABLE project_trades ADD COLUMN IF NOT EXISTS trust_score_id INTEGER;
    ALTER TABLE project_trades ADD COLUMN IF NOT EXISTS early_pay_eligible BOOLEAN DEFAULT true;
    ALTER TABLE project_trades ADD COLUMN IF NOT EXISTS gc_early_pay_override BOOLEAN DEFAULT false;

    -- AGENT 1: Schema alignment for vendor_trust_scores (spec compliance)
    ALTER TABLE vendor_trust_scores ADD COLUMN IF NOT EXISTS vendor_user_id INTEGER REFERENCES users(id);
    ALTER TABLE vendor_trust_scores ADD COLUMN IF NOT EXISTS evaluating_user_id INTEGER REFERENCES users(id);
    ALTER TABLE vendor_trust_scores DROP COLUMN IF EXISTS vendor_email;
    ALTER TABLE vendor_trust_scores DROP COLUMN IF EXISTS max_score;
    ALTER TABLE vendor_trust_scores ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0 CHECK (score >= 0 AND score <= 763);
    ALTER TABLE vendor_trust_scores ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'review' CHECK (tier IN ('platinum','gold','silver','bronze','review'));
    ALTER TABLE vendor_trust_scores ADD COLUMN IF NOT EXISTS signal_breakdown JSONB DEFAULT '{}';
    ALTER TABLE vendor_trust_scores ADD COLUMN IF NOT EXISTS is_visible_to_vendor BOOLEAN DEFAULT FALSE;
    ALTER TABLE vendor_trust_scores ADD COLUMN IF NOT EXISTS manual_override_score INTEGER;
    ALTER TABLE vendor_trust_scores ADD COLUMN IF NOT EXISTS manual_override_reason TEXT;
    ALTER TABLE vendor_trust_scores ADD COLUMN IF NOT EXISTS imported_baseline_score NUMERIC;
    ALTER TABLE vendor_trust_scores ADD COLUMN IF NOT EXISTS imported_baseline_scale TEXT;
    ALTER TABLE vendor_trust_scores ADD COLUMN IF NOT EXISTS computed_at TIMESTAMP;

    -- AGENT 1: Schema alignment for vendor_trust_events (spec compliance)
    ALTER TABLE vendor_trust_events DROP COLUMN IF EXISTS vendor_trust_score_id;
    ALTER TABLE vendor_trust_events ADD COLUMN IF NOT EXISTS vendor_user_id INTEGER REFERENCES users(id);
    ALTER TABLE vendor_trust_events ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
    ALTER TABLE vendor_trust_events DROP COLUMN IF EXISTS score_delta;
    ALTER TABLE vendor_trust_events DROP COLUMN IF EXISTS score_after;
    ALTER TABLE vendor_trust_events ADD COLUMN IF NOT EXISTS rejection_note_raw TEXT;
    ALTER TABLE vendor_trust_events ADD COLUMN IF NOT EXISTS rejection_category TEXT;
    ALTER TABLE vendor_trust_events ADD COLUMN IF NOT EXISTS score_delta INTEGER DEFAULT 0;
    ALTER TABLE vendor_trust_events ADD COLUMN IF NOT EXISTS aria_coaching_note TEXT;

    -- AGENT 1: Schema alignment for vendor_address_book (spec compliance)
    ALTER TABLE vendor_address_book DROP COLUMN IF EXISTS owner_id;
    ALTER TABLE vendor_address_book ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
    ALTER TABLE vendor_address_book DROP COLUMN IF EXISTS address;
    ALTER TABLE vendor_address_book DROP COLUMN IF EXISTS notes;
    ALTER TABLE vendor_address_book DROP COLUMN IF EXISTS import_source;
    ALTER TABLE vendor_address_book ADD COLUMN IF NOT EXISTS has_account BOOLEAN DEFAULT FALSE;
    ALTER TABLE vendor_address_book ADD COLUMN IF NOT EXISTS account_user_id INTEGER REFERENCES users(id);
    ALTER TABLE vendor_address_book ADD COLUMN IF NOT EXISTS stripe_connect_id TEXT;
    ALTER TABLE vendor_address_book ADD COLUMN IF NOT EXISTS projects_count INTEGER DEFAULT 0;
    ALTER TABLE vendor_address_book ADD COLUMN IF NOT EXISTS imported_score NUMERIC;
    ALTER TABLE vendor_address_book ADD COLUMN IF NOT EXISTS imported_score_scale TEXT;

    -- AGENT 1: Schema alignment for payer_trust_scores (spec compliance)
    ALTER TABLE payer_trust_scores ADD COLUMN IF NOT EXISTS evaluating_user_id INTEGER REFERENCES users(id);
    ALTER TABLE payer_trust_scores DROP COLUMN IF EXISTS payment_count;
    ALTER TABLE payer_trust_scores DROP COLUMN IF EXISTS last_payment_at;
    ALTER TABLE payer_trust_scores ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 381 CHECK (score >= 0 AND score <= 763);
    ALTER TABLE payer_trust_scores ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'silver';
    ALTER TABLE payer_trust_scores ADD COLUMN IF NOT EXISTS dispute_count INTEGER DEFAULT 0;
    ALTER TABLE payer_trust_scores ADD COLUMN IF NOT EXISTS signal_breakdown JSONB DEFAULT '{}';
    ALTER TABLE payer_trust_scores ADD COLUMN IF NOT EXISTS computed_at TIMESTAMP DEFAULT NOW();

    -- AGENT 1: Schema alignment for aria_lien_alerts (spec compliance)
    ALTER TABLE aria_lien_alerts DROP COLUMN IF EXISTS work_start_date;
    ALTER TABLE aria_lien_alerts DROP COLUMN IF EXISTS preliminary_notice_due;
    ALTER TABLE aria_lien_alerts DROP COLUMN IF EXISTS mechanics_lien_deadline;
    ALTER TABLE aria_lien_alerts DROP COLUMN IF EXISTS alert_day_15_sent;
    ALTER TABLE aria_lien_alerts DROP COLUMN IF EXISTS alert_day_19_sent;
    ALTER TABLE aria_lien_alerts DROP COLUMN IF EXISTS alert_day_20_sent;
    ALTER TABLE aria_lien_alerts ADD COLUMN IF NOT EXISTS state TEXT DEFAULT 'CA';
    ALTER TABLE aria_lien_alerts ADD COLUMN IF NOT EXISTS alert_type TEXT DEFAULT 'preliminary_20day' CHECK (alert_type IN ('preliminary_20day','filing_deadline','enforcement_deadline','retention_release'));
    ALTER TABLE aria_lien_alerts ADD COLUMN IF NOT EXISTS deadline_date DATE DEFAULT CURRENT_DATE;
    ALTER TABLE aria_lien_alerts ADD COLUMN IF NOT EXISTS alerted_at TIMESTAMP;
    ALTER TABLE aria_lien_alerts ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMP;
    ALTER TABLE aria_lien_alerts ADD COLUMN IF NOT EXISTS document_generated_at TIMESTAMP;
    ALTER TABLE aria_lien_alerts ADD COLUMN IF NOT EXISTS document_path TEXT;

    -- AGENT 1: Schema alignment for aria_follow_up_log (spec compliance)
    ALTER TABLE aria_follow_up_log ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
    ALTER TABLE aria_follow_up_log DROP COLUMN IF EXISTS follow_up_day;
    ALTER TABLE aria_follow_up_log ADD COLUMN IF NOT EXISTS pay_app_id INTEGER;
    ALTER TABLE aria_follow_up_log ADD COLUMN IF NOT EXISTS owner_email TEXT;
    ALTER TABLE aria_follow_up_log ADD COLUMN IF NOT EXISTS follow_up_number INTEGER DEFAULT 1;
    ALTER TABLE aria_follow_up_log ADD COLUMN IF NOT EXISTS tone TEXT DEFAULT 'friendly' CHECK (tone IN ('friendly','firm','lien_warning'));
    ALTER TABLE aria_follow_up_log DROP COLUMN IF EXISTS days_overdue;
    ALTER TABLE aria_follow_up_log DROP COLUMN IF EXISTS resend_message_id;
    ALTER TABLE aria_follow_up_log DROP COLUMN IF EXISTS email_sent_at;
    ALTER TABLE aria_follow_up_log ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP DEFAULT NOW();
    ALTER TABLE aria_follow_up_log ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP;
    ALTER TABLE aria_follow_up_log ADD COLUMN IF NOT EXISTS payment_received_at TIMESTAMP;

    -- AGENT 1: Schema alignment for cash_flow_forecasts (spec compliance)
    ALTER TABLE cash_flow_forecasts DROP COLUMN IF EXISTS forecast_date;
    ALTER TABLE cash_flow_forecasts DROP COLUMN IF EXISTS projected_inflow;
    ALTER TABLE cash_flow_forecasts DROP COLUMN IF EXISTS projected_outflow;
    ALTER TABLE cash_flow_forecasts DROP COLUMN IF EXISTS projected_net_flow;
    ALTER TABLE cash_flow_forecasts ADD COLUMN IF NOT EXISTS computed_at TIMESTAMP DEFAULT NOW();
    ALTER TABLE cash_flow_forecasts ADD COLUMN IF NOT EXISTS forecast_json JSONB DEFAULT '[]';
    ALTER TABLE cash_flow_forecasts ADD COLUMN IF NOT EXISTS gap_detected BOOLEAN DEFAULT FALSE;
    ALTER TABLE cash_flow_forecasts ADD COLUMN IF NOT EXISTS gap_amount NUMERIC;
    ALTER TABLE cash_flow_forecasts ADD COLUMN IF NOT EXISTS gap_date DATE;

    -- AGENT 1: Schema alignment for early_payment_requests (spec compliance)
    ALTER TABLE early_payment_requests DROP COLUMN IF EXISTS hub_upload_id;
    ALTER TABLE early_payment_requests DROP COLUMN IF EXISTS trade_id;
    ALTER TABLE early_payment_requests DROP COLUMN IF EXISTS requested_by;
    ALTER TABLE early_payment_requests DROP COLUMN IF EXISTS fee_pct;
    ALTER TABLE early_payment_requests DROP COLUMN IF EXISTS stripe_transfer_id;
    ALTER TABLE early_payment_requests ADD COLUMN IF NOT EXISTS upload_id INTEGER;
    ALTER TABLE early_payment_requests ADD COLUMN IF NOT EXISTS requesting_user_id INTEGER REFERENCES users(id);
    ALTER TABLE early_payment_requests ADD COLUMN IF NOT EXISTS invoice_amount NUMERIC DEFAULT 0;
    ALTER TABLE early_payment_requests ADD COLUMN IF NOT EXISTS fee_pct NUMERIC DEFAULT 0.015;
    ALTER TABLE early_payment_requests ADD COLUMN IF NOT EXISTS fee_amount NUMERIC;
    ALTER TABLE early_payment_requests ADD COLUMN IF NOT EXISTS ach_fee NUMERIC DEFAULT 25;
    ALTER TABLE early_payment_requests ADD COLUMN IF NOT EXISTS net_amount NUMERIC;
    ALTER TABLE early_payment_requests ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'ach' CHECK (payment_method IN ('ach','check'));
    ALTER TABLE early_payment_requests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','processing','completed','rejected'));
    ALTER TABLE early_payment_requests ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
    ALTER TABLE early_payment_requests ADD COLUMN IF NOT EXISTS requested_at TIMESTAMP DEFAULT NOW();
    ALTER TABLE early_payment_requests ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
    ALTER TABLE early_payment_requests ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP;

    -- AGENT 1: Schema alignment for hub_close_out_events (spec compliance)
    ALTER TABLE hub_close_out_events DROP COLUMN IF EXISTS zip_filename;
    ALTER TABLE hub_close_out_events DROP COLUMN IF EXISTS docs_included;
    ALTER TABLE hub_close_out_events DROP COLUMN IF EXISTS pay_apps_included;
    ALTER TABLE hub_close_out_events ADD COLUMN IF NOT EXISTS triggered_at TIMESTAMP;
    ALTER TABLE hub_close_out_events ADD COLUMN IF NOT EXISTS zip_path TEXT;
    ALTER TABLE hub_close_out_events ADD COLUMN IF NOT EXISTS zip_size INTEGER;
    ALTER TABLE hub_close_out_events ADD COLUMN IF NOT EXISTS download_count INTEGER;
    ALTER TABLE hub_close_out_events ADD COLUMN IF NOT EXISTS notified_at TIMESTAMP;

    -- AGENT 1: Schema alignment for aria_knowledge_events (spec compliance)
    ALTER TABLE aria_knowledge_events DROP COLUMN IF EXISTS user_id;
    ALTER TABLE aria_knowledge_events DROP COLUMN IF EXISTS question;
    ALTER TABLE aria_knowledge_events DROP COLUMN IF EXISTS category;
    ALTER TABLE aria_knowledge_events DROP COLUMN IF EXISTS answer_given;
    ALTER TABLE aria_knowledge_events DROP COLUMN IF EXISTS was_helpful;
    ALTER TABLE aria_knowledge_events ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'legacy_qa';
    ALTER TABLE aria_knowledge_events ADD COLUMN IF NOT EXISTS vendor_id INTEGER;
    ALTER TABLE aria_knowledge_events ADD COLUMN IF NOT EXISTS data_json JSONB DEFAULT '{}';
    ALTER TABLE aria_knowledge_events ADD COLUMN IF NOT EXISTS learned_at TIMESTAMP DEFAULT NOW();

    -- AGENT 1: Missing indexes for spec compliance
    CREATE INDEX IF NOT EXISTS idx_project_join_codes_project ON project_join_codes(project_id);
    CREATE INDEX IF NOT EXISTS idx_vendor_book_owner ON vendor_address_book(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_trust_scores_vendor ON vendor_trust_scores(vendor_user_id);
    CREATE INDEX IF NOT EXISTS idx_trust_events_vendor ON vendor_trust_events(vendor_user_id);
    CREATE INDEX IF NOT EXISTS idx_lien_alerts_project ON aria_lien_alerts(project_id);
    CREATE INDEX IF NOT EXISTS idx_early_pay_upload ON early_payment_requests(upload_id);
    CREATE INDEX IF NOT EXISTS idx_cash_forecasts_user ON cash_flow_forecasts(user_id);
  `);
  console.log('Database ready');
}

module.exports = { pool, initDB };