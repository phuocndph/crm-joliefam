# Phase 1A - Entity Map

This is a logical entity map. It intentionally avoids SQL types, migration order and physical table DDL.

## 1. Identity and organization

```text
Tenant
 ├── Department (parent_department_id -> Department)
 │    └── Worker (optional auth_user_id -> profiles/auth.users)
 └── CostCenter (optional department_id)
      ├── AssetAssignment
      ├── CostEntry
      ├── AllocationRuleVersion
      └── ProductionOperation
```

### Entity contracts

| Entity | Purpose / identity | Important relationships | Mutability/versioning | Tenant, audit, indexes and constraints | Legacy integration / extension |
|---|---|---|---|---|---|
| Department | Organizational unit; UUID + tenant code | workers, cost centers, operations | identity stable; parent/name effective-dated | tenant; audit structural changes; code/parent/active indexes; unique code, no self-parent | NEW; map only confirmed profiles/assignees; sites/shifts later |
| Worker | Labor identity; UUID + worker code | profile, department, rates, operation logs | employment/rate assignments versioned | tenant; audit assignment/rate; code/auth/active indexes; one active auth mapping | EXTEND profiles, do not replace auth; skills later |
| CostCenter | Responsibility bucket; UUID + code | department, assets, entries, allocation | membership/capacity versioned | tenant; audit; code/type/active indexes; no cross-tenant refs | NEW; manager_id remains CRM scope only |
| Asset | Machine/equipment; UUID + asset code | category, cost center, depreciation | identity immutable; status/location mutable via events | tenant; audit; code/center/status indexes; unique code | NEW; machines later |

## 2. Partners and commercial identity

```text
Supplier ──< GoodsReceipt ──< GoodsReceiptItem ──> InventoryItem/SKU
Supplier ──< SupplierInvoice ──< SupplierInvoiceItem
Customer (existing) ──< Order (existing) ──< OrderItem (bridge)
ProductFamily ──< SKU ──< OrderItem
```

| Entity | Purpose / identity | Important fields | Relationships | Versioning and audit | Constraints/indexes | Legacy integration / extension |
|---|---|---|---|---|---|---|
| Supplier | Canonical procurement party; UUID + tenant code | legal name, tax ID, contacts, terms, status | receipts, invoices, payments | terms/tax effective-dated; audit merge/deactivate | tenant+code, normalized tax ID, active/name; tax ID unique when present | NEW; bridge fabric free-text supplier_name; rating later |
| ProductFamily | Parent commercial concept; UUID + code | name, category, unit | SKUs, BOM/routing families | descriptive versioning; audit | code/category/active | NEW/incremental; current products can remain standalone |
| SKU | Stable sellable/manufacturable identity; UUID + code | family, unit, attributes, status | order lines, inventory, BOM/routing | code/unit immutable after use; attribute versions; audit | tenant+SKU unique, family, active | current products are mapped SKUs; barcode later |
| VariantDimension | Controlled attribute vocabulary; UUID + code | type, code, label, allowed units | SKU attribute values | values never reinterpreted; audit | tenant+dimension/value unique | map specifications manually; combination rules later |
| OrderItem | Commercial/cost snapshot; UUID + order+sequence | quantity, unit, price, discount, VAT, cost snapshot, provenance | order, SKU mapping, revenue event | draft mutable; confirmed immutable; corrections as events; audit | order+sequence, SKU, tenant; positive qty; server totals | bridge orders.items, retain JSON/hash; split shipments later |

## 3. Inventory and procurement

```text
InventoryItem (SKU/material identity)
   ├── Warehouse ──< WarehouseLocation
   ├── InventoryDocument ──< InventoryMovement
   ├── InventoryBalance (derived/materialized)
   └── InventoryValuationLayer (historical valuation)
GoodsReceipt ──< GoodsReceiptItem ──> InventoryDocument/Movement
MaterialIssue ──< MaterialIssueItem ──> InventoryMovement
ProductionOutput ──> InventoryMovement
```

| Entity | Purpose / identity | Important relationships | Mutable/versioned | Audit/index/constraints | Legacy integration / extension |
|---|---|---|---|---|---|
| InventoryItem | Canonical stockable item; UUID + item code | SKU/material, unit, valuation policy | identity/unit immutable after postings; status effective-dated | tenant; audit; code/type/active; one canonical SKU/material mapping | NEW boundary; map fabric_variants first, do not duplicate balances |
| Warehouse | Physical stock ownership; UUID + code | locations, documents, balances | name/status mutable; identity stable | tenant; audit; code/active; unique code | bridge current warehouses |
| WarehouseLocation | Bin/zone; UUID + code within warehouse | warehouse, movements/balances | identity stable; active mutable | tenant; code/warehouse index; unique per warehouse | NEW; current fabric has no location granularity |
| InventoryDocument | Business reason/approval envelope; UUID + document number | receipt, issue, transfer, adjustment, output | status workflow; posted docs immutable | idempotency key, type/status/date indexes; unique document number | bridge fabric transaction/transfer records |
| InventoryMovement | Authoritative quantity ledger row; UUID + document/line | item, warehouse/location, lot, valuation layer | immutable after posting; reversal only | tenant/item/warehouse/date, document; quantity sign/unit checks | existing fabric_transactions become bridge/read source until cutover |
| InventoryBalance | Fast derived current balance | item/location/lot and movement ledger | rebuildable/materialized; never independent truth | unique item+location+lot; reconciliation metadata | map fabric_inventory.current_stock as legacy balance; no second ledger |
| InventoryValuation | Historical cost result/layer | movement, receipt layer, issue allocation, policy | immutable per posting; corrections are new layer/reversal | item/date/layer indexes; non-negative layer rules | no current equivalent; weighted-average initial policy |
| GoodsReceipt | Procurement receipt header; UUID + receipt number | supplier, receipt items, inventory doc, invoice | draft/posted/void; posted immutable | supplier/date/status/number/idempotency; unique number | NEW; fabric inbound can be linked as historical bridge |
| GoodsReceiptItem | Receipt line; UUID + sequence | receipt, item, quantity, unit price, tax | draft mutable; posted immutable | receipt+sequence, item; positive quantity | NEW; preserve inbound text/refs |
| SupplierInvoice | Supplier liability document; UUID + invoice number | supplier, receipt links, payment links | status/approval; posted immutable | supplier/invoice/date/status; unique supplier number | NEW; no current payable equivalent |
| SupplierInvoiceItem | Invoice line; UUID + sequence | invoice, receipt/item, expense/inventory/asset classification | posted immutable; corrections as credit/debit docs | invoice+sequence, source ref | NEW |

