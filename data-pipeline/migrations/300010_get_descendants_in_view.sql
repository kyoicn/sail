-- ------------------------------------------------------------------------------
-- MIGRATION 300008: Get Descendants In View RPC
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS get_descendants_in_view(float, float, float, float, int, float, float, text, text);

-- Dedicated RPC for Focus Mode
CREATE OR REPLACE FUNCTION get_descendants_in_view(
    min_lng float,
    min_lat float,
    max_lng float,
    max_lat float,
    zoom_level int,
    min_year float,
    max_year float,
    p_dataset text,
    p_root_id text -- Mandatory for this RPC
)
RETURNS SETOF events
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE lineage AS (
        -- Base Case: The Root Node (p_root_id)
        SELECT source_id, child_source_ids
        FROM events
        WHERE source_id = p_root_id
        
        UNION ALL
        
        -- Recursive Step: Direct Children of lineage members
        SELECT e.source_id, e.child_source_ids
        FROM events e
        INNER JOIN lineage l ON e.source_id = ANY(l.child_source_ids)
    )
    SELECT *
    FROM events e
    WHERE 
        -- 1. Must be in the Lineage (Subtree)
        e.source_id IN (SELECT source_id FROM lineage)
        
        -- 2. Spatial Filter
        AND e.location && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
        
        -- 3. Temporal Filter
        AND (
            (e.start_astro_year <= max_year AND (e.end_astro_year IS NULL OR e.end_astro_year >= min_year))
        )
        
        -- 4. Dataset Filter (Optional, if you use columns for this)
        AND (e.collections IS NULL OR NOT (e.collections @> ARRAY['test_dataset']));
END;
$$;
