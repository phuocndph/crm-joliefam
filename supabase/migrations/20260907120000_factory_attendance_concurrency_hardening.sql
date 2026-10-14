-- Factory attendance hardening: serialize closure checks with attendance writes
-- and reject a changed standard-hours payload on idempotent day retries.
-- Additive/reversible at the migration level; no existing attendance facts are changed.

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_factory_attendance_open_day()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := COALESCE(NEW.tenant_id, 'default');
BEGIN
  -- Use the same lock key as daily closure. This makes the closure state check
  -- and the attendance insert mutually exclusive for one worker/day.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'factory-attendance-closure:' || v_tenant || ':' || NEW.worker_id::text || ':' || NEW.work_date::text,
    0
  ));
  IF public.current_factory_attendance_closure(NEW.worker_id, NEW.work_date) = 'LEADER_CONFIRMED' THEN
    RAISE EXCEPTION 'Ngày công đã được quản lý chốt; hãy mở lại trước khi ghi bổ sung';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_factory_overtime_open_day()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := COALESCE(NEW.tenant_id, 'default');
BEGIN
  -- Keep overtime and attendance writes behind the same worker/day lock.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'factory-attendance-closure:' || v_tenant || ':' || NEW.worker_id::text || ':' || NEW.work_date::text,
    0
  ));
  IF public.current_factory_attendance_closure(NEW.worker_id, NEW.work_date) = 'LEADER_CONFIRMED' THEN
    RAISE EXCEPTION 'Ngày công đã được quản lý chốt; hãy mở lại trước khi ghi tăng ca';
  END IF;
  RETURN NEW;
END;
$$;

