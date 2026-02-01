-- Create sku_mappings table for associating unmatched SKUs with variants
CREATE TABLE IF NOT EXISTS sku_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  input_sku TEXT UNIQUE NOT NULL,
  target_variant_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_sku_mappings_input_sku ON sku_mappings(input_sku);

-- Enable RLS
ALTER TABLE sku_mappings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public read access for sku_mappings"
  ON sku_mappings FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert sku_mappings"
  ON sku_mappings FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update sku_mappings"
  ON sku_mappings FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete sku_mappings"
  ON sku_mappings FOR DELETE
  USING (auth.role() = 'authenticated');
