-- Local production core. Public Supabase rows are copied as read-only starting data;
-- all subsequent local changes stay in PostgreSQL.
CREATE TABLE IF NOT EXISTS local_production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_number text NOT NULL UNIQUE,
  production_batch_number text NOT NULL,
  qr_token text NOT NULL DEFAULT gen_random_uuid()::text,
  product_id uuid NOT NULL,
  quantity_planned numeric(18,4) NOT NULL CHECK (quantity_planned > 0),
  quantity_good numeric(18,4) NOT NULL DEFAULT 0,
  quantity_scrap numeric(18,4) NOT NULL DEFAULT 0,
  quantity_rework numeric(18,4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'DRAFT',
  planned_start_date date,
  planned_end_date date,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  source_type text NOT NULL DEFAULT 'MANUAL',
  source_id uuid,
  order_id uuid,
  cost_center_id uuid,
  bom_version_id uuid,
  routing_version_id uuid,
  standard_minutes_total numeric(18,4) NOT NULL DEFAULT 0,
  material_issue_tolerance_percent numeric(8,4) NOT NULL DEFAULT 5,
  cutting_params_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  released_by text,
  completed_by text,
  cancelled_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  attendance_assignment_enforced boolean NOT NULL DEFAULT false,
  production_order_group_id uuid,
  idempotency_key text,
  is_snapshot_record boolean NOT NULL DEFAULT false,
  local_modified_at timestamptz
);
CREATE INDEX IF NOT EXISTS local_production_orders_filter_idx ON local_production_orders(status, created_at DESC, product_id);
CREATE UNIQUE INDEX IF NOT EXISTS local_production_orders_idempotency_idx ON local_production_orders(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS local_production_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid NOT NULL REFERENCES local_production_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  product_sku text,
  product_name text NOT NULL,
  fabric_variant_id uuid,
  source_order_item_key text,
  color text,
  size text,
  dimensions text,
  planned_quantity numeric(18,4) NOT NULL DEFAULT 0,
  completed_quantity numeric(18,4) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS local_production_order_items_order_idx ON local_production_order_items(production_order_id, created_at);

CREATE TABLE IF NOT EXISTS local_production_order_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid NOT NULL REFERENCES local_production_orders(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  operation_code text NOT NULL,
  operation_name text NOT NULL,
  cost_center_id uuid,
  standard_setup_minutes numeric(18,4) NOT NULL DEFAULT 0,
  standard_run_minutes_per_unit numeric(18,4) NOT NULL DEFAULT 0,
  standard_total_minutes numeric(18,4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING',
  quantity_input numeric(18,4) NOT NULL DEFAULT 0,
  quantity_good numeric(18,4) NOT NULL DEFAULT 0,
  quantity_scrap numeric(18,4) NOT NULL DEFAULT 0,
  quantity_rework numeric(18,4) NOT NULL DEFAULT 0,
  is_optional boolean NOT NULL DEFAULT false,
  planned_start timestamptz,
  planned_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  operation_qr_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(production_order_id, sequence)
);

CREATE TABLE IF NOT EXISTS local_production_order_material_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid NOT NULL REFERENCES local_production_orders(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES local_inventory_items(id),
  bom_line_id uuid,
  bom_version_id uuid,
  requirement_method text NOT NULL DEFAULT 'PER_UNIT',
  standard_quantity numeric(18,4) NOT NULL DEFAULT 0,
  planned_quantity numeric(18,4) NOT NULL DEFAULT 0,
  waste_quantity_standard numeric(18,4) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'PIECE',
  standard_unit_cost_snapshot numeric(18,4),
  standard_material_cost_preview numeric(18,4),
  cutting_profile_version_id uuid,
  calculation_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS local_production_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid NOT NULL REFERENCES local_production_orders(id) ON DELETE CASCADE,
  quantity_good numeric(18,4) NOT NULL DEFAULT 0,
  quantity_scrap numeric(18,4) NOT NULL DEFAULT 0,
  quantity_rework numeric(18,4) NOT NULL DEFAULT 0,
  warehouse_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS local_bom_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL UNIQUE,
  code text NOT NULL, name text NOT NULL, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS local_bom_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bom_id uuid NOT NULL REFERENCES local_bom_headers(id) ON DELETE CASCADE,
  version_number integer NOT NULL, status text NOT NULL DEFAULT 'DRAFT', effective_from date, effective_to date,
  notes text, approved_at timestamptz, approval_reason text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bom_id, version_number)
);
CREATE TABLE IF NOT EXISTS local_bom_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bom_version_id uuid NOT NULL REFERENCES local_bom_versions(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES local_inventory_items(id), line_type text NOT NULL DEFAULT 'MATERIAL',
  quantity_method text NOT NULL DEFAULT 'PER_UNIT', standard_quantity numeric(18,6), unit text NOT NULL DEFAULT 'PIECE',
  waste_rate numeric(8,4) NOT NULL DEFAULT 0, scrap_rate numeric(8,4) NOT NULL DEFAULT 0,
  formula_type text, formula_parameters jsonb NOT NULL DEFAULT '{}'::jsonb, cutting_profile_id uuid,
  sequence integer NOT NULL DEFAULT 1, notes text
);

CREATE TABLE IF NOT EXISTS local_manufacturing_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL UNIQUE,
  manufacturing_type text NOT NULL DEFAULT 'GENERIC_SEWN_PRODUCT', finished_width numeric(18,4), finished_length numeric(18,4),
  finished_height numeric(18,4), dimension_unit text NOT NULL DEFAULT 'CM', extra_dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_bom_id uuid, default_cutting_profile_id uuid, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS local_routing_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL UNIQUE,
  code text NOT NULL, name text NOT NULL, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS local_routing_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), routing_id uuid NOT NULL REFERENCES local_routing_headers(id) ON DELETE CASCADE,
  version_number integer NOT NULL, status text NOT NULL DEFAULT 'DRAFT', effective_from date, effective_to date,
  notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz, approval_reason text, UNIQUE(routing_id, version_number)
);
CREATE TABLE IF NOT EXISTS local_routing_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), routing_version_id uuid NOT NULL REFERENCES local_routing_versions(id) ON DELETE CASCADE,
  operation_code text NOT NULL, operation_name text NOT NULL, sequence integer NOT NULL,
  cost_center_id uuid, standard_minutes_per_unit numeric(18,4) NOT NULL DEFAULT 0, setup_minutes numeric(18,4) NOT NULL DEFAULT 0,
  machine_type text, labor_skill text, quantity_basis text NOT NULL DEFAULT 'UNIT', is_optional boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(routing_version_id, sequence)
);
CREATE TABLE IF NOT EXISTS local_cutting_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL, code text NOT NULL, name text NOT NULL,
  manufacturing_type text NOT NULL DEFAULT 'GENERIC_SEWN_PRODUCT', is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(product_id, code)
);
CREATE TABLE IF NOT EXISTS local_cutting_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cutting_profile_id uuid NOT NULL REFERENCES local_cutting_profiles(id) ON DELETE CASCADE,
  version_number integer NOT NULL, status text NOT NULL DEFAULT 'DRAFT', effective_from date, effective_to date,
  piece_width_rule text NOT NULL DEFAULT 'FIXED', piece_length_rule text NOT NULL DEFAULT 'FIXED',
  piece_width_parameter_cm numeric(18,4), piece_length_parameter_cm numeric(18,4), pieces_per_product numeric(18,4) NOT NULL DEFAULT 1,
  default_fabric_width_cm numeric(18,4), pattern_direction text NOT NULL DEFAULT 'NONE', allow_rotation boolean NOT NULL DEFAULT false,
  requires_matching_pattern boolean NOT NULL DEFAULT false, pattern_repeat_cm numeric(18,4), seam_allowance_cm numeric(18,4) NOT NULL DEFAULT 0,
  hem_allowance_cm numeric(18,4) NOT NULL DEFAULT 0, tuck_depth_cm numeric(18,4) NOT NULL DEFAULT 0, flap_allowance_cm numeric(18,4) NOT NULL DEFAULT 0,
  joining_allowed boolean NOT NULL DEFAULT false, joining_rule text NOT NULL DEFAULT 'NONE', joining_allowance_cm numeric(18,4) NOT NULL DEFAULT 0,
  standard_waste_rate numeric(8,4) NOT NULL DEFAULT 0, issue_rounding_increment numeric(18,4) NOT NULL DEFAULT 0.1,
  calculation_strategy text NOT NULL DEFAULT 'STANDARD', engine_version text NOT NULL DEFAULT 'local-cutting-v1',
  notes text, approved_at timestamptz, approval_reason text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cutting_profile_id, version_number)
);

