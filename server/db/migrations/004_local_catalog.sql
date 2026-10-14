ALTER TABLE local_products
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS price numeric(18,2),
  ADD COLUMN IF NOT EXISTS cost_price numeric(18,2),
  ADD COLUMN IF NOT EXISTS specifications text,
  ADD COLUMN IF NOT EXISTS in_stock boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS local_products_catalog_idx
  ON local_products(is_active, category, sku);

UPDATE local_products
SET description = COALESCE(description, CASE sku
    WHEN 'AO-SO-MI-001' THEN 'San pham demo cho quy trinh may mac.'
    WHEN 'QUAN-001' THEN 'San pham demo dung cho cham san luong.'
    ELSE NULL
  END),
  specifications = COALESCE(specifications, CASE sku
    WHEN 'AO-SO-MI-001' THEN 'Cotton, size S-XL'
    WHEN 'QUAN-001' THEN 'Kaki, size 28-34'
    ELSE NULL
  END),
  price = COALESCE(price, CASE sku
    WHEN 'AO-SO-MI-001' THEN 320000
    WHEN 'QUAN-001' THEN 280000
    ELSE NULL
  END),
  cost_price = COALESCE(cost_price, CASE sku
    WHEN 'AO-SO-MI-001' THEN 180000
    WHEN 'QUAN-001' THEN 155000
    ELSE NULL
  END),
  in_stock = COALESCE(in_stock, true),
  updated_at = COALESCE(updated_at, now())
WHERE sku IN ('AO-SO-MI-001', 'QUAN-001');
