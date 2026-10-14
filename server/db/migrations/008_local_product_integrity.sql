-- Keep the local product snapshot safe for duplicate SKUs and price-list deletes.
CREATE UNIQUE INDEX IF NOT EXISTS local_products_price_list_sku_key
  ON local_products(price_list_id, sku)
  WHERE price_list_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS local_products_local_sku_key
  ON local_products(sku)
  WHERE price_list_id IS NULL AND NOT is_snapshot_record;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'local_products_price_list_fk'
  ) THEN
    ALTER TABLE local_products
      ADD CONSTRAINT local_products_price_list_fk
      FOREIGN KEY (price_list_id) REFERENCES local_price_lists(id) NOT VALID;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'local_products_price_list_fk' AND NOT convalidated
  ) AND NOT EXISTS (
    SELECT 1
    FROM local_products p
    LEFT JOIN local_price_lists l ON l.id = p.price_list_id
    WHERE p.price_list_id IS NOT NULL AND l.id IS NULL
  ) THEN
    ALTER TABLE local_products VALIDATE CONSTRAINT local_products_price_list_fk;
  END IF;
END $$;

ALTER TABLE local_price_lists
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE local_product_rates
  ADD COLUMN IF NOT EXISTS source_reference text,
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_snapshot_record boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS local_modified_at timestamptz;

-- Import the approved/draft product-rate versions already present in the snapshot.
-- Source and local product IDs are intentionally preserved, so later syncs remain idempotent.
INSERT INTO local_product_rates (
  id, product_id, rate, rate_unit, effective_from, effective_to, status, reason,
  source_reference, source_updated_at, is_snapshot_record
)
SELECT
  s.source_key::uuid,
  NULLIF(s.payload->>'product_id', '')::uuid,
  NULLIF(s.payload->>'rate', '')::numeric,
  COALESCE(NULLIF(s.payload->>'unit', ''), 'PIECE'),
  NULLIF(s.payload->>'effective_from', '')::date,
  NULLIF(s.payload->>'effective_to', '')::date,
  COALESCE(NULLIF(s.payload->>'status', ''), 'DRAFT'),
  NULLIF(s.payload->>'reason', ''),
  NULLIF(s.payload->>'source_reference', ''),
  s.source_updated_at,
  true
FROM local_source_snapshots s
JOIN local_products p
  ON p.id = NULLIF(s.payload->>'product_id', '')::uuid
WHERE s.source = 'SUPABASE'
  AND s.source_table = 'product_piece_rate_versions'
  AND NOT s.is_deleted
  AND NULLIF(s.payload->>'product_id', '') IS NOT NULL
  AND NULLIF(s.payload->>'rate', '') IS NOT NULL
  AND NULLIF(s.payload->>'effective_from', '') IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
  product_id = excluded.product_id,
  rate = excluded.rate,
  rate_unit = excluded.rate_unit,
  effective_from = excluded.effective_from,
  effective_to = excluded.effective_to,
  status = excluded.status,
  reason = excluded.reason,
  source_reference = excluded.source_reference,
  source_updated_at = excluded.source_updated_at
WHERE local_product_rates.is_snapshot_record
  AND local_product_rates.local_modified_at IS NULL;

-- A full snapshot can mark source rows as deleted; reflect that in derived local records.
UPDATE local_product_rates r
SET status = 'RETIRED'
FROM local_source_snapshots s
WHERE r.id = s.source_key::uuid
  AND s.source = 'SUPABASE'
  AND s.source_table = 'product_piece_rate_versions'
  AND s.is_deleted
  AND r.is_snapshot_record
  AND r.local_modified_at IS NULL;

UPDATE local_products p
SET is_active = false,
    updated_at = now()
FROM local_source_snapshots s
WHERE p.id = s.source_key::uuid
  AND s.source = 'SUPABASE'
  AND s.source_table = 'products'
  AND s.is_deleted
  AND p.is_snapshot_record
  AND p.local_modified_at IS NULL;

UPDATE local_price_lists l
SET is_active = false,
    status = COALESCE(NULLIF(l.status, ''), 'DELETED'),
    updated_at = now()
FROM local_source_snapshots s
WHERE l.id = s.source_key::uuid
  AND s.source = 'SUPABASE'
  AND s.source_table = 'price_lists'
  AND s.is_deleted
  AND l.is_snapshot_record;
