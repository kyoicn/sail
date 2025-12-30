-- Migration: 300014_add_feedback_table
-- Description: Creates the feedback table to store user suggestions and issues.

CREATE TABLE IF NOT EXISTS public.feedback (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    message text NOT NULL,
    email text,
    status text NOT NULL DEFAULT 'new', -- 'new', 'read', 'archived'
    context jsonb NOT NULL DEFAULT '{}'::jsonb, -- Stores IP, UserAgent, URL, OS, Browser, etc.
    created_at timestamptz NOT NULL DEFAULT now(),
    
    CONSTRAINT feedback_pkey PRIMARY KEY (id)
);

-- Index for sorting and filtering
CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON public.feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_status_idx ON public.feedback (status);

-- Enable RLS but allow public inserts (since it's an open feedback form)
-- or restricted to authenticated if we prefer. For now, open to public via API.
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything
CREATE POLICY "Service role can do all on feedback"
    ON public.feedback
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy: Anon can insert (for public feedback form)
CREATE POLICY "Anon can insert feedback"
    ON public.feedback
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Policy: Only service role (and potentially admins later) can select/update
-- This protects the feedback data from being readable by public
CREATE POLICY "Only service role can select feedback"
    ON public.feedback
    FOR SELECT
    TO service_role
    USING (true);

-- Grants
GRANT ALL ON TABLE public.feedback TO service_role;
GRANT INSERT ON TABLE public.feedback TO anon;
GRANT INSERT ON TABLE public.feedback TO authenticated;
