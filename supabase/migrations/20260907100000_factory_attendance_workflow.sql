-- Factory attendance workflow: approval, daily closure and overtime capture.
-- Additive only. Attendance facts remain immutable; corrections are represented
-- by append-only events/reversals and never by updating the source fact.

BEGIN;

ALTER TABLE public.audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_action_check
  CHECK (action IN (
    'CREATE', 'UPDATE', 'DELETE', 'CONFIRM', 'VOID', 'APPROVE', 'SUPERSEDE',
    'RELEASE', 'COMPLETE', 'START', 'PAUSE', 'RESUME', 'HOLD', 'CANCEL',
    'REPLAN', 'ASSIGN', 'UNASSIGN', 'REVERSE', 'CREATE_DRAFT', 'UPDATE_DRAFT',
    'DISCARD_DRAFT', 'SUBMIT', 'REJECT', 'LOCK', 'CLOSE', 'REOPEN',
    'ADJUST', 'OVERTIME_CREATE'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Append-only status events for attendance facts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.factory_attendance_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tenant_id text NOT NULL DEFAULT 'default',
  attendance_record_id uuid NOT NULL REFERENCES public.factory_attendance_records(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'LOCKED')),
  reason text,
  idempotency_key text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS factory_attendance_workflow_record_idx
  ON public.factory_attendance_workflow_events (tenant_id, attendance_record_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.guard_factory_attendance_workflow_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Lịch sử workflow chấm công là bất biến; hãy tạo sự kiện mới';
END;
$$;
DROP TRIGGER IF EXISTS factory_attendance_workflow_immutable ON public.factory_attendance_workflow_events;
CREATE TRIGGER factory_attendance_workflow_immutable
BEFORE UPDATE OR DELETE ON public.factory_attendance_workflow_events
FOR EACH ROW EXECUTE FUNCTION public.guard_factory_attendance_workflow_immutable();

CREATE OR REPLACE FUNCTION public.seed_factory_attendance_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.factory_attendance_workflow_events (
    tenant_id, attendance_record_id, status, reason, idempotency_key, actor_id
  ) VALUES (
    NEW.tenant_id, NEW.id, 'SUBMITTED', NULL,
    'attendance-submit:' || NEW.id::text, NEW.created_by
  ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS factory_attendance_submission_event ON public.factory_attendance_records;
CREATE TRIGGER factory_attendance_submission_event
AFTER INSERT ON public.factory_attendance_records
FOR EACH ROW EXECUTE FUNCTION public.seed_factory_attendance_submission();

CREATE OR REPLACE FUNCTION public.current_factory_attendance_status(p_record_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT e.status
    FROM public.factory_attendance_workflow_events e
    WHERE e.attendance_record_id = p_record_id
      AND e.tenant_id = COALESCE((SELECT f.tenant_id FROM public.factory_attendance_records f WHERE f.id = p_record_id), 'default')
    ORDER BY e.event_sequence DESC
    LIMIT 1
  ), 'APPROVED')
$$;

CREATE OR REPLACE FUNCTION public.validate_factory_attendance_open_day()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.current_factory_attendance_closure(NEW.worker_id, NEW.work_date) = 'LEADER_CONFIRMED' THEN
    RAISE EXCEPTION 'Ngày công đã được quản lý chốt; hãy mở lại trước khi ghi bổ sung';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS factory_attendance_open_day ON public.factory_attendance_records;
CREATE TRIGGER factory_attendance_open_day
BEFORE INSERT ON public.factory_attendance_records
FOR EACH ROW EXECUTE FUNCTION public.validate_factory_attendance_open_day();

CREATE OR REPLACE FUNCTION public.set_factory_attendance_status(
  p_attendance_record_id uuid,
  p_target_status text,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_record public.factory_attendance_records;
  v_existing public.factory_attendance_workflow_events;
  v_event public.factory_attendance_workflow_events;
  v_current text;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_closure text;
BEGIN
  IF v_key IS NULL THEN RAISE EXCEPTION 'Mã yêu cầu workflow là bắt buộc'; END IF;
  IF p_target_status NOT IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'LOCKED') THEN
    RAISE EXCEPTION 'Trạng thái chấm công không hợp lệ';
  END IF;
  IF p_target_status IN ('REJECTED', 'LOCKED') AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Lý do là bắt buộc cho trạng thái này';
  END IF;

  -- Serialize every transition for one attendance fact before reading the
  -- current state. Without this lock, two managers can both observe
  -- SUBMITTED and append conflicting terminal events.
  PERFORM pg_advisory_xact_lock(hashtextextended('factory-attendance-workflow:' || v_tenant || ':' || p_attendance_record_id::text, 0));

  SELECT * INTO v_existing
  FROM public.factory_attendance_workflow_events
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.attendance_record_id <> p_attendance_record_id
       OR v_existing.status <> p_target_status
       OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'Mã yêu cầu đã được dùng cho workflow khác';
    END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'attendance_record_id', p_attendance_record_id,
      'status', v_existing.status, 'reused', true);
  END IF;

  SELECT * INTO v_record FROM public.factory_attendance_records
  WHERE id = p_attendance_record_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bản ghi chấm công không tồn tại'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.factory_attendance_reversals r
    WHERE r.attendance_record_id = v_record.id AND r.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Không thể duyệt bản ghi đã đảo';
  END IF;

  v_current := public.current_factory_attendance_status(v_record.id);
  IF p_target_status = 'SUBMITTED' AND v_current <> 'REJECTED' THEN
    RAISE EXCEPTION 'Chỉ bản ghi bị từ chối mới được gửi lại';
  ELSIF p_target_status IN ('APPROVED', 'REJECTED') AND v_current <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'Chỉ bản ghi đang chờ duyệt mới được xử lý';
  ELSIF p_target_status = 'LOCKED' AND v_current <> 'APPROVED' THEN
    RAISE EXCEPTION 'Chỉ bản ghi đã duyệt mới được khóa';
  END IF;

  IF p_target_status = 'SUBMITTED' THEN
    IF NOT public.has_production_permission('production_operations')
       AND NOT public.has_production_permission('production_manage') THEN
      RAISE EXCEPTION 'Bạn không có quyền gửi lại chấm công';
    END IF;
  ELSE
    IF NOT public.has_production_permission('production_manage') THEN
      RAISE EXCEPTION 'Bạn không có quyền duyệt hoặc khóa chấm công';
    END IF;
  END IF;

  IF p_target_status = 'LOCKED' THEN
    v_closure := public.current_factory_attendance_closure(v_record.worker_id, v_record.work_date);
    IF v_closure <> 'LEADER_CONFIRMED' THEN
      RAISE EXCEPTION 'Phải chốt ngày ở cấp quản lý trước khi khóa chấm công';
    END IF;
  END IF;

  INSERT INTO public.factory_attendance_workflow_events (
    tenant_id, attendance_record_id, status, reason, idempotency_key, actor_id
  ) VALUES (v_tenant, v_record.id, p_target_status, v_reason, v_key, auth.uid())
  RETURNING * INTO v_event;

  PERFORM public.write_cost_audit(
    'factory_attendance_records', v_record.id,
    CASE p_target_status WHEN 'SUBMITTED' THEN 'SUBMIT' WHEN 'APPROVED' THEN 'APPROVE'
      WHEN 'REJECTED' THEN 'REJECT' ELSE 'LOCK' END,
    jsonb_build_object('status', v_current), jsonb_build_object('status', p_target_status), v_reason
  );
  RETURN jsonb_build_object('id', v_event.id, 'attendance_record_id', v_record.id,
    'status', v_event.status, 'reused', false);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Daily closure, independent from production orders
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.factory_attendance_daily_closure_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tenant_id text NOT NULL DEFAULT 'default',
  worker_id uuid NOT NULL REFERENCES public.production_workers(id) ON DELETE RESTRICT,
  work_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('EMPLOYEE_CONFIRMED', 'LEADER_CONFIRMED', 'REOPENED')),
  reason text,
  idempotency_key text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS factory_attendance_closure_month_idx
  ON public.factory_attendance_daily_closure_events (tenant_id, work_date, worker_id, created_at DESC);

