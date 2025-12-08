-- DDL: Recreate Dev Events Table (events_dev)
-- Identical structure to 'events' table for development/staging.

-- 1. Clean Slate
DROP TABLE IF EXISTS events_dev CASCADE;
-- Note: We generally reuse the Enums from the main schema (granularity_type, certainty_type).
-- If you need isolated enums, you would rename them, but shared types are usually fine for dev/prod separation in same DB.

-- 2. Create Table
CREATE TABLE events_dev (
    -- Identity & Metadata
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    source_id text NOT NULL,
    title text NOT NULL,
    summary text NOT NULL DEFAULT '',
    image_urls text[] DEFAULT '{}',
    links jsonb DEFAULT '[]',

    -- Time System
    start_astro_year float8 NOT NULL,
    end_astro_year float8,
    start_time_entry jsonb DEFAULT '{}'::jsonb,
    end_time_entry jsonb,

    -- Spatial System
    location geography(POINT, 4326),
    place_name text,
    granularity granularity_type NOT NULL DEFAULT 'spot', -- Uses shared Enum
    certainty certainty_type NOT NULL DEFAULT 'definite', -- Uses shared Enum
    geo_shape_id text,

    -- Filtering
    importance float4 NOT NULL CHECK (importance BETWEEN 0 AND 10),
    
    -- Generated Columns
    lat float8 GENERATED ALWAYS AS (ST_Y(location::geometry)) STORED,
    lng float8 GENERATED ALWAYS AS (ST_X(location::geometry)) STORED,

    CONSTRAINT events_dev_pkey PRIMARY KEY (id),
    CONSTRAINT events_dev_source_id_key UNIQUE (source_id)
);

-- 3. Create Indexes
CREATE INDEX events_dev_location_idx ON events_dev USING GIST (location);
CREATE INDEX events_dev_start_astro_year_idx ON events_dev USING BTREE (start_astro_year);
CREATE INDEX events_dev_importance_idx ON events_dev USING BTREE (importance);

COMMENT ON TABLE events_dev IS 'Development copy of events table';

-- SECURITY: Enable Row Level Security (RLS)
-- Run this to lock down your tables so only "Public Read" is allowed via API.
-- Write operations will require the Service Role key (or authenticated users with specific policies, if you add them later).

-- 1. Enable RLS
ALTER TABLE events_dev ENABLE ROW LEVEL SECURITY;

-- 2. Add Policy: Public Read Access
-- "anon" and "authenticated" roles (i.e., everyone) can SELECT all rows.
CREATE POLICY "Enable read access for all users" 
ON events_dev FOR SELECT 
TO public 
USING (true);

-- Note: No INSERT/UPDATE/DELETE policies are created for 'public'.
-- This means writes are BLOCKED for anonymous users by default (Safe).
-- Your Service Role Key (used in data-pipeline) bypasses RLS, so imports still work.