-- The payroll hardening migration already defines the canonical factory
-- attendance function. Wrap it instead of duplicating its business formula so
-- future fixes remain in one implementation. The wrapper only adds the one
-- payload field that the canonical function historically omitted from retry
-- comparison: standard_hours_per_day for DAY attendance.
ALTER FUNCTION public.record_factory_attendance(uuid, text, date, numeric, numeric, numeric, numeric, text, text, text)
  RENAME TO record_factory_attendance_v1;

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
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_existing public.factory_attendance_records;
BEGIN
  IF p_attendance_method = 'DAY' AND v_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('factory-attendance:' || v_tenant || ':' || v_key, 0));
    SELECT * INTO v_existing
    FROM public.factory_attendance_records
    WHERE tenant_id = v_tenant AND idempotency_key = v_key;
    IF FOUND AND v_existing.standard_hours_per_day IS DISTINCT FROM p_standard_hours_per_day THEN
      RAISE EXCEPTION 'Mã yêu cầu đã được dùng cho ngày công có giờ chuẩn khác';
    END IF;
  END IF;

  RETURN public.record_factory_attendance_v1(
    p_worker_id,
    p_attendance_method,
    p_work_date,
    p_day_units,
    p_work_hours,
    p_output_quantity,
    p_standard_hours_per_day,
    p_activity_name,
    p_idempotency_key,
    p_notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_factory_attendance_v1(uuid, text, date, numeric, numeric, numeric, numeric, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_factory_attendance(uuid, text, date, numeric, numeric, numeric, numeric, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_factory_attendance(uuid, text, date, numeric, numeric, numeric, numeric, text, text, text)
  TO authenticated;

-- A manager must reopen a closed day before reversing an attendance fact.
-- Keep retries of an already-created reversal idempotent by delegating those
-- requests to the original implementation before checking the closure state.
ALTER FUNCTION public.reverse_factory_attendance(uuid, text, text)
  RENAME TO reverse_factory_attendance_v1;

CREATE OR REPLACE FUNCTION public.reverse_factory_attendance(
  p_attendance_record_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_record public.factory_attendance_records;
  v_existing public.factory_attendance_reversals;
BEGIN
  IF NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền đảo bản ghi chấm công';
  END IF;
  IF v_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.factory_attendance_reversals
    WHERE tenant_id = v_tenant AND idempotency_key = v_key;
    IF FOUND THEN
      RETURN public.reverse_factory_attendance_v1(p_attendance_record_id, p_reason, p_idempotency_key);
    END IF;
  END IF;
  SELECT * INTO v_record
  FROM public.factory_attendance_records
  WHERE id = p_attendance_record_id AND tenant_id = v_tenant;
  IF FOUND AND public.current_factory_attendance_closure(v_record.worker_id, v_record.work_date) = 'LEADER_CONFIRMED' THEN
    RAISE EXCEPTION 'Ngày công đã được quản lý chốt; hãy mở lại trước khi đảo bản ghi';
  END IF;
  RETURN public.reverse_factory_attendance_v1(p_attendance_record_id, p_reason, p_idempotency_key);
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_factory_attendance_v1(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_factory_attendance(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_factory_attendance(uuid, text, text)
  TO authenticated;

-- Status transitions cannot rewrite a manager-closed day. LOCKED is the one
-- legal transition after closure; the original function still verifies that
-- the current row is APPROVED and that the day is leader-confirmed.
ALTER FUNCTION public.set_factory_attendance_status(uuid, text, text, text)
  RENAME TO set_factory_attendance_status_v1;

CREATE OR REPLACE FUNCTION public.set_factory_attendance_status(
  p_attendance_record_id uuid,
  p_target_status text,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_record public.factory_attendance_records;
  v_existing public.factory_attendance_workflow_events;
BEGIN
  IF p_target_status = 'SUBMITTED' THEN
    IF NOT public.has_production_permission('production_operations')
       AND NOT public.has_production_permission('production_manage') THEN
      RAISE EXCEPTION 'Bạn không có quyền gửi lại chấm công';
    END IF;
  ELSIF p_target_status IN ('APPROVED', 'REJECTED', 'LOCKED') THEN
    IF NOT public.has_production_permission('production_manage') THEN
      RAISE EXCEPTION 'Bạn không có quyền duyệt hoặc khóa chấm công';
    END IF;
  END IF;
  IF v_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.factory_attendance_workflow_events
    WHERE tenant_id = v_tenant AND idempotency_key = v_key;
    IF FOUND THEN
      RETURN public.set_factory_attendance_status_v1(p_attendance_record_id, p_target_status, p_reason, p_idempotency_key);
    END IF;
  END IF;
  SELECT * INTO v_record
  FROM public.factory_attendance_records
  WHERE id = p_attendance_record_id AND tenant_id = v_tenant;
  IF FOUND
     AND p_target_status <> 'LOCKED'
     AND public.current_factory_attendance_closure(v_record.worker_id, v_record.work_date) = 'LEADER_CONFIRMED' THEN
    RAISE EXCEPTION 'Ngày công đã được quản lý chốt; hãy mở lại trước khi sửa workflow';
  END IF;
  RETURN public.set_factory_attendance_status_v1(p_attendance_record_id, p_target_status, p_reason, p_idempotency_key);
END;
$$;

REVOKE ALL ON FUNCTION public.set_factory_attendance_status_v1(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_factory_attendance_status(uuid, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_factory_attendance_status(uuid, text, text, text)
  TO authenticated;

ALTER FUNCTION public.set_factory_overtime_status(uuid, text, text, text)
  RENAME TO set_factory_overtime_status_v1;

CREATE OR REPLACE FUNCTION public.set_factory_overtime_status(
  p_overtime_record_id uuid,
  p_target_status text,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_record public.factory_overtime_records;
  v_existing public.factory_overtime_workflow_events;
BEGIN
  IF p_target_status = 'SUBMITTED' THEN
    IF NOT public.has_production_permission('production_operations')
       AND NOT public.has_production_permission('production_manage') THEN
      RAISE EXCEPTION 'Bạn không có quyền gửi lại tăng ca';
    END IF;
  ELSIF p_target_status IN ('APPROVED', 'REJECTED', 'LOCKED') THEN
    IF NOT public.has_production_permission('production_manage') THEN
      RAISE EXCEPTION 'Bạn không có quyền duyệt hoặc khóa tăng ca';
    END IF;
  END IF;
  IF v_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.factory_overtime_workflow_events
    WHERE tenant_id = v_tenant AND idempotency_key = v_key;
    IF FOUND THEN
      RETURN public.set_factory_overtime_status_v1(p_overtime_record_id, p_target_status, p_reason, p_idempotency_key);
    END IF;
  END IF;
  SELECT * INTO v_record
  FROM public.factory_overtime_records
  WHERE id = p_overtime_record_id AND tenant_id = v_tenant;
  IF FOUND
     AND p_target_status <> 'LOCKED'
     AND public.current_factory_attendance_closure(v_record.worker_id, v_record.work_date) = 'LEADER_CONFIRMED' THEN
    RAISE EXCEPTION 'Ngày công đã được quản lý chốt; hãy mở lại trước khi sửa workflow tăng ca';
  END IF;
  RETURN public.set_factory_overtime_status_v1(p_overtime_record_id, p_target_status, p_reason, p_idempotency_key);
END;
$$;

REVOKE ALL ON FUNCTION public.set_factory_overtime_status_v1(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_factory_overtime_status(uuid, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_factory_overtime_status(uuid, text, text, text)
  TO authenticated;

COMMIT;
