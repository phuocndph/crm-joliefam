# Sprint 2 Implementation Report - Inventory and Material Costing Foundation

## 1. Result

Sprint 2 implements a development-only general inventory ledger and material
valuation engine. It does not replace or dual-write the legacy fabric system.

Implemented document lifecycle:

```text
DRAFT -> CONFIRMED
DRAFT -> VOIDED
```

Confirmed inventory documents are not voided or rewritten in the MVP. Errors
must be corrected with a new return or adjustment document so the historical
Moving Weighted Average chain remains reproducible.

Development verdict:

```text
DEVELOPMENT READY FOR SPRINT 3
```

This is not a production deployment verdict.

## 2. Inventory Model

Migration:

```text
supabase/migrations/20260824170000_inventory_material_costing_foundation.sql
supabase/migrations/20260825090000_inventory_hardening.sql
```

New tables:

- `inventory_items`
- `warehouse_locations`
- `inventory_documents`
- `inventory_document_lines`
- `inventory_movements`
- `inventory_balances`

Existing `warehouses` are reused. `inventory_movements` is the immutable source
of truth; `inventory_balances` is a protected, rebuildable projection.

Quantity and value convention:

- inbound movement: positive quantity/value;
- outbound movement: negative quantity/value;
- quantity: `NUMERIC(18,4)`;
- unit cost: `NUMERIC(18,6)`;
- inventory value and VAT: `NUMERIC(18,2)`;
- same-time ordering: database `movement_sequence` identity.

The balance key uses `UNIQUE NULLS NOT DISTINCT` across tenant, item, warehouse
and optional location. The automated suite proves that a null location cannot
create duplicate balance rows.

## 3. Server Write Boundary

Posting operations are server-controlled through:

- `create_inventory_document`
- `confirm_inventory_document`
- `void_inventory_document`
- internal `apply_inventory_movement`

Read/masking functions:

- `list_inventory_warehouses`
- `list_inventory_business_transactions`
- `list_inventory_balances`
- `list_inventory_documents`
- `list_inventory_movements`
- `reconcile_inventory_balances`

The client is not granted direct write access to movements, balances,
documents or document lines. Direct insert/update/delete bypass tests pass.
Header totals, posted costs and moving averages are calculated by PostgreSQL.

## 4. Moving Weighted Average

Status: PASS.

Golden sequence verified:

1. `1,000 x 40,000` -> quantity `1,000`, value `40,000,000`, average `40,000`.
2. Receipt `500 x 46,000` -> quantity `1,500`, value `63,000,000`, average `42,000`.
3. Issue `300` -> issue cost `12,600,000`, remaining value `50,400,000`.
4. Receipt `800 x 45,000` -> quantity `2,000`, value `86,400,000`, average `43,200`.
5. Issue `500` -> issue cost `21,600,000`, remaining value `64,800,000`.

Outbound cost always uses the locked current average. Receipt average is based
on stored inventory value, not a frontend preview. Quantity reaching zero also
sets average and inventory value to zero to prevent rounding residue.

## 5. Receipt, Issue, Return, Transfer and Adjustment

Implemented document types:

- `RECEIPT`
- `ISSUE`
- `RETURN_IN`
- `RETURN_OUT`
- `TRANSFER`
- `ADJUSTMENT`
- `OPENING_BALANCE`

Verified behavior:

- draft documents do not affect stock;
- negative stock is rejected atomically;
- backdated confirmation before the latest movement is rejected;
- `RETURN_IN` requires an eligible outbound source movement and restores its
  exact historical unit cost;
- returned quantity cannot exceed the source outbound quantity;
- transfer posts source OUT and destination IN in one transaction at the same
  cost, creating no artificial gain/loss;
- adjustment requires elevated permission and a reason;
- adjustment increase requires an input cost;
- opening balance is restricted and cannot be posted after an existing
  movement for the same balance;
- a material base unit cannot be changed after the item has movements.

No automatic `KG <-> METER` conversion exists.

## 6. Concurrency and Idempotency

Status: PASS.

The test runner opens separate PostgreSQL sessions and forces real overlap
while the first posting holds the affected balance lock.

