-- Self-service employee profile drafts. Personal details are local-only and
-- remain separate from payroll master data until an authorized reviewer accepts them.
CREATE TABLE IF NOT EXISTS local_employee_profile_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE REFERENCES local_user_profiles(user_id) ON DELETE CASCADE,
  profile_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','NEEDS_INFO')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_employee_profile_forms_status_idx
  ON local_employee_profile_forms(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS local_employee_profile_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES local_user_profiles(user_id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_id text NOT NULL,
  reason text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_employee_profile_audit_user_idx
  ON local_employee_profile_audit_events(user_id, created_at DESC);