DROP TRIGGER IF EXISTS factory_attendance_closure_immutable ON public.factory_attendance_daily_closure_events;
CREATE TRIGGER factory_attendance_closure_immutable
BEFORE UPDATE OR DELETE ON public.factory_attendance_daily_closure_events
FOR EACH ROW EXECUTE FUNCTION public.guard_factory_attendance_workflow_immutable();

CREATE OR REPLACE FUNCTION public.current_factory_attendance_closure(p_worker_id uuid, p_work_date date)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT e.status
    FROM public.factory_attendance_daily_closure_events e
    WHERE e.tenant_id = COALESCE((SELECT w.tenant_id FROM public.production_workers w WHERE w.id = p_worker_id), 'default')
      AND e.worker_id = p_worker_id AND e.work_date = p_work_date
    ORDER BY e.event_sequence DESC
    LIMIT 1
  ), 'OPEN')
$$;

CREATE OR REPLACE FUNCTION public.set_factory_attendance_day_closure(
  p_worker_id uuid,
  p_work_date date,
  p_target_status text,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  -- Serialize the state check and append for one worker/day closure.
  PERFORM pg_advisory_xact_lock(hashtextextended('factory-attendance-closure:' || v_tenant || ':' || p_worker_id::text || ':' || p_work_date::text, 0));
  SELECT * INTO v_worker FROM public.production_workers WHERE id = p_worker_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nhân sự không tồn tại'; END IF;

  SELECT * INTO v_existing FROM public.factory_attendance_daily_closure_events
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.worker_id <> p_worker_id OR v_existing.work_date <> p_work_date
       OR v_existing.status <> p_target_status OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'Mã yêu cầu đã được dùng cho chốt ngày khác';
    END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'worker_id', p_worker_id,
      'work_date', p_work_date, 'status', v_existing.status, 'reused', true);
  END IF;

  v_current := public.current_factory_attendance_closure(p_worker_id, p_work_date);
  IF p_target_status = 'EMPLOYEE_CONFIRMED' AND v_current NOT IN ('OPEN', 'REOPENED') THEN
    RAISE EXCEPTION 'Ngày này đã được nhân sự xác nhận';
  ELSIF p_target_status = 'LEADER_CONFIRMED' AND v_current <> 'EMPLOYEE_CONFIRMED' THEN
    RAISE EXCEPTION 'Nhân sự phải xác nhận ngày trước khi quản lý chốt';
  ELSIF p_target_status = 'REOPENED' AND v_current = 'OPEN' THEN
    RAISE EXCEPTION 'Ngày này chưa được chốt';
  END IF;

  IF p_target_status = 'LEADER_CONFIRMED' OR p_target_status = 'REOPENED' THEN
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
      WHERE f.tenant_id = v_tenant AND f.worker_id = p_worker_id AND f.work_date = p_work_date
      AND NOT EXISTS (SELECT 1 FROM public.factory_attendance_reversals r WHERE r.tenant_id = f.tenant_id AND r.attendance_record_id = f.id)
      AND public.current_factory_attendance_status(f.id) NOT IN ('APPROVED', 'LOCKED');
    SELECT v_unreviewed + count(*) INTO v_unreviewed
    FROM public.factory_overtime_records o
    WHERE o.tenant_id = v_tenant AND o.worker_id = p_worker_id AND o.work_date = p_work_date
      AND public.current_factory_overtime_status(o.id) NOT IN ('APPROVED', 'LOCKED');
    IF v_unreviewed > 0 THEN
      RAISE EXCEPTION 'Còn % bản ghi chấm công hoặc tăng ca chưa được duyệt', v_unreviewed;
    END IF;
  END IF;

  INSERT INTO public.factory_attendance_daily_closure_events (
    tenant_id, worker_id, work_date, status, reason, idempotency_key, actor_id
  ) VALUES (v_tenant, p_worker_id, p_work_date, p_target_status, v_reason, v_key, auth.uid())
  RETURNING * INTO v_event;
  PERFORM public.write_cost_audit(
    'factory_attendance_daily_closure_events', v_event.id,
    CASE WHEN p_target_status = 'REOPENED' THEN 'REOPEN' ELSE 'CLOSE' END,
    jsonb_build_object('status', v_current), jsonb_build_object('status', p_target_status), v_reason
  );
  RETURN jsonb_build_object('id', v_event.id, 'worker_id', p_worker_id,
    'work_date', p_work_date, 'status', p_target_status, 'reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_factory_attendance_closures(
  p_month_start date
)
RETURNS TABLE (
  worker_id uuid, work_date date, status text, reason text, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_month_end date := ((p_month_start + INTERVAL '1 month')::date - 1);
BEGIN
  IF NOT public.has_production_permission('production_view')
     AND NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem chốt công';
  END IF;
  IF p_month_start IS NULL OR p_month_start <> date_trunc('month', p_month_start)::date THEN
    RAISE EXCEPTION 'Tháng báo cáo không hợp lệ';
  END IF;
  RETURN QUERY
  SELECT DISTINCT ON (e.worker_id, e.work_date)
    e.worker_id, e.work_date, e.status, e.reason, e.created_at
  FROM public.factory_attendance_daily_closure_events e
  WHERE e.tenant_id = v_tenant AND e.work_date BETWEEN p_month_start AND v_month_end
  ORDER BY e.worker_id, e.work_date, e.event_sequence DESC;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Overtime capture (amount is deliberately deferred to payroll policy)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.factory_overtime_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  worker_id uuid NOT NULL REFERENCES public.production_workers(id) ON DELETE RESTRICT,
  work_date date NOT NULL,
  overtime_type text NOT NULL CHECK (overtime_type IN ('NORMAL_OVERTIME', 'SUNDAY_OVERTIME', 'HOLIDAY_OVERTIME')),
  overtime_minutes integer NOT NULL CHECK (overtime_minutes > 0 AND overtime_minutes <= 1440),
  reason text NOT NULL CHECK (NULLIF(btrim(reason), '') IS NOT NULL),
  idempotency_key text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS factory_overtime_month_idx
  ON public.factory_overtime_records (tenant_id, work_date, worker_id);

CREATE TABLE IF NOT EXISTS public.factory_overtime_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tenant_id text NOT NULL DEFAULT 'default',
  overtime_record_id uuid NOT NULL REFERENCES public.factory_overtime_records(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'LOCKED')),
  reason text,
  idempotency_key text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS factory_overtime_workflow_record_idx
  ON public.factory_overtime_workflow_events (tenant_id, overtime_record_id, created_at DESC);

