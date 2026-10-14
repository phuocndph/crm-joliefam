-- Production workflow MVP foundation: multi-line orders, batches, stage events, and material allocations.
create table if not exists public.production_order_items (
  id uuid primary key default gen_random_uuid(), production_order_id uuid not null references public.production_orders(id) on delete restrict,
  source_order_item_id uuid null, product_id uuid not null references public.products(id) on delete restrict,
  fabric_variant_id uuid null, color text null, size text null, dimensions text null,
  planned_quantity numeric(18,4) not null check (planned_quantity > 0), completed_quantity numeric(18,4) not null default 0 check (completed_quantity >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists production_order_items_order_idx on public.production_order_items(production_order_id);
create table if not exists public.production_batches (
  id uuid primary key default gen_random_uuid(), production_order_id uuid not null references public.production_orders(id) on delete restrict,
  batch_number text not null, team_id uuid null, planned_quantity numeric(18,4) not null check (planned_quantity > 0),
  status text not null default 'PLANNED' check (status in ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED')),
  started_at timestamptz null, completed_at timestamptz null, created_by uuid null references auth.users(id), created_at timestamptz not null default now(),
  unique(production_order_id,batch_number)
);
create index if not exists production_batches_order_idx on public.production_batches(production_order_id);
create table if not exists public.production_stage_events (
  id uuid primary key default gen_random_uuid(), production_order_id uuid not null references public.production_orders(id) on delete restrict,
  production_batch_id uuid null references public.production_batches(id) on delete restrict, order_item_id uuid null references public.production_order_items(id) on delete restrict,
  stage text not null check (stage in ('CUTTING','SEWING','QUALITY_CHECK','REWORK','FOLDING','PACKING','SHIPPING')),
  worker_id uuid null references public.production_workers(id) on delete restrict, team_id uuid null,
  quantity_received numeric(18,4) not null default 0 check (quantity_received >= 0), quantity_good numeric(18,4) not null default 0 check (quantity_good >= 0),
  quantity_rework numeric(18,4) not null default 0 check (quantity_rework >= 0), quantity_remake numeric(18,4) not null default 0 check (quantity_remake >= 0), quantity_defect numeric(18,4) not null default 0 check (quantity_defect >= 0),
  minutes_worked integer null check (minutes_worked is null or minutes_worked >= 0), event_type text not null default 'OUTPUT' check (event_type in ('RECEIVE','OUTPUT','TRANSFER','ADJUSTMENT')),
  status text not null default 'SUBMITTED' check (status in ('DRAFT','SUBMITTED','APPROVED','REJECTED','LOCKED','REVERSED')),
  occurred_at timestamptz not null default now(), created_by uuid null references auth.users(id), approved_by uuid null, notes text null, created_at timestamptz not null default now()
);
create index if not exists production_stage_events_order_idx on public.production_stage_events(production_order_id,stage,occurred_at);
create table if not exists public.production_fabric_allocations (
  id uuid primary key default gen_random_uuid(), production_order_id uuid not null references public.production_orders(id) on delete restrict,
  production_batch_id uuid null references public.production_batches(id) on delete restrict, fabric_variant_id uuid null, inventory_item_id uuid null references public.inventory_items(id) on delete restrict,
  warehouse_id uuid null, reserved_quantity numeric(18,4) not null default 0 check (reserved_quantity >= 0), issued_quantity numeric(18,4) not null default 0 check (issued_quantity >= 0),
  received_quantity numeric(18,4) not null default 0 check (received_quantity >= 0), consumed_quantity numeric(18,4) not null default 0 check (consumed_quantity >= 0), returned_quantity numeric(18,4) not null default 0 check (returned_quantity >= 0), scrap_quantity numeric(18,4) not null default 0 check (scrap_quantity >= 0),
  created_at timestamptz not null default now()
);
create index if not exists production_fabric_allocations_order_idx on public.production_fabric_allocations(production_order_id);
alter table public.production_order_items enable row level security;
alter table public.production_batches enable row level security;
alter table public.production_stage_events enable row level security;
alter table public.production_fabric_allocations enable row level security;
