# Sprint 4 Implementation Report — Production Execution Foundation

## 1. Result

Sprint 4 builds the **Production Execution Foundation** that answers:

> Thực tế sản xuất đã dùng bao nhiêu vật tư và bao nhiêu công?

Development verdict:

```text
DEVELOPMENT READY FOR SPRINT 5 — pending isolated DB test run (Docker unavailable in this session)
```

This is not a production deployment verdict. No production migration, seed, link or data mutation was executed.

## 2. Backup and Safety Boundary

No destructive migration was executed.

- Pre-Sprint-3 backup remains available at:
  ```text
  C:\Users\Lenovo\Documents\CRM-Joliefam-Backups\crm-joliefam-sprint3-prechange-20260825-112405
  ```
- The new migration is additive and local-only.

All database mutation tests are designed to run only inside disposable PostgreSQL containers. No remote project was linked, pushed, migrated, seeded or changed.

## 3. Migrations

Additive migration:

```text
supabase/migrations/20260826120000_production_execution_foundation.sql  (94,845 bytes)
```

The file replaces no legacy table and rewrites no legacy trigger. It only:

- extends `audit_events.action_check` with `RELEASE/COMPLETE/START/PAUSE/RESUME/HOLD/REPLAN`;
- creates 7 new business tables, 1 sequence, 3 views/functions for variance, and 11 new RLS-secured RPCs;
- adds one nullable column `inventory_documents.production_order_id` with a tenant-validated FK for traceability.

Existing Sprint 1/2/3 tables, triggers and data remain untouched until a separately approved cutover.

## 4. Data Model Created

| Table | Purpose |
|---|---|
| `routing_headers` | Stable product routing identity (one active per product) |
| `routing_versions` | Effective-dated version (`DRAFT→APPROVED→SUPERSEDED`) |
| `routing_operations` | Operation rows per routing version (code, name, minutes, `is_optional`, skill, machine) |
| `production_workers` | Manufacturing worker profile, optional `user_id`, per-tenant unique `employee_code` |
| `production_orders` | Order header, business number `SX-YYYYMM-000001` (sequence), batch, QR token, planned/actual dates, status lifecycle |
| `production_order_material_requirements` | Release snapshot of standard/planned material quantities grouped by item (mirrors Sprint 3 calculator output) |
| `production_order_operations` | Release snapshot of routing operations with `standard_total_minutes = setup + run×qty` |
| `production_operation_logs` | Append-only execution events (`START/PAUSE/RESUME/COMPLETE/QUANTITY_REPORT/SCRAP_REPORT/REWORK`) with `duration_minutes` generated |
| `production_scrap_records` | Scrap quantities by PO (and optionally operation) |
| `production_rework_records` | Rework loop quantities (`from_operation → target_operation`) |
| `production_outputs` | Good/scrap output per PO, `valuation_status='PENDING_COST'` (no authoritative cost in Sprint 4) |

Sequence: `production_order_number_seq` (global; business number includes `YYYYMM`, tenant isolation enforced at lookup).

Bug fixed during Sprint 4 implementation: `production_order_operations` was missing `is_optional`, breaking every `is_optional` check in `start_production_operation` and `complete_production_order`. The column was added and `release_production_order` updated to copy `v_op.is_optional`.

## 5. Routing

Status: IMPLEMENTED.

- Effective-date lifecycle `DRAFT→APPROVED→SUPERSEDED` identical to BOM/Cutting.
- Guard triggers `guard_routing_version_mutation` / `guard_routing_operation_mutation` make APPROVED immutable.
- RPCs: `create_routing_draft`, `save_routing_draft`, `approve_routing_version`, `resolve_effective_routing_version`.
- Overlap detection and `p_supersede_previous` flag match the BOM model.

## 6. Production Order Lifecycle

Implemented lifecycle:

```text
DRAFT → PLANNED → RELEASED → IN_PROGRESS → COMPLETED
  │         │          │            │
  └─────────┴─────→ CANCELLED ←────┘
         ON_HOLD ↔ IN_PROGRESS (optional)
```

Enforced server-side in `transition_production_order_status`. Direct `UPDATE status` by `authenticated` is blocked by `guard_production_order_mutation`.

## 7. Release Snapshot Engine

`release_production_order(p_production_order_id, p_effective_date)` is the central atomic engine:

1. Validates permission `production_release`, locks with `pg_advisory_xact_lock`.
2. Resolves effective BOM via Sprint 3 `resolve_effective_bom_version` — fails clearly if none.
3. Resolves effective Routing via new `resolve_effective_routing_version` — fails clearly if none.
4. Calculates standard requirements via Sprint 3 `calculate_standard_material_requirements` (no movement side-effects).
5. Persists both material and operation snapshots and `standard_minutes_total` in one transaction under `app.production_transition='on'`.
6. Idempotent: a second call on an already-RELEASED PO returns `{reused:true}` without duplicating snapshots.

A BOM V2 approved after a PO was released does not mutate the old snapshot (golden test coverage).

## 8. Material Requirement Snapshot

