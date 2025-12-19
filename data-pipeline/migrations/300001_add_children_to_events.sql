-- ------------------------------------------------------------------------------
-- MIGRATION 300001: Add Container Events (Children)
-- ------------------------------------------------------------------------------

-- 1. Add child_source_ids column
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS child_source_ids text[] DEFAULT '{}';

-- 2. Add GIN Index for efficient child/parent lookups
-- This allows:
-- Find children: SELECT * FROM events WHERE source_id = ANY(ARRAY['...']) (standard PK lookup)
-- Find parent:   SELECT * FROM events WHERE child_source_ids @> ARRAY['child_id'] (GIN lookup)
CREATE INDEX IF NOT EXISTS events_child_source_ids_idx ON events USING GIN (child_source_ids);
