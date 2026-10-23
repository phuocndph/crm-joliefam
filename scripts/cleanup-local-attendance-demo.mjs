#!/usr/bin/env node
/**
 * Bounded LOCAL maintenance; no credentials, remote access, schema changes,
 * trigger bypasses, financial approvals, or worker/user deletion.
 *
 * Preview (default): node scripts/cleanup-local-attendance-demo.mjs
 * Apply reviewed plan: node scripts/cleanup-local-attendance-demo.mjs --apply
 *   --manifest <path> --approve-sha256 <printed manifest SHA256>
 * Rehearsal: add --database demo_cleanup_qa_20261019 (restored backup).
 *
 * Generated manifests contain IDs/hashes/counts only, never account contents.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const allowedFlags = new Set(['--apply', '--manifest', '--approve-sha256', '--database', '--output-dir']);
for (const value of argv.filter(value => value.startsWith('--'))) {
  if (!allowedFlags.has(value)) throw new Error(`Unknown flag ${value}`);
}
function option(name, fallback) {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`Missing ${name}`);
  return argv[index + 1];
}
const apply = argv.includes('--apply');
const database = option('--database', 'crm_local');
if (!['crm_local', 'demo_cleanup_qa_20261019'].includes(database)) throw new Error('Only named local databases are allowed.');
const container = 'crm-joliefam-local-postgres';
const outputDir = path.resolve(option('--output-dir', '.local-staging-runtime/demo-cleanup-20261019'));
const manifestPath = path.resolve(option('--manifest', path.join(outputDir, 'attendance-demo-cleanup-manifest.json')));
const actor = 'local-maintenance:user-request:attendance-demo-cleanup-20261019';
const keepId = '53fed1b2-7d49-49a8-ac64-866080b12075';
const realId = 'b2539e72-af6b-44de-9cf5-4ddb4e872350';
const sourceTables = ['local_attendance', 'local_overtime', 'local_day_statuses', 'local_day_closures', 'local_production_entries'];
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const sha256 = value => createHash('sha256').update(value).digest('hex');
function psql(sql) {
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'crm_local', '-d', database, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    input: sql, encoding: 'utf8', maxBuffer: 24 * 1024 * 1024, timeout: 180_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Local SQL rolled back/failed: ${result.stderr.trim()}`);
  const lines = result.stdout.trim().split(/\r?\n/).filter(line => line.startsWith('{'));
  if (lines.length !== 1) throw new Error(`Unexpected SQL response (${lines.length} JSON records).`);
  return JSON.parse(lines[0]);
}
const health = await fetch('http://127.0.0.1:8787/health', { signal: AbortSignal.timeout(5000) }).then(response => {
  if (!response.ok) throw new Error(`Local API health ${response.status}`);
  return response.json();
});
if (health.ok !== true || health.database !== 'crm_local' || health.backend !== 'local-postgresql') throw new Error('Local API health does not identify crm_local/local-postgresql.');
const inspect = spawnSync('docker', ['inspect', '--format', '{{.Name}}|{{.Config.Image}}|{{.State.Running}}', container], { encoding: 'utf8', timeout: 10_000 });
if (inspect.status !== 0 || !/^\/crm-joliefam-local-postgres\|postgres:16-alpine\|true\s*$/.test(inspect.stdout)) throw new Error('Unexpected local PostgreSQL container identity.');

// Match both code AND exact known demo name. Count/UUID checks below reject any
// changed roster, unknown prefix/name, or additional account-linked candidate.
const classify = `CASE
 WHEN id=${quote(realId)}::uuid AND employee_code='NV-ONL' AND display_name='Nguyễn Đức Phước' THEN 'REAL_PROTECTED'
 WHEN id=${quote(keepId)}::uuid AND employee_code='DEMO-LOCAL' AND display_name='Nhân viên Demo Local' THEN 'DEMO_KEEP'
 WHEN id='bf248e25-32ef-450a-bc14-7ca847e93b01' AND employee_code='DAY-001' AND display_name='Nguyễn Thị Mai' THEN 'SEED'
 WHEN id='2eebc2f8-bf25-4698-b87e-80a4721665b9' AND employee_code='HOUR-001' AND display_name='Trần Văn Nam' THEN 'SEED'
 WHEN id='e10e8258-ca18-4475-abab-ea5f792851ac' AND employee_code='PIECE-001' AND display_name='Lê Thị Hoa' THEN 'SEED_LINKED_ARCHIVE_ONLY'
 WHEN id='6d7e8328-ac83-4519-b2ec-21015160870b' AND employee_code='DEMO-20260914' AND display_name='Nhân viên Demo' THEN 'LEGACY_DEMO'
 WHEN employee_code ~ '^HARDEN-[A-F0-9]+$' AND display_name='Hardening Smoke' THEN 'HARDEN_SCRIPT'
 WHEN employee_code ~ '^PAYTEST-ADJUSTMENT(-[0-9]{14})?$' AND display_name='Payroll Test - Adjustment' THEN 'PAYTEST_SCRIPT'
 WHEN employee_code='PAYTEST-BUNDLE' AND display_name='Payroll Test - Atomic Bundle' THEN 'PAYTEST_SCRIPT'
 WHEN employee_code='PAYTEST-BUNDLE-CONFLICT' AND display_name='Payroll Test - Bundle Conflict Owner' THEN 'PAYTEST_SCRIPT'
 WHEN employee_code='PAYTEST-DAY' AND display_name='Payroll Test - Day' THEN 'PAYTEST_SCRIPT'
 WHEN employee_code='PAYTEST-HOUR' AND display_name='Payroll Test - Hour' THEN 'PAYTEST_SCRIPT'
 WHEN employee_code='PAYTEST-INSURANCE' AND display_name='Payroll Test - Insurance' THEN 'PAYTEST_SCRIPT'
 WHEN employee_code='PAYTEST-PIECE' AND display_name='Payroll Test - Piece' THEN 'PAYTEST_SCRIPT'
 WHEN employee_code='PAYTEST-PROFILE' AND display_name='Payroll Test - Central Profile' THEN 'PAYTEST_SCRIPT'
 ELSE 'UNEXPECTED' END`;

const snapshotSql = `
CREATE TEMP TABLE cleanup_workers ON COMMIT DROP AS
 SELECT id,employee_code,display_name,user_id,${classify} classification,md5(to_jsonb(w)::text) row_hash FROM public.local_workers w;
CREATE TEMP TABLE cleanup_worker_baseline ON COMMIT DROP AS SELECT id,to_jsonb(w) document FROM local_workers w;
DO $$ BEGIN
 IF current_user <> 'crm_local' OR current_database() <> ${quote(database)} THEN RAISE EXCEPTION 'Wrong local database identity'; END IF;
 IF EXISTS(SELECT 1 FROM local_payroll_audit_events WHERE entity_type='local-demo-cleanup' AND action='DEMO_CLEANUP' AND actor_id=${quote(actor)}) THEN RAISE EXCEPTION 'Cleanup already applied; inspect durable audit rather than rerun'; END IF;
 IF (SELECT count(*) FROM cleanup_workers) <> 43 OR EXISTS(SELECT 1 FROM cleanup_workers WHERE classification='UNEXPECTED')
 OR (SELECT count(*) FROM cleanup_workers WHERE classification='HARDEN_SCRIPT')<>25
 OR (SELECT count(*) FROM cleanup_workers WHERE classification='PAYTEST_SCRIPT')<>12
 OR (SELECT count(*) FROM cleanup_workers WHERE classification='REAL_PROTECTED')<>1
 OR (SELECT count(*) FROM cleanup_workers WHERE classification='DEMO_KEEP')<>1 THEN RAISE EXCEPTION 'Unexpected worker roster/classification'; END IF;
 IF EXISTS(SELECT 1 FROM cleanup_workers WHERE user_id IS NOT NULL AND classification NOT IN ('REAL_PROTECTED','SEED_LINKED_ARCHIVE_ONLY')) THEN RAISE EXCEPTION 'Unexpected account-linked demo'; END IF;
 IF NOT EXISTS(SELECT 1 FROM cleanup_workers WHERE classification='SEED_LINKED_ARCHIVE_ONLY' AND user_id='c2fd5bc9-867e-4b37-98f1-4c07081f073b') THEN RAISE EXCEPTION 'Linked seed account changed'; END IF;
END $$;
CREATE TEMP TABLE cleanup_sources(table_name text,id uuid,worker_id uuid,work_date date,row_hash text,document jsonb,primary key(table_name,id)) ON COMMIT DROP;
${sourceTables.map(table => `INSERT INTO cleanup_sources SELECT ${quote(table)},s.id,s.worker_id,s.work_date,md5(to_jsonb(s)::text),to_jsonb(s) FROM public.${table} s JOIN cleanup_workers w ON w.id=s.worker_id WHERE w.classification<>'REAL_PROTECTED';`).join('\n')}
CREATE TEMP TABLE cleanup_all_source_baseline(table_name text,id uuid,row_hash text,primary key(table_name,id)) ON COMMIT DROP;
${sourceTables.map(table => `INSERT INTO cleanup_all_source_baseline SELECT ${quote(table)},id,md5(to_jsonb(s)::text) FROM public.${table} s;`).join('\n')}
CREATE TEMP TABLE cleanup_revision_baseline ON COMMIT DROP AS SELECT worker_id,work_date,revision FROM local_attendance_day_revisions;
CREATE TEMP TABLE cleanup_audit_baseline ON COMMIT DROP AS SELECT id,md5(to_jsonb(a)::text) row_hash FROM local_payroll_audit_events a;
CREATE TEMP TABLE cleanup_protection(table_name text,id uuid,reason text,primary key(table_name,id,reason)) ON COMMIT DROP;
INSERT INTO cleanup_protection SELECT table_name,id,'retained-demo-nonseed-fact' FROM cleanup_sources
 WHERE worker_id=${quote(keepId)}::uuid AND coalesce(document->>'idempotency_key','') NOT IN ('seed-day-status-001','seed-entry-rejected-001') ON CONFLICT DO NOTHING;
INSERT INTO cleanup_protection
 SELECT s.table_name,s.id,'locked-or-closed-payroll-period:'||p.id FROM cleanup_sources s JOIN local_payroll_periods p ON s.work_date BETWEEN p.period_start AND p.period_end
 WHERE p.status='CLOSED' OR EXISTS(SELECT 1 FROM local_payroll_runs r WHERE r.period_id=p.id AND r.status='LOCKED') ON CONFLICT DO NOTHING;
INSERT INTO cleanup_protection
 SELECT table_name,id,'source-linked-to-production' FROM cleanup_sources WHERE
 document->>'source_stage_event_id' IS NOT NULL OR document->>'production_order_id' IS NOT NULL OR document->>'production_order_operation_id' IS NOT NULL ON CONFLICT DO NOTHING;
-- Scan every retained public table, including payroll JSON, audit, workflow,
-- import receipts, dispatch, and source snapshots. No dynamic values are emitted.
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LOOP
   EXECUTE format('WITH docs AS MATERIALIZED(SELECT to_jsonb(x)::text doc,to_jsonb(x)->>''id'' rowid FROM public.%I x), refs AS MATERIALIZED(SELECT rowid,(regexp_matches(doc,''([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'',''gi''))[1] refid FROM docs) INSERT INTO cleanup_protection SELECT DISTINCT s.table_name,s.id,%L FROM refs r JOIN cleanup_sources s ON s.id::text=lower(r.refid) WHERE NOT(s.table_name=%L AND r.rowid=s.id::text) ON CONFLICT DO NOTHING',t.tablename,'retained-reference:'||t.tablename,t.tablename);
 END LOOP;
END $$;
-- A retained confirmation is a promise about the entire worker/day source cut.
INSERT INTO cleanup_protection SELECT s.table_name,s.id,'retained-day-confirmation:'||c.id FROM cleanup_sources s
 JOIN local_day_closures c ON c.worker_id=s.worker_id AND c.work_date=s.work_date
 WHERE c.status='LEADER_CONFIRMED' AND EXISTS(SELECT 1 FROM cleanup_protection p WHERE p.table_name='local_day_closures' AND p.id=c.id) ON CONFLICT DO NOTHING;
-- Day receipts/bulk workflow may describe a day without repeating source IDs.
INSERT INTO cleanup_protection SELECT s.table_name,s.id,'retained-day-workflow-receipt' FROM cleanup_sources s WHERE
 EXISTS(SELECT 1 FROM local_attendance_day_action_receipts r WHERE strpos(to_jsonb(r)::text,s.worker_id::text)>0 AND strpos(to_jsonb(r)::text,s.work_date::text)>0)
 OR EXISTS(SELECT 1 FROM local_attendance_bulk_workflow_requests r WHERE strpos(to_jsonb(r)::text,s.worker_id::text)>0 AND strpos(to_jsonb(r)::text,s.work_date::text)>0)
 ON CONFLICT DO NOTHING;
CREATE TEMP TABLE cleanup_digests(table_name text primary key,row_count bigint,table_hash text) ON COMMIT DROP;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LOOP
 EXECUTE format('INSERT INTO cleanup_digests SELECT %L,count(*),md5(coalesce(string_agg(h,'''' ORDER BY h),'''')) FROM (SELECT md5(to_jsonb(x)::text) h FROM public.%I x) a',t.tablename,t.tablename);
 END LOOP;
END $$;
CREATE TEMP TABLE cleanup_plan ON COMMIT DROP AS SELECT jsonb_build_object(
 'version',1,'scope','local attendance/payroll operational demos only','database',current_database(),'container',${quote(container)},
 'keep_worker_id',${quote(keepId)},'real_worker_id',${quote(realId)},'actor',${quote(actor)},
 'schema_hash',(SELECT md5(string_agg(v,E'\\n' ORDER BY v)) FROM (
   SELECT concat_ws('|',table_name,column_name,data_type,is_nullable,column_default) v FROM information_schema.columns WHERE table_schema='public'
   UNION ALL SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)
   UNION ALL SELECT pg_get_constraintdef(oid)||conrelid::regclass::text FROM pg_constraint WHERE connamespace='public'::regnamespace
   UNION ALL SELECT pg_get_functiondef(oid) FROM pg_proc WHERE pronamespace='public'::regnamespace AND prokind IN('f','p')) schema_parts),
 'workers',(SELECT jsonb_agg(to_jsonb(w) ORDER BY employee_code) FROM cleanup_workers w),
 'sources',(SELECT coalesce(jsonb_agg(jsonb_build_object('table_name',s.table_name,'id',s.id,'worker_id',s.worker_id,'work_date',s.work_date,'row_hash',s.row_hash,
 'action',CASE WHEN EXISTS(SELECT 1 FROM cleanup_protection p WHERE p.table_name=s.table_name AND p.id=s.id) THEN 'PRESERVE' ELSE 'DELETE' END,
 'reasons',(SELECT coalesce(jsonb_agg(reason ORDER BY reason),'[]'::jsonb) FROM cleanup_protection p WHERE p.table_name=s.table_name AND p.id=s.id)) ORDER BY s.table_name,s.id),'[]'::jsonb) FROM cleanup_sources s),
 'table_digests',(SELECT jsonb_agg(to_jsonb(d) ORDER BY table_name) FROM cleanup_digests d)
 ) plan;
`;

// Session locks must precede BEGIN: a SELECT waiting on an xact lock inside a
// REPEATABLE READ transaction can freeze a snapshot from BEFORE the wait.
// Sync uses this lock order too (sync then source); connection exit releases
// both session locks even when ON_ERROR_STOP aborts the script.
const beginSql = `SET application_name='local-attendance-demo-cleanup'; SET statement_timeout='120s'; SET lock_timeout='10s';
SELECT pg_advisory_lock(hashtextextended('production-source-sync',0));
SELECT pg_advisory_lock(hashtextextended('local-attendance-payroll-source-guard',0));
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL statement_timeout='120s'; SET LOCAL lock_timeout='10s'; SET LOCAL idle_in_transaction_session_timeout='120s';
`;

let approved;
let approvedSha;
if (apply) {
  const raw = readFileSync(manifestPath, 'utf8');
  approvedSha = sha256(raw);
  if (option('--approve-sha256') !== approvedSha) throw new Error('Explicit approval SHA256 does not match manifest.');
  approved = JSON.parse(raw);
  if (approved.database !== database) {
    // Exact named backup clone may rehearse a crm_local plan; nothing else can.
    if (!(database === 'demo_cleanup_qa_20261019' && approved.database === 'crm_local')) throw new Error('Manifest database mismatch.');
  }
  if (existsSync(path.join(outputDir, `${database}-cleanup-result.json`))) throw new Error('Result already exists; inspect it before another application.');
}

const actionSql = !apply ? 'SELECT plan FROM cleanup_plan; ROLLBACK;' : `
CREATE TEMP TABLE cleanup_approved ON COMMIT DROP AS SELECT ${quote(JSON.stringify(approved))}::jsonb plan;
DO $$ DECLARE actual jsonb; expected jsonb; BEGIN
 SELECT plan INTO actual FROM cleanup_plan; SELECT plan INTO expected FROM cleanup_approved;
 -- Session/other external state may advance after preview. Every worker/source,
 -- protection decision, and schema must still match the reviewed manifest.
 IF (actual - ARRAY['database','table_digests']) IS DISTINCT FROM (expected - ARRAY['database','table_digests','evidence']) THEN RAISE EXCEPTION 'Reviewed manifest is stale; generate and review a new plan'; END IF;
END $$;
CREATE TEMP TABLE cleanup_deleted(table_name text,id uuid,worker_id uuid,work_date date,row_hash text) ON COMMIT DROP;
DO $$ DECLARE t text; expected_count bigint; actual_count bigint; BEGIN
 FOREACH t IN ARRAY ARRAY['local_day_closures','local_day_statuses','local_overtime','local_production_entries','local_attendance'] LOOP
  SELECT count(*) INTO expected_count FROM cleanup_sources s WHERE table_name=t AND NOT EXISTS(SELECT 1 FROM cleanup_protection p WHERE p.table_name=s.table_name AND p.id=s.id);
  EXECUTE format('WITH removed AS(DELETE FROM public.%I x USING cleanup_sources s WHERE s.table_name=%L AND x.id=s.id AND md5(to_jsonb(x)::text)=s.row_hash AND NOT EXISTS(SELECT 1 FROM cleanup_protection p WHERE p.table_name=s.table_name AND p.id=s.id) RETURNING x.id) INSERT INTO cleanup_deleted SELECT s.table_name,s.id,s.worker_id,s.work_date,s.row_hash FROM cleanup_sources s JOIN removed r ON r.id=s.id WHERE s.table_name=%L',t,t,t);
  GET DIAGNOSTICS actual_count=ROW_COUNT;
  IF actual_count<>expected_count THEN RAISE EXCEPTION 'Delete count mismatch for %: expected %, actual %',t,expected_count,actual_count; END IF;
 END LOOP;
END $$;
CREATE TEMP TABLE cleanup_archived ON COMMIT DROP AS
 WITH changed AS(UPDATE local_workers w SET is_active=false,payroll_status='SUSPENDED',local_modified_at=now()
 FROM cleanup_workers c WHERE w.id=c.id AND c.classification NOT IN('REAL_PROTECTED','DEMO_KEEP') AND md5(to_jsonb(w)::text)=c.row_hash RETURNING w.id)
 SELECT c.* FROM cleanup_workers c JOIN changed x ON x.id=c.id;
DO $$ BEGIN IF (SELECT count(*) FROM cleanup_archived)<>41 THEN RAISE EXCEPTION 'Archive count must be exactly 41'; END IF; END $$;
-- A row-level audit records original UUID/hash plus the number of removed facts.
INSERT INTO local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id)
 SELECT 'worker',w.id,'DEMO_ARCHIVE',jsonb_build_object('reason','User requested one local attendance/payroll demo; preserve all financial/workflow history and account links',
 'manifest_sha256',${quote(approvedSha)},'original_row_md5',w.row_hash,'classification',w.classification,
 'deleted_source_count',(SELECT count(*) FROM cleanup_deleted d WHERE d.worker_id=w.id))::text,${quote(actor)} FROM cleanup_archived w;
INSERT INTO local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id)
 VALUES('local-demo-cleanup',${quote(keepId)},'DEMO_CLEANUP',jsonb_build_object('manifest_sha256',${quote(approvedSha)},'archived_workers',41,
 'deleted_sources',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY table_name,id),'[]'::jsonb) FROM cleanup_deleted d),
 'reason','User-requested local cleanup; retained one demo, all immutable/mixed payroll snapshots, audit, receipts, imports, configurations, accounts and production history')::text,${quote(actor)});
-- Compare every public non-target table in the SAME transaction snapshot.
-- The only expected trigger side effect is target worker/day revision increments.
CREATE TEMP TABLE cleanup_after_digests(LIKE cleanup_digests INCLUDING ALL) ON COMMIT DROP;
DO $$ DECLARE t record; actual_count bigint; expected_count bigint; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LOOP
 EXECUTE format('INSERT INTO cleanup_after_digests SELECT %L,count(*),md5(coalesce(string_agg(h,'''' ORDER BY h),'''')) FROM (SELECT md5(to_jsonb(x)::text) h FROM public.%I x) a',t.tablename,t.tablename);
 END LOOP;
 IF EXISTS(SELECT 1 FROM cleanup_digests b FULL JOIN cleanup_after_digests a USING(table_name)
 WHERE coalesce(b.table_name,a.table_name)<>ALL(ARRAY['local_workers','local_attendance','local_overtime','local_day_statuses','local_day_closures','local_production_entries','local_attendance_day_revisions','local_payroll_audit_events'])
 AND (b.row_count,b.table_hash) IS DISTINCT FROM(a.row_count,a.table_hash)) THEN RAISE EXCEPTION 'Protected full-table digest changed'; END IF;
 IF EXISTS(SELECT 1 FROM local_workers w JOIN cleanup_workers c ON c.id=w.id WHERE c.classification IN('REAL_PROTECTED','DEMO_KEEP') AND md5(to_jsonb(w)::text)<>c.row_hash) THEN RAISE EXCEPTION 'Protected worker changed'; END IF;
 IF (SELECT count(*) FROM local_workers)<>43 OR EXISTS(SELECT 1 FROM local_workers w JOIN cleanup_archived c ON c.id=w.id
 WHERE w.is_active OR w.payroll_status<>'SUSPENDED' OR w.local_modified_at IS NULL
 OR (to_jsonb(w)-ARRAY['is_active','payroll_status','local_modified_at']) IS DISTINCT FROM
 (SELECT document-ARRAY['is_active','payroll_status','local_modified_at'] FROM cleanup_worker_baseline b WHERE b.id=w.id)) THEN RAISE EXCEPTION 'Unexpected worker mutation'; END IF;
 -- Source tables: every surviving row must be byte-identical, including NV-ONL.
 FOR t IN SELECT unnest(ARRAY['local_attendance','local_overtime','local_day_statuses','local_day_closures','local_production_entries']) tablename LOOP
  EXECUTE format('SELECT count(*) FROM public.%I x LEFT JOIN cleanup_all_source_baseline b ON b.table_name=%L AND b.id=x.id WHERE b.id IS NULL OR b.row_hash<>md5(to_jsonb(x)::text)',t.tablename,t.tablename) INTO actual_count;
  IF actual_count<>0 THEN RAISE EXCEPTION 'Surviving source changed: %',t.tablename; END IF;
  EXECUTE format('SELECT count(*) FROM public.%I',t.tablename) INTO actual_count;
  SELECT count(*) INTO expected_count FROM cleanup_all_source_baseline b WHERE b.table_name=t.tablename AND NOT EXISTS(SELECT 1 FROM cleanup_deleted d WHERE d.table_name=b.table_name AND d.id=b.id);
  IF actual_count<>expected_count THEN RAISE EXCEPTION 'Source total mismatch: %',t.tablename; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM cleanup_revision_baseline b FULL JOIN local_attendance_day_revisions a USING(worker_id,work_date)
 WHERE a.revision IS DISTINCT FROM (coalesce(b.revision,0)+(SELECT count(*) FROM cleanup_deleted d
 WHERE d.worker_id=coalesce(b.worker_id,a.worker_id) AND d.work_date=coalesce(b.work_date,a.work_date) AND d.table_name<>'local_day_closures')))
 OR EXISTS(SELECT 1 FROM cleanup_deleted d WHERE d.table_name<>'local_day_closures' AND NOT EXISTS(SELECT 1 FROM local_attendance_day_revisions a WHERE a.worker_id=d.worker_id AND a.work_date=d.work_date))
 THEN RAISE EXCEPTION 'Day revision delta did not exactly match deleted source facts'; END IF;
 IF EXISTS(SELECT 1 FROM cleanup_audit_baseline b LEFT JOIN local_payroll_audit_events a USING(id) WHERE a.id IS NULL OR b.row_hash<>md5(to_jsonb(a)::text))
 OR (SELECT count(*) FROM local_payroll_audit_events)<>(SELECT count(*)+42 FROM cleanup_audit_baseline) THEN RAISE EXCEPTION 'Audit history changed or unexpected append count'; END IF;
 IF EXISTS(SELECT 1 FROM cleanup_sources s JOIN cleanup_protection p USING(table_name,id) WHERE NOT EXISTS(
 SELECT 1 FROM local_attendance x WHERE s.table_name='local_attendance' AND x.id=s.id AND md5(to_jsonb(x)::text)=s.row_hash
 UNION ALL SELECT 1 FROM local_overtime x WHERE s.table_name='local_overtime' AND x.id=s.id AND md5(to_jsonb(x)::text)=s.row_hash
 UNION ALL SELECT 1 FROM local_day_statuses x WHERE s.table_name='local_day_statuses' AND x.id=s.id AND md5(to_jsonb(x)::text)=s.row_hash
 UNION ALL SELECT 1 FROM local_day_closures x WHERE s.table_name='local_day_closures' AND x.id=s.id AND md5(to_jsonb(x)::text)=s.row_hash
 UNION ALL SELECT 1 FROM local_production_entries x WHERE s.table_name='local_production_entries' AND x.id=s.id AND md5(to_jsonb(x)::text)=s.row_hash)) THEN RAISE EXCEPTION 'Protected source fact changed'; END IF;
END $$;
SELECT jsonb_build_object('applied',true,'database',current_database(),'approved_manifest_sha256',${quote(approvedSha)},
 'archived_workers',(SELECT count(*) FROM cleanup_archived),'deleted_sources',(SELECT jsonb_agg(to_jsonb(d) ORDER BY table_name,id) FROM cleanup_deleted d),
 'before_table_digests',(SELECT jsonb_agg(to_jsonb(d) ORDER BY table_name) FROM cleanup_digests d),
 'after_table_digests',(SELECT jsonb_agg(to_jsonb(d) ORDER BY table_name) FROM cleanup_after_digests d));
COMMIT;`;

const result = psql(beginSql + snapshotSql + actionSql);
mkdirSync(outputDir, { recursive: true });
if (apply) {
  const resultPath = path.join(outputDir, `${database}-cleanup-result.json`);
  writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ applied: true, database, archived_workers: result.archived_workers, deleted_source_count: result.deleted_sources?.length ?? 0, result_path: resultPath }, null, 2));
} else {
  const plan = { ...result, evidence: {
    seed: 'server/db/seed.sql:3-6 (exact seed codes/names)',
    harden: 'scripts/test-local-attendance-hardening.ps1:74 (HARDEN token + Hardening Smoke)',
    paytest: 'scripts/test-local-payroll-engine.ps1:71-73,148; test-local-payroll-adjustments.ps1:22,43; test-local-worker-payroll-bundle.ps1:35,70; test-local-worker-payroll-profile.ps1:57',
    legacy: 'docs/current-project-debt-audit-2026-10-11.md:60; docs/payroll-production-review-fixes-2026-10-10.md:70',
    account_exception: 'PIECE-001 archived in place only; retain exact user_id and every account/production row',
  } };
  // Evidence is review metadata and is intentionally outside DB comparisons.
  const raw = JSON.stringify(plan, null, 2) + '\n';
  writeFileSync(manifestPath, raw);
  const counts = {};
  for (const source of plan.sources) (counts[source.table_name] ??= { DELETE: 0, PRESERVE: 0 })[source.action]++;
  console.log(JSON.stringify({ mode: 'DRY_RUN_ROLLED_BACK', database, archive_workers: 41, keep_worker_id: keepId, real_worker_id: realId,
    source_counts: counts, manifest_path: manifestPath, manifest_sha256: sha256(raw),
    setup: 'No location/calendar/attendance/payrun changes. Prepare retained demo through normal UI after cleanup.' }, null, 2));
}
