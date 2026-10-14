-- Keep rejected attendance/overtime facts out of operational caps and closure
-- checks. Rejected facts remain immutable history and can be resubmitted through
-- the workflow; they must not block a corrected entry or a leave classification.

BEGIN;

CREATE OR REPLACE FUNCTION public.factory_attendance_fact_is_active(p_record_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.factory_attendance_records f
    WHERE f.id = p_record_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.factory_attendance_reversals r
        WHERE r.tenant_id = f.tenant_id
          AND r.attendance_record_id = f.id
      )
      AND public.current_factory_attendance_status(f.id) <> 'REJECTED'
  );
$$;

CREATE OR REPLACE FUNCTION public.factory_overtime_record_is_active(p_record_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.factory_overtime_records o
    WHERE o.id = p_record_id
      AND public.current_factory_overtime_status(o.id) <> 'REJECTED'
  );
$$;

-- Rejected time-clock rows no longer reserve an interval for a corrected row.
CREATE OR REPLACE FUNCTION public.validate_factory_attendance_invariants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_status text;
BEGIN
  SELECT e.status
  INTO v_day_status
  FROM public.factory_attendance_day_status_events e
  WHERE e.tenant_id = NEW.tenant_id
    AND e.worker_id = NEW.worker_id
    AND e.work_date = NEW.work_date
  ORDER BY e.event_sequence DESC
  LIMIT 1;

  IF v_day_status IN ('ABSENT', 'PAID_LEAVE', 'UNPAID_LEAVE', 'OFF') THEN
    RAISE EXCEPTION 'Ngày đã được đánh dấu %, hãy cập nhật trạng thái thành Có mặt trước khi ghi công', v_day_status;
  END IF;

  IF NEW.attendance_method = 'HOUR'
     AND NEW.check_in_time IS NOT NULL
     AND NEW.check_out_time IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.factory_attendance_records f
       WHERE f.tenant_id = NEW.tenant_id
         AND f.worker_id = NEW.worker_id
         AND f.work_date = NEW.work_date
         AND f.id IS DISTINCT FROM NEW.id
         AND f.attendance_method = 'HOUR'
         AND f.check_in_time IS NOT NULL
         AND f.check_out_time IS NOT NULL
         AND public.factory_attendance_fact_is_active(f.id)
         AND f.check_in_time < NEW.check_out_time
         AND NEW.check_in_time < f.check_out_time
     ) THEN
    RAISE EXCEPTION 'Khoảng giờ chấm công bị trùng với một ca khác trong cùng ngày';
  END IF;

  RETURN NEW;
END;
$$;

-- Overtime is a work fact too. It must not be recorded behind an explicit
-- absence/leave/off classification, while HOLIDAY remains a valid work day.
CREATE OR REPLACE FUNCTION public.validate_factory_overtime_day_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_status text;
BEGIN
  SELECT e.status
  INTO v_day_status
  FROM public.factory_attendance_day_status_events e
  WHERE e.tenant_id = NEW.tenant_id
    AND e.worker_id = NEW.worker_id
    AND e.work_date = NEW.work_date
  ORDER BY e.event_sequence DESC
  LIMIT 1;

  IF v_day_status IN ('ABSENT', 'PAID_LEAVE', 'UNPAID_LEAVE', 'OFF') THEN
    RAISE EXCEPTION 'Ngày đã được đánh dấu %, không thể ghi tăng ca', v_day_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS factory_attendance_overtime_day_status
  ON public.factory_overtime_records;
CREATE TRIGGER factory_attendance_overtime_day_status
BEFORE INSERT ON public.factory_overtime_records
FOR EACH ROW EXECUTE FUNCTION public.validate_factory_overtime_day_status();

-- Replace the two cap-checking RPCs without changing their public signatures.
DO $$
BEGIN
  IF to_regprocedure('public.record_factory_attendance(uuid,text,date,numeric,numeric,numeric,numeric,text,text,text)') IS NOT NULL
     AND to_regprocedure('public.record_factory_attendance_v2(uuid,text,date,numeric,numeric,numeric,numeric,text,text,text)') IS NULL THEN
    ALTER FUNCTION public.record_factory_attendance(uuid, text, date, numeric, numeric, numeric, numeric, text, text, text)
      RENAME TO record_factory_attendance_v2;
  END IF;
  IF to_regprocedure('public.record_factory_hour_attendance(uuid,date,time,time,integer,text,text,text)') IS NOT NULL
     AND to_regprocedure('public.record_factory_hour_attendance_v2(uuid,date,time,time,integer,text,text,text)') IS NULL THEN
    ALTER FUNCTION public.record_factory_hour_attendance(uuid, date, time, time, integer, text, text, text)
      RENAME TO record_factory_hour_attendance_v2;
  END IF;
