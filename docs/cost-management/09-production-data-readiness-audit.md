# PHASE 1B - PRODUCTION DATA READINESS AUDIT

> Read-only production-data readiness audit for the CRM Joliefam Cost Management migration.
>
> **Important limitation:** the repository identifies Supabase project `kmxfljxsmnozvvgypdei`, but the available REST key returned `401 Unauthorized` and the Supabase CLI reported that the project is not linked and no platform access token is available. Consequently, no production table data, catalog metadata, migration history or RLS state could be read. This report never substitutes repository assumptions for production facts.

## 1. Executive Summary

Production readiness cannot be approved from this environment. The target project identity is known from `supabase/config.toml` and `.env`, but the database connection could not authenticate a read-only request. Therefore the following required evidence is not available: applied migration versions, live schema/index/trigger/policy state, row counts, JSON data quality, order/payment/financial reconciliation, fabric balances, unit consistency, duplicates, or actual backfill volumes.

Static repository evidence still confirms material migration risks from Phase 0:

- `orders.items` is JSONB and lacks relational line constraints.
- Revenue has multiple delivery-to-transaction paths and no visible idempotency key.
- `expenses`, `transactions`, `finance_data` and `order_payments` overlap.
- `fabric_inventory.current_stock` is stored while fabric usage triggers mutate it.
- Fabric history has an original `kg` default and later `m` assumptions.
- The pending local fabric migration is not confirmed deployed.

These are design/readiness risks, not claims about actual production row counts. The final verdict is **NOT READY** until a controlled read-only database session is provided and the checks in this report are completed.

## 2. Database / Deployment Identity

| Item | Result | Evidence / limitation |
|---|---|---|
| Supabase project reference | `kmxfljxsmnozvvgypdei` | `supabase/config.toml:1`, `.env` project ID |
| Supabase URL host | `kmxfljxsmnozvvgypdei.supabase.co` | `.env` URL; value not reproduced with credentials |
| Database engine | Expected Supabase PostgreSQL | Phase 0 config/types; live server not queried |
| PostgreSQL version | UNKNOWN | No authenticated catalog connection |
| Schema | Expected `public`; UNKNOWN in production | Source uses `public`; metadata unavailable |
| Environment (production/staging) | UNKNOWN | Project ref is known, deployment label not exposed |
| Database timezone | UNKNOWN | `SHOW timezone` was not possible |
| Audit timestamp | `2026-08-23T23:27:20+07:00` | Local audit execution time |
| Credentials exposed | No | Keys were not written to this report or output |

The REST endpoint returned HTTP 401 for `/rest/v1/` and table reads. `npx supabase migration list --linked` returned `LegacyProjectNotLinkedError`; `npx supabase projects list` required a Supabase platform access token. No service-role key, user login, RPC, Edge Function or mutation path was attempted.

## 3. Migration Drift

### 3.1 Repository inventory

The repository contains **150** migration files. The current local migration inventory includes late financial/fabric files such as:

| Migration | Repo | Production | Status |
|---|---:|---:|---|
| `20250721150207-24371dec-7536-474f-a6d1-8f8eb8772f00.sql` (orders fields, expenses, legacy profit trigger) | YES | UNKNOWN | UNKNOWN |
| `20250721151210-0e966fc2-b310-42c8-aabf-03245375990b.sql` (order payments, payment trigger/view) | YES | UNKNOWN | UNKNOWN |
| `20250722083340-c756e970-ed57-4b63-8303-332ca50f478c.sql` (product SKU/price-list unique constraint) | YES | UNKNOWN | UNKNOWN |
| `20250803091743_0e20db44-ab07-439b-ac00-e53ddd4c66ba.sql` (fabric core tables/RLS/triggers) | YES | UNKNOWN | UNKNOWN |
| `20250803161500_fc44604f-9e56-4b89-bb94-b13b08b9889b.sql` (fabric usage stock triggers) | YES | UNKNOWN | UNKNOWN |
| `20250809092018_20a35a0c-a8f0-4421-ba8b-8b431d6974f0.sql` (cost-price read RPC) | YES | UNKNOWN | UNKNOWN |
| `20250823163815_0ff533e7-9f64-429f-b100-620b6f3f2b29.sql` (later trigger/function replacements) | YES | UNKNOWN | UNKNOWN |
| `20260809092018_20a35a0c-a8f0-4421-ba8b-8b431d6974f0.sql` (cost-price read RPC in current repo) | YES | UNKNOWN | UNKNOWN |
| `20260823093000_add_financial_snapshots_to_orders.sql` (VAT/cost provenance snapshots) | YES | UNKNOWN | UNKNOWN |
| `20260823100000_fabric_usage_order_group_and_batch.sql` (local pending fabric batch/unit changes) | YES | UNKNOWN | UNKNOWN |