Concurrent issue test:

```text
Opening stock: 1,000
Concurrent issues: 600 + 600
Result: one CONFIRMED, one rejected, final stock 400
```

Concurrent receipt test:

```text
Opening: 1,000 @ 40,000
Concurrent: 500 @ 44,000 and 500 @ 46,000
Final: quantity 2,000, value 85,000,000, average 42,500
```

Create and confirm retries are idempotent and do not duplicate documents or
movements.

## 7. Ledger Reconciliation

Status: PASS.

For all sequential and concurrent datasets:

```text
SUM(inventory_movements.quantity_delta) = inventory_balances.quantity_on_hand
SUM(inventory_movements.value_delta) = inventory_balances.inventory_value
```

The UI includes an authorized reconciliation view and recent Inventory audit
events. Balance repair is not exposed to the client.

The hardening migration also reconciles the union of ledger and balance keys,
so a missing balance projection is reported instead of disappearing from the
result. Both sides of the reconciliation use the same warehouse/manager scope.

## 8. Business Transaction Integration

`inventory_documents.business_transaction_id` is an optional unique link.
The linked Business Transaction must be:

- same tenant;
- `CONFIRMED`;
- based on a Transaction Type with inventory impact;
- not already linked to another Inventory Document.

The document-to-transaction mapping is now enforced at draft creation, draft
update and confirmation:

- `RECEIPT` -> `PURCHASE_MATERIAL`;
- `ISSUE` -> `MATERIAL_ISSUE`;
- `RETURN_IN` -> `MATERIAL_RETURN`;
- `ADJUSTMENT` -> `INVENTORY_ADJUSTMENT`;
- `TRANSFER`, `RETURN_OUT` and `OPENING_BALANCE` cannot link a Business
  Transaction until a matching Transaction Type is explicitly designed.

The UI asks the server for only the transactions matching the current document
type. Changing document type clears the previous selection. The old unfiltered
RPC signature is removed.
The database masks transaction totals without `inventory_cost_view`.

Automated tests prove that `PURCHASE_MATERIAL` remains an `INVENTORY` effect,
not an immediate direct-material expense, and that draft/duplicate transaction
links are rejected.

## 9. Security, RLS and Cost Visibility

Status: PASS.

Permissions added:

- `inventory_view`
- `inventory_items`
- `inventory_documents`
- `inventory_confirm`
- `inventory_adjustment`
- `inventory_opening`
- `inventory_cost_view`
- `inventory_audit`

All six new tables have RLS. Server functions validate role, tenant, manager
scope, item, warehouse, location, transaction and source-movement references.

Verified cases include:

- another tenant's item cannot be posted;
- another tenant's warehouse cannot be used as source or destination;
- normal users cannot insert/update/delete ledger or balance rows;
- confirmed documents and movements cannot be modified;
- cost/value columns are null for a quantity-only employee;
- dashboard/reconciliation values are masked without `inventory_cost_view`;
- admin cost visibility remains available;
- confirm and adjustment permissions are enforced server-side;
- raw Inventory audit requires both `inventory_audit` and
  `inventory_cost_view`;
- audit metadata and raw audit rows respect manager scope;
- Inventory create/confirm/void and master changes create audit events.

The permission Edge Function allowlist was updated in source but was not
deployed.

## 10. Legacy Fabric Bridge

`inventory_items` can reference one `fabric_variants` row through:

```text
legacy_source_type = FABRIC_VARIANT
legacy_source_id   = fabric_variants.id
```

The bridge validates same-tenant existence and compatible units. It does not
copy, rewrite or dual-write:

- `fabric_inventory`
- `fabric_transactions`
- `fabric_usage`
- `fabric_transfers`

The legacy Fabric UI remains the current production source of truth until a
separate audited migration and cutover phase.

## 11. Frontend

New lazy route:

```text
/inventory-management
```

Main UI:

- current stock by item/warehouse/location;
- material master with search, status and legacy bridge marker;
- multi-line receipt, issue, return, transfer, adjustment and opening forms;
- eligible Business Transaction selector;
- document list with type/status/search filters;
- server-controlled confirm and draft void actions;
- movement history with running quantity and authorized valuation;
- reconciliation and audit view;
- explicit missing-schema/load-error state so an unavailable RPC is never
  displayed as a valid zero balance.

