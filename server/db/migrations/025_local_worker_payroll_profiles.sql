-- Versioned, local-only payroll source profile per worker.
-- This migration is additive and never touches public Supabase data.
CREATE TABLE IF NOT EXISTS local_worker_payroll_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES local_workers(id),
  piece_output_enabled boolean NOT NULL DEFAULT false,
  overtime_enabled boolean NOT NULL DEFAULT false,
  meal_enabled boolean NOT NULL DEFAULT false,
  allowances_enabled boolean NOT NULL DEFAULT false,
  deductions_enabled boolean NOT NULL DEFAULT false,
  insurance_enabled boolean NOT NULL DEFAULT false,
  fixed_allowance_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (fixed_allowance_amount >= 0),
  fixed_deduction_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (fixed_deduction_amount >= 0),
  effective_from date NOT NULL,
  effective_to date,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
  source_reference text,
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  idempotency_key text NOT NULL UNIQUE,
  request_hash text NOT NULL,
  created_by text NOT NULL DEFAULT 'local-admin',
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS local_worker_payroll_profiles_lookup_idx
  ON local_worker_payroll_profiles(worker_id, status, effective_from DESC, created_at DESC);
