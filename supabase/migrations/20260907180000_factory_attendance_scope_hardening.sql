-- Factory attendance scope hardening.
--
-- Attendance operators may submit data for their own linked worker. A team
-- supervisor may work with workers assigned to them for the effective date,
-- while managers/admins (or an explicitly delegated production manager) may
-- work with the whole tenant. The checks live in SECURITY DEFINER functions so
-- they cannot be bypassed by the client or by direct table access.

BEGIN;

CREATE OR REPLACE FUNCTION public.factory_attendance_can_manage_all()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_production_permission('production_manage')
    OR public.has_production_permission('production_worker_manage')
  )
$$;

CREATE OR REPLACE FUNCTION public.factory_attendance_worker_in_scope(
  p_worker_id uuid,
  p_on_date date DEFAULT CURRENT_DATE
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_team_scope boolean := false;
BEGIN
  IF v_user_id IS NULL OR p_worker_id IS NULL OR p_on_date IS NULL THEN
    RETURN false;
  END IF;

  IF public.factory_attendance_can_manage_all() THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.production_workers w
      WHERE w.id = p_worker_id AND w.tenant_id = 'default'
    );
  END IF;

  -- A worker can always submit/view their own attendance when the worker
  -- master is linked to the authenticated account.
  IF EXISTS (
    SELECT 1
    FROM public.production_workers w
    WHERE w.id = p_worker_id
      AND w.tenant_id = 'default'
      AND w.user_id = v_user_id
  ) THEN
    RETURN true;
  END IF;

  -- Payroll team assignments are optional during the rollout. Referencing
  -- them dynamically keeps the attendance migration installable on projects
  -- that have not yet received the payroll master-data migrations.
  IF to_regclass('public.payroll_team_assignments') IS NOT NULL THEN
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1
        FROM public.payroll_team_assignments a
        JOIN public.production_workers supervisor
          ON supervisor.id = a.supervisor_worker_id
         AND supervisor.tenant_id = a.tenant_id
        WHERE a.tenant_id = 'default'
          AND a.worker_id = $1
          AND supervisor.user_id = $2
          AND supervisor.is_active
          AND a.status = 'ACTIVE'
          AND a.effective_from <= $3
          AND (a.effective_to IS NULL OR a.effective_to >= $3)
      )
    $query$
    INTO v_team_scope
    USING p_worker_id, v_user_id, p_on_date;
  END IF;

  RETURN v_team_scope;
END;
$$;

