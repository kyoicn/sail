-- ------------------------------------------------------------------------------
-- MIGRATION 300000: Rename geo_shape_id to area_id & Refresh RPC
-- ------------------------------------------------------------------------------

-- 1. Rename geo_shape_id to area_id
-- We consolidate the concept of "geometric shape reference" to "area_id".
-- This column references the `areas` table (loose coupling via slug).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='geo_shape_id') THEN
        ALTER TABLE events RENAME COLUMN geo_shape_id TO area_id;
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='area_id') THEN
        ALTER TABLE events ADD COLUMN area_id text;
    END IF;
END $$;


-- 2. Refresh get_events_in_view RPC
-- Re-creating the function ensures it picks up the renamed column schema.

DROP FUNCTION IF EXISTS get_events_in_view(float, float, float, float, float, float, float);
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

-- 3. Area Fetch Helper (Refined)
-- Fetch area geometries by their IDs (slugs) efficiently.
-- Explicitly converts geometry to GeoJSON to ensuring frontend compatibility.
DROP FUNCTION IF EXISTS get_areas_by_ids(text[]);
CREATE OR REPLACE FUNCTION get_areas_by_ids(area_ids_input text[])
RETURNS TABLE (
    area_id text,
    display_name text,
    description text,
    geometry jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.area_id,
        a.display_name,
        a.description,
        ST_AsGeoJSON(a.geometry)::jsonb as geometry
    FROM areas a
    WHERE a.area_id = ANY(area_ids_input);
END;
$$;
