-- READ-ONLY per-version evidence queries. Run the labeled section after that
-- single approved version. Do not add CALL, DDL, INSERT, UPDATE, or DELETE.

-- 01 20260829170000_factory_attendance_time_clock.sql
SELECT '01 time_clock' AS check_name, attname, atttypid::regtype FROM pg_attribute
WHERE attrelid='public.factory_attendance_records'::regclass
  AND attname IN ('check_in_time','check_out_time','break_minutes') AND NOT attisdropped;
-- 02 20260906090000_payroll_master_data_foundation.sql
SELECT '02 payroll_foundation' AS check_name, c.relname, c.relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('worker_compensation_assignments','payroll_policy_groups','bank_accounts');
-- 03 20260906100000_payroll_master_data_security_workflow_hardening.sql
SELECT '03 payroll_security' AS check_name, p.proname, has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='has_payroll_permission';
-- 04 20260906110000_payroll_master_data_completion.sql
SELECT '04 payroll_completion' AS check_name, conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.worker_compensation_rates'::regclass AND conname='worker_compensation_rates_status_check';
-- 05 20260906120000_payroll_master_data_immutability_and_audit.sql
SELECT '05 payroll_immutability' AS check_name, c.relname AS index_name, t.tgname AS trigger_name
FROM pg_class c FULL JOIN pg_trigger t ON t.tgrelid='public.worker_compensation_rates'::regclass AND t.tgname='worker_compensation_rates_immutable'
WHERE c.relname='worker_compensation_rates_single_draft_idx' OR t.tgname IS NOT NULL;
-- 06 20260907100000_factory_attendance_workflow.sql
SELECT '06 attendance_workflow' AS check_name, c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('factory_attendance_workflow_events','factory_overtime_records');
-- 07 20260907120000_factory_attendance_concurrency_hardening.sql
SELECT '07 concurrency' AS check_name, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('record_factory_attendance','reverse_factory_attendance');
-- 08 20260907130000_factory_attendance_day_status.sql
SELECT '08 day_status' AS check_name, c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='factory_attendance_day_status_events';
-- 09 20260907140000_factory_attendance_invariant_guards.sql
SELECT '09 invariant_guards' AS check_name, tgname FROM pg_trigger
WHERE tgrelid='public.factory_attendance_records'::regclass AND NOT tgisinternal;
-- 10 20260907150000_factory_attendance_status_consistency.sql
SELECT '10 status_consistency' AS check_name, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='factory_attendance_fact_is_active';
-- 11 20260907160000_factory_attendance_rejected_fact_closure_hardening.sql
SELECT '11 rejected_closure' AS check_name, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='set_factory_attendance_day_closure';
-- 12 20260907170000_factory_attendance_acl_hardening.sql
SELECT '12 acl' AS check_name, p.proname, has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='record_factory_hour_attendance';
-- 13 20260907180000_factory_attendance_scope_hardening.sql
SELECT '13 scope' AS check_name, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='factory_attendance_worker_in_scope';
-- 14 20260907190000_factory_attendance_scope_completion.sql
SELECT '14 scope_completion' AS check_name, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='list_factory_attendance_day_status_month';
-- 15 20260907200000_factory_attendance_hour_entry_guard.sql
SELECT '15 hour_guard' AS check_name, conname FROM pg_constraint
WHERE conrelid='public.factory_attendance_records'::regclass AND conname='factory_attendance_time_clock_check';
-- 16 20260907210000_factory_attendance_team_approval.sql
SELECT '16 team_approval' AS check_name, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='factory_attendance_can_review_worker';
-- 17 20260907220000_factory_attendance_rate_resolution_boundary.sql
SELECT '17 resolver_boundary' AS check_name, has_function_privilege('authenticated','public.resolve_worker_compensation_rate(uuid,text,date)','EXECUTE') AS authenticated_execute,
       has_function_privilege('anon','public.resolve_worker_compensation_rate(uuid,text,date)','EXECUTE') AS anon_execute;
