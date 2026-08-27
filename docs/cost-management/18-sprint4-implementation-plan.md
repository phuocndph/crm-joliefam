# Sprint 4 Implementation Plan — Production Execution Foundation

## 1. Objective

Sprint 4 builds the **Production Execution Foundation**: from a sellable `products.id` and its approved standards (BOM + Cutting + Routing), create a **Production Order** that snapshots those standards at release, then records **Actual Material** and **Actual Labor** against the immutable plan so Sprint 5 can calculate Production Cost without re-inferring history.

Question Sprint 4 must answer:

> Thực tế sản xuất đã dùng bao nhiêu vật tư và bao nhiêu công?

Non-negotiable boundaries carried from Sprint 1-3:

- `products.id` stays the Product/SKU identity, `inventory_items.id` stays the material identity.
- No duplicate product, SKU, material master or inventory ledger.
- Approved BOM/Cutting/Routing versions are immutable; changes clone to DRAFT.
- Standard != Planned != Actual.
- Material truth = `inventory_movements` ledger (Sprint 2 MWA).
- Labor truth = immutable operation logs.
- No JS `eval`, no dynamic SQL, no invented factory formulas.
- No payroll, no overhead allocation, no GL, no period closing in this sprint.

## 2. Preconditions

- Sprint 2 ledger + MWA + atomic Issue/Return: verified (`test:inventory` PASS, concurrency PASS).
- Sprint 3 BOM versioning + Cutting engine + `calculate_standard_material_requirements`: verified (`test:bom-cutting` PASS, staging PostgREST PASS, snapshot immutability proven).
- Approved-only resolution (`APPROVED`/`SUPERSEDED` only in production context) already enforced in Sprint 3.
- Tenant isolation and RLS on Sprint 2/3 tables have no CRITICAL gap (post-audit fixes for `inventory_items` scope and snapshot leakage are in `20260825110000`).
- Development can proceed on isolated local Docker Postgres even if no production DB is available. Verdict remains `DEVELOPMENT READY - NOT PRODUCTION READY`.

Go/no-go: if any of the above were FAIL on isolated tests, stop and fix before writing Sprint 4 migration. Current inspected state is GO.

## 3. Scope

Build in Sprint 4 (mirrors spec checklist items 3.x):

1. `routing_headers` / `routing_versions` / `routing_operations` (standard minutes, setup, cost center, skill, machine type).
2. `production_workers` (manufacturing worker profile linked optionally to `auth.users`).
3. `production_orders` + business number `SX-YYYYMM-000001` (concurrent-safe, not PK, rolls past 99,999).
4. `production_order_material_requirements` — release snapshot.
5. `production_order_operations` — release snapshot.
6. `production_operation_logs` — actual labor events.
7. `production_scrap_records` + `production_rework_records` (or unified with type distinction).
8. `production_outputs` — good/scrap/rework receipt, optional finished-goods `INVENTORY RECEIPT` (provisional, see section 13).
9. Linkage: `inventory_documents.production_order_id` (nullable, FK) for ISSUE/RETURN_IN material integration.
10. Status lifecycles, release snapshot engine, variance read models, RLS/tenant/audit/idempotency.

Defer: payroll, depreciation, overhead allocation, normal capacity, production cost rollup, pricing, profitability, period closing, GL, scheduling optimizer.

## 4. Production Order Schema

Table `production_orders`:

```text
id uuid PK
tenant_id text NOT NULL default 'default'
production_order_number text NOT NULL unique per tenant (e.g. SX-202608-000001)
product_id uuid FK products(id)
quantity_planned numeric(18,4) > 0
quantity_good numeric(18,4) default 0
quantity_scrap numeric(18,4) default 0
quantity_rework numeric(18,4) default 0
status text CHECK (DRAFT, PLANNED, RELEASED, IN_PROGRESS, COMPLETED, CANCELLED, ON_HOLD)
planned_start_date date
planned_end_date date
actual_start_at timestamptz
actual_end_at timestamptz
source_type text CHECK (FROM_ORDER, FROM_STOCK_PLAN, MANUAL)
source_id uuid nullable (polymorphic but validated for known types: orders)
order_id uuid FK orders(id) nullable (typed convenience for FROM_ORDER)
cost_center_id uuid FK cost_centers nullable
bom_version_id uuid FK bom_versions (snapshot, nullable until release)
cutting_params_snapshot jsonb (engine inputs at release, nullable until release)
routing_version_id uuid FK routing_versions (snapshot, nullable until release)
standard_minutes_total numeric(18,2) (computed at release)
material_issue_tolerance_percent numeric(7,2) default 5.00
created_by uuid
released_by uuid
completed_by uuid
cancelled_by uuid
created_at / updated_at / released_at / completed_at / cancelled_at timestamptz
cancel_reason text
```

