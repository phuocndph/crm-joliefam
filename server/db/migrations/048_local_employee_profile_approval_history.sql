-- Versioned self-service employee profiles. This migration is local-only and
-- keeps the employee's last approved snapshot separate from current edits.
ALTER TABLE local_employee_profile_forms
  ADD COLUMN IF NOT EXISTS approved_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approved_revision bigint NOT NULL DEFAULT 0;

UPDATE local_employee_profile_forms
SET approved_data = profile_data,
    approved_revision = GREATEST(approved_revision, revision)
WHERE status = 'APPROVED'
  AND (approved_data = '{}'::jsonb OR approved_data IS NULL);

CREATE TABLE IF NOT EXISTS local_employee_profile_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES local_employee_profile_forms(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES local_user_profiles(user_id) ON DELETE CASCADE,
  revision bigint NOT NULL,
  action text NOT NULL CHECK (action IN ('SAVE_DRAFT','SUBMIT','APPROVE','REQUEST_INFO','REOPEN')),
  snapshot_kind text NOT NULL CHECK (snapshot_kind IN ('DRAFT','APPROVED')),
  profile_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_employee_profile_history_user_idx
  ON local_employee_profile_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS local_employee_profile_history_form_revision_idx
  ON local_employee_profile_history(form_id, revision DESC, created_at DESC);
