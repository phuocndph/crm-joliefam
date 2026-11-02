-- Explicit machine execution identities; never enabled or granted by migration.
ALTER TABLE integration_access.grants ADD COLUMN all_resources boolean NOT NULL DEFAULT false;
CREATE TABLE integration_access.service_identities (
 connection_id uuid PRIMARY KEY REFERENCES integration_access.connections(id),
 user_id text NOT NULL UNIQUE REFERENCES local_user_profiles(user_id),
 actor_label text NOT NULL UNIQUE,
 configured_by text NOT NULL, configured_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE integration_access.commands (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 connection_id uuid NOT NULL REFERENCES integration_access.connections(id),
 key_id uuid NOT NULL REFERENCES integration_access.keys(id),
 idempotency_hash text NOT NULL CHECK(length(idempotency_hash)=64),
 payload_hash text NOT NULL CHECK(length(payload_hash)=64),
 auth_hash text NOT NULL CHECK(length(auth_hash)=64),
 tool_name text NOT NULL, reason text NOT NULL,
 state text NOT NULL CHECK(state IN ('IN_FLIGHT','SUCCEEDED','FAILED','UNKNOWN')),
 response_status integer, response_body jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(connection_id,idempotency_hash)
);
CREATE INDEX integration_commands_key_idx ON integration_access.commands(key_id);
CREATE INDEX integration_commands_state_idx ON integration_access.commands(connection_id,state,created_at);
CREATE TABLE integration_access.artifacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 connection_id uuid NOT NULL REFERENCES integration_access.connections(id),
 key_id uuid NOT NULL REFERENCES integration_access.keys(id),
 capability text NOT NULL, tool_name text NOT NULL,
 auth_hash text NOT NULL CHECK(length(auth_hash)=64),
 filename text NOT NULL, content_type text NOT NULL, content bytea NOT NULL CHECK(octet_length(content)<=16777216),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX integration_artifacts_connection_idx ON integration_access.artifacts(connection_id,expires_at);
CREATE INDEX integration_artifacts_key_idx ON integration_access.artifacts(key_id);
REVOKE ALL ON integration_access.service_identities,integration_access.commands FROM PUBLIC;
REVOKE ALL ON integration_access.artifacts FROM PUBLIC;

-- A service identity cannot acquire a human session, password, or human profile edits,
-- even via a forgotten compatibility writer. Only explicit integration setup changes
-- role/permissions; the service profile is otherwise immutable.
CREATE FUNCTION integration_access.protect_service_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='local_auth_sessions' THEN
  IF EXISTS(SELECT 1 FROM integration_access.service_identities WHERE user_id=NEW.user_id) THEN
   RAISE EXCEPTION 'Service identities cannot create human sessions' USING ERRCODE='42501';
  END IF;
 ELSIF TG_TABLE_NAME='local_user_profiles' THEN
  IF EXISTS(SELECT 1 FROM integration_access.service_identities WHERE user_id=OLD.user_id) AND
    (TG_OP='DELETE' OR NEW IS DISTINCT FROM OLD) THEN
   RAISE EXCEPTION 'Service identities are managed only through integration setup' USING ERRCODE='42501';
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM integration_access.service_identities s
   WHERE s.user_id=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END
   AND s.connection_id::text IS DISTINCT FROM current_setting('integration_access.configuring_connection',true)) THEN
   RAISE EXCEPTION 'Service role/permissions require dedicated integration setup' USING ERRCODE='42501';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER integration_no_human_session BEFORE INSERT OR UPDATE ON local_auth_sessions
 FOR EACH ROW EXECUTE FUNCTION integration_access.protect_service_identity();
CREATE TRIGGER integration_service_profile_guard BEFORE UPDATE OR DELETE ON local_user_profiles
 FOR EACH ROW EXECUTE FUNCTION integration_access.protect_service_identity();
CREATE TRIGGER integration_service_role_guard BEFORE INSERT OR UPDATE OR DELETE ON local_user_roles
 FOR EACH ROW EXECUTE FUNCTION integration_access.protect_service_identity();
CREATE TRIGGER integration_service_permission_guard BEFORE INSERT OR UPDATE OR DELETE ON local_employee_permissions
 FOR EACH ROW EXECUTE FUNCTION integration_access.protect_service_identity();
REVOKE ALL ON FUNCTION integration_access.protect_service_identity() FROM PUBLIC;
