-- Local-only concurrency boundary for attendance and payroll source facts.
-- All worker/day writes share one advisory lock. Payroll snapshots use an
-- exclusive global lock while source mutations take the shared form, so a
-- snapshot cannot race a partially committed attendance change.

ALTER TABLE local_attendance_workflow_events
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS local_attendance_workflow_events_idempotency_uidx
  ON local_attendance_workflow_events(entity_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION local_lock_attendance_source_write(p_worker_id uuid, p_work_date date)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'local-attendance-day:local-tenant:' || p_worker_id::text || ':' || p_work_date::text,
    0
  ));
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(
    'local-attendance-payroll-source-guard',
    0
  ));
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
    JOIN local_payroll_records pr ON pr.run_id = r.id
    WHERE r.status = 'LOCKED'
      AND pr.worker_id = p_worker_id
      AND p_work_date BETWEEN p.period_start AND p.period_end
  ) THEN
    RAISE EXCEPTION 'Nguồn chấm công/sản lượng đã thuộc kỳ lương bị khóa.'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION local_validate_attendance_work_fact()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_active boolean;
  v_duplicate boolean := false;
  v_day_status text;
  v_closure_status text;
BEGIN
  PERFORM local_lock_attendance_source_write(NEW.worker_id, NEW.work_date);

  -- Bootstrap replays INSERT ... ON CONFLICT DO NOTHING on every API start.
  -- Let a byte-identical key reach its conflict handler without treating the
  -- replay as a new write into a closed/locked period.
  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME = 'local_attendance' THEN
      SELECT EXISTS (SELECT 1 FROM local_attendance WHERE idempotency_key = NEW.idempotency_key) INTO v_duplicate;
    ELSIF TG_TABLE_NAME = 'local_production_entries' THEN
      SELECT EXISTS (SELECT 1 FROM local_production_entries WHERE idempotency_key = NEW.idempotency_key) INTO v_duplicate;
    ELSIF TG_TABLE_NAME = 'local_overtime' THEN
      SELECT EXISTS (SELECT 1 FROM local_overtime WHERE idempotency_key = NEW.idempotency_key) INTO v_duplicate;
    END IF;
    IF v_duplicate THEN RETURN NEW; END IF;
  ELSIF (to_jsonb(NEW) - ARRAY['idempotency_fingerprint','updated_at'])
      = (to_jsonb(OLD) - ARRAY['idempotency_fingerprint','updated_at']) THEN
    RETURN NEW;
  END IF;

  IF NEW.work_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Ngày chấm công/sản lượng/tăng ca không được ở tương lai.'
      USING ERRCODE = '22007';
  END IF;

  PERFORM local_assert_payroll_source_open(NEW.worker_id, NEW.work_date);

  SELECT status INTO v_closure_status
  FROM local_day_closures
  WHERE worker_id = NEW.worker_id AND work_date = NEW.work_date;
  IF v_closure_status = 'LEADER_CONFIRMED' THEN
    RAISE EXCEPTION 'Ngày công đã được trưởng nhóm xác nhận, không thể ghi thêm hoặc sửa.'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_TABLE_NAME = 'local_overtime' THEN
    v_active := NEW.status NOT IN ('REJECTED','REVERSED');
  ELSE
    v_active := NOT NEW.is_reversed AND NEW.workflow_status NOT IN ('REJECTED','REVERSED');
  END IF;

  IF v_active THEN
    SELECT status INTO v_day_status
    FROM local_day_statuses
    WHERE worker_id = NEW.worker_id AND work_date = NEW.work_date;
    IF v_day_status IN ('ABSENT','PAID_LEAVE','UNPAID_LEAVE','OFF') THEN
      RAISE EXCEPTION 'Ngày đã được đánh dấu %, không thể ghi công/sản lượng/tăng ca.', v_day_status
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'local_attendance'
     AND v_active
     AND to_jsonb(NEW)->>'attendance_method' = 'HOUR'
     AND to_jsonb(NEW)->>'check_in_time' IS NOT NULL
     AND to_jsonb(NEW)->>'check_out_time' IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM local_attendance a
       WHERE a.worker_id = NEW.worker_id
         AND a.work_date = NEW.work_date
         AND a.id IS DISTINCT FROM NEW.id
         AND a.attendance_method = 'HOUR'
         AND a.check_in_time IS NOT NULL
         AND a.check_out_time IS NOT NULL
         AND NOT a.is_reversed
         AND a.workflow_status NOT IN ('REJECTED','REVERSED')
         AND a.check_in_time < (to_jsonb(NEW)->>'check_out_time')::time
         AND (to_jsonb(NEW)->>'check_in_time')::time < a.check_out_time
     ) THEN
    RAISE EXCEPTION 'Khoảng giờ chấm công bị trùng với một ca khác trong cùng ngày.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION local_validate_day_status_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_duplicate boolean := false;
  v_closure_status text;
