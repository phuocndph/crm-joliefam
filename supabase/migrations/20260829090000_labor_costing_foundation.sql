-- Sprint 5A: labor costing foundation.
-- Additive only. Payroll settlement, machinery and overhead allocation remain out
-- of scope; monthly labor is classified as manufacturing overhead by default.

CREATE TABLE IF NOT EXISTS public.worker_compensation_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  worker_id uuid NOT NULL REFERENCES public.production_workers(id) ON DELETE RESTRICT,
  default_compensation_type text NOT NULL CHECK (default_compensation_type IN ('MONTHLY_MANAGER','MONTHLY_HELPER','PIECE_RATE','HOURLY')),
  monthly_productive_minutes numeric(18,4) CHECK (monthly_productive_minutes IS NULL OR monthly_productive_minutes > 0),
  currency_code text NOT NULL DEFAULT 'VND' CHECK (currency_code ~ '^[A-Z]{3}$'),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, worker_id)
);

CREATE TABLE IF NOT EXISTS public.worker_compensation_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  worker_id uuid NOT NULL REFERENCES public.production_workers(id) ON DELETE RESTRICT,
  compensation_type text NOT NULL CHECK (compensation_type IN ('MONTHLY_MANAGER','MONTHLY_HELPER','PIECE_RATE','HOURLY')),
  effective_from date NOT NULL,
  effective_to date,
  hourly_rate numeric(18,2) CHECK (hourly_rate IS NULL OR hourly_rate >= 0),
  piece_rate numeric(18,2) CHECK (piece_rate IS NULL OR piece_rate >= 0),
  monthly_rate numeric(18,2) CHECK (monthly_rate IS NULL OR monthly_rate >= 0),
  monthly_productive_minutes numeric(18,4) CHECK (monthly_productive_minutes IS NULL OR monthly_productive_minutes > 0),
  currency_code text NOT NULL DEFAULT 'VND' CHECK (currency_code ~ '^[A-Z]{3}$'),
  unit_basis text NOT NULL DEFAULT 'MINUTE',
  reason text,
  is_estimated boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (
    (compensation_type = 'HOURLY' AND hourly_rate IS NOT NULL AND piece_rate IS NULL AND monthly_rate IS NULL)
    OR (compensation_type = 'PIECE_RATE' AND piece_rate IS NOT NULL AND hourly_rate IS NULL AND monthly_rate IS NULL)
    OR (compensation_type IN ('MONTHLY_MANAGER','MONTHLY_HELPER') AND monthly_rate IS NOT NULL AND hourly_rate IS NULL AND piece_rate IS NULL AND monthly_productive_minutes IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS worker_compensation_rates_lookup_idx
  ON public.worker_compensation_rates (tenant_id, worker_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS public.production_operation_labor_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE RESTRICT,
  production_order_operation_id uuid NOT NULL REFERENCES public.production_order_operations(id) ON DELETE RESTRICT,
  worker_id uuid NOT NULL REFERENCES public.production_workers(id) ON DELETE RESTRICT,
  rate_id uuid NOT NULL REFERENCES public.worker_compensation_rates(id) ON DELETE RESTRICT,
  compensation_type text NOT NULL CHECK (compensation_type IN ('MONTHLY_MANAGER','MONTHLY_HELPER','PIECE_RATE','HOURLY')),
  quantity numeric(18,4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  accepted_quantity numeric(18,4) NOT NULL DEFAULT 0 CHECK (accepted_quantity >= 0),
  minutes numeric(18,4) NOT NULL DEFAULT 0 CHECK (minutes >= 0),
  fact_date date NOT NULL DEFAULT CURRENT_DATE,
  rate_amount numeric(18,6) NOT NULL CHECK (rate_amount >= 0),
  monthly_productive_minutes numeric(18,4),
  calculated_amount numeric(18,2) NOT NULL CHECK (calculated_amount >= 0),
  cost_classification text NOT NULL CHECK (cost_classification IN ('DIRECT_LABOR','MANUFACTURING_OVERHEAD')),
  is_estimated boolean NOT NULL DEFAULT false,
  formula_basis text NOT NULL,
  source_log_id uuid REFERENCES public.production_operation_logs(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS production_labor_facts_order_idx
  ON public.production_operation_labor_facts (tenant_id, production_order_id, fact_date);
CREATE INDEX IF NOT EXISTS production_labor_facts_worker_idx
  ON public.production_operation_labor_facts (tenant_id, worker_id, fact_date);

CREATE TABLE IF NOT EXISTS public.labor_cost_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  labor_fact_id uuid NOT NULL UNIQUE REFERENCES public.production_operation_labor_facts(id) ON DELETE RESTRICT,
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE RESTRICT,
  production_order_operation_id uuid NOT NULL REFERENCES public.production_order_operations(id) ON DELETE RESTRICT,
  worker_id uuid NOT NULL REFERENCES public.production_workers(id) ON DELETE RESTRICT,
  rate_id uuid NOT NULL REFERENCES public.worker_compensation_rates(id) ON DELETE RESTRICT,
  cost_category_id uuid NOT NULL REFERENCES public.cost_categories(id) ON DELETE RESTRICT,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE RESTRICT,
  cost_object_id uuid REFERENCES public.cost_objects(id) ON DELETE RESTRICT,
  compensation_type text NOT NULL CHECK (compensation_type IN ('MONTHLY_MANAGER','MONTHLY_HELPER','PIECE_RATE','HOURLY')),
  quantity numeric(18,4) NOT NULL CHECK (quantity >= 0),
  accepted_quantity numeric(18,4) NOT NULL CHECK (accepted_quantity >= 0),
  minutes numeric(18,4) NOT NULL CHECK (minutes >= 0),
  rate_amount numeric(18,6) NOT NULL CHECK (rate_amount >= 0),
  calculated_amount numeric(18,2) NOT NULL CHECK (calculated_amount >= 0),
  cost_classification text NOT NULL CHECK (cost_classification IN ('DIRECT_LABOR','MANUFACTURING_OVERHEAD')),
  is_estimated boolean NOT NULL DEFAULT false,
  formula_basis text NOT NULL,
  fact_date date NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS labor_cost_entries_order_idx
  ON public.labor_cost_entries (tenant_id, production_order_id, fact_date);

-- Extend the existing cost-object source validator for production orders. The
-- cost-management security migration intentionally rejected this source type
-- until the production module existed; labor entries need a traceable object.
CREATE OR REPLACE FUNCTION public.cost_target_exists_in_tenant(
  p_table_name text, p_target_id uuid, p_tenant_id text
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_exists boolean;
BEGIN
  IF p_table_name NOT IN (
    'products', 'orders', 'customers', 'cost_centers', 'expenses',
    'transactions', 'order_payments', 'finance_data', 'business_transactions',
    'production_orders'
  ) OR to_regclass('public.' || p_table_name) IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1 AND tenant_id = $2)',
    p_table_name
  ) INTO v_exists USING p_target_id, p_tenant_id;
  RETURN COALESCE(v_exists, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_cost_object_source()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_table_name text;
BEGIN
  IF NEW.source_id IS NULL THEN RETURN NEW; END IF;
  v_table_name := CASE NEW.object_type
    WHEN 'PRODUCT' THEN 'products'
    WHEN 'ORDER' THEN 'orders'
    WHEN 'CUSTOMER' THEN 'customers'
    WHEN 'COST_CENTER' THEN 'cost_centers'
    WHEN 'PRODUCTION_ORDER' THEN 'production_orders'
    ELSE NULL
  END;
  IF v_table_name IS NULL THEN
    RAISE EXCEPTION 'Loại đối tượng chi phí này chưa hỗ trợ liên kết source_id';
  END IF;
  IF NOT public.cost_target_exists_in_tenant(v_table_name, NEW.source_id, NEW.tenant_id) THEN
    RAISE EXCEPTION 'Đối tượng nguồn không tồn tại hoặc không cùng phạm vi dữ liệu';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cost_objects_source_scope ON public.cost_objects;
CREATE TRIGGER cost_objects_source_scope
BEFORE INSERT OR UPDATE OF object_type, source_id, tenant_id ON public.cost_objects
FOR EACH ROW EXECUTE FUNCTION public.validate_cost_object_source();

CREATE OR REPLACE FUNCTION public.guard_labor_fact_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Chi phí nhân công đã ghi sổ là bất biến; hãy tạo điều chỉnh đảo ngược';
END;
$$;
DROP TRIGGER IF EXISTS production_labor_facts_immutable ON public.production_operation_labor_facts;
CREATE TRIGGER production_labor_facts_immutable BEFORE UPDATE OR DELETE ON public.production_operation_labor_facts FOR EACH ROW EXECUTE FUNCTION public.guard_labor_fact_immutable();
DROP TRIGGER IF EXISTS labor_cost_entries_immutable ON public.labor_cost_entries;
CREATE TRIGGER labor_cost_entries_immutable BEFORE UPDATE OR DELETE ON public.labor_cost_entries FOR EACH ROW EXECUTE FUNCTION public.guard_labor_fact_immutable();

CREATE OR REPLACE FUNCTION public.validate_worker_compensation_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.production_workers w WHERE w.id = NEW.worker_id AND w.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Công nhân không cùng phạm vi dữ liệu';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS worker_compensation_profiles_scope ON public.worker_compensation_profiles;
CREATE TRIGGER worker_compensation_profiles_scope BEFORE INSERT OR UPDATE ON public.worker_compensation_profiles FOR EACH ROW EXECUTE FUNCTION public.validate_worker_compensation_scope();
DROP TRIGGER IF EXISTS worker_compensation_rates_scope ON public.worker_compensation_rates;
CREATE TRIGGER worker_compensation_rates_scope BEFORE INSERT OR UPDATE ON public.worker_compensation_rates FOR EACH ROW EXECUTE FUNCTION public.validate_worker_compensation_scope();

CREATE OR REPLACE FUNCTION public.reject_worker_rate_overlap()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.worker_compensation_rates r
    WHERE r.tenant_id = NEW.tenant_id AND r.worker_id = NEW.worker_id
      AND r.compensation_type = NEW.compensation_type AND r.id <> NEW.id
      AND daterange(r.effective_from, COALESCE(r.effective_to + 1, 'infinity'::date), '[)')
          && daterange(NEW.effective_from, COALESCE(NEW.effective_to + 1, 'infinity'::date), '[)')
  ) THEN
    RAISE EXCEPTION 'Khoảng hiệu lực mức công bị chồng lấn';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS worker_compensation_rates_overlap ON public.worker_compensation_rates;
CREATE CONSTRAINT TRIGGER worker_compensation_rates_overlap AFTER INSERT OR UPDATE ON public.worker_compensation_rates DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION public.reject_worker_rate_overlap();

CREATE OR REPLACE FUNCTION public.resolve_worker_compensation_rate(p_worker_id uuid, p_compensation_type text, p_fact_date date)
RETURNS public.worker_compensation_rates
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_rate public.worker_compensation_rates;
BEGIN
  IF NOT public.has_cost_permission('inventory_cost_view') AND NOT public.has_production_permission('production_worker_manage') AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem mức công';
  END IF;
  SELECT r.* INTO v_rate FROM public.worker_compensation_rates r
  JOIN public.production_workers w ON w.id = r.worker_id AND w.tenant_id = v_tenant
  WHERE r.worker_id = p_worker_id AND r.tenant_id = v_tenant
    AND r.compensation_type = p_compensation_type
    AND r.effective_from <= p_fact_date
    AND (r.effective_to IS NULL OR r.effective_to >= p_fact_date)
  ORDER BY r.effective_from DESC, r.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chưa có mức công hiệu lực cho công nhân'; END IF;
  RETURN v_rate;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_worker_compensation_profile(
  p_worker_id uuid, p_compensation_type text, p_monthly_productive_minutes numeric DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_row public.worker_compensation_profiles;
BEGIN
  IF NOT public.has_production_permission('production_worker_manage') AND NOT public.has_production_permission('production_manage') THEN RAISE EXCEPTION 'Bạn không có quyền quản lý mức công'; END IF;
  IF p_compensation_type NOT IN ('MONTHLY_MANAGER','MONTHLY_HELPER','PIECE_RATE','HOURLY') THEN RAISE EXCEPTION 'Loại trả công không hợp lệ'; END IF;
  INSERT INTO public.worker_compensation_profiles (tenant_id, worker_id, default_compensation_type, monthly_productive_minutes, created_by)
  VALUES (v_tenant, p_worker_id, p_compensation_type, p_monthly_productive_minutes, auth.uid())
  ON CONFLICT (tenant_id, worker_id) DO UPDATE SET default_compensation_type = EXCLUDED.default_compensation_type, monthly_productive_minutes = EXCLUDED.monthly_productive_minutes, is_active = true, updated_at = now()
  RETURNING * INTO v_row;
  PERFORM public.write_cost_audit('worker_compensation_profiles', v_row.id, 'UPDATE', NULL, to_jsonb(v_row), NULL);
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_worker_compensation_rate(
  p_worker_id uuid, p_compensation_type text, p_effective_from date, p_effective_to date DEFAULT NULL,
  p_hourly_rate numeric DEFAULT NULL, p_piece_rate numeric DEFAULT NULL, p_monthly_rate numeric DEFAULT NULL,
  p_monthly_productive_minutes numeric DEFAULT NULL, p_reason text DEFAULT NULL, p_is_estimated boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_row public.worker_compensation_rates;
BEGIN
  IF NOT public.has_production_permission('production_worker_manage') AND NOT public.has_production_permission('production_manage') THEN RAISE EXCEPTION 'Bạn không có quyền quản lý mức công'; END IF;
  INSERT INTO public.worker_compensation_rates (tenant_id, worker_id, compensation_type, effective_from, effective_to, hourly_rate, piece_rate, monthly_rate, monthly_productive_minutes, reason, is_estimated, created_by)
  VALUES (v_tenant, p_worker_id, p_compensation_type, p_effective_from, p_effective_to, p_hourly_rate, p_piece_rate, p_monthly_rate, p_monthly_productive_minutes, p_reason, p_is_estimated, auth.uid())
  RETURNING * INTO v_row;
  PERFORM public.write_cost_audit('worker_compensation_rates', v_row.id, 'CREATE', NULL, to_jsonb(v_row), p_reason);
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_worker_compensation_rates(p_worker_id uuid DEFAULT NULL)
RETURNS SETOF public.worker_compensation_rates LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r FROM public.worker_compensation_rates r
  WHERE r.tenant_id = public.require_default_tenant() AND (p_worker_id IS NULL OR r.worker_id = p_worker_id)
    AND (public.has_cost_permission('inventory_cost_view') OR public.has_production_permission('production_worker_manage') OR public.has_production_permission('production_manage'))
  ORDER BY r.worker_id, r.effective_from DESC
$$;

CREATE OR REPLACE FUNCTION public.record_production_labor_fact(
  p_production_order_operation_id uuid, p_worker_id uuid, p_quantity numeric DEFAULT 0,
  p_accepted_quantity numeric DEFAULT 0, p_minutes numeric DEFAULT 0, p_fact_date date DEFAULT CURRENT_DATE,
  p_compensation_type text DEFAULT NULL, p_idempotency_key text DEFAULT NULL, p_source_log_id uuid DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant(); v_op public.production_order_operations; v_worker public.production_workers;
  v_profile public.worker_compensation_profiles; v_rate public.worker_compensation_rates; v_type text;
  v_amount numeric(18,2); v_rate_amount numeric(18,6); v_class text; v_formula text; v_fact public.production_operation_labor_facts;
  v_entry public.labor_cost_entries; v_existing_entry public.labor_cost_entries; v_category uuid; v_center uuid; v_object uuid; v_key text := NULLIF(btrim(p_idempotency_key), '');
BEGIN
  IF NOT public.has_production_permission('production_operations') AND NOT public.has_production_permission('production_manage') THEN RAISE EXCEPTION 'Bạn không có quyền ghi nhận nhân công'; END IF;
  IF v_key IS NULL THEN RAISE EXCEPTION 'Idempotency key là bắt buộc'; END IF;
  -- Serialize retries sharing the same business key so concurrent requests
  -- return the original fact instead of racing the unique constraint.
  PERFORM pg_advisory_xact_lock(hashtextextended('labor-fact:' || v_tenant || ':' || v_key, 0));
  SELECT * INTO v_op FROM public.production_order_operations WHERE id = p_production_order_operation_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Công đoạn không tồn tại'; END IF;
  SELECT * INTO v_worker FROM public.production_workers WHERE id = p_worker_id AND tenant_id = v_tenant AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Công nhân không tồn tại hoặc không hoạt động'; END IF;
  IF p_source_log_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_operation_logs l
    WHERE l.id = p_source_log_id AND l.tenant_id = v_tenant
      AND l.production_order_operation_id = v_op.id
  ) THEN
    RAISE EXCEPTION 'Log nhân công không thuộc công đoạn';
  END IF;
  IF EXISTS (SELECT 1 FROM public.production_operation_labor_facts WHERE tenant_id = v_tenant AND idempotency_key = v_key) THEN
    SELECT f.* INTO v_fact
      FROM public.production_operation_labor_facts f
      WHERE f.tenant_id = v_tenant AND f.idempotency_key = v_key;
    SELECT e.* INTO v_existing_entry FROM public.labor_cost_entries e WHERE e.labor_fact_id = v_fact.id;
    RETURN jsonb_build_object('fact', to_jsonb(v_fact), 'entry', to_jsonb(v_existing_entry), 'reused', true);
  END IF;
  IF p_quantity < 0 OR p_accepted_quantity < 0 OR p_minutes < 0 THEN RAISE EXCEPTION 'Số lượng/thời gian không hợp lệ'; END IF;
  v_type := COALESCE((SELECT default_compensation_type FROM public.worker_compensation_profiles WHERE worker_id = v_worker.id AND tenant_id = v_tenant AND is_active), CASE WHEN v_worker.worker_type = 'SUPERVISOR' THEN 'MONTHLY_MANAGER' WHEN v_worker.worker_type = 'HELPER' THEN 'MONTHLY_HELPER' WHEN v_worker.worker_type = 'SEWER' THEN 'PIECE_RATE' ELSE 'HOURLY' END);
  IF p_compensation_type IS NOT NULL AND p_compensation_type <> v_type THEN
    RAISE EXCEPTION 'Loại trả công không khớp hồ sơ công nhân';
  END IF;
  v_rate := public.resolve_worker_compensation_rate(v_worker.id, v_type, p_fact_date);
  IF v_type = 'HOURLY' THEN
    IF p_minutes <= 0 THEN RAISE EXCEPTION 'Nhân công theo giờ cần số phút hợp lệ'; END IF;
    v_rate_amount := v_rate.hourly_rate; v_amount := round(p_minutes / 60.0 * v_rate.hourly_rate, 2); v_class := 'DIRECT_LABOR'; v_formula := format('minutes/60 * hourly_rate = %s/60 * %s', p_minutes, v_rate.hourly_rate);
  ELSIF v_type = 'PIECE_RATE' THEN
    IF p_accepted_quantity <= 0 THEN RAISE EXCEPTION 'Nhân công theo sản phẩm cần số lượng đạt'; END IF;
    v_rate_amount := v_rate.piece_rate; v_amount := round(p_accepted_quantity * v_rate.piece_rate, 2); v_class := 'DIRECT_LABOR'; v_formula := format('accepted_quantity * piece_rate = %s * %s', p_accepted_quantity, v_rate.piece_rate);
  ELSE
    IF p_minutes <= 0 OR v_rate.monthly_productive_minutes IS NULL OR v_rate.monthly_productive_minutes <= 0 THEN RAISE EXCEPTION 'Nhân công tháng cần phút sản xuất và mẫu số tháng'; END IF;
    v_rate_amount := v_rate.monthly_rate; v_amount := round(v_rate.monthly_rate / v_rate.monthly_productive_minutes * p_minutes, 2); v_class := CASE WHEN v_type = 'MONTHLY_HELPER' AND p_production_order_operation_id IS NOT NULL THEN 'DIRECT_LABOR' ELSE 'MANUFACTURING_OVERHEAD' END; v_formula := format('monthly_rate / monthly_productive_minutes * minutes = %s/%s * %s', v_rate.monthly_rate, v_rate.monthly_productive_minutes, p_minutes);
  END IF;
  SELECT id INTO v_category FROM public.cost_categories WHERE tenant_id = v_tenant AND code = CASE
    WHEN v_class = 'DIRECT_LABOR' THEN 'DIRECT_LABOR'
    WHEN v_type = 'MONTHLY_MANAGER' THEN 'FIXED_MANUFACTURING_OVERHEAD'
    ELSE 'VARIABLE_MANUFACTURING_OVERHEAD'
  END;
  IF v_category IS NULL THEN RAISE EXCEPTION 'Chưa cấu hình danh mục chi phí nhân công'; END IF;
  SELECT COALESCE(v_op.cost_center_id, v_worker.primary_cost_center_id) INTO v_center;
  SELECT id INTO v_object FROM public.cost_objects WHERE tenant_id = v_tenant AND object_type = 'PRODUCTION_ORDER' AND source_id = v_op.production_order_id;
  IF v_object IS NULL THEN
    INSERT INTO public.cost_objects (tenant_id, object_type, source_id, display_code, display_name) VALUES (v_tenant, 'PRODUCTION_ORDER', v_op.production_order_id, 'SX-' || left(v_op.production_order_id::text, 8), 'Lệnh sản xuất ' || left(v_op.production_order_id::text, 8)) ON CONFLICT DO NOTHING;
    SELECT id INTO v_object FROM public.cost_objects WHERE tenant_id = v_tenant AND object_type = 'PRODUCTION_ORDER' AND source_id = v_op.production_order_id;
  END IF;
  INSERT INTO public.production_operation_labor_facts (tenant_id, production_order_id, production_order_operation_id, worker_id, rate_id, compensation_type, quantity, accepted_quantity, minutes, fact_date, rate_amount, monthly_productive_minutes, calculated_amount, cost_classification, is_estimated, formula_basis, source_log_id, idempotency_key, notes, created_by)
  VALUES (v_tenant, v_op.production_order_id, v_op.id, v_worker.id, v_rate.id, v_type, p_quantity, p_accepted_quantity, p_minutes, p_fact_date, v_rate_amount, v_rate.monthly_productive_minutes, v_amount, v_class, v_rate.is_estimated, v_formula, p_source_log_id, v_key, p_notes, auth.uid()) RETURNING * INTO v_fact;
  INSERT INTO public.labor_cost_entries (tenant_id, labor_fact_id, production_order_id, production_order_operation_id, worker_id, rate_id, cost_category_id, cost_center_id, cost_object_id, compensation_type, quantity, accepted_quantity, minutes, rate_amount, calculated_amount, cost_classification, is_estimated, formula_basis, fact_date, created_by)
  VALUES (v_tenant, v_fact.id, v_fact.production_order_id, v_fact.production_order_operation_id, v_fact.worker_id, v_fact.rate_id, v_category, v_center, v_object, v_fact.compensation_type, v_fact.quantity, v_fact.accepted_quantity, v_fact.minutes, v_fact.rate_amount, v_fact.calculated_amount, v_fact.cost_classification, v_fact.is_estimated, v_fact.formula_basis, v_fact.fact_date, auth.uid()) RETURNING * INTO v_entry;
  PERFORM public.write_cost_audit('labor_cost_entries', v_entry.id, 'CREATE', NULL, to_jsonb(v_entry), NULL);
  RETURN jsonb_build_object('fact', to_jsonb(v_fact), 'entry', to_jsonb(v_entry), 'reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_production_order_labor_cost(p_production_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_direct numeric(18,2); v_overhead numeric(18,2); v_total numeric(18,2); v_by_worker jsonb; v_by_operation jsonb;
BEGIN
  IF NOT public.has_production_permission('production_view') AND NOT public.has_cost_permission('inventory_cost_view') THEN RAISE EXCEPTION 'Bạn không có quyền xem chi phí nhân công'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.production_orders WHERE id = p_production_order_id AND tenant_id = v_tenant) THEN RAISE EXCEPTION 'Lệnh sản xuất không tồn tại'; END IF;
  SELECT COALESCE(sum(calculated_amount) FILTER (WHERE cost_classification = 'DIRECT_LABOR'),0), COALESCE(sum(calculated_amount) FILTER (WHERE cost_classification = 'MANUFACTURING_OVERHEAD'),0) INTO v_direct, v_overhead FROM public.labor_cost_entries WHERE production_order_id = p_production_order_id AND tenant_id = v_tenant;
  v_total := v_direct + v_overhead;
  IF NOT public.has_cost_permission('inventory_cost_view') THEN
    RETURN jsonb_build_object(
      'production_order_id', p_production_order_id,
      'direct_labor_cost', NULL,
      'manufacturing_overhead_cost', NULL,
      'total_labor_cost', NULL,
      'is_estimated', NULL,
      'cost_visible', false,
      'by_worker', '[]'::jsonb,
      'by_operation', '[]'::jsonb
    );
  END IF;
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_by_worker FROM (SELECT worker_id, max(w.display_name) AS worker_name, sum(calculated_amount)::numeric(18,2) AS amount, bool_or(is_estimated) AS is_estimated FROM public.labor_cost_entries e JOIN public.production_workers w ON w.id=e.worker_id WHERE e.production_order_id=p_production_order_id AND e.tenant_id=v_tenant GROUP BY worker_id ORDER BY worker_name) x;
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_by_operation FROM (SELECT production_order_operation_id AS operation_id, max(o.operation_name) AS operation_name, sum(calculated_amount)::numeric(18,2) AS amount, bool_or(is_estimated) AS is_estimated FROM public.labor_cost_entries e JOIN public.production_order_operations o ON o.id=e.production_order_operation_id WHERE e.production_order_id=p_production_order_id AND e.tenant_id=v_tenant GROUP BY production_order_operation_id ORDER BY min(o.sequence)) x;
  RETURN jsonb_build_object('production_order_id', p_production_order_id, 'direct_labor_cost', v_direct, 'manufacturing_overhead_cost', v_overhead, 'total_labor_cost', v_total, 'is_estimated', EXISTS (SELECT 1 FROM public.labor_cost_entries WHERE production_order_id=p_production_order_id AND tenant_id=v_tenant AND is_estimated), 'cost_visible', true, 'by_worker', v_by_worker, 'by_operation', v_by_operation);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_production_labor_variance(p_production_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_std numeric; v_actual numeric; v_cost jsonb;
BEGIN
  IF NOT public.has_production_permission('production_view') THEN RAISE EXCEPTION 'Bạn không có quyền xem lệnh sản xuất'; END IF;
  SELECT COALESCE(sum(standard_total_minutes),0) INTO v_std FROM public.production_order_operations WHERE production_order_id=p_production_order_id AND tenant_id=v_tenant;
  SELECT COALESCE(sum(l.duration_minutes),0) INTO v_actual FROM public.production_operation_logs l JOIN public.production_order_operations o ON o.id=l.production_order_operation_id WHERE o.production_order_id=p_production_order_id AND l.tenant_id=v_tenant AND l.event_type='COMPLETE';
  v_cost := public.calculate_production_order_labor_cost(p_production_order_id);
  RETURN v_cost || jsonb_build_object('standard_minutes', v_std, 'actual_minutes', v_actual, 'variance_minutes', v_actual-v_std, 'efficiency_percent', CASE WHEN v_actual > 0 THEN round(v_std/v_actual*100,2) ELSE NULL END);
END;
$$;

ALTER TABLE public.worker_compensation_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_compensation_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_operation_labor_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_cost_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY worker_compensation_profiles_select ON public.worker_compensation_profiles FOR SELECT TO authenticated USING (tenant_id='default' AND (public.has_cost_permission('inventory_cost_view') OR public.has_production_permission('production_worker_manage') OR public.has_production_permission('production_manage')));
CREATE POLICY worker_compensation_rates_select ON public.worker_compensation_rates FOR SELECT TO authenticated USING (tenant_id='default' AND (public.has_cost_permission('inventory_cost_view') OR public.has_production_permission('production_worker_manage') OR public.has_production_permission('production_manage')));
CREATE POLICY production_labor_facts_select ON public.production_operation_labor_facts FOR SELECT TO authenticated USING (tenant_id='default' AND (public.has_cost_permission('inventory_cost_view') OR public.has_production_permission('production_worker_manage') OR public.has_production_permission('production_manage')));
CREATE POLICY labor_cost_entries_select ON public.labor_cost_entries FOR SELECT TO authenticated USING (tenant_id='default' AND (public.has_cost_permission('inventory_cost_view') OR public.has_production_permission('production_worker_manage') OR public.has_production_permission('production_manage')));
GRANT SELECT ON public.worker_compensation_profiles, public.worker_compensation_rates, public.production_operation_labor_facts, public.labor_cost_entries TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.worker_compensation_profiles, public.worker_compensation_rates, public.production_operation_labor_facts, public.labor_cost_entries FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_worker_compensation_rate(uuid,text,date), public.list_worker_compensation_rates(uuid), public.calculate_production_order_labor_cost(uuid), public.get_production_labor_variance(uuid), public.upsert_worker_compensation_profile(uuid,text,numeric), public.create_worker_compensation_rate(uuid,text,date,date,numeric,numeric,numeric,numeric,text,boolean), public.record_production_labor_fact(uuid,uuid,numeric,numeric,numeric,date,text,text,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_worker_compensation_rate(uuid,text,date), public.reject_worker_rate_overlap(), public.guard_labor_fact_immutable() FROM PUBLIC, anon, authenticated;
