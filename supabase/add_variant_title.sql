-- Add variant_title column to order_line_items table
ALTER TABLE order_line_items ADD COLUMN IF NOT EXISTS variant_title TEXT;
