# Sprint 1.5 Staging Acceptance and Security Validation

## 1. Executive Summary

Sprint 1.5 stopped at the mandatory environment pre-flight. The public CRM
candidate at `http://169.58.147.43:8081` is a frontend deployment whose built
JavaScript points to Supabase project `kmxfljxsmnozvvgypdei`, the same project
configured by the current repository and previously identified as the current
CRM data project. There is no evidence that this is an independent staging
database.

Applying the Sprint 1 migration, creating acceptance data or running mutating
UI cases against that project could affect current users. None of those
operations were performed.

Final verdict: **NOT READY FOR SPRINT 2**.

## 2. Environment Verified

Pre-flight timestamp: `2026-08-24 21:51:54 +07:00`.

| Item | Result |
| --- | --- |
| Candidate environment | VPS frontend at `169.58.147.43:8081` |
| Supabase project ref in repository | `kmxfljxsmnozvvgypdei` |
| Supabase project ref in deployed JS bundle | `kmxfljxsmnozvvgypdei` |
| Independent staging database proven | **NO** |
| Migration baseline | **UNKNOWN**, CLI is not linked and deployed history was not read |
| Git commit / working tree | **UNKNOWN**, supplied source directory has no `.git` metadata |
| SSH read-only server inspection | Unavailable in this run; configured key authentication was rejected |

No password, JWT, publishable key, service-role key or database credential is
included in this report.

## 3. Migration Result

**NOT RUN / BLOCKED.**

The migration
`supabase/migrations/20260824150000_cost_management_foundation.sql` was not
applied to the candidate Supabase project because it could not be proven to be
non-production.

Fresh full-CRM migration validation is also still blocked by the legacy
migration filenames documented in the Sprint 1 report. Existing-schema staging
validation requires a separate database clone or staging project.

## 4. Schema Verification

The Sprint 1 schema has been validated only in the disposable PostgreSQL test
container. It has not been verified against an independent Supabase staging
catalog. Staging PK, FK, indexes, constraints, triggers, RPCs and effective RLS
therefore remain **NOT VERIFIED**.

## 5. Seed Result

Disposable database tests confirm the idempotent expected counts:

- 8 Cost Categories;
- 19 Cost Centers;
- 15 Transaction Types.

The seed was not run on the candidate Supabase project. Staging seed acceptance
is **NOT VERIFIED**.

## 6. Automated Test Result

Local isolated results immediately preceding this pre-flight:

- `npm run test:cost-management`: **PASS**;
- `npx tsc --noEmit -p tsconfig.app.json`: **PASS**;
- `npm run build`: **PASS**;
- Sprint-scoped ESLint: **0 errors**, one pre-existing hook warning.

These results do not substitute for tests against a deployed staging schema.

## 7. Manual Acceptance Result

**NOT RUN / BLOCKED.**

Admin, employee, accountant and manager write scenarios were intentionally not
run because they would write to an unverified Supabase project. Draft creation,
multi-line editing, confirm, void and error UX remain pending on a dedicated
staging environment.

## 8. RLS / Permission Result

The disposable database suite passes the existing role, audit immutability and
tenant SELECT-isolation cases. Staging RLS is not verified. Cross-tenant UPDATE,
VOID and polymorphic-link attempts still require explicit regression cases;
the current tenant test checks SELECT visibility only.

## 9. Idempotency / Concurrency Result

The isolated suite passes payload-aware idempotency, reuse/conflict handling,
transaction-number generation above 99,999 and duplicate-number rejection.
Near-concurrent Supabase staging requests were not run.

Result: **LOCAL PASS / STAGING NOT VERIFIED**.

## 10. Audit Result

The isolated suite passes CREATE, line UPDATE, CONFIRM, VOID and authenticated
audit-update rejection. Full staging audit coverage for line add/delete and
master changes was not executed.

Result: **LOCAL PASS / STAGING NOT VERIFIED**.

## 11. Immutability Result

