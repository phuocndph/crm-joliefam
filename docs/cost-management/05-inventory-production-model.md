# Phase 1A - Inventory and Production Model

## 1. Inventory source-of-truth rule

The authoritative quantity source is an append-only `inventory_movements` ledger. `inventory_balances` are derived/materialized acceleration records and must be periodically reconcilable to the ledger. No screen or service may directly alter a balance as a business action.

```text
InventoryDocument
  └── InventoryMovement (authoritative quantity event)
         ├── InventoryValuation (authoritative historical cost result)
         └── InventoryBalance (rebuildable current projection)
```

Every movement has an explicit reason, source document, item, warehouse/location, unit, quantity direction, posting date, period and idempotency key. Corrections are reversal movements, not edits to posted history.

## 2. General inventory entities

### inventory_items

- **Purpose:** Canonical stockable identity for raw materials, supplies, semi-finished goods and finished goods.
- **Primary identity:** UUID plus tenant-scoped item code.
- **Important fields:** item type (`RAW_MATERIAL`, `SUPPLY`, `WIP`, `FINISHED_GOOD`), SKU/material reference, base unit, valuation policy, lot/batch policy, active status.
- **Relationships:** warehouses, movements, balances, valuation layers, receipts, issues, outputs.
- **Ownership / tenant:** tenant required.
- **Mutable vs immutable:** code/unit/item type immutable after posted movement; status/description effective-dated.
- **Versioning:** valuation policy and unit conversion versions; historical movements retain original unit.
- **Audit:** identity, unit, policy and activation changes.
- **Expected indexes:** tenant+code unique, item type/active, SKU/material reference.
- **Key constraints:** one canonical item per mapped SKU/material; only approved unit conversions; no cross-tenant references.
- **Legacy integration:** `fabric_variants` map to raw-material inventory items; current product rows map to finished-good items only when confirmed.
- **Future extension:** lot, serial, shelf life, quality status.

### warehouses / warehouse_locations

- **Purpose:** Physical stock ownership and optional bin-level location.
- **Primary identity:** UUID plus tenant-scoped warehouse/location code.
- **Important fields:** name, site, active status, location type, parent location.
- **Relationships:** inventory documents, movements and balances.
- **Ownership / tenant:** tenant required; preserve current manager visibility as an access projection.
- **Mutable vs immutable:** identity/code stable; name/status/location hierarchy mutable only with effective history.
- **Versioning:** site/location changes are effective-dated.
- **Audit:** creation, transfer scope, deactivation.
- **Expected indexes:** tenant+code unique, active, parent/location.
- **Key constraints:** location belongs to one warehouse; no self-parent; cannot post to inactive location.
- **Legacy integration:** map existing `warehouses`; current fabric rows may remain warehouse-level while location is null.
- **Future extension:** zones, bins, quarantine/quality locations.

### inventory_documents

- **Purpose:** Workflow/approval envelope for receipt, issue, transfer, return, adjustment and output.
- **Primary identity:** UUID plus document type and tenant-scoped number.
- **Important fields:** type, status, event/posting date, source reference, reason, actor, period, idempotency key.
- **Relationships:** one-to-many movements; procurement/production source.
- **Ownership / tenant:** tenant required.
- **Mutable vs immutable:** draft/approved mutable; posted immutable; reversal creates a new document.
- **Versioning:** amendment/reversal chain.
- **Audit:** every workflow transition and authorization.
- **Expected indexes:** tenant+number, type/status/date, source reference, idempotency.
- **Key constraints:** posted document must have at least one valid movement; no duplicate business key.
- **Legacy integration:** fabric transactions/transfers are bridged as source documents, not copied into a second active ledger.
- **Future extension:** electronic signatures, barcode scanning.

### inventory_movements

- **Purpose:** Authoritative quantity ledger.
- **Primary identity:** UUID plus document/line sequence.
- **Important fields:** item, warehouse/location, lot/batch, quantity signed by movement type, unit, event/posting date, source, valuation reference, reversal link.
- **Relationships:** document, item, valuation, production/procurement/order links.
- **Ownership / tenant:** tenant and period required.
- **Mutable vs immutable:** append-only after posting.
- **Versioning:** reversal/adjustment lineage.
- **Audit:** actor, source request, reason and corrections.
- **Expected indexes:** tenant+item+warehouse+date, document, source, lot/batch, period.
- **Key constraints:** positive base quantity with typed direction; unit compatibility; no cross-tenant links; movement cannot bypass posting service.
- **Legacy integration:** `fabric_transactions` is the existing movement source during bridge; do not add a second fabric ledger before a controlled cutover.
- **Future extension:** reservations, ownership/consignment, serial tracking.

