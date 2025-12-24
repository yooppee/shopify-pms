-- Add manual_cost column to order_line_items table
ALTER TABLE order_line_items
ADD COLUMN manual_cost NUMERIC(10, 2);

-- Add comment to explain usage
COMMENT ON COLUMN order_line_items.manual_cost IS 'Manual override for product cost. If null, use inventory cost.';
