# CURRENT SYSTEM AUDIT REPORT

> Phase 0 audit of the CRM Joliefam codebase for the future flow: **Chi phí → Kho → Sản xuất → Giá thành → Giá bán → Lợi nhuận**.
>
> Scope: read-only inspection of source, generated Supabase types, migrations, configuration and tests/files present in the repository. No source code, migration, database or production data was changed by this audit.

## 1. Executive Summary

The current system is a React/Vite CRM backed directly by Supabase PostgreSQL and Supabase Auth. It has usable customer, product, quote, order, payment, expense, raw-fabric inventory, shipping and invoice modules. Orders and quotes are denormalised: line items are JSONB rather than a relational order-item model. The raw-fabric module has a movement table and stored stock balance, but there is no supplier/purchase receipt domain, general finished-goods inventory, production order, BOM, routing, labour costing, asset, allocation or period-closing capability.

The current financial layer is not yet an accounting-grade costing engine. Product and order costs are manually captured or inferred from the current product cost; fabric reports contain application-level historical-price fallback. A database trigger calculates `profit_after` as `profit_before - 10% of cost_price`, not from actual expense records. The reports page has newer delivery-date/VAT-aware helpers, but legacy cash-flow/order screens still use different dates and totals. A Cost Management system can be built on this foundation only with a controlled refactor of order lines, inventory valuation, financial ledgers and audit governance.

## 2. Technology Stack

### Backend / data access

- Frontend application: React 18 + TypeScript, built and served by Vite (`package.json`, `vite.config.ts`, `src/App.tsx`).
- Database/API: Supabase JavaScript client (`src/integrations/supabase/client.ts`) talking to Supabase PostgreSQL. There is no separate Express/Nest/Laravel backend, ORM, repository layer or conventional controller/service layer.
- Authentication: Supabase Auth; role data is read from `public.user_roles` (`src/hooks/useUserRole.tsx:31-51`).
- Server-side extensions: Supabase Edge Functions under `supabase/functions` (GHN, e-invoice, user administration, AI/knowledge and import utilities).
- State/data fetching: TanStack React Query; realtime invalidation uses Supabase Postgres channels (`src/pages/ReportsPage.tsx:75-101`, `src/hooks/useTransactions.ts:26-42`).
- Forms/UI: React state, `react-hook-form` in complex forms, Radix/shadcn-style components and Tailwind.
- Charts/export: Recharts and client-side export code in the reports UI.
- Validation: UI/form validation is present in forms; no single shared domain validation layer was found. Database constraints are sparse and domain-specific.
- Transactions/jobs/cron/events: PostgreSQL triggers/RPCs are used for selected workflows (payments, fabric usage, manager assignment). No internal queue/job framework or application cron was found. Edge functions provide API endpoints, but no general domain event bus was found.

### Frontend

- Routing is declared in `src/App.tsx` with `react-router-dom`.
- Permission-aware navigation/page guards use `useUserRole` and `useEmployeePermissions` (`src/hooks/useEmployeePermissions.tsx:64-76`; reports guard in `src/pages/ReportsPage.tsx:75-83`).
- Tables/dialogs are shared UI components; reports use Recharts and TanStack Query.

### Database / infrastructure

- Engine: PostgreSQL through Supabase; project ref is configured in `supabase/config.toml`.
- Migrations are in `supabase/migrations`. Generated API types are in `src/integrations/supabase/types.ts`.
- UUID primary keys are the normal convention. Business tables commonly contain `tenant_id`, `manager_id`, `created_at`, `updated_at`; a standard `created_by`/`updated_by` convention is absent.
- No repository-wide `deleted_at` soft-delete convention was found; several foreign keys use `ON DELETE CASCADE`.

## 3. Current Data Model

### Core relationship

```text
customers (id)
    1 ─── * orders (customer_id FK)
                    ├── quote_id FK → quotes
                    ├── assignee_id FK → assignees
                    └── items JSONB (no order_items table/FK)
```

