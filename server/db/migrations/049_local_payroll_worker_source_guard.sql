-- Local-only concurrency boundary for payroll eligibility. Worker master
-- changes can alter a payroll run's eligible scope, so they share the same
-- transaction advisory lock as attendance/source writes. A statement-level
-- trigger avoids a row-by-row lock loop during workbook imports.

CREATE OR REPLACE FUNCTION local_lock_payroll_worker_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(
    'local-attendance-payroll-source-guard',
    0
  ));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS local_workers_payroll_source_guard ON local_workers;
CREATE TRIGGER local_workers_payroll_source_guard
  BEFORE INSERT OR UPDATE OR DELETE ON local_workers
  FOR EACH STATEMENT EXECUTE FUNCTION local_lock_payroll_worker_write();
