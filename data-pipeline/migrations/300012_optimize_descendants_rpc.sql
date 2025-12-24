-- ------------------------------------------------------------------------------
-- MIGRATION 300012: Optimize Descendants RPC
-- ------------------------------------------------------------------------------

-- Update RPC to use the indexed parent_source_id for significantly faster recursion.
-- Also removes hardcoded 'test_dataset' filter.

CREATE OR REPLACE FUNCTION get_descendants_in_view(
    min_lng float,
    min_lat float,
    max_lng float,
    max_lat float,
    zoom_level int,
    min_year float,
    max_year float,
    p_dataset text,
    p_root_id text
)
RETURNS SETOF events
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE lineage AS (
        -- Base Case: The Root Node (p_root_id)
        SELECT source_id
        FROM events
        WHERE source_id = p_root_id
        
        UNION ALL
        
        -- Recursive Step: Efficient subtree traversal via parent_source_id
        SELECT e.source_id
        FROM events e
        INNER JOIN lineage l ON e.parent_source_id = l.source_id
    )
    SELECT *
    FROM events e
    WHERE 
        -- 1. Must be in the Lineage (Subtree)
        e.source_id IN (SELECT source_id FROM lineage)
        
        -- 2. Spatial Filter
        AND (
            (min_lng IS NULL OR e.location && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326))
        )
        
        -- 3. Temporal Filter
        AND (
            (e.start_astro_year <= max_year AND (e.end_astro_year IS NULL OR e.end_astro_year >= min_year))
        )
        
        -- 4. Dataset Filter (Handled via p_dataset if needed, but standardizing to return subtree)
        -- We'll allow the subtree to be returned without tag-based exclusion for now unless requested.
    ORDER BY e.importance DESC;
END;
$$;
