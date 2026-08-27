# Sprint 1 Implementation Report - Cost Management Foundation

## 1. Result

Sprint 1 implements an additive Cost Management foundation without replacing,
backfilling or dual-writing the legacy finance models. New Business
Transactions are the source of truth only for records created through the new
module.

Lifecycle implemented for this sprint:

```text
DRAFT -> CONFIRMED -> VOIDED
```

The broader approval, posting, reversal and period-closing lifecycle remains
future work as decided in the Phase 1 architecture documents.

## 2. Database

Migration:

```text
supabase/migrations/20260824150000_cost_management_foundation.sql
```

New tables:

- `cost_categories`
- `cost_centers`
- `cost_objects`
- `transaction_types`
- `business_transactions`
- `business_transaction_lines`
- `business_transaction_links`
- `audit_events`
- `idempotency_keys`

Implemented database behavior:

- tenant-scoped codes, business numbers and idempotency keys;
- `NUMERIC(18,2)` money and `NUMERIC(18,4)` quantity;
- server-calculated line and header totals;
- readable, concurrency-protected numbers such as `BT-202608-000001`;
- atomic create, confirm and void RPC functions;
- payload-aware idempotency reuse/conflict handling;
- immutable confirmed/voided headers, lines and links;
- append-only audit access for authenticated users;
- active/tenant validation for category, center and object references;
- parent tenant validation and cycle prevention for master-data trees;
- explicit economic effect defaults so purchase, cash movement, asset and cost
  are not treated as the same concept;
- legacy reference types for expense, transaction, payment and finance data;
- RLS on every new table;
- no authenticated direct insert into `business_transactions`;
- soft disable instead of hard delete for master data.

Seed data is idempotent:

- 8 cost categories;
- 19 cost centers in the initial Joliefam tree;
- 15 transaction types.

## 3. Frontend

Route:

```text
/cost-management
```

The route is lazy-loaded and is available in desktop and mobile navigation.
The page includes:

- transaction list with search and date/type/status/center/creator filters;
- multi-line draft creation;
- transaction-type defaults and classification snapshot inputs;
- counterparty and external document reference fields;
- server-controlled confirm and void actions;
- cost-category tree management, rename and deactivate;
- cost-center tree management, rename and deactivate;
- generic cost-object management;
- read-only transaction-type catalog;
- audit history for authorized users;
- Vietnamese business-facing errors and loading/empty states.

Supabase types for the unapplied additive schema are defined in:

```text
src/integrations/supabase/cost-management-types.ts
```

The shared client now uses the extended database type, and the new data layer
does not use `as any`.

## 4. Security and Permissions

Permissions added:

- `cost_transactions`
- `cost_categories`
- `cost_centers`
- `cost_objects`
- `transaction_types`
- `cost_transaction_confirm`
- `cost_transaction_void`
- `cost_audit`

Admin and manager retain the existing automatic full-access convention.
Accountant and employee require explicit `employee_permissions`. Employees may
create drafts when granted `cost_transactions`, but confirm and void are
separate permissions and are enforced inside SECURITY DEFINER RPCs as well as
the UI.

Manager scope follows the current CRM convention through `manager_id` and
`user_roles.assigned_by`. Tenant scope remains the current `default` tenant.

The updated `save-employee-permissions` Edge Function is repository-only and
has not been deployed.

## 5. Automated Tests

Command:

```text
npm run test:cost-management
```

The command starts an isolated Supabase PostgreSQL container, applies only the
minimum existing auth/permission contract plus the Sprint 1 migration, runs
the tests in one rollback transaction, and removes its test container.

Result: PASS.

Covered cases:

