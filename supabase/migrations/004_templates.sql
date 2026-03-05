-- Message Templates
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS message_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  channel     TEXT NOT NULL DEFAULT 'all'
              CHECK (channel IN ('email','linkedin','facebook','instagram','whatsapp','twitter','all')),
  subject     TEXT,   -- for email templates
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_templates_user ON message_templates(user_id);

CREATE TRIGGER trg_templates_updated_at
  BEFORE UPDATE ON message_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own templates"
  ON message_templates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Available template variables (documentation only, substituted client-side):
-- {{domaine_vente}}     → domain being sold (e.g. mykarate.com)
-- {{domaine_prospect}}  → prospect's domain (e.g. mykarateclub.co.uk)
-- {{entreprise}}        → company name
-- {{prix}}              → asking price
-- {{tld}}               → prospect's TLD (.fr, .co.uk...)
