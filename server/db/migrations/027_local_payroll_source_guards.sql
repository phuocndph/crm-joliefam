-- Local-only payroll source integrity. Public Supabase data is untouched.
-- Existing snapshot rows are preserved; NOT VALID checks apply to new writes.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'local_attendance_break_minutes_nonnegative') THEN
    ALTER TABLE local_attendance ADD CONSTRAINT local_attendance_break_minutes_nonnegative
      CHECK (break_minutes >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'local_attendance_work_values_nonnegative') THEN
    ALTER TABLE local_attendance ADD CONSTRAINT local_attendance_work_values_nonnegative
      CHECK (
        (day_units IS NULL OR day_units >= 0)
        AND (work_hours IS NULL OR work_hours >= 0)
        AND (worked_minutes IS NULL OR worked_minutes >= 0)
        AND (output_quantity IS NULL OR output_quantity >= 0)
        AND (monthly_salary_snapshot IS NULL OR monthly_salary_snapshot >= 0)
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'local_production_entry_amounts_nonnegative') THEN
    ALTER TABLE local_production_entries ADD CONSTRAINT local_production_entry_amounts_nonnegative
      CHECK ((rate_amount IS NULL OR rate_amount >= 0) AND (calculated_amount IS NULL OR calculated_amount >= 0)) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS local_payroll_items_source_lookup_idx
  ON local_payroll_items(source_type, source_id);

-- The API already checks locked periods.  This trigger is a second line of
-- defence for local scripts/direct SQL so a locked payroll snapshot cannot be
-- changed through an unprotected mutation path.
CREATE OR REPLACE FUNCTION local_reject_locked_payroll_source_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_worker_id uuid;
  v_work_date date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_worker_id := OLD.worker_id;
    v_work_date := OLD.work_date;
  ELSE
    v_worker_id := NEW.worker_id;
    v_work_date := NEW.work_date;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM local_payroll_runs r
    JOIN local_payroll_periods p ON p.id = r.period_id
    JOIN local_payroll_records pr ON pr.run_id = r.id
    WHERE r.status = 'LOCKED'
      AND pr.worker_id = v_worker_id
      AND v_work_date BETWEEN p.period_start AND p.period_end
  ) THEN
    RAISE EXCEPTION 'Nguồn chấm công/sản lượng đã thuộc kỳ lương bị khóa.'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS local_attendance_locked_payroll_guard ON local_attendance;
CREATE TRIGGER local_attendance_locked_payroll_guard
  BEFORE INSERT OR UPDATE OR DELETE ON local_attendance
  FOR EACH ROW EXECUTE FUNCTION local_reject_locked_payroll_source_mutation();

DROP TRIGGER IF EXISTS local_production_entry_locked_payroll_guard ON local_production_entries;
CREATE TRIGGER local_production_entry_locked_payroll_guard
  BEFORE INSERT OR UPDATE OR DELETE ON local_production_entries
  FOR EACH ROW EXECUTE FUNCTION local_reject_locked_payroll_source_mutation();

DROP TRIGGER IF EXISTS local_overtime_locked_payroll_guard ON local_overtime;
CREATE TRIGGER local_overtime_locked_payroll_guard
  BEFORE INSERT OR UPDATE OR DELETE ON local_overtime
  FOR EACH ROW EXECUTE FUNCTION local_reject_locked_payroll_source_mutation();

DROP TRIGGER IF EXISTS local_day_status_locked_payroll_guard ON local_day_statuses;
CREATE TRIGGER local_day_status_locked_payroll_guard
  BEFORE INSERT OR UPDATE OR DELETE ON local_day_statuses
  FOR EACH ROW EXECUTE FUNCTION local_reject_locked_payroll_source_mutation();

DROP TRIGGER IF EXISTS local_day_closure_locked_payroll_guard ON local_day_closures;
CREATE TRIGGER local_day_closure_locked_payroll_guard
  BEFORE INSERT OR UPDATE OR DELETE ON local_day_closures
  FOR EACH ROW EXECUTE FUNCTION local_reject_locked_payroll_source_mutation();
