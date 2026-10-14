-- READ-ONLY PREFLIGHT. Replace only the quoted placeholders in an interactive,
-- read-only session. Do not add credentials here. Do not run DDL or mutation.
-- Target project/database: <operator supplies approved connection interactively>
-- Expected remote-only blocker: 20260810030914 (identify before approval).

SELECT current_database() AS database_name, current_user AS connected_role,
       current_setting('server_version') AS server_version;

SELECT version, name, executed_at
FROM supabase_migrations.schema_migrations
ORDER BY version;

WITH expected(version) AS (VALUES
  ('20260829170000'), ('20260906090000'), ('20260906100000'),
  ('20260906110000'), ('20260906120000'), ('20260907100000'),
  ('20260907120000'), ('20260907130000'), ('20260907140000'),
  ('20260907150000'), ('20260907160000'), ('20260907170000'),
  ('20260907180000'), ('20260907190000'), ('20260907200000'),
  ('20260907210000'), ('20260907220000')
)
SELECT e.version, CASE WHEN m.version IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS status
FROM expected e LEFT JOIN supabase_migrations.schema_migrations m USING (version)
ORDER BY e.version;

SELECT version, name AS remote_only_name
FROM supabase_migrations.schema_migrations
WHERE version = '20260810030914';

SELECT n.nspname AS schema_name, c.relname AS relation_name,
       c.relkind, c.relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('factory_attendance_records','factory_overtime_records',
                    'worker_compensation_rates','worker_compensation_assignments')
ORDER BY c.relname;

SELECT c.relname AS relation_name, x.indexrelid::regclass AS index_name,
       pg_get_expr(x.indpred, x.indrelid) AS predicate
FROM pg_index x JOIN pg_class c ON c.oid = x.indrelid
WHERE c.relname IN ('worker_compensation_rates','factory_attendance_records');
