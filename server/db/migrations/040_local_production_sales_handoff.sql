-- Canonical local sales-to-production handoff. Order JSON remains the sales
-- source; line snapshots preserve duplicate products and later order changes.
ALTER TABLE local_production_orders ADD COLUMN IF NOT EXISTS workflow_generation text;
UPDATE local_production_orders SET workflow_generation='LEGACY_V1' WHERE workflow_generation IS NULL;
ALTER TABLE local_production_orders ALTER COLUMN workflow_generation SET DEFAULT 'WORKFLOW_V2';
ALTER TABLE local_production_orders ALTER COLUMN workflow_generation SET NOT NULL;

CREATE TABLE local_production_sales_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL REFERENCES local_orders(id) ON DELETE RESTRICT,
  order_updated_at_snapshot timestamptz,
  status text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','ACCEPTED','RETURNED','ADJUSTMENT_REQUIRED','CANCELLED')),
  due_date date,
  priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  notes text,
  submitted_by text NOT NULL,
  reviewed_by text,
  review_reason text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL UNIQUE
);

CREATE TABLE local_production_sales_request_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES local_production_sales_requests(id) ON DELETE RESTRICT,
  source_line_key text NOT NULL,
  source_line_index integer NOT NULL CHECK (source_line_index >= 0),
  source_line_snapshot jsonb NOT NULL,
  product_id uuid NOT NULL REFERENCES local_products(id) ON DELETE RESTRICT,
  product_sku text,
  product_name text NOT NULL,
  ordered_quantity numeric(18,4) NOT NULL CHECK (ordered_quantity > 0),
  requested_quantity numeric(18,4) NOT NULL CHECK (requested_quantity > 0 AND requested_quantity <= ordered_quantity),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_id, source_line_key)
);

CREATE TABLE local_production_sales_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_line_id uuid NOT NULL REFERENCES local_production_sales_request_lines(id) ON DELETE RESTRICT,
  production_order_id uuid NOT NULL UNIQUE REFERENCES local_production_orders(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL UNIQUE REFERENCES local_production_order_items(id) ON DELETE RESTRICT,
  production_batch_id uuid NOT NULL UNIQUE REFERENCES local_production_batches(id) ON DELETE RESTRICT,
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE local_production_sales_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES local_production_sales_requests(id) ON DELETE RESTRICT,
  action text NOT NULL,
  from_status text,
  to_status text,
  reason text,
  actor_id text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE local_production_workflow_requests (
  idempotency_key text PRIMARY KEY,
  actor_id text NOT NULL,
  action text NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE local_production_orders ADD COLUMN IF NOT EXISTS sales_request_id uuid REFERENCES local_production_sales_requests(id) ON DELETE RESTRICT;
ALTER TABLE local_production_order_items ADD COLUMN IF NOT EXISTS sales_request_line_id uuid REFERENCES local_production_sales_request_lines(id) ON DELETE RESTRICT;

CREATE INDEX local_sales_requests_order_status_idx ON local_production_sales_requests(order_id,status,submitted_at DESC);
CREATE INDEX local_sales_requests_actor_idx ON local_production_sales_requests(submitted_by,submitted_at DESC);
CREATE INDEX local_sales_request_lines_request_idx ON local_production_sales_request_lines(request_id,source_line_index);
CREATE INDEX local_sales_allocations_line_idx ON local_production_sales_allocations(request_line_id,created_at);
CREATE INDEX local_sales_events_request_idx ON local_production_sales_events(request_id,created_at DESC);
CREATE INDEX local_production_orders_sales_request_idx ON local_production_orders(sales_request_id) WHERE sales_request_id IS NOT NULL;
CREATE INDEX local_production_items_sales_line_idx ON local_production_order_items(sales_request_line_id) WHERE sales_request_line_id IS NOT NULL;
