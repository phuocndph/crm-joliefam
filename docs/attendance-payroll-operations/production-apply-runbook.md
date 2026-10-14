# Factory Attendance / Payroll Operator Runbook

This package automates nothing remote. A human supplies credentials interactively
to the approved connection method; no credentials, project URL, or password is
stored here. The local chain runner uses disposable Docker only.

## Required approvals and preparation

1. Obtain explicit approval for the target environment, maintenance window, exact
   versions in `chain-manifest.tsv`, and the named operator. Production is not a
   substitute for staging, and staging must use an independent identity.
2. Create a backup and complete a restore test into an isolated database. Record
   backup ID, restore timestamp, owner, and evidence before any apply decision.
3. Run `preflight-reconcile.sql` with a read-only identity. Reconcile migration
   history and schema facts by version. The remote-only `20260810030914` blocker
   must be identified and resolved by an approved owner before proceeding.
4. Review the per-version classification in `verification-per-version.sql` and
   agree the expected catalog result for every row. Do not bulk repair migration
   history; compare one version at a time.

## Apply controls

Use the platform-approved interactive SQL/migration mechanism. Apply one migration
at a time in manifest order, with a transaction only where the migration itself
provides one. Set a lock timeout (for example `5s`) and a statement timeout
(for example `60s`) in the session, adjusted only by an explicit approver. Do not
run the local PowerShell runner against a remote database.

After each version, pause for `verification-per-version.sql`'s labeled section,
schema-cache refresh where applicable, and the agreed smoke evidence. Continue
only when the operator records PASS. A failure is a hard stop: do not skip,
retry blindly, repair history in bulk, or substitute another migration.

## Stop and recovery rules

Hard-stop on an unapproved environment, missing backup/restore evidence, unknown
remote history, the remote-only blocker, unexpected objects or grants, lock or
statement timeout, RLS/ACL mismatch, failed verification, or any data mutation
outside the approved change.

Rollback is forward-fix-only. Do not delete or rewrite applied migration history,
drop objects, restore over production, or substitute a local fixture. Escalate with
the failing version and catalog evidence; use a reviewed corrective migration and
new approval. A restore is an approved disaster-recovery action, not an ordinary
migration rollback.

## Closeout

Run `post-chain-smoke.sql` read-only, capture results, refresh the API schema cache
through the approved platform procedure, and run the application smoke checks for
hour entry, month view, retry idempotency, reversal, and payroll visibility. Attach
the per-version log, backup/restore evidence, approvals, and final catalog output
to the change record. This package does not perform any remote operation.
