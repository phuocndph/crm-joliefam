-- Complete the independent factory attendance day model.
--
-- Attendance facts remain immutable. A day without a positive attendance fact
-- can now be explicitly classified (absence/leave/holiday/off), and the
-- latest classification is reconstructed from append-only events. This keeps
-- payroll inputs auditable without inventing zero-value attendance rows.

BEGIN;

CREATE TABLE IF NOT EXISTS public.factory_attendance_day_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tenant_id text NOT NULL DEFAULT 'default',
  worker_id uuid NOT NULL REFERENCES public.production_workers(id) ON DELETE RESTRICT,
  work_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('PRESENT', 'ABSENT', 'PAID_LEAVE', 'UNPAID_LEAVE', 'HOLIDAY', 'OFF')),
  meal_eligible boolean NOT NULL DEFAULT false,
  reason text,
  idempotency_key text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key),
  CHECK (status = 'PRESENT' OR meal_eligible = false)
);

CREATE INDEX IF NOT EXISTS factory_attendance_day_status_month_idx
  ON public.factory_attendance_day_status_events (tenant_id, work_date, worker_id, event_sequence DESC);

CREATE OR REPLACE FUNCTION public.guard_factory_attendance_day_status_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Lịch sử trạng thái ngày công là bất biến; hãy tạo sự kiện mới';
END;
$$;

DROP TRIGGER IF EXISTS factory_attendance_day_status_immutable
  ON public.factory_attendance_day_status_events;
CREATE TRIGGER factory_attendance_day_status_immutable
BEFORE UPDATE OR DELETE ON public.factory_attendance_day_status_events
FOR EACH ROW EXECUTE FUNCTION public.guard_factory_attendance_day_status_immutable();

CREATE OR REPLACE FUNCTION public.validate_factory_attendance_day_status_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.production_workers w
    WHERE w.id = NEW.worker_id
      AND w.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Nhân sự không cùng phạm vi dữ liệu';
  END IF;
  IF NEW.work_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Ngày trạng thái không được ở tương lai';
  END IF;
  IF NEW.status <> 'PRESENT' AND NEW.meal_eligible THEN
    RAISE EXCEPTION 'Chỉ ngày có mặt mới được hưởng tiền ăn';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS factory_attendance_day_status_scope
  ON public.factory_attendance_day_status_events;
CREATE TRIGGER factory_attendance_day_status_scope
BEFORE INSERT OR UPDATE ON public.factory_attendance_day_status_events
FOR EACH ROW EXECUTE FUNCTION public.validate_factory_attendance_day_status_scope();

CREATE OR REPLACE FUNCTION public.current_factory_attendance_day_status(
  p_worker_id uuid,
  p_work_date date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT jsonb_build_object(
      'status', e.status,
      'meal_eligible', e.meal_eligible,
      'reason', e.reason,
      'created_at', e.created_at
    )
    FROM public.factory_attendance_day_status_events e
    WHERE e.tenant_id = COALESCE(
      (SELECT w.tenant_id FROM public.production_workers w WHERE w.id = p_worker_id),
      'default'
    )
      AND e.worker_id = p_worker_id
      AND e.work_date = p_work_date
    ORDER BY e.event_sequence DESC
    LIMIT 1
  ), '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.set_factory_attendance_day_status(
  p_worker_id uuid,
  p_work_date date,
  p_status text,
  p_meal_eligible boolean DEFAULT false,
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
  v_worker public.production_workers;
  v_existing public.factory_attendance_day_status_events;
  v_event public.factory_attendance_day_status_events;
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_reason text := NULLIF(btrim(p_reason), '');
  v_current text;
