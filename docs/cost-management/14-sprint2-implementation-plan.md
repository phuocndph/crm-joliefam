# Sprint 2 Implementation Plan - Inventory and Material Costing Foundation

## 1. Preconditions and Boundary

Sprint 2 is development-only. The code backup created at
`C:\Users\Lenovo\Documents\CRM-Joliefam-Backups\crm-joliefam-20260824-215920`
is the recovery point before implementation.

`12-sprint1-staging-acceptance.md` is `NOT READY FOR SPRINT 2` for staging,
but the Sprint 2 brief explicitly allows local development to continue. The
two HIGH Sprint 1 findings must be fixed and regression-tested before the new
inventory model is connected. No production or current CRM database migration
will be executed.

## 2. Reuse / Extend / New

| Domain | Decision | Reason |
| --- | --- | --- |
| `warehouses` | REUSE | Existing UUID, tenant, manager scope and active status are sufficient for the MVP. |
| `fabric_variants` | BRIDGE | A fabric variant may map to a new item, but legacy rows remain unchanged. |
| `fabric_inventory` | KEEP LEGACY | It remains the current fabric balance until a separately approved cutover. |
| `fabric_transactions` | KEEP LEGACY | No migration or dual-write in Sprint 2. |
| `fabric_usage` / `fabric_transfers` | KEEP LEGACY | Existing fabric workflows must continue unchanged. |
| Inventory items/documents/ledger/balances | NEW | General, unit-safe, valuation-aware inventory boundary. |

## 3. Planned Entities

- `inventory_items`: general material/SKU identity, base unit and optional
  one-to-one legacy source reference.
- `warehouse_locations`: optional bin/location hierarchy under existing
  `warehouses`.
- `inventory_documents`: DRAFT/CONFIRMED/VOIDED business envelope.
- `inventory_document_lines`: positive requested quantities and input data.
- `inventory_movements`: immutable signed quantity/value ledger.
- `inventory_balances`: rebuildable item/warehouse/location projection.

No new warehouse master and no copied fabric balance will be created.

## 4. Movement Convention

`quantity_delta` and `value_delta` are signed:

- inbound: positive quantity and positive value;
- outbound: negative quantity and negative value.

`movement_kind` explains the business meaning but is not a second direction
source. Every movement receives a database identity sequence. Ordering is
`transaction_at, movement_sequence`, never UUID order.

## 5. Moving Weighted Average

Precision:

- quantity: `NUMERIC(18,4)`;
- input/moving unit cost: `NUMERIC(18,6)`;
- value and VAT: `NUMERIC(18,2)`;
- VAT rate: `NUMERIC(7,4)`.

Receipt value is rounded to two decimals. New average is calculated from the
stored inventory value divided by the new quantity and rounded to six
decimals. Outbound movements use the locked current average; outbound value is
rounded to two decimals. When quantity reaches zero, value and average are set
to zero to prevent residual rounding drift.

The database is the only source of final cost calculations.

## 6. Locking and Concurrency

`confirm_inventory_document` will:

1. lock the document;
2. create missing zero-balance rows;
3. lock every affected balance in deterministic warehouse/item/location order;
4. validate stock, units, tenant and backdate policy;
5. calculate MWA and movement costs;
6. insert immutable movements;
7. update balance projections;
8. confirm the document and write audit;
9. commit once.

This prevents lost updates, partial transfers and concurrent negative stock.

## 7. Backdated Policy

MVP policy: reject confirmation when `transaction_at` is earlier than the last
confirmed movement for any affected item/warehouse/location. Equal timestamps
remain deterministic through `movement_sequence`. Full historical chain
recalculation is out of scope.

## 8. Return and Void Policy

`RETURN_IN` requires `source_movement_id` pointing to an outbound movement of
the same tenant/item/unit. Returned quantity cannot exceed the unreturned
source quantity. The return uses the exact historical source unit cost.

Sprint 2 permits voiding DRAFT documents only. A CONFIRMED inventory document
cannot be deleted or voided in place because later MWA movements may depend on
it. Corrections use a new RETURN/ADJUSTMENT document; a generalized reversal
engine remains future work.

