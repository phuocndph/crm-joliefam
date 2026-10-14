-- READ-ONLY post-chain smoke. Run with an approved operator connection.
WITH required_rpc(signature) AS (
  VALUES
    ('public.record_factory_attendance(uuid,text,date,numeric,numeric,numeric,numeric,text,text,text)'::text),
    ('public.record_factory_hour_attendance(uuid,date,time without time zone,time without time zone,integer,text,text,text)'::text),
    ('public.reverse_factory_attendance(uuid,text,text)'::text),
    ('public.set_factory_attendance_status(uuid,text,text,text)'::text),
    ('public.record_factory_overtime(uuid,date,text,integer,text,text)'::text),
    ('public.set_factory_overtime_status(uuid,text,text,text)'::text),
    ('public.set_factory_attendance_day_status(uuid,date,text,boolean,text,text)'::text),
    ('public.set_factory_attendance_day_closure(uuid,date,text,text,text)'::text)
), required_table(table_name) AS (
  VALUES
    ('factory_attendance_records'::text), ('factory_overtime_records'::text),
    ('factory_attendance_workflow_events'::text), ('factory_attendance_day_status_events'::text),
    ('worker_compensation_rates'::text), ('worker_compensation_assignments'::text)
), required_policy(table_name, policy_name) AS (
  VALUES
    ('payroll_policy_groups'::text, 'payroll_policy_groups_select'::text),
    ('worker_compensation_assignments', 'worker_compensation_assignments_select'),
    ('product_piece_rate_versions', 'product_piece_rate_versions_select'),
    ('employee_social_insurance_versions', 'employee_social_insurance_versions_select'),
    ('bank_accounts', 'bank_accounts_select'),
    ('payroll_team_assignments', 'payroll_team_assignments_select')
), checks AS (
  SELECT 'RLS: ' || r.table_name AS check_name,
         true AS expected,
         COALESCE(c.relrowsecurity, false) AS actual
  FROM required_table r
  LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || r.table_name)
  UNION ALL
  SELECT 'RPC authenticated-only: ' || r.signature,
         true,
         p.oid IS NOT NULL
           AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
           AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
  FROM required_rpc r
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(r.signature)
  UNION ALL
  SELECT 'Private resolver exists', true,
         to_regprocedure('public.resolve_worker_compensation_rate(uuid,text,date)') IS NOT NULL
  UNION ALL
  SELECT 'Private resolver ACL', false,
         COALESCE(
           has_function_privilege(
             'authenticated', to_regprocedure('public.resolve_worker_compensation_rate(uuid,text,date)'), 'EXECUTE'
           ) OR has_function_privilege(
             'anon', to_regprocedure('public.resolve_worker_compensation_rate(uuid,text,date)'), 'EXECUTE'
           ),
           true
         )
  UNION ALL
  SELECT 'Immutable rate trigger', true,
         EXISTS (
           SELECT 1 FROM pg_trigger
           WHERE tgrelid = 'public.worker_compensation_rates'::regclass
             AND tgname = 'worker_compensation_rates_immutable'
             AND NOT tgisinternal
         )
  UNION ALL
  SELECT 'Single draft index', true,
         EXISTS (
           SELECT 1 FROM pg_index i
           JOIN pg_class c ON c.oid = i.indexrelid
           WHERE i.indrelid = 'public.worker_compensation_rates'::regclass
             AND c.relname = 'worker_compensation_rates_single_draft_idx'
             AND i.indpred IS NOT NULL
         )
  UNION ALL
  SELECT 'RLS policy: ' || r.policy_name, true,
         EXISTS (
           SELECT 1 FROM pg_policies p
           WHERE p.schemaname = 'public'
             AND p.tablename = r.table_name
             AND p.policyname = r.policy_name
         )
  FROM required_policy r
  UNION ALL
  SELECT 'Payroll team assignment SELECT grant', true,
         EXISTS (
           SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
           WHERE c.oid = 'public.payroll_team_assignments'::regclass
             AND pg_get_userbyid(a.grantee) = 'authenticated' AND a.privilege_type = 'SELECT'
         ) AND NOT EXISTS (
           SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
           WHERE c.oid = 'public.payroll_team_assignments'::regclass
             AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) = 'anon') AND a.privilege_type = 'SELECT'
         )
  UNION ALL
  SELECT 'RPC-only payroll tables', false,
         EXISTS (
           SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
           WHERE c.oid = table_name::regclass
             AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated'))
             AND a.privilege_type = 'SELECT'
         )
  FROM unnest(ARRAY[
    'public.payroll_policy_groups', 'public.worker_compensation_assignments',
    'public.product_piece_rate_versions', 'public.employee_social_insurance_versions',
    'public.bank_accounts'
  ]) AS table_name
), results AS (
  SELECT check_name, expected, actual,
         CASE WHEN expected = actual THEN 'OK' ELSE 'FAIL' END AS status
  FROM checks
)
SELECT check_name, expected::text, actual::text, status
FROM results
UNION ALL
SELECT 'FINAL',
       'OK only when every required check is OK',
       CASE WHEN count(*) > 0 AND bool_and(status = 'OK') THEN 'OK' ELSE 'FAIL' END::text,
       CASE WHEN count(*) > 0 AND bool_and(status = 'OK') THEN 'OK' ELSE 'FAIL' END::text
FROM results
ORDER BY check_name;
