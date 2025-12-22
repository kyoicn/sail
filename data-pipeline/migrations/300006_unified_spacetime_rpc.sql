-- ------------------------------------------------------------------------------
-- MIGRATION 300006: Unified Space-Time RPC
-- ------------------------------------------------------------------------------

-------------------------------------------------------------------------------
-- 1. Update RPC: get_events_in_view
-------------------------------------------------------------------------------
-- Add explicit ordering by importance and a configurable limit.
-- This ensures that when we fetch a slice of time/space, we get the most "defining"
-- events first, rather than random ones.

DROP FUNCTION IF EXISTS get_events_in_view(float, float, float, float, float, float, float, text);

CREATE OR REPLACE FUNCTION get_events_in_view(
    min_lat float,
    max_lat float,
    min_lng float,
    max_lng float,
    min_year float,
    max_year float,
    min_importance float,
    collection_filter text DEFAULT NULL,
    p_limit int DEFAULT 1000  -- [NEW] Configurable Limit
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
            )
        ORDER BY importance DESC  -- [NEW] Reliability Sorting
        LIMIT p_limit;            -- [NEW] Explicit Budget

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
            )
        ORDER BY importance DESC -- [NEW]
        LIMIT p_limit;           -- [NEW]
    END IF;
END;
$$;
