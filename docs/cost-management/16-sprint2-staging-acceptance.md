# Sprint 2.5 - Local Staging Acceptance and Security Validation

## 1. Executive Summary

Sprint 2 Inventory and Material Costing was accepted on an isolated local
Supabase stack. The generated project is not linked to any remote project and
contains only synthetic test data.

The stack applied the Sprint 1 and Sprint 2 migrations through the Supabase
migration engine, passed the PostgreSQL suites, passed real concurrent posting,
and passed PostgREST/Auth acceptance with five role profiles.

Verdict:

```text
READY FOR SPRINT 3 DEVELOPMENT
NOT READY FOR PRODUCTION MIGRATION
```

The second line remains mandatory because this environment is not a clone of
the current CRM schema or production data.

## 2. Environment Verified

Acceptance date: `2026-08-25`.

| Item | Result |
| --- | --- |
| Supabase CLI | `2.115.0` through `npx` |
| Database | Local Supabase PostgreSQL container |
| Local API | `http://127.0.0.1:54321` |
| Local Studio | `http://127.0.0.1:54323` |
| Local database | `127.0.0.1:54322` |
| Generated project ID | `crm-joliefam-cost-staging` |
| Remote project link | `null` |
| Test data | Synthetic only |
| Production data copied | No |

The runtime is generated inside `.local-staging-runtime/`, which is ignored by
source tracking. The start and test wrappers fail closed if the generated
runtime ever reports a remote `linked_project`.

## 3. Migration Result

The isolated stack applied these five versions in order:

1. `20260824000000` - local test bootstrap;
2. `20260824150000` - Cost Management Foundation;
3. `20260824160000` - Sprint 1 security fixes;
4. `20260824170000` - Inventory and Material Costing Foundation;
5. `20260825090000` - Inventory hardening.

Result: **PASS**.

The complete 157-file CRM migration history is not reproducible from a blank
database. Eighteen early files use a legacy `timestamp-uuid.sql` name that the
current CLI skips, and the repository does not contain the original migrations
that create core tables including `products`, `orders` and `quotes`. The local
bootstrap supplies only the minimum legacy contracts needed to test Sprint 1/2.

This is a repository baseline limitation, not evidence that the current CRM
database is broken.

## 4. Schema Verification

Catalog measurements after migration:

| Measurement | Result |
| --- | ---: |
| Applied local migration versions | 5 |
| Public base tables | 27 |
| Public tables with RLS | 15 |
| Public policies | 33 |
| Public functions | 65 |
| Public trigger entries | 96 |

All six Sprint 2 tables have RLS enabled:

- `inventory_items`;
- `warehouse_locations`;
- `inventory_documents`;
- `inventory_document_lines`;
- `inventory_movements`;
- `inventory_balances`.

The test-only `inventory_test_state` table is created by the acceptance suite,
is not part of any migration and is not deployed by the application.

## 5. PostgreSQL Acceptance

Results:

- `cost_management_foundation_test: PASS`;
- `inventory_material_costing_test: PASS`;
- `inventory_material_costing_concurrency_test: PASS`.

Verified inventory behavior includes:

- draft, confirm and void lifecycle;
- receipt, issue, return, transfer, adjustment and opening balance;
- negative-stock rejection;
- historical return cost;
- backdated-post rejection;
- Moving Weighted Average valuation;
- immutable confirmed documents and ledger;
- protected balance projection;
- audit events;
- reconciliation;
- tenant and manager scope;
- direct-write bypass rejection.

## 6. Concurrency and Idempotency

The local Supabase database was tested with separate overlapping PostgreSQL
sessions.

Concurrent issue result:

```text
Opening stock: 1,000
Requests: 600 + 600
Confirmed: 1
Rejected: 1
Final quantity: 400
```

Concurrent receipt result:

```text
Opening: 1,000 @ 40,000
Receipts: 500 @ 44,000 and 500 @ 46,000
Final quantity: 2,000
Final value: 85,000,000
Final average: 42,500
```

API idempotency was also verified: retrying the same opening-balance payload
returned the existing document with `reused = true` and did not create a second
document or movement.

Result: **PASS**.

## 7. PostgREST and Auth Acceptance

Five synthetic users were created through local Supabase Auth:

