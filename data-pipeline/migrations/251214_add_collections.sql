-- ------------------------------------------------------------------------------
-- MIGRATION 251214: Add Collections Feature
-- ------------------------------------------------------------------------------

-- 1. Add Column
ALTER TABLE events ADD COLUMN IF NOT EXISTS collections text[] DEFAULT '{}';

-- 2. Add Index
CREATE INDEX IF NOT EXISTS events_collections_idx ON events USING GIN (collections);

-- 3. Update RPC
-- Drop old signature to clean up
DROP FUNCTION IF EXISTS get_events_in_view(float, float, float, float, float, float, float);

-- Create new signature accepting collection_filter
DROP FUNCTION IF EXISTS get_events_in_view(float, float, float, float, float, float, float, text);
CREATE OR REPLACE FUNCTION get_events_in_view(
    min_lat float,
    max_lat float,
    min_lng float,
    max_lng float,
    min_year float,
    max_year float,
    min_importance float,
    collection_filter text DEFAULT NULL
)
RETURNS SETOF events
LANGUAGE plpgsql
AS $$
BEGIN
    -- Case 1: Standard Viewport
    IF min_lng IS NULL OR (min_lng <= max_lng) THEN
        RETURN QUERY
        SELECT *
        FROM events
        WHERE 
            start_astro_year >= min_year 
            AND start_astro_year <= max_year
            AND importance >= min_importance
            AND (collection_filter IS NULL OR collections @> ARRAY[collection_filter])
            AND (
                min_lat IS NULL 
                OR (
                    location && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
                )
            );

    -- Case 2: Crossing Antimeridian
    ELSE
        RETURN QUERY
        SELECT *
        FROM events
        WHERE 
            start_astro_year >= min_year 
            AND start_astro_year <= max_year
            AND importance >= min_importance
            AND (collection_filter IS NULL OR collections @> ARRAY[collection_filter])
            AND (
                location && ST_MakeEnvelope(min_lng, min_lat, 180, max_lat, 4326)
                OR
                location && ST_MakeEnvelope(-180, min_lat, max_lng, max_lat, 4326)
            );
    END IF;
END;
$$;

-- 4. New RPC: Get All Collections
DROP FUNCTION IF EXISTS get_all_collections();
CREATE OR REPLACE FUNCTION get_all_collections()
RETURNS TABLE (collection text)
LANGUAGE sql
AS $$
    SELECT DISTINCT unnest(collections) as collection
    FROM events
    ORDER BY collection ASC;
$$;
