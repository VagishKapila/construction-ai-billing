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

    -- Backfill existing users: set trial dates based on their registration date
    UPDATE users SET trial_start_date = created_at WHERE trial_start_date IS NULL;
    UPDATE users SET trial_end_date = created_at + INTERVAL '90 days' WHERE trial_end_date IS NULL;
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
      followup_type VARCHAR(50) NOT NULL,
      scheduled_date DATE,
      sent_at TIMESTAMPTZ,
      response VARCHAR(50),
      response_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_followups_payapp ON payment_followups(pay_app_id);

    -- User Stripe Connect columns
    ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_connect_id VARCHAR(200);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS payments_enabled BOOLEAN DEFAULT FALSE;
  `);
  console.log('Database ready');
}

module.exports = { pool, initDB };