| Profile | Acceptance |
| --- | --- |
| Admin | Balance and cost visibility |
| Manager | Item creation, opening balance, confirmation and reconciliation |
| Inventory employee | Receipt creation and confirmation within manager scope |
| Quantity-only employee | Quantity visible; cost/value masked; writes blocked |
| Cost-view employee | Quantity and cost/value visible |

Golden API result:

```text
Opening: 100 m @ 40,000
Receipt: 20 m @ 50,000
Final quantity: 120 m
Final value: 5,000,000
Final MWA: 41,666.666667
Reconciliation difference: 0
```

The quantity-only user received `NULL` for `average_unit_cost` and
`inventory_value`. A user with `inventory_cost_view` received the cost fields.
Unauthorized document confirmation and item creation were rejected.

Result: **PASS**.

## 8. UI Smoke Result

A separate Vite instance was started at
`http://127.0.0.1:5174/inventory-management`, using process-only local
Supabase environment variables. The existing `5173` instance and repository
`.env` were not changed.

The application loaded and redirected an unauthenticated session to `/auth`.
No runtime error was recorded. Two non-blocking React Router v7 future-flag
warnings were present.

Authenticated browser workflow acceptance remains manual because entering a
password through browser automation requires action-time authorization. The
same JWT/RPC flows were completed successfully through the automated API suite.

Result: **PUBLIC SHELL PASS / AUTHENTICATED UI MANUAL CHECK PENDING**.

## 9. Legacy Regression and Fabric Boundary

No legacy fabric table was copied, changed or dual-written. The bootstrap has a
minimal `fabric_variants` contract only to validate the optional bridge from
`inventory_items`.

The following production tables remain untouched:

- `fabric_inventory`;
- `fabric_transactions`;
- `fabric_usage`;
- `fabric_transfers`.

Full legacy CRM regression after applying the Sprint migrations is not proven
because a production-schema staging clone is still unavailable.

## 10. Issues Found and Fixed

### Fixed in the local acceptance harness

1. The current Supabase CLI rejects the `psql` command
   `\set ON_ERROR_STOP on` inside migration files. The generated bootstrap copy
   strips only that line; the source test remains unchanged.
2. The full Supabase role model exposed missing fixture privileges for the
   minimal legacy `fabric_variants` bridge. The local bootstrap now mirrors the
   read privilege needed by the authenticated validation trigger.
3. Local `service_role` fixture creation initially lacked access to the
   bootstrap role, permission and warehouse tables. Those grants exist only in
   the test bootstrap, not in application migrations.
4. Supabase optional-service warnings on stderr caused PowerShell to report a
   false failure. The wrapper now parses status through `cmd`, verifies the exit
   code and separately rejects any remote link.

No production migration or production database fix was made.

## 11. Quality Gates

| Gate | Result |
| --- | --- |
| TypeScript `tsc --noEmit` | PASS |
| Sprint-scoped ESLint | PASS, 0 errors |
| Production build | PASS |
| Sprint 1 PostgreSQL suite | PASS |
| Sprint 2 PostgreSQL suite | PASS |
| Inventory concurrency | PASS |
| Local Supabase migration engine | PASS |
| Local PostgREST/Auth role matrix | PASS |
| Cost masking | PASS |
| Unauthorized write/confirm | PASS |
| Ledger reconciliation | PASS |
| Authenticated browser workflow | MANUAL CHECK PENDING |
| Production-schema regression | NOT RUN |

The build reports pre-existing large chunks, including Excel and quote bundles.
The lazy Inventory page chunk is approximately `35.74 kB` before gzip and is
not a Sprint 2 blocker.

## 12. Reproducible Commands

```powershell
npm run staging:inventory:start
npm run staging:inventory:test
npm run staging:inventory:stop
```

The API test resets only the generated local database before provisioning its
synthetic users and fixtures.

## 13. Remaining Risks

1. The repository cannot reconstruct the complete legacy CRM schema from zero.
2. No independent staging clone of the current CRM database has been tested.
3. Actual production schema drift and deployed migration history remain
   unverified.
4. Authenticated UI interaction still needs one short manual browser pass.
5. No permission Edge Function or database migration was deployed remotely.

These risks block production rollout but do not block Sprint 3 development on
the accepted isolated foundation.

## 14. Final Verdict

```text
READY FOR SPRINT 3 DEVELOPMENT
NOT READY FOR PRODUCTION MIGRATION
```

```text
NO PRODUCTION MIGRATION WAS EXECUTED.
```