-- The attendance screen receives only the worker columns it needs. It no
-- longer reads production_workers directly, which prevents a broad SELECT
-- from becoming an accidental worker directory endpoint.
-- Older deployments may already have this RPC with a different OUT signature;
-- PostgreSQL cannot replace a function when its return row type changes.
DROP FUNCTION IF EXISTS public.list_factory_attendance_workers();
CREATE OR REPLACE FUNCTION public.list_factory_attendance_workers()
RETURNS TABLE (
  id uuid,
  tenant_id text,
  user_id uuid,
  employee_code text,
  display_name text,
  primary_cost_center_id uuid,
  worker_type text,
  is_active boolean,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_production_permission('production_view')
     AND NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem nhân sự chấm công';
  END IF;

  RETURN QUERY
  SELECT w.id, w.tenant_id, w.user_id, w.employee_code, w.display_name,
    w.primary_cost_center_id, w.worker_type, w.is_active, w.created_by,
    w.created_at, w.updated_at
  FROM public.production_workers w
  WHERE w.tenant_id = 'default'
    AND w.is_active
    AND public.factory_attendance_worker_in_scope(w.id, CURRENT_DATE)
  ORDER BY w.employee_code;
END;
$$;

-- Restrict direct worker reads as a second line of defence for other screens.
DROP POLICY IF EXISTS production_workers_select ON public.production_workers;
CREATE POLICY production_workers_select
ON public.production_workers FOR SELECT TO authenticated
USING (
  tenant_id = 'default'
  AND (
    public.has_production_permission('production_view')
    OR public.has_production_permission('production_operations')
    OR public.has_production_permission('production_manage')
  )
  AND public.factory_attendance_worker_in_scope(id, CURRENT_DATE)
);

-- Keep the old implementation private and add a scope gate at the public RPC.
DO $$
BEGIN
  IF to_regprocedure('public.record_factory_attendance_scope_base(uuid,text,date,numeric,numeric,numeric,numeric,text,text,text)') IS NULL
     AND to_regprocedure('public.record_factory_attendance(uuid,text,date,numeric,numeric,numeric,numeric,text,text,text)') IS NOT NULL THEN
    ALTER FUNCTION public.record_factory_attendance(
      uuid, text, date, numeric, numeric, numeric, numeric, text, text, text
    ) RENAME TO record_factory_attendance_scope_base;
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
BEGIN
  IF NOT public.factory_attendance_worker_in_scope(p_worker_id, COALESCE(p_work_date, CURRENT_DATE)) THEN
    RAISE EXCEPTION 'Bạn không có quyền chấm công cho nhân sự này';
  END IF;
  RETURN public.record_factory_attendance_scope_base(
    p_worker_id, p_attendance_method, p_work_date, p_day_units, p_work_hours,
    p_output_quantity, p_standard_hours_per_day, p_activity_name,
    p_idempotency_key, p_notes
  );
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.record_factory_hour_attendance_scope_base(uuid,date,time,time,integer,text,text,text)') IS NULL
     AND to_regprocedure('public.record_factory_hour_attendance(uuid,date,time,time,integer,text,text,text)') IS NOT NULL THEN
    ALTER FUNCTION public.record_factory_hour_attendance(
      uuid, date, time, time, integer, text, text, text
    ) RENAME TO record_factory_hour_attendance_scope_base;
  END IF;
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
BEGIN
  IF NOT public.factory_attendance_worker_in_scope(p_worker_id, p_work_date) THEN
    RAISE EXCEPTION 'Bạn không có quyền chấm công cho nhân sự này';
  END IF;
  RETURN public.record_factory_hour_attendance_scope_base(
    p_worker_id, p_work_date, p_check_in_time, p_check_out_time,
    p_break_minutes, p_activity_name, p_idempotency_key, p_notes
  );
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.record_factory_overtime_scope_base(uuid,date,text,integer,text,text)') IS NULL
     AND to_regprocedure('public.record_factory_overtime(uuid,date,text,integer,text,text)') IS NOT NULL THEN
    ALTER FUNCTION public.record_factory_overtime(
      uuid, date, text, integer, text, text
    ) RENAME TO record_factory_overtime_scope_base;
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
BEGIN
  IF NOT public.factory_attendance_worker_in_scope(p_worker_id, p_work_date) THEN
    RAISE EXCEPTION 'Bạn không có quyền ghi tăng ca cho nhân sự này';
  END IF;
  RETURN public.record_factory_overtime_scope_base(
    p_worker_id, p_work_date, p_overtime_type, p_overtime_minutes,
    p_reason, p_idempotency_key
  );
END;
$$;

-- Resubmission/employee confirmation is also scope checked. Approval, locking,
-- manager closure and reversal remain manager-only in the existing workflow.
DO $$
BEGIN
  IF to_regprocedure('public.set_factory_attendance_status_scope_base(uuid,text,text,text)') IS NULL
     AND to_regprocedure('public.set_factory_attendance_status(uuid,text,text,text)') IS NOT NULL THEN
    ALTER FUNCTION public.set_factory_attendance_status(
      uuid, text, text, text
    ) RENAME TO set_factory_attendance_status_scope_base;
  END IF;
END;
$$;

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
  v_worker_id uuid;
  v_work_date date;
BEGIN
  IF p_target_status = 'SUBMITTED' THEN
    SELECT f.worker_id, f.work_date
    INTO v_worker_id, v_work_date
    FROM public.factory_attendance_records f
    WHERE f.id = p_attendance_record_id
      AND f.tenant_id = public.require_default_tenant();
    IF NOT FOUND OR NOT public.factory_attendance_worker_in_scope(v_worker_id, v_work_date) THEN
      RAISE EXCEPTION 'Bạn không có quyền gửi lại chấm công cho nhân sự này';
    END IF;
  END IF;
  RETURN public.set_factory_attendance_status_scope_base(
    p_attendance_record_id, p_target_status, p_reason, p_idempotency_key
  );
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.set_factory_overtime_status_scope_base(uuid,text,text,text)') IS NULL
     AND to_regprocedure('public.set_factory_overtime_status(uuid,text,text,text)') IS NOT NULL THEN
    ALTER FUNCTION public.set_factory_overtime_status(
      uuid, text, text, text
    ) RENAME TO set_factory_overtime_status_scope_base;
  END IF;
END;
$$;

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
  v_worker_id uuid;
  v_work_date date;
BEGIN
  IF p_target_status = 'SUBMITTED' THEN
    SELECT o.worker_id, o.work_date
    INTO v_worker_id, v_work_date
    FROM public.factory_overtime_records o
    WHERE o.id = p_overtime_record_id
      AND o.tenant_id = public.require_default_tenant();
    IF NOT FOUND OR NOT public.factory_attendance_worker_in_scope(v_worker_id, v_work_date) THEN
      RAISE EXCEPTION 'Bạn không có quyền gửi lại tăng ca cho nhân sự này';
    END IF;
  END IF;
  RETURN public.set_factory_overtime_status_scope_base(
    p_overtime_record_id, p_target_status, p_reason, p_idempotency_key
  );
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.set_factory_attendance_day_closure_scope_base(uuid,date,text,text,text)') IS NULL
     AND to_regprocedure('public.set_factory_attendance_day_closure(uuid,date,text,text,text)') IS NOT NULL THEN
    ALTER FUNCTION public.set_factory_attendance_day_closure(
      uuid, date, text, text, text
    ) RENAME TO set_factory_attendance_day_closure_scope_base;
  END IF;
END;
$$;

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
BEGIN
  IF p_target_status = 'EMPLOYEE_CONFIRMED'
     AND NOT public.factory_attendance_worker_in_scope(p_worker_id, p_work_date) THEN
    RAISE EXCEPTION 'Bạn không có quyền xác nhận ngày công cho nhân sự này';
  END IF;
  RETURN public.set_factory_attendance_day_closure_scope_base(
    p_worker_id, p_work_date, p_target_status, p_reason, p_idempotency_key
  );
END;
$$;

-- Scope the read models without exposing the private implementation functions.
DO $$
BEGIN
  IF to_regprocedure('public.list_factory_attendance_month_scope_base(date,boolean)') IS NULL
     AND to_regprocedure('public.list_factory_attendance_month(date,boolean)') IS NOT NULL THEN
    ALTER FUNCTION public.list_factory_attendance_month(date, boolean)
      RENAME TO list_factory_attendance_month_scope_base;
  END IF;
  IF to_regprocedure('public.list_factory_attendance_month_v2_scope_base(date,boolean)') IS NULL
     AND to_regprocedure('public.list_factory_attendance_month_v2(date,boolean)') IS NOT NULL THEN
    ALTER FUNCTION public.list_factory_attendance_month_v2(date, boolean)
      RENAME TO list_factory_attendance_month_v2_scope_base;
  END IF;
  IF to_regprocedure('public.list_factory_attendance_month_v3_scope_base(date,boolean)') IS NULL
     AND to_regprocedure('public.list_factory_attendance_month_v3(date,boolean)') IS NOT NULL THEN
    ALTER FUNCTION public.list_factory_attendance_month_v3(date, boolean)
      RENAME TO list_factory_attendance_month_v3_scope_base;
  END IF;
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
BEGIN
  RETURN QUERY
  SELECT b.*
  FROM public.list_factory_attendance_month_scope_base(p_month_start, p_include_reversed) b
  WHERE public.factory_attendance_worker_in_scope(b.worker_id, b.work_date);
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
BEGIN
  RETURN QUERY
  SELECT b.*
  FROM public.list_factory_attendance_month_v2_scope_base(p_month_start, p_include_reversed) b
  WHERE public.factory_attendance_worker_in_scope(b.worker_id, b.work_date);
END;
$$;

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
  workflow_status text, workflow_reason text, workflow_at timestamptz, closure_status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT b.*
  FROM public.list_factory_attendance_month_v3_scope_base(p_month_start, p_include_reversed) b
  WHERE public.factory_attendance_worker_in_scope(b.worker_id, b.work_date);
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.list_factory_attendance_closures_scope_base(date)') IS NULL
     AND to_regprocedure('public.list_factory_attendance_closures(date)') IS NOT NULL THEN
    ALTER FUNCTION public.list_factory_attendance_closures(date)
      RENAME TO list_factory_attendance_closures_scope_base;
  END IF;
  IF to_regprocedure('public.list_factory_attendance_day_status_month_scope_base(date)') IS NULL
     AND to_regprocedure('public.list_factory_attendance_day_status_month(date)') IS NOT NULL THEN
    ALTER FUNCTION public.list_factory_attendance_day_status_month(date)
      RENAME TO list_factory_attendance_day_status_month_scope_base;
  END IF;
  IF to_regprocedure('public.list_factory_overtime_month_scope_base(date)') IS NULL
     AND to_regprocedure('public.list_factory_overtime_month(date)') IS NOT NULL THEN
    ALTER FUNCTION public.list_factory_overtime_month(date)
      RENAME TO list_factory_overtime_month_scope_base;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_factory_attendance_closures(p_month_start date)
RETURNS TABLE(worker_id uuid, work_date date, status text, reason text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT b.*
  FROM public.list_factory_attendance_closures_scope_base(p_month_start) b
  WHERE public.factory_attendance_worker_in_scope(b.worker_id, b.work_date);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_factory_attendance_day_status_month(p_month_start date)
RETURNS TABLE(
  worker_id uuid, employee_code text, worker_name text, worker_type text,
  work_date date, status text, meal_eligible boolean, reason text, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT b.*
  FROM public.list_factory_attendance_day_status_month_scope_base(p_month_start) b
  WHERE public.factory_attendance_worker_in_scope(b.worker_id, b.work_date);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_factory_overtime_month(p_month_start date)
RETURNS TABLE(
  id uuid, worker_id uuid, employee_code text, worker_name text, worker_type text,
  work_date date, overtime_type text, overtime_minutes integer, reason text,
  status text, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT b.*
  FROM public.list_factory_overtime_month_scope_base(p_month_start) b
  WHERE public.factory_attendance_worker_in_scope(b.worker_id, b.work_date);
END;
$$;

-- Legacy order-linked attendance uses the same scope rule when it is shown on
-- the independent screen or accessed through its compatibility RPC.
DO $$
BEGIN
  IF to_regprocedure('public.record_production_attendance_scope_base(uuid,uuid,text,date,numeric,numeric,numeric,numeric,text,text)') IS NULL
     AND to_regprocedure('public.record_production_attendance(uuid,uuid,text,date,numeric,numeric,numeric,numeric,text,text)') IS NOT NULL THEN
    ALTER FUNCTION public.record_production_attendance(
      uuid, uuid, text, date, numeric, numeric, numeric, numeric, text, text
    ) RENAME TO record_production_attendance_scope_base;
  END IF;
  IF to_regprocedure('public.list_production_attendance_scope_base(uuid)') IS NULL
     AND to_regprocedure('public.list_production_attendance(uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.list_production_attendance(uuid)
      RENAME TO list_production_attendance_scope_base;
  END IF;
  IF to_regprocedure('public.list_production_attendance_month_scope_base(uuid,date,boolean)') IS NULL
     AND to_regprocedure('public.list_production_attendance_month(uuid,date,boolean)') IS NOT NULL THEN
    ALTER FUNCTION public.list_production_attendance_month(uuid, date, boolean)
      RENAME TO list_production_attendance_month_scope_base;
  END IF;
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
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.factory_attendance_worker_in_scope(p_worker_id, COALESCE(p_work_date, CURRENT_DATE)) THEN
    RAISE EXCEPTION 'Bạn không có quyền chấm công cho nhân sự này';
  END IF;
  RETURN public.record_production_attendance_scope_base(
    p_production_order_operation_id, p_worker_id, p_attendance_method,
    p_work_date, p_day_units, p_work_hours, p_output_quantity,
    p_standard_hours_per_day, p_idempotency_key, p_notes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_production_attendance(p_production_order_id uuid)
RETURNS TABLE (
  id uuid, production_order_id uuid, production_order_operation_id uuid,
  operation_code text, operation_name text, worker_id uuid, employee_code text,
  worker_name text, worker_type text, attendance_method text, work_date date,
  day_units numeric, work_hours numeric, output_quantity numeric, rate_amount numeric,
  calculated_amount numeric, cost_classification text, is_estimated boolean,
  notes text, created_at timestamptz, cost_visible boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT b.*
  FROM public.list_production_attendance_scope_base(p_production_order_id) b
  WHERE public.factory_attendance_worker_in_scope(b.worker_id, b.work_date);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_production_attendance_month(
  p_production_order_id uuid, p_month_start date, p_include_reversed boolean DEFAULT false
)
RETURNS TABLE (
  id uuid, production_order_id uuid, production_order_operation_id uuid,
  operation_code text, operation_name text, worker_id uuid, employee_code text,
  worker_name text, worker_type text, attendance_method text, work_date date,
  day_units numeric, work_hours numeric, output_quantity numeric, rate_amount numeric,
  calculated_amount numeric, cost_classification text, is_estimated boolean,
  notes text, created_at timestamptz, cost_visible boolean,
  is_reversed boolean, reversal_reason text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT b.*
  FROM public.list_production_attendance_month_scope_base(
    p_production_order_id, p_month_start, p_include_reversed
  ) b
  WHERE public.factory_attendance_worker_in_scope(b.worker_id, b.work_date);
END;
$$;

-- Internal renamed implementations must never be callable by API roles.
DO $$
DECLARE
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.record_factory_attendance_scope_base(uuid,text,date,numeric,numeric,numeric,numeric,text,text,text)',
    'public.record_factory_hour_attendance_scope_base(uuid,date,time,time,integer,text,text,text)',
    'public.record_factory_overtime_scope_base(uuid,date,text,integer,text,text)',
    'public.set_factory_attendance_status_scope_base(uuid,text,text,text)',
    'public.set_factory_overtime_status_scope_base(uuid,text,text,text)',
    'public.set_factory_attendance_day_closure_scope_base(uuid,date,text,text,text)',
    'public.list_factory_attendance_month_scope_base(date,boolean)',
    'public.list_factory_attendance_month_v2_scope_base(date,boolean)',
    'public.list_factory_attendance_month_v3_scope_base(date,boolean)',
    'public.list_factory_attendance_closures_scope_base(date)',
    'public.list_factory_attendance_day_status_month_scope_base(date)',
    'public.list_factory_overtime_month_scope_base(date)',
    'public.record_production_attendance_scope_base(uuid,uuid,text,date,numeric,numeric,numeric,numeric,text,text)',
    'public.list_production_attendance_scope_base(uuid)',
    'public.list_production_attendance_month_scope_base(uuid,date,boolean)'
  ] LOOP
    IF to_regprocedure(v_signature) IS NOT NULL THEN
      EXECUTE 'REVOKE ALL ON FUNCTION ' || v_signature || ' FROM PUBLIC, anon, authenticated';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.factory_attendance_can_manage_all(),
  public.factory_attendance_worker_in_scope(uuid,date),
  public.list_factory_attendance_workers()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.factory_attendance_worker_in_scope(uuid,date),
  public.list_factory_attendance_workers()
TO authenticated;

REVOKE ALL ON FUNCTION public.record_factory_attendance(
  uuid,text,date,numeric,numeric,numeric,numeric,text,text,text
), public.record_factory_hour_attendance(
  uuid,date,time,time,integer,text,text,text
), public.record_factory_overtime(uuid,date,text,integer,text,text),
  public.set_factory_attendance_status(uuid,text,text,text),
  public.set_factory_overtime_status(uuid,text,text,text),
  public.set_factory_attendance_day_closure(uuid,date,text,text,text),
  public.list_factory_attendance_month(date,boolean),
  public.list_factory_attendance_month_v2(date,boolean),
  public.list_factory_attendance_month_v3(date,boolean),
  public.list_factory_attendance_closures(date),
  public.list_factory_attendance_day_status_month(date),
  public.list_factory_overtime_month(date),
  public.record_production_attendance(uuid,uuid,text,date,numeric,numeric,numeric,numeric,text,text),
  public.list_production_attendance(uuid),
  public.list_production_attendance_month(uuid,date,boolean)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_factory_attendance(
  uuid,text,date,numeric,numeric,numeric,numeric,text,text,text
), public.record_factory_hour_attendance(
  uuid,date,time,time,integer,text,text,text
), public.record_factory_overtime(uuid,date,text,integer,text,text),
  public.set_factory_attendance_status(uuid,text,text,text),
  public.set_factory_overtime_status(uuid,text,text, text),
  public.set_factory_attendance_day_closure(uuid,date,text,text,text),
  public.list_factory_attendance_month(date,boolean),
  public.list_factory_attendance_month_v2(date,boolean),
  public.list_factory_attendance_month_v3(date,boolean),
  public.list_factory_attendance_closures(date),
  public.list_factory_attendance_day_status_month(date),
  public.list_factory_overtime_month(date),
  public.record_production_attendance(uuid,uuid,text,date,numeric,numeric,numeric,numeric,text,text),
  public.list_production_attendance(uuid),
  public.list_production_attendance_month(uuid,date,boolean)
TO authenticated;

COMMENT ON FUNCTION public.factory_attendance_worker_in_scope(uuid,date) IS
  'Server-side attendance scope: linked worker, effective team assignment, or manager-level access.';
COMMENT ON FUNCTION public.list_factory_attendance_workers() IS
  'Minimal, scope-filtered worker directory for the factory attendance screen.';

COMMIT;
