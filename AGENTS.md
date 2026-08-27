# CRM Joliefam Agent Guide

## Mission

Develop the CRM safely and incrementally. Preserve business data, tenant isolation,
auditability, and the existing Vietnamese user experience. Prefer a verified small
change over a broad rewrite.

## Stack And Layout

- React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui.
- TanStack Query owns server-state caching.
- Supabase/PostgreSQL owns authentication, authorization, data integrity, and
  transactional business operations.
- `src/pages/` contains route-level screens.
- `src/components/` contains domain and reusable UI components.
- `src/hooks/` contains query and application hooks.
- `src/lib/` contains domain APIs and calculations.
- `src/integrations/supabase/` contains the generated client and database types.
- `supabase/migrations/` is append-only database history.
- `supabase/functions/` contains Edge Functions.
- `supabase/tests/` and `scripts/test-*.ps1` contain isolated database tests.
- `docs/cost-management/` records the current inventory, BOM, production, and
  costing architecture. Read the relevant plan and report before changing those
  domains.

## Non-Negotiable Rules

1. Never read, print, commit, upload, or expose `.env` values or credentials.
2. Never run `supabase db push`, remote migrations, remote seeds, or destructive
   SQL unless the user explicitly approves the exact production operation.
3. Never edit an existing migration that may already have been applied. Add a new
   migration for every database change.
4. Do not create a second source of truth for products, customers, orders,
   inventory, costing, or production data.
5. Financial and inventory mutations must be atomic, idempotent where retries are
   possible, and enforced server-side. Do not rely on UI validation alone.
6. Preserve tenant checks, RLS, permissions, audit events, immutable approved
   versions, and immutable released production snapshots.
7. Inventory truth comes from the movement ledger. Do not update derived balances
   directly or hand-enter actual consumption.
8. Use database `numeric` semantics for money and quantities. Avoid floating-point
   equality for business calculations.
9. Keep Vietnamese labels and messages consistent with the surrounding UI.
10. Do not push, publish, deploy, or contact external services unless explicitly
    requested.

## Agent Ownership

- `crm_explorer`: read-only code and dependency mapping. No edits.
- `crm_architect`: read-only design, migration, security, and rollout planning.
- `crm_implementer`: the only agent that edits production code in a worktree.
- `crm_reviewer`: read-only correctness, security, regression, and test review.
- `crm_tester`: runs verification and may edit tests only when the parent explicitly
  assigns test implementation.

For one task, only one agent may edit production files in a worktree. Parallel
agents should normally be read-only. Use separate Git worktrees when comparing
multiple implementations.

## Required Workflow

1. Inspect `git status`, relevant docs, the actual execution path, and existing
   tests before proposing changes.
2. State the scope, invariants, affected files, database impact, and validation
   plan.
3. For medium or high-risk work, run exploration and architecture review in
   parallel, then give one bounded implementation task to `crm_implementer`.
4. After implementation, run `crm_reviewer` and `crm_tester` in parallel against
   the same fixed diff or commit.
5. Route accepted findings back to the implementer. Do not let reviewers silently
   edit production code.
6. Report commands run, results, files changed, remaining risks, and any validation
   that could not run.

## Verification Ladder

Run the smallest relevant checks first, then broaden according to risk:

```powershell
npx tsc --noEmit -p tsconfig.app.json
npm run lint
npm run build
npm run test:cost-management
npm run test:inventory
npm run test:bom-cutting
npm run test:production
```

Database suites require the isolated local Docker environment. A failed or missing
Docker runtime is not permission to use the production Supabase project.

## Definition Of Done

- The requested behavior is implemented without unrelated refactors.
- TypeScript and the relevant lint/build/test checks pass.
- Database changes include RLS, grants, tenant validation, rollback-safe failure,
  audit behavior, and isolated tests where applicable.
- Loading, empty, error, permission-denied, mobile, and retry states are considered
  for user-facing changes.
- No secrets, generated build output, remote mutations, or unapproved deployment
  actions are included.
