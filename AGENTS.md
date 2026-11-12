# CRM Joliefam Agent Guide

## Mission

Develop the CRM safely and incrementally. Preserve business data, tenant isolation,
auditability, and the existing Vietnamese user experience. Prefer a verified small
change over a broad rewrite.

## Stack And Layout

The active line is branch `local-vps-20261014` (production at crm.joliefam.vn).
`main` is the frozen Supabase-era history and must not receive new work.

- React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui.
- TanStack Query owns server-state caching.
- The Node.js API in `server/` (Express, entry `server/index.ts`) with PostgreSQL 16
  owns authentication (local password sessions), authorization
  (`server/module-permissions.ts`), data integrity, and transactional business
  operations. `server/index.ts` is very large: search it, never read it whole.
- `server/db/migrations/` is the append-only, numbered SQL history. The API applies
  it at startup through `server/db/bootstrap.ts` and refuses to start when the
  checksum of an applied file changes.
- `server/integration-*.ts` and `server/zcrm-*.ts` serve the Agent/MCP API and the
  ZCRM bridge. See `docs/integration-business-tools.md`.
- `src/pages/` contains route-level screens.
- `src/components/` contains domain and reusable UI components.
- `src/hooks/` contains query and application hooks.
- `src/lib/` contains domain APIs and calculations.
- `src/integrations/supabase/` keeps the `supabase` import name for compatibility.
  With `VITE_BACKEND_MODE=local` it is a shim (`local-query-compat.ts`) that calls
  the Node API; no Supabase client is created.
- `supabase/` is legacy history and source-sync code. Read it for reference only.
- `deploy/` holds the Docker build, compose, Caddy, backup, and restore files.
- `scripts/` holds build scripts, isolated tests (`test-*.mjs`), and Windows
  launchers and suites (`*.ps1`).
- `docs/README.md` indexes the documents. Open only the files for the domain you
  touch; `docs/cost-management/` records inventory, BOM, production, and costing
  architecture and must be read before changing those domains.

## Non-Negotiable Rules

1. Never read, print, commit, upload, or expose `.env` values or credentials.
2. Never run `supabase db push`, remote migrations, remote seeds, Supabase sync, or
   destructive SQL unless the user explicitly approves the exact production
   operation.
3. Never edit an existing migration that may already have been applied. Add a new
   migration for every database change.
4. Do not create a second source of truth for products, customers, orders,
   inventory, costing, or production data.
5. Financial and inventory mutations must be atomic, idempotent where retries are
   possible, and enforced server-side. Do not rely on UI validation alone.
6. Preserve tenant checks, server-side permission checks (and RLS where it
   exists), audit events, immutable approved versions, and immutable released
   production snapshots.
7. Inventory truth comes from the movement ledger. Do not update derived balances
   directly or hand-enter actual consumption.
8. Use database `numeric` semantics for money and quantities. Avoid floating-point
   equality for business calculations.
9. Keep Vietnamese labels and messages consistent with the surrounding UI.
10. Do not push, publish, deploy, or contact external services unless explicitly
    requested. When a push is requested, use a separate branch and a pull request
    into `local-vps-20261014`. A production deploy always needs the owner's
    confirmation plus a database and image backup first.

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

For implementation requests started through the project launcher, use the
`crm-orchestrator` skill as the coordinator workflow. The coordinator delegates
production edits to `crm_implementer` and does not edit production files itself.

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

```sh
npm run typecheck:server
npx tsc --noEmit -p tsconfig.app.json
npx eslint <changed files>
npm run test:vps
npm run build:vps
npm run build:server
```

Then run the suite for the domain you changed (`npm run` lists them). Node suites
(`node scripts/test-*.mjs`) run on any OS; names ending in `-isolated` need a
disposable Docker/PostgreSQL database. Suites that call `powershell` only run on
the Windows development machine: report them as not run instead of skipping
silently. `npm run lint` on the whole repository still reports several hundred
pre-existing errors (mostly `no-explicit-any`), so lint the files you changed and
do not add new errors.

A failed or missing Docker runtime is not permission to use the production
database or the Supabase project.

## VPS Web Deploy (mandatory)

Production (crm.joliefam.vn) runs the frontend in local backend mode. When the web
image is packaged from a `dist/` built outside Docker:

1. Build with `npm run build:vps`. Never use `npm run build` or `vite build` for a VPS
   image: they omit `VITE_BACKEND_MODE=local` and the app renders a blank page
   ("Missing VITE_SUPABASE_URL"). This happened on 2026-11-11 and CRM was blank ~15h.
2. Before packaging, run `scripts/check-vps-web-build.sh dist`.
3. After deploying, run `scripts/check-vps-web-build.sh dist https://crm.joliefam.vn/`.
   An HTTP 200 alone is not proof; the login form must render.
4. If either check prints FAIL, do not deploy and do not report the deploy as done.

## Definition Of Done

- The requested behavior is implemented without unrelated refactors.
- TypeScript and the relevant lint/build/test checks pass.
- Database changes come as a new numbered migration and include permission
  enforcement, tenant validation, rollback-safe failure, audit behavior, and
  isolated tests where applicable.
- Loading, empty, error, permission-denied, mobile, and retry states are considered
  for user-facing changes.
- No secrets, generated build output, remote mutations, or unapproved deployment
  actions are included.
