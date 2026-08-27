# SPRINT 3 IMPLEMENTATION PLAN

## 1. Objective

Sprint 3 builds the development foundation for product manufacturing profiles, versioned BOMs, structured cutting rules, deterministic standard material requirements, and material cost preview.

The implementation extends the existing Product and Inventory foundations. It does not create a second product identity, material master, inventory ledger, or product-cost source of truth.

## 2. Preconditions and Safety Boundary

- Sprint 1 cost-management security and audit foundations are present.
- Sprint 2 canonical materials use `inventory_items.id`.
- Inventory quantity and value remain derived from immutable `inventory_movements` and projected in `inventory_balances`.
- Existing `products.id` remains the sellable product/SKU identity for this sprint.
- All migrations and mutation tests run only against isolated local development/staging.
- No production migration, database push, seed, link, or production mutation is allowed.
- Legacy finance, product price/cost, fabric usage, and inventory history are not modified.
- BOM calculations and previews never create inventory documents, movements, or balance changes.

## 3. Backup

Create a timestamped source backup under `C:\Users\Lenovo\Documents\CRM-Joliefam-Backups\` before the first major Sprint 3 implementation change. Exclude generated dependency/build/runtime directories and secrets from the portable source archive.

## 4. Product Manufacturing Profile

Add one manufacturing profile per tenant/product with:

- manufacturing type;
- structured finished dimensions;
- optional height, tuck, flap, and controlled extra parameters;
- default cutting profile reference;
- active state and audit fields.

Dimensions use explicit numeric fields and units. Existing free-text `products.specifications` remains legacy display data and is not parsed into manufacturing values automatically.

## 5. BOM Model

Create:

- `bom_headers` as the stable tenant/product BOM identity;
- `bom_versions` as dated, immutable business versions;
- `bom_lines` as material requirements belonging to one version.

The version lifecycle is:

```text
DRAFT -> APPROVED -> SUPERSEDED
```

Only a DRAFT version is editable. Approval validates completeness, tenant scope, active references, units, effective dates, and overlap. An approved version can only change through cloning to a new DRAFT. Approval may explicitly supersede the prior effective version.

## 6. BOM Line Quantity Methods

Support controlled methods:

- `FIXED`: fixed quantity for the calculation batch;
- `PER_UNIT`: quantity multiplied by requested product quantity;
- `FORMULA`: a whitelisted structured formula such as `PER_BATCH`;
- `CUTTING_ENGINE`: quantity returned by an approved cutting profile version.

No JavaScript, SQL text, `eval`, dynamic SQL, or arbitrary formula expression is stored or executed.

## 7. Cutting Profile and Versioning

Create a stable cutting profile and dated versions with:

- product/manufacturing context;
- structured piece-width and piece-length rules;
- controlled numeric parameters;
- rotation policy;
- pattern direction;
- joining policy;
- allowance and waste settings;
- minimum issue increment;
- engine version;
- approval metadata and effective interval.

The same DRAFT/APPROVED/SUPERSEDED lifecycle and immutability rules used by BOM versions apply to cutting versions.

No rule is labelled as Joliefam's official production formula unless the business has explicitly supplied and accepted it.

## 8. Deterministic Cutting Engine

Implement the calculation in PostgreSQL using `NUMERIC` and controlled enums/rules.

The engine will:

1. Resolve structured product dimensions and cutting inputs.
2. Evaluate only permitted orientations.
3. Block rotation for directional patterns where required.
4. Calculate `pieces_across = floor(fabric_width / effective_piece_width)`.
5. Calculate rows from the full batch, not from a single-unit result multiplied by quantity.
6. Return `NOT_FEASIBLE` when width is insufficient and joining is disallowed.
7. Separate net theoretical length, technical allowance, gross technical length, standard waste, and final issue recommendation.
8. Round only the final issue recommendation to the configured issue increment.
9. Return selected strategy, calculation steps, warnings, version identifiers, and engine version.

Calculation precision is `0.0001 m`; UI display precision is normally `0.01 m`.

## 9. Standard Material Requirement Calculator

Add read-only calculation RPCs that:

- resolve the approved BOM effective on the requested date;
- resolve approved cutting versions effective on that date;
- allow authorized DRAFT preview only when explicitly requested;
- calculate the whole requested batch;
- validate material/base-unit compatibility;
- aggregate identical material requirements;
- return explainable calculation details and warnings;
- optionally save a calculation snapshot without inventory side effects.

Production-context calculations ignore DRAFT versions.

## 10. Material Cost Preview

Cost preview is calculated after standard quantities are known.

- Read current `inventory_balances` in one aggregate query.
- Support optional warehouse context.
- Derive average cost as total inventory value divided by total positive on-hand quantity where appropriate.
- Keep missing-cost and insufficient-stock warnings explicit.
- Mask all unit-cost and total-cost fields unless the caller has `inventory_cost_view`.
- Label the result `Chi phí nguyên vật liệu chuẩn dự kiến`.
- Never present this value as complete production cost or product cost price.

No cost is stored on BOM lines as the source of truth.

## 11. Service Boundary

Security-definer RPCs control sensitive operations:

- create/clone BOM DRAFT;
- save BOM DRAFT and lines;
- approve BOM version;
- create/clone cutting profile DRAFT;
- save cutting profile DRAFT;
- approve cutting profile version;
- resolve effective versions;
- calculate requirements and cost preview.

Direct REST updates cannot approve, supersede, or modify approved versions.

## 12. Tenant Isolation and Integrity

Every new business table carries `tenant_id` and validates parent/reference tenant equality.

Database constraints/triggers prevent:

- cross-tenant Product, material, BOM, or cutting references;
- overlapping approved effective intervals;
- approved-version mutation or deletion;
- invalid date ranges;
- duplicate active product BOM headers;
- non-positive quantities, dimensions, increments, or requested batch sizes;
- unsupported units or quantity-method payloads;
- inactive materials entering a new version.

Historical versions retain references to materials/products that later become inactive.

## 13. Permissions and RLS

Add application permissions:

- `bom_view`;
- `bom_manage`;
- `bom_approve`;
- `cutting_profiles`;
- `cutting_approve`.

Reuse `inventory_cost_view` for cost visibility. Update frontend permission typing/management and the server-side employee-permission allowlist.

RLS supports admin/manager access consistent with current foundations, grants approved BOM visibility to authorized users, and restricts draft management/approval to explicit permissions. Server-side permission checks remain authoritative.

## 14. Audit

Write auditable events for:

- manufacturing profile changes;
- BOM/header/version creation;
- BOM line create/change/delete while DRAFT;
- BOM approval and supersession;
- cutting profile/version creation and change;
- cutting approval and supersession;
- optional saved calculation snapshots.

Audit records include actor, tenant, entity, before/after state, action, timestamp, and approval reason where supplied.

## 15. Frontend and API Integration

Add a lazy-loaded `Định mức sản xuất` tab to Product Management.

The UI will provide:

- searchable product selection;
- manufacturing profile editor;
- current approved BOM summary;
- BOM version history and status;
- DRAFT create/clone/edit workflow;
- BOM line material selector and structured quantity method fields;
- approve actions shown only to authorized users;
- cutting profile/version management;
- cutting calculator with explainable layout and warnings;
- batch material requirement preview;
- cost preview only when permitted.

Add a Sprint 3 database type extension and a dedicated API module rather than broadly editing the generated Supabase base types.

## 16. Automated Tests

Add isolated SQL and API tests covering:

- fixed/per-unit requirements for 100 products;
- 5% waste on 100 m returns 105 m;
- 280 cm fabric, 70 cm piece, quantity 8 gives 4 across and 2 rows;
- batch layout differs from single result multiplied;
- rotation disabled/enabled behavior;
- one-direction pattern rotation restriction;
- insufficient width with joining disabled returns `NOT_FEASIBLE`;
- effective-date resolution between 2026 V1 and 2027 V2;
- production context ignores DRAFT;
- approved versions/lines are immutable and clone creates editable V2;
- 3.2 m at 45,000 gives 144,000 cost preview;
- calculations create zero movements and do not alter balances;
- cross-tenant references fail;
- direct approval bypass fails;
- unit incompatibility fails clearly;
- inactive material cannot enter a new version but remains historically visible;
- create/change/approve/supersede audit events exist.

Run existing Sprint 1 and Sprint 2 regression suites after Sprint 3 tests.

## 17. Implementation Order

1. Create backup.
2. Add additive local migration and enums/tables/indexes.
3. Add validation, immutability, RLS, grants, permission checks, and audit.
4. Add cutting and standard-requirement calculation functions.
5. Add cost-preview masking and effective-version resolution.
6. Add TypeScript database extension and API module.
7. Add Product Management tab and feature UI.
8. Add SQL/golden/security/versioning tests and local staging wiring.
9. Run TypeScript, scoped ESLint, build, Sprint 1/2 regression, Sprint 3 tests, and local staging API checks.
10. Write `docs/cost-management/17-sprint3-implementation-report.md` with evidence and remaining business rules.

## 18. Business Rules Still Required

The implementation will expose configurable structured fields but will not invent:

- official Joliefam formulas for each product family;
- product-specific seam, tuck, flap, or technical allowances;
- exact stripe/pattern matching allowances;
- approved joining rules;
- standard waste percentages by material/product;
- minimum issue increments by material;
- unit-conversion policy beyond explicitly supported compatible units.

These values require business confirmation before production use.

## 19. Stop Conditions

Stop and report rather than guess if implementation requires destructive legacy changes, production mutation, unsafe free-form formulas, cross-tenant references, dual inventory ledgers, inferred historical BOMs, or undocumented factory-specific cutting rules.

## 20. Delivery Status Ceiling

The highest possible Sprint 3 verdict in this implementation is `DEVELOPMENT READY` or `STAGING READY`, depending on completed local evidence. Production readiness requires a separately reviewed deployment and data-readiness process.

NO PRODUCTION MIGRATION WAS EXECUTED.

## 21. Completion Checklist

- [x] Pre-change source backup created.
- [x] Additive local/dev migration created.
- [x] Product manufacturing profiles implemented.
- [x] Versioned BOM headers, versions and lines implemented.
- [x] Approved BOM and cutting versions made immutable.
- [x] Effective-date version resolution implemented.
- [x] Versioned cutting profiles and deterministic engine implemented.
- [x] Batch, rotation, pattern, joining and waste policies covered by tests.
- [x] Standard material requirement calculator implemented.
- [x] Permission-masked MWA material cost preview implemented.
- [x] RLS, tenant validation, approval RPCs and audit implemented.
- [x] Product manufacturing UI and calculators implemented.
- [x] Golden, security, versioning and no-inventory-side-effect tests pass.
- [x] Sprint 1 and Sprint 2 database regression suites pass.
- [x] Local PostgREST staging acceptance passes.
- [x] TypeScript, Sprint-scoped ESLint and production build pass.
- [x] Desktop/mobile browser acceptance passes without horizontal overflow.
- [x] Legacy route smoke tests pass without browser console errors.
- [x] Implementation report completed.
- [x] No production migration executed.
