-- Durable receipt for exact reviewed salary-bundle approval. Local authenticated
-- API owns authorization; this database has no browser/direct grants.
CREATE TABLE local_payroll_bundle_approvals (
  idempotency_key text PRIMARY KEY CHECK(length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  actor_id text NOT NULL,
  worker_id uuid NOT NULL REFERENCES local_workers(id),
  request_hash text NOT NULL,
  selection_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON local_payroll_bundle_approvals FROM PUBLIC;
