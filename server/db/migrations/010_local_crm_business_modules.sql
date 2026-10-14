-- Canonical local read/write tables for the original CRM business screens.
-- Snapshot rows remain the import source; these tables are the local operational copy.

ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS manager_id text;
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS assignee_id text;
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS quote_id text;
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS local_modified_at timestamptz;
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS cost_price numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS profit_before numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS profit_after numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE local_quotes ADD COLUMN IF NOT EXISTS manager_id text;
ALTER TABLE local_quotes ADD COLUMN IF NOT EXISTS assignee_id text;
ALTER TABLE local_quotes ADD COLUMN IF NOT EXISTS price_list_id text;
ALTER TABLE local_quotes ADD COLUMN IF NOT EXISTS local_modified_at timestamptz;

CREATE INDEX IF NOT EXISTS local_orders_created_idx ON local_orders(created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS local_orders_status_idx ON local_orders(status, created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS local_quotes_created_idx ON local_quotes(created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS local_quotes_status_idx ON local_quotes(status, created_at DESC NULLS LAST);

INSERT INTO local_orders (
  id, customer_id, order_number, display_order_number, manager_id, assignee_id, quote_id,
  status, payment_status, total_amount, cost_price, profit_before, profit_after,
  payment_date, delivery_date, delivered_date, items, notes, created_at, updated_at
)
SELECT
  s.source_key,
  s.payload->>'customer_id',
  s.payload->>'order_number',
  s.payload->>'display_order_number',
  s.payload->>'manager_id',
  s.payload->>'assignee_id',
  s.payload->>'quote_id',
  s.payload->>'status',
  s.payload->>'payment_status',
  COALESCE(NULLIF(s.payload->>'total_amount', '')::numeric, 0),
  COALESCE(NULLIF(s.payload->>'cost_price', '')::numeric, 0),
  COALESCE(NULLIF(s.payload->>'profit_before', '')::numeric, 0),
  COALESCE(NULLIF(s.payload->>'profit_after', '')::numeric, 0),
  NULLIF(s.payload->>'payment_date', '')::timestamptz,
  NULLIF(s.payload->>'delivery_date', '')::timestamptz,
  NULLIF(s.payload->>'delivered_date', '')::timestamptz,
  CASE
    WHEN jsonb_typeof(s.payload->'items') = 'array' THEN s.payload->'items'
    WHEN NULLIF(s.payload->>'items', '') IS NOT NULL THEN (s.payload->>'items')::jsonb
    ELSE '[]'::jsonb
  END,
  s.payload->>'notes',
  NULLIF(s.payload->>'created_at', '')::timestamptz,
  NULLIF(s.payload->>'updated_at', '')::timestamptz
FROM local_source_snapshots s
WHERE s.source = 'SUPABASE' AND s.source_table = 'orders' AND NOT s.is_deleted
ON CONFLICT (id) DO UPDATE SET
  customer_id = excluded.customer_id,
  order_number = excluded.order_number,
  display_order_number = excluded.display_order_number,
  manager_id = excluded.manager_id,
  assignee_id = excluded.assignee_id,
  quote_id = excluded.quote_id,
  status = excluded.status,
  payment_status = excluded.payment_status,
  total_amount = excluded.total_amount,
  cost_price = excluded.cost_price,
  profit_before = excluded.profit_before,
  profit_after = excluded.profit_after,
  payment_date = excluded.payment_date,
  delivery_date = excluded.delivery_date,
  delivered_date = excluded.delivered_date,
  items = excluded.items,
  notes = excluded.notes,
  updated_at = excluded.updated_at
WHERE local_orders.local_modified_at IS NULL;

INSERT INTO local_quotes (
  id, customer_id, quote_number, manager_id, assignee_id, price_list_id, status,
  subtotal, vat_rate, vat_amount, total_amount, include_vat, items, quote_data,
  notes, created_at, updated_at
)
SELECT
  s.source_key,
  s.payload->>'customer_id',
  s.payload->>'quote_number',
  s.payload->>'manager_id',
  s.payload->>'assignee_id',
  s.payload->>'price_list_id',
  s.payload->>'status',
  NULLIF(s.payload->>'subtotal', '')::numeric,
  NULLIF(s.payload->>'vat_rate', '')::numeric,
  NULLIF(s.payload->>'vat_amount', '')::numeric,
  COALESCE(NULLIF(s.payload->>'total_amount', '')::numeric, 0),
  NULLIF(s.payload->>'include_vat', '')::boolean,
  CASE
    WHEN jsonb_typeof(s.payload->'items') = 'array' THEN s.payload->'items'
    WHEN NULLIF(s.payload->>'items', '') IS NOT NULL THEN (s.payload->>'items')::jsonb
    ELSE '[]'::jsonb
  END,
  CASE
    WHEN jsonb_typeof(s.payload->'quote_data') = 'object' THEN s.payload->'quote_data'
    WHEN NULLIF(s.payload->>'quote_data', '') IS NOT NULL THEN (s.payload->>'quote_data')::jsonb
    ELSE NULL
  END,
  s.payload->>'notes',
  NULLIF(s.payload->>'created_at', '')::timestamptz,
  NULLIF(s.payload->>'updated_at', '')::timestamptz
FROM local_source_snapshots s
WHERE s.source = 'SUPABASE' AND s.source_table = 'quotes' AND NOT s.is_deleted
ON CONFLICT (id) DO UPDATE SET
  customer_id = excluded.customer_id,
  quote_number = excluded.quote_number,
  manager_id = excluded.manager_id,
  assignee_id = excluded.assignee_id,
  price_list_id = excluded.price_list_id,
  status = excluded.status,
  subtotal = excluded.subtotal,
  vat_rate = excluded.vat_rate,
  vat_amount = excluded.vat_amount,
  total_amount = excluded.total_amount,
  include_vat = excluded.include_vat,
  items = excluded.items,
  quote_data = excluded.quote_data,
  notes = excluded.notes,
  updated_at = excluded.updated_at
WHERE local_quotes.local_modified_at IS NULL;

INSERT INTO local_order_payments (
  id, order_id, payment_amount, payment_date, payment_type, payment_method,
  installment_number, notes, created_at, updated_at
)
SELECT
  s.source_key,
  s.payload->>'order_id',
  COALESCE(NULLIF(s.payload->>'payment_amount', '')::numeric, 0),
  NULLIF(s.payload->>'payment_date', '')::timestamptz,
  s.payload->>'payment_type',
  s.payload->>'payment_method',
  NULLIF(s.payload->>'installment_number', '')::integer,
  s.payload->>'notes',
  NULLIF(s.payload->>'created_at', '')::timestamptz,
  NULLIF(s.payload->>'updated_at', '')::timestamptz
FROM local_source_snapshots s
WHERE s.source = 'SUPABASE' AND s.source_table = 'order_payments' AND NOT s.is_deleted
ON CONFLICT (id) DO UPDATE SET
  order_id = excluded.order_id,
  payment_amount = excluded.payment_amount,
  payment_date = excluded.payment_date,
  payment_type = excluded.payment_type,
  payment_method = excluded.payment_method,
  installment_number = excluded.installment_number,
  notes = excluded.notes,
  updated_at = excluded.updated_at;

CREATE TABLE IF NOT EXISTS local_fabric_types (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  manager_id text,
  tenant_id text,
  created_at timestamptz,
  updated_at timestamptz,
  is_snapshot_record boolean NOT NULL DEFAULT true,
  local_modified_at timestamptz
);

CREATE TABLE IF NOT EXISTS local_fabric_widths (
  id text PRIMARY KEY,
  width_code text NOT NULL,
  description text,
  manager_id text,
  tenant_id text,
  created_at timestamptz,
  updated_at timestamptz,
  is_snapshot_record boolean NOT NULL DEFAULT true,
  local_modified_at timestamptz
);

CREATE TABLE IF NOT EXISTS local_warehouses (
  id text PRIMARY KEY,
  name text NOT NULL,
  address text,
  warehouse_type text,
  is_active boolean NOT NULL DEFAULT true,
  manager_id text,
  tenant_id text,
  created_at timestamptz,
  updated_at timestamptz,
  is_snapshot_record boolean NOT NULL DEFAULT true,
  local_modified_at timestamptz
);

CREATE TABLE IF NOT EXISTS local_fabric_variants (
  id text PRIMARY KEY,
  fabric_type_id text,
  variant_name text NOT NULL,
  width_code text,
  weight text,
  color text,
  origin text,
  unit text,
  cost_price numeric(18,2),
  selling_price numeric(18,2),
  fabric_width_id text,
  manager_id text,
  tenant_id text,
  created_at timestamptz,
  updated_at timestamptz,
  is_snapshot_record boolean NOT NULL DEFAULT true,
  local_modified_at timestamptz
);

CREATE TABLE IF NOT EXISTS local_fabric_inventory (
  id text PRIMARY KEY,
  fabric_variant_id text,
  warehouse_id text,
  current_stock numeric(18,4) NOT NULL DEFAULT 0,
  packages_count numeric(18,4) NOT NULL DEFAULT 0,
  reserved_stock numeric(18,4) NOT NULL DEFAULT 0,
  minimum_stock numeric(18,4) NOT NULL DEFAULT 0,
  maximum_stock numeric(18,4) NOT NULL DEFAULT 0,
  last_updated timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  manager_id text,
  tenant_id text,
  is_snapshot_record boolean NOT NULL DEFAULT true,
  local_modified_at timestamptz,
  UNIQUE(fabric_variant_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS local_fabric_transactions (
  id text PRIMARY KEY,
  fabric_variant_id text,
  warehouse_id text,
  transaction_type text,
  quantity numeric(18,4) NOT NULL DEFAULT 0,
  packages_count numeric(18,4) NOT NULL DEFAULT 0,
  unit_price numeric(18,2),
  total_amount numeric(18,2),
  reference_number text,
  supplier_name text,
  recipient_name text,
  notes text,
  transaction_date timestamptz,
  manager_id text,
  tenant_id text,
  created_at timestamptz,
  updated_at timestamptz,
  is_snapshot_record boolean NOT NULL DEFAULT true,
  local_modified_at timestamptz
);

CREATE TABLE IF NOT EXISTS local_fabric_transfers (
  id text PRIMARY KEY,
  fabric_variant_id text,
  from_warehouse_id text,
  to_warehouse_id text,
  quantity numeric(18,4) NOT NULL DEFAULT 0,
  transfer_date timestamptz,
  status text,
  notes text,
  approved_by text,
  received_by text,
  manager_id text,
  tenant_id text,
  created_at timestamptz,
  updated_at timestamptz,
  is_snapshot_record boolean NOT NULL DEFAULT true,
  local_modified_at timestamptz
);

CREATE TABLE IF NOT EXISTS local_fabric_usage (
  id text PRIMARY KEY,
  order_id text,
  order_number text,
  order_type text,
  fabric_variant_id text,
  warehouse_id text,
  quantity_used numeric(18,4) NOT NULL DEFAULT 0,
  unit text,
  usage_date timestamptz,
  notes text,
  customer_name text,
  customer_code text,
  fabric_width text,
  manager_id text,
  tenant_id text,
  created_at timestamptz,
  updated_at timestamptz,
  is_snapshot_record boolean NOT NULL DEFAULT true,
  local_modified_at timestamptz
);

CREATE INDEX IF NOT EXISTS local_fabric_inventory_variant_idx ON local_fabric_inventory(fabric_variant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS local_fabric_transactions_date_idx ON local_fabric_transactions(transaction_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS local_fabric_usage_order_idx ON local_fabric_usage(order_id, usage_date DESC NULLS LAST);

INSERT INTO local_fabric_types (id,name,description,manager_id,tenant_id,created_at,updated_at)
SELECT source_key,payload->>'name',payload->>'description',payload->>'manager_id',payload->>'tenant_id',source_updated_at,source_updated_at
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='fabric_types' AND NOT is_deleted
ON CONFLICT (id) DO UPDATE SET name=excluded.name,description=excluded.description,manager_id=excluded.manager_id,tenant_id=excluded.tenant_id,updated_at=excluded.updated_at WHERE local_fabric_types.local_modified_at IS NULL;

INSERT INTO local_fabric_widths (id,width_code,description,manager_id,tenant_id,created_at,updated_at)
SELECT source_key,payload->>'width_code',payload->>'description',payload->>'manager_id',payload->>'tenant_id',source_updated_at,source_updated_at
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='fabric_widths' AND NOT is_deleted
ON CONFLICT (id) DO UPDATE SET width_code=excluded.width_code,description=excluded.description,manager_id=excluded.manager_id,tenant_id=excluded.tenant_id,updated_at=excluded.updated_at WHERE local_fabric_widths.local_modified_at IS NULL;

INSERT INTO local_warehouses (id,name,address,warehouse_type,is_active,manager_id,tenant_id,created_at,updated_at)
SELECT source_key,payload->>'name',payload->>'address',payload->>'warehouse_type',COALESCE(NULLIF(payload->>'is_active','')::boolean,true),payload->>'manager_id',payload->>'tenant_id',source_updated_at,source_updated_at
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='warehouses' AND NOT is_deleted
ON CONFLICT (id) DO UPDATE SET name=excluded.name,address=excluded.address,warehouse_type=excluded.warehouse_type,is_active=excluded.is_active,manager_id=excluded.manager_id,tenant_id=excluded.tenant_id,updated_at=excluded.updated_at WHERE local_warehouses.local_modified_at IS NULL;

INSERT INTO local_fabric_variants (id,fabric_type_id,variant_name,width_code,weight,color,origin,unit,cost_price,selling_price,fabric_width_id,manager_id,tenant_id,created_at,updated_at)
SELECT source_key,payload->>'fabric_type_id',COALESCE(payload->>'variant_name',''),payload->>'width_code',payload->>'weight',payload->>'color',payload->>'origin',payload->>'unit',NULLIF(payload->>'cost_price','')::numeric,NULLIF(payload->>'selling_price','')::numeric,payload->>'fabric_width_id',payload->>'manager_id',payload->>'tenant_id',source_updated_at,source_updated_at
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='fabric_variants' AND NOT is_deleted
ON CONFLICT (id) DO UPDATE SET fabric_type_id=excluded.fabric_type_id,variant_name=excluded.variant_name,width_code=excluded.width_code,weight=excluded.weight,color=excluded.color,origin=excluded.origin,unit=excluded.unit,cost_price=excluded.cost_price,selling_price=excluded.selling_price,fabric_width_id=excluded.fabric_width_id,manager_id=excluded.manager_id,tenant_id=excluded.tenant_id,updated_at=excluded.updated_at WHERE local_fabric_variants.local_modified_at IS NULL;

INSERT INTO local_fabric_inventory (id,fabric_variant_id,warehouse_id,current_stock,packages_count,reserved_stock,minimum_stock,maximum_stock,last_updated,created_at,updated_at,manager_id,tenant_id)
SELECT source_key,payload->>'fabric_variant_id',payload->>'warehouse_id',COALESCE(NULLIF(payload->>'current_stock','')::numeric,0),COALESCE(NULLIF(payload->>'packages_count','')::numeric,0),COALESCE(NULLIF(payload->>'reserved_stock','')::numeric,0),COALESCE(NULLIF(payload->>'minimum_stock','')::numeric,0),COALESCE(NULLIF(payload->>'maximum_stock','')::numeric,0),NULLIF(payload->>'last_updated','')::timestamptz,source_updated_at,source_updated_at,payload->>'manager_id',payload->>'tenant_id'
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='fabric_inventory' AND NOT is_deleted
ON CONFLICT (id) DO UPDATE SET fabric_variant_id=excluded.fabric_variant_id,warehouse_id=excluded.warehouse_id,current_stock=excluded.current_stock,packages_count=excluded.packages_count,reserved_stock=excluded.reserved_stock,minimum_stock=excluded.minimum_stock,maximum_stock=excluded.maximum_stock,last_updated=excluded.last_updated,updated_at=excluded.updated_at WHERE local_fabric_inventory.local_modified_at IS NULL;

INSERT INTO local_fabric_transactions (id,fabric_variant_id,warehouse_id,transaction_type,quantity,packages_count,unit_price,total_amount,reference_number,supplier_name,recipient_name,notes,transaction_date,manager_id,tenant_id,created_at,updated_at)
SELECT source_key,payload->>'fabric_variant_id',payload->>'warehouse_id',payload->>'transaction_type',COALESCE(NULLIF(payload->>'quantity','')::numeric,0),COALESCE(NULLIF(payload->>'packages_count','')::numeric,0),NULLIF(payload->>'unit_price','')::numeric,NULLIF(payload->>'total_amount','')::numeric,payload->>'reference_number',payload->>'supplier_name',payload->>'recipient_name',payload->>'notes',NULLIF(payload->>'transaction_date','')::timestamptz,payload->>'manager_id',payload->>'tenant_id',source_updated_at,source_updated_at
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='fabric_transactions' AND NOT is_deleted
ON CONFLICT (id) DO UPDATE SET fabric_variant_id=excluded.fabric_variant_id,warehouse_id=excluded.warehouse_id,transaction_type=excluded.transaction_type,quantity=excluded.quantity,packages_count=excluded.packages_count,unit_price=excluded.unit_price,total_amount=excluded.total_amount,reference_number=excluded.reference_number,supplier_name=excluded.supplier_name,recipient_name=excluded.recipient_name,notes=excluded.notes,transaction_date=excluded.transaction_date,updated_at=excluded.updated_at WHERE local_fabric_transactions.local_modified_at IS NULL;

INSERT INTO local_fabric_transfers (id,fabric_variant_id,from_warehouse_id,to_warehouse_id,quantity,transfer_date,status,notes,approved_by,received_by,manager_id,tenant_id,created_at,updated_at)
SELECT source_key,payload->>'fabric_variant_id',payload->>'from_warehouse_id',payload->>'to_warehouse_id',COALESCE(NULLIF(payload->>'quantity','')::numeric,0),NULLIF(payload->>'transfer_date','')::timestamptz,payload->>'status',payload->>'notes',payload->>'approved_by',payload->>'received_by',payload->>'manager_id',payload->>'tenant_id',source_updated_at,source_updated_at
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='fabric_transfers' AND NOT is_deleted
ON CONFLICT (id) DO UPDATE SET fabric_variant_id=excluded.fabric_variant_id,from_warehouse_id=excluded.from_warehouse_id,to_warehouse_id=excluded.to_warehouse_id,quantity=excluded.quantity,transfer_date=excluded.transfer_date,status=excluded.status,notes=excluded.notes,approved_by=excluded.approved_by,received_by=excluded.received_by,updated_at=excluded.updated_at WHERE local_fabric_transfers.local_modified_at IS NULL;

INSERT INTO local_fabric_usage (id,order_id,order_number,order_type,fabric_variant_id,warehouse_id,quantity_used,unit,usage_date,notes,customer_name,customer_code,fabric_width,manager_id,tenant_id,created_at,updated_at)
SELECT source_key,payload->>'order_id',payload->>'order_number',payload->>'order_type',payload->>'fabric_variant_id',payload->>'warehouse_id',COALESCE(NULLIF(payload->>'quantity_used','')::numeric,0),payload->>'unit',NULLIF(payload->>'usage_date','')::timestamptz,payload->>'notes',payload->>'customer_name',payload->>'customer_code',payload->>'fabric_width',payload->>'manager_id',payload->>'tenant_id',source_updated_at,source_updated_at
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='fabric_usage' AND NOT is_deleted
ON CONFLICT (id) DO UPDATE SET order_id=excluded.order_id,order_number=excluded.order_number,order_type=excluded.order_type,fabric_variant_id=excluded.fabric_variant_id,warehouse_id=excluded.warehouse_id,quantity_used=excluded.quantity_used,unit=excluded.unit,usage_date=excluded.usage_date,notes=excluded.notes,customer_name=excluded.customer_name,customer_code=excluded.customer_code,fabric_width=excluded.fabric_width,updated_at=excluded.updated_at WHERE local_fabric_usage.local_modified_at IS NULL;
