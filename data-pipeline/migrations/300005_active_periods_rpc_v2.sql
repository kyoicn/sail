-- ------------------------------------------------------------------------------
-- MIGRATION 300005: Active Periods RPC v2 (Consolidated)
-- ------------------------------------------------------------------------------

-- Drop old function signature if it exists
DROP FUNCTION IF EXISTS get_active_periods(float, float, float, float, float);

CREATE OR REPLACE FUNCTION get_active_periods(
    view_min_lng float,
    view_min_lat float,
    view_max_lng float,
    view_max_lat float,
    query_min_year float,
    query_max_year float
)
RETURNS TABLE (
    period_name text,
    description text,
    importance float
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        hp.display_name::text,
        hp.description::text,
        hp.importance::float8
    FROM historical_periods hp
    JOIN period_areas pa ON hp.id = pa.period_id
    JOIN areas a ON pa.area_id = a.id
    WHERE
        -- Temporal Overlap: Start <= QueryMax AND End >= QueryMin
        hp.start_astro_year <= query_max_year
        AND hp.end_astro_year >= query_min_year
        AND (
            -- Spatial Intersection
            ST_Intersects(
                a.geometry::geometry, 
                ST_MakeEnvelope(view_min_lng, view_min_lat, view_max_lng, view_max_lat, 4326)
            )
        )
    ORDER BY hp.importance::float8 DESC
    LIMIT 5;
END;
$$;
