-- ------------------------------------------------------------------------------
-- MIGRATION 251215: Semantic Context (Areas & Periods)
-- ------------------------------------------------------------------------------

-- 0. Cleanup (Safe for iterative dev)
DROP FUNCTION IF EXISTS get_active_periods(float, float, float, float, float);
DROP TABLE IF EXISTS period_areas CASCADE;
DROP TABLE IF EXISTS historical_periods CASCADE;
DROP TABLE IF EXISTS areas CASCADE;

-- 1. Areas Table
-- Stores reusable geographic definitions.
CREATE TABLE IF NOT EXISTS areas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id text UNIQUE NOT NULL,    -- Human-readable ID (e.g. 'china_proper')
    display_name text NOT NULL,      -- e.g. "China Proper"
    description text,
    geometry geography(POLYGON, 4326) NOT NULL -- EPSG:4326 (Lat/Lng)
);

-- 2. Historical Periods Table
-- Stores timeline definitions.
CREATE TABLE IF NOT EXISTS historical_periods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id text UNIQUE NOT NULL,  -- e.g. 'qing_dynasty' (Slug)
    display_name text NOT NULL,      -- e.g. "Qing Dynasty"
    description text,
    start_astro_year float8 NOT NULL,
    end_astro_year float8 NOT NULL,
    importance float4 DEFAULT 1.0
);

-- 3. Junction Table
-- Links Periods to Areas (M:N).
CREATE TABLE IF NOT EXISTS period_areas (
    period_id uuid REFERENCES historical_periods(id) ON DELETE CASCADE,
    area_id uuid REFERENCES areas(id) ON DELETE CASCADE,
    PRIMARY KEY (period_id, area_id)
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_areas_geometry ON areas USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_periods_time ON historical_periods (start_astro_year, end_astro_year);

-- 5. RPC Function (Context Query)
-- Returns historical context for a given viewport and time.
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
        -- Temporal Overlap
        hp.start_astro_year <= query_year
        AND hp.end_astro_year >= query_year
        AND (
            -- Spatial Intersection: Period Area intersects Viewport
            ST_Intersects(
                a.geometry::geometry, 
                ST_MakeEnvelope(view_min_lng, view_min_lat, view_max_lng, view_max_lat, 4326)
            )
        )
    ORDER BY hp.importance DESC
    LIMIT 5;
END;
$$;