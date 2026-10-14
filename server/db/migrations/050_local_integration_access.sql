-- Private, local-only service principals. Never sync to Supabase or expose through adapters.
CREATE SCHEMA IF NOT EXISTS integration_access;
REVOKE ALL ON SCHEMA integration_access FROM PUBLIC;
CREATE TABLE integration_access.connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 description text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true,
 policy_version integer NOT NULL DEFAULT 1, created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE integration_access.grants (
 connection_id uuid NOT NULL REFERENCES integration_access.connections(id), capability text NOT NULL,
 resource_ids text[] NOT NULL DEFAULT '{}', secondary_ids text[] NOT NULL DEFAULT '{}',
 contact_access boolean NOT NULL DEFAULT false, PRIMARY KEY(connection_id,capability)
);
CREATE TABLE integration_access.keys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid NOT NULL REFERENCES integration_access.connections(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100), prefix text NOT NULL,
 token_hash text NOT NULL UNIQUE CHECK(length(token_hash)=64), capabilities text[] NOT NULL,
 expires_at timestamptz NOT NULL, revoked_at timestamptz, last_used_at timestamptz,
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX integration_keys_connection_idx ON integration_access.keys(connection_id,created_at DESC);
CREATE TABLE integration_access.quotas (
 key_id uuid NOT NULL REFERENCES integration_access.keys(id), minute timestamptz NOT NULL,
 requests integer NOT NULL, PRIMARY KEY(key_id,minute)
);
CREATE TABLE integration_access.audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL, connection_id uuid,
 key_id uuid, actor_id text NOT NULL, action text NOT NULL, outcome text NOT NULL,
 reason text, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX integration_audit_connection_idx ON integration_access.audit(connection_id,created_at DESC);
REVOKE ALL ON ALL TABLES IN SCHEMA integration_access FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA integration_access FROM PUBLIC;