Additional columns: `production_batch_number text` (if not identical to `production_order_number` for future lot traceability) and stable QR token `qr_token uuid default gen_random_uuid()`.

Indexes: `tenant_id+production_order_number`, `tenant_id+product_id`, `tenant_id+status`, `tenant_id+order_id`, `tenant_id+cost_center_id`, `tenant_id+planned_start_date`.

## 5. Lifecycle and Valid Transitions

```
DRAFT -> PLANNED -> RELEASED -> IN_PROGRESS -> COMPLETED
  |        |           |            |
  +------->+---------->+--CANCELLED  +--ON_HOLD <-> IN_PROGRESS
DRAFT/PLANNED -> CANCELLED
RELEASED -> CANCELLED only before IN_PROGRESS unless special workflow (blocked in MVP)
ON_HOLD is optional; if implemented, only IN_PROGRESS <-> ON_HOLD and then COMPLETED/CANCELLED.
Forbidden: COMPLETED -> any, CANCELLED -> any, IN_PROGRESS -> DRAFT/PLANNED.
```

Enforced by a single `transition_production_order_status` SECURITY DEFINER function with a declarative allowlist. Direct `UPDATE status` by `authenticated` is revoked. Every transition is audited and idempotency-keyed (see section 16). `RELEASED` and `COMPLETED` are the two idempotent business events (retry returns same result).

## 6. Snapshot Policy

On `RELEASE` (atomic transaction, section 14):

1. Validate `product_id` exists and tenant matches.
2. Resolve `bom_version_id` via `resolve_effective_bom_version(product, effective_date)` — must be `APPROVED`/`SUPERSEDED`; fail `Sản phẩm chưa có định mức được duyệt` if none.
3. Resolve each `CUTTING_ENGINE` line's `cutting_profile_version` via `resolve_effective_cutting_profile_version` + Sprint 3 `calculate_cutting_consumption` for the full `quantity_planned`.
4. Resolve `routing_version_id` via `resolve_effective_routing_version(product, effective_date)` — must be `APPROVED`/`SUPERSEDED`; fail `Sản phẩm chưa có quy trình sản xuất được duyệt` if none.
5. Call Sprint 3 `calculate_standard_material_requirements` (or its internal helper) to produce standard/planned quantities grouped by material; aggregate into `production_order_material_requirements`.
6. Snapshot all `routing_operations` into `production_order_operations` with `standard_setup_minutes`, `standard_run_minutes_per_unit`, `standard_total_minutes = setup + run*quantity_planned`.
7. Persist snapshots, set `production_orders.status='RELEASED'`, `released_at`, `bom_version_id/routing_version_id/cutting params`, audit, commit or rollback as one transaction.

After release: `bom_version_id`, `routing_version_id`, snapshot rows and `standard_minutes_total` are immutable (trigger `guard_production_release_mutation` rejects direct updates). A BOM V2 approved after release does not affect the already-released PO (golden test coverage required).

A limited `REPLAN` is allowed only when `status IN (DRAFT, PLANNED)` and no inventory issue/operation log exists; otherwise it requires a new Production Order.

## 7. BOM Integration

- Uses existing `bom_headers` (`product_id`) + `bom_versions` (`product -> BOM header -> APPROVED versions`) + `bom_lines` (`quantity_method FIXED/PER_UNIT/FORMULA/CUTTING_ENGINE`).
- Resolution is effective-date based, identical to Sprint 3; the production function reuses `resolve_effective_bom_version`.
- `CUTTING_ENGINE` lines delegate to the Sprint 3 engine with the **full batch quantity** (never single-unit times qty) and persisted `calculation_breakdown`, `engine_version`, `cutting_profile_version_id`.

