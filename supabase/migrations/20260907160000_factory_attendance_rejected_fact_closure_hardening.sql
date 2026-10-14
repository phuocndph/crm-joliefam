-- Final consistency pass for the independent factory-attendance workflow.
-- Rejected facts remain visible in history, but they are not operational facts
-- for interval/cap checks or for deciding whether an otherwise empty day has
-- been classified. The legacy renamed RPCs are private implementation details.

BEGIN;

-- The previous implementation was renamed during the cap-checking override.
-- ALTER FUNCTION preserves ACLs, so explicitly remove the old public surface.
REVOKE ALL ON FUNCTION public.record_factory_attendance_v2(
  uuid, text, date, numeric, numeric, numeric, numeric, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_factory_hour_attendance_v2(
  uuid, date, time, time, integer, text, text, text
) FROM PUBLIC, anon, authenticated;

-- The day-status migration's private implementation predates workflow-aware
-- facts and treated every non-reversed row as active. Replace only that
-- private body so a rejected row no longer blocks an absence/leave event.
CREATE OR REPLACE FUNCTION public.set_factory_attendance_day_status_v1(
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
  IF v_key IS NULL THEN RAISE EXCEPTION 'Mã yêu cầu trạng thái ngày công là bắt buộc'; END IF;
  IF p_work_date IS NULL OR p_work_date > CURRENT_DATE THEN RAISE EXCEPTION 'Ngày trạng thái không hợp lệ'; END IF;
  IF p_status NOT IN ('PRESENT', 'ABSENT', 'PAID_LEAVE', 'UNPAID_LEAVE', 'HOLIDAY', 'OFF') THEN
    RAISE EXCEPTION 'Trạng thái ngày công không hợp lệ';
  END IF;
  IF p_status <> 'PRESENT' AND COALESCE(p_meal_eligible, false) THEN
    RAISE EXCEPTION 'Chỉ ngày có mặt mới được hưởng tiền ăn';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'factory-attendance-closure:' || v_tenant || ':' || p_worker_id::text || ':' || p_work_date::text,
    0
  ));

  SELECT * INTO v_worker
  FROM public.production_workers
  WHERE id = p_worker_id AND tenant_id = v_tenant AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nhân sự không tồn tại hoặc không hoạt động'; END IF;

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
      'id', v_existing.id, 'worker_id', p_worker_id, 'work_date', p_work_date,
      'status', v_existing.status, 'meal_eligible', v_existing.meal_eligible,
      'reused', true
    );
  END IF;

  IF public.current_factory_attendance_closure(p_worker_id, p_work_date) = 'LEADER_CONFIRMED' THEN
    RAISE EXCEPTION 'Ngày công đã được quản lý chốt; hãy mở lại trước khi cập nhật trạng thái';
  END IF;

  IF p_status <> 'PRESENT' AND EXISTS (
    SELECT 1
    FROM public.factory_attendance_records f
    WHERE f.tenant_id = v_tenant
      AND f.worker_id = p_worker_id
      AND f.work_date = p_work_date
      AND public.factory_attendance_fact_is_active(f.id)
  ) THEN
    RAISE EXCEPTION 'Ngày này đã có bản ghi chấm công; hãy đảo bản ghi trước khi ghi nghỉ/vắng';
  END IF;

  v_current := (public.current_factory_attendance_day_status(p_worker_id, p_work_date)->>'status');
  INSERT INTO public.factory_attendance_day_status_events (
    tenant_id, worker_id, work_date, status, meal_eligible, reason, idempotency_key, actor_id
  ) VALUES (
    v_tenant, p_worker_id, p_work_date, p_status, COALESCE(p_meal_eligible, false), v_reason, v_key, auth.uid()
  ) RETURNING * INTO v_event;

  PERFORM public.write_cost_audit(
    'factory_attendance_day_status_events', v_event.id, 'CLOSE',
    CASE WHEN v_current IS NULL THEN NULL ELSE jsonb_build_object('status', v_current) END,
    jsonb_build_object('status', v_event.status, 'meal_eligible', v_event.meal_eligible), v_reason
  );

  RETURN jsonb_build_object(
    'id', v_event.id, 'worker_id', v_event.worker_id, 'work_date', v_event.work_date,
    'status', v_event.status, 'meal_eligible', v_event.meal_eligible, 'reused', false
  );
END;
$$;

-- Serialize invariant reads with the same worker/day lock used by status and
-- closure writes. Without this, a concurrent ABSENT/LEAVE event could commit
-- after the trigger read and before the attendance insert.
CREATE OR REPLACE FUNCTION public.validate_factory_attendance_invariants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_status text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'factory-attendance-closure:' || COALESCE(NEW.tenant_id, 'default') || ':'
      || NEW.worker_id::text || ':' || NEW.work_date::text,
    0
  ));

  SELECT e.status INTO v_day_status
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

