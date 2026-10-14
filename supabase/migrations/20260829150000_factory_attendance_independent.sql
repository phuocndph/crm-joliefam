-- Factory-wide attendance independent from production orders.
-- Existing production attendance remains immutable and is exposed as legacy
-- history in the factory month view. New records do not require an order.

CREATE TABLE IF NOT EXISTS public.factory_attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  worker_id uuid NOT NULL REFERENCES public.production_workers(id) ON DELETE RESTRICT,
  rate_id uuid NOT NULL REFERENCES public.worker_compensation_rates(id) ON DELETE RESTRICT,
  compensation_type text NOT NULL CHECK (compensation_type IN ('MONTHLY_MANAGER','MONTHLY_HELPER','PIECE_RATE','HOURLY')),
  attendance_method text NOT NULL CHECK (attendance_method IN ('DAY','HOUR','OUTPUT')),
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  day_units numeric(18,4) NOT NULL DEFAULT 0 CHECK (day_units >= 0 AND day_units <= 2),
  work_hours numeric(18,4) NOT NULL DEFAULT 0 CHECK (work_hours >= 0 AND work_hours <= 24),
  output_quantity numeric(18,4) NOT NULL DEFAULT 0 CHECK (output_quantity >= 0),
  standard_hours_per_day numeric(18,4) CHECK (standard_hours_per_day IS NULL OR (standard_hours_per_day > 0 AND standard_hours_per_day <= 24)),
  activity_name text,
  rate_amount numeric(18,6) NOT NULL CHECK (rate_amount >= 0),
  calculated_amount numeric(18,2) NOT NULL CHECK (calculated_amount >= 0),
  cost_classification text NOT NULL CHECK (cost_classification IN ('DIRECT_LABOR','MANUFACTURING_OVERHEAD')),
  is_estimated boolean NOT NULL DEFAULT false,
  formula_basis text NOT NULL,
  idempotency_key text NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key),
  CHECK (
    (attendance_method = 'DAY' AND day_units > 0 AND work_hours = 0 AND output_quantity = 0 AND standard_hours_per_day IS NOT NULL)
    OR (attendance_method = 'HOUR' AND day_units = 0 AND work_hours > 0 AND output_quantity = 0 AND standard_hours_per_day IS NULL)
    OR (attendance_method = 'OUTPUT' AND day_units = 0 AND work_hours = 0 AND output_quantity > 0 AND standard_hours_per_day IS NULL AND NULLIF(btrim(activity_name), '') IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS factory_attendance_month_idx
  ON public.factory_attendance_records (tenant_id, work_date, worker_id);
CREATE INDEX IF NOT EXISTS factory_attendance_worker_idx
  ON public.factory_attendance_records (tenant_id, worker_id, work_date DESC);

CREATE TABLE IF NOT EXISTS public.factory_attendance_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  attendance_record_id uuid NOT NULL UNIQUE REFERENCES public.factory_attendance_records(id) ON DELETE RESTRICT,
  worker_id uuid NOT NULL REFERENCES public.production_workers(id) ON DELETE RESTRICT,
  work_date date NOT NULL,
  reversed_amount numeric(18,2) NOT NULL CHECK (reversed_amount >= 0),
  reason text NOT NULL CHECK (NULLIF(btrim(reason), '') IS NOT NULL),
  idempotency_key text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS factory_attendance_reversal_month_idx
  ON public.factory_attendance_reversals (tenant_id, work_date, worker_id);

CREATE OR REPLACE FUNCTION public.validate_factory_attendance_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_rate public.worker_compensation_rates;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.production_workers w
    WHERE w.id = NEW.worker_id AND w.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Nhân sự không cùng phạm vi dữ liệu';
  END IF;
  SELECT * INTO v_rate FROM public.worker_compensation_rates
  WHERE id = NEW.rate_id AND worker_id = NEW.worker_id AND tenant_id = NEW.tenant_id;
  IF NOT FOUND OR v_rate.compensation_type <> NEW.compensation_type THEN
    RAISE EXCEPTION 'Mức công không thuộc nhân sự hoặc không đúng hình thức';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS factory_attendance_scope ON public.factory_attendance_records;
CREATE TRIGGER factory_attendance_scope
BEFORE INSERT OR UPDATE ON public.factory_attendance_records
FOR EACH ROW EXECUTE FUNCTION public.validate_factory_attendance_scope();

CREATE OR REPLACE FUNCTION public.validate_factory_attendance_reversal_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_record public.factory_attendance_records;
BEGIN
  SELECT * INTO v_record FROM public.factory_attendance_records
  WHERE id = NEW.attendance_record_id AND tenant_id = NEW.tenant_id;
  IF NOT FOUND OR v_record.worker_id <> NEW.worker_id OR v_record.work_date <> NEW.work_date
     OR v_record.calculated_amount <> NEW.reversed_amount THEN
    RAISE EXCEPTION 'Dữ liệu đảo chấm công không khớp bản ghi gốc';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS factory_attendance_reversal_scope ON public.factory_attendance_reversals;
CREATE TRIGGER factory_attendance_reversal_scope
BEFORE INSERT OR UPDATE ON public.factory_attendance_reversals
FOR EACH ROW EXECUTE FUNCTION public.validate_factory_attendance_reversal_scope();

DROP TRIGGER IF EXISTS factory_attendance_immutable ON public.factory_attendance_records;
CREATE TRIGGER factory_attendance_immutable
BEFORE UPDATE OR DELETE ON public.factory_attendance_records
FOR EACH ROW EXECUTE FUNCTION public.guard_labor_fact_immutable();
DROP TRIGGER IF EXISTS factory_attendance_reversal_immutable ON public.factory_attendance_reversals;
CREATE TRIGGER factory_attendance_reversal_immutable
BEFORE UPDATE OR DELETE ON public.factory_attendance_reversals
FOR EACH ROW EXECUTE FUNCTION public.guard_labor_fact_immutable();

CREATE OR REPLACE FUNCTION public.record_factory_attendance(
  p_worker_id uuid,
  p_attendance_method text,
  p_work_date date DEFAULT CURRENT_DATE,
  p_day_units numeric DEFAULT NULL,
  p_work_hours numeric DEFAULT NULL,
  p_output_quantity numeric DEFAULT NULL,
  p_standard_hours_per_day numeric DEFAULT 8,
  p_activity_name text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_worker public.production_workers;
  v_profile public.worker_compensation_profiles;
  v_rate public.worker_compensation_rates;
  v_existing public.factory_attendance_records;
  v_record public.factory_attendance_records;
  v_compensation_type text;
  v_rate_amount numeric(18,6);
  v_amount numeric(18,2);
  v_day_total numeric := 0;
  v_hour_total numeric := 0;
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_activity text := NULLIF(btrim(p_activity_name), '');
  v_notes text := NULLIF(btrim(p_notes), '');
  v_formula text;
BEGIN
  IF NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền chấm công';
  END IF;
  IF v_key IS NULL THEN RAISE EXCEPTION 'Mã yêu cầu chấm công là bắt buộc'; END IF;
  IF p_work_date IS NULL OR p_work_date > CURRENT_DATE THEN RAISE EXCEPTION 'Ngày chấm công không hợp lệ'; END IF;
  IF p_attendance_method NOT IN ('DAY','HOUR','OUTPUT') THEN RAISE EXCEPTION 'Hình thức chấm công không hợp lệ'; END IF;

  SELECT * INTO v_worker FROM public.production_workers
  WHERE id = p_worker_id AND tenant_id = v_tenant AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nhân sự không tồn tại hoặc không hoạt động'; END IF;

  SELECT * INTO v_profile FROM public.worker_compensation_profiles
  WHERE worker_id = v_worker.id AND tenant_id = v_tenant AND is_active;
  v_compensation_type := COALESCE(v_profile.default_compensation_type, CASE
    WHEN v_worker.worker_type = 'SUPERVISOR' THEN 'MONTHLY_MANAGER'
    WHEN v_worker.worker_type = 'HELPER' THEN 'MONTHLY_HELPER'
    WHEN v_worker.worker_type = 'SEWER' THEN 'PIECE_RATE'
    ELSE 'HOURLY'
  END);
  IF (p_attendance_method = 'DAY' AND v_compensation_type NOT IN ('MONTHLY_MANAGER','MONTHLY_HELPER'))
     OR (p_attendance_method = 'HOUR' AND v_compensation_type <> 'HOURLY')
     OR (p_attendance_method = 'OUTPUT' AND v_compensation_type <> 'PIECE_RATE') THEN
    RAISE EXCEPTION 'Hình thức chấm công không khớp hồ sơ nhân sự';
  END IF;

  v_rate := public.resolve_worker_compensation_rate(v_worker.id, v_compensation_type, p_work_date);
  IF p_attendance_method = 'DAY' THEN
    IF p_day_units IS NULL OR p_day_units <= 0 OR p_day_units > 2
       OR p_standard_hours_per_day IS NULL OR p_standard_hours_per_day <= 0 OR p_standard_hours_per_day > 24 THEN
      RAISE EXCEPTION 'Số ngày công hoặc giờ chuẩn không hợp lệ';
    END IF;
    v_rate_amount := v_rate.monthly_rate;
    v_amount := round(v_rate.monthly_rate * (p_day_units * p_standard_hours_per_day * 60) / v_rate.monthly_productive_minutes, 2);
    v_formula := 'MONTHLY_RATE * ATTENDANCE_MINUTES / MONTHLY_PRODUCTIVE_MINUTES';
  ELSIF p_attendance_method = 'HOUR' THEN
    IF p_work_hours IS NULL OR p_work_hours <= 0 OR p_work_hours > 24 THEN RAISE EXCEPTION 'Số giờ làm không hợp lệ'; END IF;
    v_rate_amount := v_rate.hourly_rate;
    v_amount := round(v_rate.hourly_rate * p_work_hours, 2);
    v_formula := 'HOURLY_RATE * WORK_HOURS';
  ELSE
    IF p_output_quantity IS NULL OR p_output_quantity <= 0 THEN RAISE EXCEPTION 'Sản lượng phải lớn hơn 0'; END IF;
    IF v_activity IS NULL THEN RAISE EXCEPTION 'Công việc hoặc sản phẩm là bắt buộc khi chấm theo sản lượng'; END IF;
    v_rate_amount := v_rate.piece_rate;
    v_amount := round(v_rate.piece_rate * p_output_quantity, 2);
    v_formula := 'PIECE_RATE * OUTPUT_QUANTITY';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('factory-attendance:' || v_tenant || ':' || v_key, 0));
  SELECT * INTO v_existing FROM public.factory_attendance_records
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.worker_id <> v_worker.id OR v_existing.attendance_method <> p_attendance_method
       OR v_existing.work_date <> p_work_date
       OR v_existing.day_units <> COALESCE(p_day_units, 0)
       OR v_existing.work_hours <> COALESCE(p_work_hours, 0)
       OR v_existing.output_quantity <> COALESCE(p_output_quantity, 0)
       OR v_existing.activity_name IS DISTINCT FROM v_activity
       OR v_existing.notes IS DISTINCT FROM v_notes THEN
      RAISE EXCEPTION 'Mã yêu cầu đã được dùng cho dữ liệu chấm công khác';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id, 'reused', true, 'attendance_method', v_existing.attendance_method,
      'attendance_value', CASE v_existing.attendance_method WHEN 'DAY' THEN v_existing.day_units WHEN 'HOUR' THEN v_existing.work_hours ELSE v_existing.output_quantity END,
      'cost_visible', public.has_cost_permission('inventory_cost_view'),
      'calculated_amount', CASE WHEN public.has_cost_permission('inventory_cost_view') THEN v_existing.calculated_amount ELSE NULL END
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('factory-attendance-cap:' || v_tenant || ':' || v_worker.id::text || ':' || p_work_date::text, 0));
  SELECT COALESCE(sum(x.day_units),0), COALESCE(sum(x.work_hours),0)
  INTO v_day_total, v_hour_total
  FROM (
    SELECT f.day_units, f.work_hours
    FROM public.factory_attendance_records f
    WHERE f.tenant_id = v_tenant AND f.worker_id = v_worker.id AND f.work_date = p_work_date
      AND NOT EXISTS (SELECT 1 FROM public.factory_attendance_reversals r WHERE r.attendance_record_id = f.id AND r.tenant_id = f.tenant_id)
    UNION ALL
    SELECT CASE WHEN f.compensation_type IN ('MONTHLY_MANAGER','MONTHLY_HELPER') THEN f.quantity ELSE 0 END,
           CASE WHEN f.compensation_type = 'HOURLY' THEN f.minutes / 60.0 ELSE 0 END
    FROM public.production_operation_labor_facts f
    WHERE f.tenant_id = v_tenant AND f.worker_id = v_worker.id AND f.fact_date = p_work_date
      AND NOT EXISTS (SELECT 1 FROM public.production_attendance_reversals r WHERE r.labor_fact_id = f.id AND r.tenant_id = f.tenant_id)
  ) x;
  IF p_attendance_method = 'DAY' AND v_day_total + p_day_units > 2 THEN
    RAISE EXCEPTION 'Tổng ngày công trong ngày vượt 2 ngày (đã có %)', v_day_total;
  END IF;
  IF p_attendance_method = 'HOUR' AND v_hour_total + p_work_hours > 24 THEN
    RAISE EXCEPTION 'Tổng giờ công trong ngày vượt 24 giờ (đã có %)', v_hour_total;
  END IF;

  INSERT INTO public.factory_attendance_records (
    tenant_id, worker_id, rate_id, compensation_type, attendance_method, work_date,
    day_units, work_hours, output_quantity, standard_hours_per_day, activity_name,
    rate_amount, calculated_amount, cost_classification, is_estimated, formula_basis,
    idempotency_key, notes, created_by
  ) VALUES (
    v_tenant, v_worker.id, v_rate.id, v_compensation_type, p_attendance_method, p_work_date,
    COALESCE(p_day_units,0), COALESCE(p_work_hours,0), COALESCE(p_output_quantity,0),
    CASE WHEN p_attendance_method = 'DAY' THEN p_standard_hours_per_day ELSE NULL END,
    v_activity, v_rate_amount, v_amount,
    CASE WHEN p_attendance_method = 'OUTPUT' THEN 'DIRECT_LABOR' ELSE 'MANUFACTURING_OVERHEAD' END,
    v_rate.is_estimated, v_formula, v_key, v_notes, auth.uid()
  ) RETURNING * INTO v_record;
  PERFORM public.write_cost_audit('factory_attendance_records', v_record.id, 'CREATE', NULL, to_jsonb(v_record), v_notes);
  RETURN jsonb_build_object(
    'id', v_record.id, 'reused', false, 'attendance_method', v_record.attendance_method,
    'attendance_value', CASE v_record.attendance_method WHEN 'DAY' THEN v_record.day_units WHEN 'HOUR' THEN v_record.work_hours ELSE v_record.output_quantity END,
    'cost_visible', public.has_cost_permission('inventory_cost_view'),
    'calculated_amount', CASE WHEN public.has_cost_permission('inventory_cost_view') THEN v_record.calculated_amount ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_factory_attendance(
  p_attendance_record_id uuid, p_reason text, p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_record public.factory_attendance_records;
  v_reversal public.factory_attendance_reversals;
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF NOT public.has_production_permission('production_manage') THEN RAISE EXCEPTION 'Bạn không có quyền đảo bản ghi chấm công'; END IF;
  IF v_key IS NULL OR v_reason IS NULL THEN RAISE EXCEPTION 'Lý do và mã yêu cầu là bắt buộc'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('factory-attendance-reversal:' || v_tenant || ':' || v_key, 0));
  SELECT * INTO v_reversal FROM public.factory_attendance_reversals WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_reversal.attendance_record_id <> p_attendance_record_id OR v_reversal.reason <> v_reason THEN
      RAISE EXCEPTION 'Mã yêu cầu đã được dùng cho dữ liệu đảo khác';
    END IF;
    RETURN jsonb_build_object('id', v_reversal.id, 'attendance_record_id', v_reversal.attendance_record_id, 'reused', true);
  END IF;
  SELECT * INTO v_record FROM public.factory_attendance_records
  WHERE id = p_attendance_record_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bản ghi chấm công không tồn tại'; END IF;
  IF EXISTS (SELECT 1 FROM public.factory_attendance_reversals WHERE tenant_id = v_tenant AND attendance_record_id = v_record.id) THEN
    RAISE EXCEPTION 'Bản ghi chấm công đã được đảo';
  END IF;
  INSERT INTO public.factory_attendance_reversals (
    tenant_id, attendance_record_id, worker_id, work_date, reversed_amount, reason, idempotency_key, created_by
  ) VALUES (
    v_tenant, v_record.id, v_record.worker_id, v_record.work_date, v_record.calculated_amount, v_reason, v_key, auth.uid()
  ) RETURNING * INTO v_reversal;
  PERFORM public.write_cost_audit('factory_attendance_records', v_record.id, 'REVERSE', to_jsonb(v_record), jsonb_build_object('reversal_id',v_reversal.id,'reversed_amount',v_reversal.reversed_amount,'reason',v_reversal.reason), v_reason);
  RETURN jsonb_build_object('id', v_reversal.id, 'attendance_record_id', v_record.id, 'reversed_amount', v_reversal.reversed_amount, 'reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_factory_attendance_month(
  p_month_start date, p_include_reversed boolean DEFAULT false
)
RETURNS TABLE (
  id uuid, source_type text, production_order_id uuid, production_order_number text,
  production_order_operation_id uuid, operation_code text, operation_name text,
  worker_id uuid, employee_code text, worker_name text, worker_type text,
  attendance_method text, work_date date, day_units numeric, work_hours numeric,
  output_quantity numeric, activity_name text, rate_amount numeric, calculated_amount numeric,
  cost_classification text, is_estimated boolean, notes text, created_at timestamptz,
  cost_visible boolean, is_reversed boolean, reversal_reason text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_cost_visible boolean := public.has_cost_permission('inventory_cost_view');
  v_month_end date := ((p_month_start + INTERVAL '1 month')::date - 1);
BEGIN
  IF NOT public.has_production_permission('production_view')
     AND NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem chấm công';
  END IF;
  IF p_month_start IS NULL OR p_month_start <> date_trunc('month', p_month_start)::date THEN
    RAISE EXCEPTION 'Tháng báo cáo không hợp lệ';
  END IF;
  RETURN QUERY
  SELECT * FROM (
    SELECT
      f.id, 'FACTORY'::text, NULL::uuid, NULL::text, NULL::uuid, NULL::text, NULL::text,
      f.worker_id, w.employee_code, w.display_name, w.worker_type, f.attendance_method,
      f.work_date, NULLIF(f.day_units,0), NULLIF(f.work_hours,0), NULLIF(f.output_quantity,0),
      f.activity_name, CASE WHEN v_cost_visible THEN f.rate_amount ELSE NULL END,
      CASE WHEN v_cost_visible THEN f.calculated_amount ELSE NULL END,
      f.cost_classification, f.is_estimated, f.notes, f.created_at, v_cost_visible,
      (r.id IS NOT NULL), r.reason
    FROM public.factory_attendance_records f
    JOIN public.production_workers w ON w.id = f.worker_id AND w.tenant_id = f.tenant_id
    LEFT JOIN public.factory_attendance_reversals r ON r.attendance_record_id = f.id AND r.tenant_id = f.tenant_id
    WHERE f.tenant_id = v_tenant AND f.work_date BETWEEN p_month_start AND v_month_end
      AND (p_include_reversed OR r.id IS NULL)
    UNION ALL
    SELECT
      f.id, 'PRODUCTION_LEGACY'::text, f.production_order_id, po.production_order_number,
      f.production_order_operation_id, o.operation_code, o.operation_name,
      f.worker_id, w.employee_code, w.display_name, w.worker_type,
      CASE WHEN f.compensation_type IN ('MONTHLY_MANAGER','MONTHLY_HELPER') THEN 'DAY'
           WHEN f.compensation_type = 'HOURLY' THEN 'HOUR' ELSE 'OUTPUT' END,
      f.fact_date,
      CASE WHEN f.compensation_type IN ('MONTHLY_MANAGER','MONTHLY_HELPER') THEN f.quantity ELSE NULL END,
      CASE WHEN f.compensation_type = 'HOURLY' THEN f.minutes / 60.0 ELSE NULL END,
      CASE WHEN f.compensation_type = 'PIECE_RATE' THEN f.accepted_quantity ELSE NULL END,
      o.operation_name,
      CASE WHEN v_cost_visible THEN f.rate_amount ELSE NULL END,
      CASE WHEN v_cost_visible THEN f.calculated_amount ELSE NULL END,
      f.cost_classification, f.is_estimated, f.notes, f.created_at, v_cost_visible,
      (r.id IS NOT NULL), r.reason
    FROM public.production_operation_labor_facts f
    JOIN public.production_orders po ON po.id = f.production_order_id AND po.tenant_id = f.tenant_id
    JOIN public.production_order_operations o ON o.id = f.production_order_operation_id AND o.tenant_id = f.tenant_id
    JOIN public.production_workers w ON w.id = f.worker_id AND w.tenant_id = f.tenant_id
    LEFT JOIN public.production_attendance_reversals r ON r.labor_fact_id = f.id AND r.tenant_id = f.tenant_id
    WHERE f.tenant_id = v_tenant AND f.fact_date BETWEEN p_month_start AND v_month_end
      AND (p_include_reversed OR r.id IS NULL)
  ) rows
  ORDER BY rows.work_date DESC, rows.created_at DESC;
END;
$$;

ALTER TABLE public.factory_attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_attendance_reversals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS factory_attendance_records_select ON public.factory_attendance_records;
CREATE POLICY factory_attendance_records_select ON public.factory_attendance_records
FOR SELECT TO authenticated USING (
  tenant_id = 'default' AND (
    public.has_production_permission('production_view')
    OR public.has_production_permission('production_operations')
    OR public.has_production_permission('production_manage')
  )
);
DROP POLICY IF EXISTS factory_attendance_reversals_select ON public.factory_attendance_reversals;
CREATE POLICY factory_attendance_reversals_select ON public.factory_attendance_reversals
FOR SELECT TO authenticated USING (tenant_id = 'default' AND public.has_production_permission('production_manage'));

REVOKE ALL ON public.factory_attendance_records, public.factory_attendance_reversals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_factory_attendance_scope(), public.validate_factory_attendance_reversal_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_factory_attendance(uuid,text,date,numeric,numeric,numeric,numeric,text,text,text),
  public.reverse_factory_attendance(uuid,text,text), public.list_factory_attendance_month(date,boolean)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_factory_attendance(uuid,text,date,numeric,numeric,numeric,numeric,text,text,text),
  public.reverse_factory_attendance(uuid,text,text), public.list_factory_attendance_month(date,boolean)
TO authenticated;
