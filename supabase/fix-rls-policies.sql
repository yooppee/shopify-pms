-- Fix Row Level Security Policies for Products Table
-- Run this in your Supabase SQL Editor

-- First, let's check current policies
-- You can view them in Supabase Dashboard > Authentication > Policies

-- OPTION 1: Temporarily disable RLS for testing (NOT recommended for production)
-- ALTER TABLE products DISABLE ROW LEVEL SECURITY;

-- OPTION 2: Update policies to allow upsert operations (RECOMMENDED)

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Authenticated users can modify products" ON products;
DROP POLICY IF EXISTS "Public read access for products" ON products;

-- Create more permissive policies for development

-- Allow anyone to read products
CREATE POLICY "Enable read access for all users"
ON products FOR SELECT
USING (true);

-- Allow anyone to insert products (for initial sync)
CREATE POLICY "Enable insert access for all users"
ON products FOR INSERT
WITH CHECK (true);

-- Allow anyone to update products
CREATE POLICY "Enable update access for all users"
ON products FOR UPDATE
USING (true)
WITH CHECK (true);

-- Allow anyone to delete products
CREATE POLICY "Enable delete access for all users"
ON products FOR DELETE
USING (true);

-- Note: For production, you should restrict these policies to authenticated users only:
-- USING (auth.role() = 'authenticated')
-- WITH CHECK (auth.role() = 'authenticated')

-- Verify RLS is still enabled
-- RLS should remain enabled, but with permissive policies
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'products';
