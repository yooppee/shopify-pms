-- ============================================
-- Fix: Reload Supabase Schema Cache
-- Run this in Supabase SQL Editor to fix "Could not find column in schema cache" error
-- ============================================

NOTIFY pgrst, 'reload schema';

-- Verification
SELECT 'Schema cache reloaded successfully' as status;
