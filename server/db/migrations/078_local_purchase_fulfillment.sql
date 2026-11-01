-- Local stock-first fulfillment for canonical PURCHASE lines. This augments
-- the inventory movement ledger; it never creates a parallel stock balance.

ALTER TABLE local_production_product_inventory_maps
  DROP CONSTRAINT IF EXISTS local_production_product_inventory_maps_inventory_item_id_key;

CREATE TABLE local_purchase_fulfillment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_request_line_id uuid NOT NULL REFERENCES local_production_sales_request_lines(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES local_orders(id) ON DELETE RESTRICT,
  source_line_key text NOT NULL,
  product_id uuid NOT NULL REFERENCES local_products(id) ON DELETE RESTRICT,
  fulfillment_revision integer NOT NULL CHECK (fulfillment_revision > 0),
  source_snapshot jsonb NOT NULL,
  inventory_item_id uuid NOT NULL REFERENCES local_inventory_items(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES local_inventory_warehouses(id) ON DELETE RESTRICT,
  base_unit text NOT NULL,
  planned_quantity numeric(18,4) NOT NULL CHECK (planned_quantity > 0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RELEASED')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE local_purchase_stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES local_purchase_fulfillment_plans(id) ON DELETE RESTRICT,
  reservation_kind text NOT NULL CHECK (reservation_kind IN ('ON_HAND','RECEIPT')),
  reserved_quantity numeric(18,4) NOT NULL CHECK (reserved_quantity > 0),
  released_quantity numeric(18,4) NOT NULL DEFAULT 0 CHECK (released_quantity >= 0),
  consumed_quantity numeric(18,4) NOT NULL DEFAULT 0 CHECK (consumed_quantity >= 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (released_quantity + consumed_quantity <= reserved_quantity)
);

CREATE TABLE local_purchase_shortage_demands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL UNIQUE REFERENCES local_purchase_fulfillment_plans(id) ON DELETE RESTRICT,
  requested_quantity numeric(18,4) NOT NULL DEFAULT 0 CHECK (requested_quantity >= 0),
  received_quantity numeric(18,4) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  cancelled_quantity numeric(18,4) NOT NULL DEFAULT 0 CHECK (cancelled_quantity >= 0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SATISFIED','CANCELLED')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (received_quantity + cancelled_quantity <= requested_quantity)
);

CREATE TABLE local_purchase_receipt_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortage_demand_id uuid NOT NULL REFERENCES local_purchase_shortage_demands(id) ON DELETE RESTRICT,
  inventory_movement_id uuid NOT NULL REFERENCES local_inventory_movements(id) ON DELETE RESTRICT,
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE local_purchase_fulfillment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES local_purchase_fulfillment_plans(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('PLAN','RESERVE','SHORTAGE','RECEIVE','RELEASE')),
  actor_id text NOT NULL,
  reason text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE local_purchase_fulfillment_commands (
  idempotency_key text PRIMARY KEY,
  actor_id text NOT NULL,
  action text NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX local_purchase_plans_active_line_idx ON local_purchase_fulfillment_plans(sales_request_line_id) WHERE status='ACTIVE';

CREATE INDEX local_purchase_plans_order_idx ON local_purchase_fulfillment_plans(order_id,created_at DESC);
CREATE INDEX local_purchase_reservations_plan_idx ON local_purchase_stock_reservations(plan_id,created_at);
CREATE INDEX local_purchase_shortages_status_idx ON local_purchase_shortage_demands(status,updated_at DESC);
CREATE INDEX local_purchase_receipts_movement_idx ON local_purchase_receipt_allocations(inventory_movement_id);
CREATE INDEX local_purchase_events_plan_idx ON local_purchase_fulfillment_events(plan_id,created_at DESC);

CREATE OR REPLACE FUNCTION local_inventory_held_stock_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  physical_after numeric(18,4);
  held numeric(18,4);
BEGIN
  IF NEW.quantity_delta >= 0 THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('inventory-stock:' || NEW.inventory_item_id::text || ':' || NEW.warehouse_id::text,0));
  SELECT coalesce(sum(quantity_delta),0) + NEW.quantity_delta INTO physical_after
    FROM local_inventory_movements
   WHERE inventory_item_id=NEW.inventory_item_id AND warehouse_id=NEW.warehouse_id;
  SELECT coalesce(sum(r.reserved_quantity-r.released_quantity-r.consumed_quantity),0) INTO held
    FROM local_purchase_stock_reservations r
    JOIN local_purchase_fulfillment_plans p ON p.id=r.plan_id
   WHERE p.inventory_item_id=NEW.inventory_item_id AND p.warehouse_id=NEW.warehouse_id
     AND r.reserved_quantity>r.released_quantity+r.consumed_quantity;
  IF physical_after < held THEN
    RAISE EXCEPTION 'Xuất kho làm dùng vào số hàng đang được giữ cho đơn Sale.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER local_inventory_held_stock_guard
  BEFORE INSERT ON local_inventory_movements
  FOR EACH ROW EXECUTE FUNCTION local_inventory_held_stock_guard();

REVOKE ALL ON local_purchase_fulfillment_plans,local_purchase_stock_reservations,local_purchase_shortage_demands,
  local_purchase_receipt_allocations,local_purchase_fulfillment_events,local_purchase_fulfillment_commands FROM PUBLIC;
