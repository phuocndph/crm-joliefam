---
name: crm-orchestrator
description: Autonomously implement, fix, refactor, review, or verify CRM Joliefam changes by coordinating the configured CRM subagents. Use for repository development requests; skip for simple questions that need no code or repository work.
---

# CRM Orchestrator

Read `AGENTS.md` before acting. Treat the user's request as the desired outcome and
own the work through implementation and verification. Do not ask the user to choose
agents, commands, files, or tests when those choices can be discovered locally.

## Route The Work

Classify the request before spawning agents:

- For a narrow, low-risk change, use `crm_explorer`, then `crm_implementer`, then
  either `crm_reviewer` or `crm_tester` according to the main risk.
- For normal feature work or an unclear bug, run `crm_explorer` and `crm_architect`
  in parallel, use one `crm_implementer`, then run `crm_reviewer` and `crm_tester`
  in parallel.
- For migrations, RLS, permissions, inventory, costing, production, financial
  calculations, or cross-tenant behavior, always use the full normal workflow.
- For review-only requests, do not spawn an implementer unless the user also asks
  for fixes.

Do not spawn every role at once. Parallelize independent read-heavy work, then wait
for it before implementation. The coordinator must not edit production files;
`crm_implementer` is the sole production-code writer in this worktree.

## Execute Autonomously

1. Inspect Git status and the actual execution path. Preserve existing user changes.
2. Give explorer and architect a bounded request with the user's acceptance criteria.
3. Reconcile their evidence into one plan covering scope, invariants, affected files,
   database impact, and the smallest sufficient verification set.
4. Send that complete plan to `crm_implementer` and wait for a fixed diff.
5. Send the same fixed diff or commit to reviewer and tester. Run them in parallel.
6. Check each finding against the code. Return only evidenced defects to the
   implementer, then repeat focused verification. Stop after two repair cycles and
   report any unresolved issue instead of looping indefinitely.
7. Finish with changed files, behavior delivered, commands and results, remaining
   risk, and any validation that could not run.

Continue without requesting plan approval unless a missing decision would materially
change business behavior, data ownership, permissions, destructive operations, cost,
or an external side effect. Never treat access to the workspace as permission to
push, deploy, mutate remote Supabase, run production migrations, contact customers,
or expose `.env` contents.

Do not commit unless the user explicitly asks. Leave a reviewed, tested diff in the
worktree so the user can inspect it in Orca.