`UNKNOWN` is intentional. A repository migration filename is not proof that it has been applied to the linked database. No missing migration was run.

### 3.2 Required migration comparison

To complete this section, an authenticated read-only connection must compare the deployment's migration history/catalog against all 150 repository filenames and classify:

- repository YES / database YES = `OK`;
- repository YES / database NO = `PENDING`;
- repository NO / database YES = `UNKNOWN/LEGACY`;
- conflicting duplicate versions = `DRIFT/REVIEW`.

## 4. Production Schema Drift

### 4.1 Schema status

| Table/domain | Repository expectation | Production | Status |
|---|---|---|---|
| `customers`, `products`, `orders`, `quotes` | CRM core tables and relationships | UNKNOWN | UNKNOWN |
| `order_payments`, `expenses`, `transactions`, `finance_data` | Overlapping financial/payment tables | UNKNOWN | UNKNOWN |
| `fabric_types`, `fabric_widths`, `fabric_variants` | Fabric/material master | UNKNOWN | UNKNOWN |
| `warehouses`, `fabric_inventory` | Fabric stock projection by warehouse | UNKNOWN | UNKNOWN |
| `fabric_transactions`, `fabric_transfers`, `fabric_usage` | Fabric movements/usage/transfers | UNKNOWN | UNKNOWN |
| `profiles`, `user_roles`, `employee_permissions`, `assignees` | Auth/role/sales assignment | UNKNOWN | UNKNOWN |

The generated types in `src/integrations/supabase/types.ts` represent the repository's generated contract, not proof of deployed schema. Live columns, types, nullability, defaults, PK/FK/unique/check constraints, indexes, triggers, RLS and policies were not accessible.

### 4.2 Static repository expectations requiring live verification

- Orders have delivery/payment/profit fields and JSON `items` (`20250721150207...sql`, generated types).
- `order_payments.order_id` references orders and a trigger updates payment status (`20250721151210...sql:9-117`).
- Fabric inventory has unique `(fabric_variant_id, warehouse_id)` and stored `current_stock` (`20250803091743...sql:43-58`).
- Fabric usage triggers mutate inventory on insert/update/delete (`20250803161500...sql:1-98`).
- RLS is enabled for fabric tables in the repository migration (`20250803091743...sql:98-134`), but effective policy state remains UNKNOWN.

## 5. Row Count Summary

No authenticated `SELECT count(*)` was completed. No production rows were dumped.

| Table | Count | Status |
|---|---:|---|
| `customers` | UNKNOWN | Not measured; REST 401 |
| `products` | UNKNOWN | Not measured; REST 401 |
| `orders` | UNKNOWN | Not measured; REST 401 |
| `quotes` | UNKNOWN | Not measured; REST 401 |
| `order_payments` | UNKNOWN | Not measured; REST 401 |
| `expenses` | UNKNOWN | Not measured; REST 401 |
| `transactions` | UNKNOWN | Not measured; REST 401 |
| `finance_data` | UNKNOWN | Not measured; REST 401 |
| `fabric_variants` | UNKNOWN | Not measured; REST 401 |
| `fabric_inventory` | UNKNOWN | Not measured; REST 401 |
| `fabric_transactions` | UNKNOWN | Not measured; REST 401 |
| `fabric_usage` | UNKNOWN | Not measured; REST 401 |

Scale, migration duration and batch sizing cannot be estimated from source alone.

## 6. Product / SKU Quality

### Production findings

All production findings are `UNKNOWN/NOT MEASURED` because product rows could not be read:

- duplicate IDs: database PK is expected, live constraint UNKNOWN;
- NULL/empty SKU: UNKNOWN;
- duplicate SKU globally or within price list: UNKNOWN;
- suspicious same-name/specification duplicates: UNKNOWN;
- `price` NULL/zero/negative: UNKNOWN;
- `cost_price` NULL/zero/negative: UNKNOWN;
- selling price below cost: UNKNOWN (not automatically an error).

### Static risk

