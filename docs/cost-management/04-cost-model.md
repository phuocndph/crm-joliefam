# Phase 1A - Cost Model

## 1. Cost dimensions

Cost is multi-dimensional. The following concepts must not be collapsed into one category field:

| Dimension | Meaning | Example |
|---|---|---|
| Cost Category | What kind of cost/economic nature | `DIRECT_MATERIAL`, `DIRECT_LABOR` |
| Cost Behavior | How cost reacts to activity | `FIXED`, `VARIABLE`, `MIXED`, `STEP` |
| Traceability | Whether cost can be directly traced | `DIRECT`, `INDIRECT`, `SHARED` |
| Cost Center | Where responsibility/capacity resides | Cutting department, sewing center |
| Cost Object | What is being measured | Production order, SKU, customer order |
| Allocation Driver | How shared cost is distributed | Standard minutes, machine hours, revenue |

## 2. Cost entities

### cost_categories

- **Purpose:** Controlled classification of cost nature.
- **Identity:** UUID plus tenant-scoped code.
- **Important fields:** code, name, required category type, default behavior, default traceability, tax treatment, active/effective dates.
- **Relationships:** cost entries, allocation rules, reporting groups.
- **Ownership:** tenant required; category codes may be centrally seeded but tenant-owned in use.
- **Mutable/immutable:** code and meaning immutable after posting; labels/defaults effective-dated.
- **Versioning:** classification version for future reporting; reclassification creates an adjustment, not a rewrite of closed postings.
- **Audit:** create, deactivate and reclassification.
- **Indexes:** tenant+code, category type, active.
- **Constraints:** allowed set includes `DIRECT_MATERIAL`, `DIRECT_LABOR`, `VARIABLE_MANUFACTURING_OVERHEAD`, `FIXED_MANUFACTURING_OVERHEAD`, `SELLING_EXPENSE`, `MANAGEMENT_EXPENSE`, `FINANCIAL_EXPENSE`, `OTHER_EXPENSE`; no duplicate code.
- **Legacy integration:** map `expenses.category` and finance transaction categories through a deterministic mapping table; retain original text.
- **Future:** tax/account mappings and reporting hierarchy.

### cost_centers

See organization contract in `01-domain-architecture.md`. A cost center is a responsibility/capacity location, not an expense category or product.

### cost_objects

- **Purpose:** Unit to which cost/profit is traced or reported.
- **Identity:** UUID plus object type and stable reference; examples `PRODUCTION_ORDER`, `ORDER`, `SKU`, `CUSTOMER`, `SERVICE_CASE`.
- **Important fields:** object type, source entity/id, display code, status, tenant, effective dates.
- **Relationships:** direct cost entries, allocation results, profitability views.
- **Ownership:** tenant; source entity must be same tenant.
- **Mutable/immutable:** source identity immutable; display/status mutable.
- **Versioning:** assignments/effective dates; closed-period object identity cannot be repointed.
- **Audit:** object creation/closure/reassignment.
- **Indexes:** tenant+type+source ID, status, period usage.
- **Constraints:** one canonical object per source identity/type; no cross-tenant reference.
- **Legacy integration:** map existing order IDs and selected customer/product IDs; do not create one object for every legacy generic transaction unless it has a traceable source.
- **Future:** campaign, contract or batch objects.

### cost_entries

- **Purpose:** Immutable actual/direct/indirect cost fact.
- **Identity:** UUID plus source transaction line and posting key.
- **Important fields:** amount, currency, quantity/unit where applicable, category, behavior, traceability, cost center, cost object, event/posting date, period, source transaction/link, estimated flag, allocation status.
- **Relationships:** business transaction line, center, object, category, allocation runs/results.
- **Ownership:** tenant and period.
- **Mutable/immutable:** posted entry immutable; correction is reversal/adjustment.
- **Versioning:** source amendment/reversal chain.
- **Audit:** posting, reversal, classification override and backfill reason.
- **Indexes:** period/date, category, center, object, source transaction, estimated flag.
- **Constraints:** numeric precision; no posted negative cost unless explicit reversal type; one source posting key; period must permit posting.
- **Legacy integration:** bridge `expenses`, `transactions` expense rows, fabric valuation and future payroll/material issues; never overwrite legacy rows during bridge.
- **Future:** project and statutory dimensions.

### cost_allocation_rules

- **Purpose:** Business definition of how shared costs are distributed.
- **Identity:** UUID plus rule code and tenant.
- **Important fields:** source category/center, target object/center scope, driver, basis filters, priority, effective dates, approval status.
- **Relationships:** versions, allocation runs/results, capacity model.
- **Ownership:** tenant; approval role required.
- **Mutable/immutable:** active rule version immutable; draft editable.
- **Versioning:** mandatory versions and effective dates.
- **Audit:** author, approver, activation, override and retirement.
- **Indexes:** tenant+code, active/effective date, source center/category.
- **Constraints:** exactly one driver; no overlapping active versions for same scope unless priority is deterministic.
- **Legacy integration:** none; new controlled engine.
- **Future:** simulation and scenario versions.

### cost_allocation_runs