END;
$$;

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
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
       OR (p_attendance_method = 'DAY'
           AND v_existing.standard_hours_per_day IS DISTINCT FROM p_standard_hours_per_day)
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
      AND public.factory_attendance_fact_is_active(f.id)
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
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF p_break_minutes IS NULL OR p_break_minutes < 0 THEN RAISE EXCEPTION 'Thời gian nghỉ không hợp lệ'; END IF;
  v_gross_minutes := extract(epoch FROM (p_check_out_time - p_check_in_time)) / 60;
  IF p_break_minutes >= v_gross_minutes THEN RAISE EXCEPTION 'Thời gian nghỉ phải nhỏ hơn tổng thời gian có mặt'; END IF;
  v_work_hours := round((v_gross_minutes - p_break_minutes) / 60, 4);
  IF v_work_hours <= 0 OR v_work_hours > 24 THEN RAISE EXCEPTION 'Số giờ làm không hợp lệ'; END IF;

  SELECT * INTO v_worker FROM public.production_workers WHERE id = p_worker_id AND tenant_id = v_tenant AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nhân sự không tồn tại hoặc không hoạt động'; END IF;
  SELECT * INTO v_profile FROM public.worker_compensation_profiles WHERE worker_id = v_worker.id AND tenant_id = v_tenant AND is_active;
  v_compensation_type := COALESCE(v_profile.default_compensation_type, CASE
    WHEN v_worker.worker_type = 'SUPERVISOR' THEN 'MONTHLY_MANAGER'
    WHEN v_worker.worker_type = 'HELPER' THEN 'MONTHLY_HELPER'
    WHEN v_worker.worker_type = 'SEWER' THEN 'PIECE_RATE'
    ELSE 'HOURLY'
  END);
  IF v_compensation_type <> 'HOURLY' THEN RAISE EXCEPTION 'Hình thức chấm công không khớp hồ sơ nhân sự'; END IF;
  v_rate := public.resolve_worker_compensation_rate(v_worker.id, v_compensation_type, p_work_date);
  v_amount := round(v_rate.hourly_rate * v_work_hours, 2);

  PERFORM pg_advisory_xact_lock(hashtextextended('factory-attendance:' || v_tenant || ':' || v_key, 0));
  SELECT * INTO v_existing FROM public.factory_attendance_records WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.worker_id <> v_worker.id OR v_existing.attendance_method <> 'HOUR' OR v_existing.work_date <> p_work_date
       OR v_existing.work_hours <> v_work_hours OR v_existing.check_in_time IS DISTINCT FROM p_check_in_time
       OR v_existing.check_out_time IS DISTINCT FROM p_check_out_time OR v_existing.break_minutes <> p_break_minutes
       OR v_existing.activity_name IS DISTINCT FROM v_activity OR v_existing.notes IS DISTINCT FROM v_notes THEN
      RAISE EXCEPTION 'Mã yêu cầu đã được dùng cho dữ liệu chấm công khác';
    END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'reused', true, 'attendance_method', 'HOUR',
      'attendance_value', v_existing.work_hours, 'check_in_time', v_existing.check_in_time,
      'check_out_time', v_existing.check_out_time, 'break_minutes', v_existing.break_minutes,
      'cost_visible', public.has_cost_permission('inventory_cost_view'),
      'calculated_amount', CASE WHEN public.has_cost_permission('inventory_cost_view') THEN v_existing.calculated_amount ELSE NULL END);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('factory-attendance-cap:' || v_tenant || ':' || v_worker.id::text || ':' || p_work_date::text, 0));
  SELECT COALESCE(sum(x.work_hours), 0) INTO v_hour_total
  FROM (
    SELECT f.work_hours
    FROM public.factory_attendance_records f
    WHERE f.tenant_id = v_tenant AND f.worker_id = v_worker.id AND f.work_date = p_work_date
      AND public.factory_attendance_fact_is_active(f.id)
    UNION ALL
    SELECT CASE WHEN f.compensation_type = 'HOURLY' THEN f.minutes / 60.0 ELSE 0 END
    FROM public.production_operation_labor_facts f
    WHERE f.tenant_id = v_tenant AND f.worker_id = v_worker.id AND f.fact_date = p_work_date
      AND NOT EXISTS (SELECT 1 FROM public.production_attendance_reversals r WHERE r.labor_fact_id = f.id AND r.tenant_id = f.tenant_id)
  ) x;
  IF v_hour_total + v_work_hours > 24 THEN RAISE EXCEPTION 'Tổng giờ công trong ngày vượt 24 giờ (đã có %)', v_hour_total; END IF;

  INSERT INTO public.factory_attendance_records (
    tenant_id, worker_id, rate_id, compensation_type, attendance_method, work_date,
    day_units, work_hours, output_quantity, standard_hours_per_day, activity_name,
    check_in_time, check_out_time, break_minutes, rate_amount, calculated_amount,
    cost_classification, is_estimated, formula_basis, idempotency_key, notes, created_by
  ) VALUES (
    v_tenant, v_worker.id, v_rate.id, v_compensation_type, 'HOUR', p_work_date,
    0, v_work_hours, 0, NULL, v_activity, p_check_in_time, p_check_out_time,
    p_break_minutes, v_rate.hourly_rate, v_amount, 'MANUFACTURING_OVERHEAD', v_rate.is_estimated,
    'HOURLY_RATE * ((CHECK_OUT - CHECK_IN - BREAK_MINUTES) / 60)', v_key, v_notes, auth.uid()
  ) RETURNING * INTO v_record;
  PERFORM public.write_cost_audit('factory_attendance_records', v_record.id, 'CREATE', NULL, to_jsonb(v_record), v_notes);
  RETURN jsonb_build_object('id', v_record.id, 'reused', false, 'attendance_method', 'HOUR',
    'attendance_value', v_record.work_hours, 'check_in_time', v_record.check_in_time,
    'check_out_time', v_record.check_out_time, 'break_minutes', v_record.break_minutes,
    'cost_visible', public.has_cost_permission('inventory_cost_view'),
    'calculated_amount', CASE WHEN public.has_cost_permission('inventory_cost_view') THEN v_record.calculated_amount ELSE NULL END);
END;
$$;

REVOKE ALL ON FUNCTION public.factory_attendance_fact_is_active(uuid), public.factory_overtime_record_is_active(uuid),
  public.validate_factory_attendance_invariants(), public.validate_factory_overtime_day_status()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_factory_attendance(uuid,text,date,numeric,numeric,numeric,numeric,text,text,text),
  public.record_factory_hour_attendance(uuid,date,time,time,integer,text,text,text)
TO authenticated;

COMMIT;
