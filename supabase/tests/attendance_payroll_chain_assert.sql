\set ON_ERROR_STOP on

-- Catalog-only end-state assertion. Behavioural tenant/scope proof remains in
-- factory_attendance_acl_test.sql because it requires controlled fixture rows.
DO $$
DECLARE
  v_table text;
  v_oid oid;
  v_signature text;
  v_expected text[] := ARRAY[
    'factory_attendance_records', 'factory_attendance_reversals',
    'factory_attendance_workflow_events', 'factory_attendance_daily_closure_events',
    'factory_overtime_records', 'factory_overtime_workflow_events',
    'factory_attendance_day_status_events', 'worker_compensation_profiles',
    'worker_compensation_rates', 'worker_compensation_assignments',
    'payroll_policy_groups', 'payroll_team_assignments', 'product_piece_rate_versions',
    'employee_social_insurance_versions', 'bank_accounts'
  ];
  v_required_functions text[] := ARRAY[
    'public.record_factory_attendance(uuid,text,date,numeric,numeric,numeric,numeric,text,text,text)',
    'public.record_factory_hour_attendance(uuid,date,time without time zone,time without time zone,integer,text,text,text)',
    'public.reverse_factory_attendance(uuid,text,text)',
    'public.set_factory_attendance_status(uuid,text,text,text)',
    'public.record_factory_overtime(uuid,date,text,integer,text,text)',
    'public.set_factory_overtime_status(uuid,text,text,text)',
    'public.set_factory_attendance_day_status(uuid,date,text,boolean,text,text)',
    'public.set_factory_attendance_day_closure(uuid,date,text,text,text)'
  ];
  v_expected_policies text[] := ARRAY[
    'payroll_policy_groups_select', 'worker_compensation_assignments_select',
    'product_piece_rate_versions_select', 'employee_social_insurance_versions_select',
    'bank_accounts_select', 'payroll_team_assignments_select'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_expected LOOP
    v_oid := to_regclass('public.' || v_table);
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Required table is missing: public.%', v_table; END IF;
    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = v_oid) THEN
      RAISE EXCEPTION 'RLS is not enabled on public.%', v_table;
    END IF;
  END LOOP;

  FOREACH v_signature IN ARRAY v_required_functions LOOP
    IF to_regprocedure(v_signature) IS NULL
       OR NOT has_function_privilege('authenticated', v_signature, 'EXECUTE')
       OR has_function_privilege('anon', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'Authenticated-only RPC contract missing: %', v_signature;
    END IF;
  END LOOP;

  FOREACH v_signature IN ARRAY v_expected_policies LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND policyname = v_signature
    ) THEN
      RAISE EXCEPTION 'Expected RLS policy is missing: %', v_signature;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE c.oid IN (
      'public.payroll_policy_groups'::regclass,
      'public.worker_compensation_assignments'::regclass,
      'public.product_piece_rate_versions'::regclass,
      'public.employee_social_insurance_versions'::regclass,
      'public.bank_accounts'::regclass
    )
      AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated'))
      AND a.privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Protected payroll tables expose direct SELECT privileges';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
       WHERE c.oid = 'public.payroll_team_assignments'::regclass
         AND pg_get_userbyid(a.grantee) = 'authenticated' AND a.privilege_type = 'SELECT'
     ) OR EXISTS (
       SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
       WHERE c.oid = 'public.payroll_team_assignments'::regclass
         AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) = 'anon') AND a.privilege_type = 'SELECT'
     ) THEN
    RAISE EXCEPTION 'Payroll team assignment direct grant contract is missing';
  END IF;

  IF to_regprocedure('public.resolve_worker_compensation_rate(uuid,text,date)') IS NULL
     OR has_function_privilege('authenticated', 'public.resolve_worker_compensation_rate(uuid,text,date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.resolve_worker_compensation_rate(uuid,text,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Private worker compensation resolver is executable by API roles';
  END IF;
  FOREACH v_signature IN ARRAY ARRAY[
    'public.factory_attendance_can_review_worker(uuid,date)',
    'public.set_factory_attendance_status_team_base(uuid,text,text,text)',
    'public.set_factory_overtime_status_team_base(uuid,text,text,text)',
    'public.set_factory_attendance_status_review_base(uuid,text,text,text)',
    'public.set_factory_overtime_status_review_base(uuid,text,text,text)'
  ] LOOP
    IF to_regprocedure(v_signature) IS NOT NULL
       AND (has_function_privilege('authenticated', v_signature, 'EXECUTE')
            OR has_function_privilege('anon', v_signature, 'EXECUTE')) THEN
      RAISE EXCEPTION 'Private attendance implementation is executable by an API role: %', v_signature;
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY['check_in_time','check_out_time','break_minutes'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.factory_attendance_records'::regclass
      AND attname=v_table AND NOT attisdropped) THEN RAISE EXCEPTION 'Time-clock column missing: %', v_table; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.worker_compensation_rates'::regclass
    AND conname='worker_compensation_rates_status_check') THEN RAISE EXCEPTION 'Worker compensation status constraint missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.worker_compensation_rates'::regclass
    AND tgname='worker_compensation_rates_immutable' AND NOT tgisinternal) THEN RAISE EXCEPTION 'Rate immutability trigger missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
    WHERE i.indrelid='public.worker_compensation_rates'::regclass AND c.relname='worker_compensation_rates_single_draft_idx'
      AND i.indpred IS NOT NULL) THEN RAISE EXCEPTION 'Partial single-draft index missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.audit_events'::regclass AND conname='audit_events_action_check'
    AND pg_get_constraintdef(oid) LIKE '%CREATE_DRAFT%') THEN RAISE EXCEPTION 'Audit action vocabulary is incomplete'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='has_payroll_permission'
      AND pg_get_functiondef(p.oid) LIKE '%payroll_rate_manage%') THEN RAISE EXCEPTION 'payroll_rate_manage capability is missing'; END IF;
END $$;

SELECT 'attendance_payroll_chain_assert: PASS' AS result;