## 8. Cutting Snapshot

Stored per material requirement row that originates from a `CUTTING_ENGINE` BOM line:

```text
cutting_profile_version_id
fabric_width_cm (requested or default)
engine_inputs_snapshot jsonb   -- product dimensions, profile rules, fabric, qty
engine_result_snapshot jsonb   -- pieces_across, rows, net/gross/waste, final_issue_recommendation_m
engine_version text
```

These snapshots live in `production_order_material_requirements.calculation_details`.

## 9. Material Requirements Snapshot

Table `production_order_material_requirements`:

```text
id uuid PK
tenant_id text
production_order_id uuid FK
inventory_item_id uuid FK inventory_items
bom_line_id uuid FK bom_lines (origin line, nullable after aggregation)
bom_version_id uuid FK bom_versions
requirement_method text (FIXED/PER_UNIT/FORMULA/CUTTING_ENGINE/MULTIPLE)
standard_quantity numeric(18,4)
planned_quantity numeric(18,4)  -- equals standard at release; may diverge if tolerance/replan is added later
waste_quantity_standard numeric(18,4)
unit text
issued_quantity numeric(18,4) default 0 (derived, not user-edited)
returned_quantity numeric(18,4) default 0 (derived)
actual_consumption_quantity numeric(18,4) generated as issued - returned (or computed in view)
standard_unit_cost_snapshot numeric(18,6) nullable (MWA at release, for variance preview)
standard_material_cost_preview numeric(18,2) nullable
created_at
unique(production_order_id, inventory_item_id, unit)
```

- Initial `planned_quantity` = `standard_quantity` computed by Sprint 3 calculator.
- `issued_quantity`/`returned_quantity` are **not** user-edited; they are projected from the ledger (see section 10).
- Grouping: identical `inventory_item_id+unit` from multiple BOM lines are aggregated; `requirement_method` becomes `MULTIPLE` when mixed, matching Sprint 3 grouping semantics.

## 10. Material Issue / Return Integration

Extend `inventory_documents` with:

```sql
ALTER TABLE inventory_documents ADD COLUMN production_order_id uuid REFERENCES production_orders(id) ON DELETE RESTRICT;
CREATE INDEX inventory_documents_production_order_idx ON inventory_documents(tenant_id, production_order_id);
```

- All production ISSUE/RETURN_IN documents must carry `production_order_id`.
- Creation still goes through `create_inventory_document` (new optional `p_production_order_id` param). Validation: same tenant, production order exists, status allows material movement (`RELEASED`/`IN_PROGRESS`/`ON_HOLD`), item belongs to requirement set (warning if over-issue exceeds tolerance, but not hard-blocked unless > tolerance + approval missing — see below).
- Confirm goes through existing `confirm_inventory_document` which invokes `apply_inventory_movement` atomically. Production order reads actuals via an aggregated view `production_order_material_actuals` that sums `inventory_movements` grouped by `(production_order_id, inventory_item_id, movement_kind)` for `CONFIRMED` documents only.
- Partial issue: supported natively; cumulative tracked. Over-issue: if `requested > planned * (1 + tolerance)` emit a policy warning requiring `inventory_confirm` elevated permission or a manager approval; a configurable column `material_issue_tolerance_percent` per PO (allowlist 0-100) drives this.
- Return: must reference `source_movement_id` (Sprint 2 rule) and `production_order_id` equal to source issue's PO; uses source movement's exact unit cost.

No `UPDATE inventory_balances` or direct ledger insert is allowed outside `apply_inventory_movement`.

## 11. Routing

Tables (mirrors Sprint 3 versioning shape):

```text
routing_headers(id, tenant_id, product_id FK, code, name, is_active, created_by/at/updated_at)
  unique(tenant_id, code), partial unique(tenant_id, product_id) where is_active (one active routing per product)
routing_versions(id, tenant_id, routing_id FK, version_number, status DRAFT/APPROVED/SUPERSEDED,
                 effective_from, effective_to, notes, created_by, approved_by/at/reason, created/updated/approved_at)
  unique(routing_id, version_number), effective range checks, overlap guard like BOM
routing_operations(id, tenant_id, routing_version_id FK, operation_code, operation_name,
                   sequence >0, cost_center_id FK nullable, standard_minutes_per_unit numeric(18,4) >=0,
                   setup_minutes numeric(18,4) default 0, machine_type text, labor_skill text,
                   quantity_basis text CHECK (PER_UNIT, PER_BATCH), is_optional boolean default false, created_at)
  unique(routing_version_id, sequence), unique(routing_version_id, operation_code)
```

