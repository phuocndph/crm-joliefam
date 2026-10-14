-- Local-only payroll master data. This migration is append-only and never touches Supabase.
ALTER TABLE local_workers
  ADD COLUMN IF NOT EXISTS employment_start_date date,
  ADD COLUMN IF NOT EXISTS employment_end_date date;

ALTER TABLE local_worker_rates
  ADD COLUMN IF NOT EXISTS monthly_productive_minutes integer,
  ADD COLUMN IF NOT EXISTS source_reference text,
  ADD COLUMN IF NOT EXISTS local_modified_at timestamptz;

ALTER TABLE local_product_rates
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS local_modified_at timestamptz;

CREATE TABLE IF NOT EXISTS local_payroll_policy_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL DEFAULT 'local-admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS local_payroll_team_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_worker_id uuid NOT NULL REFERENCES local_workers(id),
  worker_id uuid NOT NULL REFERENCES local_workers(id),
  effective_from date NOT NULL,
  effective_to date,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RETIRED')),
  reason text NOT NULL,
  created_by text NOT NULL DEFAULT 'local-admin',
  retired_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  CHECK (supervisor_worker_id <> worker_id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS local_payroll_team_lookup_idx
  ON local_payroll_team_assignments(worker_id, supervisor_worker_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS local_worker_compensation_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES local_workers(id),
  compensation_type text NOT NULL,
  payroll_policy_group_id uuid NOT NULL REFERENCES local_payroll_policy_groups(id),
  effective_from date NOT NULL,
  effective_to date,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
  reason text NOT NULL,
  created_by text NOT NULL DEFAULT 'local-admin',
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS local_worker_comp_assignment_lookup_idx
  ON local_worker_compensation_assignments(worker_id, effective_from DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS local_social_insurance_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES local_workers(id),
  calculation_type text NOT NULL DEFAULT 'FIXED_AMOUNT',
  employee_amount numeric(18,2) NOT NULL CHECK (employee_amount >= 0),
  currency_code text NOT NULL DEFAULT 'VND',
  effective_from date NOT NULL,
  effective_to date,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
  source_reference text NOT NULL,
  reason text NOT NULL,
  created_by text NOT NULL DEFAULT 'local-admin',
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS local_social_insurance_lookup_idx
  ON local_social_insurance_versions(worker_id, effective_from DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS local_payroll_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES local_workers(id),
  account_number text NOT NULL,
  account_name text NOT NULL,
  bank_code text,
  bank_name text NOT NULL,
  is_primary boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL,
  effective_to date,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','VERIFIED','RETIRED')),
  source_reference text,
  reason text NOT NULL,
  created_by text NOT NULL DEFAULT 'local-admin',
  verified_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS local_payroll_bank_lookup_idx
  ON local_payroll_bank_accounts(worker_id, effective_from DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS local_payroll_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  reason text NOT NULL,
  actor_id text NOT NULL DEFAULT 'local-admin',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS local_payroll_audit_created_idx
  ON local_payroll_audit_events(created_at DESC, entity_type, entity_id);
