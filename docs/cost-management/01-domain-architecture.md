# Phase 1A - Target Domain Architecture

## 1. Scope and principles

This document is a target design only. It does not select a final physical schema and does not authorize implementation.

The target flow is:

```text
Business transaction
  -> inventory/procurement
  -> production/BOM/routing
  -> cost entries and allocations
  -> production cost
  -> management full cost
  -> pricing and profitability
```

Non-negotiable principles:

1. Cash flow is not the same thing as expense.
2. Inventory purchase is not an immediate expense; inventory is expensed when consumed/sold according to policy.
3. Asset purchase is capitalized, then depreciated.
4. Accounting production cost and management full cost are separate measures.
5. Cost category, cost behavior, cost center and cost object are separate dimensions.
6. Direct/actual cost entries are never overwritten by allocations.
7. AI can suggest classification only; deterministic rules remain authoritative.
8. Historical postings are immutable and reproducible.
9. Posting operations are idempotent and atomic.
10. Cost-sensitive writes are server-controlled and protected by RLS/role checks.
11. There is one source of truth per economic fact; legacy data is bridged, not duplicated silently.
12. CRM screens continue to work while new domains are introduced incrementally.

## 2. Bounded contexts

| Context | Owns | Does not own |
|---|---|---|
| Organization | departments, workers, cost centers, assignments | authentication credentials |
| Business partners | supplier master and customer references | order pricing or stock |
| Product identity | product family, SKU, variant dimensions | historical order-line snapshots |
| Sales transaction | order identity, order lines, delivery/revenue event | inventory valuation |
| Procurement | receipts, supplier invoices and obligations | general expense allocation |
| Inventory | items, warehouses, movements, balances and valuation layers | customer revenue |
| Production | production orders, operations, issues, outputs and scrap | payroll processing |
| Cost management | categories, entries, rules, runs, allocations and cost objects | raw cash-bank reconciliation |
| Pricing/profitability | price versions, approvals, profitability views | source ledger mutation |
| Governance | periods, audit events, idempotency keys | domain-specific calculations |

Cross-context references use stable IDs and immutable event snapshots. A context may read another context's published fact, but may not create a competing copy as its source of truth.

## 3. Organization

### Department

- **Purpose:** Organizational ownership and default operating area.
- **Primary identity:** UUID plus tenant scope; human code is unique within tenant.
- **Important fields:** code, name, parent department, active status, effective dates, manager reference.
- **Relationships:** one-to-many workers and cost centers; optional department on production operations.
- **Ownership / tenant:** tenant required; department ownership follows tenant, not an arbitrary text manager ID.
- **Mutable vs immutable:** code/identity immutable after use; name, parent and active flag versioned.
- **Versioning:** effective-dated changes; historical postings retain the department snapshot.
- **Audit:** create, rename, re-parent, deactivate and manager changes require actor/reason.
- **Indexes:** tenant+code, tenant+active, parent ID.
- **Constraints:** no self-parent; one code per tenant; cannot deactivate while active dependents exist without an explicit migration decision.
- **Legacy integration:** map profiles/assignees to a department only when confirmed; do not infer production departments from sales assignees.
- **Future extension:** sites, shifts, legal entities.

### CostCenter

- **Purpose:** Responsibility/operating location used to accumulate and allocate costs.
- **Primary identity:** UUID plus tenant-scoped code.
- **Important fields:** code, name, type (`PRODUCTION`, `SERVICE`, `SALES`, `ADMIN`), department, capacity calendar, active/effective dates.
- **Relationships:** owns assets, receives direct costs, is an allocation source/target and can be attached to operations.
- **Ownership / tenant:** tenant required; optional department FK.
- **Mutable vs immutable:** identity/code stable; type and membership effective-dated.
- **Versioning:** version capacity and allocation membership; do not rewrite closed-period ownership.
- **Audit:** every structural or capacity change.
- **Indexes:** tenant+code, tenant+type+active, department.
- **Constraints:** no cross-tenant references; closed-period references remain valid.
- **Legacy integration:** new abstraction; existing `manager_id` remains a compatibility scope, not a cost center.
- **Future extension:** standard rates, machine groups, site hierarchy.

### Employee / Worker

- **Purpose:** Link authenticated users or non-login workers to labor and operations.
- **Primary identity:** worker UUID; optional `auth_user_id` unique within tenant.
- **Important fields:** code, name, employment status, department, default cost center, labor class, effective dates.
- **Relationships:** optional profile/user role; operation logs; piece-rate or hourly rate versions.
- **Ownership / tenant:** tenant required.
- **Mutable vs immutable:** worker identity retained; employment and assignment facts effective-dated.
- **Versioning:** labor-rate and department assignments versioned.
- **Audit:** worker assignment/rate changes; no payroll data in production-operation logs.
- **Indexes:** tenant+code, auth user, department, active.
- **Constraints:** one active identity mapping; rate cannot be negative.
- **Legacy integration:** `profiles` and `user_roles` remain auth/access source; `assignees` maps only where business confirms person identity.
- **Future extension:** skill, shift, certification.

