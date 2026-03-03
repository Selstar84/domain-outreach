-- Add Brevo API key column to email_accounts
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS brevo_api_key TEXT;

-- Update the provider CHECK constraint to include 'brevo'
ALTER TABLE email_accounts DROP CONSTRAINT IF EXISTS email_accounts_provider_check;
ALTER TABLE email_accounts ADD CONSTRAINT email_accounts_provider_check
  CHECK (provider IN ('resend', 'brevo', 'smtp'));
