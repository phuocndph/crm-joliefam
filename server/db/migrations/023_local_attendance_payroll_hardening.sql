-- Local-only attendance/payroll workflow hardening.  This migration is
-- additive so existing local seed/snapshot rows remain readable.

ALTER TABLE local_attendance
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint text,
  ADD COLUMN IF NOT EXISTS workflow_actor_id text,
  ADD COLUMN IF NOT EXISTS reversed_by text,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE local_production_entries
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint text,
  ADD COLUMN IF NOT EXISTS workflow_actor_id text,
  ADD COLUMN IF NOT EXISTS reversed_by text,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE local_day_statuses
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint text,
  ADD COLUMN IF NOT EXISTS workflow_actor_id text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE local_day_closures
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint text,
  ADD COLUMN IF NOT EXISTS workflow_actor_id text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE local_overtime
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint text,
  ADD COLUMN IF NOT EXISTS workflow_actor_id text,
  ADD COLUMN IF NOT EXISTS workflow_reason text,
  ADD COLUMN IF NOT EXISTS workflow_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS local_attendance_fingerprint_idx
  ON local_attendance(idempotency_key, idempotency_fingerprint);
CREATE INDEX IF NOT EXISTS local_production_entries_fingerprint_idx
  ON local_production_entries(idempotency_key, idempotency_fingerprint);
CREATE INDEX IF NOT EXISTS local_day_statuses_fingerprint_idx
  ON local_day_statuses(idempotency_key, idempotency_fingerprint);
CREATE INDEX IF NOT EXISTS local_day_closures_fingerprint_idx
  ON local_day_closures(idempotency_key, idempotency_fingerprint);
CREATE INDEX IF NOT EXISTS local_overtime_fingerprint_idx
  ON local_overtime(idempotency_key, idempotency_fingerprint);

CREATE TABLE IF NOT EXISTS local_attendance_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  from_status text,
  to_status text,
  reason text,
  idempotency_key text,
  actor_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS local_attendance_workflow_events_entity_idx
  ON local_attendance_workflow_events(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS local_attendance_workflow_events_key_idx
  ON local_attendance_workflow_events(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- NOT VALID preserves imported rows while enforcing the domain for all future
-- writes.  Existing seed values are intentionally left untouched.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'local_attendance_workflow_status_ck') THEN
    ALTER TABLE local_attendance ADD CONSTRAINT local_attendance_workflow_status_ck
      CHECK (workflow_status IN ('SUBMITTED','APPROVED','REJECTED','LOCKED','REVERSED')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'local_production_entries_workflow_status_ck') THEN
    ALTER TABLE local_production_entries ADD CONSTRAINT local_production_entries_workflow_status_ck
      CHECK (workflow_status IN ('SUBMITTED','APPROVED','REJECTED','LOCKED','REVERSED')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'local_day_statuses_status_ck') THEN
    ALTER TABLE local_day_statuses ADD CONSTRAINT local_day_statuses_status_ck
      CHECK (status IN ('PRESENT','ABSENT','PAID_LEAVE','UNPAID_LEAVE','HOLIDAY','OFF')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'local_day_closures_status_ck') THEN
    ALTER TABLE local_day_closures ADD CONSTRAINT local_day_closures_status_ck
      CHECK (status IN ('OPEN','EMPLOYEE_CONFIRMED','LEADER_CONFIRMED','REOPENED')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'local_overtime_status_ck') THEN
    ALTER TABLE local_overtime ADD CONSTRAINT local_overtime_status_ck
      CHECK (status IN ('SUBMITTED','APPROVED','REJECTED','LOCKED','REVERSED')) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION local_touch_attendance_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS local_attendance_updated_at_trigger ON local_attendance;
CREATE TRIGGER local_attendance_updated_at_trigger
  BEFORE UPDATE ON local_attendance
  FOR EACH ROW EXECUTE FUNCTION local_touch_attendance_updated_at();
DROP TRIGGER IF EXISTS local_production_entries_updated_at_trigger ON local_production_entries;
CREATE TRIGGER local_production_entries_updated_at_trigger
  BEFORE UPDATE ON local_production_entries
  FOR EACH ROW EXECUTE FUNCTION local_touch_attendance_updated_at();
DROP TRIGGER IF EXISTS local_day_statuses_updated_at_trigger ON local_day_statuses;
CREATE TRIGGER local_day_statuses_updated_at_trigger
  BEFORE UPDATE ON local_day_statuses
  FOR EACH ROW EXECUTE FUNCTION local_touch_attendance_updated_at();
DROP TRIGGER IF EXISTS local_day_closures_updated_at_trigger ON local_day_closures;
CREATE TRIGGER local_day_closures_updated_at_trigger
  BEFORE UPDATE ON local_day_closures
  FOR EACH ROW EXECUTE FUNCTION local_touch_attendance_updated_at();
DROP TRIGGER IF EXISTS local_overtime_updated_at_trigger ON local_overtime;
CREATE TRIGGER local_overtime_updated_at_trigger
  BEFORE UPDATE ON local_overtime
  FOR EACH ROW EXECUTE FUNCTION local_touch_attendance_updated_at();
