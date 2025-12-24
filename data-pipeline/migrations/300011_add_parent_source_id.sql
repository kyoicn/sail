-- ------------------------------------------------------------------------------
-- MIGRATION 300011: Add Parent Source ID to Events
-- ------------------------------------------------------------------------------

-- 1. Add parent_source_id column
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS parent_source_id text;

-- 2. Add Index for efficient parent lookups
CREATE INDEX IF NOT EXISTS events_parent_source_id_idx ON events (parent_source_id);
