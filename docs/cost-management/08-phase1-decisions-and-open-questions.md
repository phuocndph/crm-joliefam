# Phase 1A - Decisions and Open Questions

## 1. Architecture decisions

| ID | Decision | Rationale / consequence |
|---|---|---|
| AD-001 | Use bounded contexts around sales, procurement, inventory, production, costing and governance | Prevents one generic table from mixing economic meanings. |
| AD-002 | Existing customers and order IDs remain CRM anchors | Protects current users and links future postings without duplicate CRM identity. |
| AD-003 | Treat current product rows as sellable SKUs where appropriate | Avoids a major Product/SKU migration in the first increment. |
| AD-004 | Introduce relational order lines incrementally | JSONB history remains intact while new lines gain constraints and snapshots. |
| AD-005 | Posted order-line commercial/cost data is immutable | Historical reports cannot depend on current catalog prices/costs. |
| AD-006 | `business_transactions` is the target economic-event source | Cash, inventory and cost effects are explicit lines, not inferred from one amount. |
| AD-007 | Cash flow, expense, inventory purchase and asset purchase remain distinct | Prevents false net-profit and cash-flow reporting. |
| AD-008 | Inventory movements are authoritative; balances are derived/reconcilable | Prevents stored balance and ledger drift becoming two sources of truth. |
| AD-009 | Initial valuation policy is moving weighted average, policy-versioned | Meets Joliefam expectation without locking future methods out. |
| AD-010 | Production orders snapshot approved BOM/routing versions | Later master changes cannot alter old production costs. |
| AD-011 | Production Cost and Management Full Cost are separate outputs | Selling/management allocation must not contaminate inventory/statutory production cost. |
| AD-012 | Direct actual costs remain separate from allocation results | Allocation can be rerun/explained without overwriting source facts. |
| AD-013 | Allocation rules and normal capacity are versioned/effective-dated | Period reports need reproducibility and approved assumptions. |
| AD-014 | Generic immutable audit events are mandatory | Financial/inventory corrections require actor, before/after and reason. |
| AD-015 | Idempotency is a posting invariant | Delivery recognition, payments, issues and retries cannot duplicate effects. |
| AD-016 | Cost-sensitive writes are server/database controlled | Frontend direct writes are not sufficient for atomic multi-domain posting. |
| AD-017 | AI classification is advisory only | Deterministic rule engine and authorized review remain source of truth. |
| AD-018 | No destructive legacy removal during migration | CRM availability and historical retention take precedence. |

## 2. Decisions requiring business confirmation

These are design choices to approve before implementation, not assumptions to hide in code:

1. Is moving weighted average applied globally, per warehouse, or per warehouse/location/lot?
2. Is negative stock prohibited, allowed with a controlled provisional cost, or allowed only for legacy reconciliation?
3. What exact event recognizes revenue: delivered date, self-delivered date, or a separately approved completion event?
4. How are returns treated: revenue reversal only, stock return, production rework, or a combination by disposition?
5. Which VAT rates and price-basis rules apply to historical and future orders?
6. Which products are made-to-order versus stocked finished goods?
7. What is the authoritative fabric unit policy for historical and future data (`m`, `kg`, roll, or conversions)?
8. Are Phước/Hoan order types separate cost objects, departments, or reporting dimensions?
9. Which overhead costs belong in production cost versus management full cost?
10. What is the normal-capacity calendar and driver by cost center?
11. Are piece rates required in the first production increment, and how are labor rates approved?
12. How should subcontracted operations and outsourced finishing be classified?
13. What is the period calendar/timezone and who may soft-close, close or reopen?
14. What retention period and export requirements apply to audit events and financial postings?
15. Which roles may view/edit cost, valuation, allocation rules and price approvals?

## 3. Recommended Phase 1B read-only production checks

Run only with read-only credentials/queries and an approved time window. Do not mutate production data.

### Deployment and schema checks

- Confirm linked Supabase project/ref and applied migration versions.
- Inspect effective columns, constraints, indexes, triggers, functions and RLS policies for all Phase 0 tables.
- Confirm whether the local pending fabric migration is deployed; do not apply it during checks.

### Order and revenue checks