Evidence: `supabase/migrations/20250721150207-24371dec-7536-474f-a6d1-8f8eb8772f00.sql:11-18`, `supabase/migrations/20250812024113_ef1f6a77-a048-46a9-badd-ed289ab9368f.sql:1-6`, generated relationships in `src/integrations/supabase/types.ts`.

### Important entities

- Identity/access: `profiles`, `user_roles`, `employee_permissions`, `assignees`.
- CRM/sales: `customers`, `price_lists`, `products`, `quotes`, `orders`, `order_payments`.
- Money: `transactions`, `expenses`, `finance_data`, `payment_summary` view.
- Raw material: `fabric_types`, `fabric_widths`, `fabric_variants`, `warehouses`, `fabric_inventory`, `fabric_transactions`, `fabric_transfers`, `fabric_usage`.
- Logistics/compliance: `ghn_tracking`, `shipping_companies`, `einvoices`, `einvoice_actions`, `einvoice_settings`.
- Other: contracts, AI/knowledge and prediction tables.

### Required chain checks

```text
Customer → Order → OrderItem → Product/SKU
PARTIAL: customer/order/product references exist, but OrderItem is JSONB only and SKU is not a separate entity.

Supplier → Purchase → Inventory
NOT IMPLEMENTED: no supplier or purchase/receipt table; fabric inbound rows are not procurement documents.

Order → Production Order → Material Issue → Production → Finished Goods
NOT IMPLEMENTED.

Employee → Department → Production Operation
NOT IMPLEMENTED: users/roles/assignees exist, but no department or operation model.
```

## 4. Current Product Model

`products` contains `id`, `name`, `description`, `price`, `cost_price`, `sku`, `category`, `specifications`, `in_stock`, `price_list_id`, image fields, `manager_id`, `tenant_id` and timestamps. Evidence: product queries/forms in `src/pages/ProductManagement.tsx`, `src/components/CreateOrderForm.tsx:74-81`, and generated types in `src/integrations/supabase/types.ts`.

- `sku` is a text column on the product row. There is no `skus`, `product_variants` or parent-product table.
- `products_sku_price_list_unique` enforces uniqueness only for `(sku, price_list_id)` (`supabase/migrations/20250722083340-c756e970-ed57-4b63-8303-332ca50f478c.sql:1-4`).
- Size/material/colour/width are not normalised variant dimensions; `specifications` is free text. A product such as `Ga chun 160x200x20` is therefore currently represented as a sellable product row/SKU, not as one parent product with three child SKUs. The source does not provide a formal variant interpretation beyond that.
- Raw fabric variants are separate (`fabric_variants`) and represent material variants, not finished-product SKUs (`supabase/migrations/20250803091743_0e20db44-ab07-439b-ac00-e53ddd4c66ba.sql:12-28`).

## 5. Current Order Model

### Fields and lifecycle

Orders contain order identifiers, `customer_id`, `quote_id`, `assignee_id`, `items` JSONB, `total_amount`, `cost_price`, `profit_before`, `profit_after`, payment fields, delivery fields, status, manager/tenant and timestamps. The UI statuses are:

```text
pending → processing → shipped → delivered
                         └──────→ self_delivered
pending/processing/shipped → cancelled
delivered/self_delivered → returned (UI-supported)
```

Evidence: `src/pages/OrderManagement.tsx:74-109`, `src/components/EditOrderDialog.tsx:50-56`, generated order type in `src/integrations/supabase/types.ts`. There is no production status in the order lifecycle.

### Revenue recognition

- The current reports page recognises financial revenue only for `delivered` and `self_delivered`, using `delivered_date`, then `completed_at`, then an estimated `updated_at` fallback (`src/lib/financial-report.ts:82-97`; `src/pages/ReportsPage.tsx:439-446`).
- Revenue is intended to be before VAT in the new report helper: order/quote subtotal first, then item subtotal, then VAT adjustment or an estimated total fallback (`src/lib/financial-report.ts:99-145`).
- The order-management status path inserts an `income` row into `transactions` on delivery using `order.total_amount` and the current timestamp (`src/pages/OrderManagement.tsx:288-321`). `EditOrderDialog` has a second delivery-to-transaction path (`src/components/EditOrderDialog.tsx:104-124`). This path does not visibly exclude VAT, does not use `delivered_date`, and has no visible idempotency key/unique constraint.
- Legacy cash-flow order queries filter by `created_at`, not delivery recognition date (`src/pages/CashFlowManagement.tsx:248-279`). Therefore reporting semantics are currently inconsistent across screens.

