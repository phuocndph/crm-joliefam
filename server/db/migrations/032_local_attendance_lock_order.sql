-- Local-only lock ordering fix. Source writes acquire the payroll-source
-- shared boundary before the worker/day lock, matching the application and
-- payroll snapshot order. Public Supabase data is untouched.
CREATE OR REPLACE FUNCTION local_lock_attendance_source_write(p_worker_id uuid, p_work_date date)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(
    'local-attendance-payroll-source-guard', 0
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'local-attendance-day:local-tenant:' || p_worker_id::text || ':' || p_work_date::text,
    0
  ));
END;
$$;