- Count orders by status, delivery date presence and date range.
- Compare `orders.items` JSON line totals to scalar `total_amount`, `subtotal`, VAT and cost fields.
- Identify delivered orders without delivered date and delivered orders with multiple matching income transactions.
- Compare revenue by delivery date versus created date; quantify VAT-basis differences.
- Identify duplicate order numbers/display numbers and orders whose product IDs/SKUs no longer resolve.

### Payment/expense checks

- Recalculate each order payment status from `order_payments` and compare `orders.payment_status`.
- Test DELETE-trigger definition statically and, if approved, use a transaction-scoped non-committing test environment; never delete a production row.
- Match `order_payments`, `transactions`, `expenses` and `finance_data` by explicit source IDs first, then flag ambiguous overlaps for review.
- Classify money-out records into inventory purchase, asset, expense, advance, loan or settlement candidates without writing classifications.

### Inventory checks

- Reconcile `fabric_inventory.current_stock` against summed inbound/outbound/transfer/usage movements by variant and warehouse.
- Check negative balances, negative movement quantities, mixed units (`kg`/`m`), orphan foreign keys and duplicate movement references.
- Identify direct frontend writes versus RPC/trigger paths from source and logs; do not replay movements.

### Product/SKU and costing checks

- Count duplicate SKUs per price list and unresolved specification/variant patterns.
- Quantify orders with historical line cost snapshots versus product-cost fallback.
- Identify product/fabric cost changes without price history or audit evidence.

### Security/governance checks

- Evaluate effective RLS for admin/manager/accountant/employee on cost, price, movement and payment operations.
- Check whether a sales user can update `cost_price`, whether employees can edit/delete posted movements, and whether reports expose estimated costs.
- Confirm absence/presence of generic audit, period lock and immutable posting controls.

### Performance checks (read-only)

- Use `EXPLAIN (ANALYZE, BUFFERS)` only on a replica/staging clone or approved read-only session.
- Inspect order/report/usage date and foreign-key index coverage.
- Measure client-side pagination/aggregation volume without changing query semantics.

## 4. Open implementation questions

- Which bounded context owns the future posting orchestration: Supabase RPCs, Edge Functions, or a dedicated service layer?
- Can the linked Supabase environment support advisory locks/serializable transactions required by valuation and idempotency?
- What is the accepted reconciliation tolerance and rounding policy for quantity/value?
- Which legacy rows are legally/statutorily retained when a correction is posted?
- How will users review ambiguous supplier/product/order-line mappings?

## 5. Architecture risk list

| Risk | Severity | Mitigation boundary |
|---|---|---|
| New inventory ledger runs beside fabric ledger and double-counts stock | CRITICAL | One movement source; bridge/reconcile before cutover; one idempotency key |
| New revenue posting duplicates legacy delivery transaction | CRITICAL | Unique order/event key, source links and side-by-side reconciliation |
| Historical order cost is recalculated from current product cost | CRITICAL | Relational line snapshots, cost provenance and immutable postings |
| Expense, payment and purchase are collapsed into one money-out row | CRITICAL | Separate transaction effect lines and explicit source links |
| BOM/routing edits change old production cost | HIGH | Approved effective-dated versions copied at production release |
| Allocation overwrites direct cost | HIGH | Immutable cost entries and append-only allocation results |
| Closed period is edited through a legacy screen | HIGH | Posting service period guard; legacy warning/read-only migration stages |
| Frontend bypasses atomic multi-domain posting | HIGH | Server-controlled transaction/RPC/Edge Function boundary with RLS |
| AI classification posts an incorrect category | MEDIUM | Deterministic rules and human approval remain authoritative |
| Free-text supplier/product mappings are guessed during backfill | HIGH | Mapping queue, confidence/status and explicit review |
| Decimal rounding differs between browser and database | MEDIUM | PostgreSQL numeric, centralized rounding policy and calculation version |
| Manager scope is mistaken for cost-center ownership | MEDIUM | Separate organization/cost-center references and explicit mapping |

## 6. Final Phase 1A boundary

This phase creates architecture documentation only. It does not modify source code, create or run migrations, alter database schema, write production tables/data, change order calculations/pricing, implement UI/API, delete legacy models or commit code.
