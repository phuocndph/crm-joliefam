-- Production attendance entry points for the labor-costing foundation.
-- Attendance remains a read/write facade over immutable labor facts and cost entries;
-- it does not introduce a second payroll or costing ledger.

-- The resolver is private (EXECUTE remains revoked from authenticated users), so
-- operators may post attendance without gaining a callable wage-rate endpoint.
CREATE OR REPLACE FUNCTION public.resolve_worker_compensation_rate(
  p_worker_id uuid,
  p_compensation_type text,
  p_fact_date date
)
RETURNS public.worker_compensation_rates
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_rate public.worker_compensation_rates;
BEGIN
  IF NOT public.has_cost_permission('inventory_cost_view')
     AND NOT public.has_production_permission('production_worker_manage')
     AND NOT public.has_production_permission('production_manage')
     AND NOT public.has_production_permission('production_operations') THEN
    RAISE EXCEPTION 'Bạn không có quyền sử dụng mức công';
  END IF;
  SELECT r.* INTO v_rate
  FROM public.worker_compensation_rates r
  JOIN public.production_workers w ON w.id = r.worker_id AND w.tenant_id = v_tenant
  WHERE r.worker_id = p_worker_id
    AND r.tenant_id = v_tenant
    AND r.compensation_type = p_compensation_type
    AND r.effective_from <= p_fact_date
    AND (r.effective_to IS NULL OR r.effective_to >= p_fact_date)
  ORDER BY r.effective_from DESC, r.created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chưa có mức công hiệu lực cho công nhân'; END IF;
  RETURN v_rate;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_worker_compensation_rate(uuid,text,date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.configure_worker_attendance_method(
  p_worker_id uuid,
  p_attendance_method text,
  p_rate_amount numeric,
  p_effective_from date,
  p_effective_to date DEFAULT NULL,
  p_standard_days_per_month numeric DEFAULT 26,
  p_standard_hours_per_day numeric DEFAULT 8,
  p_reason text DEFAULT NULL,
  p_is_estimated boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_worker public.production_workers;
  v_compensation_type text;
  v_monthly_productive_minutes numeric;
  v_previous_rate public.worker_compensation_rates;
  v_previous_rate_before jsonb;
  v_rate jsonb;
  v_profile jsonb;
BEGIN
  IF NOT public.has_production_permission('production_worker_manage')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền quản lý mức công';
  END IF;

  SELECT * INTO v_worker
  FROM public.production_workers
  WHERE id = p_worker_id AND tenant_id = v_tenant AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nhân sự không tồn tại hoặc không hoạt động'; END IF;

  IF p_attendance_method NOT IN ('DAY', 'HOUR', 'OUTPUT') THEN
    RAISE EXCEPTION 'Hình thức chấm công không hợp lệ';
  END IF;
  IF p_rate_amount IS NULL OR p_rate_amount < 0 THEN
    RAISE EXCEPTION 'Mức công không hợp lệ';
  END IF;

  IF p_attendance_method = 'DAY' THEN
    IF p_standard_days_per_month IS NULL OR p_standard_days_per_month <= 0
       OR p_standard_hours_per_day IS NULL OR p_standard_hours_per_day <= 0
       OR p_standard_hours_per_day > 24 THEN
      RAISE EXCEPTION 'Ngày công hoặc số giờ chuẩn không hợp lệ';
    END IF;
    v_compensation_type := CASE
      WHEN v_worker.worker_type = 'SUPERVISOR' THEN 'MONTHLY_MANAGER'
      ELSE 'MONTHLY_HELPER'
    END;
    v_monthly_productive_minutes := p_standard_days_per_month * p_standard_hours_per_day * 60;
  ELSIF p_attendance_method = 'HOUR' THEN
    v_compensation_type := 'HOURLY';
    v_monthly_productive_minutes := NULL;
  ELSE
    v_compensation_type := 'PIECE_RATE';
    v_monthly_productive_minutes := NULL;
  END IF;

  SELECT * INTO v_previous_rate
  FROM public.worker_compensation_rates
  WHERE tenant_id = v_tenant
    AND worker_id = p_worker_id
    AND compensation_type = v_compensation_type
    AND effective_from < p_effective_from
    AND (effective_to IS NULL OR effective_to >= p_effective_from)
  ORDER BY effective_from DESC
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    v_previous_rate_before := to_jsonb(v_previous_rate);
    UPDATE public.worker_compensation_rates
    SET effective_to = p_effective_from - 1
    WHERE id = v_previous_rate.id
    RETURNING * INTO v_previous_rate;
    PERFORM public.write_cost_audit(
      'worker_compensation_rates',
      v_previous_rate.id,
      'UPDATE',
      v_previous_rate_before,
      to_jsonb(v_previous_rate),
      COALESCE(p_reason, 'Kết thúc mức công cũ khi tạo mức mới')
    );
  END IF;

  -- Both calls participate in this RPC transaction. A failure leaves neither a
  -- partial profile change nor a detached effective-dated rate.
  v_rate := public.create_worker_compensation_rate(
    p_worker_id,
    v_compensation_type,
    p_effective_from,
    p_effective_to,
    CASE WHEN v_compensation_type = 'HOURLY' THEN p_rate_amount ELSE NULL END,
    CASE WHEN v_compensation_type = 'PIECE_RATE' THEN p_rate_amount ELSE NULL END,
    CASE WHEN v_compensation_type IN ('MONTHLY_MANAGER', 'MONTHLY_HELPER') THEN p_rate_amount ELSE NULL END,
    v_monthly_productive_minutes,
    p_reason,
    p_is_estimated
  );
  v_profile := public.upsert_worker_compensation_profile(
    p_worker_id,
    v_compensation_type,
    v_monthly_productive_minutes
  );

  RETURN jsonb_build_object(
    'attendance_method', p_attendance_method,
    'profile', v_profile,
    'rate', v_rate
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_production_attendance(
  p_production_order_operation_id uuid,
  p_worker_id uuid,
  p_attendance_method text,
  p_work_date date DEFAULT CURRENT_DATE,
  p_day_units numeric DEFAULT NULL,
  p_work_hours numeric DEFAULT NULL,
  p_output_quantity numeric DEFAULT NULL,
  p_standard_hours_per_day numeric DEFAULT 8,
  p_idempotency_key text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_worker public.production_workers;
  v_operation public.production_order_operations;
  v_order public.production_orders;
  v_compensation_type text;
  v_quantity numeric := 0;
  v_accepted_quantity numeric := 0;
  v_minutes numeric := 0;
  v_result jsonb;
BEGIN
  IF NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền chấm công';
  END IF;

  SELECT * INTO v_operation
  FROM public.production_order_operations
  WHERE id = p_production_order_operation_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Công đoạn không tồn tại'; END IF;
  SELECT * INTO v_order
  FROM public.production_orders
  WHERE id = v_operation.production_order_id AND tenant_id = v_tenant;
  IF v_order.status NOT IN ('RELEASED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD') THEN
    RAISE EXCEPTION 'Lệnh sản xuất chưa ở trạng thái cho phép chấm công';
  END IF;

  SELECT * INTO v_worker
  FROM public.production_workers
  WHERE id = p_worker_id AND tenant_id = v_tenant AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nhân sự không tồn tại hoặc không hoạt động'; END IF;

  v_compensation_type := COALESCE(
    (SELECT default_compensation_type
     FROM public.worker_compensation_profiles
     WHERE worker_id = v_worker.id AND tenant_id = v_tenant AND is_active),
    CASE
      WHEN v_worker.worker_type = 'SUPERVISOR' THEN 'MONTHLY_MANAGER'
      WHEN v_worker.worker_type = 'HELPER' THEN 'MONTHLY_HELPER'
      WHEN v_worker.worker_type = 'SEWER' THEN 'PIECE_RATE'
      ELSE 'HOURLY'
    END
  );

  IF p_attendance_method = 'DAY' THEN
    IF v_compensation_type NOT IN ('MONTHLY_MANAGER', 'MONTHLY_HELPER') THEN
      RAISE EXCEPTION 'Vị trí này chưa được cấu hình chấm công theo ngày';
    END IF;
    IF p_day_units IS NULL OR p_day_units <= 0 OR p_day_units > 2 THEN
      RAISE EXCEPTION 'Số ngày công phải lớn hơn 0 và không vượt quá 2';
    END IF;
    IF p_standard_hours_per_day IS NULL OR p_standard_hours_per_day <= 0 OR p_standard_hours_per_day > 24 THEN
      RAISE EXCEPTION 'Số giờ chuẩn trong ngày không hợp lệ';
    END IF;
    v_quantity := p_day_units;
    v_minutes := p_day_units * p_standard_hours_per_day * 60;
  ELSIF p_attendance_method = 'HOUR' THEN
    IF v_compensation_type <> 'HOURLY' THEN
      RAISE EXCEPTION 'Vị trí này chưa được cấu hình chấm công theo giờ';
    END IF;
    IF p_work_hours IS NULL OR p_work_hours <= 0 OR p_work_hours > 24 THEN
      RAISE EXCEPTION 'Số giờ làm phải lớn hơn 0 và không vượt quá 24';
    END IF;
    v_quantity := p_work_hours;
    v_minutes := p_work_hours * 60;
  ELSIF p_attendance_method = 'OUTPUT' THEN
    IF v_compensation_type <> 'PIECE_RATE' THEN
      RAISE EXCEPTION 'Vị trí này chưa được cấu hình chấm công theo sản lượng';
    END IF;
    IF p_output_quantity IS NULL OR p_output_quantity <= 0 THEN
      RAISE EXCEPTION 'Sản lượng đạt phải lớn hơn 0';
    END IF;
    v_quantity := p_output_quantity;
    v_accepted_quantity := p_output_quantity;
  ELSE
    RAISE EXCEPTION 'Hình thức chấm công không hợp lệ';
  END IF;

  v_result := public.record_production_labor_fact(
    p_production_order_operation_id,
    p_worker_id,
    v_quantity,
    v_accepted_quantity,
    v_minutes,
    p_work_date,
    v_compensation_type,
    p_idempotency_key,
    NULL,
    p_notes
  );

  IF NOT public.has_cost_permission('inventory_cost_view') THEN
    RETURN jsonb_build_object(
      'fact_id', v_result->'fact'->>'id',
      'entry_id', v_result->'entry'->>'id',
      'reused', COALESCE((v_result->>'reused')::boolean, false),
      'attendance_method', p_attendance_method,
      'attendance_value', CASE
        WHEN p_attendance_method = 'DAY' THEN p_day_units
        WHEN p_attendance_method = 'HOUR' THEN p_work_hours
        ELSE p_output_quantity
      END,
      'cost_visible', false
    );
  END IF;

  RETURN v_result || jsonb_build_object(
    'attendance_method', p_attendance_method,
    'attendance_value', CASE
      WHEN p_attendance_method = 'DAY' THEN p_day_units
      WHEN p_attendance_method = 'HOUR' THEN p_work_hours
      ELSE p_output_quantity
    END,
    'cost_visible', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_production_attendance(p_production_order_id uuid)
RETURNS TABLE (
  id uuid,
  production_order_id uuid,
  production_order_operation_id uuid,
  operation_code text,
  operation_name text,
  worker_id uuid,
  employee_code text,
  worker_name text,
  worker_type text,
  attendance_method text,
  work_date date,
  day_units numeric,
  work_hours numeric,
  output_quantity numeric,
  rate_amount numeric,
  calculated_amount numeric,
  cost_classification text,
  is_estimated boolean,
  notes text,
  created_at timestamptz,
  cost_visible boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_cost_visible boolean := public.has_cost_permission('inventory_cost_view');
BEGIN
  IF NOT public.has_production_permission('production_view')
     AND NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem chấm công';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.production_orders po
    WHERE po.id = p_production_order_id AND po.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Lệnh sản xuất không tồn tại';
  END IF;

  RETURN QUERY
  SELECT
    f.id,
    f.production_order_id,
    f.production_order_operation_id,
    o.operation_code,
    o.operation_name,
    f.worker_id,
    w.employee_code,
    w.display_name,
    w.worker_type,
    CASE
      WHEN f.compensation_type IN ('MONTHLY_MANAGER', 'MONTHLY_HELPER') THEN 'DAY'
      WHEN f.compensation_type = 'HOURLY' THEN 'HOUR'
      ELSE 'OUTPUT'
    END,
    f.fact_date,
    CASE WHEN f.compensation_type IN ('MONTHLY_MANAGER', 'MONTHLY_HELPER') THEN f.quantity ELSE NULL END,
    CASE WHEN f.compensation_type = 'HOURLY' THEN f.minutes / 60.0 ELSE NULL END,
    CASE WHEN f.compensation_type = 'PIECE_RATE' THEN f.accepted_quantity ELSE NULL END,
    CASE WHEN v_cost_visible THEN f.rate_amount ELSE NULL END,
    CASE WHEN v_cost_visible THEN f.calculated_amount ELSE NULL END,
    f.cost_classification,
    f.is_estimated,
    f.notes,
    f.created_at,
    v_cost_visible
  FROM public.production_operation_labor_facts f
  JOIN public.production_order_operations o
    ON o.id = f.production_order_operation_id
   AND o.tenant_id = f.tenant_id
  JOIN public.production_workers w
    ON w.id = f.worker_id
   AND w.tenant_id = f.tenant_id
  WHERE f.tenant_id = v_tenant
    AND f.production_order_id = p_production_order_id
  ORDER BY f.fact_date DESC, f.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_worker_attendance_methods()
RETURNS TABLE (
  worker_id uuid,
  attendance_method text,
  compensation_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
BEGIN
  IF NOT public.has_production_permission('production_view')
     AND NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem hình thức chấm công';
  END IF;
  RETURN QUERY
  SELECT
    w.id,
    CASE
      WHEN COALESCE(p.default_compensation_type,
        CASE WHEN w.worker_type='SUPERVISOR' THEN 'MONTHLY_MANAGER' WHEN w.worker_type='HELPER' THEN 'MONTHLY_HELPER' WHEN w.worker_type='SEWER' THEN 'PIECE_RATE' ELSE 'HOURLY' END
      ) IN ('MONTHLY_MANAGER', 'MONTHLY_HELPER') THEN 'DAY'
      WHEN COALESCE(p.default_compensation_type,
        CASE WHEN w.worker_type='SUPERVISOR' THEN 'MONTHLY_MANAGER' WHEN w.worker_type='HELPER' THEN 'MONTHLY_HELPER' WHEN w.worker_type='SEWER' THEN 'PIECE_RATE' ELSE 'HOURLY' END
      ) = 'PIECE_RATE' THEN 'OUTPUT'
      ELSE 'HOUR'
    END,
    COALESCE(p.default_compensation_type,
      CASE WHEN w.worker_type='SUPERVISOR' THEN 'MONTHLY_MANAGER' WHEN w.worker_type='HELPER' THEN 'MONTHLY_HELPER' WHEN w.worker_type='SEWER' THEN 'PIECE_RATE' ELSE 'HOURLY' END
    )
  FROM public.production_workers w
  LEFT JOIN public.worker_compensation_profiles p
    ON p.worker_id = w.id AND p.tenant_id = w.tenant_id AND p.is_active
  WHERE w.tenant_id = v_tenant AND w.is_active
  ORDER BY w.employee_code;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_worker_attendance_method(uuid,text,numeric,date,date,numeric,numeric,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_production_labor_fact(uuid,uuid,numeric,numeric,numeric,date,text,text,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_production_attendance(uuid,uuid,text,date,numeric,numeric,numeric,numeric,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_production_attendance(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_worker_attendance_methods() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configure_worker_attendance_method(uuid,text,numeric,date,date,numeric,numeric,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_production_attendance(uuid,uuid,text,date,numeric,numeric,numeric,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_production_attendance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_worker_attendance_methods() TO authenticated;

COMMENT ON FUNCTION public.record_production_attendance(uuid,uuid,text,date,numeric,numeric,numeric,numeric,text,text) IS
  'Records DAY, HOUR or OUTPUT attendance through immutable labor facts and cost entries.';