BEGIN
  IF NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền cập nhật trạng thái ngày công';
  END IF;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Mã yêu cầu trạng thái ngày công là bắt buộc';
  END IF;
  IF p_work_date IS NULL OR p_work_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Ngày trạng thái không hợp lệ';
  END IF;
  IF p_status NOT IN ('PRESENT', 'ABSENT', 'PAID_LEAVE', 'UNPAID_LEAVE', 'HOLIDAY', 'OFF') THEN
    RAISE EXCEPTION 'Trạng thái ngày công không hợp lệ';
  END IF;
  IF p_status <> 'PRESENT' AND COALESCE(p_meal_eligible, false) THEN
    RAISE EXCEPTION 'Chỉ ngày có mặt mới được hưởng tiền ăn';
  END IF;

  -- Serialize status changes with attendance writes and daily closure.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'factory-attendance-closure:' || v_tenant || ':' || p_worker_id::text || ':' || p_work_date::text,
    0
  ));

  SELECT * INTO v_worker
  FROM public.production_workers
  WHERE id = p_worker_id AND tenant_id = v_tenant AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nhân sự không tồn tại hoặc không hoạt động';
  END IF;

  SELECT * INTO v_existing
  FROM public.factory_attendance_day_status_events
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.worker_id <> p_worker_id
       OR v_existing.work_date <> p_work_date
       OR v_existing.status <> p_status
       OR v_existing.meal_eligible <> COALESCE(p_meal_eligible, false)
       OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'Mã yêu cầu đã được dùng cho trạng thái ngày công khác';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'worker_id', p_worker_id,
      'work_date', p_work_date,
      'status', v_existing.status,
      'meal_eligible', v_existing.meal_eligible,
      'reused', true
    );
  END IF;

  IF public.current_factory_attendance_closure(p_worker_id, p_work_date) = 'LEADER_CONFIRMED' THEN
    RAISE EXCEPTION 'Ngày công đã được quản lý chốt; hãy mở lại trước khi cập nhật trạng thái';
  END IF;

  -- A leave/absence classification must not silently coexist with positive
  -- attendance facts. The manager can reopen the day and correct either side.
  IF p_status <> 'PRESENT' AND EXISTS (
    SELECT 1
    FROM public.factory_attendance_records f
    WHERE f.tenant_id = v_tenant
      AND f.worker_id = p_worker_id
      AND f.work_date = p_work_date
      AND NOT EXISTS (
        SELECT 1 FROM public.factory_attendance_reversals r
        WHERE r.tenant_id = f.tenant_id AND r.attendance_record_id = f.id
      )
  ) THEN
    RAISE EXCEPTION 'Ngày này đã có bản ghi chấm công; hãy đảo bản ghi trước khi ghi nghỉ/vắng';
  END IF;

  v_current := (public.current_factory_attendance_day_status(p_worker_id, p_work_date)->>'status');
  INSERT INTO public.factory_attendance_day_status_events (
    tenant_id, worker_id, work_date, status, meal_eligible, reason, idempotency_key, actor_id
  ) VALUES (
    v_tenant, p_worker_id, p_work_date, p_status, COALESCE(p_meal_eligible, false), v_reason, v_key, auth.uid()
  )
  RETURNING * INTO v_event;

  PERFORM public.write_cost_audit(
    'factory_attendance_day_status_events', v_event.id, 'CLOSE',
    CASE WHEN v_current IS NULL THEN NULL ELSE jsonb_build_object('status', v_current) END,
    jsonb_build_object('status', v_event.status, 'meal_eligible', v_event.meal_eligible),
    v_reason
  );

  RETURN jsonb_build_object(
    'id', v_event.id,
    'worker_id', v_event.worker_id,
    'work_date', v_event.work_date,
    'status', v_event.status,
    'meal_eligible', v_event.meal_eligible,
    'reused', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_factory_attendance_day_status_month(
  p_month_start date
)
RETURNS TABLE (
  worker_id uuid,
  employee_code text,
  worker_name text,
  worker_type text,
  work_date date,
  status text,
  meal_eligible boolean,
  reason text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_month_end date := ((p_month_start + INTERVAL '1 month')::date - 1);
BEGIN
  IF NOT public.has_production_permission('production_view')
     AND NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem trạng thái ngày công';
  END IF;
  IF p_month_start IS NULL OR p_month_start <> date_trunc('month', p_month_start)::date THEN
    RAISE EXCEPTION 'Tháng báo cáo không hợp lệ';
  END IF;
  RETURN QUERY
  SELECT DISTINCT ON (e.worker_id, e.work_date)
    e.worker_id, w.employee_code, w.display_name, w.worker_type,
    e.work_date, e.status, e.meal_eligible, e.reason, e.created_at
  FROM public.factory_attendance_day_status_events e
  JOIN public.production_workers w ON w.id = e.worker_id AND w.tenant_id = e.tenant_id
  WHERE e.tenant_id = v_tenant
    AND e.work_date BETWEEN p_month_start AND v_month_end
  ORDER BY e.worker_id, e.work_date, e.event_sequence DESC;
END;
$$;

-- Add a key lock around overtime create/retry. The original function checked
-- idempotency but two concurrent requests could still race before the unique
-- constraint was reached and return a 23505 instead of a reusable response.
DO $$
BEGIN
  IF to_regprocedure('public.record_factory_overtime_v1(uuid,date,text,integer,text,text)') IS NULL
     AND to_regprocedure('public.record_factory_overtime(uuid,date,text,integer,text,text)') IS NOT NULL THEN
    ALTER FUNCTION public.record_factory_overtime(uuid, date, text, integer, text, text)
      RENAME TO record_factory_overtime_v1;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_factory_overtime(
  p_worker_id uuid,
  p_work_date date,
  p_overtime_type text,
  p_overtime_minutes integer,
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
  v_reason text := NULLIF(btrim(p_reason), '');
  v_existing public.factory_overtime_records;
BEGIN
  IF v_key IS NULL OR v_reason IS NULL THEN
    RAISE EXCEPTION 'Lý do và mã yêu cầu là bắt buộc';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'factory-overtime:' || v_tenant || ':' || v_key,
    0
  ));
  SELECT * INTO v_existing
  FROM public.factory_overtime_records
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.worker_id <> p_worker_id
       OR v_existing.work_date <> p_work_date
       OR v_existing.overtime_type <> p_overtime_type
       OR v_existing.overtime_minutes <> p_overtime_minutes
       OR v_existing.reason <> v_reason THEN
      RAISE EXCEPTION 'Mã yêu cầu đã được dùng cho tăng ca khác';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'reused', true,
      'status', public.current_factory_overtime_status(v_existing.id)
    );
  END IF;
  RETURN public.record_factory_overtime_v1(
    p_worker_id, p_work_date, p_overtime_type, p_overtime_minutes, v_reason, v_key
  );
END;
$$;

ALTER TABLE public.factory_attendance_day_status_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.factory_attendance_day_status_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_factory_attendance_day_status_immutable(),
  public.validate_factory_attendance_day_status_scope(),
  public.current_factory_attendance_day_status(uuid, date)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_factory_attendance_day_status(uuid, date, text, boolean, text, text),
  public.list_factory_attendance_day_status_month(date)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_factory_attendance_day_status(uuid, date, text, boolean, text, text),
  public.list_factory_attendance_day_status_month(date)
TO authenticated;

REVOKE ALL ON FUNCTION public.record_factory_overtime_v1(uuid, date, text, integer, text, text)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_factory_overtime(uuid, date, text, integer, text, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_factory_overtime(uuid, date, text, integer, text, text)
TO authenticated;

COMMIT;
