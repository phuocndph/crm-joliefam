# Phase 1A - Legacy Compatibility Strategy

## 1. Compatibility objective

The CRM must continue serving current users while Cost Management is introduced. No legacy model is deleted or silently reinterpreted. Each legacy component has an explicit disposition:

- **KEEP:** remains the active CRM source for its existing responsibility.
- **BRIDGE:** remains readable/operational while new postings reference it through stable IDs and lineage.
- **MIGRATE:** facts are copied/normalized under a reviewed, idempotent backfill with reconciliation.
- **DEPRECATE:** no new writes after a controlled cutover; historical reads remain.
- **REMOVE LATER:** only after proof, dual-read comparison, user sign-off and retention requirements.

## 2. Legacy compatibility matrix

| Legacy component | Disposition | Compatibility rule | Cutover guard |
|---|---|---|---|
| `customers` | KEEP | Existing customer IDs and manager ownership remain canonical CRM identity | New domains reference existing ID; no duplicate customer master |
| `products` | KEEP + BRIDGE | Current row remains sellable SKU where appropriate; map future SKU by `legacy_product_id` | Do not rewrite product price/cost from costing engine |
| `products.price` | BRIDGE | Current selling catalog value remains for CRM; future price versions publish separately | Order-line snapshot is authoritative for history |
| `products.cost_price` | BRIDGE | Current catalog estimate remains visible where existing screens need it | Never use it to recalculate a posted historical cost without provenance |
| `orders` | KEEP + BRIDGE | Preserve IDs, statuses and CRM workflow; add new links around it | Revenue/production postings link order ID, do not replace order table |
| `orders.items` JSONB | BRIDGE → MIGRATE incrementally | Preserve original JSON and hash; create relational order-item mapping; dual-read during reconciliation | No destructive JSON removal; compare totals/line counts before cutover |
| `orders.cost_price` | BRIDGE | Treat as legacy snapshot/proxy field | New costing snapshot lives in posting/output domain; do not overwrite legacy field |
| `orders.profit_before` | DEPRECATE for authoritative reporting | Keep for CRM display/history; new reports use posted revenue/cost facts | Side-by-side report comparison and user approval |
| `orders.profit_after` | DEPRECATE for authoritative reporting | Legacy trigger proxy remains untouched until explicit replacement plan | Never use as management net profit source |
| `order_payments` | BRIDGE | Preserve order-linked payment history; new customer receipts link source row | Reconcile totals/status before posting cutover; idempotent payment links |
| `expenses` | BRIDGE → MIGRATE classification | Preserve original row; map to business transaction/cost entry with source ID | No duplicate posting; unresolved classifications queue for review |
| `transactions` | BRIDGE → DEPRECATE generic writes | Link valid source events; do not use description-based dedupe | Stop new generic writes only after revenue/payment reconciliation |
| `finance_data` | BRIDGE → DEPRECATE | Read historical records; classify only with source evidence | Compare cash-flow views and obtain sign-off |
| `fabric_inventory` | BRIDGE | Treat current stock as legacy projection while reconciling to movement ledger | No second fabric balance source; freeze direct edits before cutover |
| `fabric_transactions` | BRIDGE → MIGRATE movement lineage | Map movement types to inventory documents/movements and preserve IDs | Quantity/unit reconciliation by warehouse/variant |
| `fabric_transfers` | BRIDGE → MIGRATE movement lineage | Map transfer out/in as one controlled transfer document | Ensure no double movement during bridge |
| `fabric_usage` | BRIDGE → MIGRATE material issue | Link usage to production/order/cost object where evidence exists | Do not run new issue trigger and new issue posting for same row |
| `fabric_variants` | KEEP + BRIDGE | Map as raw-material inventory items; preserve material attributes/cost fields | No duplicate fabric item master |
| `warehouses` | KEEP + EXTEND | Existing warehouse IDs remain valid; locations can be added later | Null location means warehouse-level legacy stock |
| `profiles`/`user_roles` | KEEP | Authentication and access source remains Supabase Auth/RLS | Worker domain references auth user optionally |
| `assignees` | KEEP + BRIDGE | Sales assignment remains distinct from worker/department | Do not infer labor identity automatically |

## 3. Incremental migration stages

### Stage 0 - Read-only baseline

- Identify actual deployed migration/version state.
- Capture counts, null/orphan/duplicate checks without changing data.
- Reconcile order totals, payment totals, expense/transaction overlap and fabric balances.

### Stage 1 - Reference bridges

- Add mapping metadata only through approved design/migration.
- Map products to future SKUs, fabric variants to inventory items, and legacy supplier text where match is confirmed.
- Keep old screens and data untouched.

### Stage 2 - Relational order-line backfill

- Parse `orders.items` into order-item candidates.
- Preserve source JSON and hash.
- Validate line subtotal, order subtotal, VAT and cost snapshot against old values.
- Route ambiguous/orphan lines to review; never guess identity silently.

### Stage 3 - Financial event bridge

- Convert eligible expenses, order payments and verified income events into business transactions with source links and idempotency keys.
- Mark source/estimated/reconciled status.
- Run dual-read reports; do not change legacy formulas.

### Stage 4 - Inventory bridge

- Reconcile fabric movement ledger to `current_stock` by item/warehouse/unit.
- Map receipts/issues/transfers/usage to the target movement semantics.
- Adopt one posting boundary; keep legacy tables read-compatible during transition.

### Stage 5 - Controlled cutover

- Enable new posting service for a bounded pilot/tenant or document type.
- Compare old/new totals daily.
- Freeze new writes to legacy generic tables only after reconciliation and user sign-off.

### Stage 6 - Deprecation and retention

- Keep historical legacy rows read-only for retention.
- Remove/retire only after audit, legal and operational approval; this Phase 1A does not authorize removal.

## 4. Compatibility rules by fact

### Historical commercial data

An order line must use its own snapshot of description, quantity, unit price, discount, VAT and cost provenance. Current product price/cost is never a fallback for a posted line unless the report explicitly labels it estimated.

### Revenue

One canonical revenue-recognition event per order/delivery policy. Legacy transaction rows are evidence/source links during bridge, not an additional source of truth after cutover.

### Expenses and cash

An expense classification and a cash settlement are separate facts. A migrated expense can create a payable/accrual cost event and a separate supplier/payment event; do not collapse them into one `Money Out` row.

### Fabric

Existing fabric movement IDs remain traceable. `fabric_inventory.current_stock` is reconciled projection; target ledger does not run alongside it for the same movement without an explicit dual-write coordinator.

## 5. Dual-read/dual-write safety

- New posting service should be feature-flagged per document type/tenant.
- If dual-write is unavoidable, both writes occur in one server-controlled transaction and share one idempotency key.
- Read comparisons must show source, version, estimated flag and reconciliation status.
- Any mismatch blocks cutover for that document class and enters a review queue.

## 6. No destructive actions in Phase 1A

This strategy does not alter legacy calculations, delete JSONB, drop tables, change triggers or rewrite balances. It is a compatibility plan for a later reviewed implementation phase.

