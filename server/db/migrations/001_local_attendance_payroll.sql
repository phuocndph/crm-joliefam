CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS local_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  worker_type text NOT NULL DEFAULT 'GENERIC',
  is_active boolean NOT NULL DEFAULT true,
  location_code text,
  position_title text,
  employment_type text,
  payroll_status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS local_worker_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES local_workers(id),
  compensation_type text NOT NULL,
  attendance_method text NOT NULL,
  rate_amount numeric(18,2) NOT NULL CHECK (rate_amount >= 0),
  effective_from date NOT NULL,
  effective_to date,
  standard_days_per_month numeric(8,2) NOT NULL DEFAULT 26,
  standard_hours_per_day numeric(8,2) NOT NULL DEFAULT 8,
  currency_code text NOT NULL DEFAULT 'VND',
  unit_basis text NOT NULL DEFAULT 'UNIT',
  status text NOT NULL DEFAULT 'APPROVED',
  reason text,
  is_estimated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS local_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  category text,
  rate_unit text NOT NULL DEFAULT 'PIECE',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS local_product_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES local_products(id),
  rate numeric(18,2) NOT NULL CHECK (rate >= 0),
  rate_unit text NOT NULL DEFAULT 'PIECE',
  effective_from date NOT NULL,
  effective_to date,
  status text NOT NULL DEFAULT 'APPROVED',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS local_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES local_workers(id),
  production_order_id uuid,
  production_order_operation_id uuid,
  operation_code text,
  operation_name text,
  production_order_number text,
  attendance_method text NOT NULL CHECK (attendance_method IN ('DAY','HOUR','OUTPUT')),
  work_date date NOT NULL,
  day_units numeric(10,2),
  work_hours numeric(10,2),
  check_in_time time,
  check_out_time time,
  break_minutes integer NOT NULL DEFAULT 0,
  output_quantity numeric(12,2),
  standard_hours_per_day numeric(8,2) NOT NULL DEFAULT 8,
  activity_name text,
  rate_id uuid REFERENCES local_worker_rates(id),
  rate_amount numeric(18,2),
  calculated_amount numeric(18,2),
  workflow_status text NOT NULL DEFAULT 'SUBMITTED',
  workflow_reason text,
  workflow_at timestamptz NOT NULL DEFAULT now(),
  is_reversed boolean NOT NULL DEFAULT false,
  reversal_reason text,
  idempotency_key text NOT NULL UNIQUE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS local_day_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES local_workers(id),
  work_date date NOT NULL,
  status text NOT NULL,
  meal_eligible boolean NOT NULL DEFAULT false,
  reason text,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(worker_id, work_date)
);

CREATE TABLE IF NOT EXISTS local_day_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES local_workers(id),
  work_date date NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  reason text,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(worker_id, work_date)
);

CREATE TABLE IF NOT EXISTS local_overtime (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES local_workers(id),
  work_date date NOT NULL,
  overtime_type text NOT NULL,
  overtime_minutes integer NOT NULL CHECK (overtime_minutes > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'SUBMITTED',
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS local_production_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES local_workers(id),
  product_id uuid NOT NULL REFERENCES local_products(id),
  work_date date NOT NULL,
  quantity numeric(12,2) NOT NULL CHECK (quantity > 0),
  rate_id uuid REFERENCES local_product_rates(id),
  rate_amount numeric(18,2),
  calculated_amount numeric(18,2),
  workflow_status text NOT NULL DEFAULT 'SUBMITTED',
  workflow_reason text,
  workflow_at timestamptz NOT NULL DEFAULT now(),
  is_reversed boolean NOT NULL DEFAULT false,
  reversal_reason text,
  idempotency_key text NOT NULL UNIQUE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS local_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid NOT NULL,
  production_order_operation_id uuid,
  worker_id uuid NOT NULL REFERENCES local_workers(id),
  assigned_from date NOT NULL,
  assigned_to date,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_attendance_date_idx ON local_attendance(work_date);
CREATE INDEX IF NOT EXISTS local_production_entries_date_idx ON local_production_entries(work_date);
CREATE INDEX IF NOT EXISTS local_worker_rates_lookup_idx ON local_worker_rates(worker_id, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS local_product_rates_lookup_idx ON local_product_rates(product_id, effective_from, effective_to);
