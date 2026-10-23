# Local attendance/payroll demo cleanup — 19 October 2026

Scope: the local `crm_local` database in `crm-joliefam-local-postgres` only.
The maintenance script is `scripts/cleanup-local-attendance-demo.mjs` and defaults
to a transaction that always rolls back. No frontend, schema, migration, remote
service, environment file, credential, or user-account change is included.

## Reviewed data selection

The exact UUID and row-hash plan is saved under
`.local-staging-runtime/demo-cleanup-20261019/attendance-demo-cleanup-manifest.json`.
Its SHA256 is `5749c0d2937c812baccfa1319343e1835e47b2d3df3ee2ae68814bdc0db57d28`.

All 43 worker records remain. The existing `DEMO-LOCAL` worker
`53fed1b2-7d49-49a8-ac64-866080b12075` remains active and unchanged.
The real `NV-ONL` worker `b2539e72-af6b-44de-9cf5-4ddb4e872350` remains
unchanged. The 41 other proven demos are suspended in place by changing only
`is_active`, `payroll_status`, and `local_modified_at`. The latter preserves the
local decision during source synchronization. Existing account links, including
the seed `PIECE-001` account link, remain intact.

Classification requires the exact known seed UUID/code/name or the exact script
prefix and display name, with 25 HARDEN and 12 PAYTEST workers. The two seed
sources and legacy-demo documentation are named in the manifest. An unknown or
new account-linked candidate aborts the operation.

| Operational source table | Delete unbound demo facts | Preserve demo history |
| --- | ---: | ---: |
| `local_attendance` | 9 | 37 |
| `local_day_closures` | 1 | 22 |
| `local_day_statuses` | 1 | 0 |
| `local_overtime` | 1 | 6 |
| `local_production_entries` | 4 | 0 |
| Total | 16 | 65 |

Deletion requires no UUID reference in any retained public table, including
payroll JSON, audit, workflow events, receipts, imports, and source snapshots.
Closed/locked payroll dates, production links, retained day confirmations, and
day workflow receipts also protect a fact. The retained demo keeps all non-seed
facts: its old two attendance records remain, and only its exact known seed
absence and rejected production-entry rows are eligible for deletion.

Every payroll period/run/record/item/exception, approved configuration, account,
product, inventory, sales, production log/stage row, audit event, receipt,
import, and revision history is retained. Mixed payroll snapshots are never
partially rewritten. Historical demo rows consequently remain available.

## Transaction and audit protection

The script validates the exact local API health fields and Docker image/name,
then acquires session-exclusive sync and payroll-source locks **before** starting
the repeatable-read transaction. This makes the snapshot follow any writer that
was already holding a shared source lock. A bounded 10-second lock timeout and
120-second statement timeout fail closed.

Apply requires the manifest file plus its exact SHA256. The current worker/source
hashes, protection decisions, table schema, trigger definitions, and public
function bodies must match the reviewed plan. Each deletion and the 41 archives
has an exact row-count assertion. The transaction compares all 117 public-table
digests; only the five source tables, workers, affected day revisions, and new
cleanup audit events may differ. Surviving source rows and protected workers
must remain byte-identical. Archived workers must preserve every other column.
Revision increments must equal exactly the deleted non-closure source count on
each worker/date. All existing payroll-audit rows remain byte-identical, with
exactly 42 appended events containing the approved hash and original row/source
UUIDs and hashes. A durable audit marker prevents rerunning an applied cleanup.

## Verification on the restored backup clone

The only database modified during rehearsal was the explicitly authorized clone
`demo_cleanup_qa_20261019`, restored with `pg_restore --no-owner --no-acl
--exit-on-error` from `/tmp/crm_local_before_demo_cleanup_20261019.dump`.

A concurrency test held a shared source lock, inserted a logical source audit
reference, and started cleanup while that lock was held. Cleanup was observed
waiting on the advisory lock. After the writer committed, cleanup saw the new
reference and rejected the stale manifest. All six worker/source table digests
remained unchanged; all 43 workers remained active and no cleanup audit appeared.
The clone was then restored again before the successful apply rehearsal.

The successful rehearsal archived 41 workers, deleted 16 unbound facts, preserved
all 65 protected demo facts, retained both active workers, and appended exactly
42 audit events. All 109 non-target public-table digests remained unchanged.
The expected eight changed tables were workers, the five operational source
tables, day revisions, and the append-only payroll audit table. Wrong database,
wrong approval SHA256, and durable repeated-application checks all failed closed.

Evidence files in the local staging directory contain before/after table hashes,
source IDs/hashes, concurrency outcomes, and guard outcomes, without credentials.
No live application is recorded by this plan; the coordinator must verify the
latest review and rehearsal before applying to `crm_local`.

## Remaining working-demo setup

This cleanup does not create an attendance record, change the retained demo's
location, approve a payroll calendar, or run/approve/lock payroll. The coordinator
will use the normal local UI to prepare the one working demo. Existing approved
HOUR rate 40,000 VND and effective 10 October configuration should be reused. A
dedicated `DEMO-LOCAL` location and approved exact 1–31 October calendar (26 days,
480 minutes/day) keep calendar configuration separate from the real worker.
A pending 19 October example of 08:00–17:00 with 60-minute break represents
480 minutes and 320,000 VND, with an explicit demo reason. The user retains the
approval, day confirmation, payroll preview, and lock workflow.
