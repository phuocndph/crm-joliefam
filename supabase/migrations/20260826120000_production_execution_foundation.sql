-- Sprint 4: Production Execution Foundation — routing, production orders, snapshots,
-- actual material & labor, scrap/rework, output and variance read models.
-- Additive development migration. No legacy product/order/fabric/finance table is dropped or rewritten.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Audit action extension (add COMPLETE / RELEASE / HOLD if missing)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_action_check
  CHECK (action IN ('CREATE','UPDATE','DELETE','CONFIRM','VOID','APPROVE','SUPERSEDE','RELEASE','COMPLETE','START','PAUSE','RESUME','HOLD','REPLAN'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Routing — versioned process definition
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.routing_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (btrim(code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE UNIQUE INDEX IF NOT EXISTS routing_headers_active_product_unique
  ON public.routing_headers (tenant_id, product_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.routing_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  routing_id uuid NOT NULL REFERENCES public.routing_headers(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','SUPERSEDED')),
  effective_from date,
  effective_to date,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approval_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  UNIQUE (routing_id, version_number),
  CHECK (effective_to IS NULL OR effective_from IS NOT NULL),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE IF NOT EXISTS public.routing_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  routing_version_id uuid NOT NULL REFERENCES public.routing_versions(id) ON DELETE CASCADE,
  operation_code text NOT NULL CHECK (btrim(operation_code) <> ''),
  operation_name text NOT NULL CHECK (btrim(operation_name) <> ''),
  sequence integer NOT NULL CHECK (sequence > 0),
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE RESTRICT,
  standard_minutes_per_unit numeric(18,4) NOT NULL CHECK (standard_minutes_per_unit >= 0),
  setup_minutes numeric(18,4) NOT NULL DEFAULT 0 CHECK (setup_minutes >= 0),
  machine_type text,
  labor_skill text,
  quantity_basis text NOT NULL DEFAULT 'PER_UNIT' CHECK (quantity_basis IN ('PER_UNIT','PER_BATCH')),
  is_optional boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (routing_version_id, sequence),
  UNIQUE (routing_version_id, operation_code)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Production workers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.production_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_code text NOT NULL CHECK (btrim(employee_code) <> ''),
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  primary_cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE RESTRICT,
  worker_type text NOT NULL DEFAULT 'GENERIC' CHECK (worker_type IN ('CUTTER','SEWER','IRONING','QC','PACKER','HELPER','SUPERVISOR','GENERIC')),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, employee_code)
);
CREATE UNIQUE INDEX IF NOT EXISTS production_workers_user_unique
  ON public.production_workers (tenant_id, user_id) WHERE user_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Production orders
-- ─────────────────────────────────────────────────────────────────────────────
-- Sequence for business numbers (tenant-scoped via function, global sequence is enough
-- because number includes YYYYMM and tenant isolation is enforced at lookup)
CREATE SEQUENCE IF NOT EXISTS public.production_order_number_seq;

CREATE TABLE IF NOT EXISTS public.production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  production_order_number text NOT NULL CHECK (btrim(production_order_number) <> ''),
  production_batch_number text NOT NULL CHECK (btrim(production_batch_number) <> ''),
  qr_token uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity_planned numeric(18,4) NOT NULL CHECK (quantity_planned > 0),
  quantity_good numeric(18,4) NOT NULL DEFAULT 0 CHECK (quantity_good >= 0),
  quantity_scrap numeric(18,4) NOT NULL DEFAULT 0 CHECK (quantity_scrap >= 0),
  quantity_rework numeric(18,4) NOT NULL DEFAULT 0 CHECK (quantity_rework >= 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PLANNED','RELEASED','IN_PROGRESS','COMPLETED','CANCELLED','ON_HOLD')),
  planned_start_date date,
  planned_end_date date,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  source_type text NOT NULL DEFAULT 'MANUAL' CHECK (source_type IN ('FROM_ORDER','FROM_STOCK_PLAN','MANUAL')),
  source_id uuid,
  order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE RESTRICT,
  bom_version_id uuid REFERENCES public.bom_versions(id) ON DELETE RESTRICT,
  routing_version_id uuid REFERENCES public.routing_versions(id) ON DELETE RESTRICT,
  standard_minutes_total numeric(18,2) NOT NULL DEFAULT 0 CHECK (standard_minutes_total >= 0),
  material_issue_tolerance_percent numeric(7,2) NOT NULL DEFAULT 5.00 CHECK (material_issue_tolerance_percent >= 0 AND material_issue_tolerance_percent <= 100),
  cutting_params_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(cutting_params_snapshot) = 'object'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  released_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  UNIQUE (tenant_id, production_order_number),
  UNIQUE (tenant_id, production_batch_number),
  UNIQUE (qr_token),
  CHECK (planned_end_date IS NULL OR planned_start_date IS NULL OR planned_end_date >= planned_start_date)
);

CREATE INDEX IF NOT EXISTS production_orders_product_idx ON public.production_orders (tenant_id, product_id, status);
CREATE INDEX IF NOT EXISTS production_orders_status_idx ON public.production_orders (tenant_id, status);
CREATE INDEX IF NOT EXISTS production_orders_order_idx ON public.production_orders (tenant_id, order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS production_orders_cost_center_idx ON public.production_orders (tenant_id, cost_center_id) WHERE cost_center_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Snapshots taken at RELEASE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.production_order_material_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  bom_line_id uuid REFERENCES public.bom_lines(id) ON DELETE RESTRICT,
  bom_version_id uuid NOT NULL REFERENCES public.bom_versions(id) ON DELETE RESTRICT,
  requirement_method text NOT NULL CHECK (requirement_method IN ('FIXED','PER_UNIT','FORMULA','CUTTING_ENGINE','MULTIPLE')),
  standard_quantity numeric(18,4) NOT NULL CHECK (standard_quantity > 0),
  planned_quantity numeric(18,4) NOT NULL CHECK (planned_quantity > 0),
  waste_quantity_standard numeric(18,4) NOT NULL DEFAULT 0 CHECK (waste_quantity_standard >= 0),
  unit text NOT NULL CHECK (unit IN ('METER','KG','PIECE','ROLL','SET','BAG','BOX')),
  standard_unit_cost_snapshot numeric(18,6) CHECK (standard_unit_cost_snapshot IS NULL OR standard_unit_cost_snapshot >= 0),
  standard_material_cost_preview numeric(18,2) CHECK (standard_material_cost_preview IS NULL OR standard_material_cost_preview >= 0),
  cutting_profile_version_id uuid REFERENCES public.cutting_profile_versions(id) ON DELETE RESTRICT,
  calculation_details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(calculation_details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (production_order_id, inventory_item_id, unit)
);
CREATE INDEX IF NOT EXISTS pomr_item_idx ON public.production_order_material_requirements (tenant_id, inventory_item_id);

CREATE TABLE IF NOT EXISTS public.production_order_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  operation_code text NOT NULL CHECK (btrim(operation_code) <> ''),
  operation_name text NOT NULL CHECK (btrim(operation_name) <> ''),
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE RESTRICT,
  standard_setup_minutes numeric(18,4) NOT NULL DEFAULT 0 CHECK (standard_setup_minutes >= 0),
  standard_run_minutes_per_unit numeric(18,4) NOT NULL DEFAULT 0 CHECK (standard_run_minutes_per_unit >= 0),
  standard_total_minutes numeric(18,4) NOT NULL CHECK (standard_total_minutes >= 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','READY','IN_PROGRESS','COMPLETED','SKIPPED')),
  quantity_input numeric(18,4) NOT NULL DEFAULT 0 CHECK (quantity_input >= 0),
  quantity_good numeric(18,4) NOT NULL DEFAULT 0 CHECK (quantity_good >= 0),
  quantity_scrap numeric(18,4) NOT NULL DEFAULT 0 CHECK (quantity_scrap >= 0),
  quantity_rework numeric(18,4) NOT NULL DEFAULT 0 CHECK (quantity_rework >= 0),
  is_optional boolean NOT NULL DEFAULT false,
  planned_start timestamptz,
  planned_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  operation_qr_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (production_order_id, sequence),
  UNIQUE (production_order_id, operation_code)
);
CREATE INDEX IF NOT EXISTS poo_status_idx ON public.production_order_operations (tenant_id, production_order_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Execution logs + scrap/rework + output
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.production_operation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  production_order_operation_id uuid NOT NULL REFERENCES public.production_order_operations(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('START','PAUSE','RESUME','COMPLETE','QUANTITY_REPORT','SCRAP_REPORT','REWORK')),
  worker_id uuid REFERENCES public.production_workers(id) ON DELETE RESTRICT,
  quantity numeric(18,4) CHECK (quantity IS NULL OR quantity >= 0),
  reason_code text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_minutes numeric(18,4) GENERATED ALWAYS AS (
    CASE WHEN started_at IS NOT NULL AND ended_at IS NOT NULL
      THEN round(extract(epoch FROM (ended_at - started_at)) / 60.0, 4)
      ELSE NULL END
  ) STORED,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (started_at IS NULL OR ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX IF NOT EXISTS pol_operation_idx ON public.production_operation_logs (tenant_id, production_order_operation_id, created_at);
CREATE INDEX IF NOT EXISTS pol_worker_idx ON public.production_operation_logs (tenant_id, worker_id) WHERE worker_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.production_scrap_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  production_order_operation_id uuid REFERENCES public.production_order_operations(id) ON DELETE RESTRICT,
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  reason_code text NOT NULL CHECK (btrim(reason_code) <> ''),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.production_rework_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  from_operation_id uuid REFERENCES public.production_order_operations(id) ON DELETE RESTRICT,
  target_operation_id uuid REFERENCES public.production_order_operations(id) ON DELETE RESTRICT,
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  reason_code text NOT NULL CHECK (btrim(reason_code) <> ''),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.production_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  production_order_id uuid NOT NULL UNIQUE REFERENCES public.production_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity_good numeric(18,4) NOT NULL CHECK (quantity_good >= 0),
  quantity_scrap numeric(18,4) NOT NULL DEFAULT 0 CHECK (quantity_scrap >= 0),
  output_date date NOT NULL DEFAULT CURRENT_DATE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  inventory_receipt_id uuid REFERENCES public.inventory_documents(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('DRAFT','CONFIRMED')),
  valuation_status text NOT NULL DEFAULT 'PENDING_COST' CHECK (valuation_status IN ('PENDING_COST','PROVISIONAL','FINAL')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Inventory linkage: production_order_id on inventory_documents
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.inventory_documents
  ADD COLUMN IF NOT EXISTS production_order_id uuid REFERENCES public.production_orders(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS inventory_documents_production_order_idx
  ON public.inventory_documents (tenant_id, production_order_id) WHERE production_order_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Helpers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_production_permission(p_permission text DEFAULT 'production_view')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_cost_permission(p_permission)
$$;

CREATE OR REPLACE FUNCTION public.generate_production_order_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_seq bigint; v_now date := CURRENT_DATE;
BEGIN
  v_seq := nextval('public.production_order_number_seq');
  RETURN format('SX-%s-%s', to_char(v_now, 'YYYYMM'), lpad(v_seq::text, 6, '0'));
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Validation triggers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_routing_header_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.product_id AND p.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Sản phẩm routing không tồn tại hoặc không cùng phạm vi dữ liệu';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.validate_routing_version_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.routing_headers r WHERE r.id = NEW.routing_id AND r.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Routing version không cùng phạm vi dữ liệu';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.validate_routing_operation_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.routing_versions v WHERE v.id = NEW.routing_version_id AND v.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Công đoạn routing không cùng phạm vi dữ liệu';
  END IF;
  IF NEW.cost_center_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cost_centers c WHERE c.id = NEW.cost_center_id AND c.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Cost center không cùng phạm vi dữ liệu';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.guard_routing_version_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN RAISE EXCEPTION 'Không được xóa phiên bản routing đã duyệt'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'DRAFT' AND current_setting('app.routing_transition', true) <> 'on' THEN
    RAISE EXCEPTION 'Không được chỉnh sửa phiên bản routing đã duyệt';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND current_setting('app.routing_transition', true) <> 'on' THEN
    RAISE EXCEPTION 'Trạng thái routing chỉ được thay đổi qua nghiệp vụ duyệt';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.guard_routing_operation_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id uuid; v_status text;
BEGIN
  v_id := CASE WHEN TG_OP='DELETE' THEN OLD.routing_version_id ELSE NEW.routing_version_id END;
  SELECT status INTO v_status FROM public.routing_versions WHERE id = v_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Không tìm thấy phiên bản routing'; END IF;
  IF v_status <> 'DRAFT' THEN RAISE EXCEPTION 'Không được chỉnh sửa công đoạn của phiên bản routing đã duyệt'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE OR REPLACE FUNCTION public.validate_production_worker_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.user_id) THEN
    RAISE EXCEPTION 'User của worker không tồn tại';
  END IF;
  IF NEW.primary_cost_center_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cost_centers c WHERE c.id = NEW.primary_cost_center_id AND c.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Cost center của worker không cùng phạm vi dữ liệu';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.validate_production_order_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.product_id AND p.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Sản phẩm lệnh sản xuất không tồn tại hoặc không cùng phạm vi dữ liệu';
  END IF;
  IF NEW.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = NEW.order_id AND o.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Đơn hàng nguồn không cùng phạm vi dữ liệu';
  END IF;
  IF NEW.bom_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bom_versions v WHERE v.id = NEW.bom_version_id AND v.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'BOM version không cùng phạm vi dữ liệu';
  END IF;
  IF NEW.routing_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.routing_versions v WHERE v.id = NEW.routing_version_id AND v.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Routing version không cùng phạm vi dữ liệu';
  END IF;
  IF NEW.cost_center_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cost_centers c WHERE c.id = NEW.cost_center_id AND c.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Cost center không cùng phạm vi dữ liệu';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.guard_production_order_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_old_status text := OLD.status; v_new_status text := NEW.status;
BEGIN
  -- Allow controlled transitions via app.production_transition = 'on'
  IF current_setting('app.production_transition', true) = 'on' THEN RETURN NEW; END IF;
  -- After RELEASE, snapshots are immutable (+ replan fields locked)
  -- P0-2: quantity_planned / planned dates locked after RELEASE; replan only via RPC with app.replan='on'
  IF OLD.status IN ('RELEASED','IN_PROGRESS','COMPLETED','CANCELLED','ON_HOLD') THEN
    IF NEW.bom_version_id IS DISTINCT FROM OLD.bom_version_id
       OR NEW.routing_version_id IS DISTINCT FROM OLD.routing_version_id
       OR NEW.standard_minutes_total IS DISTINCT FROM OLD.standard_minutes_total
       OR NEW.cutting_params_snapshot IS DISTINCT FROM OLD.cutting_params_snapshot
       OR NEW.quantity_planned IS DISTINCT FROM OLD.quantity_planned
       OR NEW.planned_start_date IS DISTINCT FROM OLD.planned_start_date
       OR NEW.planned_end_date IS DISTINCT FROM OLD.planned_end_date THEN
      IF current_setting('app.replan', true) <> 'on' THEN
        RAISE EXCEPTION 'Lệnh đã phát hành, không thể chỉnh sửa kế hoạch/snapshot trực tiếp (dùng nghiệp vụ replan)';
      END IF;
    END IF;
  END IF;
  -- Direct status change must go through RPC
  IF v_new_status IS DISTINCT FROM v_old_status THEN
    RAISE EXCEPTION 'Trạng thái lệnh sản xuất chỉ được thay đổi qua nghiệp vụ';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.guard_pomr_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.production_orders WHERE id = COALESCE(NEW.production_order_id, OLD.production_order_id);
  IF v_status IS NULL THEN RAISE EXCEPTION 'Không tìm thấy lệnh sản xuất'; END IF;
  -- After release, material requirements are immutable via direct REST
  IF v_status IN ('RELEASED','IN_PROGRESS','COMPLETED','ON_HOLD') AND current_setting('app.production_transition', true) <> 'on' THEN
    RAISE EXCEPTION 'Định mức vật tư đã phát hành, không thể sửa trực tiếp';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE OR REPLACE FUNCTION public.guard_poo_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.production_orders WHERE id = COALESCE(NEW.production_order_id, OLD.production_order_id);
  IF v_status IS NULL THEN RAISE EXCEPTION 'Không tìm thấy lệnh sản xuất'; END IF;
  IF v_status IN ('RELEASED','IN_PROGRESS','COMPLETED','ON_HOLD') AND current_setting('app.production_transition', true) <> 'on' THEN
    -- Allow status/quantity updates via RPC but not standard rewriting
    IF NEW.standard_total_minutes IS DISTINCT FROM OLD.standard_total_minutes
       OR NEW.standard_setup_minutes IS DISTINCT FROM OLD.standard_setup_minutes
       OR NEW.standard_run_minutes_per_unit IS DISTINCT FROM OLD.standard_run_minutes_per_unit
       OR NEW.operation_code IS DISTINCT FROM OLD.operation_code THEN
      RAISE EXCEPTION 'Công đoạn đã phát hành, không thể sửa định mức chuẩn trực tiếp';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE OR REPLACE FUNCTION public.guard_operation_log_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Log công đoạn không được sửa/xóa trực tiếp';
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Routing RPCs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_effective_routing_version(p_product_id uuid, p_effective_date date DEFAULT CURRENT_DATE)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_id uuid;
BEGIN
  IF NOT public.has_production_permission('production_view') AND NOT public.has_production_permission('production_manage') AND NOT public.has_bom_permission('bom_view') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem quy trình sản xuất';
  END IF;
  SELECT v.id INTO v_id FROM public.routing_headers h JOIN public.routing_versions v ON v.routing_id = h.id
  WHERE h.tenant_id = v_tenant AND h.product_id = p_product_id AND h.is_active
    AND v.status IN ('APPROVED','SUPERSEDED') AND v.effective_from <= COALESCE(p_effective_date, CURRENT_DATE)
    AND (v.effective_to IS NULL OR v.effective_to >= COALESCE(p_effective_date, CURRENT_DATE))
  ORDER BY v.effective_from DESC, v.version_number DESC LIMIT 1;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_routing_draft(p_product_id uuid, p_code text, p_name text, p_clone_version_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_header public.routing_headers; v_version public.routing_versions; v_source public.routing_versions; v_next integer;
BEGIN
  IF NOT public.has_production_permission('production_manage') THEN RAISE EXCEPTION 'Bạn không có quyền quản lý quy trình sản xuất'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id AND tenant_id = v_tenant) THEN RAISE EXCEPTION 'Không tìm thấy sản phẩm'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('routing:'||v_tenant||':'||p_product_id::text,0));
  SELECT * INTO v_header FROM public.routing_headers WHERE tenant_id=v_tenant AND product_id=p_product_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.routing_headers (tenant_id, product_id, code, name, created_by)
    VALUES (v_tenant, p_product_id, btrim(p_code), btrim(p_name), auth.uid()) RETURNING * INTO v_header;
  END IF;
  IF EXISTS (SELECT 1 FROM public.routing_versions WHERE routing_id=v_header.id AND status='DRAFT') THEN
    RAISE EXCEPTION 'Quy trình đang có một phiên bản nháp';
  END IF;
  IF p_clone_version_id IS NOT NULL THEN
    SELECT * INTO v_source FROM public.routing_versions WHERE id=p_clone_version_id AND routing_id=v_header.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Phiên bản routing nguồn không thuộc sản phẩm'; END IF;
  END IF;
  SELECT COALESCE(MAX(version_number),0)+1 INTO v_next FROM public.routing_versions WHERE routing_id=v_header.id;
  INSERT INTO public.routing_versions (tenant_id, routing_id, version_number, status, notes, created_by)
  VALUES (v_tenant, v_header.id, v_next, 'DRAFT', CASE WHEN p_clone_version_id IS NULL THEN NULL ELSE 'Sao chép từ Routing V'||v_source.version_number END, auth.uid())
  RETURNING * INTO v_version;
  IF p_clone_version_id IS NOT NULL THEN
    INSERT INTO public.routing_operations (tenant_id, routing_version_id, operation_code, operation_name, sequence, cost_center_id, standard_minutes_per_unit, setup_minutes, machine_type, labor_skill, quantity_basis, is_optional)
    SELECT tenant_id, v_version.id, operation_code, operation_name, sequence, cost_center_id, standard_minutes_per_unit, setup_minutes, machine_type, labor_skill, quantity_basis, is_optional
    FROM public.routing_operations WHERE routing_version_id=p_clone_version_id ORDER BY sequence;
  END IF;
  RETURN jsonb_build_object('header', to_jsonb(v_header), 'version', to_jsonb(v_version));
END;
$$;

CREATE OR REPLACE FUNCTION public.save_routing_draft(p_version_id uuid, p_effective_from date, p_effective_to date, p_notes text, p_operations jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_version public.routing_versions; v_op jsonb; v_count integer:=0;
BEGIN
  IF NOT public.has_production_permission('production_manage') THEN RAISE EXCEPTION 'Bạn không có quyền chỉnh sửa quy trình'; END IF;
  IF p_operations IS NULL OR jsonb_typeof(p_operations)<>'array' THEN RAISE EXCEPTION 'Danh sách công đoạn không hợp lệ'; END IF;
  SELECT * INTO v_version FROM public.routing_versions WHERE id=p_version_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên bản routing'; END IF;
  IF v_version.status<>'DRAFT' THEN RAISE EXCEPTION 'Chỉ được chỉnh sửa phiên bản routing nháp'; END IF;
  IF p_effective_from IS NOT NULL AND p_effective_to IS NOT NULL AND p_effective_to < p_effective_from THEN RAISE EXCEPTION 'Khoảng hiệu lực routing không hợp lệ'; END IF;
  UPDATE public.routing_versions SET effective_from=p_effective_from, effective_to=p_effective_to, notes=NULLIF(btrim(p_notes),''), updated_at=now() WHERE id=p_version_id;
  DELETE FROM public.routing_operations WHERE routing_version_id=p_version_id;
  FOR v_op IN SELECT value FROM jsonb_array_elements(p_operations) LOOP
    v_count:=v_count+1;
    INSERT INTO public.routing_operations (tenant_id, routing_version_id, operation_code, operation_name, sequence, cost_center_id, standard_minutes_per_unit, setup_minutes, machine_type, labor_skill, quantity_basis, is_optional)
    VALUES (v_tenant, p_version_id, btrim(v_op->>'operation_code'), btrim(v_op->>'operation_name'),
      COALESCE((v_op->>'sequence')::integer, v_count),
      NULLIF(v_op->>'cost_center_id','')::uuid,
      COALESCE(NULLIF(v_op->>'standard_minutes_per_unit','')::numeric, 0),
      COALESCE(NULLIF(v_op->>'setup_minutes','')::numeric, 0),
      NULLIF(btrim(v_op->>'machine_type'),''), NULLIF(btrim(v_op->>'labor_skill'),''),
      COALESCE(NULLIF(v_op->>'quantity_basis',''), 'PER_UNIT'),
      COALESCE((v_op->>'is_optional')::boolean, false));
  END LOOP;
  RETURN jsonb_build_object('id', p_version_id, 'status','DRAFT','operation_count', v_count);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Mã hoặc thứ tự công đoạn bị trùng';
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_routing_version(p_version_id uuid, p_reason text DEFAULT NULL, p_supersede_previous boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_version public.routing_versions; v_prev public.routing_versions; v_after public.routing_versions;
BEGIN
  IF NOT public.has_production_permission('production_release') THEN RAISE EXCEPTION 'Bạn không có quyền duyệt quy trình'; END IF;
  SELECT * INTO v_version FROM public.routing_versions WHERE id=p_version_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên bản routing'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('routing-approve:'||v_version.routing_id::text,0));
  IF v_version.status<>'DRAFT' THEN RAISE EXCEPTION 'Chỉ phiên bản routing nháp mới được duyệt'; END IF;
  IF v_version.effective_from IS NULL THEN RAISE EXCEPTION 'Routing chưa có ngày bắt đầu hiệu lực'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.routing_operations WHERE routing_version_id=v_version.id) THEN RAISE EXCEPTION 'Routing chưa có công đoạn'; END IF;
  SELECT * INTO v_prev FROM public.routing_versions
  WHERE routing_id=v_version.routing_id AND status='APPROVED'
    AND effective_from < v_version.effective_from AND (effective_to IS NULL OR effective_to >= v_version.effective_from)
  ORDER BY effective_from DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF NOT p_supersede_previous THEN RAISE EXCEPTION 'Khoảng hiệu lực routing chồng lấn phiên bản hiện tại'; END IF;
    PERFORM set_config('app.routing_transition','on',true);
    PERFORM set_config('app.cost_suppress_audit','on',true);
    UPDATE public.routing_versions SET status='SUPERSEDED', effective_to=v_version.effective_from-1, updated_at=now() WHERE id=v_prev.id;
    PERFORM set_config('app.cost_suppress_audit','off',true);
    PERFORM public.write_cost_audit('routing_versions', v_prev.id, 'SUPERSEDE', to_jsonb(v_prev), to_jsonb((SELECT x FROM public.routing_versions x WHERE x.id=v_prev.id)), p_reason);
  END IF;
  IF EXISTS (SELECT 1 FROM public.routing_versions v WHERE v.routing_id=v_version.routing_id AND v.id<>v_version.id AND v.status IN ('APPROVED','SUPERSEDED') AND daterange(v.effective_from, COALESCE(v.effective_to,'infinity'::date),'[]') && daterange(v_version.effective_from, COALESCE(v_version.effective_to,'infinity'::date),'[]')) THEN
    RAISE EXCEPTION 'Khoảng hiệu lực routing chồng lấn phiên bản khác';
  END IF;
  PERFORM set_config('app.routing_transition','on',true);
  PERFORM set_config('app.cost_suppress_audit','on',true);
  UPDATE public.routing_versions SET status='APPROVED', approved_by=auth.uid(), approved_at=now(), approval_reason=NULLIF(btrim(p_reason),''), updated_at=now() WHERE id=v_version.id RETURNING * INTO v_after;
  PERFORM set_config('app.cost_suppress_audit','off',true);
  PERFORM public.write_cost_audit('routing_versions', v_after.id, 'APPROVE', to_jsonb(v_version), to_jsonb(v_after), p_reason);
  PERFORM set_config('app.routing_transition','off',true);
  RETURN to_jsonb(v_after);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Production worker RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_production_worker(p_employee_code text, p_display_name text, p_worker_type text DEFAULT 'GENERIC', p_user_id uuid DEFAULT NULL, p_primary_cost_center_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_row public.production_workers;
BEGIN
  IF NOT public.has_production_permission('production_worker_manage') AND NOT public.has_production_permission('production_manage') THEN RAISE EXCEPTION 'Bạn không có quyền quản lý công nhân'; END IF;
  IF p_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'User không tồn tại'; END IF;
  IF p_primary_cost_center_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cost_centers WHERE id=p_primary_cost_center_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'Cost center không cùng phạm vi dữ liệu'; END IF;
  INSERT INTO public.production_workers (tenant_id, user_id, employee_code, display_name, primary_cost_center_id, worker_type, created_by)
  VALUES (v_tenant, p_user_id, btrim(p_employee_code), btrim(p_display_name), p_primary_cost_center_id, COALESCE(p_worker_type,'GENERIC'), auth.uid())
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Mã công nhân đã tồn tại';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Production order lifecycle
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_production_order(
  p_product_id uuid, p_quantity numeric, p_source_type text DEFAULT 'MANUAL',
  p_order_id uuid DEFAULT NULL, p_planned_start_date date DEFAULT NULL,
  p_planned_end_date date DEFAULT NULL, p_cost_center_id uuid DEFAULT NULL,
  p_material_issue_tolerance_percent numeric DEFAULT 5
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_po public.production_orders; v_num text; v_batch text;
BEGIN
  IF NOT public.has_production_permission('production_manage') THEN RAISE EXCEPTION 'Bạn không có quyền tạo lệnh sản xuất'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Số lượng kế hoạch phải lớn hơn 0'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id=p_product_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'Không tìm thấy sản phẩm'; END IF;
  IF p_order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orders WHERE id=p_order_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'Đơn hàng nguồn không cùng phạm vi dữ liệu'; END IF;
  IF p_cost_center_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cost_centers WHERE id=p_cost_center_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'Cost center không cùng phạm vi dữ liệu'; END IF;
  IF p_planned_start_date IS NOT NULL AND p_planned_end_date IS NOT NULL AND p_planned_end_date < p_planned_start_date THEN RAISE EXCEPTION 'Ngày kế hoạch không hợp lệ'; END IF;
  v_num := public.generate_production_order_number();
  v_batch := v_num;
  INSERT INTO public.production_orders (tenant_id, production_order_number, production_batch_number, product_id, quantity_planned, status, source_type, source_id, order_id, cost_center_id, planned_start_date, planned_end_date, material_issue_tolerance_percent, created_by)
  VALUES (v_tenant, v_num, v_batch, p_product_id, p_quantity, 'DRAFT', COALESCE(p_source_type,'MANUAL'), p_order_id, p_order_id, p_cost_center_id, p_planned_start_date, p_planned_end_date, COALESCE(p_material_issue_tolerance_percent,5), auth.uid())
  RETURNING * INTO v_po;
  PERFORM public.write_cost_audit('production_orders', v_po.id, 'CREATE', NULL::jsonb, to_jsonb(v_po), NULL);
  RETURN to_jsonb(v_po);
END;
$$;

-- Release — the central atomic snapshot engine
CREATE OR REPLACE FUNCTION public.release_production_order(p_production_order_id uuid, p_effective_date date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_po public.production_orders;
  v_bom_id uuid; v_routing_id uuid;
  v_bom_version public.bom_versions;
  v_routing_version public.routing_versions;
  v_std_req jsonb; v_item jsonb;
  v_total_minutes numeric(18,2) := 0;
  v_op record;
  v_material_count integer := 0;
  v_operation_count integer := 0;
BEGIN
  IF NOT public.has_production_permission('production_release') THEN RAISE EXCEPTION 'Bạn không có quyền phát hành lệnh sản xuất'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('prod-release:'||p_production_order_id::text,0));
  SELECT * INTO v_po FROM public.production_orders WHERE id=p_production_order_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lệnh sản xuất'; END IF;
  -- Idempotent: already RELEASED -> return same
  IF v_po.status IN ('RELEASED','IN_PROGRESS','COMPLETED','ON_HOLD') THEN
    RETURN jsonb_build_object('id', v_po.id, 'production_order_number', v_po.production_order_number, 'status', v_po.status, 'reused', true);
  END IF;
  IF v_po.status NOT IN ('DRAFT','PLANNED') THEN RAISE EXCEPTION 'Chỉ lệnh nháp/kế hoạch mới được phát hành'; END IF;

  -- Resolve BOM
  v_bom_id := public.resolve_effective_bom_version(v_po.product_id, COALESCE(p_effective_date, CURRENT_DATE));
  IF v_bom_id IS NULL THEN RAISE EXCEPTION 'Sản phẩm chưa có định mức được duyệt'; END IF;
  SELECT * INTO v_bom_version FROM public.bom_versions WHERE id=v_bom_id;
  -- Resolve Routing
  v_routing_id := public.resolve_effective_routing_version(v_po.product_id, COALESCE(p_effective_date, CURRENT_DATE));
  IF v_routing_id IS NULL THEN RAISE EXCEPTION 'Sản phẩm chưa có quy trình sản xuất được duyệt'; END IF;
  SELECT * INTO v_routing_version FROM public.routing_versions WHERE id=v_routing_id;

  -- Calculate standard material requirements (this also validates cutting engine, units, etc. — it never creates movements)
  v_std_req := public.calculate_standard_material_requirements(v_po.product_id, v_po.quantity_planned, COALESCE(p_effective_date, CURRENT_DATE), v_bom_id, false, NULL, false);

  -- Persist snapshots atomically (bypass RLS guards via app.production_transition)
  PERFORM set_config('app.production_transition','on',true);
  PERFORM set_config('app.cost_suppress_audit','on',true);

  -- Update PO with snapshots
  UPDATE public.production_orders SET
    bom_version_id = v_bom_id,
    routing_version_id = v_routing_id,
    cutting_params_snapshot = jsonb_build_object('effective_date', COALESCE(p_effective_date,CURRENT_DATE), 'bom_version_id', v_bom_id, 'routing_version_id', v_routing_id),
    status = 'RELEASED',
    released_by = auth.uid(),
    released_at = now(),
    actual_start_at = COALESCE(actual_start_at, now()),
    updated_at = now()
  WHERE id = v_po.id;

  -- Snapshot material requirements (grouped by Sprint 3 output)
  DELETE FROM public.production_order_material_requirements WHERE production_order_id = v_po.id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_std_req->'materials') LOOP
    INSERT INTO public.production_order_material_requirements (
      tenant_id, production_order_id, inventory_item_id, bom_version_id, requirement_method,
      standard_quantity, planned_quantity, waste_quantity_standard, unit,
      standard_unit_cost_snapshot, standard_material_cost_preview,
      cutting_profile_version_id, calculation_details
    ) VALUES (
      v_tenant, v_po.id, (v_item->>'inventory_item_id')::uuid, v_bom_id,
      COALESCE(v_item->>'method','PER_UNIT'),
      (v_item->>'standard_quantity')::numeric, (v_item->>'standard_quantity')::numeric,
      COALESCE((v_item->>'standard_quantity')::numeric - (v_item->>'net_quantity')::numeric, 0),
      v_item->>'unit',
      CASE WHEN (v_item->>'cost_visible')::boolean THEN (v_item->>'average_unit_cost')::numeric ELSE NULL END,
      CASE WHEN (v_item->>'cost_visible')::boolean THEN (v_item->>'estimated_material_cost')::numeric ELSE NULL END,
      NULLIF(v_item->>'cutting_profile_version_id','')::uuid,
      COALESCE(v_item->'calculation_details','{}'::jsonb)
    );
    v_material_count := v_material_count + 1;
  END LOOP;

  -- Snapshot operations
  DELETE FROM public.production_order_operations WHERE production_order_id = v_po.id;
  FOR v_op IN SELECT * FROM public.routing_operations WHERE routing_version_id = v_routing_id ORDER BY sequence LOOP
    INSERT INTO public.production_order_operations (
      tenant_id, production_order_id, sequence, operation_code, operation_name, cost_center_id,
      standard_setup_minutes, standard_run_minutes_per_unit,
      standard_total_minutes, status, is_optional, operation_qr_code
    ) VALUES (
      v_tenant, v_po.id, v_op.sequence, v_op.operation_code, v_op.operation_name, v_op.cost_center_id,
      v_op.setup_minutes, v_op.standard_minutes_per_unit,
      round(v_op.setup_minutes + v_op.standard_minutes_per_unit * v_po.quantity_planned, 4),
      'PENDING',
      v_op.is_optional,
      v_po.production_order_number || '-' || v_op.operation_code
    );
    v_total_minutes := v_total_minutes + v_op.setup_minutes + v_op.standard_minutes_per_unit * v_po.quantity_planned;
    v_operation_count := v_operation_count + 1;
  END LOOP;

  UPDATE public.production_orders SET standard_minutes_total = round(v_total_minutes,2) WHERE id = v_po.id;

  PERFORM set_config('app.cost_suppress_audit','off',true);
  SELECT * INTO v_po FROM public.production_orders WHERE id=p_production_order_id;
  PERFORM public.write_cost_audit('production_orders', v_po.id, 'RELEASE', NULL::jsonb, to_jsonb(v_po), NULL);
  PERFORM set_config('app.production_transition','off',true);

  RETURN jsonb_build_object('id', v_po.id, 'production_order_number', v_po.production_order_number, 'status', v_po.status,
    'bom_version_id', v_po.bom_version_id, 'routing_version_id', v_po.routing_version_id,
    'standard_minutes_total', v_po.standard_minutes_total,
    'material_count', v_material_count, 'operation_count', v_operation_count, 'reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_production_order_status(p_production_order_id uuid, p_target_status text, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_po public.production_orders; v_allowed boolean := false;
BEGIN
  SELECT * INTO v_po FROM public.production_orders WHERE id=p_production_order_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lệnh sản xuất'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('prod-status:'||p_production_order_id::text,0));
  -- Idempotent
  IF v_po.status = p_target_status THEN RETURN to_jsonb(v_po); END IF;
  -- Validate transition matrix
  v_allowed := CASE
    WHEN v_po.status='DRAFT' AND p_target_status IN ('PLANNED','CANCELLED') THEN true
    WHEN v_po.status='PLANNED' AND p_target_status IN ('RELEASED','CANCELLED') THEN true
    WHEN v_po.status='RELEASED' AND p_target_status IN ('IN_PROGRESS','ON_HOLD','CANCELLED') THEN true
    WHEN v_po.status='IN_PROGRESS' AND p_target_status IN ('COMPLETED','ON_HOLD','CANCELLED') THEN true
    WHEN v_po.status='ON_HOLD' AND p_target_status IN ('IN_PROGRESS','CANCELLED') THEN true
    ELSE false END;
  IF NOT v_allowed THEN RAISE EXCEPTION 'Chuyển trạng thái % -> % không được phép', v_po.status, p_target_status; END IF;
  -- Permission checks
  IF p_target_status='CANCELLED' AND NOT public.has_production_permission('production_manage') THEN RAISE EXCEPTION 'Bạn không có quyền hủy lệnh sản xuất'; END IF;
  IF p_target_status='IN_PROGRESS' AND NOT public.has_production_permission('production_operations') AND NOT public.has_production_permission('production_manage') THEN RAISE EXCEPTION 'Bạn không có quyền vận hành lệnh sản xuất'; END IF;
  IF p_target_status='COMPLETED' THEN
    -- Delegate to complete function for full validation; this path should not be used directly
    RAISE EXCEPTION 'Hoàn thành lệnh phải dùng complete_production_order';
  END IF;
  IF p_target_status='RELEASED' THEN RAISE EXCEPTION 'Phát hành lệnh phải dùng release_production_order'; END IF;
  PERFORM set_config('app.production_transition','on',true);
  PERFORM set_config('app.cost_suppress_audit','on',true);
  UPDATE public.production_orders SET status=p_target_status, updated_at=now(),
    actual_start_at = CASE WHEN p_target_status='IN_PROGRESS' AND actual_start_at IS NULL THEN now() ELSE actual_start_at END,
    cancelled_at = CASE WHEN p_target_status='CANCELLED' THEN now() ELSE cancelled_at END,
    cancelled_by = CASE WHEN p_target_status='CANCELLED' THEN auth.uid() ELSE cancelled_by END,
    cancel_reason = CASE WHEN p_target_status='CANCELLED' THEN p_reason ELSE cancel_reason END
  WHERE id=p_production_order_id RETURNING * INTO v_po;
  PERFORM set_config('app.cost_suppress_audit','off',true);
  PERFORM public.write_cost_audit('production_orders', v_po.id, p_target_status, NULL::jsonb, to_jsonb(v_po), p_reason);
  PERFORM set_config('app.production_transition','off',true);
  RETURN to_jsonb(v_po);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Operation execution
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_production_operation(p_operation_id uuid, p_worker_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_op public.production_order_operations; v_po public.production_orders;
BEGIN
  IF NOT public.has_production_permission('production_operations') THEN RAISE EXCEPTION 'Bạn không có quyền vận hành công đoạn'; END IF;
  SELECT * INTO v_op FROM public.production_order_operations WHERE id=p_operation_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy công đoạn'; END IF;
  SELECT * INTO v_po FROM public.production_orders WHERE id=v_op.production_order_id AND tenant_id=v_tenant;
  IF v_po.status NOT IN ('RELEASED','IN_PROGRESS','ON_HOLD') THEN RAISE EXCEPTION 'Lệnh sản xuất chưa sẵn sàng vận hành'; END IF;
  IF v_op.status NOT IN ('PENDING','READY') THEN RAISE EXCEPTION 'Công đoạn không ở trạng thái chờ'; END IF;
  IF p_worker_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.production_workers WHERE id=p_worker_id AND tenant_id=v_tenant AND is_active) THEN RAISE EXCEPTION 'Công nhân không tồn tại hoặc không hoạt động'; END IF;
  -- Sequential guard: previous mandatory operation must be COMPLETED or SKIPPED
  IF EXISTS (SELECT 1 FROM public.production_order_operations prev WHERE prev.production_order_id=v_op.production_order_id AND prev.sequence < v_op.sequence AND prev.status NOT IN ('COMPLETED','SKIPPED') AND prev.is_optional = false) THEN
    RAISE EXCEPTION 'Công đoạn trước chưa hoàn thành';
  END IF;
  PERFORM set_config('app.production_transition','on',true);
  UPDATE public.production_order_operations SET status='IN_PROGRESS', actual_start=now(), updated_at=now() WHERE id=p_operation_id RETURNING * INTO v_op;
  IF v_po.status='RELEASED' THEN
    UPDATE public.production_orders SET status='IN_PROGRESS', actual_start_at=COALESCE(actual_start_at, now()), updated_at=now() WHERE id=v_po.id;
  END IF;
  PERFORM set_config('app.production_transition','off',true);
  INSERT INTO public.production_operation_logs (tenant_id, production_order_operation_id, event_type, worker_id, started_at, ended_at, created_by)
  VALUES (v_tenant, p_operation_id, 'START', p_worker_id, now(), NULL, auth.uid());
  RETURN to_jsonb(v_op);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_production_operation(p_operation_id uuid, p_quantity_good numeric DEFAULT NULL, p_quantity_scrap numeric DEFAULT 0, p_quantity_rework numeric DEFAULT 0, p_worker_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_op public.production_order_operations; v_po public.production_orders;
BEGIN
  IF NOT public.has_production_permission('production_operations') THEN RAISE EXCEPTION 'Bạn không có quyền hoàn thành công đoạn'; END IF;
  SELECT * INTO v_op FROM public.production_order_operations WHERE id=p_operation_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy công đoạn'; END IF;
  IF v_op.status NOT IN ('IN_PROGRESS','PENDING','READY') THEN RAISE EXCEPTION 'Công đoạn không ở trạng thái có thể hoàn thành'; END IF;
  IF p_quantity_good IS NOT NULL AND p_quantity_good < 0 THEN RAISE EXCEPTION 'Số lượng đạt không hợp lệ'; END IF;
  IF p_quantity_scrap < 0 OR p_quantity_rework < 0 THEN RAISE EXCEPTION 'Số lượng lỗi/làm lại không hợp lệ'; END IF;
  IF p_worker_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.production_workers WHERE id=p_worker_id AND tenant_id=v_tenant AND is_active) THEN RAISE EXCEPTION 'Công nhân không tồn tại'; END IF;
  PERFORM set_config('app.production_transition','on',true);
  UPDATE public.production_order_operations SET status='COMPLETED', actual_end=now(), updated_at=now(),
    quantity_good = COALESCE(p_quantity_good, quantity_good),
    quantity_scrap = COALESCE(p_quantity_scrap, quantity_scrap),
    quantity_rework = COALESCE(p_quantity_rework, quantity_rework)
  WHERE id=p_operation_id RETURNING * INTO v_op;
  PERFORM set_config('app.production_transition','off',true);
  INSERT INTO public.production_operation_logs (tenant_id, production_order_operation_id, event_type, worker_id, quantity, started_at, ended_at, created_by)
  VALUES (v_tenant, p_operation_id, 'COMPLETE', p_worker_id, COALESCE(p_quantity_good, v_op.quantity_good), v_op.actual_start, now(), auth.uid());
  -- Record scrap/rework if any
  IF p_quantity_scrap > 0 THEN
    INSERT INTO public.production_scrap_records (tenant_id, production_order_id, production_order_operation_id, quantity, reason_code, created_by)
    VALUES (v_tenant, v_op.production_order_id, p_operation_id, p_quantity_scrap, 'OPERATION_SCRAP', auth.uid());
  END IF;
  IF p_quantity_rework > 0 THEN
    INSERT INTO public.production_rework_records (tenant_id, production_order_id, from_operation_id, quantity, reason_code, created_by)
    VALUES (v_tenant, v_op.production_order_id, p_operation_id, p_quantity_rework, 'REWORK', auth.uid());
  END IF;
  RETURN to_jsonb(v_op);
END;
$$;

CREATE OR REPLACE FUNCTION public.log_production_operation(
  p_operation_id uuid, p_event_type text, p_worker_id uuid DEFAULT NULL,
  p_quantity numeric DEFAULT NULL, p_reason_code text DEFAULT NULL,
  p_started_at timestamptz DEFAULT NULL, p_ended_at timestamptz DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_op public.production_order_operations; v_log public.production_operation_logs;
BEGIN
  IF NOT public.has_production_permission('production_operations') THEN RAISE EXCEPTION 'Bạn không có quyền ghi log công đoạn'; END IF;
  SELECT * INTO v_op FROM public.production_order_operations WHERE id=p_operation_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy công đoạn'; END IF;
  IF p_event_type NOT IN ('START','PAUSE','RESUME','COMPLETE','QUANTITY_REPORT','SCRAP_REPORT','REWORK') THEN RAISE EXCEPTION 'Loại sự kiện không hợp lệ'; END IF;
  IF p_started_at IS NOT NULL AND p_ended_at IS NOT NULL AND p_ended_at < p_started_at THEN RAISE EXCEPTION 'Thời gian kết thúc phải sau thời gian bắt đầu'; END IF;
  IF p_worker_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.production_workers WHERE id=p_worker_id AND tenant_id=v_tenant AND is_active) THEN RAISE EXCEPTION 'Công nhân không tồn tại'; END IF;
  INSERT INTO public.production_operation_logs (tenant_id, production_order_operation_id, event_type, worker_id, quantity, reason_code, started_at, ended_at, notes, created_by)
  VALUES (v_tenant, p_operation_id, p_event_type, p_worker_id, p_quantity, p_reason_code, COALESCE(p_started_at, now()), p_ended_at, p_notes, auth.uid())
  RETURNING * INTO v_log;
  RETURN to_jsonb(v_log);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. Scrap / Rework explicit helpers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_production_scrap(p_production_order_id uuid, p_quantity numeric, p_reason_code text, p_operation_id uuid DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_row public.production_scrap_records;
BEGIN
  IF NOT public.has_production_permission('production_operations') THEN RAISE EXCEPTION 'Bạn không có quyền ghi lỗi'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.production_orders WHERE id=p_production_order_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'Không tìm thấy lệnh sản xuất'; END IF;
  IF p_operation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.production_order_operations WHERE id=p_operation_id AND production_order_id=p_production_order_id) THEN RAISE EXCEPTION 'Công đoạn không thuộc lệnh sản xuất'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Số lượng lỗi phải lớn hơn 0'; END IF;
  INSERT INTO public.production_scrap_records (tenant_id, production_order_id, production_order_operation_id, quantity, reason_code, notes, created_by)
  VALUES (v_tenant, p_production_order_id, p_operation_id, p_quantity, btrim(p_reason_code), p_notes, auth.uid()) RETURNING * INTO v_row;
  UPDATE public.production_orders SET quantity_scrap = quantity_scrap + p_quantity, updated_at=now() WHERE id=p_production_order_id;
  RETURN to_jsonb(v_row);
END;
$$;
CREATE OR REPLACE FUNCTION public.record_production_rework(p_production_order_id uuid, p_quantity numeric, p_reason_code text, p_from_operation_id uuid DEFAULT NULL, p_target_operation_id uuid DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_row public.production_rework_records;
BEGIN
  IF NOT public.has_production_permission('production_operations') THEN RAISE EXCEPTION 'Bạn không có quyền ghi làm lại'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.production_orders WHERE id=p_production_order_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'Không tìm thấy lệnh sản xuất'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Số lượng làm lại phải lớn hơn 0'; END IF;
  INSERT INTO public.production_rework_records (tenant_id, production_order_id, from_operation_id, target_operation_id, quantity, reason_code, notes, created_by)
  VALUES (v_tenant, p_production_order_id, p_from_operation_id, p_target_operation_id, p_quantity, btrim(p_reason_code), p_notes, auth.uid()) RETURNING * INTO v_row;
  UPDATE public.production_orders SET quantity_rework = quantity_rework + p_quantity, updated_at=now() WHERE id=p_production_order_id;
  RETURN to_jsonb(v_row);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. Complete production order
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_production_order(p_production_order_id uuid, p_quantity_good numeric, p_quantity_scrap numeric DEFAULT 0, p_warehouse_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_po public.production_orders; v_out public.production_outputs;
BEGIN
  IF NOT public.has_production_permission('production_complete') THEN RAISE EXCEPTION 'Bạn không có quyền hoàn thành lệnh sản xuất'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('prod-complete:'||p_production_order_id::text,0));
  SELECT * INTO v_po FROM public.production_orders WHERE id=p_production_order_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lệnh sản xuất'; END IF;
  IF v_po.status = 'COMPLETED' THEN
    SELECT * INTO v_out FROM public.production_outputs WHERE production_order_id=p_production_order_id;
    RETURN jsonb_build_object('id', v_po.id, 'status', v_po.status, 'output', to_jsonb(v_out), 'reused', true);
  END IF;
  IF v_po.status NOT IN ('RELEASED','IN_PROGRESS','ON_HOLD') THEN RAISE EXCEPTION 'Chỉ lệnh đã phát hành/đang thực hiện mới được hoàn thành'; END IF;
  IF p_quantity_good IS NULL OR p_quantity_good < 0 THEN RAISE EXCEPTION 'Số lượng đạt không hợp lệ'; END IF;
  -- Mandatory operations must be completed
  IF EXISTS (SELECT 1 FROM public.production_order_operations o WHERE o.production_order_id=p_production_order_id AND o.is_optional=false AND o.status NOT IN ('COMPLETED','SKIPPED')) THEN
    RAISE EXCEPTION 'Công đoạn bắt buộc chưa hoàn thành';
  END IF;
  -- No DRAFT inventory docs for this PO
  IF EXISTS (SELECT 1 FROM public.inventory_documents d WHERE d.production_order_id=p_production_order_id AND d.status='DRAFT') THEN
    RAISE EXCEPTION 'Còn phiếu vật tư nháp liên quan lệnh sản xuất';
  END IF;
  IF p_warehouse_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id=p_warehouse_id AND tenant_id=v_tenant AND is_active) THEN
    RAISE EXCEPTION 'Kho thành phẩm không tồn tại hoặc không hoạt động';
  END IF;
  PERFORM set_config('app.production_transition','on',true);
  PERFORM set_config('app.cost_suppress_audit','on',true);
  UPDATE public.production_orders SET status='COMPLETED', quantity_good=p_quantity_good, quantity_scrap=COALESCE(p_quantity_scrap, quantity_scrap),
    actual_end_at=now(), completed_by=auth.uid(), completed_at=now(), updated_at=now() WHERE id=p_production_order_id RETURNING * INTO v_po;
  INSERT INTO public.production_outputs (tenant_id, production_order_id, product_id, quantity_good, quantity_scrap, output_date, warehouse_id, valuation_status, created_by)
  VALUES (v_tenant, p_production_order_id, v_po.product_id, p_quantity_good, COALESCE(p_quantity_scrap,0), CURRENT_DATE, p_warehouse_id, 'PENDING_COST', auth.uid())
  ON CONFLICT (production_order_id) DO NOTHING;
  SELECT * INTO v_out FROM public.production_outputs WHERE production_order_id=p_production_order_id;
  PERFORM set_config('app.cost_suppress_audit','off',true);
  PERFORM public.write_cost_audit('production_orders', v_po.id, 'COMPLETE', NULL::jsonb, to_jsonb(v_po), NULL);
  PERFORM set_config('app.production_transition','off',true);
  RETURN jsonb_build_object('id', v_po.id, 'status', v_po.status, 'output', to_jsonb(v_out), 'reused', false);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. Inventory linkage: extend create_inventory_document with production_order_id
-- ─────────────────────────────────────────────────────────────────────────────
-- Replace the original 11-param function with 12-param version (p_production_order_id defaults NULL).
-- All existing callers remain compatible because the new param is optional.
-- We preserve every Sprint 2 validation exactly.
DROP FUNCTION IF EXISTS public.create_inventory_document(text,timestamptz,uuid,uuid,text,text,jsonb,uuid,text,text,text);

CREATE OR REPLACE FUNCTION public.create_inventory_document(
  p_document_type text,
  p_transaction_at timestamptz,
  p_warehouse_id uuid,
  p_to_warehouse_id uuid,
  p_description text,
  p_idempotency_key text,
  p_lines jsonb,
  p_business_transaction_id uuid DEFAULT NULL,
  p_counterparty_name text DEFAULT NULL,
  p_external_reference text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_production_order_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := 'default';
  v_hash text;
  v_existing public.inventory_documents;
  v_doc public.inventory_documents;
  v_line jsonb;
  v_line_number integer := 0;
  v_subtotal numeric(18,2) := 0;
  v_vat numeric(18,2) := 0;
  v_line_subtotal numeric(18,2);
  v_line_vat numeric(18,2);
BEGIN
  IF NOT public.has_cost_permission('inventory_documents') THEN RAISE EXCEPTION 'Bạn không có quyền tạo phiếu kho'; END IF;
  IF p_document_type = 'ADJUSTMENT' AND NOT public.has_cost_permission('inventory_adjustment') THEN RAISE EXCEPTION 'Bạn không có quyền điều chỉnh tồn kho'; END IF;
  IF p_document_type = 'OPENING_BALANCE' AND NOT public.has_cost_permission('inventory_opening') THEN RAISE EXCEPTION 'Bạn không có quyền tạo tồn đầu kỳ'; END IF;
  IF p_document_type NOT IN ('RECEIPT', 'ISSUE', 'RETURN_IN', 'RETURN_OUT', 'TRANSFER', 'ADJUSTMENT', 'OPENING_BALANCE') THEN RAISE EXCEPTION 'Loại phiếu kho không hợp lệ'; END IF;
  IF p_description IS NULL OR length(btrim(p_description)) < 3 THEN RAISE EXCEPTION 'Nội dung phiếu kho là bắt buộc'; END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) < 8 THEN RAISE EXCEPTION 'Khóa chống trùng không hợp lệ'; END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'Phiếu kho phải có ít nhất một dòng'; END IF;
  IF NOT public.inventory_warehouse_accessible(p_warehouse_id, v_tenant) THEN RAISE EXCEPTION 'Bạn không có quyền sử dụng kho đã chọn'; END IF;
  IF p_to_warehouse_id IS NOT NULL AND NOT public.inventory_warehouse_accessible(p_to_warehouse_id, v_tenant) THEN RAISE EXCEPTION 'Bạn không có quyền sử dụng kho nhận'; END IF;
  -- Production order linkage validation
  IF p_production_order_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.production_orders WHERE id=p_production_order_id AND tenant_id=v_tenant) THEN
      RAISE EXCEPTION 'Lệnh sản xuất không tồn tại hoặc không cùng phạm vi dữ liệu';
    END IF;
  END IF;
  -- P0-1: RETURN_IN phải reference source movement thuộc đúng production_order_id
  IF p_document_type = 'RETURN_IN' AND p_production_order_id IS NOT NULL THEN
    FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
    LOOP
      DECLARE v_src_po uuid;
      BEGIN
        SELECT d.production_order_id INTO v_src_po
        FROM public.inventory_movements m
        JOIN public.inventory_documents d ON d.id = m.document_id
        WHERE m.id = NULLIF(v_line ->> 'source_movement_id', '')::uuid;
        IF v_src_po IS DISTINCT FROM p_production_order_id THEN
          RAISE EXCEPTION 'Movement nguồn trả lại không thuộc lệnh sản xuất này (lệch production_order_id)';
        END IF;
      END;
    END LOOP;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) line
    GROUP BY line ->> 'inventory_item_id', COALESCE(line ->> 'location_id', ''), COALESCE(line ->> 'to_location_id', '')
    HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Một vật tư/vị trí chỉ được xuất hiện một lần trong phiếu'; END IF;
  v_hash := md5(jsonb_build_object(
    'type', p_document_type, 'transaction_at', p_transaction_at, 'warehouse', p_warehouse_id,
    'to_warehouse', p_to_warehouse_id, 'description', btrim(p_description),
    'business_transaction', p_business_transaction_id, 'counterparty', p_counterparty_name,
    'external_reference', p_external_reference, 'reason', p_reason, 'production_order', p_production_order_id, 'lines', p_lines
  )::text);
  PERFORM pg_advisory_xact_lock(hashtextextended('inventory-document-create:' || v_tenant || ':' || p_idempotency_key, 0));
  SELECT * INTO v_existing FROM public.inventory_documents WHERE tenant_id = v_tenant AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.idempotency_keys k
      WHERE k.tenant_id = v_tenant AND k.operation_type = 'CREATE_INVENTORY_DOCUMENT'
        AND k.business_key = p_idempotency_key AND k.payload_hash = v_hash
    ) THEN RAISE EXCEPTION 'Khóa chống trùng đã được dùng với dữ liệu khác'; END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'document_number', v_existing.document_number, 'status', v_existing.status, 'reused', true);
  END IF;
  INSERT INTO public.idempotency_keys (tenant_id, operation_type, business_key, payload_hash, actor_id)
  VALUES (v_tenant, 'CREATE_INVENTORY_DOCUMENT', p_idempotency_key, v_hash, auth.uid());

  INSERT INTO public.inventory_documents (
    tenant_id, manager_id, document_number, document_type, transaction_at,
    warehouse_id, to_warehouse_id, business_transaction_id, production_order_id, description,
    counterparty_name_snapshot, external_reference, reason, idempotency_key, created_by
  ) VALUES (
    v_tenant, public.current_cost_manager_id(), public.next_inventory_document_number(v_tenant, p_transaction_at),
    p_document_type, COALESCE(p_transaction_at, now()), p_warehouse_id, p_to_warehouse_id,
    p_business_transaction_id, p_production_order_id, btrim(p_description), NULLIF(btrim(p_counterparty_name), ''),
    NULLIF(btrim(p_external_reference), ''), NULLIF(btrim(p_reason), ''), p_idempotency_key, auth.uid()
  ) RETURNING * INTO v_doc;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_number := v_line_number + 1;
    INSERT INTO public.inventory_document_lines (
      tenant_id, document_id, line_number, inventory_item_id, location_id,
      to_location_id, description, quantity, unit, input_unit_cost, vat_rate,
      adjustment_direction, source_movement_id, cost_center_id, cost_object_id
    ) VALUES (
      v_tenant, v_doc.id, v_line_number, (v_line ->> 'inventory_item_id')::uuid,
      NULLIF(v_line ->> 'location_id', '')::uuid, NULLIF(v_line ->> 'to_location_id', '')::uuid,
      NULLIF(btrim(v_line ->> 'description'), ''), (v_line ->> 'quantity')::numeric,
      v_line ->> 'unit', NULLIF(v_line ->> 'input_unit_cost', '')::numeric,
      COALESCE(NULLIF(v_line ->> 'vat_rate', '')::numeric, 0),
      NULLIF(v_line ->> 'adjustment_direction', ''), NULLIF(v_line ->> 'source_movement_id', '')::uuid,
      NULLIF(v_line ->> 'cost_center_id', '')::uuid, NULLIF(v_line ->> 'cost_object_id', '')::uuid
    ) RETURNING input_subtotal, vat_amount INTO v_line_subtotal, v_line_vat;
    v_subtotal := v_subtotal + v_line_subtotal;
    v_vat := v_vat + v_line_vat;
  END LOOP;
  PERFORM set_config('app.inventory_recalculate', 'on', true);
  UPDATE public.inventory_documents
     SET subtotal = v_subtotal, vat_amount = v_vat, total_amount = v_subtotal + v_vat
   WHERE id = v_doc.id RETURNING * INTO v_doc;
  PERFORM set_config('app.inventory_recalculate', 'off', true);
  UPDATE public.idempotency_keys SET status = 'COMPLETED', result_entity_id = v_doc.id, completed_at = now()
   WHERE tenant_id = v_tenant AND operation_type = 'CREATE_INVENTORY_DOCUMENT' AND business_key = p_idempotency_key;
  RETURN jsonb_build_object('id', v_doc.id, 'document_number', v_doc.document_number, 'status', v_doc.status, 'reused', false);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. Variance & shortage views
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.production_order_material_variance AS
SELECT
  r.production_order_id, r.tenant_id, r.inventory_item_id, r.unit,
  r.standard_quantity, r.planned_quantity,
  COALESCE(issued.qty,0) AS issued_quantity,
  COALESCE(ret.qty,0) AS returned_quantity,
  COALESCE(issued.qty,0) - COALESCE(ret.qty,0) AS actual_consumption_quantity,
  (COALESCE(issued.qty,0) - COALESCE(ret.qty,0)) - r.standard_quantity AS quantity_variance,
  COALESCE(issued.value,0) - COALESCE(ret.value,0) AS actual_material_cost,
  b.quantity_on_hand AS current_stock
FROM public.production_order_material_requirements r
LEFT JOIN (
  SELECT d.production_order_id, l.inventory_item_id, sum(abs(m.value_delta)) AS value, sum(abs(m.quantity_delta)) AS qty
  FROM public.inventory_movements m
  JOIN public.inventory_document_lines l ON l.id=m.document_line_id
  JOIN public.inventory_documents d ON d.id=m.document_id
  WHERE d.status='CONFIRMED' AND m.movement_kind IN ('ISSUE','TRANSFER_OUT','ADJUSTMENT_OUT')
  GROUP BY d.production_order_id, l.inventory_item_id
) issued ON issued.production_order_id=r.production_order_id AND issued.inventory_item_id=r.inventory_item_id
LEFT JOIN (
  SELECT d.production_order_id, l.inventory_item_id, sum(abs(m.value_delta)) AS value, sum(abs(m.quantity_delta)) AS qty
  FROM public.inventory_movements m
  JOIN public.inventory_document_lines l ON l.id=m.document_line_id
  JOIN public.inventory_documents d ON d.id=m.document_id
  WHERE d.status='CONFIRMED' AND m.movement_kind IN ('RETURN_IN')
  GROUP BY d.production_order_id, l.inventory_item_id
) ret ON ret.production_order_id=r.production_order_id AND ret.inventory_item_id=r.inventory_item_id
LEFT JOIN public.inventory_balances b ON b.tenant_id=r.tenant_id AND b.inventory_item_id=r.inventory_item_id
  -- shortage preview aggregates across warehouses for simplicity; per-warehouse shortage is via RPC
;

CREATE OR REPLACE FUNCTION public.get_production_order_variance(p_production_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_po public.production_orders; v_result jsonb;
  v_cost_visible boolean := public.has_cost_permission('inventory_cost_view');
BEGIN
  IF NOT public.has_production_permission('production_view') THEN RAISE EXCEPTION 'Bạn không có quyền xem lệnh sản xuất'; END IF;
  SELECT * INTO v_po FROM public.production_orders WHERE id=p_production_order_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lệnh sản xuất'; END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'inventory_item_id', v.inventory_item_id, 'unit', v.unit,
    'standard_quantity', v.standard_quantity, 'planned_quantity', v.planned_quantity,
    'issued_quantity', v.issued_quantity, 'returned_quantity', v.returned_quantity,
    'actual_consumption_quantity', v.actual_consumption_quantity,
    'quantity_variance', v.quantity_variance,
    'actual_material_cost', CASE WHEN v_cost_visible THEN v.actual_material_cost ELSE NULL END,
    'cost_visible', v_cost_visible,
    'current_stock', v.current_stock,
    'shortage', GREATEST(v.planned_quantity - COALESCE(v.current_stock,0) - v.issued_quantity, 0)
  ) ORDER BY v.inventory_item_id) INTO v_result
  FROM public.production_order_material_variance v WHERE v.production_order_id=p_production_order_id;
  RETURN jsonb_build_object('production_order_id', p_production_order_id, 'materials', COALESCE(v_result,'[]'::jsonb), 'cost_visible', v_cost_visible);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_production_labor_variance(p_production_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_po public.production_orders;
  v_std numeric; v_actual numeric;
BEGIN
  IF NOT public.has_production_permission('production_view') THEN RAISE EXCEPTION 'Bạn không có quyền xem lệnh sản xuất'; END IF;
  SELECT * INTO v_po FROM public.production_orders WHERE id=p_production_order_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lệnh sản xuất'; END IF;
  SELECT COALESCE(sum(standard_total_minutes),0) INTO v_std FROM public.production_order_operations WHERE production_order_id=p_production_order_id;
  SELECT COALESCE(sum(duration_minutes),0) INTO v_actual FROM public.production_operation_logs l
    JOIN public.production_order_operations o ON o.id=l.production_order_operation_id
    WHERE o.production_order_id=p_production_order_id AND l.event_type IN ('COMPLETE','QUANTITY_REPORT') AND l.duration_minutes IS NOT NULL;
  -- Also sum direct operation actual time from logs START->COMPLETE pairs: use duration_minutes where available
  -- Fallback: sum of operation actual duration from logs with ended_at
  RETURN jsonb_build_object(
    'production_order_id', p_production_order_id,
    'standard_minutes', v_std,
    'actual_minutes', v_actual,
    'variance_minutes', v_actual - v_std,
    'efficiency_percent', CASE WHEN v_actual > 0 THEN round(v_std / v_actual * 100, 2) ELSE NULL END
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. Triggers
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS routing_headers_updated_at ON public.routing_headers;
CREATE TRIGGER routing_headers_updated_at BEFORE UPDATE ON public.routing_headers FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS routing_headers_scope ON public.routing_headers;
CREATE TRIGGER routing_headers_scope BEFORE INSERT OR UPDATE ON public.routing_headers FOR EACH ROW EXECUTE FUNCTION public.validate_routing_header_scope();
DROP TRIGGER IF EXISTS routing_versions_updated_at ON public.routing_versions;
CREATE TRIGGER routing_versions_updated_at BEFORE UPDATE ON public.routing_versions FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS routing_versions_scope ON public.routing_versions;
CREATE TRIGGER routing_versions_scope BEFORE INSERT OR UPDATE ON public.routing_versions FOR EACH ROW EXECUTE FUNCTION public.validate_routing_version_scope();
DROP TRIGGER IF EXISTS routing_versions_guard ON public.routing_versions;
CREATE TRIGGER routing_versions_guard BEFORE UPDATE OR DELETE ON public.routing_versions FOR EACH ROW EXECUTE FUNCTION public.guard_routing_version_mutation();
DROP TRIGGER IF EXISTS routing_operations_updated_at ON public.routing_operations;
CREATE TRIGGER routing_operations_updated_at BEFORE UPDATE ON public.routing_operations FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS routing_operations_scope ON public.routing_operations;
CREATE TRIGGER routing_operations_scope BEFORE INSERT OR UPDATE ON public.routing_operations FOR EACH ROW EXECUTE FUNCTION public.validate_routing_operation_scope();
DROP TRIGGER IF EXISTS routing_operations_guard ON public.routing_operations;
CREATE TRIGGER routing_operations_guard BEFORE INSERT OR UPDATE OR DELETE ON public.routing_operations FOR EACH ROW EXECUTE FUNCTION public.guard_routing_operation_mutation();
DROP TRIGGER IF EXISTS production_workers_updated_at ON public.production_workers;
CREATE TRIGGER production_workers_updated_at BEFORE UPDATE ON public.production_workers FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS production_workers_scope ON public.production_workers;
CREATE TRIGGER production_workers_scope BEFORE INSERT OR UPDATE ON public.production_workers FOR EACH ROW EXECUTE FUNCTION public.validate_production_worker_scope();
DROP TRIGGER IF EXISTS production_orders_updated_at ON public.production_orders;
CREATE TRIGGER production_orders_updated_at BEFORE UPDATE ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS production_orders_scope ON public.production_orders;
CREATE TRIGGER production_orders_scope BEFORE INSERT OR UPDATE ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.validate_production_order_scope();
DROP TRIGGER IF EXISTS production_orders_guard ON public.production_orders;
CREATE TRIGGER production_orders_guard BEFORE UPDATE OR DELETE ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.guard_production_order_mutation();
DROP TRIGGER IF EXISTS pomr_guard ON public.production_order_material_requirements;
CREATE TRIGGER pomr_guard BEFORE INSERT OR UPDATE OR DELETE ON public.production_order_material_requirements FOR EACH ROW EXECUTE FUNCTION public.guard_pomr_mutation();
DROP TRIGGER IF EXISTS poo_guard ON public.production_order_operations;
CREATE TRIGGER poo_guard BEFORE INSERT OR UPDATE OR DELETE ON public.production_order_operations FOR EACH ROW EXECUTE FUNCTION public.guard_poo_mutation();
DROP TRIGGER IF EXISTS poo_updated_at ON public.production_order_operations;
CREATE TRIGGER poo_updated_at BEFORE UPDATE ON public.production_order_operations FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS operation_log_guard ON public.production_operation_logs;
CREATE TRIGGER operation_log_guard BEFORE UPDATE OR DELETE ON public.production_operation_logs FOR EACH ROW EXECUTE FUNCTION public.guard_operation_log_mutation();

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['routing_headers','routing_versions','routing_operations','production_workers','production_orders','production_order_material_requirements','production_order_operations','production_operation_logs','production_scrap_records','production_rework_records','production_outputs'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%s ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER audit_%s AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_cost_change()', t, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.routing_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_material_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_operation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_scrap_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_rework_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY routing_headers_select ON public.routing_headers FOR SELECT TO authenticated
  USING (tenant_id='default' AND public.has_production_permission('production_view'));
CREATE POLICY routing_versions_select ON public.routing_versions FOR SELECT TO authenticated
  USING (tenant_id='default' AND (status IN ('APPROVED','SUPERSEDED') AND public.has_production_permission('production_view') OR public.has_production_permission('production_manage') OR public.has_production_permission('production_release')));
CREATE POLICY routing_operations_select ON public.routing_operations FOR SELECT TO authenticated
  USING (tenant_id='default' AND EXISTS (SELECT 1 FROM public.routing_versions v WHERE v.id=routing_version_id AND v.tenant_id=tenant_id AND (v.status IN ('APPROVED','SUPERSEDED') AND public.has_production_permission('production_view') OR public.has_production_permission('production_manage') OR public.has_production_permission('production_release'))));
CREATE POLICY production_workers_select ON public.production_workers FOR SELECT TO authenticated
  USING (tenant_id='default' AND public.has_production_permission('production_view'));
CREATE POLICY production_orders_select ON public.production_orders FOR SELECT TO authenticated
  USING (tenant_id='default' AND public.has_production_permission('production_view'));
CREATE POLICY pomr_select ON public.production_order_material_requirements FOR SELECT TO authenticated
  USING (tenant_id='default' AND public.has_production_permission('production_view'));
CREATE POLICY poo_select ON public.production_order_operations FOR SELECT TO authenticated
  USING (tenant_id='default' AND public.has_production_permission('production_view'));
CREATE POLICY pol_select ON public.production_operation_logs FOR SELECT TO authenticated
  USING (tenant_id='default' AND public.has_production_permission('production_view'));
CREATE POLICY scrap_select ON public.production_scrap_records FOR SELECT TO authenticated
  USING (tenant_id='default' AND public.has_production_permission('production_view'));
CREATE POLICY rework_select ON public.production_rework_records FOR SELECT TO authenticated
  USING (tenant_id='default' AND public.has_production_permission('production_view'));
CREATE POLICY outputs_select ON public.production_outputs FOR SELECT TO authenticated
  USING (tenant_id='default' AND public.has_production_permission('production_view'));

GRANT SELECT ON public.routing_headers, public.routing_versions, public.routing_operations,
  public.production_workers, public.production_orders, public.production_order_material_requirements,
  public.production_order_operations, public.production_operation_logs,
  public.production_scrap_records, public.production_rework_records, public.production_outputs,
  public.production_order_material_variance
TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.routing_headers, public.routing_versions, public.routing_operations,
  public.production_workers, public.production_orders, public.production_order_material_requirements,
  public.production_order_operations, public.production_operation_logs,
  public.production_scrap_records, public.production_rework_records, public.production_outputs
FROM authenticated;

REVOKE ALL ON FUNCTION public.has_production_permission(text), public.generate_production_order_number(),
  public.resolve_effective_routing_version(uuid,date),
  public.create_routing_draft(uuid,text,text,uuid), public.save_routing_draft(uuid,date,date,text,jsonb), public.approve_routing_version(uuid,text,boolean),
  public.create_production_worker(text,text,text,uuid,uuid),
  public.create_production_order(uuid,numeric,text,uuid,date,date,uuid,numeric),
  public.release_production_order(uuid,date), public.transition_production_order_status(uuid,text,text),
  public.start_production_operation(uuid,uuid), public.complete_production_operation(uuid,numeric,numeric,numeric,uuid),
  public.log_production_operation(uuid,text,uuid,numeric,text,timestamptz,timestamptz,text),
  public.record_production_scrap(uuid,numeric,text,uuid,text), public.record_production_rework(uuid,numeric,text,uuid,uuid,text),
  public.complete_production_order(uuid,numeric,numeric,uuid),
  public.create_inventory_document(text,timestamptz,uuid,uuid,text,text,jsonb,uuid,text,text,text,uuid),
  public.get_production_order_variance(uuid), public.get_production_labor_variance(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_production_permission(text), public.generate_production_order_number(),
  public.resolve_effective_routing_version(uuid,date),
  public.create_routing_draft(uuid,text,text,uuid), public.save_routing_draft(uuid,date,date,text,jsonb), public.approve_routing_version(uuid,text,boolean),
  public.create_production_worker(text,text,text,uuid,uuid),
  public.create_production_order(uuid,numeric,text,uuid,date,date,uuid,numeric),
  public.release_production_order(uuid,date), public.transition_production_order_status(uuid,text,text),
  public.start_production_operation(uuid,uuid), public.complete_production_operation(uuid,numeric,numeric,numeric,uuid),
  public.log_production_operation(uuid,text,uuid,numeric,text,timestamptz,timestamptz,text),
  public.record_production_scrap(uuid,numeric,text,uuid,text), public.record_production_rework(uuid,numeric,text,uuid,uuid,text),
  public.complete_production_order(uuid,numeric,numeric,uuid),
  public.create_inventory_document(text,timestamptz,uuid,uuid,text,text,jsonb,uuid,text,text,text,uuid),
  public.get_production_order_variance(uuid), public.get_production_labor_variance(uuid)
TO authenticated;

REVOKE ALL ON FUNCTION public.validate_routing_header_scope(), public.validate_routing_version_scope(), public.validate_routing_operation_scope(),
  public.guard_routing_version_mutation(), public.guard_routing_operation_mutation(),
  public.validate_production_worker_scope(), public.validate_production_order_scope(),
  public.guard_production_order_mutation(), public.guard_pomr_mutation(), public.guard_poo_mutation(), public.guard_operation_log_mutation()
FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.release_production_order(uuid,date) IS 'Atomic release: snapshots BOM+cutting+routing into production order. Immutable after release.';
COMMENT ON FUNCTION public.complete_production_order(uuid,numeric,numeric,uuid) IS 'Atomic complete with mandatory operation and draft inventory checks. Idempotent on second call.';
COMMENT ON VIEW public.production_order_material_variance IS 'Actual = issued - returned from inventory_movements ledger. No hand-entered actual consumption.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 19. Validate inventory production_order_id scope
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_inventory_production_order_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.production_order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.production_orders p WHERE p.id=NEW.production_order_id AND p.tenant_id=NEW.tenant_id) THEN
    RAISE EXCEPTION 'Lệnh sản xuất không cùng phạm vi dữ liệu';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS inventory_documents_production_order_scope ON public.inventory_documents;
CREATE TRIGGER inventory_documents_production_order_scope BEFORE INSERT OR UPDATE ON public.inventory_documents FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_production_order_scope();
REVOKE ALL ON FUNCTION public.validate_inventory_production_order_scope() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 20. P1-2: list_inventory_documents now also returns production_order_id/number.
-- Additive replacement: same permission/manager-scope rules as Sprint 2.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.list_inventory_documents(integer);
CREATE OR REPLACE FUNCTION public.list_inventory_documents(p_limit integer DEFAULT 300)
RETURNS TABLE(
  id uuid, document_number text, document_type text, status text, transaction_at timestamptz,
  warehouse_id uuid, warehouse_name text, to_warehouse_id uuid, to_warehouse_name text,
  description text, counterparty_name text, external_reference text,
  subtotal numeric, vat_amount numeric, total_amount numeric,
  created_by uuid, confirmed_at timestamptz, voided_at timestamptz, void_reason text,
  production_order_id uuid, production_order_number text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_can_cost boolean;
BEGIN
  IF NOT public.has_cost_permission('inventory_view') THEN RAISE EXCEPTION 'Bạn không có quyền xem phiếu kho'; END IF;
  v_can_cost := public.has_cost_permission('inventory_cost_view');
  RETURN QUERY
  SELECT d.id, d.document_number, d.document_type, d.status, d.transaction_at,
         d.warehouse_id, w.name, d.to_warehouse_id, tw.name, d.description,
         d.counterparty_name_snapshot, d.external_reference,
         CASE WHEN v_can_cost THEN d.subtotal ELSE NULL END,
         CASE WHEN v_can_cost THEN d.vat_amount ELSE NULL END,
         CASE WHEN v_can_cost THEN d.total_amount ELSE NULL END,
         d.created_by, d.confirmed_at, d.voided_at, d.void_reason,
         d.production_order_id, po.production_order_number
  FROM public.inventory_documents d
  LEFT JOIN public.warehouses w ON w.id = d.warehouse_id
  LEFT JOIN public.warehouses tw ON tw.id = d.to_warehouse_id
  LEFT JOIN public.production_orders po ON po.id = d.production_order_id AND po.tenant_id = d.tenant_id
  WHERE d.tenant_id = 'default'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR d.manager_id = public.current_cost_manager_id() OR d.manager_id IS NULL)
  ORDER BY d.transaction_at DESC, d.created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 300), 1), 1000);
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_inventory_documents(integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 21. P1-2 helper: list released production orders for inventory issue/return picker.
-- Only RELEASED and later statuses are eligible material targets.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_production_orders_for_issue()
RETURNS TABLE(id uuid, production_order_number text, product_id uuid, product_name text, status text, quantity_planned numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_cost_permission('inventory_view') AND NOT public.has_production_permission('production_view') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem lệnh sản xuất';
  END IF;
  RETURN QUERY
  SELECT po.id, po.production_order_number, po.product_id, p.name, po.status, po.quantity_planned
  FROM public.production_orders po
  JOIN public.products p ON p.id = po.product_id AND p.tenant_id = po.tenant_id
  WHERE po.tenant_id = 'default'
    AND po.status IN ('RELEASED','IN_PROGRESS','ON_HOLD')
  ORDER BY po.created_at DESC LIMIT 100;
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_production_orders_for_issue() TO authenticated;
