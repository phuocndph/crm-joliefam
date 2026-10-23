-- Actor-bound review metadata only; no attendance or payroll business facts.
CREATE TABLE local_payroll_import_previews (
 token_hash text PRIMARY KEY,
 actor_id text NOT NULL,
 fingerprint text NOT NULL,
 day_snapshots jsonb NOT NULL CHECK (jsonb_typeof(day_snapshots) = 'array'),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX local_payroll_import_previews_expiry ON local_payroll_import_previews(expires_at);
