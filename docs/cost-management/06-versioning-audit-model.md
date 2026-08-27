# Phase 1A - Versioning, Audit and Governance Model

## 1. Why history is a first-class domain

Reports must be reproducible using the facts and policies known at the posting time. Current catalog prices, current product costs, later BOM edits and later allocation rules must not rewrite historical financial records.

Historical records follow this rule:

```text
Posted fact = immutable snapshot + source lineage + policy/version references
Correction = reversal/adjustment + new posting
```

## 2. Versioning policy by domain

| Domain | Versioned fact | When immutable | Historical reference |
|---|---|---|---|
| Product/SKU | identity attributes, unit and mapping | after first posted use for identity/unit | SKU ID + attribute snapshot |
| Selling price | price, currency, VAT basis, approval | at order confirmation/effective publication | price version ID + order-line snapshot |
| Cost price | source, amount, estimated flag | at order/issue/valuation posting | cost version/layer + provenance |
| Order line | description, quantity, price, discount, VAT, cost | at confirmation/delivery | line snapshot and source JSON hash |
| BOM | component, quantity, scrap, operation | at approval/release | BOM version ID copied to production order |
| Routing | operation sequence, standard minutes | at approval/release | routing version ID copied to order |
| Valuation | policy and layer result | at issue/output/period close | valuation run/layer ID |
| Allocation | rule, driver, scope and result | at final run | rule version + run ID |
| Capacity | normal capacity and rate | at period allocation | capacity version ID |
| Period | status and closing checks | at close | period closing ID/checksum |

## 3. Versioning mechanics

- Use stable IDs plus explicit integer/version codes; do not infer a version from `updated_at`.
- Use effective-from/effective-to ranges for master policies. Approved versions in the same scope must not overlap unless an explicit priority rule exists.
- A posting stores the selected version IDs and a compact input snapshot/hash. A later master update cannot change the posting.
- Drafts can be edited; approved/posted facts are append-only.
- Corrections use reversal, credit/debit adjustment or superseding allocation run. The original remains visible.
- Soft deletion/deactivation is preferred for master data; no destructive delete of referenced financial/inventory facts.

## 4. Generic audit_events

### Entity contract

- **Purpose:** Immutable event history for governance and investigation.
- **Primary identity:** UUID and monotonically sortable timestamp/sequence.
- **Important fields:** tenant, actor user/worker/service, action, entity type, entity ID, before JSON, after JSON, reason, event timestamp, request ID, source module, correlation ID, success/failure and IP/device metadata where policy allows.
- **Relationships:** any domain entity; posting/idempotency request; period.
- **Ownership / tenant:** tenant required; service actors are explicit identities.
- **Mutable vs immutable:** append-only; no application update/delete.
- **Versioning:** event sequence and schema version for before/after payload.
- **Audit:** audit events audit their own source request metadata, but not recursively.
- **Expected indexes:** tenant+entity/entity_id+time, actor+time, request/correlation ID, action, period.
- **Key constraints:** valid action/entity; payload size policy; no cross-tenant entity ID.
- **Legacy integration:** existing timestamp-only changes remain legacy history; new bridge/posting actions emit audit events.
- **Future extension:** tamper-evident hash chain and export.

## 5. Audit coverage requirements

Audit is mandatory for:

- order confirmation, delivery recognition, return and price override;
- product cost/price and SKU mapping;
- supplier, receipt, invoice and payment classification;
- inventory receipt/issue/transfer/adjustment and manual balance reconciliation;
- BOM/routing/capacity approval and effective-date change;
- labor-rate/worker assignment;
- cost-entry classification, allocation rule, run, override and reversal;
- asset capitalization, assignment and depreciation;
- period close, reopen and posting rejection;
- role/permission and cost-sensitive access changes.

## 6. Period model

### financial_periods

- **Purpose:** Tenant calendar boundary for financial/inventory postings.
- **Identity:** tenant + period code (for example month or fiscal period).
- **Important fields:** start/end, timezone, status, close policy, opened/closed actor and timestamps.
- **Relationships:** postings, allocation runs, valuation runs and period closing.
- **Mutable/immutable:** dates immutable after postings; status controlled by workflow.
- **Versioning:** reopen count and closing version/checksum.
- **Audit:** all state transitions and override reasons.
- **Indexes:** tenant+date range, status, code.
- **Constraints:** no overlap; every posting date maps to exactly one period.
- **Legacy integration:** current screens continue operating until posting enforcement is introduced; legacy rows receive inferred period only in read models.
- **Future:** fiscal calendars and statutory locks.

### period_closings

- **Purpose:** Close checklist, approvals and reproducibility evidence.
- **Identity:** UUID per period close attempt/version.
- **Important fields:** period, status, checklist result, stock reconciliation result, allocation/valuation run IDs, actor, reason, checksum, close/reopen timestamps.
- **Relationships:** financial period, audit events and posting services.
- **Mutable/immutable:** checklist can progress until final; final close record immutable; reopen creates a new record.
- **Versioning:** close attempt sequence.
- **Audit:** close/reopen/override.
- **Indexes:** period/status/sequence.
- **Constraints:** `OPEN -> SOFT_CLOSED -> CLOSED -> REOPENED`; posting service rejects CLOSED period.
- **Legacy integration:** no immediate locks on legacy tables; introduce warnings/read-only checks first.
- **Future:** multi-level approval and statutory export.

## 7. Idempotency model

### idempotency_keys

- **Purpose:** Exactly-once behavior for retries, double clicks, realtime replay and job reruns.
- **Identity:** tenant + operation type + deterministic business key.
- **Important fields:** request ID, payload hash, actor, first-seen time, status, result entity IDs, response hash/error.
- **Relationships:** business transaction, inventory document, revenue event, allocation run.
- **Mutable/immutable:** status/result may complete; business key and payload hash immutable.
- **Versioning:** schema/payload version.
- **Audit:** every conflict/retry/reuse.
- **Indexes:** unique tenant+operation+business key; request ID and status.
- **Constraints:** same key with different payload is a conflict; same key returns original result.
- **Legacy integration:** use for new posting bridges such as `order:{id}:revenue_recognition`; never attempt to deduplicate by description text.
- **Future:** distributed request tracing.

## 8. Financial precision

Recommended database-level precision (exact scale is a later implementation decision):

- money/rates: PostgreSQL `numeric`, never floating point;
- quantities: `numeric` with unit-specific scale (fabric metres may need decimals);
- percentages: `numeric` with explicit scale and range checks;
- exchange rates: `numeric` with higher precision than display values;
- timestamps: timezone-aware timestamps plus tenant reporting timezone.

The browser may display/format values, but it must not be the final calculation source. Server/database calculations use decimal arithmetic, deterministic rounding policy and stored calculation version.

