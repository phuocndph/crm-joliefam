-- Store auditable time-clock details for hourly factory attendance.
-- Legacy hourly rows remain valid with only work_hours populated.

ALTER TABLE public.factory_attendance_records
  ADD COLUMN IF NOT EXISTS check_in_time time,
  ADD COLUMN IF NOT EXISTS check_out_time time,
  ADD COLUMN IF NOT EXISTS break_minutes integer NOT NULL DEFAULT 0;

ALTER TABLE public.factory_attendance_records
  DROP CONSTRAINT IF EXISTS factory_attendance_time_clock_check;
ALTER TABLE public.factory_attendance_records
  ADD CONSTRAINT factory_attendance_time_clock_check CHECK (
    (check_in_time IS NULL AND check_out_time IS NULL AND break_minutes = 0)
    OR (
      attendance_method = 'HOUR'
      AND check_in_time IS NOT NULL
      AND check_out_time IS NOT NULL
      AND check_out_time > check_in_time
      AND break_minutes >= 0
      AND break_minutes < extract(epoch FROM (check_out_time - check_in_time)) / 60
    )
  );

CREATE OR REPLACE FUNCTION public.record_factory_hour_attendance(
  p_worker_id uuid,
  p_work_date date,
  p_check_in_time time,
  p_check_out_time time,
  p_break_minutes integer DEFAULT 0,
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
  v_gross_minutes numeric(18,4);
  v_work_hours numeric(18,4);
  v_hour_total numeric := 0;
  v_amount numeric(18,2);
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_activity text := NULLIF(btrim(p_activity_name), '');
  v_notes text := NULLIF(btrim(p_notes), '');
BEGIN
  IF NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền chấm công';
  END IF;
  IF v_key IS NULL THEN RAISE EXCEPTION 'Mã yêu cầu chấm công là bắt buộc'; END IF;
  IF p_work_date IS NULL OR p_work_date > CURRENT_DATE THEN RAISE EXCEPTION 'Ngày chấm công không hợp lệ'; END IF;
  IF p_check_in_time IS NULL OR p_check_out_time IS NULL OR p_check_out_time <= p_check_in_time THEN
    RAISE EXCEPTION 'Giờ về phải sau giờ đến trong cùng ngày';
  END IF;
  IF p_break_minutes IS NULL OR p_break_minutes < 0 THEN
    RAISE EXCEPTION 'Thời gian nghỉ không hợp lệ';
  END IF;

  v_gross_minutes := extract(epoch FROM (p_check_out_time - p_check_in_time)) / 60;
  IF p_break_minutes >= v_gross_minutes THEN
    RAISE EXCEPTION 'Thời gian nghỉ phải nhỏ hơn tổng thời gian có mặt';
  END IF;
  v_work_hours := round((v_gross_minutes - p_break_minutes) / 60, 4);
  IF v_work_hours <= 0 OR v_work_hours > 24 THEN RAISE EXCEPTION 'Số giờ làm không hợp lệ'; END IF;

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
  IF v_compensation_type <> 'HOURLY' THEN
    RAISE EXCEPTION 'Hình thức chấm công không khớp hồ sơ nhân sự';
  END IF;

  v_rate := public.resolve_worker_compensation_rate(v_worker.id, v_compensation_type, p_work_date);
  v_amount := round(v_rate.hourly_rate * v_work_hours, 2);

  PERFORM pg_advisory_xact_lock(hashtextextended('factory-attendance:' || v_tenant || ':' || v_key, 0));
  SELECT * INTO v_existing FROM public.factory_attendance_records
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.worker_id <> v_worker.id
       OR v_existing.attendance_method <> 'HOUR'
       OR v_existing.work_date <> p_work_date
       OR v_existing.work_hours <> v_work_hours
       OR v_existing.check_in_time IS DISTINCT FROM p_check_in_time
       OR v_existing.check_out_time IS DISTINCT FROM p_check_out_time
       OR v_existing.break_minutes <> p_break_minutes
       OR v_existing.activity_name IS DISTINCT FROM v_activity
       OR v_existing.notes IS DISTINCT FROM v_notes THEN
      RAISE EXCEPTION 'Mã yêu cầu đã được dùng cho dữ liệu chấm công khác';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id, 'reused', true, 'attendance_method', 'HOUR',
      'attendance_value', v_existing.work_hours,
      'check_in_time', v_existing.check_in_time,
      'check_out_time', v_existing.check_out_time,
      'break_minutes', v_existing.break_minutes,
      'cost_visible', public.has_cost_permission('inventory_cost_view'),
      'calculated_amount', CASE WHEN public.has_cost_permission('inventory_cost_view') THEN v_existing.calculated_amount ELSE NULL END
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('factory-attendance-cap:' || v_tenant || ':' || v_worker.id::text || ':' || p_work_date::text, 0));
  SELECT COALESCE(sum(x.work_hours), 0)
  INTO v_hour_total
  FROM (
    SELECT f.work_hours
    FROM public.factory_attendance_records f
    WHERE f.tenant_id = v_tenant AND f.worker_id = v_worker.id AND f.work_date = p_work_date
      AND NOT EXISTS (
        SELECT 1 FROM public.factory_attendance_reversals r
        WHERE r.attendance_record_id = f.id AND r.tenant_id = f.tenant_id
      )
    UNION ALL
    SELECT CASE WHEN f.compensation_type = 'HOURLY' THEN f.minutes / 60.0 ELSE 0 END
    FROM public.production_operation_labor_facts f
    WHERE f.tenant_id = v_tenant AND f.worker_id = v_worker.id AND f.fact_date = p_work_date
      AND NOT EXISTS (
        SELECT 1 FROM public.production_attendance_reversals r
        WHERE r.labor_fact_id = f.id AND r.tenant_id = f.tenant_id
      )
  ) x;
  IF v_hour_total + v_work_hours > 24 THEN
    RAISE EXCEPTION 'Tổng giờ công trong ngày vượt 24 giờ (đã có %)', v_hour_total;
  END IF;

  INSERT INTO public.factory_attendance_records (
    tenant_id, worker_id, rate_id, compensation_type, attendance_method, work_date,
    day_units, work_hours, output_quantity, standard_hours_per_day, activity_name,
    check_in_time, check_out_time, break_minutes,
    rate_amount, calculated_amount, cost_classification, is_estimated, formula_basis,
    idempotency_key, notes, created_by
  ) VALUES (
    v_tenant, v_worker.id, v_rate.id, v_compensation_type, 'HOUR', p_work_date,
    0, v_work_hours, 0, NULL, v_activity,
    p_check_in_time, p_check_out_time, p_break_minutes,
    v_rate.hourly_rate, v_amount, 'MANUFACTURING_OVERHEAD', v_rate.is_estimated,
    'HOURLY_RATE * ((CHECK_OUT - CHECK_IN - BREAK_MINUTES) / 60)',
    v_key, v_notes, auth.uid()
  ) RETURNING * INTO v_record;

  PERFORM public.write_cost_audit('factory_attendance_records', v_record.id, 'CREATE', NULL, to_jsonb(v_record), v_notes);
  RETURN jsonb_build_object(
    'id', v_record.id, 'reused', false, 'attendance_method', 'HOUR',
    'attendance_value', v_record.work_hours,
    'check_in_time', v_record.check_in_time,
    'check_out_time', v_record.check_out_time,
    'break_minutes', v_record.break_minutes,
    'cost_visible', public.has_cost_permission('inventory_cost_view'),
    'calculated_amount', CASE WHEN public.has_cost_permission('inventory_cost_view') THEN v_record.calculated_amount ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_factory_attendance_month_v2(
  p_month_start date, p_include_reversed boolean DEFAULT false
)
RETURNS TABLE (
  id uuid, source_type text, production_order_id uuid, production_order_number text,
  production_order_operation_id uuid, operation_code text, operation_name text,
  worker_id uuid, employee_code text, worker_name text, worker_type text,
  attendance_method text, work_date date, day_units numeric, work_hours numeric,
  check_in_time time, check_out_time time, break_minutes integer,
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
      f.work_date, NULLIF(f.day_units, 0), NULLIF(f.work_hours, 0),
      f.check_in_time, f.check_out_time, f.break_minutes,
      NULLIF(f.output_quantity, 0), f.activity_name,
      CASE WHEN v_cost_visible THEN f.rate_amount ELSE NULL END,
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
      NULL::time, NULL::time, 0,
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

REVOKE ALL ON FUNCTION public.record_factory_hour_attendance(uuid,date,time,time,integer,text,text,text),
  public.list_factory_attendance_month_v2(date,boolean)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_factory_hour_attendance(uuid,date,time,time,integer,text,text,text),
  public.list_factory_attendance_month_v2(date,boolean)
TO authenticated;
