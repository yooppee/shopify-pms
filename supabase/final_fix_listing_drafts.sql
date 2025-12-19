-- ============================================
-- Fix: Ensure Columns Exist & Reload Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Use anonymous code block to check and add columns safely
DO $$
BEGIN
    -- Check for original_data column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listing_drafts' AND column_name = 'original_data') THEN
        RAISE NOTICE 'Adding missing column: original_data';
        ALTER TABLE listing_drafts ADD COLUMN original_data JSONB NOT NULL DEFAULT '{}';
    END IF;

    -- Check for draft_data column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listing_drafts' AND column_name = 'draft_data') THEN
        RAISE NOTICE 'Adding missing column: draft_data';
        ALTER TABLE listing_drafts ADD COLUMN draft_data JSONB NOT NULL DEFAULT '{}';
    END IF;
    
    -- Check for status column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listing_drafts' AND column_name = 'status') THEN
        RAISE NOTICE 'Adding missing column: status';
        ALTER TABLE listing_drafts ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
        ALTER TABLE listing_drafts ADD CHECK (status IN ('draft', 'ready'));
    END IF;

END $$;

-- Force schema cache reload
NOTIFY pgrst, 'reload schema';

-- Verification
SELECT 
    column_name, 
    data_type, 
    is_nullable 
FROM information_schema.columns 
WHERE table_name = 'listing_drafts';
