-- Local-only role foundation for tổ trưởng. Public/Supabase roles are unchanged.
ALTER TABLE local_user_roles
  DROP CONSTRAINT IF EXISTS local_user_roles_role_check;

ALTER TABLE local_user_roles
  ADD CONSTRAINT local_user_roles_role_check
  CHECK (role IN ('admin','manager','accountant','employee','team_leader')) NOT VALID;

CREATE INDEX IF NOT EXISTS local_user_roles_team_leader_idx
  ON local_user_roles(user_id)
  WHERE role = 'team_leader' AND is_active;
