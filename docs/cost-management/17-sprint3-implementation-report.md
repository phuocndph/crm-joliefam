# Sprint 3 Implementation Report - BOM, Material Standards and Cutting Consumption

## 1. Result

Sprint 3 implements the development foundation that answers:

> For a product/SKU and requested batch quantity, how much material should be required by the approved standard?

The implementation keeps `products.id` as the existing product/SKU identity and
`inventory_items.id` as the canonical material identity. It does not create a
second material master, inventory ledger, or product-cost source of truth.

Development verdict:

```text
DEVELOPMENT READY FOR SPRINT 4
```

This is not a production deployment verdict.

## 2. Backup and Safety Boundary

Pre-change backup:

```text
C:\Users\Lenovo\Documents\CRM-Joliefam-Backups\crm-joliefam-sprint3-prechange-20260825-112405
```

All database mutation tests ran only in disposable local PostgreSQL/Supabase
environments. No remote project was linked, pushed, migrated, seeded or changed.

## 3. Migration and Data Model

Additive migration:

```text
supabase/migrations/20260825110000_bom_cutting_standards_foundation.sql
```

New tables:

- `product_manufacturing_profiles`;
- `bom_headers`;
- `bom_versions`;
- `bom_lines`;
- `cutting_profiles`;
- `cutting_profile_versions`;
- `material_requirement_calculations`.

Evidence: table definitions start at migration lines 8, 32, 48, 68, 86, 137
and 163.

The schema is additive and does not drop or rewrite legacy Product, Fabric,
Inventory, Order, Pricing or Finance data.

## 4. Product Manufacturing Profile

Status: PASS.

Each existing Product/SKU can optionally receive a structured manufacturing
profile containing:

- manufacturing type;
- finished width, length and optional height;
- dimension unit;
- controlled extra dimensions;
- default BOM and cutting profile links;
- active and audit metadata.

Supported manufacturing types include fitted sheet, flat sheet, duvet cover,
pillow case/insert, duvet insert, mattress, topper, bed runner, towel, generic
sewn product and other. Product names are not used as formula identifiers.

Evidence: migration lines 8-31 and `save_product_manufacturing_profile` at line
360. Frontend editing is implemented in
`src/components/ProductManufacturingStandards.tsx`.

## 5. BOM

Status: PASS.

Implemented lifecycle:

```text
DRAFT -> APPROVED -> SUPERSEDED
```

The stable BOM header is linked to the existing Product. Quantities are stored
on versioned BOM lines using controlled methods:

- `FIXED`;
- `PER_UNIT`;
- `FORMULA` with whitelisted structured parameters;
- `CUTTING_ENGINE`.

No raw JavaScript, SQL expression, dynamic SQL or `eval` is accepted.
Approved BOM content is read-only; changes require cloning to a new DRAFT.

Evidence: migration lines 32-67 and 137-162; create/save/approve RPCs at lines
393, 435 and 475. Golden test evidence for 100 products requiring 100 labels
and 100 bags is at `supabase/tests/bom_cutting_standards_test.sql:146-161`.

## 6. Versioning

Status: PASS.

- Effective date ranges are validated.
- Approved overlap is rejected or explicitly superseded through approval flow.
- Production-context resolution uses an APPROVED version effective on the
  calculation date.
- A newer DRAFT is ignored by production-context calculation.
- Approved headers, versions and lines cannot be rewritten or deleted through
  normal authenticated REST access.
- Historical references remain visible if a Product or material is later made
  inactive.

Evidence: effective BOM resolver at migration line 655; approval and
immutability tests at `supabase/tests/bom_cutting_standards_test.sql:180-205`
and inactive-material history tests later in the same suite.

## 7. Cutting Engine

Status: PASS.

The PostgreSQL engine uses `NUMERIC` and controlled rule fields. It returns an
explainable result containing:

- feasibility;
- selected orientation;
- pieces across fabric width;
- required rows;
- net theoretical length;
- technical allowance;
- standard waste;
- final rounded issue recommendation;
- warnings, steps and engine version.

Implemented behavior includes:

- batch layout rather than quantity multiplied by a single-unit estimate;
- optional rotation;
- one-direction pattern rotation blocking;
- optional joining policy;
- explicit `NOT_FEASIBLE` when width is insufficient and joining is disabled;
- percentage waste and final issue increment;
- deterministic calculation for the same version and inputs.

Evidence: `calculate_cutting_consumption` at migration line 683. Golden tests
cover 280 cm / 70 cm = 4 pieces across and quantity 8 = 2 rows, batch
difference, rotation, directional pattern and not-feasible joining cases at
`supabase/tests/bom_cutting_standards_test.sql:66-143`.

The engine is a configurable framework. Its defaults are not claimed as the
official Joliefam factory formulas.

## 8. Standard Material Requirements

Status: PASS.

`calculate_standard_material_requirements` resolves the requested Product,
effective BOM and cutting versions, calculates the full batch, validates unit
compatibility, aggregates identical materials and returns explanation data.