DROP TRIGGER IF EXISTS factory_overtime_workflow_immutable ON public.factory_overtime_workflow_events;
CREATE TRIGGER factory_overtime_workflow_immutable
BEFORE UPDATE OR DELETE ON public.factory_overtime_workflow_events
FOR EACH ROW EXECUTE FUNCTION public.guard_factory_attendance_workflow_immutable();

CREATE OR REPLACE FUNCTION public.seed_factory_overtime_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.factory_overtime_workflow_events (
    tenant_id, overtime_record_id, status, idempotency_key, actor_id
  ) VALUES (NEW.tenant_id, NEW.id, 'SUBMITTED', 'overtime-submit:' || NEW.id::text, NEW.created_by)
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS factory_overtime_submission_event ON public.factory_overtime_records;
CREATE TRIGGER factory_overtime_submission_event
AFTER INSERT ON public.factory_overtime_records
FOR EACH ROW EXECUTE FUNCTION public.seed_factory_overtime_submission();

CREATE OR REPLACE FUNCTION public.current_factory_overtime_status(p_record_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT e.status FROM public.factory_overtime_workflow_events e
    WHERE e.overtime_record_id = p_record_id
      AND e.tenant_id = COALESCE((SELECT o.tenant_id FROM public.factory_overtime_records o WHERE o.id = p_record_id), 'default')
    ORDER BY e.event_sequence DESC LIMIT 1
  ), 'APPROVED')
