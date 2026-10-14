CREATE TABLE IF NOT EXISTS local_customers (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_code text,
  name text NOT NULL,
  email text,
  phone text,
  address text,
  company text,
  notes text,
  phones jsonb NOT NULL DEFAULT '[]'::jsonb,
  addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  auto_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_status text,
  last_care_date timestamptz,
  assignee_id text,
  manager_id text,
  tenant_id text,
  purchase_count integer NOT NULL DEFAULT 0,
  last_purchase_date timestamptz,
  total_spent numeric(18,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_snapshot_record boolean NOT NULL DEFAULT false,
  local_modified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_customers_name_idx ON local_customers(lower(name));
CREATE INDEX IF NOT EXISTS local_customers_code_idx ON local_customers(customer_code);
CREATE INDEX IF NOT EXISTS local_customers_active_idx ON local_customers(is_active, created_at DESC);

CREATE TABLE IF NOT EXISTS local_orders (
  id text PRIMARY KEY,
  customer_id text,
  order_number text,
  display_order_number text,
  status text,
  payment_status text,
  total_amount numeric(18,2) NOT NULL DEFAULT 0,
  payment_date timestamptz,
  delivery_date timestamptz,
  delivered_date timestamptz,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz,
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS local_orders_customer_idx ON local_orders(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS local_quotes (
  id text PRIMARY KEY,
  customer_id text,
  quote_number text,
  status text,
  subtotal numeric(18,2),
  vat_rate numeric(8,3),
  vat_amount numeric(18,2),
  total_amount numeric(18,2) NOT NULL DEFAULT 0,
  include_vat boolean,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  quote_data jsonb,
  notes text,
  created_at timestamptz,
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS local_quotes_customer_idx ON local_quotes(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS local_order_payments (
  id text PRIMARY KEY,
  order_id text,
  payment_amount numeric(18,2) NOT NULL DEFAULT 0,
  payment_date timestamptz,
  payment_type text,
  payment_method text,
  installment_number integer,
  notes text,
  created_at timestamptz,
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS local_order_payments_order_idx ON local_order_payments(order_id, payment_date DESC);

-- Materialize the read-only Supabase snapshot without changing the public project.
INSERT INTO local_customers (
  id, customer_code, name, email, phone, address, company, notes, phones, addresses,
  tags, auto_tags, current_status, last_care_date, assignee_id, manager_id, tenant_id,
  purchase_count, last_purchase_date, total_spent, is_snapshot_record, created_at, updated_at
)
SELECT
  s.source_key,
  s.payload->>'customer_code',
  COALESCE(NULLIF(s.payload->>'name', ''), 'Khách hàng chưa đặt tên'),
  s.payload->>'email',
  s.payload->>'phone',
  s.payload->>'address',
  s.payload->>'company',
  s.payload->>'notes',
  CASE WHEN jsonb_typeof(s.payload->'phones') = 'array' THEN s.payload->'phones' ELSE '[]'::jsonb END,
  CASE WHEN jsonb_typeof(s.payload->'addresses') = 'array' THEN s.payload->'addresses' ELSE '[]'::jsonb END,
  CASE WHEN jsonb_typeof(s.payload->'tags') = 'array' THEN s.payload->'tags' ELSE '[]'::jsonb END,
  CASE WHEN jsonb_typeof(s.payload->'auto_tags') = 'array' THEN s.payload->'auto_tags' ELSE '[]'::jsonb END,
  s.payload->>'current_status',
  NULLIF(s.payload->>'last_care_date', '')::timestamptz,
  s.payload->>'assignee_id',
  s.payload->>'manager_id',
  s.payload->>'tenant_id',
  COALESCE(NULLIF(s.payload->>'purchase_count', '')::integer, 0),
  NULLIF(s.payload->>'last_purchase_date', '')::timestamptz,
  COALESCE(NULLIF(s.payload->>'total_spent', '')::numeric, 0),
  true,
  COALESCE(s.source_updated_at, s.first_seen_at),
  COALESCE(s.source_updated_at, s.last_seen_at)
FROM local_source_snapshots s
WHERE s.source = 'SUPABASE' AND s.source_table = 'customers' AND NOT s.is_deleted
ON CONFLICT (id) DO UPDATE SET
  customer_code = excluded.customer_code,
  name = excluded.name,
  email = excluded.email,
  phone = excluded.phone,
  address = excluded.address,
  company = excluded.company,
  notes = excluded.notes,
  phones = excluded.phones,
  addresses = excluded.addresses,
  tags = excluded.tags,
  auto_tags = excluded.auto_tags,
  current_status = excluded.current_status,
  last_care_date = excluded.last_care_date,
  assignee_id = excluded.assignee_id,
  manager_id = excluded.manager_id,
  tenant_id = excluded.tenant_id,
  purchase_count = excluded.purchase_count,
  last_purchase_date = excluded.last_purchase_date,
  total_spent = excluded.total_spent,
  updated_at = excluded.updated_at
WHERE local_customers.is_snapshot_record AND local_customers.local_modified_at IS NULL;

INSERT INTO local_orders (
  id, customer_id, order_number, display_order_number, status, payment_status, total_amount,
  payment_date, delivery_date, delivered_date, items, notes, created_at, updated_at
)
SELECT
  s.source_key,
  s.payload->>'customer_id',
  s.payload->>'order_number',
  s.payload->>'display_order_number',
  s.payload->>'status',
  s.payload->>'payment_status',
  COALESCE(NULLIF(s.payload->>'total_amount', '')::numeric, 0),
  NULLIF(s.payload->>'payment_date', '')::timestamptz,
  NULLIF(s.payload->>'delivery_date', '')::timestamptz,
  NULLIF(s.payload->>'delivered_date', '')::timestamptz,
  CASE WHEN jsonb_typeof(s.payload->'items') = 'array' THEN s.payload->'items' ELSE '[]'::jsonb END,
  s.payload->>'notes',
  NULLIF(s.payload->>'created_at', '')::timestamptz,
  NULLIF(s.payload->>'updated_at', '')::timestamptz
FROM local_source_snapshots s
WHERE s.source = 'SUPABASE' AND s.source_table = 'orders' AND NOT s.is_deleted
ON CONFLICT (id) DO UPDATE SET
  customer_id = excluded.customer_id,
  order_number = excluded.order_number,
  display_order_number = excluded.display_order_number,
  status = excluded.status,
  payment_status = excluded.payment_status,
  total_amount = excluded.total_amount,
  payment_date = excluded.payment_date,
  delivery_date = excluded.delivery_date,
  delivered_date = excluded.delivered_date,
  items = excluded.items,
  notes = excluded.notes,
  updated_at = excluded.updated_at;

INSERT INTO local_quotes (
  id, customer_id, quote_number, status, subtotal, vat_rate, vat_amount, total_amount,
  include_vat, items, quote_data, notes, created_at, updated_at
)
SELECT
  s.source_key,
  s.payload->>'customer_id',
  s.payload->>'quote_number',
  s.payload->>'status',
  NULLIF(s.payload->>'subtotal', '')::numeric,
  NULLIF(s.payload->>'vat_rate', '')::numeric,
  NULLIF(s.payload->>'vat_amount', '')::numeric,
  COALESCE(NULLIF(s.payload->>'total_amount', '')::numeric, 0),
  NULLIF(s.payload->>'include_vat', '')::boolean,
  CASE WHEN jsonb_typeof(s.payload->'items') = 'array' THEN s.payload->'items' ELSE '[]'::jsonb END,
  s.payload->'quote_data',
  s.payload->>'notes',
  NULLIF(s.payload->>'created_at', '')::timestamptz,
  NULLIF(s.payload->>'updated_at', '')::timestamptz
FROM local_source_snapshots s
WHERE s.source = 'SUPABASE' AND s.source_table = 'quotes' AND NOT s.is_deleted
ON CONFLICT (id) DO UPDATE SET
  customer_id = excluded.customer_id,
  quote_number = excluded.quote_number,
  status = excluded.status,
  subtotal = excluded.subtotal,
  vat_rate = excluded.vat_rate,
  vat_amount = excluded.vat_amount,
  total_amount = excluded.total_amount,
  include_vat = excluded.include_vat,
  items = excluded.items,
  quote_data = excluded.quote_data,
  notes = excluded.notes,
  updated_at = excluded.updated_at;

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
