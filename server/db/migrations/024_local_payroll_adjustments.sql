-- Local-only, append-only payroll adjustments. Public Supabase data is untouched.
CREATE TABLE IF NOT EXISTS local_payroll_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES local_workers(id),
  period_id uuid NOT NULL REFERENCES local_payroll_periods(id),
  item_type text NOT NULL,
  item_direction text NOT NULL CHECK (item_direction IN ('EARNING', 'DEDUCTION')),
  amount numeric(20,6) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  source_reference text,
  idempotency_key text NOT NULL UNIQUE,
  request_hash text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'LOCKED')),
  created_by text NOT NULL DEFAULT 'local-admin',
  submitted_by text,
  approved_by text,
  rejected_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  locked_run_id uuid REFERENCES local_payroll_runs(id),
  locked_at timestamptz,
  CHECK (length(trim(reason)) > 0),
  CHECK (status <> 'LOCKED' OR locked_run_id IS NOT NULL)
);

ALTER TABLE local_payroll_adjustments
  ADD COLUMN IF NOT EXISTS request_hash text;

CREATE INDEX IF NOT EXISTS local_payroll_adjustments_period_idx
  ON local_payroll_adjustments(period_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS local_payroll_adjustments_worker_idx
  ON local_payroll_adjustments(worker_id, created_at DESC);