Example operations: `10 CUT`, `20 SEW`, `30 IRON`, `40 QC`, `50 PACK`; seeded as documentation, not hard-coded business logic.

## 12. Standard Minutes

Per operation: `standard_run_minutes_per_unit` + `setup_minutes`. Per PO: `standard_total_minutes = sum(setup) + sum(run_per_unit * quantity_planned)` — split stored per `production_order_operations.standard_total_minutes` and summed to `production_orders.standard_minutes_total`.

Validation: `standard_minutes_per_unit >= 0` (zero allowed for automated/non-time ops), `setup_minutes >= 0`. Not negative. Stored as `NUMERIC(18,4)` operationally and `NUMERIC(18,2)` for display aggregation.

## 13. Operations Snapshot + Worker + Logs

`production_order_operations`:

```text
id uuid PK
tenant_id text
production_order_id uuid FK
sequence integer
operation_code text
operation_name text
cost_center_id uuid
standard_setup_minutes numeric(18,4)
standard_run_minutes_per_unit numeric(18,4)
standard_total_minutes numeric(18,4)
status text CHECK (PENDING, READY, IN_PROGRESS, COMPLETED, SKIPPED) default PENDING
quantity_input numeric(18,4)
quantity_good numeric(18,4)
quantity_scrap numeric(18,4)
quantity_rework numeric(18,4)
planned_start / planned_end timestamptz
actual_start / actual_end timestamptz
```

`production_workers`:

```text
id uuid PK
tenant_id text
user_id uuid nullable FK auth.users(id)
employee_code text unique per tenant
display_name text
primary_cost_center_id uuid
worker_type text CHECK (CUTTER, SEWER, IRONING, QC, PACKER, HELPER, SUPERVISOR, GENERIC)
is_active boolean default true
created_at
```
No payroll fields. Workers with `user_id IS NULL` are allowed; manager records on their behalf and `created_by` audit tracks the actor.

`production_operation_logs`:

```text
id uuid PK
tenant_id text
production_order_operation_id uuid FK
event_type text CHECK (START, PAUSE, RESUME, COMPLETE, QUANTITY_REPORT, SCRAP_REPORT, REWORK)
worker_id uuid FK production_workers nullable
quantity numeric(18,4) nullable
reason_code text nullable
started_at timestamptz
ended_at timestamptz
duration_minutes numeric(18,4) generated as EXTRACT(EPOCH FROM (ended_at - started_at))/60 when both present
notes text
created_by uuid
created_at timestamptz default now()
```

Rules: `ended_at >= started_at`, no negative duration, append-only (trigger rejects UPDATE/DELETE on completed logs), overlap detection is documented but not hard-blocked unless policy says single-task workers cannot overlap (config off by default).

## 14. Scrap / Rework / Output

Tables:

```text
production_scrap_records(id, tenant_id, production_order_id FK, production_order_operation_id FK nullable,
                         quantity numeric(18,4) >0, reason_code text, notes, created_by/at)
production_rework_records(id, tenant_id, production_order_id FK, from_operation_id FK nullable,
                          target_operation_id FK nullable, quantity numeric(18,4) >0, reason_code, notes, created_by/at)
production_outputs(id, tenant_id, production_order_id FK unique per PO, product_id, quantity_good, quantity_scrap,
                   output_date date, warehouse_id FK nullable, inventory_receipt_id uuid FK inventory_documents nullable,
                   status text CHECK (DRAFT, CONFIRMED), created_by/at)
```

Quantity reconciliation on complete: `quantity_good + quantity_scrap + quantity_rework_open ~ quantity_planned` is tolerance-checked (overproduction allowed up to tolerance; otherwise warning/approval). `production_outputs` row is upserted atomically on complete — retry does not duplicate (idempotent on `production_order_id`).

