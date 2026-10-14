-- Local-only employee permissions copied from the Supabase snapshot.
-- Permission changes are audited locally and never written back to Supabase.
CREATE TABLE IF NOT EXISTS local_employee_permissions (
  user_id text NOT NULL REFERENCES local_user_profiles(user_id) ON DELETE CASCADE,
  permission_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  assigned_by text,
  reason text,
  is_snapshot_record boolean NOT NULL DEFAULT false,
  source_snapshot_key text,
  local_modified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_type)
);

CREATE INDEX IF NOT EXISTS local_employee_permissions_user_idx
  ON local_employee_permissions (user_id, enabled, permission_type);

CREATE TABLE IF NOT EXISTS local_auth_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  actor_id text NOT NULL DEFAULT 'local-admin',
  reason text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_auth_audit_created_idx
  ON local_auth_audit_events (created_at DESC, entity_type, entity_id);

INSERT INTO local_employee_permissions
  (user_id, permission_type, enabled, is_snapshot_record, source_snapshot_key, created_at, updated_at)
SELECT
  s.payload->>'user_id',
  s.payload->>'permission_type',
  coalesce((s.payload->>'enabled')::boolean, false),
  true,
  s.source_key,
  coalesce(nullif(s.payload->>'created_at','')::timestamptz, s.first_seen_at),
  coalesce(nullif(s.payload->>'updated_at','')::timestamptz, s.last_seen_at)
FROM local_source_snapshots s
JOIN local_user_profiles p ON p.user_id = s.payload->>'user_id'
WHERE s.source = 'SUPABASE'
  AND s.source_table = 'employee_permissions'
  AND NOT s.is_deleted
  AND nullif(s.payload->>'permission_type','') IS NOT NULL
ON CONFLICT (user_id, permission_type) DO UPDATE SET
  enabled = excluded.enabled,
  source_snapshot_key = excluded.source_snapshot_key,
  updated_at = excluded.updated_at
WHERE local_employee_permissions.local_modified_at IS NULL;
