-- Mã tính công sản lượng lấy từ bảng Excel (ma_sp), độc lập với SKU CRM.
-- Migration chỉ mở rộng database local, không tác động Supabase/public.
ALTER TABLE local_product_rates
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE local_product_rates
  ADD COLUMN IF NOT EXISTS piece_rate_code text,
  ADD COLUMN IF NOT EXISTS piece_rate_name text,
  ADD COLUMN IF NOT EXISTS source_row integer;

CREATE INDEX IF NOT EXISTS local_product_rates_piece_code_lookup_idx
  ON local_product_rates(lower(piece_rate_code), effective_from, effective_to)
  WHERE piece_rate_code IS NOT NULL;

ALTER TABLE local_production_entries
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE local_production_entries
  ADD COLUMN IF NOT EXISTS piece_rate_code text,
  ADD COLUMN IF NOT EXISTS piece_rate_name_snapshot text,
  ADD COLUMN IF NOT EXISTS rate_unit_snapshot text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'local_production_entries_source_check'
  ) THEN
    ALTER TABLE local_production_entries
      ADD CONSTRAINT local_production_entries_source_check
      CHECK (product_id IS NOT NULL OR nullif(btrim(piece_rate_code), '') IS NOT NULL);
  END IF;
END $$;

-- Backfill các lần import Excel cũ đã gắn nhầm mã Excel vào SKU local.
UPDATE local_product_rates r
SET piece_rate_code = coalesce(nullif(r.piece_rate_code, ''), p.sku),
    piece_rate_name = coalesce(nullif(r.piece_rate_name, ''), p.name)
FROM local_products p
WHERE r.product_id = p.id
  AND r.piece_rate_code IS NULL
  AND coalesce(r.source_reference, '') LIKE 'Excel:%';

UPDATE local_production_entries e
SET piece_rate_code = coalesce(nullif(e.piece_rate_code, ''), r.piece_rate_code, p.sku),
    piece_rate_name_snapshot = coalesce(nullif(e.piece_rate_name_snapshot, ''), r.piece_rate_name, p.name),
    rate_unit_snapshot = coalesce(nullif(e.rate_unit_snapshot, ''), r.rate_unit, p.rate_unit)
FROM local_product_rates r, local_products p
WHERE e.rate_id = r.id
  AND p.id = e.product_id
  AND e.piece_rate_code IS NULL
  AND (r.piece_rate_code IS NOT NULL OR p.sku IS NOT NULL);
