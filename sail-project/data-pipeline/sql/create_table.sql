-- DDL: Recreate Events Table (Perfect Schema)
-- Run this in Supabase SQL Editor

-- 1. Clean Slate (Drop everything)
DROP TABLE IF EXISTS events CASCADE;
DROP TYPE IF EXISTS granularity_type CASCADE;
DROP TYPE IF EXISTS certainty_type CASCADE;

-- 2. Create Enums
CREATE TYPE granularity_type AS ENUM ('spot', 'area');
CREATE TYPE certainty_type AS ENUM ('definite', 'approximate');

-- 3. Create Table
CREATE TABLE events (
    -- Identity & Metadata
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    source_id text NOT NULL,
    title text NOT NULL,
    summary text NOT NULL DEFAULT '',
    image_urls text[] DEFAULT '{}',
    links jsonb DEFAULT '[]',

    -- Time System (Hybrid: Float Index + JSONB Details)
    start_astro_year float8 NOT NULL,
    end_astro_year float8,
    
    -- JSONB for Calendar Components (month, day, hour, minute, second, millisecond, precision)
    start_time_entry jsonb DEFAULT '{}'::jsonb,
    end_time_entry jsonb,

    -- Spatial System (PostGIS + Flattened Metadata)
    location geography(POINT, 4326),
    place_name text, -- Nullable (e.g. ocean spots)
    granularity granularity_type NOT NULL DEFAULT 'spot',
    certainty certainty_type NOT NULL DEFAULT 'definite',
    geo_shape_id text,

    -- Filtering & Logic
    importance float4 NOT NULL CHECK (importance BETWEEN 0 AND 10),
    
    -- Generated Columns for API convenience (Read-Only)
    lat float8 GENERATED ALWAYS AS (ST_Y(location::geometry)) STORED,
    lng float8 GENERATED ALWAYS AS (ST_X(location::geometry)) STORED,

    CONSTRAINT events_pkey PRIMARY KEY (id),
    CONSTRAINT events_source_id_key UNIQUE (source_id)
);

-- 4. Create Indexes
-- Spatial Index for Viewport queries
CREATE INDEX events_location_idx ON events USING GIST (location);

-- Temporal Index for Timeline queries
CREATE INDEX events_start_astro_year_idx ON events USING BTREE (start_astro_year);

-- Importance Index for Level-of-Detail filtering
CREATE INDEX events_importance_idx ON events USING BTREE (importance);

-- Comments
COMMENT ON COLUMN events.start_astro_year IS 'Astronomical year (float) for sorting/indexing. 1 BC = 0.0, 2 BC = -1.0';
COMMENT ON COLUMN events.start_time_entry IS 'JSONB containing {month, day, hour, minute, second, millisecond, precision}';