-- Bootstrap the one existing production order from the read-only sync snapshot.
INSERT INTO local_production_orders (
  id, production_order_number, production_batch_number, qr_token, product_id, quantity_planned, quantity_good,
  quantity_scrap, quantity_rework, status, planned_start_date, planned_end_date, actual_start_at, actual_end_at,
  source_type, source_id, order_id, cost_center_id, bom_version_id, routing_version_id, standard_minutes_total,
  material_issue_tolerance_percent, cutting_params_snapshot, created_by, released_by, completed_by, cancelled_by,
  created_at, updated_at, released_at, completed_at, cancelled_at, cancel_reason, attendance_assignment_enforced,
  is_snapshot_record
)
SELECT s.source_key::uuid,
  coalesce(nullif(s.payload->>'production_order_number',''), s.source_key),
  coalesce(nullif(s.payload->>'production_batch_number',''), nullif(s.payload->>'production_order_number',''), s.source_key),
  coalesce(nullif(s.payload->>'qr_token',''), gen_random_uuid()::text),
  nullif(s.payload->>'product_id','')::uuid,
  case when s.payload->>'quantity_planned' ~ '^-?[0-9]+(\\.[0-9]+)?$' then (s.payload->>'quantity_planned')::numeric else 0 end,
  case when s.payload->>'quantity_good' ~ '^-?[0-9]+(\\.[0-9]+)?$' then (s.payload->>'quantity_good')::numeric else 0 end,
  case when s.payload->>'quantity_scrap' ~ '^-?[0-9]+(\\.[0-9]+)?$' then (s.payload->>'quantity_scrap')::numeric else 0 end,
  case when s.payload->>'quantity_rework' ~ '^-?[0-9]+(\\.[0-9]+)?$' then (s.payload->>'quantity_rework')::numeric else 0 end,
  coalesce(nullif(s.payload->>'status',''),'DRAFT'), nullif(s.payload->>'planned_start_date','')::date,
  nullif(s.payload->>'planned_end_date','')::date, nullif(s.payload->>'actual_start_at','')::timestamptz,
  nullif(s.payload->>'actual_end_at','')::timestamptz, coalesce(nullif(s.payload->>'source_type',''),'MANUAL'),
  nullif(s.payload->>'source_id','')::uuid, nullif(s.payload->>'order_id','')::uuid, nullif(s.payload->>'cost_center_id','')::uuid,
  nullif(s.payload->>'bom_version_id','')::uuid, nullif(s.payload->>'routing_version_id','')::uuid,
  case when s.payload->>'standard_minutes_total' ~ '^-?[0-9]+(\\.[0-9]+)?$' then (s.payload->>'standard_minutes_total')::numeric else 0 end,
  case when s.payload->>'material_issue_tolerance_percent' ~ '^-?[0-9]+(\\.[0-9]+)?$' then (s.payload->>'material_issue_tolerance_percent')::numeric else 5 end,
  coalesce(s.payload->'cutting_params_snapshot','{}'::jsonb), s.payload->>'created_by', s.payload->>'released_by',
  s.payload->>'completed_by', s.payload->>'cancelled_by', coalesce(nullif(s.payload->>'created_at','')::timestamptz, s.first_seen_at),
  coalesce(nullif(s.payload->>'updated_at','')::timestamptz, s.last_seen_at), nullif(s.payload->>'released_at','')::timestamptz,
  nullif(s.payload->>'completed_at','')::timestamptz, nullif(s.payload->>'cancelled_at','')::timestamptz,
  s.payload->>'cancel_reason', coalesce(nullif(s.payload->>'attendance_assignment_enforced','')::boolean,false), true
FROM local_source_snapshots s
WHERE s.source='SUPABASE' AND s.source_table='production_orders' AND NOT s.is_deleted
  AND s.payload->>'product_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND s.payload->>'quantity_planned' ~ '^[0-9]+(\\.[0-9]+)?$'
  AND (s.payload->>'quantity_planned')::numeric > 0
ON CONFLICT (id) DO UPDATE SET status=excluded.status, quantity_planned=excluded.quantity_planned,
  quantity_good=excluded.quantity_good, quantity_scrap=excluded.quantity_scrap, quantity_rework=excluded.quantity_rework,
  updated_at=excluded.updated_at
WHERE local_production_orders.is_snapshot_record AND local_production_orders.local_modified_at IS NULL;
