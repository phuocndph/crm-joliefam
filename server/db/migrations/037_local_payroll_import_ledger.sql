create table if not exists local_payroll_import_batches (
  id uuid primary key default gen_random_uuid(),
  actor_id text not null,
  fingerprint text not null,
  template_key text not null,
  source_name text,
  row_count integer not null,
  status text not null check (status in ('PROCESSING', 'COMMITTED')),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(actor_id, fingerprint)
);

create index if not exists idx_local_payroll_import_batches_actor_created
  on local_payroll_import_batches(actor_id, created_at desc);