Initial-load optimization added on 2026-08-25:

- a lightweight `get_inventory_dashboard_summary` RPC provides the four header
  metrics without downloading 500 documents;
- documents load only when the `Phiếu kho` tab is opened;
- up to 1,000 movements load only when the `Lịch sử` tab is opened;
- reconciliation and audit load only when the `Đối soát` tab is opened;
- Business Transactions load only while the create dialog is open and are
  filtered by document type;
- return-source candidates use a dedicated RPC that returns only outbound
  movements with remaining returnable quantity, independent of the History
  tab filter.

Desktop and `390 x 844` mobile layouts were inspected in the in-app browser.
The mobile dialog was corrected to use `100dvh` and a higher stacking level so
the fixed bottom navigation cannot cover its Save/Close controls.

Files:

- `src/integrations/supabase/inventory-management-types.ts`
- `src/lib/inventory-management.ts`
- `src/pages/InventoryManagementPage.tsx`
- routing, desktop/mobile navigation and permission files.

## 12. Automated Verification

Commands and results:

```text
npm run test:cost-management     PASS
npm run test:inventory           PASS
npm run test:cost-management     PASS after hardening
npx tsc --noEmit -p tsconfig.app.json
                                 PASS
npm run build                    PASS
Sprint-scoped ESLint             0 errors
```

Focused ESLint still reports one pre-existing hook dependency warning in
`EmployeePermissionManagement.tsx`; it has no Sprint 2 error. The production
build also retains the repository's existing Browserslist-age and large-chunk
warnings. The 2026-08-25 hardening build keeps the Inventory page lazy-loaded
at approximately `9.79 kB` gzip.

Automated visual re-check of `localhost` was blocked by the browser-control URL
policy in this session. The Vite server was started and remains available for
direct user inspection. Database tests, TypeScript, scoped ESLint and the
production build all passed after the UI changes.

## 13. Legacy Regression

Status: PASS.

Read-only browser smoke tests using the updated local source and the existing
authenticated session covered:

- Products;
- Orders;
- Cash Flow / Expenses;
- Transactions / Payments;
- Fabric;
- Reports.

Every route rendered its expected application heading/content and no browser
console errors were observed. No form was submitted and no CRM data changed.

## 14. Migration and Deployment Boundary

Migrations created for development:

```text
supabase/migrations/20260824160000_cost_management_security_fixes.sql
supabase/migrations/20260824170000_inventory_material_costing_foundation.sql
supabase/migrations/20260825090000_inventory_hardening.sql
```

Test files:

```text
supabase/tests/inventory_material_costing_test.sql
supabase/tests/inventory_material_costing_concurrency_assert.sql
scripts/test-inventory-material-costing.ps1
```

All database mutations occurred only inside disposable PostgreSQL containers.

```text
NO PRODUCTION MIGRATION WAS EXECUTED.
```

## 15. Remaining Acceptance Work

Before any production decision:

1. create or prove an independent non-production Supabase database;
2. apply Sprint 1 security fixes and Sprint 2 migration there;
3. deploy the permission Edge Function to that non-production project;
4. complete manual role-based CRUD/confirm/return/transfer acceptance;
5. complete Phase 1B.2 production data measurements;
6. design and approve the legacy fabric backfill/reconciliation/cutover plan.

The current CRM Supabase project intentionally does not contain this migration.
The new page therefore shows a controlled unavailable-schema message there.

## 16. Final Status

```text
MOVING WEIGHTED AVERAGE: PASS
GOLDEN COSTING TESTS: PASS
CONCURRENCY: PASS
SECURITY / RLS: PASS
LEDGER RECONCILIATION: PASS
BUSINESS TRANSACTION SEMANTICS: PASS
RETURN SOURCE CALCULATION: PASS
AUDIT/COST MASKING: PASS
LAZY DATA LOADING: IMPLEMENTED
LEGACY REGRESSION: PASS
PRODUCTION READY: NO
DEVELOPMENT READY FOR SPRINT 3: YES
```
