-- Migration: 300007_grant_schema_usage.sql
-- Description: Grants permissions to Supabase roles dynamically for the CURRENT schema.

DO $$
DECLARE
    target_schema text := current_schema();
BEGIN
    -- 1. Grant USAGE on the schema
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon, authenticated, service_role', target_schema);

    -- 2. Grant Tables
    EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO anon, authenticated, service_role', target_schema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON TABLES TO anon, authenticated, service_role', target_schema);

    -- 3. Grant Sequences
    EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA %I TO anon, authenticated, service_role', target_schema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON SEQUENCES TO anon, authenticated, service_role', target_schema);

    -- 4. Grant Functions
    EXECUTE format('GRANT ALL ON ALL ROUTINES IN SCHEMA %I TO anon, authenticated, service_role', target_schema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON ROUTINES TO anon, authenticated, service_role', target_schema);
    
    RAISE NOTICE 'Granted permissions on schema %', target_schema;
END
$$;
