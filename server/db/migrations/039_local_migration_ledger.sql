-- Migration infrastructure: one recorded application, including safe adoption
-- of databases bootstrapped before a ledger existed. No business rows change.
CREATE TABLE IF NOT EXISTS local_schema_migrations (
  name text PRIMARY KEY,
  checksum text NOT NULL,
  source text NOT NULL CHECK (source IN ('APPLIED','ADOPTED')),
  applied_at timestamptz NOT NULL DEFAULT now()
);