## 4. Business partners

### Supplier

- **Purpose:** Canonical procurement counterparty.
- **Primary identity:** UUID plus tenant-scoped supplier code.
- **Important fields:** legal/display name, tax ID, contacts, payment terms, currency, active status.
- **Relationships:** goods receipts, supplier invoices and supplier payments.
- **Ownership / tenant:** tenant required.
- **Mutable vs immutable:** supplier code and historical identity retained; contact/terms versioned.
- **Versioning:** effective-dated payment terms and tax data.
- **Audit:** merge, deactivate, tax/contact and payment-term changes.
- **Indexes:** tenant+code, normalized tax ID, active/name search.
- **Constraints:** no duplicate normalized tax ID when present; no cross-tenant links.
- **Legacy integration:** link future supplier ID to `fabric_transactions.supplier_name`; retain original free text as historical display, never use it as master data.
- **Future extension:** supplier rating, lead time, contracts.

### Customer

- **Purpose:** Existing CRM customer master and revenue counterparty.
- **Primary identity:** existing `customers.id`.
- **Important fields:** name, code, contacts, manager/assignee ownership, addresses.
- **Relationships:** orders, receipts, deposits, contracts and profitability.
- **Ownership / tenant:** preserve current customer ownership/RLS semantics; add tenant-safe references in future domains.
- **Mutable vs immutable:** customer ID stable; current contact data mutable, order snapshots immutable.
- **Versioning:** customer master history optional; transaction snapshots mandatory.
- **Audit:** ownership, merge and financial profile changes.
- **Indexes:** preserve current IDs; add tenant/manager/status indexes only through a later approved migration.
- **Constraints:** no duplicate customer ID; historical order links never cascade-delete the economic record.
- **Legacy integration:** **KEEP** existing customer table and ownership.
- **Future extension:** credit limit, segmentation and tax profile.

## 5. Product identity

### ProductFamily

- **Purpose:** Parent commercial concept such as `Ga chun`.
- **Primary identity:** UUID plus tenant-scoped code.
- **Important fields:** family code/name, category, default unit, active/effective dates.
- **Relationships:** one-to-many SKUs and future BOM/routing families.
- **Ownership / tenant:** tenant required.
- **Mutable vs immutable:** family identity stable; names and category effective-dated if used in reporting.
- **Versioning:** optional attribute schema versions.
- **Audit:** identity/category changes.
- **Indexes:** tenant+code, category, active.
- **Constraints:** unique code per tenant.
- **Legacy integration:** not a migration prerequisite; introduce only for new products or explicitly mapped families.
- **Future extension:** brand, collection, configurable options.

### SKU

- **Purpose:** Stable sellable/manufacturable identity.
- **Primary identity:** UUID plus tenant-scoped SKU code.
- **Important fields:** SKU code, product family, base unit, attributes JSON, status, costing/pricing references.
- **Relationships:** existing product mapping, order lines, BOM/routing, inventory item.
- **Ownership / tenant:** tenant required.
- **Mutable vs immutable:** SKU identity/code and unit are immutable after transaction use; descriptive attributes can version.
- **Versioning:** attribute, BOM and price links are effective-dated; historical lines retain snapshots.
- **Audit:** create, deactivate, code merge and attribute changes.
- **Indexes:** tenant+code unique, family, active, normalized attribute search.
- **Constraints:** one canonical SKU code per tenant; unit compatibility enforced at posting boundaries.
- **Legacy integration:** current `products` row is treated as the current sellable SKU where appropriate; map by `legacy_product_id` rather than duplicating products.
- **Future extension:** configurable variant matrix, barcode/QR, customer-specific SKU.

### VariantDimension / SKUAttributeValue

- **Purpose:** Future-compatible size, material, color, width and other dimensions.
- **Primary identity:** dimension/value IDs; SKU-to-value link.
- **Important fields:** dimension code, value code/label, data type, allowed unit/order.
- **Relationships:** SKU and ProductFamily.
- **Ownership / tenant:** tenant required.
- **Mutable vs immutable:** codes stable; labels can be translated/versioned.
- **Versioning:** effective-dated values; never reinterpret a historical value code.
- **Audit:** value creation/deactivation.
- **Indexes:** tenant+dimension code, tenant+dimension+value code, SKU links.
- **Constraints:** no duplicate dimension/value codes; only valid values per dimension.
- **Legacy integration:** map `products.specifications` manually or leave unmapped; do not parse free text silently.
- **Future extension:** rules for valid combinations.