1. Idempotent seed counts.
2. Draft creation with multiple server validations.
3. Server total and VAT calculation.
4. Draft-line edits recalculate the header.
5. Direct header-total tampering is rejected.
6. Same idempotency payload reuses the current transaction.
7. Conflicting payload for the same key is rejected.
8. Unauthorized confirm is rejected.
9. Confirm succeeds once and cannot run twice.
10. Confirmed lines are immutable.
11. Unauthorized void is rejected.
12. Void requires permission/reason and creates an audit event.
13. Create/confirm/void audit counts are deterministic.
14. Authenticated audit update is rejected.
15. Tenant isolation hides another tenant.
16. Duplicate business number is rejected.
17. Inactive center and category are rejected for new transactions.
18. Historical master references remain intact after deactivation.

Latest database-hardening checks also pass:

19. Business-number generation remains correct above 99,999.
20. Direct Cost Category `level` tampering is rejected.
21. A line cannot be moved between transactions.
22. A transaction type cannot change after detail lines exist.
23. Effect, direction and classification snapshots are recalculated by the server.
24. Draft line changes create scoped audit events.

Static/application verification:

- `npx tsc --noEmit -p tsconfig.app.json`: PASS.
- `npm run build`: PASS.
- focused ESLint on Sprint files: 0 errors, one pre-existing hook warning in
  `EmployeePermissionManagement.tsx`.
- full `npm run lint`: FAIL because the legacy repository currently has 753
  errors and 48 warnings outside Sprint 1, primarily existing explicit `any`
  usage. The previous ESLint runtime crash was fixed by updating
  `typescript-eslint` to a compatible version.

## 6. Regression Checks

Read-only browser smoke tests were run against the current staging deployment
for:

- Products
- Orders
- Quotes
- Cash Flow / Expenses / Payments
- Transactions
- Fabric
- Reports

All routes rendered application content/tables, none entered the application
Error Boundary, and no browser console errors were observed. No forms were
submitted and no staging/production data was changed.

## 7. Manual Acceptance Checklist

Run this only after the migration and permission Edge Function are deployed to
an approved non-production environment:

- [ ] Login as Admin and open `/cost-management`.
- [ ] Verify the category and cost-center trees.
- [ ] Create, rename and deactivate a test center.
- [ ] Create a cost object.
- [ ] Create a multi-line DRAFT transaction.
- [ ] Verify total and VAT are calculated by the server.
- [ ] Confirm and verify the transaction is immutable.
- [ ] Verify CREATE and CONFIRM audit events.
- [ ] Void with a reason and verify the VOID audit event.
- [ ] Login as Employee with only `cost_transactions`.
- [ ] Verify draft creation works and confirm/void do not.
- [ ] Recheck all legacy financial and operational pages.

## 8. Legacy Impact

```text
Were any legacy tables modified? NO
Were any legacy calculations modified? NO
Were any legacy records migrated? NO
```

No code path writes new Business Transactions into `expenses`, `transactions`,
`finance_data` or `order_payments`.

## 9. Known Limitations and Deployment Boundary

The normal `supabase start/db reset` migration chain cannot currently recreate
the complete CRM locally because 18 older migration files use a hyphen after
the timestamp. Supabase CLI skips those files, then later migrations fail
because base tables such as `quotes` were never created. Sprint 1 was therefore
validated in an isolated database with the minimum audited existing contract.
The legacy migration history should be normalized in a separate maintenance
task without changing production history blindly.

`npm audit --omit=dev` also reports five existing production dependency
advisories (one high, four moderate), including transitive `brace-expansion`,
the current React Router 6 line and the `exceljs` dependency chain. Their
available fixes include major-version changes and were not applied inside this
financial-foundation sprint.

The new page cannot be meaningfully accepted against the current staging or
production Supabase project until this migration exists in an approved test
database. Frontend deployment before the database migration would expose a
screen whose queries fail, so no Sprint 1 frontend or Edge Function deployment
was performed.

Production Data Readiness Phase 1B.2 remains required before a production
migration decision.

```text
NO PRODUCTION MIGRATION WAS EXECUTED.
```

## 10. Recommended Next Sprint

First create an approved test/staging database deployment path and complete
manual acceptance. After that, the next functional sprint should connect the
foundation to controlled purchase/material-receipt and inventory movement
events without adding inventory valuation or migrating legacy finance records
prematurely.
