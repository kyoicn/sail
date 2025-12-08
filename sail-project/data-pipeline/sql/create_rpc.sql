-- RPC: Get Events in View
-- Run this in Supabase SQL Editor AFTER creating the table.

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
    -- Case 1: Standard Viewport (Normal bounds) or Global View (Nulls)
    IF min_lng IS NULL OR (min_lng <= max_lng) THEN
        RETURN QUERY
        SELECT *
        FROM events
        WHERE 
            -- Temporal Filter
            start_astro_year >= min_year 
            AND start_astro_year <= max_year
            
            -- Importance Filter (LOD)
            AND importance >= min_importance
            
            -- Spatial Filter (Standard Box)
            -- Only apply if coords are provided (not global view)
            AND (
                min_lat IS NULL 
                OR (
                    location && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
                )
            );

    -- Case 2: Crossing the Antimeridian (e.g. West=170, East=-170)
    -- We need to check TWO boxes: [170 to 180] AND [-180 to -170]
    ELSE
        RETURN QUERY
        SELECT *
        FROM events
        WHERE 
            start_astro_year >= min_year 
            AND start_astro_year <= max_year
            AND importance >= min_importance
            AND (
                -- Box 1: Left of Date Line (Positive Lngs)
                location && ST_MakeEnvelope(min_lng, min_lat, 180, max_lat, 4326)
                OR
                -- Box 2: Right of Date Line (Negative Lngs)
                location && ST_MakeEnvelope(-180, min_lat, max_lng, max_lat, 4326)
            );
    END IF;
END;
$$;
