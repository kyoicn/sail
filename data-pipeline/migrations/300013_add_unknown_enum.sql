-- ------------------------------------------------------------------------------
-- MIGRATION 300013: Add 'unknown' to Enums
-- ------------------------------------------------------------------------------

-- 1. Dev Schema
ALTER TYPE dev.certainty_type ADD VALUE IF NOT EXISTS 'unknown';
ALTER TYPE dev.granularity_type ADD VALUE IF NOT EXISTS 'unknown';

-- 2. Staging Schema
ALTER TYPE staging.certainty_type ADD VALUE IF NOT EXISTS 'unknown';
ALTER TYPE staging.granularity_type ADD VALUE IF NOT EXISTS 'unknown';

-- 3. Prod Schema
ALTER TYPE prod.certainty_type ADD VALUE IF NOT EXISTS 'unknown';
ALTER TYPE prod.granularity_type ADD VALUE IF NOT EXISTS 'unknown';

-- 4. Public Schema (Backup/Reference)
ALTER TYPE public.certainty_type ADD VALUE IF NOT EXISTS 'unknown';
ALTER TYPE public.granularity_type ADD VALUE IF NOT EXISTS 'unknown';