Approved versions are used by default. Explicit DRAFT preview requires the
corresponding manage permission. Same-dimension units can be validated, but
the system never infers `KG <-> METER` conversion.

Calculation and preview functions do not create an Inventory Document,
Inventory Movement or change Inventory Balance.

Evidence: migration line 791 and no-side-effect assertion in
`supabase/tests/bom_cutting_standards_test.sql:235-255`.

## 9. Cost Preview

Status: PASS.

The result is labelled:

```text
Chi phí nguyên vật liệu chuẩn dự kiến
```

It is calculated from standard material quantity and current Sprint 2 Moving
Weighted Average valuation. BOM lines do not store price as a source of truth.
Cost fields are masked without `inventory_cost_view`.

Golden result:

```text
3.2 m x 45,000 = 144,000
```

The browser staging dataset also verified:

```text
3.2 m x 41,666.67 current MWA = 133,333
```

This value is not labelled as product cost or production cost because labor,
manufacturing overhead and actual variance are outside Sprint 3.

Evidence: cost calculation begins inside the requirement RPC at migration line
791; golden and permission-masking test starts at
`supabase/tests/bom_cutting_standards_test.sql:235`.

## 10. Security, RLS and Audit

Status: PASS.

Permissions added:

- `bom_view`;
- `bom_manage`;
- `bom_approve`;
- `cutting_profiles`;
- `cutting_approve`.

`inventory_cost_view` is reused for cost visibility. Frontend permission types,
labels and the Edge Function allowlist are updated.

All seven new tables have RLS. Authenticated direct INSERT/UPDATE/DELETE is
revoked, while sensitive create/save/approve/calculate behavior is controlled
by server RPCs. Tenant scope is validated for Products, BOMs, Inventory Items
and Cutting Profiles.

Audit covers manufacturing profile, BOM header/version/line, approval,
supersession and cutting profile/version changes.

Evidence: RLS begins at migration line 978 and direct writes are revoked at
line 1012. Cross-tenant, direct approval bypass and audit assertions are in
`supabase/tests/bom_cutting_standards_test.sql:208-305`.

## 11. Frontend

Status: PASS.

Product Management lazy-loads a new `Định mức sản xuất` tab. The workspace
includes:

- searchable Product selection;
- manufacturing profile editor;
- BOM versions, lines, clone/edit/approve flow;
- cutting profile versions and controlled rule fields;
- cutting batch calculator with explanation steps;
- material requirement and permission-aware cost preview.

Evidence: lazy import at `src/pages/ProductManagement.tsx:23`, tab at line 919,
and conditional workspace render at line 925. The main workspace starts at
`src/components/ProductManufacturingStandards.tsx:110`.

The mobile Product selector uses `h-52 lg:h-[620px]` at
`src/components/ProductManufacturingStandards.tsx:487`. Early profile
validation errors are caught and shown through the existing destructive toast
instead of escaping the async action.

## 12. Browser Acceptance

Status: PASS.

The UI was tested against isolated local Supabase staging with the Sprint 3
migration and seeded approved BOM/cutting data.

Verified in the in-app browser:

- desktop workspace renders with no document horizontal overflow;
- mobile `390 x 844` workspace renders with no horizontal overflow;
- mobile Product selector is approximately 275 px high including search and
  selection content;
- BOM V1 and Cutting V1 display as approved and read-only;
- cutting quantity 8 returns 4 pieces across, 2 rows and 2 m;
- requirement preview returns 3.2 m and current MWA cost preview 133,333;
- inner tabs and form controls remain readable above fixed mobile navigation.

The existing CRM Supabase project has not received the Sprint 3 migration, so
the production-connected local app correctly reports the missing RPC instead
of displaying misleading empty BOM data.

## 13. Automated Verification

Commands and results:

```text
npm run test:bom-cutting       PASS
npm run test:cost-management   PASS
npm run test:inventory         PASS
Inventory concurrency          PASS
npm run staging:inventory:test PASS
npx tsc --noEmit -p tsconfig.app.json
                               PASS
Sprint-scoped ESLint           0 errors
npm run build                  PASS
```

Focused ESLint retains one existing hook dependency warning in
`EmployeePermissionManagement.tsx`; there are no Sprint 3 lint errors. The
production build retains the repository's existing Browserslist-age and large
chunk warnings. The lazy Sprint 3 workspace bundle is approximately 10.42 kB
gzip in the verified build.

PostgREST staging acceptance confirms role behavior, cost masking,
idempotency, unauthorized write/confirm blocking, ledger reconciliation,
Sprint 3 BOM/cutting API behavior, direct approval bypass blocking and zero
inventory side effects.

## 14. Legacy Regression

Status: PASS.

Read-only browser smoke tests on the existing authenticated CRM session covered:

- Products;
- Orders;
- Quotes;
- Cash Flow / Expenses;
- Transactions / Payments;
- Fabric;
- Reports;
- Sprint 2 Inventory.

All eight routes rendered their expected application heading, no fatal page
error appeared and the browser console contained no errors after the route
suite. No form was submitted and no CRM data was changed.

## 15. Migration Created