- Grouped by `(inventory_item_id, unit)` with `requirement_method='MULTIPLE'` when mixed, matching Sprint 3 grouping semantics.
- `standard_quantity` = `planned_quantity` at release.
- `cutting_profile_version_id` and `calculation_details` preserved for `CUTTING_ENGINE` lines.
- `issued/returned/actual` are **not** user-edited; they are derived from the ledger in the variance view.

## 9. Material Issue / Return Integration

- `inventory_documents` gained nullable `production_order_id` (tenant-validated trigger).
- `create_inventory_document` was replaced with a 12-parameter version (`p_production_order_id DEFAULT NULL`), preserving every Sprint 2 validation (permissions, warehouse access, duplicate item/location, idempotency, line totals).
- All production ISSUE/RETURN_IN documents must carry `production_order_id`.
- Ledger remains via `confirm_inventory_document → apply_inventory_movement`; the variance view sums `ISSUE/TRANSFER_OUT/ADJUSTMENT_OUT` vs `RETURN_IN` for the PO. Actual cost = `issue value - return value` from historical `value_delta`, never a current average restatement.

## 10. Routing Operations Snapshot and Execution

- Release copies every `routing_operations` row into `production_order_operations` with `standard_total_minutes = setup + run_per_unit × quantity_planned` and `operation_qr_code = production_order_number + '-' + operation_code`.
- Execution RPCs:
  - `start_production_operation` — sequential guard: previous mandatory operation must be `COMPLETED/SKIPPED`.
  - `complete_production_operation` — marks COMPLETED, writes a `COMPLETE` log and optional scrap/rework records.
  - `log_production_operation` — generic append-only event.

Logs are guarded (`guard_operation_log_mutation` rejects UPDATE/DELETE).

Standard minutes validation: `standard_minutes_per_unit >= 0`, `setup_minutes >= 0`; zero allowed for automated steps.

## 11. Worker Model

Table `production_workers` with `user_id` nullable so a worker without a login can still be tracked; `created_by` audit records the actor. No payroll fields.

Permission: `production_worker_manage` (and `production_manage` as fallback) for `create_production_worker`.

## 12. Scrap / Rework / Output

- Helpers: `record_production_scrap`, `record_production_rework` append records and bump `production_orders.quantity_scrap/rework`.
- `complete_production_order` validates:
  - no mandatory operation still `PENDING/IN_PROGRESS`,
  - no `DRAFT` inventory docs for the PO,
  - then atomically sets `COMPLETED` and inserts `production_outputs` (`valuation_status='PENDING_COST'`) with `ON CONFLICT DO NOTHING` idempotency.

Finished-goods quantity is visible, but no authoritative production unit cost is written in Sprint 4 (deferred to the costing sprint).

## 13. Variance Read Models

- View `production_order_material_variance`:
  ```text
  actual_consumption = issued - returned
  quantity_variance  = actual - standard
  actual_material_cost = sum(issue value_delta) - sum(return value_delta)
  ```
- RPC `get_production_order_variance` exposes shortage and respects `inventory_cost_view` masking.
- RPC `get_production_labor_variance`:
  ```text
  actual_minutes = sum(log.duration_minutes where event IN (COMPLETE, QUANTITY_REPORT))
  variance = actual - standard
  efficiency = standard / actual
  ```
- The UI surfaces `Material variance` and `Labor variance` prominently on the detail tabs.

## 14. Security, RLS and Audit

Permissions added:

```text
production_view
production_manage
production_release
production_complete
production_operations
production_worker_manage
```

All 11 new tables have `ENABLE ROW LEVEL SECURITY`; `authenticated INSERT/UPDATE/DELETE` is revoked and `SELECT` requires `production_view` (variants `production_manage/release` for DRAFT vs APPROVED). Server RPCs remain the sole write path.

Polymorphic links (`product_id`, `order_id`, `inventory_item_id`, `cost_center_id`, `worker_id`) are tenant-validated in triggers and again in RPCs. Cross-tenant attempts fail with `không cùng phạm vi dữ liệu`.

Audit: `audit_cost_change()` trigger on every new table plus explicit `write_cost_audit` calls on `CREATE/RELEASE/COMPLETE` and version approvals. Operation logs themselves are append-only history.

Cost visibility: `actual_material_cost` is masked without `inventory_cost_view` (both in `get_production_order_variance` and in the inventory variance path).

## 15. Frontend

- New lazy route `/production-orders` with page `src/pages/ProductionOrdersPage.tsx`.
- Navigation:
  - desktop: `AppSidebar` entry `Lệnh sản xuất` (`Factory` icon) gated by `production_view`.
  - mobile: `MobileMenu` card `Lệnh SX` gated by `production_view`.
