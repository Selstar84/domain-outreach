-- ============================================================
-- Integration settings for prospect discovery + social sending
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE settings
  -- Prospect discovery
  ADD COLUMN IF NOT EXISTS prospect_finder_tool TEXT CHECK (prospect_finder_tool IN ('apollo', 'snov', 'hunter', 'dropcontact')),
  ADD COLUMN IF NOT EXISTS apollo_api_key TEXT,
  ADD COLUMN IF NOT EXISTS snov_api_key TEXT,
  ADD COLUMN IF NOT EXISTS dropcontact_api_key TEXT,

  -- LinkedIn automation
  ADD COLUMN IF NOT EXISTS linkedin_tool TEXT CHECK (linkedin_tool IN ('phantombuster', 'lemlist')),
  ADD COLUMN IF NOT EXISTS phantombuster_api_key TEXT,
  ADD COLUMN IF NOT EXISTS phantombuster_linkedin_agent_id TEXT,
  ADD COLUMN IF NOT EXISTS lemlist_api_key TEXT,

  -- WhatsApp
  ADD COLUMN IF NOT EXISTS whatsapp_tool TEXT CHECK (whatsapp_tool IN ('twilio')),
  ADD COLUMN IF NOT EXISTS twilio_account_sid TEXT,
  ADD COLUMN IF NOT EXISTS twilio_auth_token TEXT,
  ADD COLUMN IF NOT EXISTS twilio_whatsapp_number TEXT,

  -- Instagram & Facebook (Apify)
  ADD COLUMN IF NOT EXISTS apify_api_key TEXT,
  ADD COLUMN IF NOT EXISTS instagram_session_cookie TEXT,
  ADD COLUMN IF NOT EXISTS facebook_session_cookie TEXT;

-- Domain analysis result (stored on campaign)
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS domain_analysis JSONB,
  ADD COLUMN IF NOT EXISTS domain_analyzed_at TIMESTAMPTZ;
