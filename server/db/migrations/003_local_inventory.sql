CREATE TABLE IF NOT EXISTS local_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  item_type text NOT NULL DEFAULT 'RAW_MATERIAL',
  base_unit text NOT NULL DEFAULT 'PIECE',
  category text,
  is_active boolean NOT NULL DEFAULT true,
  legacy_source_type text,
  legacy_source_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS local_inventory_warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  address text,
  warehouse_type text NOT NULL DEFAULT 'GENERAL',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS local_inventory_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number text NOT NULL UNIQUE,
  document_type text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  transaction_at timestamptz NOT NULL,
  warehouse_id uuid REFERENCES local_inventory_warehouses(id),
  to_warehouse_id uuid REFERENCES local_inventory_warehouses(id),
  description text NOT NULL DEFAULT '',
  counterparty_name text,
  external_reference text,
  subtotal numeric(18,2),
  vat_amount numeric(18,2),
  total_amount numeric(18,2),
  created_by text NOT NULL DEFAULT 'local-admin',
  confirmed_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  idempotency_key text NOT NULL UNIQUE,
  production_order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS local_inventory_document_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES local_inventory_documents(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES local_inventory_items(id),
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL,
  description text,
  input_unit_cost numeric(18,4),
  vat_rate numeric(6,2) NOT NULL DEFAULT 0,
  adjustment_direction text,
  source_movement_id uuid,
  location_id uuid,
  to_location_id uuid,
  cost_center_id uuid,
  cost_object_id uuid
);

CREATE TABLE IF NOT EXISTS local_inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_sequence bigserial UNIQUE,
  document_id uuid NOT NULL REFERENCES local_inventory_documents(id),
  inventory_item_id uuid NOT NULL REFERENCES local_inventory_items(id),
  warehouse_id uuid NOT NULL REFERENCES local_inventory_warehouses(id),
  movement_kind text NOT NULL,
  quantity_delta numeric(18,4) NOT NULL,
  unit text NOT NULL,
  unit_cost numeric(18,4),
  value_delta numeric(18,2),
  transaction_at timestamptz NOT NULL,
  created_by text NOT NULL DEFAULT 'local-admin',
  source_movement_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS local_inventory_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  actor_id text NOT NULL DEFAULT 'local-admin',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_inventory_documents_filter_idx
  ON local_inventory_documents(transaction_at DESC, status, document_type, warehouse_id);
CREATE INDEX IF NOT EXISTS local_inventory_movements_lookup_idx
  ON local_inventory_movements(inventory_item_id, warehouse_id, transaction_at, movement_sequence);

UPDATE local_inventory_movements SET movement_kind = 'RECEIPT' WHERE movement_kind = 'RECEIPT_IN';
UPDATE local_inventory_movements SET movement_kind = 'ISSUE' WHERE movement_kind = 'ISSUE_OUT';
UPDATE local_inventory_movements SET movement_kind = 'RETURN_IN' WHERE movement_kind = 'RETURN_IN_IN';
UPDATE local_inventory_movements SET movement_kind = 'RETURN_OUT' WHERE movement_kind = 'RETURN_OUT_OUT';
UPDATE local_inventory_movements SET movement_kind = 'OPENING_BALANCE' WHERE movement_kind = 'OPENING_BALANCE_IN';
