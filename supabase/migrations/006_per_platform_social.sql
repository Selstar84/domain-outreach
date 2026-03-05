-- Add per-platform tracking to social_queue_daily
ALTER TABLE social_queue_daily
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'all';

-- Drop old unique constraint (user_id, date) and create new one with platform
ALTER TABLE social_queue_daily DROP CONSTRAINT IF EXISTS social_queue_daily_user_id_date_key;
ALTER TABLE social_queue_daily ADD CONSTRAINT IF NOT EXISTS social_queue_daily_user_date_platform
  UNIQUE (user_id, date, platform);

-- Add warm-up config fields to settings
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS social_warmup_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS social_warmup_start_date DATE,
  ADD COLUMN IF NOT EXISTS social_warmup_start_count INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS social_warmup_increment INTEGER NOT NULL DEFAULT 2;