The repository models `sku` as text on `products`, with a `(sku, price_list_id)` unique constraint in one migration. It has no normalized Product Family/SKU/variant model. Future backfill must not infer dimensions from free-text `specifications` without review.

## 7. Order JSON Quality

No production JSON was read, so the following are not measured:

- NULL/empty/malformed `orders.items`;
- unexpected JSON root types;
- product ID/SKU orphan references;
- missing product name, SKU, quantity, price, cost or total;
- historical JSON schema variants;
- item subtotal versus scalar order totals.

### Static interpretation

`src/components/CreateOrderForm.tsx:193-208` serializes order items into `orders.items`. `src/lib/financial-report.ts:66-74` accepts multiple item shapes and falls back among `total`, `quantity * price`, and current product cost. This makes a production JSON inventory mandatory before relational `order_items` backfill. No automatic parser/backfill was run.

## 8. Order Financial Reconciliation

### Production reconciliation status

| Check | Result |
|---|---|
| Sum item totals vs `orders.total_amount` | UNKNOWN / NOT MEASURED |
| VAT/discount/shipping explainable differences | UNKNOWN |
| Item cost sum vs `orders.cost_price` | UNKNOWN / NOT MEASURED |
| Missing item cost | UNKNOWN |
| Missing order cost | UNKNOWN |
| Legacy `profit_before` formula match | UNKNOWN |
| Legacy `profit_after` formula match | UNKNOWN |
| Historical formula variants | UNKNOWN |

### Static formula evidence

The repository trigger calculates:

```text
profit_before = total_amount - cost_price
profit_after = profit_before - cost_price * 0.1
```

Evidence: `supabase/migrations/20250721150207-24371dec-7536-474f-a6d1-8f8eb8772f00.sql:100-118` and later function replacement `20250823163815_0ff533e7-9f64-429f-b100-620b6f3f2b29.sql:57-73`. This is a legacy proxy, not an authoritative net-profit calculation.

## 9. Revenue Recognition / Duplicate Analysis

### Production findings

The required counts are unavailable:

| Metric | Result |
|---|---:|
| orders with 0 linked income-equivalent transactions | UNKNOWN |
| orders with 1 linked income-equivalent transaction | UNKNOWN |
| orders with >1 linked income-equivalent transactions | UNKNOWN |
| duplicate revenue candidate count | UNKNOWN |
| affected order count | UNKNOWN |
| affected total amount | UNKNOWN |

### Static risk evidence

`src/pages/OrderManagement.tsx:307-321` and `src/components/EditOrderDialog.tsx:113-124` each insert an income transaction when an order becomes delivered. There is no visible idempotency/business key. One path uses `order.total_amount` and current timestamp, rather than a guaranteed VAT-excluded delivery-date snapshot. Production duplication must be quantified before migration.

### Revenue date audit

Production proportions using `delivered_date`, current transaction time, `created_at` or unknown are all **UNKNOWN**. The report helper prefers delivery date with fallbacks (`src/lib/financial-report.ts:82-97`), while legacy cash-flow reads orders by `created_at` (`src/pages/CashFlowManagement.tsx:248-279`). This semantic drift is a migration blocker until measured.

## 10. Payment Quality

No production `order_payments` rows could be read. The following are UNKNOWN:

- payment amount `<= 0`;
- NULL/orphan `order_id`;
- payment sum greater than order total;
- fully paid/partial/unpaid distribution;
- payment date anomalies;
- order payment status mismatches.

### Static trigger review

`20250721151210-0e966fc2-b310-42c8-aabf-03245375990b.sql:75-117` declares the payment-status trigger for INSERT/UPDATE/DELETE but the function reads `NEW.order_id`. A PostgreSQL DELETE trigger normally provides `OLD`, not `NEW`. The deployed definition and actual behavior are UNKNOWN; no trigger was activated or tested against production.

## 11. Expense / Financial Overlap

### Production overlap

No rows were readable, so duplicate classification counts are UNKNOWN:

| Classification | Count |
|---|---:|
| HIGH CONFIDENCE DUPLICATE | UNKNOWN |
| POSSIBLE DUPLICATE | UNKNOWN |
| UNIQUE | UNKNOWN |
| UNKNOWN | UNKNOWN |

### Static overlap model

The repository contains `expenses`, generic `transactions`, `finance_data` and `order_payments`. Matching by amount/date/description/order ID would be heuristic and was not executed. No automatic merge is safe. Inventory purchase, asset purchase, expense, supplier payment, customer receipt, advance and loan events must remain distinct in the future transaction model.