## 4. Production and costing

```text
SKU ──< BOMHeader ──< BOMVersion ──< BOMLine ──> InventoryItem/SKU
SKU ──< RoutingHeader ──< RoutingVersion ──< RoutingOperation
Order ──< ProductionOrder ──< ProductionOrderItem
ProductionOrder ──< ProductionOperation ──< ProductionOperationLog ──> Worker
ProductionOrder ──< MaterialIssue ──< MaterialIssueItem ──> InventoryMovement
ProductionOrder ──< ProductionOutput / Scrap / Rework ──> InventoryMovement
CostEntry ──< AllocationResult ──> CostObject
```

| Entity | Purpose / identity | Important relationships | Mutability/versioning | Audit/index/constraints | Legacy integration / extension |
|---|---|---|---|---|---|
| BOMHeader | BOM identity for SKU/family | SKU/family, versions | identity stable; status mutable | tenant/SKU/active indexes | NEW |
| BOMVersion | Effective approved formula | header, lines, production order snapshot | immutable after approval; effective dates/version | unique header+version; no overlapping approved dates | NEW; production order stores selected version |
| BOMLine | Component requirement and scrap factor | version, material/SKU, operation | immutable approved line | version+sequence; positive qty; valid unit | NEW; cutting boundary may attach detail |
| RoutingHeader | Process identity | SKU/family, versions | identity stable | tenant/SKU | NEW |
| RoutingVersion | Effective operation sequence | header, operations | immutable after approval | unique version/effective date; no overlap | NEW |
| RoutingOperation | Standard step and minutes | routing version, cost center | approved fields immutable | version+sequence; minutes >= 0 | NEW; QR code later |
| ProductionOrder | Manufacturing execution envelope | order, SKU/output, BOM/routing snapshot, cost object | draft/released/in-process/completed/cancelled; posted facts immutable | order/status/date/SKU indexes; idempotency | NEW; optional order link preserves CRM |
| ProductionOrderItem | planned/output quantity | production order, SKU | planned mutable until release; actual immutable | order+sequence; quantity checks | NEW |
| ProductionOperation | execution step | production order, routing op, cost center | status/events; history immutable | order/sequence/status/worker | NEW |
| ProductionOperationLog | actual worker/time/quantity event | operation, worker, driver | append-only corrections | operation/worker/time indexes; non-negative duration | NEW; no payroll replacement |
| MaterialIssue | material consumption document | production order, inventory document | draft/posted/reversed; posted immutable | order/date/status/idempotency | NEW; bridge existing fabric usage only by explicit source mapping |
| MaterialIssueItem | consumed/returned material | issue, inventory item, movement | posted immutable | issue+sequence; positive qty | NEW |
| ProductionOutput | finished/semi-finished receipt | order, output item, inventory movement | posted immutable; scrap/rework separate | order/item/date | NEW |
| Scrap/Rework | Non-good output and reason | production order/operation, item | append-only | order/reason/date | NEW |
| CostEntry | Actual/direct cost fact | category, center, object, source transaction | immutable posting; reversal/adjustment | period/date/center/object/category/source idempotency | NEW; expense/transactions bridged |
| CostObject | Unit whose cost/profit is measured | order, production order, SKU, customer | identity stable; assignment effective-dated | tenant/type/reference indexes | NEW; order ID may be one object type |

## 5. Governance entities

| Entity | Purpose / identity | Important fields | Relationships / constraints |
|---|---|---|---|
| FinancialPeriod | Calendar posting boundary; tenant + period code | start/end, status, close policy | no overlapping periods; postings must reference one period |
| PeriodClosing | Close/reopen workflow record | period, status, actor, reason, checksums | OPEN → SOFT_CLOSED → CLOSED → REOPENED; reopening requires authorization |
| AuditEvent | Immutable history | actor, action, entity, entity_id, before, after, reason, timestamp, request/source ID | append-only; indexes entity/request/actor/time; no update/delete via app |
| IdempotencyKey | Exactly-once posting guard | operation type, business key, request ID, result reference, hash | unique tenant+operation+business key; same key must produce same result or explicit conflict |

## 6. Entity design rules

Every proposed entity must carry tenant scope, lifecycle state where relevant, created/posted timestamps, actor/source metadata and explicit immutability semantics. Financial and quantity calculations are server/database-owned using PostgreSQL numeric types; the UI is never the final authority.

