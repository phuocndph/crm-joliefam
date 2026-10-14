CREATE TABLE IF NOT EXISTS local_compat_records (
  table_name text NOT NULL,
  record_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_deleted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, record_id)
);
CREATE INDEX IF NOT EXISTS local_compat_records_table_updated_idx ON local_compat_records(table_name, updated_at DESC);