### Order commercial data

Quantity/unit price/line total/cost snapshot are kept inside JSON items; order total and cost are also copied to scalar columns. VAT fields were added as nullable snapshots (`supabase/migrations/20260823093000_add_financial_snapshots_to_orders.sql:1-14`). Discounts, shipping and sales-person concepts appear in some UI/domain fields, but a single authoritative calculation contract was not found. Mark cross-screen consistency as `UNKNOWN`.

## 6. Current Inventory Model

The implemented stock domain is raw fabric only:

```text
fabric_types → fabric_variants
                     ├── fabric_inventory (warehouse balance)
                     ├── fabric_transactions (movement ledger)
                     ├── fabric_transfers
                     └── fabric_usage
warehouses ───────────────┘
```

Evidence: `supabase/migrations/20250803091743_0e20db44-ab07-439b-ac00-e53ddd4c66ba.sql:1-96`, generated types and `src/hooks/useFabrics.ts`.

- Units were originally defaulted to `kg` (`...091743...sql:21`); later application/migration work uses metres (`m`). Unit consistency across historical rows/deployments is therefore a migration-state concern. The pending local migration `20260823100000_fabric_usage_order_group_and_batch.sql` was not applied during this audit.
- `fabric_inventory.current_stock` is stored directly (`...091743...sql:43-58`). `fabric_transactions` is a movement ledger with `inbound`, `outbound`, `transfer_in`, `transfer_out`, and `adjustment` values in the application/schema comments (`...091743...sql:60-78`).
- Usage triggers decrement stock on insert, reverse/reapply on update, and add back on delete (`supabase/migrations/20250803161500_fc44604f-9e56-4b89-bb94-b13b08b9889b.sql:1-98`). If no balance row exists, insert usage creates a negative balance.
- This is not a general warehouse model for finished products and does not include purchase receipts, customer returns or a general stock ledger.
- There is no supplier-linked purchase document. Fabric inbound permits free-text `supplier_name`, which is not a supplier entity or payable.

## 7. Current Cost / Price Logic

### Price locations and entry

- Finished-product selling price: `products.price`.
- Finished-product cost: `products.cost_price`.
- Fabric cost/selling price: `fabric_variants.cost_price` and `fabric_variants.selling_price`.
- Order cost snapshot: `orders.cost_price`; newer provenance flags are `cost_price_source` and `cost_price_is_estimated`.
- Create-order form copies current product price/cost into JSON order items and computes totals in browser (`src/components/CreateOrderForm.tsx:94-150`, `193-208`). This indicates manual/current-catalog input, not an inventory valuation engine.

### Profit formula

The authoritative database trigger is explicit:

```sql
profit_before = total_amount - cost_price
profit_after  = profit_before - (cost_price * 0.1)
```

Evidence: `supabase/migrations/20250721150207-24371dec-7536-474f-a6d1-8f8eb8772f00.sql:100-118` and the later replacement `supabase/migrations/20250823163815_0ff533e7-9f64-429f-b100-620b6f3f2b29.sql:57-73`.

This `profit_after` is a hard-coded 10% proxy of cost, not actual expense allocation. The reports page calculates period gross/net profit as recognised revenue minus estimated/captured order cost minus rows from `expenses` (`src/pages/ReportsPage.tsx:685-704`). These are different models.

### History/override answers