Finished-goods inventory: when `product`'s inventory item (`FINISHED_GOOD`) exists and `production_orders.warehouse_id` for output is set, the completion function may create a `RECEIPT` inventory document of kind `OPENING_BALANCE`-like receipt for `quantity_good` with `valuation_status='PENDING_COST'` / provisional zero cost. **No authoritative production unit cost is written in Sprint 4**; the cost is deferred to Sprint 5. The provisional inventory row is documented as `PENDING_COST`. Alternative of deferring even the quantity receipt to Sprint 5 is also acceptable; the design picks provisional quantity now, cost later, because traceability requires stock visibility now.

## 15. WIP / Source / Batch

- Production order WIP state is derived from `status` (`DRAFT`/`PLANNED`=Not Started, `RELEASED`/`IN_PROGRESS`/`ON_HOLD`=In Progress, `COMPLETED`=Completed) and per-operation status; a view `production_order_wip_summary` exposes `current_operation_code`, `progress_percent`.
- `source_type/source_id` + typed `order_id` support `1 order -> N production orders`.
- MVP: one sellable SKU per `production_order`; multi-product is out of scope unless Phase 1A multi-line design explicitly requires it (it does not for MVP).
- Batch: `production_order_number` doubles as batch identity; a separate `production_batch_number` column is kept for future splitting without changing QR references.
- QR: each PO gets `qr_token`; each operation inherits `production_order_number + '-' + operation_code` as a printable code (`operation_qr_code text generated`).

## 16. Idempotency / Concurrency / Atomicity

- `production_orders.idempotency_key` is optional per release/complete; canonical idempotency is `(tenant_id, production_order_id, operation_type)` where `operation_type IN ('RELEASE','COMPLETE','OPERATION_COMPLETE')`; a table `production_idempotency_keys` (or reuse existing `idempotency_keys` contract from `06-versioning-audit-model.md`) stores `(tenant, operation, business_key, request_id, result_entity_id, payload_hash)`. Retry with same business key returns same result; different payload is conflict.
- Concurrent release/complete are serialized by `pg_advisory_xact_lock(hashtextextended('prod:'||tenant||':'||po_id))`.
- Atomic release: steps 1-9 in section 6 are one PL/pgSQL transaction; any failure rolls back.
- Atomic complete: validates mandatory operations (`is_optional=false` must be COMPLETED), output quantity, no DRAFT inventory docs for that PO, status/tenant/auth; then writes `production_outputs` + sets `COMPLETED` + audit in one transaction.

## 17. Tenant / RLS / Audit / Permissions

Permissions (new `employee_permissions` values):

```text
production_view
production_manage
production_release
production_complete
production_operations
production_worker_manage
```

All seven/eight new tables `ENABLE ROW LEVEL SECURITY`; `authenticated` role has `SELECT` only where permission check passes plus manager scope (`manager_id = current_cost_manager_id()` or `IS NULL` for admin/accountant). Sensitive writes go through SECURITY DEFINER RPCs that call `has_cost_permission`/`has_bom_permission`. Direct `INSERT/UPDATE/DELETE` on snapshots, logs (post-complete), and `production_outputs` is revoked. `inventory_items` select policy from Sprint 3 is preserved (manager scope + permission).

Polymorphic links (`product_id`, `order_id`, `inventory_item_id`, `cost_center_id`, `worker_id`, `warehouse_id`) are all server-validated for same `tenant_id` (trigger `validate_production_scope` per table plus RPC-level checks). Cross-tenant attempts fail with `không cùng phạm vi dữ liệu`.

Audit: `audit_cost_change()` trigger on all new tables plus explicit `write_cost_audit` calls inside `release`/`complete`/`scrap`/`rework`/`output` flows, recording actor, before/after, reason. Operation logs themselves are append-only history so excessive duplicate audit is avoided but status transitions remain audited.

Cost visibility: `actual_material_cost` / `average_unit_cost` shown only if `inventory_cost_view` is present; otherwise quantity-only view.

## 18. Variance Read Models

Views/RPCs compute (no extra ledger):

```text
material_quantity_variance = actual_consumption - standard_quantity
material_cost_variance = actual_material_cost - (standard_quantity * reference_cost)
labor_time_variance = actual_minutes - standard_minutes_earned
labor_efficiency = standard_minutes_earned / NULLIF(actual_minutes,0)
scrap_rate = quantity_scrap / NULLIF(quantity_good+quantity_scrap+quantity_rework,0)
```

