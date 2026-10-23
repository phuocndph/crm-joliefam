-- Durable outbound GHN creation journal. This schema is excluded from generic
-- snapshots/compatibility APIs. Request contains recovery PII: backup access is
-- an operator boundary; never expose it through list/status/audit responses.
CREATE TABLE integration_private.ghn_order_attempts (
  id text PRIMARY KEY,
  actor_id text NOT NULL,
  manager_id text NOT NULL,
  tenant_id text NOT NULL,
  order_id text,
  scope_key text NOT NULL,
  shop_id text NOT NULL,
  config_revision integer NOT NULL,
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  client_order_code text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('IN_FLIGHT','UNKNOWN','REMOTE_CREATED','SUCCESS','REJECTED')),
  order_code text,
  request_data jsonb NOT NULL,
  result_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id,idempotency_key),
  CHECK(status NOT IN ('REMOTE_CREATED','SUCCESS') OR order_code IS NOT NULL)
);
CREATE UNIQUE INDEX ghn_order_one_unresolved_scope ON integration_private.ghn_order_attempts(actor_id,scope_key)
  WHERE status IN ('IN_FLIGHT','UNKNOWN','REMOTE_CREATED');
CREATE INDEX ghn_order_attempt_actor_scope ON integration_private.ghn_order_attempts(actor_id,scope_key,created_at DESC);
REVOKE ALL ON integration_private.ghn_order_attempts FROM PUBLIC;