1. Selling price is on `products.price` and in order-item JSON snapshots.
2. No general product price history/version table was found. `price_lists` groups products but is not a price-version ledger.
3. Cost is on `products.cost_price`, `fabric_variants.cost_price`, order scalar/item snapshots and fabric inbound unit prices.
4. The UI allows users with access to product/order forms to enter or edit prices; exact role restriction for every edit path is `UNKNOWN`. A cost-price RPC is restricted to admin/manager/accountant (`supabase/migrations/20260809092018_20a35a0c-a8f0-4421-ba8b-8b431d6974f0.sql:1-18`).
5. Product/order cost is entered/copied, not calculated by FIFO, weighted average or standard-cost engine. Fabric report fallback uses historical inbound price or current cost as an estimate in `src/components/FabricReports.tsx`.
6. Changing the current product price/cost does not rewrite an order's JSON snapshot, but legacy orders without snapshots can be recalculated from current product values (`src/lib/financial-report.ts:148-185`). Historical protection is therefore incomplete.
7. Profit formula is the trigger formula above; report net profit is a separate revenue-cost-expense formula.
8. No authoritative margin/markup engine or versioned margin policy was found. `UNKNOWN` where only presentation calculations exist.
9. Discounts and shipping may be represented in quote/order JSON/UI, but a single persisted, audited discount contract was not found. `UNKNOWN`.
10. Sale price override is possible in the order form by editing item price (`src/components/CreateOrderForm.tsx:134-147`), without a separate approval/audit record.

### Inventory costing

No FIFO, weighted-average, moving-average or standard-cost implementation was found. **INVENTORY COSTING NOT IMPLEMENTED** as a general engine.

## 8. Current Production Model

Search across `src` and `supabase/migrations` found no production/manufacturing/work-order tables or UI for production orders, cutting, sewing, ironing, packing, QC, production status, QR work tracking or finished-goods receipt.

```text
Order → Production Order → Material Issue → Production → Finished Goods
NOT IMPLEMENTED
```

## 9. Current HR / Worker Model

Implemented identity/access entities are `auth.users`, `profiles`, `user_roles`, `employee_permissions` and sales `assignees`. Evidence: `supabase/migrations/20250720033126-13571523-8195-4ef0-bd61-b421744022c0.sql:5-29`, `supabase/migrations/20250725025413-3d077010-5396-4bf4-899c-048198dd59a1.sql:1-23`.

No department, worker master, salary/wage, piece-rate, attendance, working-time or production-quantity tracking was found. Therefore:

```text
Worker → Production Operation → Production Order
NOT IMPLEMENTED
```

`assignees` are sales assignments and should not be treated as production workers without explicit domain review.

## 10. Current Payment / Expense Model

There are four overlapping money representations:

| Model | Current purpose | Evidence |
|---|---|---|
| `expenses` | Expense code/category/description/amount/date | `supabase/migrations/20250721150207-24371dec-7536-474f-a6d1-8f8eb8772f00.sql:20-32` |
| `transactions` | Generic income/expense-like cash records; can link `order_id` | `supabase/migrations/20250721151210-0e966fc2-b310-42c8-aabf-03245375990b.sql:1-7`, `src/hooks/useTransactions.ts:5-20` |
| `order_payments` | Order-linked deposits/installments/final/full payments | `supabase/migrations/20250721151210-0e966fc2-b310-42c8-aabf-03245375990b.sql:9-23` |
| `finance_data` | Generic finance records used by legacy screens | generated types and `src/pages/CashFlowManagement.tsx` |

`Money Out = Expense` is not a safe invariant in the current code. An expense row is not necessarily a payment, and supplier debt, debt settlement, advance/deposit, loan, loan repayment, asset purchase and transfer are not distinct accounting document types. These models need reconciliation before Cost Management is added.

Payment status is maintained by a trigger summing `order_payments` against `orders.total_amount` (`...20250721151210...sql:75-117`). The trigger is declared for DELETE but reads `NEW.order_id`; PostgreSQL DELETE triggers expose `OLD`, so delete behaviour is a **HIGH** integrity risk requiring verification before relying on it.

Duplicate income risk: both `OrderManagement` and `EditOrderDialog` insert a transaction when setting delivery (`src/pages/OrderManagement.tsx:307-321`, `src/components/EditOrderDialog.tsx:113-124`), with no visible unique business key. Repeating the transition or using both paths can duplicate revenue cash rows.

## 11. Existing Permissions

