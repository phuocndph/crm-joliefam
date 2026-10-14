-- Flexible local records for manufacturing profiles, BOM, cutting and routing.
-- The payload remains PostgreSQL JSONB so the existing UI can be migrated without
-- changing its domain shapes, while local writes stay separate from Supabase.
CREATE TABLE IF NOT EXISTS local_manufacturing_records (
  id text PRIMARY KEY,
  record_type text NOT NULL,
  product_id text,
  parent_id text,
  version_number integer,
  status text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_snapshot_record boolean NOT NULL DEFAULT false,
  local_modified_at timestamptz
);
CREATE INDEX IF NOT EXISTS local_manufacturing_type_product_idx
  ON local_manufacturing_records(record_type, product_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS local_manufacturing_parent_idx
  ON local_manufacturing_records(record_type, parent_id, version_number DESC);

