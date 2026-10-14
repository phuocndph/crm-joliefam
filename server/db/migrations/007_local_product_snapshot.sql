ALTER TABLE local_products
  DROP CONSTRAINT IF EXISTS local_products_sku_key;

ALTER TABLE local_products
  ADD COLUMN IF NOT EXISTS price_list_id uuid,
  ADD COLUMN IF NOT EXISTS tenant_id text,
  ADD COLUMN IF NOT EXISTS manager_id uuid,
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_snapshot_record boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS local_modified_at timestamptz;

CREATE INDEX IF NOT EXISTS local_products_price_list_idx
  ON local_products(price_list_id, category, sku);
CREATE INDEX IF NOT EXISTS local_products_sku_idx
  ON local_products(sku);

CREATE TABLE IF NOT EXISTS local_price_lists (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  year integer,
  status text,
  tenant_id text,
  manager_id uuid,
  is_snapshot_record boolean NOT NULL DEFAULT true,
  source_updated_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
);

INSERT INTO local_price_lists (
  id, name, year, status, tenant_id, manager_id, source_updated_at, created_at, updated_at
)
SELECT
  s.source_key::uuid,
  COALESCE(NULLIF(s.payload->>'name', ''), 'Bảng giá chưa đặt tên'),
  NULLIF(s.payload->>'year', '')::integer,
  s.payload->>'status',
  s.payload->>'tenant_id',
  NULLIF(s.payload->>'manager_id', '')::uuid,
  s.source_updated_at,
  NULLIF(s.payload->>'created_at', '')::timestamptz,
  NULLIF(s.payload->>'updated_at', '')::timestamptz
FROM local_source_snapshots s
WHERE s.source = 'SUPABASE' AND s.source_table = 'price_lists' AND NOT s.is_deleted
ON CONFLICT (id) DO UPDATE SET
  name = excluded.name,
  year = excluded.year,
  status = excluded.status,
  tenant_id = excluded.tenant_id,
  manager_id = excluded.manager_id,
  source_updated_at = excluded.source_updated_at,
  updated_at = excluded.updated_at;

INSERT INTO local_products (
  id, sku, name, description, category, specifications, price, cost_price, in_stock,
  rate_unit, is_active, price_list_id, tenant_id, manager_id, images, image_url,
  source_updated_at, is_snapshot_record, created_at, updated_at
)
SELECT
  s.source_key::uuid,
  s.payload->>'sku',
  s.payload->>'name',
  NULLIF(s.payload->>'description', ''),
  NULLIF(s.payload->>'category', ''),
  NULLIF(s.payload->>'specifications', ''),
  NULLIF(s.payload->>'price', '')::numeric,
  NULLIF(s.payload->>'cost_price', '')::numeric,
  COALESCE(NULLIF(s.payload->>'in_stock', '')::boolean, true),
  'PIECE',
  true,
  NULLIF(s.payload->>'price_list_id', '')::uuid,
  s.payload->>'tenant_id',
  NULLIF(s.payload->>'manager_id', '')::uuid,
  CASE WHEN jsonb_typeof(s.payload->'images') = 'array' THEN s.payload->'images' ELSE '[]'::jsonb END,
  NULLIF(s.payload->>'image_url', ''),
  s.source_updated_at,
  true,
  COALESCE(NULLIF(s.payload->>'created_at', '')::timestamptz, s.first_seen_at),
  COALESCE(NULLIF(s.payload->>'updated_at', '')::timestamptz, s.last_seen_at)
FROM local_source_snapshots s
WHERE s.source = 'SUPABASE' AND s.source_table = 'products' AND NOT s.is_deleted
ON CONFLICT (id) DO UPDATE SET
  sku = excluded.sku,
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  specifications = excluded.specifications,
  price = excluded.price,
  cost_price = excluded.cost_price,
  in_stock = excluded.in_stock,
  price_list_id = excluded.price_list_id,
  tenant_id = excluded.tenant_id,
  manager_id = excluded.manager_id,
  images = excluded.images,
  image_url = excluded.image_url,
  source_updated_at = excluded.source_updated_at,
  updated_at = excluded.updated_at
WHERE local_products.is_snapshot_record AND local_products.local_modified_at IS NULL;