## 9. Document Rules

- `RECEIPT`: warehouse required; positive input unit cost required.
- `ISSUE`: warehouse required; current MWA used; negative stock rejected.
- `RETURN_IN`: warehouse and source outbound movement required.
- `RETURN_OUT`: warehouse required; current MWA used.
- `TRANSFER`: different source/destination warehouses required; two movements
  post atomically and destination receives source outbound cost.
- `ADJUSTMENT`: elevated permission and reason required; increases need input
  cost, decreases use current MWA.
- `OPENING_BALANCE`: elevated permission, only before any movement for the
  balance, positive input cost required.

Draft documents never affect ledger or balance.

## 10. Business Transaction Integration

`inventory_documents.business_transaction_id` is an optional unique link. If
provided, the transaction must be same-tenant, CONFIRMED and its Transaction
Type must have inventory impact. This creates a one-to-one traceable boundary
without writing legacy finance tables or automatically treating a purchase as
expense. Sprint 2 does not create General Ledger entries.

## 11. Legacy Fabric Bridge

`inventory_items.legacy_source_type = 'FABRIC_VARIANT'` and
`legacy_source_id` provide the mapping. A database trigger validates that the
fabric variant exists in the same tenant. No legacy fabric row is copied,
rewritten or dual-written. Cutover requires the production-data audit and a
separate migration/reconciliation plan.

## 12. Security and Cost Visibility

New permissions:

- `inventory_view`
- `inventory_items`
- `inventory_documents`
- `inventory_confirm`
- `inventory_adjustment`
- `inventory_opening`
- `inventory_cost_view`
- `inventory_audit`

Tables use RLS and direct writes to ledger/balance are not granted. Sensitive
reads use server functions that mask unit cost/value unless the caller has
`inventory_cost_view`. Confirm/void/posting remain SECURITY DEFINER functions
with internal permission and scope validation.

The Sprint 1 fixes will make `transaction_types.is_system` immutable and add
same-tenant validation for supported polymorphic Cost Object and transaction
link targets.

## 13. UI

Add lazy route `/inventory-management` and navigation item `Kho & vật tư`.
The first screen is the operational module, not a landing page. Tabs provide:

- materials;
- current stock by warehouse;
- inventory documents;
- movement history.

Dialogs support multi-line receipt, issue, transfer, return and adjustment.
Cost columns are shown only with server-confirmed cost visibility permission.

## 14. Test Strategy

Use a disposable Supabase PostgreSQL container with the existing permission
contract, minimal legacy warehouse/fabric/product/order/customer tables,
Sprint 1 migration, security-fix migration and Sprint 2 migration.

Automated coverage includes:

- all five golden MWA scenarios;
- exact-cost return;
- atomic transfer;
- negative-stock prevention;
- draft no-impact;
- idempotent confirm;
- backdated rejection;
- opening/adjustment permissions;
- confirmed movement/document immutability;
- direct ledger/balance write rejection;
- tenant item/warehouse/document/link isolation;
- concurrent issue and receipt serialization;
- ledger/balance quantity and value reconciliation;
- cost masking;
- legacy fabric tables unchanged by new postings.

## 15. Planned Migrations and Files

- `supabase/migrations/20260824160000_cost_management_security_fixes.sql`
- `supabase/migrations/20260824170000_inventory_material_costing_foundation.sql`
- `supabase/tests/inventory_material_costing_test.sql`
- `scripts/test-inventory-material-costing.ps1`
- `src/integrations/supabase/inventory-management-types.ts`
- `src/lib/inventory-management.ts`
- `src/pages/InventoryManagementPage.tsx`
- permission, routing and navigation updates;
- `docs/cost-management/13-sprint1-security-fix-report.md`
- `docs/cost-management/15-sprint2-implementation-report.md`

## 16. Deployment Boundary

The output status can be `DEVELOPMENT READY`, never production-ready. No
legacy fabric source-of-truth claim, production backfill or production
migration is part of this sprint.

```text
NO PRODUCTION MIGRATION WILL BE EXECUTED.
```
