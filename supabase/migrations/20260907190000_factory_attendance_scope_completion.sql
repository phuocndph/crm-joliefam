-- Complete server-side scope enforcement for independent factory attendance.
-- This migration keeps the public RPC names stable while making the remaining
-- day-status, reversal, and attendance-method endpoints fail closed.

BEGIN;

-- The preceding hardening migrations may have named the canonical
-- implementation either *_v1 or left the original name in place on an older
-- installation. Normalize it to a private implementation before adding the
-- scope wrapper.
DO $$
BEGIN
  IF to_regprocedure('public.set_factory_attendance_day_status_scope_base(uuid,date,text,boolean,text,text)') IS NULL THEN
    -- Prefer the current public wrapper. On the full migration chain it
    -- already contains the manager-only policy and the invariant checks; the
    -- older *_v1 function is its private delegate.
    IF to_regprocedure('public.set_factory_attendance_day_status(uuid,date,text,boolean,text,text)') IS NOT NULL THEN
      ALTER FUNCTION public.set_factory_attendance_day_status(
        uuid, date, text, boolean, text, text
      ) RENAME TO set_factory_attendance_day_status_scope_base;
    ELSIF to_regprocedure('public.set_factory_attendance_day_status_v1(uuid,date,text,boolean,text,text)') IS NOT NULL THEN
      ALTER FUNCTION public.set_factory_attendance_day_status_v1(
        uuid, date, text, boolean, text, text
      ) RENAME TO set_factory_attendance_day_status_scope_base;
    END IF;
  END IF;
END;
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
BEGIN
  -- Check scope before reading idempotency/state so an operator cannot use
  -- this endpoint as a cross-worker existence oracle. The canonical function
  -- still enforces the manager-only policy for day classification.
  IF NOT public.factory_attendance_worker_in_scope(p_worker_id, p_work_date) THEN
    RAISE EXCEPTION 'Bạn không có quyền cập nhật trạng thái cho nhân sự này';
  END IF;
  RETURN public.set_factory_attendance_day_status_scope_base(
    p_worker_id, p_work_date, p_status, p_meal_eligible, p_reason, p_idempotency_key
  );
END;
$$;

-- Reversal is manager-only, but the scope check is still applied before the
-- private implementation so non-manager callers cannot probe another worker.
DO $$
BEGIN
  IF to_regprocedure('public.reverse_factory_attendance_scope_base(uuid,text,text)') IS NULL THEN
    -- The public function from the concurrency migration performs the
    -- closed-day check and delegates to *_v1. Keep that layer intact.
    IF to_regprocedure('public.reverse_factory_attendance(uuid,text,text)') IS NOT NULL THEN
      ALTER FUNCTION public.reverse_factory_attendance(uuid, text, text)
        RENAME TO reverse_factory_attendance_scope_base;
    ELSIF to_regprocedure('public.reverse_factory_attendance_v1(uuid,text,text)') IS NOT NULL THEN
      ALTER FUNCTION public.reverse_factory_attendance_v1(uuid, text, text)
        RENAME TO reverse_factory_attendance_scope_base;
    END IF;
  END IF;
END;
$$;

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
  v_worker_id uuid;
  v_work_date date;
BEGIN
  SELECT f.worker_id, f.work_date
  INTO v_worker_id, v_work_date
  FROM public.factory_attendance_records f
  WHERE f.id = p_attendance_record_id
    AND f.tenant_id = public.require_default_tenant();

  IF NOT FOUND OR NOT public.factory_attendance_worker_in_scope(v_worker_id, v_work_date) THEN
    RAISE EXCEPTION 'Bạn không có quyền đảo bản ghi chấm công này';
  END IF;

  RETURN public.reverse_factory_attendance_scope_base(
    p_attendance_record_id, p_reason, p_idempotency_key
  );
END;
$$;

-- Restrict the legacy attendance-method directory to the same worker scope as
-- the attendance rows. This prevents a worker from discovering other workers'
-- compensation mode through a separate RPC.
DO $$
BEGIN
  IF to_regprocedure('public.list_worker_attendance_methods_scope_base()') IS NULL
     AND to_regprocedure('public.list_worker_attendance_methods()') IS NOT NULL THEN
    ALTER FUNCTION public.list_worker_attendance_methods()
      RENAME TO list_worker_attendance_methods_scope_base;
  END IF;
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
BEGIN
  RETURN QUERY
  SELECT b.worker_id, b.attendance_method, b.compensation_type
  FROM public.list_worker_attendance_methods_scope_base() b
  WHERE public.factory_attendance_worker_in_scope(b.worker_id, CURRENT_DATE);
END;
$$;

REVOKE ALL ON FUNCTION public.set_factory_attendance_day_status_scope_base(
  uuid, date, text, boolean, text, text
), public.reverse_factory_attendance_scope_base(uuid, text, text),
  public.list_worker_attendance_methods_scope_base()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_factory_attendance_day_status(
  uuid, date, text, boolean, text, text
), public.reverse_factory_attendance(uuid, text, text),
  public.list_worker_attendance_methods()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_factory_attendance_day_status(
  uuid, date, text, boolean, text, text
), public.reverse_factory_attendance(uuid, text, text),
  public.list_worker_attendance_methods()
TO authenticated;

COMMENT ON FUNCTION public.set_factory_attendance_day_status(uuid, date, text, boolean, text, text) IS
  'Scope-checked day classification wrapper; manager policy remains in the private implementation.';
COMMENT ON FUNCTION public.reverse_factory_attendance(uuid, text, text) IS
  'Scope-checked append-only attendance reversal wrapper.';
COMMENT ON FUNCTION public.list_worker_attendance_methods() IS
  'Scope-filtered attendance method directory.';

COMMIT;
