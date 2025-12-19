-- ------------------------------------------------------------------------------
-- MIGRATION 001: Initial Schema (Baseline)
-- ------------------------------------------------------------------------------

-- 1. Create Enums
DO $$ BEGIN
    CREATE TYPE granularity_type AS ENUM ('spot', 'area');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE certainty_type AS ENUM ('definite', 'approximate');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Table
CREATE TABLE IF NOT EXISTS events (
    -- Identity & Metadata
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    source_id text NOT NULL,
    title text NOT NULL,
    summary text NOT NULL DEFAULT '',
    image_urls text[] DEFAULT '{}',
    links jsonb DEFAULT '[]',
    -- collections text[] DEFAULT '{}', -- REMOVED for baseline

    -- Time System (Hybrid: Float Index + JSONB Details)
    start_astro_year float8 NOT NULL,
    end_astro_year float8,
    
    -- JSONB for Calendar Components
    start_time_entry jsonb DEFAULT '{}'::jsonb,
    end_time_entry jsonb,

    -- Spatial System
    location geography(POINT, 4326),
    place_name text,
    granularity granularity_type NOT NULL DEFAULT 'spot',
    certainty certainty_type NOT NULL DEFAULT 'definite',
    geo_shape_id text,

    -- Filtering & Logic
    importance float4 NOT NULL CHECK (importance BETWEEN 0 AND 10),
    
    -- Generated Columns
    lat float8 GENERATED ALWAYS AS (ST_Y(location::geometry)) STORED,
    lng float8 GENERATED ALWAYS AS (ST_X(location::geometry)) STORED,

    CONSTRAINT events_pkey PRIMARY KEY (id),
    CONSTRAINT events_source_id_key UNIQUE (source_id)
);

-- 3. Create Indexes
CREATE INDEX IF NOT EXISTS events_location_idx ON events USING GIST (location);
CREATE INDEX IF NOT EXISTS events_start_astro_year_idx ON events USING BTREE (start_astro_year);
CREATE INDEX IF NOT EXISTS events_importance_idx ON events USING BTREE (importance);

-- 4. RPC: Get Events in View (Original Version)
DROP FUNCTION IF EXISTS get_events_in_view(float, float, float, float, float, float, float);
CREATE OR REPLACE FUNCTION get_events_in_view(
    min_lat float,
    max_lat float,
    min_lng float,
    max_lng float,
    min_year float,
    max_year float,
    min_importance float
)
RETURNS SETOF events
LANGUAGE plpgsql
AS $$
BEGIN
    IF min_lng IS NULL OR (min_lng <= max_lng) THEN
        RETURN QUERY
        SELECT *
        FROM events
        WHERE 
            start_astro_year >= min_year 
            AND start_astro_year <= max_year
            AND importance >= min_importance
            AND (
                min_lat IS NULL 
                OR (
                    location && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
                )
            );
    ELSE
        RETURN QUERY
        SELECT *
        FROM events
        WHERE 
            start_astro_year >= min_year 
            AND start_astro_year <= max_year
            AND importance >= min_importance
            AND (
                location && ST_MakeEnvelope(min_lng, min_lat, 180, max_lat, 4326)
                OR
                location && ST_MakeEnvelope(-180, min_lat, max_lng, max_lat, 4326)
            );
    END IF;
END;
$$;