### inventory_balances

- **Purpose:** Rebuildable current/on-hand/reserved projection.
- **Primary identity:** unique item+warehouse+location+lot/batch+tenant key.
- **Important fields:** on hand, reserved, available, last movement, reconciliation version.
- **Relationships:** item/location and ledger.
- **Ownership / tenant:** tenant required.
- **Mutable vs immutable:** system projection; recalculated from movements; manual adjustment is a movement, not a balance edit.
- **Versioning:** reconciliation snapshot/version.
- **Audit:** rebuild/reconciliation event, not every derived update as a business action.
- **Expected indexes:** unique dimension key; negative/low-stock search.
- **Key constraints:** available = on hand - reserved; unit fixed per item/location.
- **Legacy integration:** `fabric_inventory.current_stock` is a legacy projection; bridge records its last known value and reconciles against movements.
- **Future extension:** ATP/commitment projections.

### inventory_valuation

- **Purpose:** Historical cost layer and issue valuation result.
- **Primary identity:** UUID plus movement/item layer reference.
- **Important fields:** policy, opening quantity/value, receipts, issues, calculated unit cost, valuation date, source layers, estimated flag, run/version.
- **Relationships:** movement, receipt, issue, production output and cost entry.
- **Ownership / tenant:** tenant/period.
- **Mutable vs immutable:** valuation result immutable after period close; corrections are revaluation events.
- **Versioning:** policy version and calculation run; historical result preserved.
- **Audit:** backfill, revaluation, override and reconciliation.
- **Expected indexes:** item/date, movement, layer, period, policy.
- **Key constraints:** value/quantity precision; issue cannot consume unavailable quantity without explicit negative-stock policy; source layer traceability.
- **Legacy integration:** no current equivalent; fabric report historical-price fallback is advisory until formal valuation exists.
- **Future extension:** FIFO/standard/actual policy variants.

## 3. Valuation policy

Initial Joliefam policy should be **moving weighted average**, but the model must store a policy identifier/version rather than hard-code only that algorithm.

For each receipt, the valuation service updates the item/location average based on opening value plus receipt value. For each issue, it records the average unit cost at posting time. The result is a historical snapshot; later receipts or price changes do not rewrite prior issues. Returns and adjustments use explicit policy rules and retain their source valuation.

Supported policy contract:

```text
VALUATION_POLICY
  code: MOVING_WEIGHTED_AVERAGE | FIFO | STANDARD | ACTUAL
  effective_from / effective_to
  unit and location scope
  rounding/negative-stock policy
```

## 4. Procurement minimum viable flow

Purchase Order is optional for MVP. The minimum is:

```text
Supplier
  -> GoodsReceipt (received quantity and price)
  -> InventoryDocument/Movement (stock increases)
  -> SupplierInvoice (liability, optionally linked)
  -> SupplierPayment (cash settlement)
```

The receipt creates inventory value; the invoice/payment creates payable/cash effects. If invoice arrives before receipt, it remains an unreceived payable/commitment until matched under policy. Original supplier document numbers and tax details are snapshots.

## 5. Production entities and flow

### production_orders

- **Purpose:** Manufacturing execution and cost object.
- **Primary identity:** UUID plus tenant-scoped production number.
- **Important fields:** source order/customer link, output SKU, planned/actual quantity, BOM version, routing version, warehouse, status, due dates, cost object, QR token.
- **Relationships:** order items, BOM/routing snapshots, operations, issues, outputs, scrap/rework and cost entries.
- **Ownership / tenant:** tenant required; source order must match tenant.
- **Mutable vs immutable:** draft/released planning mutable; released versions/snapshots and posted actuals immutable; status transitions audited.
- **Versioning:** selected BOM/routing version is copied at release; later master changes do not change this order.
- **Audit:** release, pause, completion, cancellation, quantity and version selection.
- **Expected indexes:** tenant+number, source order, SKU/status/due date, QR token.
- **Key constraints:** positive planned qty; one active output identity; no posting to closed period.
- **Legacy integration:** optional `orders.id` link; no production status written into legacy order until a later reviewed bridge.
- **Future extension:** subcontracting, split lots, customer-specific production.

