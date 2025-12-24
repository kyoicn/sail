-- ------------------------------------------------------------------------------
-- MIGRATION 300007: Get Events By IDs RPC
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS get_events_by_ids(text[], int);
DROP FUNCTION IF EXISTS get_events_by_ids(text[]);

CREATE OR REPLACE FUNCTION get_events_by_ids(
    p_source_ids text[]
)
RETURNS SETOF events
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM events
    WHERE source_id = ANY(p_source_ids);
END;
$$;