- Routing update in `src/App.tsx`.
- Permission typing in `src/hooks/useEmployeePermissions.tsx` and allowlist in `supabase/functions/save-employee-permissions/index.ts` extended for all six new permissions.
- Database typing chain:
  - `src/integrations/supabase/production-execution-types.ts` — `ProductionManagementDatabase` extending `BomManagementDatabase` with 11 tables + 14 functions.
  - `src/integrations/supabase/client.ts` generics switched from `BomManagementDatabase` to `ProductionManagementDatabase`.
  - `src/lib/production-execution.ts` — typed `supabase.from` calls and RPC wrappers.
  - `src/lib/inventory-management.ts` — `createInventoryDocument` now forwards optional `production_order_id` (type extended in `inventory-management-types.ts`).

Page layout:

- Left list: filterable by status, badge per status, QR token preview.
- Detail tabs: `Tổng quan` / `Vật tư` / `Công đoạn` / `Nhân công` / `Sản lượng` / `Quy trình`.
- Overview: business number, batch, status, standard minutes total, release/complete actions, outputs.
- Materials: snapshot table + derived issued/returned/actual/variance + provisional actual cost banner.
- Operations: sequence, standard breakdown, status, QR code, Start/Complete per permission.
- Labor: standard vs actual minutes vs efficiency (logs-driven), worker roster.
- Output: `production_outputs` table with `PENDING_COST` notice.
- Routing tab: per-product routing workspace (header, versions, DRAFT editor, approve).

## 16. Automated Verification

### Static checks (run in this session)

```text
npx tsc --noEmit -p tsconfig.app.json   PASS
npx eslint src/lib/production-execution.ts src/pages/ProductionOrdersPage.tsx src/integrations/supabase/production-execution-types.ts   PASS
npm run build                           PASS (✓ built in ~15s)
```

### Isolated DB tests (require Docker)

Designed to run inside `public.ecr.aws/supabase/postgres:17.6.1.159` exactly like previous sprints:

```text
scripts/test-production-execution.ps1   (applies bootstrap → 20260824150000 → 20260824160000 → 20260824170000 → 20260825090000 → 20260826120000 → production_execution_test.sql)
npm run test:production                 (registered in package.json)
```

Test suite `supabase/tests/production_execution_test.sql` covers:

- routing lifecycle and effective-date resolution;
- golden release 100 units (fabric 320 / elastic 800 / label 100, minutes CUT 200 / SEW 1200 / QC 100 / PACK 100);
- BOM V2 immutability after release;
- routing V2 effective-date;
- partial issue / return / actual consumption variance (325 issued, 3 returned, 322 actual, +2 variance);
- actual material cost (322 × 42,000 = 13,524,000 from historical `value_delta`);
- insufficient stock rejection;
- scrap/rework bumping;
- operation start/complete + sequential guard;
- labor variance;
- complete blocker (mandatory op open);
- idempotent complete (no duplicate output);
- direct API bypass blocked (BOM snapshot, standard minutes, operation log);
- routing immutability;
- invalid transition `COMPLETED→DRAFT` blocked;
- cross-tenant product rejected;
- release without BOM fails;
- SEW-before-CUT blocked;
- cost visibility masked for `production_view`-only employee;
- audit `RELEASE`/`COMPLETE` exists.

Docker is not reachable in this execution environment (`npipe:////./pipe/dockerDesktopLinuxEngine` not found), so the isolated suite is **pending run**. The migration and all static suites remain unexecuted against production.

## 17. Legacy Regression

No legacy table was migrated, seeded or mutated. `products`, `orders`, `customers`, `transactions` and `inventory_*` remain current CRM/inventory sources of truth. The new page shows existing CRM data and does not rewrite legacy fields.

## 18. Migration and Test Files Created

```text
supabase/migrations/20260826120000_production_execution_foundation.sql
supabase/tests/production_execution_test.sql
scripts/test-production-execution.ps1
src/integrations/supabase/production-execution-types.ts
src/lib/production-execution.ts
src/pages/ProductionOrdersPage.tsx
docs/cost-management/18-sprint4-implementation-plan.md
```

Supporting edits:

```text
src/integrations/supabase/client.ts
src/integrations/supabase/inventory-management-types.ts
src/lib/inventory-management.ts
src/hooks/useEmployeePermissions.tsx
src/components/EmployeePermissionManagement.tsx
src/components/ui/app-sidebar.tsx
src/pages/MobileMenu.tsx
src/App.tsx
package.json (test:production)
supabase/functions/save-employee-permissions/index.ts
```

## 19. Known Limitations Before Production

1. Isolated DB suite must be run on a machine with Docker before `DEVELOPMENT READY` can be upgraded beyond static verification.
2. `inventory_reservations` are intentionally deferred — shortage is preview-only (`planned - stock - issued`).
3. Concurrent release/complete paths are serialized by `pg_advisory_xact_lock` but have not been stress-tested in this session.

## 20. Final Status

```text
MIGRATION: CREATED (local only)
TYPES: PASS
TSC: PASS
ESLINT (scoped): PASS
BUILD: PASS
ISOLATED DB TESTS: PENDING (Docker unavailable in this session — script ready)
PRODUCTION MIGRATION: NOT EXECUTED
```

```
NO PRODUCTION MIGRATION WAS EXECUTED.
```