### production_order_items

- **Purpose:** Planned/output lines for multi-SKU or co-products.
- **Primary identity:** production order + line sequence.
- **Important fields:** SKU, planned qty, good qty, UOM, warehouse, batch/lot.
- **Relationships:** output, scrap, BOM and inventory movements.
- **Mutable vs immutable:** plan mutable before release; actuals append-only.
- **Versioning:** output amendment/reversal.
- **Audit/index/constraints:** order+sequence, SKU/status; positive quantities and no over-output without approved variance.
- **Legacy integration:** NEW.

### production_operations and production_operation_logs

- **Purpose:** Versioned process steps and actual execution evidence.
- **Identity:** operation UUID; log UUID append-only.
- **Important fields:** routing operation, sequence, cost center, worker, status, start/end, standard minutes, actual minutes, quantity good/scrap, QR scan/request IDs.
- **Relationships:** production order, worker, cost center, labor cost entry.
- **Mutable vs immutable:** operation status controlled; logs append-only with correction events.
- **Versioning:** routing snapshot on order; actual logs never rewritten.
- **Audit/index/constraints:** order+sequence/status, worker/time, QR token; end >= start, non-negative quantity/time.
- **Legacy integration:** NEW; no payroll replacement.

### material_issues / material_issue_items

- **Purpose:** Controlled material consumption/return linked to production.
- **Identity:** issue document UUID + line sequence.
- **Important fields:** production order, item, planned/actual quantity, unit, warehouse/location, lot, reason, return link.
- **Relationships:** inventory movement, BOM line, cost object.
- **Mutable vs immutable:** draft mutable; posted issue/return immutable.
- **Versioning:** reversal/return lineage.
- **Audit/index/constraints:** production/date/item/document; positive quantity, valid stock/negative policy, idempotent posting.
- **Legacy integration:** existing `fabric_usage` is bridged only with explicit order/group/worker mapping; no double decrement.

### production_outputs and scrap/rework

- **Purpose:** Receive good output and record loss/non-good work.
- **Identity:** output UUID/document line.
- **Important fields:** SKU, quantity, unit, warehouse/lot, operation, quality status, scrap/rework reason and cost treatment.
- **Relationships:** production order, inventory output movement, cost snapshot.
- **Mutable vs immutable:** posted output append-only; corrections reverse.
- **Versioning:** output adjustment chain.
- **Audit/index/constraints:** order/SKU/date/status; good+scrap reconciliation under policy.
- **Legacy integration:** NEW; finished goods are not currently in general inventory.

## 6. BOM and cutting boundary

### BOM

```text
BOMHeader (SKU/family)
  └── BOMVersion (version, effective dates, approval)
       └── BOMLine (component, quantity, scrap, operation)
```

Each production order snapshots the approved BOM version at release. Editing a future BOM version never changes a prior production order.

### Cutting Consumption Engine boundary

The engine is a future service, not implemented here. Its input/output contract must eventually include:

- fabric inventory item and width;
- pattern direction and stripe direction;
- product dimensions and order quantity;
- joining/seaming requirements;
- standard waste and actual measured usage;
- planned consumption, actual consumption, waste and variance;
- links to production order, BOM line and material issue.

The engine must return a deterministic calculation version and preserve the original input snapshot. Manual override requires reason and approval; it cannot silently change standard BOM consumption.

## 7. Routing and labor

```text
RoutingHeader
  └── RoutingVersion
       └── RoutingOperation (standard minutes, cost center)
```

Labor supports standard minutes, actual operation minutes and optional piece rates. Actual labor events create direct labor cost entries only when worker/operation traceability is sufficient. This is not a payroll system: payroll settlement can later link to summarized labor facts.

## 8. Production cost output

At completion, the costing boundary consumes material valuation, direct labor and approved manufacturing allocation results:

```text
Material valuation
+ direct labor
+ variable manufacturing overhead
+ allocated fixed manufacturing overhead
= production output cost snapshot
```

Output cost is versioned and linked to the production order/output and inventory valuation. Management full cost is a separate view as defined in `04-cost-model.md`.

