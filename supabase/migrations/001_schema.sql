-- Domain Outreach App — Full Schema
-- Run this in Supabase SQL Editor

-- ============================================================
-- OWNED DOMAINS
-- ============================================================
CREATE TABLE IF NOT EXISTS owned_domains (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain        TEXT NOT NULL,
  word          TEXT NOT NULL,
  asking_price  NUMERIC(10,2),
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','sold','paused')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, domain)
);

-- ============================================================
-- EMAIL ACCOUNTS
-- ============================================================
CREATE TABLE IF NOT EXISTS email_accounts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider                TEXT NOT NULL CHECK (provider IN ('resend','smtp')),
  email_address           TEXT NOT NULL,
  display_name            TEXT NOT NULL DEFAULT '',
  resend_api_key          TEXT,
  resend_domain           TEXT,
  smtp_host               TEXT,
  smtp_port               INTEGER DEFAULT 587,
  smtp_user               TEXT,
  smtp_password_encrypted TEXT,
  smtp_secure             BOOLEAN DEFAULT false,
  daily_limit             INTEGER NOT NULL DEFAULT 50,
  hourly_limit            INTEGER NOT NULL DEFAULT 10,
  min_delay_seconds       INTEGER NOT NULL DEFAULT 120,
  sent_today              INTEGER NOT NULL DEFAULT 0,
  sent_this_hour          INTEGER NOT NULL DEFAULT 0,
  last_sent_at            TIMESTAMPTZ,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  is_verified             BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CAMPAIGNS
-- ============================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owned_domain_id             UUID NOT NULL REFERENCES owned_domains(id) ON DELETE CASCADE,
  name                        TEXT NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','paused','completed')),
  asking_price                NUMERIC(10,2),
  discovery_status            TEXT NOT NULL DEFAULT 'pending'
                              CHECK (discovery_status IN ('pending','running','completed','failed')),
  discovery_started_at        TIMESTAMPTZ,
  discovery_completed_at      TIMESTAMPTZ,
  total_prospects             INTEGER NOT NULL DEFAULT 0,
  preferred_email_account_id  UUID REFERENCES email_accounts(id) ON DELETE SET NULL,
  email_subject_template      TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PROSPECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS prospects (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain                TEXT NOT NULL,
  tld                   TEXT NOT NULL,
  domain_type           TEXT NOT NULL
                        CHECK (domain_type IN ('same_word_diff_tld','contains_word','other')),
  website_active        BOOLEAN,
  http_status           INTEGER,
  company_name          TEXT,
  owner_name            TEXT,
  email                 TEXT,
  email_source          TEXT CHECK (email_source IN ('scraped','hunter','whois','manual')),
  email_confidence      INTEGER,
  phone                 TEXT,
  linkedin_url          TEXT,
  facebook_url          TEXT,
  instagram_url         TEXT,
  twitter_url           TEXT,
  whatsapp_number       TEXT,
  website_description   TEXT,
  scrape_status         TEXT NOT NULL DEFAULT 'pending'
                        CHECK (scrape_status IN ('pending','running','completed','failed','skipped')),
  scrape_attempted_at   TIMESTAMPTZ,
  scrape_completed_at   TIMESTAMPTZ,
  scrape_error          TEXT,
  status                TEXT NOT NULL DEFAULT 'to_contact'
                        CHECK (status IN ('to_contact','contacted','replied','negotiating','sold','dead','skipped')),
  priority              INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_prospects_campaign_status ON prospects(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_prospects_scrape_status ON prospects(scrape_status);
CREATE INDEX IF NOT EXISTS idx_prospects_campaign_id ON prospects(campaign_id);

-- ============================================================
-- OUTREACH MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS outreach_messages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id           UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  campaign_id           UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel               TEXT NOT NULL
                        CHECK (channel IN ('email','linkedin','facebook','instagram','whatsapp','twitter','other')),
  sequence_step         INTEGER NOT NULL DEFAULT 1,
  subject               TEXT,
  body                  TEXT NOT NULL,
  ai_generated          BOOLEAN NOT NULL DEFAULT true,
  ai_variant            INTEGER DEFAULT 1,
  email_account_id      UUID REFERENCES email_accounts(id) ON DELETE SET NULL,
  resend_email_id       TEXT,
  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','queued','scheduled','sending','sent','opened','clicked','replied','bounced','failed')),
  scheduled_for         TIMESTAMPTZ,
  sent_at               TIMESTAMPTZ,
  opened_at             TIMESTAMPTZ,
  clicked_at            TIMESTAMPTZ,
  replied_at            TIMESTAMPTZ,
  bounced_at            TIMESTAMPTZ,
  sent_by_user          BOOLEAN NOT NULL DEFAULT false,
  social_platform_used  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_prospect ON outreach_messages(prospect_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON outreach_messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_scheduled ON outreach_messages(scheduled_for) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_messages_campaign ON outreach_messages(campaign_id);

-- ============================================================
-- EMAIL SEND QUEUE
-- ============================================================
CREATE TABLE IF NOT EXISTS email_send_queue (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outreach_message_id   UUID NOT NULL REFERENCES outreach_messages(id) ON DELETE CASCADE,
  email_account_id      UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  priority              INTEGER NOT NULL DEFAULT 5,
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','processing','sent','failed')),
  scheduled_for         TIMESTAMPTZ NOT NULL,
  attempts              INTEGER NOT NULL DEFAULT 0,
  last_error            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_queue_status_scheduled ON email_send_queue(status, scheduled_for) WHERE status = 'pending';

-- ============================================================
-- FOLLOW-UP SEQUENCES
-- ============================================================
CREATE TABLE IF NOT EXISTS follow_up_sequences (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  step_number      INTEGER NOT NULL,
  delay_days       INTEGER NOT NULL DEFAULT 4,
  channel          TEXT NOT NULL CHECK (channel IN ('email','linkedin','facebook','instagram','whatsapp','twitter')),
  subject_template TEXT,
  body_template    TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, step_number)
);

-- ============================================================
-- DISCOVERY JOBS
-- ============================================================
CREATE TABLE IF NOT EXISTS discovery_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','running','completed','failed')),
  total_variants INTEGER NOT NULL DEFAULT 0,
  checked_count  INTEGER NOT NULL DEFAULT 0,
  active_count   INTEGER NOT NULL DEFAULT 0,
  error_message  TEXT,
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SOCIAL QUEUE DAILY
-- ============================================================
CREATE TABLE IF NOT EXISTS social_queue_daily (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  sent_count  INTEGER NOT NULL DEFAULT 0,
  daily_limit INTEGER NOT NULL DEFAULT 15,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

-- ============================================================
-- SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  whoisxml_api_key         TEXT,
  hunter_api_key           TEXT,
  anthropic_api_key        TEXT,
  social_daily_limit       INTEGER NOT NULL DEFAULT 15,
  email_daily_limit_global INTEGER NOT NULL DEFAULT 500,
  check_timeout_ms         INTEGER NOT NULL DEFAULT 5000,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_owned_domains_updated_at
  BEFORE UPDATE ON owned_domains
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_prospects_updated_at
  BEFORE UPDATE ON prospects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_outreach_messages_updated_at
  BEFORE UPDATE ON outreach_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_email_accounts_updated_at
  BEFORE UPDATE ON email_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