## 12. Fabric Inventory Integrity

No production fabric rows were readable. The following are UNKNOWN:

- current stock by variant/warehouse;
- ledger-derived balance;
- `MATCH`/`MISMATCH`/`CANNOT RECONCILE` counts;
- opening balance coverage;
- transfer/usage/adjustment semantic completeness;
- negative running balances;
- affected variant/warehouse counts and most-negative value.

### Static reconciliation risks

`fabric_inventory.current_stock` is a stored projection. Fabric usage triggers decrement/reverse it, and legacy/frontend paths may write usage or transactions directly. Opening balances and pre-ledger movements cannot be inferred safely from source. No balance was updated and no reconciliation query was run.

## 13. Fabric Unit Integrity

Production unit distribution is UNKNOWN/NOT MEASURED for:

| Source | METER | KG | OTHER | NULL | Status |
|---|---:|---:|---:|---:|---|
| `fabric_variants.unit` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | no read access |
| inventory-related fields | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | no read access |
| `fabric_transactions` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | no read access |
| `fabric_usage` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | no read access |

Static evidence shows the original fabric variant default was `kg` (`20250803091743...sql:21`), while later application/pending migration logic assumes `m`. The local `20260823100000_fabric_usage_order_group_and_batch.sql` was not run and its deployment state is UNKNOWN. **Do not convert kg to m without a domain conversion rule and source evidence.**

## 14. Fabric Valuation Readiness

Production classification is UNKNOWN:

| Dataset/period | Classification |
|---|---|
| Fabric inbound movements with quantity, unit price, date, variant and warehouse | UNKNOWN |
| Fabric usage/outbound movements with traceable source and unit | UNKNOWN |
| Opening stock with opening valuation | UNKNOWN |
| Historical price sequence sufficient for moving weighted average | UNKNOWN |

Static schema contains `quantity`, `unit_price`, `transaction_date`, variant and warehouse on fabric transactions (`20250803091743...sql:60-78`), but nullable/complete production values were not inspected. No weighted-average backfill was attempted.

## 15. Supplier Data Quality

Supplier production quality is UNKNOWN. The legacy schema has free-text `supplier_name` on fabric transactions, not a supplier master. Distinct counts, NULL/blank rates, normalized duplicate candidates and spelling variants could not be measured. Any future candidate classification must be:

- automatic only for exact, unambiguous approved matches;
- rule-based for normalized legal/tax identifiers;
- manual review for spelling variants or multiple possible suppliers;
- preserved as original free text when no reliable match exists.

No supplier was merged or created.

## 16. Permission / RLS State

### Deployed state

RLS and policy state is **UNKNOWN** because `pg_catalog`/information-schema and Supabase metadata requests were unauthorized. The repository expects role/RLS policies for finance and fabric tables, but repository SQL is not proof of deployed state.

### Static expectations and risks

- Roles include admin, manager, accountant and employee (`src/hooks/useUserRole.tsx:5-6`).
- Employee/accountant module permissions are fetched from `employee_permissions` (`src/hooks/useEmployeePermissions.tsx:29-76`).
- Fabric transactions/transfers policies in the repository grant manager-scoped employee management (`20250803091743...sql:126-134`).
- Product cost read RPC is intended for admin/manager/accountant (`20260809092018...sql:1-18`).

The audit cannot confirm whether a sales user can update cost, whether posted movements can be edited/deleted, or whether policy replacement migrations caused drift.

## 17. Historical Mutability Risks

Production delete/update behavior is UNKNOWN; static repository risks are:

| Area | Static risk | Live status |
|---|---|---|
| `orders` | UI updates status/financially relevant fields; no generic immutable posting layer | UNKNOWN |
| `products` | Current price/cost can change; no general price history | UNKNOWN |
| `expenses` | RLS policies permit admin update/delete in original migration | UNKNOWN |
| `transactions` | Generic rows can be inserted/deleted; no visible idempotency | UNKNOWN |
| `order_payments` | Admin/manager update/delete policies and DELETE trigger concern | UNKNOWN |
| `fabric_transactions` | Employee/manager `FOR ALL` policy in repository | UNKNOWN |
| `fabric_usage` | Usage triggers reverse stock on update/delete; no immutable event layer | UNKNOWN |

Foreign keys with `ON DELETE CASCADE` are present in repository migrations. Whether those constraints are live is UNKNOWN; historical retention must be checked before any migration.

