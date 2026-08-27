# Phase 1A - Business Transaction Model

## 1. Purpose

The transaction model separates one economic event into independent effects:

```text
Economic event
  ├── cash impact (cash/bank/receivable/payable)
  ├── inventory impact (quantity and valuation)
  ├── cost impact (cost entry and cost object)
  └── accounting mapping (future posting/account reference)
```

No single `amount` field is allowed to imply all four effects. A purchase can increase inventory and payable without becoming an expense. An asset purchase increases an asset and reduces cash/payable, then depreciation creates expense later. A customer deposit affects cash and liability/contract balance, not revenue by itself.

## 2. Entities

### business_transactions

- **Purpose:** Economic event header and lifecycle envelope.
- **Identity:** UUID plus tenant-scoped document number; immutable business key for the event.
- **Important fields:** transaction type, status (`DRAFT`, `APPROVED`, `POSTED`, `REVERSED`, `VOID`), event date, posting date, currency, source context, counterparty, total control amount, period ID, idempotency key, actor and reason.
- **Relationships:** lines, links, inventory documents, cost entries, payment records, source CRM IDs.
- **Ownership:** tenant required; manager/department scope is derived or explicitly referenced, never used as a substitute for tenant.
- **Mutable/immutable:** draft header mutable; posted event immutable; correction is reversal/adjustment.
- **Versioning:** event version or amendment reference; no in-place historical recalculation.
- **Audit:** every status transition and material field change.
- **Indexes:** tenant+document number, type/status/event date, period, source request ID, counterparty.
- **Constraints:** unique tenant+document number and tenant+idempotency business key; posted event must have balanced/valid lines; no cross-tenant links.
- **Legacy:** bridge delivery transactions, expenses, finance_data and order_payments; do not create another generic money table in parallel.
- **Future:** external accounting journal reference, multi-currency.

### business_transaction_lines

- **Purpose:** Typed effects of the event.
- **Identity:** UUID plus transaction+line sequence.
- **Important fields:** effect kind (`CASH`, `RECEIVABLE`, `PAYABLE`, `INVENTORY`, `ASSET`, `COST`, `REVENUE`, `TAX`, `LIABILITY`), direction, amount, quantity/unit where applicable, item/account/category/center/object references, VAT basis, description.
- **Relationships:** header and domain source targets.
- **Ownership:** inherit tenant/header scope.
- **Mutable/immutable:** draft mutable; posted immutable.
- **Versioning:** line corrections through reversal/new transaction.
- **Audit:** line creation, classification override and posting.
- **Indexes:** transaction+sequence, effect kind, category/center/object, source reference.
- **Constraints:** exactly one valid effect type per line; amount/quantity sign rules; currency and unit compatibility.
- **Legacy:** line-level bridge retains source table and row IDs.
- **Future:** journal dimensions and tax ledger.

### business_transaction_links

- **Purpose:** Explicit many-to-many causal links between economic events and source/settlement documents.
- **Identity:** UUID or deterministic `(transaction, link_type, target_id)` key.
- **Important fields:** link type (`ORDER`, `RECEIPT`, `INVOICE`, `PAYMENT`, `PRODUCTION`, `REVERSAL`, `SOURCE_LEGACY`), target entity/id, allocated amount/quantity, created by.
- **Relationships:** transaction header to CRM/procurement/inventory/production object.
- **Ownership:** tenant required; target tenant must match.
- **Mutable/immutable:** posted links immutable; corrections use reversal.
- **Versioning:** allocation version if settlement changes.
- **Audit:** link and unlink attempts.
- **Indexes:** target entity/id, source transaction, link type.
- **Constraints:** no self-link; allocated quantity/amount cannot exceed source under policy; idempotent link key.
- **Legacy:** connects new postings to `orders.id`, `transactions.id`, `order_payments.id`, etc.
- **Future:** settlement chains and document lineage.

## 3. Minimum transaction types

