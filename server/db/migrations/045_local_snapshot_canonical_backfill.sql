-- Complete canonical projections that were present only in the raw Supabase snapshot.
-- Local writes carry local_modified_at so later imports cannot overwrite them.

ALTER TABLE local_order_payments
  ADD COLUMN IF NOT EXISTS is_snapshot_record boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS local_modified_at timestamptz;

UPDATE local_order_payments payment
SET is_snapshot_record = false,
    local_modified_at = COALESCE(payment.updated_at, payment.created_at, now())
WHERE NOT EXISTS (
  SELECT 1
  FROM local_source_snapshots snapshot
  WHERE snapshot.source = 'SUPABASE'
    AND snapshot.source_table = 'order_payments'
    AND snapshot.source_key = payment.id
);

INSERT INTO local_order_payments (
  id, order_id, payment_amount, payment_date, payment_type, payment_method,
  installment_number, notes, created_at, updated_at, is_snapshot_record
)
SELECT
  snapshot.source_key,
  snapshot.payload->>'order_id',
  COALESCE(NULLIF(snapshot.payload->>'payment_amount', '')::numeric, 0),
  NULLIF(snapshot.payload->>'payment_date', '')::timestamptz,
  snapshot.payload->>'payment_type',
  snapshot.payload->>'payment_method',
  NULLIF(snapshot.payload->>'installment_number', '')::integer,
  snapshot.payload->>'notes',
  NULLIF(snapshot.payload->>'created_at', '')::timestamptz,
  NULLIF(snapshot.payload->>'updated_at', '')::timestamptz,
  true
FROM local_source_snapshots snapshot
WHERE snapshot.source = 'SUPABASE'
  AND snapshot.source_table = 'order_payments'
  AND NOT snapshot.is_deleted
ON CONFLICT (id) DO UPDATE SET
  order_id = excluded.order_id,
  payment_amount = excluded.payment_amount,
  payment_date = excluded.payment_date,
  payment_type = excluded.payment_type,
  payment_method = excluded.payment_method,
  installment_number = excluded.installment_number,
  notes = excluded.notes,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  is_snapshot_record = true
WHERE local_order_payments.local_modified_at IS NULL;

INSERT INTO local_transactions (
  id, amount, date, type, description, category, payment_type, order_id,
  installment_number, total_installments, remaining_amount, manager_id,
  tenant_id, created_at, updated_at, is_snapshot_record
)
SELECT
  snapshot.source_key,
  COALESCE(NULLIF(snapshot.payload->>'amount', '')::numeric, 0),
  COALESCE(NULLIF(snapshot.payload->>'date', '')::timestamptz, now()),
  COALESCE(snapshot.payload->>'type', ''),
  snapshot.payload->>'description',
  snapshot.payload->>'category',
  snapshot.payload->>'payment_type',
  snapshot.payload->>'order_id',
  NULLIF(snapshot.payload->>'installment_number', '')::integer,
  NULLIF(snapshot.payload->>'total_installments', '')::integer,
  NULLIF(snapshot.payload->>'remaining_amount', '')::numeric,
  snapshot.payload->>'manager_id',
  snapshot.payload->>'tenant_id',
  COALESCE(NULLIF(snapshot.payload->>'created_at', '')::timestamptz, now()),
  COALESCE(NULLIF(snapshot.payload->>'updated_at', '')::timestamptz, now()),
  true
FROM local_source_snapshots snapshot
WHERE snapshot.source = 'SUPABASE'
  AND snapshot.source_table = 'transactions'
  AND NOT snapshot.is_deleted
ON CONFLICT (id) DO UPDATE SET
  amount = excluded.amount,
  date = excluded.date,
  type = excluded.type,
  description = excluded.description,
  category = excluded.category,
  payment_type = excluded.payment_type,
  order_id = excluded.order_id,
  installment_number = excluded.installment_number,
  total_installments = excluded.total_installments,
  remaining_amount = excluded.remaining_amount,
  manager_id = excluded.manager_id,
  tenant_id = excluded.tenant_id,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  is_snapshot_record = true
WHERE local_transactions.local_modified_at IS NULL;

INSERT INTO local_ghn_tracking (
  id, ghn_order_code, internal_order_code, order_id, customer_name,
  customer_phone, customer_address, package_weight, created_date,
  expected_delivery_date, delivered_date, cod_amount, ghn_status,
  ghn_status_text, tracking_url, last_updated_at, tracking_notes, raw_data,
  manager_id, tenant_id, created_at, updated_at, is_snapshot_record
)
SELECT
  snapshot.source_key,
  COALESCE(snapshot.payload->>'ghn_order_code', snapshot.source_key),
  snapshot.payload->>'internal_order_code',
  snapshot.payload->>'order_id',
  COALESCE(snapshot.payload->>'customer_name', ''),
  snapshot.payload->>'customer_phone',
  snapshot.payload->>'customer_address',
  NULLIF(snapshot.payload->>'package_weight', '')::numeric,
  NULLIF(snapshot.payload->>'created_date', '')::timestamptz,
  NULLIF(snapshot.payload->>'expected_delivery_date', '')::timestamptz,
  NULLIF(snapshot.payload->>'delivered_date', '')::timestamptz,
  NULLIF(snapshot.payload->>'cod_amount', '')::numeric,
  snapshot.payload->>'ghn_status',
  snapshot.payload->>'ghn_status_text',
  snapshot.payload->>'tracking_url',
  NULLIF(snapshot.payload->>'last_updated_at', '')::timestamptz,
  snapshot.payload->>'tracking_notes',
  snapshot.payload->'raw_data',
  snapshot.payload->>'manager_id',
  snapshot.payload->>'tenant_id',
  COALESCE(NULLIF(snapshot.payload->>'created_at', '')::timestamptz, now()),
  COALESCE(NULLIF(snapshot.payload->>'updated_at', '')::timestamptz, now()),
  true
FROM local_source_snapshots snapshot
WHERE snapshot.source = 'SUPABASE'
  AND snapshot.source_table = 'ghn_tracking'
  AND NOT snapshot.is_deleted
ON CONFLICT (id) DO UPDATE SET
  ghn_order_code = excluded.ghn_order_code,
  internal_order_code = excluded.internal_order_code,
  order_id = excluded.order_id,
  customer_name = excluded.customer_name,
  customer_phone = excluded.customer_phone,
  customer_address = excluded.customer_address,
  package_weight = excluded.package_weight,
  created_date = excluded.created_date,
  expected_delivery_date = excluded.expected_delivery_date,
  delivered_date = excluded.delivered_date,
  cod_amount = excluded.cod_amount,
  ghn_status = excluded.ghn_status,
  ghn_status_text = excluded.ghn_status_text,
  tracking_url = excluded.tracking_url,
  last_updated_at = excluded.last_updated_at,
  tracking_notes = excluded.tracking_notes,
  raw_data = excluded.raw_data,
  manager_id = excluded.manager_id,
  tenant_id = excluded.tenant_id,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  is_snapshot_record = true
WHERE local_ghn_tracking.local_modified_at IS NULL;