BEGIN
  PERFORM local_lock_attendance_source_write(NEW.worker_id, NEW.work_date);

  IF TG_OP = 'INSERT' THEN
    SELECT EXISTS (SELECT 1 FROM local_day_statuses WHERE idempotency_key = NEW.idempotency_key) INTO v_duplicate;
    IF v_duplicate THEN RETURN NEW; END IF;
  ELSIF (to_jsonb(NEW) - ARRAY['idempotency_fingerprint','updated_at'])
      = (to_jsonb(OLD) - ARRAY['idempotency_fingerprint','updated_at']) THEN
    RETURN NEW;
  END IF;

  IF NEW.work_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Ngày trạng thái công không được ở tương lai.' USING ERRCODE = '22007';
  END IF;
  PERFORM local_assert_payroll_source_open(NEW.worker_id, NEW.work_date);

  SELECT status INTO v_closure_status
  FROM local_day_closures
  WHERE worker_id = NEW.worker_id AND work_date = NEW.work_date;
  IF v_closure_status = 'LEADER_CONFIRMED' THEN
    RAISE EXCEPTION 'Ngày công đã được trưởng nhóm xác nhận, không thể cập nhật trạng thái.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status IN ('ABSENT','PAID_LEAVE','UNPAID_LEAVE','OFF')
     AND EXISTS (
       SELECT 1 FROM local_attendance
       WHERE worker_id = NEW.worker_id AND work_date = NEW.work_date
         AND NOT is_reversed AND workflow_status NOT IN ('REJECTED','REVERSED')
       UNION ALL
       SELECT 1 FROM local_production_entries
       WHERE worker_id = NEW.worker_id AND work_date = NEW.work_date
         AND NOT is_reversed AND workflow_status NOT IN ('REJECTED','REVERSED')
       UNION ALL
       SELECT 1 FROM local_overtime
       WHERE worker_id = NEW.worker_id AND work_date = NEW.work_date
         AND status NOT IN ('REJECTED','REVERSED')
     ) THEN
    RAISE EXCEPTION 'Ngày đã có công, sản lượng hoặc tăng ca đang hiệu lực; hãy từ chối/đảo bản ghi trước khi đánh dấu nghỉ hoặc vắng.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION local_validate_day_closure_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_duplicate boolean := false;
BEGIN
  PERFORM local_lock_attendance_source_write(NEW.worker_id, NEW.work_date);

  IF TG_OP = 'INSERT' THEN
    SELECT EXISTS (SELECT 1 FROM local_day_closures WHERE idempotency_key = NEW.idempotency_key) INTO v_duplicate;
    IF v_duplicate THEN RETURN NEW; END IF;
  ELSIF (to_jsonb(NEW) - ARRAY['idempotency_fingerprint','updated_at'])
      = (to_jsonb(OLD) - ARRAY['idempotency_fingerprint','updated_at']) THEN
    RETURN NEW;
  END IF;

  IF NEW.work_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Ngày khóa ngày công không được ở tương lai.' USING ERRCODE = '22007';
  END IF;
  PERFORM local_assert_payroll_source_open(NEW.worker_id, NEW.work_date);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS local_attendance_concurrency_guard ON local_attendance;
CREATE TRIGGER local_attendance_concurrency_guard
  BEFORE INSERT OR UPDATE ON local_attendance
  FOR EACH ROW EXECUTE FUNCTION local_validate_attendance_work_fact();

DROP TRIGGER IF EXISTS local_production_entry_concurrency_guard ON local_production_entries;
CREATE TRIGGER local_production_entry_concurrency_guard
  BEFORE INSERT OR UPDATE ON local_production_entries
  FOR EACH ROW EXECUTE FUNCTION local_validate_attendance_work_fact();

DROP TRIGGER IF EXISTS local_overtime_concurrency_guard ON local_overtime;
CREATE TRIGGER local_overtime_concurrency_guard
  BEFORE INSERT OR UPDATE ON local_overtime
  FOR EACH ROW EXECUTE FUNCTION local_validate_attendance_work_fact();

DROP TRIGGER IF EXISTS local_day_status_concurrency_guard ON local_day_statuses;
CREATE TRIGGER local_day_status_concurrency_guard
  BEFORE INSERT OR UPDATE ON local_day_statuses
  FOR EACH ROW EXECUTE FUNCTION local_validate_day_status_write();

DROP TRIGGER IF EXISTS local_day_closure_concurrency_guard ON local_day_closures;
CREATE TRIGGER local_day_closure_concurrency_guard
  BEFORE INSERT OR UPDATE ON local_day_closures
  FOR EACH ROW EXECUTE FUNCTION local_validate_day_closure_write();
