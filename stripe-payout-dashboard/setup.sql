-- ============================================================
-- stripe-payout-dashboard — Database Migration
-- Run once against your PostgreSQL database (DATABASE_URL)
-- ============================================================

-- Table 1: Raw webhook event log — every Stripe event is recorded here
CREATE TABLE IF NOT EXISTS stripe_payout_events (
  id                   SERIAL PRIMARY KEY,
  event_id             VARCHAR(100) UNIQUE NOT NULL,     -- Stripe evt_xxx — idempotency key
  event_type           VARCHAR(100) NOT NULL,             -- e.g. payout.paid
  connected_account_id VARCHAR(100),                      -- acct_xxx (null for platform events)
  amount               NUMERIC(14,2),                     -- dollars (not cents)
  currency             VARCHAR(10) DEFAULT 'usd',
  status               VARCHAR(50),                       -- created / paid / failed / canceled
  failure_message      TEXT,
  metadata             JSONB DEFAULT '{}'::jsonb,
  raw_event            JSONB,                             -- full Stripe event payload for debugging
  created_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payout_events_type         ON stripe_payout_events(event_type);
CREATE INDEX IF NOT EXISTS idx_payout_events_account      ON stripe_payout_events(connected_account_id);
CREATE INDEX IF NOT EXISTS idx_payout_events_created      ON stripe_payout_events(created_at DESC);

-- Table 2: Live state of each connected account — synced by webhook + cron
CREATE TABLE IF NOT EXISTS stripe_connected_accounts (
  id                   SERIAL PRIMARY KEY,
  account_id           VARCHAR(100) UNIQUE NOT NULL,      -- acct_xxx
  email                VARCHAR(300),
  business_name        VARCHAR(300),
  charges_enabled      BOOLEAN DEFAULT FALSE,
  payouts_enabled      BOOLEAN DEFAULT FALSE,
  bank_last4           VARCHAR(10),
  bank_routing         VARCHAR(20),
  bank_name            VARCHAR(200),
  payout_schedule      VARCHAR(50) DEFAULT 'daily',       -- daily / weekly / monthly / manual
  payout_delay_days    INTEGER DEFAULT 2,
  available_balance    NUMERIC(14,2) DEFAULT 0,
  pending_balance      NUMERIC(14,2) DEFAULT 0,
  last_payout_amount   NUMERIC(14,2),
  last_payout_date     TIMESTAMPTZ,
  last_payout_status   VARCHAR(50),                       -- paid / failed / in_transit
  onboarding_complete  BOOLEAN DEFAULT FALSE,
  last_synced_at       TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_acct    ON stripe_connected_accounts(account_id);

-- Table 3: Alerts — payout delays, failures, verification issues
CREATE TABLE IF NOT EXISTS stripe_payout_alerts (
  id           SERIAL PRIMARY KEY,
  account_id   VARCHAR(100) NOT NULL,
  alert_type   VARCHAR(50) NOT NULL,    -- payout_delayed | payout_failed | verification_required | bank_not_connected
  message      TEXT NOT NULL,
  resolved     BOOLEAN DEFAULT FALSE,
  resolved_at  TIMESTAMPTZ,
  resolved_by  VARCHAR(200),            -- email of admin who resolved it
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payout_alerts_account      ON stripe_payout_alerts(account_id);
CREATE INDEX IF NOT EXISTS idx_payout_alerts_unresolved   ON stripe_payout_alerts(resolved) WHERE resolved = FALSE;

-- Table 4: Transfer log — every platform → connected account transfer
CREATE TABLE IF NOT EXISTS stripe_transfers_log (
  id                   SERIAL PRIMARY KEY,
  transfer_id          VARCHAR(100) UNIQUE NOT NULL,       -- tr_xxx
  source_account       VARCHAR(100),                       -- platform account
  destination_account  VARCHAR(100) NOT NULL,              -- acct_xxx
  amount               NUMERIC(14,2) NOT NULL,
  currency             VARCHAR(10) DEFAULT 'usd',
  transfer_group       VARCHAR(200),                       -- e.g. invoice_123
  description          TEXT,
  status               VARCHAR(50) DEFAULT 'created',
  metadata             JSONB DEFAULT '{}'::jsonb,
  stripe_created_at    TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transfers_destination      ON stripe_transfers_log(destination_account);
CREATE INDEX IF NOT EXISTS idx_transfers_group            ON stripe_transfers_log(transfer_group);