```text
supabase/migrations/20260825110000_bom_cutting_standards_foundation.sql
```

Supporting tests and staging integration:

```text
supabase/tests/bom_cutting_standards_test.sql
scripts/test-bom-cutting-standards.ps1
scripts/test-local-staging-api.mjs
scripts/start-local-cost-staging.ps1
supabase/tests/cost_management_bootstrap.sql
```

## 16. Business Rules Still Required

Before production use, the business must approve:

1. official cutting formulas for each Joliefam product family;
2. seam, hem, tuck, flap and closure allowances by product type;
3. rotation rules by fabric/material;
4. stripe and repeating-pattern matching allowance;
5. allowed joining strategies and overlap allowances;
6. standard waste percentages by product/material/process;
7. minimum issue increments by material;
8. controlled unit conversions beyond same-dimension units;
9. who may approve BOM/cutting versions in each manager scope;
10. production deployment, data backfill and acceptance plan.

No historical fabric usage was converted into BOM by inference.

## 17. Post-Audit Security Fixes

An independent read-only audit after Sprint 3 identified three HIGH and one MEDIUM
security/integrity gaps in the Sprint 3 migration. All four were fixed in the
development migration and verified with new regression tests.

### Fix 1 - HIGH - Snapshot cost leakage (RLS)

`material_requirement_calculations_select` allowed any user with `bom_view` and
`bom_manage` to read a saved snapshot even when the snapshot contained cost data
and the reader lacked `inventory_cost_view`.

Fix: the SELECT policy now branches on `output_snapshot->>'cost_visible'`.
Cost-visible snapshots additionally require `inventory_cost_view`.

Evidence: `supabase/migrations/20260825110000_bom_cutting_standards_foundation.sql`
(`material_requirement_calculations_select` policy).

### Fix 2 - HIGH - Explicit BOM version bypassed effective-date validation

`calculate_standard_material_requirements` accepted an explicit `p_bom_version_id`
without checking that the version was effective on the requested date, allowing
calculations against future or expired BOM versions.

Fix: when `p_bom_version_id` is supplied, the function now validates the version
belongs to the product, checks DRAFT permission, and for `APPROVED`/`SUPERSEDED`
versions requires `effective_from <= p_effective_date` and
`effective_to >= p_effective_date` (or NULL).

Evidence: `supabase/migrations/20260825110000_bom_cutting_standards_foundation.sql`
(`calculate_standard_material_requirements` explicit-version branch).

### Fix 3 - HIGH - `inventory_items` manager scope lost in Sprint 3

Sprint 3 replaced `inventory_items_select` with a permission-only policy,
dropping the Sprint 2 manager-scope condition. A user with `bom_view` could read
inventory items belonging to a different manager scope.

Fix: the policy now restores the full Sprint 2 manager-scope check
(`admin`/`accountant`/`manager_id = current_cost_manager_id()`/`manager_id IS NULL`)
in addition to the permission check.

Evidence: `supabase/migrations/20260825110000_bom_cutting_standards_foundation.sql`
(`inventory_items_select` policy).

### Fix 4 - MEDIUM - `PER_BATCH` accepted JSON null `batch_size`

The `validate_bom_line_scope` trigger only checked for the presence of the
`batch_size` key, so `{"batch_size": null}` passed validation and produced a NULL
quantity during calculation.

Fix: the trigger now rejects `formula_parameters->'batch_size' = 'null'::jsonb`
and `formula_parameters->>'batch_size' IS NULL` in addition to the existing
positive-value check.

Evidence: `supabase/migrations/20260825110000_bom_cutting_standards_foundation.sql`
(`validate_bom_line_scope` PER_BATCH guard).

### Regression tests added

- `supabase/tests/bom_cutting_standards_test.sql`: three new cases covering
  snapshot cost leakage, out-of-effective-date BOM rejection, and JSON null
  `batch_size` rejection.
- `scripts/test-local-staging-api.mjs`: two new PostgREST cases covering snapshot
  cost leakage and out-of-effective-date BOM rejection through the API.

### Post-fix verification

```text
npm run test:cost-management        PASS
npm run test:inventory              PASS
npm run test:bom-cutting            PASS (including three new regression cases)
npm run staging:inventory:test      PASS (including two new PostgREST cases)
npx tsc --noEmit -p tsconfig.app.json PASS
npm run build                       PASS
```

These fixes are development-only. The migration remains unapplied to the current
CRM Supabase project.

## 18. Final Status

```text
PRODUCT MANUFACTURING PROFILE: PASS
BOM: PASS
VERSIONING: PASS
CUTTING ENGINE: PASS
STANDARD MATERIAL REQUIREMENTS: PASS
COST PREVIEW: PASS
SECURITY / RLS: PASS
GOLDEN TESTS: PASS
POSTGREST STAGING ACCEPTANCE: PASS
LEGACY REGRESSION: PASS
PRODUCTION READY: NO
DEVELOPMENT READY FOR SPRINT 4: YES
```

NO PRODUCTION MIGRATION WAS EXECUTED.