## 18. Money / Date Precision Risks

### Production column precision

All live money/quantity column types are UNKNOWN because production catalog inspection was unavailable. Repository-generated types do not encode PostgreSQL precision/scale.

Static source/migrations use `NUMERIC` for many financial fields (`expenses.amount`, `orders.cost_price`, `order_payments.payment_amount`, fabric `unit_price`/`total_amount`). JavaScript/browser calculations still occur in forms/reports. The live database must be checked for any `real`, `double precision`, integer money or text financial fields. Any such field is **HIGH RISK** for costing migration.

### Date checks

Invalid/null date counts, `created_at > updated_at`, delivery-before-creation, payment-before-order and future-date anomalies are all UNKNOWN. Date semantics are inconsistent in source: reports prefer delivery recognition, while legacy cash-flow filters by order creation.

## 19. Backfill Readiness Matrix

This matrix is a provisional classification until production counts/reconciliation are available.

| Legacy dataset | Readiness now | Classification | Required evidence before automation |
|---|---|---|---|
| Order items JSON | BLOCKED | Rule-based + manual review | JSON schema inventory, line totals, product/SKU resolution, VAT/discount evidence |
| Product/SKU | BLOCKED | Rule-based + manual review | duplicate/null SKU counts, attribute mapping, price-list scope |
| Financial transactions | BLOCKED | Rule-based + manual review | source links, duplicate heuristic, event type classification |
| Expenses | BLOCKED | Rule-based; manual unresolved queue | category vocabulary, source/payment distinction, dates/amounts |
| Order payments | BLOCKED | Auto only where FK/amount/date valid | orphan/overpayment/status reconciliation and idempotency mapping |
| Fabric inventory balance | BLOCKED | Do not backfill as truth until reconciled | opening balance, movement completeness, unit analysis |
| Fabric movements/usage | BLOCKED | Rule-based + manual ambiguous records | movement type/unit/source/warehouse/order linkage |
| Suppliers from free text | BLOCKED | Automatic exact candidates; manual variants | distinct normalized names/tax identifiers |
| Pricing | BLOCKED | Preserve legacy snapshots; rule-based new versions | price/cost history availability and approval evidence |

### Backfill categories

- **AUTO BACKFILL:** not approved for any domain until production checks pass.
- **RULE-BASED BACKFILL:** order lines, expenses and movements may qualify after deterministic validation.
- **AI/HUMAN ASSISTED:** supplier name and free-text product attributes only, with human approval.
- **MANUAL REVIEW:** orphan, conflicting, missing-unit, ambiguous financial and unreconciled records.
- **DO NOT BACKFILL:** legacy proxy `profit_after` as actual net profit; preserve it as legacy snapshot instead.

## 20. Migration Complexity Matrix

| Domain | Provisional complexity | Reason | Production evidence needed |
|---|---|---|---|
| Order Items | CRITICAL | JSONB shape/line identity/totals unknown | JSON inventory and reconciliation |
| Product/SKU | HIGH | no normalized SKU/variant model; duplicates unknown | SKU/price-list/attribute counts |
| Financial Transactions | CRITICAL | overlapping sources and revenue duplication risk | counts, source links, duplicate candidates |
| Expenses | HIGH | expense vs payment vs purchase classification | category/date/amount/source quality |
| Payments | HIGH | trigger/policy behavior and overpayment/orphan risk | payment reconciliation |
| Fabric Inventory | CRITICAL | stored balance vs movement, opening history, units | ledger reconciliation and unit distribution |
| Suppliers | MEDIUM/HIGH | free-text identity and no master | distinct names and match confidence |
| Pricing | HIGH | no full price history/approval model | catalog/order snapshot coverage |

These are not final estimates; they must be revised after the read-only production checks.

## 21. Blocking Issues

### Blockers before migration

1. No authenticated read-only production/catalog session; actual schema and data state are unverified.
2. Migration history cannot be compared because the project is not linked and no platform access token is available.
3. Row counts and reconciliation metrics are unknown, so batch size, risk and backfill scope cannot be determined.
4. Revenue duplicate and date-recognition risk cannot be quantified.
5. Fabric unit and stock/ledger reconciliation cannot be performed.
6. Effective RLS, trigger and mutability policies cannot be confirmed.

### Non-blocking cleanup (after access, before migration)

