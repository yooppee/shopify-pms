-- ============================================
-- Table: shop_credentials (OAuth Token Storage)
-- ============================================
CREATE TABLE shop_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_domain TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  scopes TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: orders (Synced from Shopify)
-- ============================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shopify_order_id BIGINT UNIQUE NOT NULL,
  order_number TEXT NOT NULL,
  email TEXT,
  financial_status TEXT,        -- pending, paid, refunded, etc.
  fulfillment_status TEXT,      -- fulfilled, unfulfilled, partial
  total_price NUMERIC(10, 2),
  subtotal_price NUMERIC(10, 2),
  total_tax NUMERIC(10, 2),
  total_discounts NUMERIC(10, 2),
  currency TEXT,
  customer_name TEXT,
  shipping_address JSONB,       -- Store full address object
  processed_at TIMESTAMPTZ,     -- Shopify processed timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying
CREATE INDEX idx_orders_shopify_id ON orders(shopify_order_id);
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- ============================================
-- Table: order_line_items (Order Items)
-- ============================================
CREATE TABLE order_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  shopify_line_item_id BIGINT UNIQUE NOT NULL,
  variant_id BIGINT,            -- Can link to products table if needed
  product_id BIGINT,
  title TEXT,
  sku TEXT,
  quantity INTEGER,
  price NUMERIC(10, 2),
  total_discount NUMERIC(10, 2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying
CREATE INDEX idx_line_items_order_id ON order_line_items(order_id);
CREATE INDEX idx_line_items_sku ON order_line_items(sku);
CREATE INDEX idx_line_items_variant_id ON order_line_items(variant_id);

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE shop_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_line_items ENABLE ROW LEVEL SECURITY;

-- Only authenticated users (service role) should access credentials
-- But for simplicity in this app, we might check if user is authenticated
CREATE POLICY "Authenticated users can read credentials"
  ON shop_credentials FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage orders"
  ON orders FOR ALL
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage line items"
  ON order_line_items FOR ALL
  USING (auth.role() = 'authenticated');