Material cost uses historical movement `value_delta` (not current average) — the sum of `ISSUE` value deltas minus `RETURN_IN` reversals for that PO.

## 19. Implementation Order

1. Read docs + inspect Sprint 2/3 source (done).
2. Write this plan (this file).
3. Migration `20260826120000_production_execution_foundation.sql` — enums, tables, indexes, constraints, triggers, RLS, grants.
4. Migration adds `inventory_documents.production_order_id`, alters `create_inventory_document` to accept `p_production_order_id`.
5. Routing RPCs: `create_routing_draft`, `save_routing_draft`, `approve_routing_version`, `resolve_effective_routing_version`.
6. Worker RPCs + views.
7. Production order RPCs: `create_production_order`, `release_production_order` (snapshot engine), `update_production_operation_status`, `log_production_operation`, `record_scrap/rework`, `complete_production_order`.
8. TypeScript types (`production-execution-types.ts`) and API module (`lib/production-execution.ts`).
9. UI: lazy route `ProductionExecutionPage` + detail tabs (Overview/Materials/Operations/Labor/Output/Audit).
10. Tests.

## 20. Test Plan

Isolated Docker Postgres tests covering every item in spec section 115:

- Release snapshot from BOM V1 + Routing V1 (golden: Fabric 320m / Elastic 800m / Label 100, CUT 200 / SEW 1200 / QC 100 / PACK 100).
- Master change after release immutability (BOM V2 does not move old PO; Routing V2 also proven).
- Partial issue, over-issue tolerance, return, actual consumption & cost from ledger.
- Insufficient stock rejects but PO remains valid; shortage preview.
- Scrap/rework flow, rework loop.
- Completion blockers (mandatory op IN_PROGRESS, quantity mismatch, DRAFT docs).
- Idempotent complete, concurrent release/complete (advisory lock).
- Cross-tenant (PO/product/BOM/routing/worker/operation).
- Direct API bypass (revoked writes, guard triggers).
- State transitions, effective-date routing, negative/zero minutes validation, log validation.

Test files:

```text
supabase/tests/production_execution_test.sql
scripts/test-production-execution.ps1
scripts/test-local-staging-api.mjs  (extended with production cases)
```

Regression after:

```text
npm run test:cost-management
npm run test:inventory
npm run test:bom-cutting  (or npm run test:bom-cutting-standards if script name differs)
npx tsc --noEmit -p tsconfig.app.json
npm run build
Sprint-scoped ESLint 0 errors
```

## 21. Stop Conditions

Stop and report (do not attempt workaround) if:

- A destructive legacy migration, a second inventory ledger, or a production bypass of the inventory ledger would be required.
- Actual consumption would have to be hand-entered instead of derived from ledger.
- Approved/released snapshots would be mutable.
- Operation logs would be rewritable without audit.
- Cross-tenant references would pass server validation.
- Historical MWA cost would be recalculated instead of using movement `value_delta`.
- Producing `SX` completion would create duplicate outputs on retry.
- A production DB would be required to continue development.
- Sprint 4 would have to implement overhead allocation/normal capacity to function.

## 22. Local-Dev Safety

- Migrations are additive and dev/local only; never `supabase db push` to the project `kmxfljxsmnozvvgypdei`.
- No production seed/mutation, no destructive `DROP` of legacy tables (`orders`, `products`, `fabric_*`, `finance`).
- Backup already exists at `C:\Users\Lenovo\Documents\CRM-Joliefam-Backups\crm-joliefam-sprint3-prechange-20260825-112405`; a new pre-Sprint-4 backup will be taken before migration write.

## 23. Business Rules Still Required from Joliefam

The same Sprint 3 open items remain plus production-specific ones: official formulas per family, seam/hem/tuck/flap allowances, pattern matching, joining rules, waste %, issue increments, unit conversions — and additionally: which routing operations are mandatory vs optional per product type, standard minutes source (time study vs estimate), rework routing policy, overproduction tolerance, and who may approve `production_release`/`production_complete` per manager scope. None of these are invented in Sprint 4.

