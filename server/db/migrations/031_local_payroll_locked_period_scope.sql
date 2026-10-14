-- Local-only forward fix: a locked payroll period protects every source fact
-- in its date range, including facts for workers who did not receive a
-- payroll-record row in the particular run. Do not weaken the trigger timing
-- established by migration 028; seed/bootstrap INSERT replays stay permitted.

CREATE OR REPLACE FUNCTION local_reject_locked_payroll_source_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_work_date date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_work_date := OLD.work_date;
  ELSE
    v_work_date := NEW.work_date;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM local_payroll_runs r
    JOIN local_payroll_periods p ON p.id = r.period_id
    WHERE r.status = 'LOCKED'
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

CREATE OR REPLACE FUNCTION local_assert_payroll_source_open(p_worker_id uuid, p_work_date date)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM local_payroll_runs r
    JOIN local_payroll_periods p ON p.id = r.period_id
    WHERE r.status = 'LOCKED'
      AND p_work_date BETWEEN p.period_start AND p.period_end
  ) THEN
    RAISE EXCEPTION 'Nguồn chấm công/sản lượng đã thuộc kỳ lương bị khóa.'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;
