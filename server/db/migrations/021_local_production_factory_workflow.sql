-- Local factory workflow records used by the existing production-order UI.
-- These tables are isolated from Supabase and keep local mutations auditable
-- and idempotent while preserving the current frontend data shapes.
CREATE TABLE IF NOT EXISTS local_production_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid NOT NULL REFERENCES local_production_orders(id) ON DELETE CASCADE,
  batch_number text NOT NULL,
  team_id uuid,
  planned_quantity numeric(18,4) NOT NULL CHECK (planned_quantity > 0),
  status text NOT NULL DEFAULT 'PLANNED',
  started_at timestamptz,
  completed_at timestamptz,
  created_by text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(production_order_id, batch_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS local_production_batches_idempotency_idx
  ON local_production_batches(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS local_production_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid NOT NULL REFERENCES local_production_orders(id) ON DELETE CASCADE,
  production_batch_id uuid REFERENCES local_production_batches(id) ON DELETE SET NULL,
  order_item_id uuid REFERENCES local_production_order_items(id) ON DELETE SET NULL,
  stage text NOT NULL,
  worker_id uuid REFERENCES local_workers(id) ON DELETE SET NULL,
  team_id uuid,
  quantity_received numeric(18,4) NOT NULL DEFAULT 0,
  quantity_good numeric(18,4) NOT NULL DEFAULT 0,
  quantity_rework numeric(18,4) NOT NULL DEFAULT 0,
  quantity_remake numeric(18,4) NOT NULL DEFAULT 0,
  quantity_defect numeric(18,4) NOT NULL DEFAULT 0,
  minutes_worked numeric(18,4),
  event_type text NOT NULL DEFAULT 'OUTPUT',
  status text NOT NULL DEFAULT 'SUBMITTED',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  approved_by text,
  notes text,
  idempotency_key text,
  production_entry_id uuid,
  reviewed_at timestamptz,
  review_reason text,
  reversed_by text,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (quantity_received >= 0 AND quantity_good >= 0 AND quantity_rework >= 0 AND quantity_remake >= 0 AND quantity_defect >= 0),
  CHECK (quantity_good + quantity_rework + quantity_remake + quantity_defect <= quantity_received)
);
CREATE UNIQUE INDEX IF NOT EXISTS local_production_stage_events_idempotency_idx
  ON local_production_stage_events(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS local_production_stage_events_order_idx
  ON local_production_stage_events(production_order_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS local_production_fabric_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid NOT NULL REFERENCES local_production_orders(id) ON DELETE CASCADE,
  production_batch_id uuid REFERENCES local_production_batches(id) ON DELETE SET NULL,
  fabric_variant_id text,
  inventory_item_id uuid REFERENCES local_inventory_items(id) ON DELETE SET NULL,
  warehouse_id text,
  reserved_quantity numeric(18,4) NOT NULL DEFAULT 0,
  issued_quantity numeric(18,4) NOT NULL DEFAULT 0,
  received_quantity numeric(18,4) NOT NULL DEFAULT 0,
  consumed_quantity numeric(18,4) NOT NULL DEFAULT 0,
  returned_quantity numeric(18,4) NOT NULL DEFAULT 0,
  scrap_quantity numeric(18,4) NOT NULL DEFAULT 0,
  idempotency_key text,
  source_system text NOT NULL DEFAULT 'LOCAL_FABRIC',
  source_fabric_usage_id text,
  source_fabric_transaction_id text,
  issued_at timestamptz,
  issued_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reserved_quantity >= 0 AND issued_quantity >= 0 AND received_quantity >= 0 AND consumed_quantity >= 0 AND returned_quantity >= 0 AND scrap_quantity >= 0),
  CHECK (consumed_quantity + returned_quantity + scrap_quantity <= issued_quantity)
);
CREATE UNIQUE INDEX IF NOT EXISTS local_production_fabric_allocations_idempotency_idx
  ON local_production_fabric_allocations(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS local_production_fabric_allocations_order_idx
  ON local_production_fabric_allocations(production_order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS local_production_operation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_operation_id uuid NOT NULL REFERENCES local_production_order_operations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  worker_id uuid REFERENCES local_workers(id) ON DELETE SET NULL,
  quantity numeric(18,4),
  reason_code text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_minutes numeric(18,4),
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS local_production_operation_logs_operation_idx
  ON local_production_operation_logs(production_order_operation_id, created_at DESC);

-- Every production order has one default batch so the factory tab works for
-- both synced orders and newly-created local orders.
INSERT INTO local_production_batches(production_order_id,batch_number,planned_quantity,status,created_by,created_at,updated_at)
SELECT po.id,coalesce(nullif(po.production_batch_number,''),po.production_order_number),po.quantity_planned,
  CASE WHEN po.status='COMPLETED' THEN 'COMPLETED' WHEN po.status IN ('IN_PROGRESS','ON_HOLD') THEN 'IN_PROGRESS' ELSE 'PLANNED' END,
  coalesce(po.created_by,'local-admin'),coalesce(po.created_at,now()),coalesce(po.updated_at,now())
FROM local_production_orders po
WHERE po.quantity_planned > 0
ON CONFLICT(production_order_id,batch_number) DO UPDATE
SET planned_quantity=excluded.planned_quantity,updated_at=greatest(local_production_batches.updated_at,excluded.updated_at);