- Roles: `admin`, `manager`, `accountant`, `employee` (`src/hooks/useUserRole.tsx:5-6`).
- Employees/accountants use `employee_permissions`; admins/managers are treated as having all permissions in the hook (`src/hooks/useEmployeePermissions.tsx:64-76`).
- RLS exists on major CRM, finance and fabric tables. Typical scope is role plus `manager_id` equal to the current user or an assigned manager (`supabase/migrations/20250803091743_0e20db44-ab07-439b-ac00-e53ddd4c66ba.sql:98-134`; payment policies in `supabase/migrations/20250721151210-0e966fc2-b310-42c8-aabf-03245375990b.sql:25-67`).
- Server-side RLS is the real data boundary because the frontend writes directly with Supabase. The report page has a client-side permission redirect, which is not a substitute for RLS.
- Cost-price read RPC is explicitly limited to admin/manager/accountant (`supabase/migrations/20260809092018_20a35a0c-a8f0-4421-ba8b-8b431d6974f0.sql:11-18`). Whether every update UI path prevents sales users from changing cost is **UNKNOWN**.
- Fabric transaction/transfer policies grant employees management access within their manager scope (`...091743...sql:126-134`), so editing/deleting historical movement must be treated as a governance risk until tested.

## 12. Existing Audit Capability

Generic before/after audit logging for orders, prices, inventory or payments was not found. Existing evidence is limited to:

- `created_at`/`updated_at` timestamps and update triggers.
- `password_reset_logs` for password operations.
- `einvoice_actions` for e-invoice actions.
- A few `created_by`/`updated_by` fields in newer specialized modules, not a common standard.

There is no standard actor, before image, after image or reason-for-change record. **Generic audit log: NOT IMPLEMENTED.**

## 13. Reuse Matrix

| Domain | Status | Reason |
|---|---|---|
| Product | EXTEND | Existing catalog and price/cost fields are usable, but need costing-safe snapshots. |
| SKU | REFACTOR | Text SKU on product is not a normalized variant model. |
| Customer | REUSE / EXTEND | Customer master and order FK exist; ownership/history need governance. |
| Order | EXTEND | Lifecycle and customer link exist; financial/order-line model is insufficient. |
| Order Item | REFACTOR | JSONB only; no FK, constraints or stable snapshot contract. |
| Employee | EXTEND | Auth/profile/roles exist; no workforce/production attributes. |
| Department | NEW | No department entity. |
| Supplier | NEW | No supplier master. |
| Warehouse | EXTEND | Fabric warehouses exist; general warehouse/location semantics are incomplete. |
| Inventory | REFACTOR | Fabric-only stored balance plus triggers; no general ledger/valuation. |
| Inventory Movement | EXTEND / REFACTOR | Fabric movement types are reusable but need immutable, typed, reconciled documents. |
| Purchase | NEW | No purchase order/receipt/payable chain. |
| Payment | REFACTOR | `order_payments`, `transactions` and `finance_data` overlap. |
| Expense | EXTEND | Basic expense table exists; classification and posting controls are missing. |
| Production Order | NEW | Not implemented. |
| BOM | NEW | Not implemented. |
| Routing | NEW | Not implemented. |
| Asset | NEW | **ASSET MANAGEMENT NOT IMPLEMENTED.** |
| Cost Center | NEW | No cost-center abstraction found. |
| Cost Object | NEW | No cost-object abstraction found. |
| Cost Rule | NEW | No allocation/cost rule model. |
| Allocation | NEW | No expense allocation engine. |
| Costing | NEW | No inventory/production costing engine. |
| Pricing | EXTEND / REFACTOR | Catalog price and ad-hoc order override exist; history/approval missing. |
| Profitability | REFACTOR | Trigger proxy and report calculation are inconsistent. |
| Audit Log | NEW | No generic before/after log. |
| Period Closing | NEW | **PERIOD CLOSING NOT IMPLEMENTED.** |

## 14. Critical Risks

Severity is based on potential impact to financial correctness, stock integrity and historical reproducibility.

### CRITICAL