CREATE OR REPLACE FUNCTION public.validate_factory_overtime_day_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_status text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'factory-attendance-closure:' || COALESCE(NEW.tenant_id, 'default') || ':'
      || NEW.worker_id::text || ':' || NEW.work_date::text,
    0
  ));
  SELECT e.status INTO v_day_status
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

CREATE OR REPLACE FUNCTION public.validate_production_labor_fact_attendance_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_status text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'factory-attendance-closure:' || COALESCE(NEW.tenant_id, 'default') || ':'
      || NEW.worker_id::text || ':' || NEW.fact_date::text,
    0
  ));
  SELECT e.status INTO v_day_status
  FROM public.factory_attendance_day_status_events e
  WHERE e.tenant_id = NEW.tenant_id
    AND e.worker_id = NEW.worker_id
    AND e.work_date = NEW.fact_date
  ORDER BY e.event_sequence DESC
  LIMIT 1;
  IF v_day_status IN ('ABSENT', 'PAID_LEAVE', 'UNPAID_LEAVE', 'OFF') THEN
    RAISE EXCEPTION 'Ngày đã được đánh dấu %, không thể ghi sản lượng/công', v_day_status;
  END IF;
  RETURN NEW;
END;
$$;

-- Preserve the previous public wrapper as a private implementation before
-- replacing its body below.
ALTER FUNCTION public.set_factory_attendance_day_closure(
  uuid, date, text, text, text
) RENAME TO set_factory_attendance_day_closure_v2;

-- Replace the private canonical closure implementation so rejected workflow
-- events do not count as "unreviewed" work. The public wrapper below still
-- performs the explicit day-classification check introduced earlier.
CREATE OR REPLACE FUNCTION public.set_factory_attendance_day_closure_v2(
  p_worker_id uuid,
  p_work_date date,
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
  v_worker public.production_workers;
  v_existing public.factory_attendance_daily_closure_events;
  v_event public.factory_attendance_daily_closure_events;
  v_current text;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_unreviewed integer;
BEGIN
  IF v_key IS NULL THEN RAISE EXCEPTION 'Mã yêu cầu chốt ngày là bắt buộc'; END IF;
  IF p_work_date IS NULL OR p_work_date > CURRENT_DATE THEN RAISE EXCEPTION 'Ngày chốt không hợp lệ'; END IF;
  IF p_target_status NOT IN ('EMPLOYEE_CONFIRMED', 'LEADER_CONFIRMED', 'REOPENED') THEN
    RAISE EXCEPTION 'Trạng thái chốt ngày không hợp lệ';
  END IF;
  IF p_target_status = 'REOPENED' AND v_reason IS NULL THEN RAISE EXCEPTION 'Lý do mở lại là bắt buộc'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'factory-attendance-closure:' || v_tenant || ':' || p_worker_id::text || ':' || p_work_date::text,
    0
  ));

  SELECT * INTO v_worker
  FROM public.production_workers
  WHERE id = p_worker_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nhân sự không tồn tại'; END IF;

  SELECT * INTO v_existing
  FROM public.factory_attendance_daily_closure_events
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.worker_id <> p_worker_id
       OR v_existing.work_date <> p_work_date
       OR v_existing.status <> p_target_status
       OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'Mã yêu cầu đã được dùng cho chốt ngày khác';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id, 'worker_id', p_worker_id, 'work_date', p_work_date,
      'status', v_existing.status, 'reused', true
    );
  END IF;

  v_current := public.current_factory_attendance_closure(p_worker_id, p_work_date);
  IF p_target_status = 'EMPLOYEE_CONFIRMED' AND v_current NOT IN ('OPEN', 'REOPENED') THEN
    RAISE EXCEPTION 'Ngày này đã được nhân sự xác nhận';
  ELSIF p_target_status = 'LEADER_CONFIRMED' AND v_current <> 'EMPLOYEE_CONFIRMED' THEN
    RAISE EXCEPTION 'Nhân sự phải xác nhận ngày trước khi quản lý chốt';
  ELSIF p_target_status = 'REOPENED' AND v_current = 'OPEN' THEN
    RAISE EXCEPTION 'Ngày này chưa được chốt';
  END IF;

  IF p_target_status IN ('LEADER_CONFIRMED', 'REOPENED') THEN
    IF NOT public.has_production_permission('production_manage') THEN
      RAISE EXCEPTION 'Bạn không có quyền chốt hoặc mở lại ngày công';
    END IF;
  ELSE
    IF NOT public.has_production_permission('production_operations')
       AND NOT public.has_production_permission('production_manage') THEN
      RAISE EXCEPTION 'Bạn không có quyền xác nhận ngày công';
    END IF;
  END IF;

  IF p_target_status = 'LEADER_CONFIRMED' THEN
    SELECT count(*) INTO v_unreviewed
    FROM public.factory_attendance_records f
    WHERE f.tenant_id = v_tenant
      AND f.worker_id = p_worker_id
      AND f.work_date = p_work_date
      AND public.factory_attendance_fact_is_active(f.id)
      AND public.current_factory_attendance_status(f.id) = 'SUBMITTED';

    SELECT v_unreviewed + count(*) INTO v_unreviewed
    FROM public.factory_overtime_records o
    WHERE o.tenant_id = v_tenant
      AND o.worker_id = p_worker_id
      AND o.work_date = p_work_date
      AND public.factory_overtime_record_is_active(o.id)
      AND public.current_factory_overtime_status(o.id) = 'SUBMITTED';

    IF v_unreviewed > 0 THEN
      RAISE EXCEPTION 'Còn % bản ghi chấm công hoặc tăng ca chưa được duyệt', v_unreviewed;
    END IF;
  END IF;

  INSERT INTO public.factory_attendance_daily_closure_events (
    tenant_id, worker_id, work_date, status, reason, idempotency_key, actor_id
  ) VALUES (
    v_tenant, p_worker_id, p_work_date, p_target_status, v_reason, v_key, auth.uid()
  ) RETURNING * INTO v_event;

  PERFORM public.write_cost_audit(
    'factory_attendance_daily_closure_events', v_event.id,
    CASE WHEN p_target_status = 'REOPENED' THEN 'REOPEN' ELSE 'CLOSE' END,
    jsonb_build_object('status', v_current),
    jsonb_build_object('status', p_target_status), v_reason
  );

  RETURN jsonb_build_object(
    'id', v_event.id, 'worker_id', p_worker_id, 'work_date', p_work_date,
    'status', p_target_status, 'reused', false
  );
