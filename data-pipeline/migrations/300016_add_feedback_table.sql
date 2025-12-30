-- Migration: 300016_add_feedback_table
-- Description: Creates the feedback table to store user suggestions and issues.
-- NOTE: This migration is schema-agnostic. It depends on the runner setting the search_path.

CREATE TABLE IF NOT EXISTS feedback (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    message text NOT NULL,
    email text,
    status text NOT NULL DEFAULT 'new', -- 'new', 'read', 'archived'
    context jsonb NOT NULL DEFAULT '{}'::jsonb, -- Stores IP, UserAgent, URL, OS, Browser, etc.
    created_at timestamptz NOT NULL DEFAULT now(),
    
    CONSTRAINT feedback_pkey PRIMARY KEY (id)
);

-- Index for sorting and filtering
CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_status_idx ON feedback (status);

-- Enable RLS
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything
CREATE POLICY "Service role can do all on feedback"
    ON feedback
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy: Anon can insert (for public feedback form)
CREATE POLICY "Anon can insert feedback"
    ON feedback
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Grants
GRANT ALL ON TABLE feedback TO service_role;
GRANT INSERT ON TABLE feedback TO anon;
GRANT INSERT ON TABLE feedback TO authenticated;
