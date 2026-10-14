CREATE TABLE IF NOT EXISTS local_payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  standard_days numeric(8,2) NOT NULL DEFAULT 26 CHECK (standard_days > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  UNIQUE (period_start, period_end),
  CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS local_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES local_payroll_periods(id),
  run_number integer NOT NULL,
  status text NOT NULL DEFAULT 'PREVIEW' CHECK (status IN ('PREVIEW', 'LOCKED', 'SUPERSEDED')),
  calculation_version text NOT NULL DEFAULT 'local-payroll-v1',
  input_hash text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  UNIQUE (period_id, run_number)
);

CREATE TABLE IF NOT EXISTS local_payroll_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES local_payroll_runs(id),
  worker_id uuid NOT NULL REFERENCES local_workers(id),
  gross_amount numeric(20,6) NOT NULL DEFAULT 0,
  deductions_amount numeric(20,6) NOT NULL DEFAULT 0,
  net_amount numeric(20,6) NOT NULL DEFAULT 0,
  payment_amount numeric(20,2) NOT NULL DEFAULT 0,
  rounding_delta numeric(20,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, worker_id)
);

CREATE TABLE IF NOT EXISTS local_payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_record_id uuid NOT NULL REFERENCES local_payroll_records(id),
  worker_id uuid NOT NULL REFERENCES local_workers(id),
  item_type text NOT NULL,
  item_direction text NOT NULL DEFAULT 'EARNING' CHECK (item_direction IN ('EARNING', 'DEDUCTION')),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  quantity numeric(20,6) NOT NULL DEFAULT 0,
  unit_rate numeric(20,6) NOT NULL DEFAULT 0,
  multiplier numeric(12,6) NOT NULL DEFAULT 1,
  amount_precise numeric(20,6) NOT NULL DEFAULT 0,
  formula text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_record_id, source_type, source_id, item_type)
);

CREATE TABLE IF NOT EXISTS local_payroll_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES local_payroll_runs(id),
  severity text NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'BLOCKING')),
  code text NOT NULL,
  worker_id uuid REFERENCES local_workers(id),
  source_type text,
  source_id uuid,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS local_payroll_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key text NOT NULL UNIQUE,
  numeric_value numeric(20,6),
  text_value text,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  status text NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('DRAFT', 'APPROVED', 'RETIRED')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (numeric_value IS NOT NULL OR text_value IS NOT NULL)
);

INSERT INTO local_payroll_policies(policy_key, numeric_value, reason)
VALUES ('OVERTIME_MULTIPLIER', 1.5, 'Local MVP default; review by payroll owner'),
       ('MEAL_RATE', 0, '0 means meal policy is not configured')
ON CONFLICT (policy_key) DO NOTHING;

CREATE INDEX IF NOT EXISTS local_payroll_runs_period_idx ON local_payroll_runs(period_id, created_at DESC);
CREATE INDEX IF NOT EXISTS local_payroll_records_run_idx ON local_payroll_records(run_id, worker_id);
CREATE INDEX IF NOT EXISTS local_payroll_items_record_idx ON local_payroll_items(payroll_record_id, worker_id);
CREATE INDEX IF NOT EXISTS local_payroll_exceptions_run_idx ON local_payroll_exceptions(run_id, severity);
