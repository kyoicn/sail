-- ------------------------------------------------------------------------------
-- MIGRATION 300003: Update RPC to return UUID (id)
-- ------------------------------------------------------------------------------

-- Update get_areas_by_ids to include 'id' (uuid)
DROP FUNCTION IF EXISTS get_areas_by_ids(text[]);

CREATE OR REPLACE FUNCTION get_areas_by_ids(area_ids_input text[])
RETURNS TABLE (
    id uuid,
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
        a.id,
        a.area_id,
        a.display_name,
        a.description,
        ST_AsGeoJSON(a.geometry)::jsonb as geometry
    FROM areas a
    WHERE a.area_id = ANY(area_ids_input);
END;
$$;
