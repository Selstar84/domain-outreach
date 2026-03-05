-- Add separate first_name and last_name columns to prospects
-- Previously only owner_name (combined) was stored from Hunter.io
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;