1. **No authoritative costing chain.** There is no purchase → inventory valuation → material issue → production → finished-goods cost flow; production/BOM/routing are absent.
2. **Profit-after is not actual net profit.** The database trigger subtracts a hard-coded 10% of order cost (`supabase/migrations/20250721150207...sql:100-118`).
3. **Order lines are JSONB.** Quantities, prices, costs and product identity cannot be enforced with relational FKs/constraints (`src/integrations/supabase/types.ts`; order creation in `src/components/CreateOrderForm.tsx:193-208`).
4. **Revenue duplication/inconsistent recognition.** Multiple delivery handlers insert income transactions; no idempotency; one path uses total including possible VAT and current timestamp.
5. **Overlapping financial models.** `expenses`, `transactions`, `finance_data` and `order_payments` can represent the same economic event differently.

### HIGH

6. Stored stock plus trigger-driven movement can drift if legacy/direct paths bypass the intended RPC/transaction boundary (`supabase/migrations/20250803161500...sql:1-98`; `src/hooks/useFabrics.ts`).
7. No immutable history for product price, product cost, fabric cost or order financial recalculation.
8. Payment DELETE trigger references `NEW` in a DELETE-capable trigger (`supabase/migrations/20250721151210...sql:75-117`).
9. No period close/lock means historical orders, movement and expenses can be edited after reporting.
10. RLS/policy history contains duplicate/replacement migrations; some policy scopes and price-list visibility require deployment-level verification.

### MEDIUM

11. Product variants are free-text specifications; no normalized dimensions.
12. Supplier and purchase data are free-text (`supplier_name`) rather than linked master data.
13. Fabric unit history (`kg` default vs `m` usage) can produce mixed-unit balances.
14. Financial and manager scope fields are frequently nullable/text rather than typed FK/checked domains.
15. Hard-delete/cascade patterns can remove historical evidence.

### LOW

16. Repeated client-side pagination and browser aggregation increase latency as data grows.
17. Console/debug logging remains in data hooks and financial screens.

## 15. Data Duplication Risks

- `orders.items` vs a future `order_items` table: **DO NOT CREATE DUPLICATE MODEL** without a migration/compatibility plan.
- `products.sku` vs any future SKU/variant table: preserve a canonical identity mapping.
- `transactions` vs `order_payments`: payment-to-cash posting must have one authoritative relationship.
- `expenses` vs `finance_data`/generic `transactions`: do not equate every money-out row to an expense.
- `fabric_inventory.current_stock` vs `fabric_transactions`: choose a controlled ledger/reconciliation boundary before adding another inventory table.
- `profiles`/`user_roles` vs `assignees`: sales assignee is not automatically an employee/worker master.
- Fabric inbound `supplier_name` vs a future supplier master: backfill/link rather than maintaining parallel names.

## 16. Missing Capabilities

Compared with the requested Cost Management system, the following are missing or incomplete:

- Supplier master, purchase order, receipt, supplier invoice and payable lifecycle.
- General inventory for products, locations, lots/batches, reservations, returns and immutable movement ledger.
- FIFO/weighted-average/standard-cost valuation and historical cost layers.
- Product/SKU/variant hierarchy and versioned BOM/recipe/material requirement.
- Production order, operation/routing, material issue, output, scrap, QC and finished-goods receipt.
- Worker/department/time/piece-rate labour costs.
- Machine/asset register and depreciation.
- Cost center/object/rule/allocation and period-based closing.
- Unified payment/expense/loan/advance/debt/asset transaction classification.
- General audit log with actor, before/after and reason.
- Consistent VAT-excluded revenue recognition and idempotent posting.

## 17. Recommended Integration Boundaries

These are audit boundaries only, not a final architecture:

1. Keep `customers`, `products` and existing order identifiers as CRM ownership boundaries.
2. Treat the existing order as a compatibility shell while introducing a controlled, relational order-line boundary; do not silently duplicate JSON line data.
3. Isolate raw fabric tables from any future general inventory valuation boundary; reconcile `current_stock` to movements before extending.
4. Put delivery revenue recognition and payment posting behind one idempotent financial posting boundary, independent of UI screens.
5. Link future production/material events to stable order/product identities and preserve cost snapshots at event time.
6. Keep role/RLS enforcement in the database and expose cost-sensitive operations through controlled server-side functions where direct client writes are unsafe.

