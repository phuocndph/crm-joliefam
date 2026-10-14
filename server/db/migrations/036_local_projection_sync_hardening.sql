-- Protect imported projections from being overwritten after a local edit.
ALTER TABLE local_workers ADD COLUMN IF NOT EXISTS local_modified_at timestamptz;
ALTER TABLE local_price_lists ADD COLUMN IF NOT EXISTS local_modified_at timestamptz;

CREATE INDEX IF NOT EXISTS local_workers_employee_code_idx ON local_workers(employee_code);
CREATE INDEX IF NOT EXISTS local_price_lists_status_idx ON local_price_lists(status, year DESC NULLS LAST);
