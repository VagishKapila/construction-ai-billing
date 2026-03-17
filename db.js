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
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS dist_architect  BOOLEAN DEFAULT TRUE;
    ALTER TABLE pay_apps ADD COLUMN IF NOT EXISTS dist_contractor BOOLEAN DEFAULT FALSE;
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
  `);
  console.log('Database ready');
}

module.exports = { pool, initDB };