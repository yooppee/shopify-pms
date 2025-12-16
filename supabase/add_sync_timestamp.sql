-- Add last_order_sync_at column to shop_credentials table
ALTER TABLE shop_credentials 
ADD COLUMN IF NOT EXISTS last_order_sync_at TIMESTAMPTZ;