## 18. Questions / Unknowns

The source alone cannot prove:

- Which migrations are actually applied to the linked Supabase project. The local project is not linked for migration inspection; no production query was run.
- Whether legacy base tables (customers/products/orders/quotes/transactions/finance_data) were created outside the visible migration set or pre-existed the migration history.
- Exact VAT/discount/shipping semantics for every historical order and quote.
- Whether all deployed order-status paths are the same as the current source and whether duplicate income rows already exist.
- Whether product cost edit controls are hidden from every sales role in production.
- Whether historical fabric rows mix `kg` and `m` and whether any stock reconciliation has been performed.
- Actual row counts, null rates, negative quantities/balances, orphan JSON product IDs and duplicate business numbers (not queried to avoid production data access).
- Effective RLS after all replacement/duplicate migrations are applied.
- Whether any external accounting, payroll or procurement process exists outside this repository.

## 19. Files Inspected

Representative evidence files (plus generated types and the complete migration filename inventory):

- `package.json`, `vite.config.ts`, `tsconfig.json`, `supabase/config.toml`
- `src/App.tsx`, `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`
- `src/pages/ProductManagement.tsx`, `src/pages/OrderManagement.tsx`, `src/pages/ReportsPage.tsx`, `src/pages/CashFlowManagement.tsx`, `src/pages/TransactionManagement.tsx`
- `src/components/CreateOrderForm.tsx`, `src/components/EditOrderDialog.tsx`, `src/components/CreateExpenseForm.tsx`, `src/components/CreateFinanceRecordForm.tsx`, `src/components/FabricReports.tsx`
- `src/hooks/useOrders.ts`, `src/hooks/useOrdersStats.ts`, `src/hooks/useTransactions.ts`, `src/hooks/useFabrics.ts`, `src/hooks/useUserRole.tsx`, `src/hooks/useEmployeePermissions.tsx`
- `src/lib/financial-report.ts`, `src/lib/dashboard-stats.ts`
- `supabase/migrations/20250720033126-13571523-8195-4ef0-bd61-b421744022c0.sql`
- `supabase/migrations/20250721150207-24371dec-7536-474f-a6d1-8f8eb8772f00.sql`
- `supabase/migrations/20250721151210-0e966fc2-b310-42c8-aabf-03245375990b.sql`
- `supabase/migrations/20250722083340-c756e970-ed57-4b63-8303-332ca50f478c.sql`
- `supabase/migrations/20250803091743_0e20db44-ab07-439b-ac00-e53ddd4c66ba.sql`
- `supabase/migrations/20250803161500_fc44604f-9e56-4b89-bb94-b13b08b9889b.sql`
- `supabase/migrations/20250809024911_1634d113-8a2c-4d0f-a02a-92e9ac92b2f3.sql`
- `supabase/migrations/20250823163815_0ff533e7-9f64-429f-b100-620b6f3f2b29.sql`
- `supabase/migrations/20260809092018_20a35a0c-a8f0-4421-ba8b-8b431d6974f0.sql`
- `supabase/migrations/20260823093000_add_financial_snapshots_to_orders.sql`
- `supabase/functions/*` (function inventory and contracts; no production/procurement function found)

## 20. Final Assessment

### Can Cost Management be built on the current architecture?

**YES WITH REFACTOR.**

Supabase/PostgreSQL, Auth/RLS, customers, products, orders, payments and the raw-fabric movement foundation are viable integration points. However, the current denormalised order model, overlapping financial models, trigger-based proxy profit, absent production/BOM/valuation domains, absent audit history and absent period closing make a direct additive implementation unsafe. Phase 1 should first establish reviewed boundaries and data-quality baselines; no final schema or architecture is selected by this Phase 0 report.

## Audit restrictions observed

The audit did **not**:

- implement Cost Center, CostCategory, CostObject, allocation or costing engines;
- create/alter/drop tables, indexes, constraints or migrations;
- run migrations or query production business data;
- modify inventory, product pricing, order calculations or production data;
- refactor, delete or commit source code.