The isolated suite passes confirmed-line immutability, state-transition guards,
line ownership, transaction-type protection and server-derived classification
snapshots. Direct REST bypass tests against staging were not run.

Result: **LOCAL PASS / STAGING NOT VERIFIED**.

## 12. Legacy Regression Result

Previous read-only smoke tests confirmed that Products, Orders, Quotes, Cash
Flow, Transactions, Fabric and Reports rendered on the existing VPS frontend.
That deployment does not contain an accepted Sprint 1 staging database, so it
cannot prove regression after applying the Sprint 1 migration.

Result: **BASELINE UI PASS / POST-MIGRATION REGRESSION NOT RUN**.

## 13. Bugs Found

1. **HIGH - System Transaction Type protection can be bypassed in two steps.**
   The guard protects core fields only while `OLD.is_system` is true, but it
   does not prevent changing `is_system` itself. A caller with the management
   permission can first set `is_system = false`, then change financial-effect
   metadata in a later request.
2. **HIGH - Generic target tenant validation is incomplete.** Cost Object
   `source_id` has no server validation against the referenced Order/Product/
   Customer tenant, and transaction-link validation currently validates only
   `COST_CENTER` plus reversal self-link prevention. ORDER, PRODUCT, CUSTOMER
   and legacy target ownership is not enforced.

Evidence for the second finding:

- `supabase/migrations/20260824150000_cost_management_foundation.sql:40`
- `supabase/migrations/20260824150000_cost_management_foundation.sql:41`
- `supabase/migrations/20260824150000_cost_management_foundation.sql:826`
- `supabase/migrations/20260824150000_cost_management_foundation.sql:837`

Evidence for the first finding:

- `supabase/migrations/20260824150000_cost_management_foundation.sql:47`
- `supabase/migrations/20260824150000_cost_management_foundation.sql:323`

Environment blocker: no independently verified staging Supabase project.

## 14. Bugs Fixed

No Sprint 1.5 code fix was made after the pre-flight stop condition was met.
Security must not be weakened or patched without a regression test and an
approved test database for acceptance.

The Cost Category `level` NULL-session-setting bypass had already been fixed
and passed locally before Sprint 1.5 began.

## 15. Remaining Risks

- Candidate VPS frontend appears connected to the current CRM Supabase project.
- Actual deployed migration baseline, schema drift and RLS definitions remain unknown.
- Two HIGH tenant-integrity gaps require tests and fixes.
- No server-side REST bypass, role matrix, atomic failure or concurrency test
  has run against Supabase staging.
- No manual acceptance data has been created safely.

## 16. Out-of-Scope Findings

Inventory valuation, procurement, BOM, production, labor, assets, allocation,
costing, pricing, profitability and period closing remain future work. No such
feature was implemented in Sprint 1.5.

## 17. Quality Gate Summary

| Gate | Result |
| --- | --- |
| Database tests | LOCAL PASS / STAGING NOT VERIFIED |
| TypeScript | PASS |
| Production build | PASS |
| Sprint ESLint | PASS, 0 errors |
| Migration staging | FAIL / NOT RUN |
| RLS tests | FAIL, staging unverified and HIGH static gaps |
| Idempotency | LOCAL PASS / STAGING NOT VERIFIED |
| Audit | LOCAL PASS / STAGING NOT VERIFIED |
| Manual acceptance | FAIL / NOT RUN |
| Legacy regression after migration | FAIL / NOT RUN |

## 18. Final Verdict

```text
NOT READY FOR SPRINT 2
```

Required before retrying Sprint 1.5:

1. Provision or identify a Supabase test/staging project with a different
   project ref and no current-user data.
2. Record its migration baseline and confirm it is disposable or backed up.
3. Add regression tests and fix both HIGH tenant-integrity findings.
4. Apply the additive migration only to that staging project.
5. Run the complete automated, role/RLS, concurrency, manual and legacy
   regression matrix.

```text
NO PRODUCTION MIGRATION WAS EXECUTED.
```
