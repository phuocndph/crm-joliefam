-- Local quality records for production scrap and rework.
-- These records are append-only and keep the local workflow independent of Supabase.
CREATE TABLE IF NOT EXISTS local_production_scrap_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid NOT NULL REFERENCES local_production_orders(id) ON DELETE CASCADE,
  production_order_operation_id uuid REFERENCES local_production_order_operations(id) ON DELETE SET NULL,
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  reason_code text NOT NULL,
  notes text,
  idempotency_key text NOT NULL UNIQUE,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS local_production_scrap_order_idx
  ON local_production_scrap_records(production_order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS local_production_rework_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid NOT NULL REFERENCES local_production_orders(id) ON DELETE CASCADE,
  from_operation_id uuid REFERENCES local_production_order_operations(id) ON DELETE SET NULL,
  target_operation_id uuid REFERENCES local_production_order_operations(id) ON DELETE SET NULL,
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  reason_code text NOT NULL,
  notes text,
  idempotency_key text NOT NULL UNIQUE,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS local_production_rework_order_idx
  ON local_production_rework_records(production_order_id, created_at DESC);
