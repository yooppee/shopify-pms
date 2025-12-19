-- ============================================
-- Migration: Add listing_drafts table for Listings page
-- Run this in Supabase SQL Editor if listing_drafts table doesn't exist
-- ============================================

-- Create listing_drafts table if not exists
CREATE TABLE IF NOT EXISTS listing_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  
  -- Data storage
  original_data JSONB NOT NULL DEFAULT '{}',
  draft_data JSONB NOT NULL DEFAULT '{}',
  
  -- Status tracking
  status TEXT NOT NULL CHECK (status IN ('draft', 'ready')) DEFAULT 'draft',
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes if not exist
CREATE INDEX IF NOT EXISTS idx_listing_drafts_product_id ON listing_drafts(product_id);
CREATE INDEX IF NOT EXISTS idx_listing_drafts_status ON listing_drafts(status);

-- Create or replace the updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger to avoid duplicates
DROP TRIGGER IF EXISTS update_listing_drafts_updated_at ON listing_drafts;
CREATE TRIGGER update_listing_drafts_updated_at
  BEFORE UPDATE ON listing_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Disable RLS for simplicity (can be enabled with proper policies if needed)
ALTER TABLE listing_drafts DISABLE ROW LEVEL SECURITY;

-- Verify table exists
SELECT 'listing_drafts table is ready!' AS status;
