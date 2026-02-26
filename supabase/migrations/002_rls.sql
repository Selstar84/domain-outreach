-- Row Level Security Policies
-- Run after 001_schema.sql

ALTER TABLE owned_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_send_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_queue_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- owned_domains
CREATE POLICY "owned_domains_user" ON owned_domains
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- email_accounts
CREATE POLICY "email_accounts_user" ON email_accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- campaigns
CREATE POLICY "campaigns_user" ON campaigns
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- prospects
CREATE POLICY "prospects_user" ON prospects
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- outreach_messages
CREATE POLICY "outreach_messages_user" ON outreach_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- email_send_queue
CREATE POLICY "email_send_queue_user" ON email_send_queue
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- follow_up_sequences (access via campaign ownership)
CREATE POLICY "follow_up_sequences_user" ON follow_up_sequences
  FOR ALL USING (
    campaign_id IN (SELECT id FROM campaigns WHERE user_id = auth.uid())
  );

-- discovery_jobs
CREATE POLICY "discovery_jobs_user" ON discovery_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- social_queue_daily
CREATE POLICY "social_queue_daily_user" ON social_queue_daily
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- settings
CREATE POLICY "settings_user" ON settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Service role bypasses RLS (used by cron jobs)
-- This is automatic in Supabase when using the service_role key
