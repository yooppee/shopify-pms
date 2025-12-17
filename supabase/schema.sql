-- E-commerce PMS Database Schema
-- Execute this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Table 1: products (Dual Data Source)
-- ============================================
CREATE TABLE products (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Group A: External/Synced Columns (From Shopify)
  variant_id BIGINT UNIQUE NOT NULL,
  shopify_product_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  handle TEXT NOT NULL,
  sku TEXT,
  price NUMERIC(10, 2) NOT NULL,
  compare_at_price NUMERIC(10, 2),
  inventory_quantity INTEGER NOT NULL DEFAULT 0,
  weight NUMERIC(10, 2),
  image_url TEXT,
  landing_page_url TEXT,
  position INTEGER DEFAULT 0,
  
  -- Group B: Internal/Manual Columns (JSONB)
  internal_meta JSONB NOT NULL DEFAULT '{}',
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_products_variant_id ON products(variant_id);
CREATE INDEX idx_products_shopify_product_id ON products(shopify_product_id);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_handle ON products(handle);
CREATE INDEX idx_products_internal_meta ON products USING GIN(internal_meta);

-- ============================================
-- Table 2: listing_drafts (Workflow)
-- ============================================
CREATE TABLE listing_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  
  -- Data storage
  original_data JSONB NOT NULL,
  draft_data JSONB NOT NULL,
  
  -- Status tracking
  status TEXT NOT NULL CHECK (status IN ('draft', 'ready')) DEFAULT 'draft',
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_listing_drafts_product_id ON listing_drafts(product_id);
CREATE INDEX idx_listing_drafts_status ON listing_drafts(status);

-- ============================================
-- Table 3: user_events (Analytics)
-- ============================================
CREATE TABLE user_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Session and product tracking
  session_id TEXT NOT NULL,
  product_variant_id BIGINT NOT NULL,
  
  -- Event type
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'cart', 'purchase')),
  
  -- Additional data
  event_data JSONB DEFAULT '{}',
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_events_session_id ON user_events(session_id);
CREATE INDEX idx_user_events_variant_id ON user_events(product_variant_id);
CREATE INDEX idx_user_events_event_type ON user_events(event_type);
CREATE INDEX idx_user_events_created_at ON user_events(created_at DESC);

-- ============================================
-- Recommendation Function (RPC)
-- ============================================
-- Find products frequently viewed in the same session
CREATE OR REPLACE FUNCTION get_product_recommendations(
  target_variant_id BIGINT,
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  variant_id BIGINT,
  view_count BIGINT,
  product_title TEXT,
  product_image_url TEXT,
  product_price NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH target_sessions AS (
    -- Find all sessions that viewed the target product
    SELECT DISTINCT session_id
    FROM user_events
    WHERE product_variant_id = target_variant_id
      AND event_type = 'view'
  ),
  related_products AS (
    -- Find other products viewed in those sessions
    SELECT 
      ue.product_variant_id,
      COUNT(*) as view_count
    FROM user_events ue
    INNER JOIN target_sessions ts ON ue.session_id = ts.session_id
    WHERE ue.product_variant_id != target_variant_id
      AND ue.event_type = 'view'
    GROUP BY ue.product_variant_id
    ORDER BY view_count DESC
    LIMIT limit_count
  )
  SELECT 
    rp.product_variant_id,
    rp.view_count,
    p.title,
    p.image_url,
    p.price
  FROM related_products rp
  LEFT JOIN products p ON p.variant_id = rp.product_variant_id
  ORDER BY rp.view_count DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Auto-update timestamps trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_listing_drafts_updated_at
  BEFORE UPDATE ON listing_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Row Level Security (RLS)
-- ============================================
-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;

-- Public read access for products (adjust based on your auth needs)
CREATE POLICY "Public read access for products"
  ON products FOR SELECT
  USING (true);

-- Authenticated users can insert/update products
CREATE POLICY "Authenticated users can modify products"
  ON products FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Similar policies for listing_drafts
CREATE POLICY "Authenticated users can access listing_drafts"
  ON listing_drafts FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Public can insert events (for tracking)
CREATE POLICY "Public can insert events"
  ON user_events FOR INSERT
  WITH CHECK (true);

-- Only authenticated users can read events
CREATE POLICY "Authenticated users can read events"
  ON user_events FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================
-- Sample internal_meta structure (for reference)
-- ============================================
-- Example of how internal_meta should look:
-- {
--   "cost_price": 10.50,
--   "supplier_name": "Acme Corp",
--   "logistics_cost": 2.00,
--   "profit_margin": 0.35,
--   "notes": "Popular item during holidays",
--   "custom_field_1": "value1"
-- }