- **Purpose:** One deterministic execution of allocation rules for a period.
- **Identity:** UUID plus tenant+period+run number; idempotency key.
- **Important fields:** status, rule version set, input snapshot hash, started/completed times, actor, error summary.
- **Relationships:** results, period closing, source entries.
- **Ownership:** tenant/period.
- **Mutable/immutable:** running status mutable; completed input/result immutable; rerun creates a new run or explicit superseding run.
- **Versioning:** run captures exact rule/capacity versions.
- **Audit:** run, approval, rollback/supersede.
- **Indexes:** period/status, idempotency, hash.
- **Constraints:** one active final run per configured period/scope; no run against CLOSED period without reopen.
- **Legacy integration:** no mutation of current report profit fields.
- **Future:** parallel what-if runs.

### cost_allocation_results

- **Purpose:** Allocation output that points to original cost entries.
- **Identity:** UUID plus run+source+target+line key.
- **Important fields:** source entry, target cost object/center, driver value, allocated amount, rule version, run, estimated/override flags.
- **Relationships:** source cost entry, run, target object.
- **Ownership:** tenant/period.
- **Mutable/immutable:** immutable after run finalization; correction via superseding run/reversal.
- **Versioning:** run version is the version.
- **Audit:** result approval/override.
- **Indexes:** run, source, target, object/center, category.
- **Constraints:** sum by source follows allowed tolerance; never overwrite source entry; allocation amount non-negative except explicit reversal.
- **Legacy integration:** read-only contribution to new reports until cutover.
- **Future:** explainable allocation trace.

## 3. Cost layers

### Production Cost

```text
Direct Material
+ Direct Labor
+ Variable Manufacturing Overhead
+ Allocated Fixed Manufacturing Overhead
= Production Cost
```

Production cost attaches to a production order/output and can become finished-goods inventory valuation or cost of sales. It excludes selling and management allocations.

### Management Full Cost

```text
Production Cost
+ Selling allocation
+ Management allocation
= Management Full Cost
```

Management full cost is a management decision-support measure. It must never overwrite accounting production cost, inventory valuation or statutory cost of sales.

## 4. Direct vs allocation rules

- A material issue directly linked to a production order is `DIRECT_MATERIAL` and is not reallocated through an overhead rule.
- Worker time/piece-rate directly logged to an operation is `DIRECT_LABOR` when traceable.
- Shared supervision, machine depreciation and utilities may be indirect manufacturing overhead and can be allocated.
- Selling and management expenses may be allocated for full-cost profitability only; they do not enter production cost.
- Every allocated result points back to source cost entries and records driver value, rule version and run.

## 5. Deterministic classification

Classification order should be deterministic: explicit approved category → source document mapping → cost-center default → rule table → `OTHER_EXPENSE` review queue. AI suggestions may populate a proposed label but cannot post or override the rule result without an authorized decision recorded in audit.

## 6. Cost calculation boundary

The future costing service consumes immutable material valuations, labor operation facts and allocation results. It outputs a versioned cost snapshot for a production output/order. It does not mutate source costs, product catalog cost or legacy order proxy-profit fields.

## 7. Normal capacity model

Normal capacity is a versioned assumption of sustainable activity for a cost center, not the actual hours worked in one unusually quiet or busy period.

### normal_capacity_versions

- **Purpose:** Define normal productive capacity used to allocate fixed manufacturing overhead.
- **Primary identity:** UUID plus tenant, cost center, version and effective period.
- **Important fields:** cost center, working calendar/shift, normal minutes, normal machine hours, planned utilization, exclusions, effective dates, approval status and rate basis.
- **Relationships:** cost center, allocation rule version, allocation run and period closing.
- **Ownership / tenant:** tenant required; cost center must belong to tenant.
- **Mutable vs immutable:** draft editable; approved version immutable; correction creates a new version.
- **Versioning:** mandatory effective-dated versions; the allocation run stores the selected version.
- **Audit:** preparation, approval, override, activation and retirement.
- **Expected indexes:** tenant+cost center+effective date, status, version.
- **Key constraints:** no overlapping approved versions for the same scope; capacity and utilization are non-negative and within policy limits.
- **Legacy integration:** none; current CRM has no capacity model.
- **Future extension:** seasonal calendars, downtime and machine-specific capacity.

Fixed manufacturing overhead allocation uses normal capacity as the denominator under approved policy. Unused-capacity treatment is reported separately and must not be hidden inside product cost.

## 8. Pricing and profitability boundary

Pricing is a versioned decision domain, not a mutation of `products.price` by the costing engine.

### price_versions

- **Purpose:** Effective selling-price and approval history for an SKU/customer/price-list scope.
- **Primary identity:** UUID plus scope, version and effective interval.
- **Important fields:** SKU/product mapping, price list/customer segment, currency, VAT basis, current selling price, target price, minimum approval price, valid dates, approval state, reason and source cost snapshot references.
- **Relationships:** SKU, order-line snapshot, approval/audit, cost/profitability views.
- **Ownership / tenant:** tenant required.
- **Mutable vs immutable:** draft editable; published/used version immutable; corrections create a new version.
- **Versioning:** effective dates and approval version are mandatory.
- **Audit:** proposal, approval/rejection, override and publication.
- **Expected indexes:** tenant+SKU+scope+effective date, status, price list.
- **Key constraints:** no conflicting published versions in the same scope; minimum approval price cannot exceed approved target without explicit override; exact decimal precision.
- **Legacy integration:** current `products.price`/`price_lists` remain CRM catalog values during bridge; new order lines snapshot the selected price version where available.
- **Future extension:** campaign pricing, customer contracts and currency conversion.

Profitability is a read model combining revenue snapshots, production cost, selling allocation and management allocation. `margin` and `markup` are derived with a stored calculation version and denominator policy; neither is written back into the legacy proxy fields.
