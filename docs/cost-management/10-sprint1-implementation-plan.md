# Sprint 1 Implementation Plan - Cost Management Foundation

## Scope

Sprint 1 adds an additive foundation for new cost/business transactions while
keeping all legacy CRM tables and calculations operational. The new model is
not a migration of `expenses`, `transactions`, `finance_data` or
`order_payments`, and no production migration will be executed.

## Decisions applied

- New records use tenant scope (`tenant_id`, currently compatible with the
  existing `default` tenant convention) and the existing role/RLS model.
- Sprint lifecycle is deliberately limited to `DRAFT -> CONFIRMED -> VOIDED`.
  The broader Phase 1A `VALIDATED/APPROVED/POSTED/REVERSED` workflow remains a
  later extension and is not silently implemented here.
- Cost behavior and traceability are independent line dimensions.
- Master data is deactivated with `is_active`; referenced rows are not hard
  deleted.
- Confirm and void are PostgreSQL security-definer functions that lock the
  header, validate scope/state and write the audit event in one transaction.
- Transaction number assignment and idempotency are database-enforced.
- Legacy rows are referenced only through links/source metadata; no dual-write
  or historical backfill is included.

## Work sequence

1. Add one additive migration with master catalogs, transaction tables,
   audit infrastructure, seed data, RLS and confirm/void functions.
2. Add a typed data layer and basic screens for cost categories, cost centers,
   transaction types and business transactions.
3. Add navigation/routes and reuse existing role/permission conventions.
4. Add focused unit tests for pure validation/transition helpers and document
   SQL acceptance tests that require a Supabase test database.
5. Run TypeScript, lint/build checks and manual staging smoke tests.
6. Write the implementation report with explicit legacy and production impact.

## Database acceptance criteria

- All new tables have RLS enabled and tenant/scope policies.
- Seed reruns are idempotent by tenant-scoped codes.
- A transaction cannot be created twice with the same idempotency key.
- Confirming a draft twice fails without a second audit event.
- Confirmed headers/lines cannot be edited through normal authenticated DML.
- Void requires a non-empty reason and is append-only from an audit perspective.
- Audit rows have no authenticated update/delete policy.

## UI acceptance criteria

- Authorized users can list/filter and create draft business transactions.
- Authorized users can manage active/inactive cost categories and centers.
- Users see business-language transaction types, not accounting account codes.
- Confirm/void actions display Vietnamese validation errors.
- Existing Products, Orders, Quotes, Expenses, Transactions, Payments, Fabric
  and Reports routes remain unchanged.

## Test and deployment boundary

Local/test Supabase may receive the migration if an isolated database is
available. The repository migration is reviewed and build-verified only in the
current environment. No `supabase db push`, migration deploy, seed, RLS change
or data write is run against production.