- Export sanitized aggregate quality metrics and mapping queues, not customer PII.
- Inventory JSON schema variants and product/SKU candidate mappings.
- Document legacy category vocabulary and date/VAT evidence.
- Prepare a read-only reconciliation report for stakeholders.
- Confirm local pending migration deployment status without applying it.

## 22. Recommended Migration Preconditions

1. Provide an approved read-only database connection or an authenticated Supabase session for the exact project.
2. Link the local Supabase CLI only with an authorized non-mutating platform token; do not run `db push`, `migration up`, seed or repair commands.
3. Capture migration/catalog metadata and effective RLS/trigger definitions.
4. Run aggregate-only counts and anomaly queries; export masked IDs/aggregates only.
5. Resolve critical order/payment/revenue and fabric reconciliation findings.
6. Approve unit policy and moving-weighted-average reconstruction boundary.
7. Approve legacy source-of-truth and idempotency mapping.
8. Create a staging/backup/reconciliation plan before any Phase 2 migration.

## 23. Recommended Phase 1C Inputs

Phase 1C should receive only sanitized, read-only outputs:

- applied migration list and schema/policy/trigger snapshot;
- table row counts and date-range/tenant aggregates;
- order JSON shape and total/cost reconciliation distributions;
- revenue duplicate/date/VAT metrics;
- payment/expense/transaction overlap metrics;
- fabric unit, stock-vs-ledger, negative balance and valuation completeness metrics;
- supplier normalized candidate groups;
- role/RLS/mutability matrix;
- approved business decisions for units, revenue date, returns, capacity and cost categories.

## 24. Queries Executed

Only the following non-mutating checks were attempted:

1. Read local `.env` variable names and sanitize values (no secrets printed).
2. Read `supabase/config.toml` project ID.
3. Run `npx supabase --version`.
4. Run `npx supabase migration list --linked`; it failed before connecting with `LegacyProjectNotLinkedError`.
5. Run `npx supabase projects list`; it failed because no platform access token was available.
6. Read local repository migration filenames and static migration SQL.
7. Inspect generated Supabase TypeScript types and source references.
8. Attempt `GET /rest/v1/` and `GET /rest/v1/orders?select=id&limit=0` with the configured publishable key; both returned HTTP 401.
9. Attempt `GET /auth/v1/settings` without credentials; it returned HTTP 401.

No production `SELECT` returned rows. No SQL mutation, RPC, Edge Function, migration, auth change, RLS change or write operation was executed.

## 25. Final Verdict

## PRODUCTION DATA READINESS: NOT READY

This verdict means **not ready to approve migration**, not that the database is known to be corrupt. The decisive issue is missing verifiable production evidence. Source-level risks from Phase 0 further require reconciliation before a safe Cost Management backfill.

### BLOCKERS BEFORE MIGRATION

- authenticated read-only access to the exact Supabase project;
- applied migration/catalog/RLS/trigger snapshot;
- aggregate data-quality and reconciliation results;
- revenue/payment duplication and date policy confirmation;
- fabric unit and stock-ledger reconciliation;
- approved source-of-truth and idempotency mapping.

### CLEANUP BEFORE MIGRATION

- resolve or classify orphan/duplicate/negative/mixed-unit records after measurement;
- map deterministic product/SKU, expense and supplier candidates;
- isolate legacy proxy profit from authoritative profitability;
- document unresolved manual-review queues and retention requirements.

### CAN MIGRATE AS-IS

No production dataset can be approved for as-is migration before the blocked read-only checks complete. The target architecture documents remain valid as design constraints only.

### NEEDS MANUAL REVIEW

Orphan order lines, ambiguous product/SKU references, supplier spelling variants, missing or mixed units, unreconciled stock, duplicate revenue candidates, conflicting VAT/discount evidence, overpayments and legacy generic money rows.

### LEGACY DATA TO PRESERVE WITHOUT RECONSTRUCTION

- original `orders.items` JSON and its historical snapshot;
- legacy `orders.cost_price`, `profit_before` and `profit_after` as explicitly labelled legacy fields;
- original `products.price`/`cost_price` values where no history exists;
- original expense/transaction/finance rows and descriptions;
- fabric stock/movement/usage rows whose opening/units/semantics cannot be reconstructed reliably;
- original free-text `supplier_name`.

**PHASE 1B WAS READ-ONLY. NO PRODUCTION DATA, SOURCE CODE, DATABASE OBJECTS OR MIGRATIONS WERE MODIFIED.**

