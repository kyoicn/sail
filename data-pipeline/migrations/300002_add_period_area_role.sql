-- ------------------------------------------------------------------------------
-- MIGRATION 300002: Add Role to Period Areas
-- ------------------------------------------------------------------------------

-- 1. Add role column to junction table
-- We default to 'primary' to maintain semantics of existing data until re-populated.
ALTER TABLE period_areas 
ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'associated'));

-- 2. Update RPC to prefer primary areas? 
CREATE OR REPLACE FUNCTION get_active_periods(
    view_min_lng float,
    view_min_lat float,
    view_max_lng float,
    view_max_lat float,
    query_year float
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
        hp.display_name,
        hp.description,
        hp.importance
    FROM historical_periods hp
    JOIN period_areas pa ON hp.id = pa.period_id
    JOIN areas a ON pa.area_id = a.id
    WHERE
        pa.role = 'primary'
        AND hp.start_astro_year <= query_year
        AND hp.end_astro_year >= query_year
        AND (
            ST_Intersects(
                a.geometry::geometry, 
                ST_MakeEnvelope(view_min_lng, view_min_lat, view_max_lng, view_max_lat, 4326)
            )
        )
    LIMIT 1;
END;
$$;