## 6. Sales and order lines

### OrderItem

- **Purpose:** Relational commercial snapshot for one order line.
- **Primary identity:** UUID; stable `order_id` + line sequence.
- **Important fields:** order, SKU reference (nullable for legacy), description snapshot, quantity, unit, unit price before VAT, discount, VAT, line total, unit cost snapshot, cost provenance, source JSON hash.
- **Relationships:** existing order, canonical SKU, revenue event and profitability views.
- **Ownership / tenant:** inherit tenant and order scope; server verifies ownership.
- **Mutable vs immutable:** draft lines mutable; once confirmed/delivered, commercial and cost snapshot fields immutable. Corrections are adjustment/reversal events.
- **Versioning:** no in-place historical rewrite; amendments create version/adjustment metadata.
- **Audit:** line add/edit/delete, price override, cost backfill and confirmation.
- **Indexes:** order+sequence, SKU, tenant+order, source legacy identifier.
- **Constraints:** positive quantity for normal lines; totals calculated in PostgreSQL/server posting; no current-product lookup for closed lines.
- **Legacy integration:** **BRIDGE** `orders.items` into relational rows incrementally; keep original JSON unchanged and retain a hash/mapping marker. New writes dual-read/dual-write only under one controlled service until cutover.
- **Future extension:** fulfillment split, shipment allocation, customer-specific attributes.

## 7. Target architecture overview

```text
Auth/profile/user_roles ──> Worker ──> Department ──> CostCenter
                                      └──────────────> ProductionOperation

Customer ──> Existing Order ──> OrderItem snapshot ──> SKU/Product mapping
                     └────────> Revenue recognition BusinessTransaction

Supplier ──> GoodsReceipt ──> InventoryMovement ──> ValuationLayer/Balance
                               └───────────────> SupplierInvoice/Payment

SKU ──> BOMVersion ──> ProductionOrder ──> MaterialIssue
                                         └─> Operations/Logs ──> Output/Scrap

All economic events ──> CostEntry ──> AllocationRun/Result ──> CostObject
                                  ├─> Production Cost
                                  └─> Management Full Cost

Cost/price versions ──> PricingApproval ──> Profitability (read models)
Period + Audit + Idempotency govern every posting.
```

## 8. Target design posture

The target is an additive bounded-context architecture with explicit bridges to CRM. New domains must publish stable facts and must not overwrite `orders.profit_after`, `products.cost_price` or fabric balances until a separately approved migration and cutover plan exists.

## 9. Source-of-truth matrix

| Fact | Target source of truth | Read projections / legacy evidence | Rule |
|---|---|---|---|
| Customer identity | Existing `customers` | CRM screens, future partner links | Keep existing ID; no duplicate customer master |
| Sellable SKU identity | SKU mapping with legacy product reference | `products` remains current CRM catalog | One canonical mapping; product price is not historical truth |
| Historical order commercial data | Confirmed relational `order_items` snapshot | `orders.items` JSONB retained as source evidence during bridge | Snapshot wins for posted order; JSON is never silently deleted |
| Revenue recognition | Posted `business_transaction` revenue event | Legacy `transactions` rows during reconciliation | One idempotent order/event business key |
| Customer payment | Customer receipt transaction linked to `order_payments` | `orders.payment_status`, `payment_summary` | Payment status is a projection, not a second receipt ledger |
| Expense occurrence | Posted `cost_entries` linked to source transaction | `expenses`/legacy finance records during bridge | Expense is separate from cash settlement |
| Supplier payable/payment | Supplier invoice and supplier-payment transactions | Legacy transaction/finance rows | Invoice and payment remain separate events |
| Stock quantity | Posted `inventory_movements` | `inventory_balances`, legacy fabric tables | Balances are rebuildable and reconciled |
| Stock valuation | Versioned `inventory_valuation` | Fabric report estimates during bridge | Preserve policy/layer at issue time |
| Production actuals | Production operation logs, issues and outputs | None currently | Append-only actual facts |
| BOM/routing policy | Approved effective-dated BOM/routing versions | Production order snapshot | Later master edits do not alter released orders |
| Direct/actual cost | `cost_entries` | Source transaction evidence | Never overwrite with allocations |
| Shared cost allocation | Allocation results tied to run/rule version | Cost reports | Results can be superseded; source entries remain |
| Production cost | Versioned output/order cost snapshot | Costing read model | Separate from management full cost |
| Management full cost | Management allocation result/read model | Profitability report | Never overwrite production/inventory cost |
| Selling price | Approved price version | `products.price` current catalog | Order line snapshots preserve history |
| Audit history | Immutable `audit_events` | timestamps/specialized logs | Before/after/reason required for sensitive changes |
| Period status | `financial_periods` + `period_closings` | None currently | Posting service enforces status |

