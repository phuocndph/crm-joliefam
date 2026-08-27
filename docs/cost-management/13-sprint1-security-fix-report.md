# Sprint 1 Security Fix Report

## 1. Scope

This report resolves the two HIGH findings recorded by Sprint 1.5 before
Inventory is connected to the Cost Management foundation.

Migration:

```text
supabase/migrations/20260824160000_cost_management_security_fixes.sql
```

## 2. Finding 1 - System Transaction Type Downgrade

Root cause: the original guard protected core behavior only while
`OLD.is_system = true`, but did not protect the `is_system` flag itself. A
two-request downgrade could therefore remove the guard condition.

Fix:

- `is_system` is immutable after creation;
- core economic-effect fields remain immutable for system types;
- the trigger function remains unavailable for direct authenticated execution.

Regression test attempts to set the seeded `EXPENSE` type to
`is_system = false` and requires a server-side failure.

## 3. Finding 2 - Polymorphic Tenant Validation

Root cause: Cost Object `source_id` and most Business Transaction link targets
were UUIDs without server verification against the target entity tenant.

Fix:

- approved internal target tables are resolved from a strict whitelist;
- Product, Order, Customer and Cost Center Cost Objects must point to an
  existing same-tenant row;
- Order, Product, Customer, Cost Center, legacy finance and reversal links must
  point to an existing same-tenant row;
- future Production Order and Marketing Campaign links are rejected until
  their target domains exist;
- `OTHER` is treated only as an explicit external reference and requires
  `metadata.external_reference`;
- validation helper and trigger functions are not executable by authenticated
  clients.

Regression tests attempt a Cost Object and transaction link from tenant
`default` to an Order in `other-tenant`; both must fail.

## 4. Additional Hardening

The Business Transaction total guard now treats a missing internal
`app.cost_recalculate` setting as `off`. This closes the same NULL-session-state
class previously found in Cost Category level protection.

## 5. Test Result

Command:

```text
npm run test:cost-management
```

Result: **PASS** in a disposable Supabase PostgreSQL container.

The suite applies:

1. minimal audited CRM auth/tenant fixtures;
2. Sprint 1 foundation migration;
3. Sprint 1 security-fix migration;
4. all foundation and security regression tests.

## 6. Legacy and Production Impact

- Legacy financial tables modified: **NO**.
- Legacy records migrated or rewritten: **NO**.
- Production migration executed: **NO**.

```text
NO PRODUCTION MIGRATION WAS EXECUTED.
```