| Type | Economic event | Cash impact | Inventory impact | Cost impact | Accounting mapping concept |
|---|---|---|---|---|---|
| `PURCHASE_MATERIAL` | Material acquired | payable/cash increase | receipt increases stock at valuation | no P&L expense yet | inventory asset vs payable/cash; VAT separate |
| `PURCHASE_ASSET` | Machine/equipment acquired | payable/cash decrease | no stock; asset register increases | no immediate production expense | fixed asset vs payable/cash; VAT separate |
| `EXPENSE` | Service/period cost incurred | payable/cash or accrual | none | cost entry, category/center/object | expense vs payable/cash |
| `SUPPLIER_PAYMENT` | Supplier balance settled | cash decrease | none | no new cost | payable vs cash |
| `CUSTOMER_RECEIPT` | Customer cash received | cash increase | none | no new revenue if already recognized | cash vs receivable |
| `ADVANCE` | Advance paid/received | cash impact | none | no cost/revenue until settled | advance asset/liability |
| `ADVANCE_SETTLEMENT` | Advance applied | clears advance | optional linked output | cost/revenue per source | reclassify advance |
| `DEPOSIT` | Customer/supplier deposit | cash + liability/asset | none | no revenue/expense yet | deposit account vs cash |
| `LOAN_RECEIPT` | Loan received | cash increase | none | financing, not revenue | loan liability vs cash |
| `LOAN_REPAYMENT` | Principal/interest repaid | cash decrease | none | interest cost only; principal not expense | loan/interest vs cash |
| `INVENTORY_ADJUSTMENT` | Count/condition adjustment | usually none | stock movement | variance cost if policy says so | inventory vs adjustment variance |
| `MATERIAL_ISSUE` | Material consumed in production | none | stock decreases | direct material cost to production object | WIP/cost object vs inventory |
| `MATERIAL_RETURN` | Unused material returned | none | stock increases | reverses or reduces issue cost | inventory vs WIP/cost object |

## 4. Posting lifecycle

```text
DRAFT → VALIDATED → APPROVED → POSTED
                         ├── REVERSED (new reversal event)
                         └── VOID (only before posting if policy permits)
```

Validation is deterministic and server-controlled:

1. Check tenant, role, source document and period status.
2. Resolve idempotency key before creating effects.
3. Validate all lines, units, quantities, currencies and source balances.
4. In one database transaction, create header/lines/links, inventory movement/valuation, cost entries and posting references.
5. Commit once; publish a result only after commit.

No UI may create one effect and leave another effect to a best-effort asynchronous call.

## 5. Revenue recognition boundary

For CRM compatibility, `order + revenue_recognition` is a distinct business key. The later posting service should:

- recognize only on configured delivery/completion event;
- use the order-line commercial snapshot and VAT-excluded basis;
- record recognition date/source and estimated flags;
- link the event to the existing order ID;
- return the same posting result when the same business key is retried;
- create a reversal/adjustment for returns or cancellations, never a duplicate income row.

This design does not change current CRM behavior in Phase 1A.

## 6. Source-of-truth rule

`business_transactions` is the target economic-event source. Inventory movements remain the quantity source; cost entries remain the cost source; cash/bank settlement details remain payment evidence. Read models can combine them, but no dashboard or UI should infer a new posting by summing unrelated legacy tables after cutover.

## 7. Exact entity contract summary

| Entity | Mutable fields | Immutable fields | Versioning | Audit | Critical indexes/constraints |
|---|---|---|---|---|---|
| business_transactions | draft description, counterparty, dates before posting | type, posted amounts/effects after posting | amendment/reversal | status/posting/reversal | tenant+document, idempotency, period |
| business_transaction_lines | draft classification/description | posted amount/quantity/effect | reversal lines | classification override | transaction+sequence, source |
| business_transaction_links | draft allocation | posted lineage | allocation version | link changes | target, link uniqueness |

