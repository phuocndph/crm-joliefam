CREATE TABLE IF NOT EXISTS local_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'SUPABASE',
  mode text NOT NULL CHECK (mode IN ('DRY_RUN', 'SNAPSHOT', 'INCREMENTAL')),
  status text NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED')),
  requested_tables jsonb NOT NULL DEFAULT '[]'::jsonb,
  table_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_count integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS local_source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'SUPABASE',
  source_schema text NOT NULL DEFAULT 'public',
  source_table text NOT NULL,
  source_key text NOT NULL,
  source_updated_at timestamptz,
  source_hash text NOT NULL,
  payload jsonb NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  sync_run_id uuid REFERENCES local_sync_runs(id),
  is_deleted boolean NOT NULL DEFAULT false,
  UNIQUE(source, source_schema, source_table, source_key)
);

CREATE INDEX IF NOT EXISTS local_source_snapshots_table_idx
  ON local_source_snapshots(source_table, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS local_source_snapshots_hash_idx
  ON local_source_snapshots(source_table, source_hash);
CREATE INDEX IF NOT EXISTS local_sync_runs_started_idx
  ON local_sync_runs(started_at DESC);