END;
$$;

-- Keep daily closure's "has any fact" guard aligned with the operational
-- meaning used by the cap and overlap checks. A rejected-only day still needs
-- an explicit PRESENT/ABSENT/LEAVE/OFF classification before it can close.
CREATE OR REPLACE FUNCTION public.set_factory_attendance_day_closure(
  p_worker_id uuid,
  p_work_date date,
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
  v_status text;
  v_has_fact boolean;
BEGIN
  -- Keep the authorization boundary and transition rules in the canonical
  -- implementation; this wrapper only tightens the precondition for a leader
  -- close before delegating.
  IF p_target_status = 'EMPLOYEE_CONFIRMED' THEN
    IF NOT public.has_production_permission('production_operations')
       AND NOT public.has_production_permission('production_manage') THEN
      RAISE EXCEPTION 'Bạn không có quyền xác nhận ngày công';
    END IF;
  ELSIF p_target_status IN ('LEADER_CONFIRMED', 'REOPENED') THEN
    IF NOT public.has_production_permission('production_manage') THEN
      RAISE EXCEPTION 'Chỉ quản lý mới được chốt hoặc mở lại ngày công';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'factory-attendance-closure:' || v_tenant || ':' || p_worker_id::text || ':' || p_work_date::text,
    0
  ));

  IF p_target_status = 'LEADER_CONFIRMED' THEN
    v_status := (public.current_factory_attendance_day_status(p_worker_id, p_work_date)->>'status');
    SELECT EXISTS (
      SELECT 1
      FROM public.factory_attendance_records f
      WHERE f.tenant_id = v_tenant
        AND f.worker_id = p_worker_id
        AND f.work_date = p_work_date
        AND public.factory_attendance_fact_is_active(f.id)
      UNION ALL
      SELECT 1
      FROM public.production_operation_labor_facts f
      WHERE f.tenant_id = v_tenant
        AND f.worker_id = p_worker_id
        AND f.fact_date = p_work_date
        AND NOT EXISTS (
          SELECT 1
          FROM public.production_attendance_reversals r
          WHERE r.tenant_id = f.tenant_id
            AND r.labor_fact_id = f.id
        )
      UNION ALL
      SELECT 1
      FROM public.factory_overtime_records o
      WHERE o.tenant_id = v_tenant
        AND o.worker_id = p_worker_id
        AND o.work_date = p_work_date
        AND public.factory_overtime_record_is_active(o.id)
    ) INTO v_has_fact;

    IF v_status IS NULL AND NOT v_has_fact THEN
      RAISE EXCEPTION 'Chưa có trạng thái hoặc bản ghi chấm công cho ngày này';
    END IF;
  END IF;

  RETURN public.set_factory_attendance_day_closure_v2(
    p_worker_id, p_work_date, p_target_status, p_reason, p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_factory_attendance_day_closure_v2(
  uuid, date, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_factory_attendance_day_closure(
  uuid, date, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_factory_attendance_day_closure(
  uuid, date, text, text, text
) TO authenticated;

COMMIT;
