-- Add refund tracking columns to order_line_items
-- This allows tracking which items were refunded and by how much

ALTER TABLE order_line_items
ADD COLUMN IF NOT EXISTS refunded_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10, 2) DEFAULT 0;

-- Add shipping refund column to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS shipping_refund NUMERIC(10, 2) DEFAULT 0;

-- Add index for quick filtering of refunded items
CREATE INDEX IF NOT EXISTS idx_line_items_refunded ON order_line_items(refunded_quantity) WHERE refunded_quantity > 0;