$$;

CREATE OR REPLACE FUNCTION public.validate_factory_overtime_open_day()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.current_factory_attendance_closure(NEW.worker_id, NEW.work_date) = 'LEADER_CONFIRMED' THEN
    RAISE EXCEPTION 'Ngày công đã được quản lý chốt; hãy mở lại trước khi ghi tăng ca';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS factory_overtime_open_day ON public.factory_overtime_records;
CREATE TRIGGER factory_overtime_open_day
BEFORE INSERT ON public.factory_overtime_records
FOR EACH ROW EXECUTE FUNCTION public.validate_factory_overtime_open_day();

CREATE OR REPLACE FUNCTION public.record_factory_overtime(
  p_worker_id uuid,
  p_work_date date,
  p_overtime_type text,
  p_overtime_minutes integer,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_worker public.production_workers;
  v_existing public.factory_overtime_records;
  v_record public.factory_overtime_records;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_key text := NULLIF(btrim(p_idempotency_key), '');
BEGIN
  IF NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền ghi nhận tăng ca';
  END IF;
  IF v_key IS NULL OR v_reason IS NULL THEN RAISE EXCEPTION 'Lý do và mã yêu cầu là bắt buộc'; END IF;
  IF p_work_date IS NULL OR p_work_date > CURRENT_DATE THEN RAISE EXCEPTION 'Ngày tăng ca không hợp lệ'; END IF;
  IF p_overtime_type NOT IN ('NORMAL_OVERTIME', 'SUNDAY_OVERTIME', 'HOLIDAY_OVERTIME') THEN
    RAISE EXCEPTION 'Loại tăng ca không hợp lệ';
  END IF;
  IF p_overtime_minutes IS NULL OR p_overtime_minutes <= 0 OR p_overtime_minutes > 1440 THEN
    RAISE EXCEPTION 'Số phút tăng ca phải từ 1 đến 1440';
  END IF;
  SELECT * INTO v_worker FROM public.production_workers WHERE id = p_worker_id AND tenant_id = v_tenant AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nhân sự không tồn tại hoặc không hoạt động'; END IF;

  SELECT * INTO v_existing FROM public.factory_overtime_records
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.worker_id <> p_worker_id OR v_existing.work_date <> p_work_date
       OR v_existing.overtime_type <> p_overtime_type OR v_existing.overtime_minutes <> p_overtime_minutes
       OR v_existing.reason <> v_reason THEN
      RAISE EXCEPTION 'Mã yêu cầu đã được dùng cho tăng ca khác';
    END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'reused', true, 'status', public.current_factory_overtime_status(v_existing.id));
  END IF;

  INSERT INTO public.factory_overtime_records (
    tenant_id, worker_id, work_date, overtime_type, overtime_minutes, reason, idempotency_key, created_by
  ) VALUES (v_tenant, p_worker_id, p_work_date, p_overtime_type, p_overtime_minutes, v_reason, v_key, auth.uid())
  RETURNING * INTO v_record;
  PERFORM public.write_cost_audit('factory_overtime_records', v_record.id, 'OVERTIME_CREATE', NULL, to_jsonb(v_record), v_reason);
  RETURN jsonb_build_object('id', v_record.id, 'reused', false, 'status', 'SUBMITTED');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_factory_overtime_status(
  p_overtime_record_id uuid,
  p_target_status text,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_record public.factory_overtime_records;
  v_existing public.factory_overtime_workflow_events;
  v_event public.factory_overtime_workflow_events;
  v_current text;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_key text := NULLIF(btrim(p_idempotency_key), '');
BEGIN
  IF v_key IS NULL THEN RAISE EXCEPTION 'Mã yêu cầu workflow là bắt buộc'; END IF;
  IF p_target_status NOT IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'LOCKED') THEN RAISE EXCEPTION 'Trạng thái tăng ca không hợp lệ'; END IF;
  IF p_target_status IN ('REJECTED', 'LOCKED') AND v_reason IS NULL THEN RAISE EXCEPTION 'Lý do là bắt buộc'; END IF;
  -- Serialize workflow transitions before reading the current status.
  PERFORM pg_advisory_xact_lock(hashtextextended('factory-overtime-workflow:' || v_tenant || ':' || p_overtime_record_id::text, 0));
  SELECT * INTO v_existing FROM public.factory_overtime_workflow_events
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN RETURN jsonb_build_object('id', v_existing.id, 'status', v_existing.status, 'reused', true); END IF;
  SELECT * INTO v_record FROM public.factory_overtime_records WHERE id = p_overtime_record_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bản ghi tăng ca không tồn tại'; END IF;
  v_current := public.current_factory_overtime_status(v_record.id);
  IF p_target_status = 'SUBMITTED' AND v_current <> 'REJECTED' THEN RAISE EXCEPTION 'Chỉ tăng ca bị từ chối mới được gửi lại'; END IF;
  IF p_target_status IN ('APPROVED', 'REJECTED') AND v_current <> 'SUBMITTED' THEN RAISE EXCEPTION 'Chỉ tăng ca chờ duyệt mới được xử lý'; END IF;
  IF p_target_status = 'LOCKED' AND v_current <> 'APPROVED' THEN RAISE EXCEPTION 'Chỉ tăng ca đã duyệt mới được khóa'; END IF;
  IF p_target_status = 'SUBMITTED' THEN
    IF NOT public.has_production_permission('production_operations') AND NOT public.has_production_permission('production_manage') THEN RAISE EXCEPTION 'Bạn không có quyền gửi lại tăng ca'; END IF;
  ELSIF NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền duyệt hoặc khóa tăng ca';
  END IF;
  INSERT INTO public.factory_overtime_workflow_events (
    tenant_id, overtime_record_id, status, reason, idempotency_key, actor_id
  ) VALUES (v_tenant, v_record.id, p_target_status, v_reason, v_key, auth.uid())
  RETURNING * INTO v_event;
  PERFORM public.write_cost_audit(
    'factory_overtime_records', v_record.id,
    CASE p_target_status WHEN 'SUBMITTED' THEN 'SUBMIT' WHEN 'APPROVED' THEN 'APPROVE'
      WHEN 'REJECTED' THEN 'REJECT' ELSE 'LOCK' END,
    jsonb_build_object('status', v_current), jsonb_build_object('status', p_target_status), v_reason
  );
  RETURN jsonb_build_object('id', v_event.id, 'status', v_event.status, 'reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_factory_overtime_month(p_month_start date)
RETURNS TABLE (
  id uuid, worker_id uuid, employee_code text, worker_name text, worker_type text,
  work_date date, overtime_type text, overtime_minutes integer, reason text,
  status text, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_month_end date := ((p_month_start + INTERVAL '1 month')::date - 1);
BEGIN
  IF NOT public.has_production_permission('production_view')
     AND NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem tăng ca';
  END IF;
  IF p_month_start IS NULL OR p_month_start <> date_trunc('month', p_month_start)::date THEN RAISE EXCEPTION 'Tháng báo cáo không hợp lệ'; END IF;
  RETURN QUERY
  SELECT o.id, o.worker_id, w.employee_code, w.display_name, w.worker_type,
    o.work_date, o.overtime_type, o.overtime_minutes, o.reason,
    public.current_factory_overtime_status(o.id), o.created_at
  FROM public.factory_overtime_records o
  JOIN public.production_workers w ON w.id = o.worker_id AND w.tenant_id = o.tenant_id
  WHERE o.tenant_id = v_tenant AND o.work_date BETWEEN p_month_start AND v_month_end
  ORDER BY o.work_date DESC, o.created_at DESC;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Read model with workflow status
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_factory_attendance_month_v3(
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
  cost_visible boolean, is_reversed boolean, reversal_reason text,
  workflow_status text, workflow_reason text, workflow_at timestamptz,
  closure_status text
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
  IF p_month_start IS NULL OR p_month_start <> date_trunc('month', p_month_start)::date THEN RAISE EXCEPTION 'Tháng báo cáo không hợp lệ'; END IF;
  RETURN QUERY
  SELECT * FROM (
    SELECT f.id, 'FACTORY'::text, NULL::uuid, NULL::text, NULL::uuid, NULL::text, NULL::text,
      f.worker_id, w.employee_code, w.display_name, w.worker_type, f.attendance_method,
      f.work_date, NULLIF(f.day_units, 0), NULLIF(f.work_hours, 0), f.check_in_time, f.check_out_time,
      f.break_minutes, NULLIF(f.output_quantity, 0), f.activity_name,
      CASE WHEN v_cost_visible THEN f.rate_amount ELSE NULL END,
      CASE WHEN v_cost_visible THEN f.calculated_amount ELSE NULL END,
      f.cost_classification, f.is_estimated, f.notes, f.created_at, v_cost_visible,
      (r.id IS NOT NULL), r.reason,
      CASE WHEN r.id IS NOT NULL THEN 'REVERSED' ELSE public.current_factory_attendance_status(f.id) END,
      COALESCE(r.reason, (SELECT e.reason FROM public.factory_attendance_workflow_events e WHERE e.attendance_record_id = f.id ORDER BY e.event_sequence DESC LIMIT 1)),
      COALESCE(r.created_at, (SELECT e.created_at FROM public.factory_attendance_workflow_events e WHERE e.attendance_record_id = f.id ORDER BY e.event_sequence DESC LIMIT 1)),
      public.current_factory_attendance_closure(f.worker_id, f.work_date)
    FROM public.factory_attendance_records f
    JOIN public.production_workers w ON w.id = f.worker_id AND w.tenant_id = f.tenant_id
    LEFT JOIN public.factory_attendance_reversals r ON r.attendance_record_id = f.id AND r.tenant_id = f.tenant_id
    WHERE f.tenant_id = v_tenant AND f.work_date BETWEEN p_month_start AND v_month_end
      AND (p_include_reversed OR r.id IS NULL)
    UNION ALL
    SELECT f.id, 'PRODUCTION_LEGACY'::text, f.production_order_id, po.production_order_number,
      f.production_order_operation_id, o.operation_code, o.operation_name, f.worker_id,
      w.employee_code, w.display_name, w.worker_type,
      CASE WHEN f.compensation_type IN ('MONTHLY_MANAGER','MONTHLY_HELPER') THEN 'DAY'
        WHEN f.compensation_type = 'HOURLY' THEN 'HOUR' ELSE 'OUTPUT' END,
      f.fact_date,
      CASE WHEN f.compensation_type IN ('MONTHLY_MANAGER','MONTHLY_HELPER') THEN f.quantity ELSE NULL END,
      CASE WHEN f.compensation_type = 'HOURLY' THEN f.minutes / 60.0 ELSE NULL END,
      NULL::time, NULL::time, 0,
      CASE WHEN f.compensation_type = 'PIECE_RATE' THEN f.accepted_quantity ELSE NULL END,
      o.operation_name, CASE WHEN v_cost_visible THEN f.rate_amount ELSE NULL END,
      CASE WHEN v_cost_visible THEN f.calculated_amount ELSE NULL END,
      f.cost_classification, f.is_estimated, f.notes, f.created_at, v_cost_visible,
      (r.id IS NOT NULL), r.reason,
      CASE WHEN r.id IS NOT NULL THEN 'REVERSED' ELSE 'APPROVED' END,
      r.reason, r.created_at, public.current_factory_attendance_closure(f.worker_id, f.fact_date)
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

-- RPC-only access. Direct table writes remain denied.
ALTER TABLE public.factory_attendance_workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_attendance_daily_closure_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_overtime_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_overtime_workflow_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.factory_attendance_workflow_events, public.factory_attendance_daily_closure_events,
  public.factory_overtime_records, public.factory_overtime_workflow_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_factory_attendance_workflow_immutable(), public.seed_factory_attendance_submission(),
  public.seed_factory_overtime_submission() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_factory_attendance_status(uuid), public.current_factory_attendance_closure(uuid,date),
  public.current_factory_overtime_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_factory_attendance_status(uuid,text,text,text),
  public.set_factory_attendance_day_closure(uuid,date,text,text,text),
  public.record_factory_overtime(uuid,date,text,integer,text,text),
  public.set_factory_overtime_status(uuid,text,text,text),
  public.list_factory_attendance_closures(date), public.list_factory_overtime_month(date),
  public.list_factory_attendance_month_v3(date,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_factory_attendance_status(uuid,text,text,text),
  public.set_factory_attendance_day_closure(uuid,date,text,text,text),
  public.record_factory_overtime(uuid,date,text,integer,text,text),
  public.set_factory_overtime_status(uuid,text,text,text),
  public.list_factory_attendance_closures(date), public.list_factory_overtime_month(date),
  public.list_factory_attendance_month_v3(date,boolean) TO authenticated;

COMMIT;
