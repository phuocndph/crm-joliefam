-- Prevent the compatibility attendance RPC from creating hourly rows without
-- check-in/check-out timestamps. Hourly factory attendance must use the
-- time-clock RPC so the source data is complete and auditable.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.record_factory_attendance_hour_guard_base(uuid,text,date,numeric,numeric,numeric,numeric,text,text,text)') IS NULL
     AND to_regprocedure('public.record_factory_attendance(uuid,text,date,numeric,numeric,numeric,numeric,text,text,text)') IS NOT NULL THEN
    ALTER FUNCTION public.record_factory_attendance(
      uuid, text, date, numeric, numeric, numeric, numeric, text, text, text
    ) RENAME TO record_factory_attendance_hour_guard_base;
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
  IF p_attendance_method = 'HOUR' THEN
    RAISE EXCEPTION 'Chấm công theo giờ phải dùng chức năng có giờ đến và giờ về';
  END IF;

  RETURN public.record_factory_attendance_hour_guard_base(
    p_worker_id, p_attendance_method, p_work_date, p_day_units,
    p_work_hours, p_output_quantity, p_standard_hours_per_day,
    p_activity_name, p_idempotency_key, p_notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_factory_attendance_hour_guard_base(
  uuid, text, date, numeric, numeric, numeric, numeric, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_factory_attendance(
  uuid, text, date, numeric, numeric, numeric, numeric, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_factory_attendance(
  uuid, text, date, numeric, numeric, numeric, numeric, text, text, text
) TO authenticated;

COMMENT ON FUNCTION public.record_factory_attendance(
  uuid, text, date, numeric, numeric, numeric, numeric, text, text, text
) IS 'Factory attendance entry for day/output methods; hourly records must use record_factory_hour_attendance.';

COMMIT;
