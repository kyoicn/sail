-- ------------------------------------------------------------------------------
-- MIGRATION 251216: Upgrade Areas to MultiPolygon
-- ------------------------------------------------------------------------------

-- Update areas table to use MULTIPOLYGON
-- This allows storing complex shapes like Japan (archipelago) or countries with exclamas.
ALTER TABLE areas 
    ALTER COLUMN geometry TYPE geography(MULTIPOLYGON, 4326) 
    USING ST_Multi(geometry::geometry)::geography;

-- Note: ST_Multi ensures that any existing single POLYGONs are converted to MULTIPOLYGONs containing one polygon.
