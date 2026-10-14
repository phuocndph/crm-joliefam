-- Enforce the independent attendance invariants at the database boundary.
--
-- The UI already hides attendance actions for leave/absence days and checks
-- clock values. Those checks are advisory only; RPC callers and retries must
-- receive the same protection. This migration is additive and keeps facts
-- append-only.

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_factory_attendance_invariants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_status text;
BEGIN
  -- A non-present day is an explicit payroll classification. It must not be
  -- possible to append a positive attendance fact behind that classification.
  SELECT e.status
  INTO v_day_status
  FROM public.factory_attendance_day_status_events e
  WHERE e.tenant_id = NEW.tenant_id
    AND e.worker_id = NEW.worker_id
    AND e.work_date = NEW.work_date
  ORDER BY e.event_sequence DESC
  LIMIT 1;

  -- HOLIDAY is a calendar classification and may still contain approved
  -- holiday work. Absence/leave/off are the non-working classifications.
  IF v_day_status IN ('ABSENT', 'PAID_LEAVE', 'UNPAID_LEAVE', 'OFF') THEN
    RAISE EXCEPTION 'Ngày đã được đánh dấu %, hãy cập nhật trạng thái thành Có mặt trước khi ghi công', v_day_status;
  END IF;

  -- Prevent overlapping hourly intervals for one worker/day. Adjacent shifts
  -- (checkout = next check-in) remain valid. Legacy hourly facts without clock
  -- fields are excluded because their interval cannot be reconstructed.
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
         AND NOT EXISTS (
           SELECT 1
           FROM public.factory_attendance_reversals r
           WHERE r.tenant_id = f.tenant_id
             AND r.attendance_record_id = f.id
         )
         AND f.check_in_time < NEW.check_out_time
         AND NEW.check_in_time < f.check_out_time
     ) THEN
    RAISE EXCEPTION 'Khoảng giờ chấm công bị trùng với một ca khác trong cùng ngày';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS factory_attendance_invariant_guards
  ON public.factory_attendance_records;
CREATE TRIGGER factory_attendance_invariant_guards
BEFORE INSERT ON public.factory_attendance_records
FOR EACH ROW EXECUTE FUNCTION public.validate_factory_attendance_invariants();

-- Production-linked labor facts are part of the same attendance read model.
-- Do not allow a legacy/order entry to bypass an explicit absence/leave/off
-- classification created on the independent attendance screen.
CREATE OR REPLACE FUNCTION public.validate_production_labor_fact_attendance_status()
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
    AND e.work_date = NEW.fact_date
  ORDER BY e.event_sequence DESC
  LIMIT 1;

  IF v_day_status IN ('ABSENT', 'PAID_LEAVE', 'UNPAID_LEAVE', 'OFF') THEN
    RAISE EXCEPTION 'Ngày đã được đánh dấu %, không thể ghi sản lượng/công', v_day_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS production_labor_fact_day_status_guard
  ON public.production_operation_labor_facts;
CREATE TRIGGER production_labor_fact_day_status_guard
BEFORE INSERT ON public.production_operation_labor_facts
FOR EACH ROW EXECUTE FUNCTION public.validate_production_labor_fact_attendance_status();

-- Day status is a payroll input and may affect meal eligibility. Only a
-- manager/admin-level production permission can create or replace it.
ALTER FUNCTION public.set_factory_attendance_day_status(uuid, date, text, boolean, text, text)
  RENAME TO set_factory_attendance_day_status_v1;

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
BEGIN
  IF NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Chỉ quản lý mới được cập nhật trạng thái ngày công';
  END IF;
  RETURN public.set_factory_attendance_day_status_v1(
    p_worker_id, p_work_date, p_status, p_meal_eligible, p_reason, p_idempotency_key
  );
END;
$$;

-- A leader cannot close an entirely unclassified day. This prevents a blank
-- day from being mistaken for a confirmed absence or a confirmed workday.
ALTER FUNCTION public.set_factory_attendance_day_closure(uuid, date, text, text, text)
  RENAME TO set_factory_attendance_day_closure_v1;

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
  -- Check permission before reading idempotency/state so unauthorized callers
  -- cannot use the closure RPC as an existence oracle.
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
        AND NOT EXISTS (
          SELECT 1 FROM public.factory_attendance_reversals r
          WHERE r.tenant_id = f.tenant_id AND r.attendance_record_id = f.id
        )
      UNION ALL
    SELECT 1
      FROM public.production_operation_labor_facts f
      WHERE f.tenant_id = v_tenant
        AND f.worker_id = p_worker_id
        AND f.fact_date = p_work_date
        AND NOT EXISTS (
          SELECT 1 FROM public.production_attendance_reversals r
          WHERE r.tenant_id = f.tenant_id AND r.labor_fact_id = f.id
        )
      UNION ALL
      SELECT 1
      FROM public.factory_overtime_records o
      WHERE o.tenant_id = v_tenant
        AND o.worker_id = p_worker_id
        AND o.work_date = p_work_date
    ) INTO v_has_fact;
    IF v_status IS NULL AND NOT v_has_fact THEN
      RAISE EXCEPTION 'Chưa có trạng thái hoặc bản ghi chấm công cho ngày này';
    END IF;
  END IF;

  RETURN public.set_factory_attendance_day_closure_v1(
    p_worker_id, p_work_date, p_target_status, p_reason, p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_factory_attendance_day_status_v1(uuid, date, text, boolean, text, text),
  public.set_factory_attendance_day_closure_v1(uuid, date, text, text, text),
  public.validate_production_labor_fact_attendance_status()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_factory_attendance_day_status(uuid, date, text, boolean, text, text),
  public.set_factory_attendance_day_closure(uuid, date, text, text, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_factory_attendance_day_status(uuid, date, text, boolean, text, text),
  public.set_factory_attendance_day_closure(uuid, date, text, text, text)
TO authenticated;

REVOKE ALL ON FUNCTION public.validate_factory_attendance_invariants()
FROM PUBLIC, anon, authenticated;

COMMIT;
