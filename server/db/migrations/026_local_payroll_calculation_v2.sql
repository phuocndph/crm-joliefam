-- Local-only payroll calculation V2 snapshots. Public Supabase data is untouched.
ALTER TABLE local_payroll_runs
  ADD COLUMN IF NOT EXISTS standard_days_snapshot numeric(8,2),
  ADD COLUMN IF NOT EXISTS config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE local_attendance
  ADD COLUMN IF NOT EXISTS worked_minutes numeric(12,2),
  ADD COLUMN IF NOT EXISTS monthly_salary_snapshot numeric(18,2),
  ADD COLUMN IF NOT EXISTS rate_basis text;

-- Existing attendance is intentionally not reinterpreted here. Legacy rows may
-- store daily-like DAY rates or manually entered HOUR values without clock data.
-- New API writes populate these snapshots explicitly; ambiguous old rows remain
-- visible to payroll preflight as blocking data-quality issues.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'local_attendance_worked_minutes_nonnegative') THEN
    ALTER TABLE local_attendance ADD CONSTRAINT local_attendance_worked_minutes_nonnegative
      CHECK (worked_minutes IS NULL OR worked_minutes >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'local_attendance_monthly_salary_nonnegative') THEN
    ALTER TABLE local_attendance ADD CONSTRAINT local_attendance_monthly_salary_nonnegative
      CHECK (monthly_salary_snapshot IS NULL OR monthly_salary_snapshot >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'local_payroll_runs_standard_days_snapshot_positive') THEN
    ALTER TABLE local_payroll_runs ADD CONSTRAINT local_payroll_runs_standard_days_snapshot_positive
      CHECK (standard_days_snapshot IS NULL OR standard_days_snapshot > 0);
  END IF;
END $$;
