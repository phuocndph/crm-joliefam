create table if not exists integration_private.ghn_edit_attempts (
 id uuid primary key default gen_random_uuid(),
 actor_id text not null, tracking_id text not null, order_code text not null,
 manager_id text, tenant_id text, order_id text, shop_id text not null,
 config_revision integer not null, config_mode text not null,
 idempotency_key uuid not null, payload_hash text not null, request_data jsonb not null,
 info_status text not null check (info_status in ('NOT_REQUESTED','READY','IN_FLIGHT','SUCCESS','FAILED','UNKNOWN')),
 cod_status text not null check (cod_status in ('NOT_REQUESTED','READY','IN_FLIGHT','SUCCESS','FAILED','UNKNOWN')),
 result_data jsonb not null default '{}'::jsonb,
 snapshot_synced boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(actor_id,idempotency_key)
);
create unique index if not exists ghn_edit_one_pending_per_tracking on integration_private.ghn_edit_attempts(tracking_id)
 where info_status in ('READY','IN_FLIGHT','UNKNOWN') or cod_status in ('READY','IN_FLIGHT','UNKNOWN');
revoke all on integration_private.ghn_edit_attempts from public;
