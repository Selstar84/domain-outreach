-- ============================================================
-- Atom.com integration
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS atom_api_key TEXT,
  ADD COLUMN IF NOT EXISTS atom_appraisal_api_key TEXT;

-- Store Atom analytics + grading on owned_domains
ALTER TABLE owned_domains
  ADD COLUMN IF NOT EXISTS atom_listing_id TEXT,
  ADD COLUMN IF NOT EXISTS atom_views INTEGER,
  ADD COLUMN IF NOT EXISTS atom_grade TEXT,
  ADD COLUMN IF NOT EXISTS atom_grade_score INTEGER,
  ADD COLUMN IF NOT EXISTS atom_synced_at TIMESTAMPTZ;

-- Store Atom appraisal result on campaigns
-- (domain_appraisal JSONB already exists from previous migration)
