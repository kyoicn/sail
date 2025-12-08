-- RPC: Get Events in View (DEV Version)
-- Queries 'events_dev' table.

CREATE OR REPLACE FUNCTION get_events_in_view_dev(
    min_lat float,
    max_lat float,
    min_lng float,
    max_lng float,
    min_year float,
    max_year float,
    min_importance float
)
RETURNS SETOF events_dev -- Returns rows from events_dev
LANGUAGE plpgsql
AS $$
BEGIN
    -- Case 1: Standard Viewport or Global
    IF min_lng IS NULL OR (min_lng <= max_lng) THEN
        RETURN QUERY
        SELECT *
        FROM events_dev
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

    -- Case 2: Crossing the Antimeridian
    ELSE
        RETURN QUERY
        SELECT *
        FROM events_dev
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
