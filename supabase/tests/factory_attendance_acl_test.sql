\set ON_ERROR_STOP on

DO $$
DECLARE
  v_function text;
  v_anon boolean;
  v_authenticated boolean;
BEGIN
  FOR v_function, v_anon, v_authenticated IN
    SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
           has_function_privilege('anon', p.oid, 'EXECUTE'),
           has_function_privilege('authenticated', p.oid, 'EXECUTE')
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'record_factory_attendance', 'record_factory_hour_attendance',
        'reverse_factory_attendance', 'list_factory_attendance_month',
        'list_factory_attendance_month_v2', 'list_factory_attendance_month_v3',
        'record_factory_overtime', 'set_factory_attendance_status',
        'set_factory_attendance_day_status', 'set_factory_attendance_day_closure',
        'set_factory_overtime_status', 'list_factory_attendance_closures',
        'list_factory_overtime_month', 'list_factory_attendance_workers',
        'list_factory_attendance_day_status_month', 'list_worker_attendance_methods',
        'factory_attendance_worker_in_scope'
      )
  LOOP
    IF v_anon THEN
      RAISE EXCEPTION 'Anonymous execute privilege remains on %', v_function;
    END IF;
    IF NOT v_authenticated THEN
      RAISE EXCEPTION 'Authenticated execute privilege missing on %', v_function;
    END IF;
  END LOOP;
END $$;

-- Behavioural scope test.  The privilege check above proves that the public
-- surface is reachable only by authenticated users; this fixture proves the
-- row-level worker boundary behind each read/write RPC as well.
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('81000000-0000-0000-0000-000000000001', 'attendance.acl.admin@test.local'),
  ('81000000-0000-0000-0000-000000000002', 'attendance.acl.operator@test.local'),
  ('81000000-0000-0000-0000-000000000003', 'attendance.acl.team-leader@test.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role, assigned_by) VALUES
  ('81000000-0000-0000-0000-000000000001', 'admin', NULL),
  ('81000000-0000-0000-0000-000000000002', 'employee', '81000000-0000-0000-0000-000000000001'),
  ('81000000-0000-0000-0000-000000000003', 'employee', '81000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
INSERT INTO public.employee_permissions (user_id, permission_type, enabled) VALUES
  ('81000000-0000-0000-0000-000000000002', 'production_view', true),
  ('81000000-0000-0000-0000-000000000002', 'production_operations', true),
  ('81000000-0000-0000-0000-000000000003', 'production_view', true),
  ('81000000-0000-0000-0000-000000000003', 'production_operations', true),
  ('81000000-0000-0000-0000-000000000003', 'production_attendance_approve', true)
ON CONFLICT (user_id, permission_type) DO UPDATE SET enabled = EXCLUDED.enabled;

INSERT INTO public.production_workers (
  id, tenant_id, user_id, employee_code, display_name, worker_type, is_active
) VALUES
  ('84000000-0000-0000-0000-000000000001', 'default',
   '81000000-0000-0000-0000-000000000002', 'ACL-OWN', 'Nhân sự trong phạm vi', 'GENERIC', true),
  ('84000000-0000-0000-0000-000000000002', 'default', NULL,
   'ACL-OUT', 'Nhân sự ngoài phạm vi', 'GENERIC', true),
  ('84000000-0000-0000-0000-000000000003', 'default',
   '81000000-0000-0000-0000-000000000003', 'ACL-LEAD', 'Tổ trưởng kiểm thử', 'SUPERVISOR', true),
  ('84000000-0000-0000-0000-000000000004', 'default', NULL,
   'ACL-TEAM', 'Nhân sự trong tổ', 'GENERIC', true)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.worker_compensation_profiles (tenant_id, worker_id, default_compensation_type)
VALUES
  ('default', '84000000-0000-0000-0000-000000000001', 'HOURLY'),
  ('default', '84000000-0000-0000-0000-000000000002', 'HOURLY'),
  ('default', '84000000-0000-0000-0000-000000000004', 'HOURLY')
ON CONFLICT (tenant_id, worker_id) DO NOTHING;
-- Seed approved compatibility rates as a controlled fixture backfill. The
-- production guard only permits this transition through the rate workflow.
SET LOCAL app.payroll_rate_transition = 'on';
INSERT INTO public.worker_compensation_rates (
  tenant_id, worker_id, compensation_type, effective_from, hourly_rate, unit_basis
) VALUES
  ('default', '84000000-0000-0000-0000-000000000001', 'HOURLY', DATE '2026-01-01', 60000, 'HOUR'),
  ('default', '84000000-0000-0000-0000-000000000002', 'HOURLY', DATE '2026-01-01', 60000, 'HOUR'),
  ('default', '84000000-0000-0000-0000-000000000004', 'HOURLY', DATE '2026-01-01', 60000, 'HOUR');
SET LOCAL app.payroll_rate_transition = 'off';

INSERT INTO public.payroll_team_assignments (
  tenant_id, supervisor_worker_id, worker_id, effective_from, reason, created_by
) VALUES (
  'default', '84000000-0000-0000-0000-000000000003',
  '84000000-0000-0000-0000-000000000004', DATE '2026-01-01',
  'ACL phân công tổ trưởng', '81000000-0000-0000-0000-000000000001'
)
ON CONFLICT DO NOTHING;

-- Seed both sides of the boundary as an administrator.  The operator must
-- later see only the first worker even though both rows share the tenant.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
DO $$
DECLARE
  v_linked jsonb;
  v_outside jsonb;
  v_overtime jsonb;
  v_team_attendance_approve jsonb;
  v_team_attendance_reject jsonb;
  v_team_attendance_outside jsonb;
  v_team_overtime_approve jsonb;
  v_team_overtime_reject jsonb;
  v_team_overtime_outside jsonb;
  v_operator_review jsonb;
BEGIN
  v_linked := public.record_factory_hour_attendance(
    '84000000-0000-0000-0000-000000000001', DATE '2026-08-15',
    TIME '08:00', TIME '12:00', 0, 'ACL trong phạm vi', 'acl-linked-clock', NULL
  );
  v_outside := public.record_factory_hour_attendance(
    '84000000-0000-0000-0000-000000000002', DATE '2026-08-15',
    TIME '13:00', TIME '17:00', 0, 'ACL ngoài phạm vi', 'acl-outside-clock', NULL
  );
  v_overtime := public.record_factory_overtime(
    '84000000-0000-0000-0000-000000000002', DATE '2026-08-15',
    'NORMAL_OVERTIME', 60, 'ACL ngoài phạm vi', 'acl-outside-overtime'
  );
  -- Keep separate SUBMITTED facts for the delegated-reviewer assertions.
  v_team_attendance_approve := public.record_factory_hour_attendance(
    '84000000-0000-0000-0000-000000000004', DATE '2026-08-20',
    TIME '08:00', TIME '12:00', 0, 'ACL tổ trưởng duyệt công',
    'acl-team-attendance-approve', NULL
  );
  v_team_attendance_reject := public.record_factory_hour_attendance(
    '84000000-0000-0000-0000-000000000004', DATE '2026-08-20',
    TIME '13:00', TIME '14:00', 0, 'ACL tổ trưởng từ chối công',
    'acl-team-attendance-reject', NULL
  );
  v_team_attendance_outside := public.record_factory_hour_attendance(
    '84000000-0000-0000-0000-000000000002', DATE '2026-08-20',
    TIME '15:00', TIME '16:00', 0, 'ACL ngoài tổ',
    'acl-team-attendance-outside', NULL
  );
  v_team_overtime_approve := public.record_factory_overtime(
    '84000000-0000-0000-0000-000000000004', DATE '2026-08-20',
    'NORMAL_OVERTIME', 60, 'ACL tổ trưởng duyệt tăng ca',
    'acl-team-overtime-approve'
  );
  v_team_overtime_reject := public.record_factory_overtime(
    '84000000-0000-0000-0000-000000000004', DATE '2026-08-21',
    'NORMAL_OVERTIME', 45, 'ACL tổ trưởng từ chối tăng ca',
    'acl-team-overtime-reject'
  );
  v_team_overtime_outside := public.record_factory_overtime(
    '84000000-0000-0000-0000-000000000002', DATE '2026-08-20',
    'NORMAL_OVERTIME', 30, 'ACL tăng ca ngoài tổ',
    'acl-team-overtime-outside'
  );
  v_operator_review := public.record_factory_hour_attendance(
    '84000000-0000-0000-0000-000000000001', DATE '2026-08-21',
    TIME '08:00', TIME '09:00', 0, 'ACL nhân viên tự ghi',
    'acl-operator-review-row', NULL
  );

  -- Keep only opaque IDs in transaction-local settings. The attendance tables
  -- deliberately do not grant direct SELECT to API roles.
  PERFORM set_config('app.acl_team_attendance_approve_id', v_team_attendance_approve->>'id', true);
  PERFORM set_config('app.acl_team_attendance_reject_id', v_team_attendance_reject->>'id', true);
  PERFORM set_config('app.acl_team_attendance_outside_id', v_team_attendance_outside->>'id', true);
  PERFORM set_config('app.acl_team_overtime_approve_id', v_team_overtime_approve->>'id', true);
  PERFORM set_config('app.acl_team_overtime_reject_id', v_team_overtime_reject->>'id', true);
  PERFORM set_config('app.acl_team_overtime_outside_id', v_team_overtime_outside->>'id', true);
  PERFORM set_config('app.acl_operator_review_id', v_operator_review->>'id', true);
  -- The permission-management RPC must accept the new generic permission.
  PERFORM public.replace_employee_permissions(
    '81000000-0000-0000-0000-000000000003',
    '[
      {"permission_type":"production_view","enabled":true},
      {"permission_type":"production_operations","enabled":true},
      {"permission_type":"production_attendance_approve","enabled":true}
    ]'::jsonb,
    'ACL kiểm tra catalog quyền duyệt chấm công'
  );
  PERFORM public.set_factory_attendance_status(
    (v_linked->>'id')::uuid, 'APPROVED', 'ACL duyệt trong phạm vi', 'acl-linked-approve'
  );
  PERFORM public.set_factory_attendance_status(
    (v_outside->>'id')::uuid, 'APPROVED', 'ACL duyệt ngoài phạm vi', 'acl-outside-approve'
  );
  PERFORM public.set_factory_overtime_status(
    (v_overtime->>'id')::uuid, 'APPROVED', 'ACL duyệt tăng ca', 'acl-outside-overtime-approve'
  );
  PERFORM public.set_factory_attendance_day_status(
    '84000000-0000-0000-0000-000000000001', DATE '2026-08-15',
    'PRESENT', false, 'ACL có mặt', 'acl-linked-day-status'
  );
  PERFORM public.set_factory_attendance_day_status(
    '84000000-0000-0000-0000-000000000002', DATE '2026-08-16',
    'ABSENT', false, 'ACL vắng', 'acl-outside-day-status'
  );
  PERFORM public.set_factory_attendance_day_closure(
    '84000000-0000-0000-0000-000000000002', DATE '2026-08-15',
    'EMPLOYEE_CONFIRMED', NULL, 'acl-outside-close-employee'
  );
  PERFORM public.set_factory_attendance_day_closure(
    '84000000-0000-0000-0000-000000000002', DATE '2026-08-15',
    'LEADER_CONFIRMED', 'ACL chốt ngoài phạm vi', 'acl-outside-close-leader'
  );
END $$;

DO $$
DECLARE
  v_count integer;
  v_row record;
  v_message text;
  v_linked_id uuid := '84000000-0000-0000-0000-000000000001';
  v_outside_id uuid := '84000000-0000-0000-0000-000000000002';
BEGIN
  -- The compatibility RPC must not be able to create an hourly row without
  -- check-in/check-out fields. Hourly attendance goes through time-clock.
  BEGIN
    PERFORM public.record_factory_attendance(
      v_linked_id, 'HOUR', DATE '2026-08-18', NULL, 4, NULL, 8,
      'ACL hourly without clock', 'acl-hour-without-clock', NULL
    );
    RAISE EXCEPTION 'Hourly compatibility RPC accepted a row without clock times';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
    IF v_message = 'Hourly compatibility RPC accepted a row without clock times'
       OR position('giờ đến và giờ về' IN v_message) = 0 THEN
      RAISE;
    END IF;
  END;

  -- Admin has the whole tenant scope.
  SELECT count(*) INTO v_count FROM public.list_factory_attendance_workers();
  IF v_count <> 4 THEN RAISE EXCEPTION 'Admin worker scope expected 4, got %', v_count; END IF;
  SELECT count(*) INTO v_count FROM public.list_worker_attendance_methods();
  IF v_count <> 4 THEN RAISE EXCEPTION 'Admin method scope expected 4, got %', v_count; END IF;

  SELECT count(*) INTO v_count
  FROM public.list_factory_attendance_month_v3(DATE '2026-08-01', true);
  IF v_count < 2 THEN RAISE EXCEPTION 'Admin attendance scope expected both workers, got %', v_count; END IF;
END $$;

-- Delegated team-leader review is narrower than production management.
DO $$
DECLARE
  v_team_attendance_approve uuid;
  v_team_attendance_reject uuid;
  v_outside_attendance uuid;
  v_team_overtime_approve uuid;
  v_team_overtime_reject uuid;
  v_outside_overtime uuid;
  v_result jsonb;
  v_message text;
  v_team_worker uuid := '84000000-0000-0000-0000-000000000004';
  v_outside_worker uuid := '84000000-0000-0000-0000-000000000002';
  v_leader_worker uuid := '84000000-0000-0000-0000-000000000003';
BEGIN
  v_team_attendance_approve := NULLIF(current_setting('app.acl_team_attendance_approve_id', true), '')::uuid;
  v_team_attendance_reject := NULLIF(current_setting('app.acl_team_attendance_reject_id', true), '')::uuid;
  v_outside_attendance := NULLIF(current_setting('app.acl_team_attendance_outside_id', true), '')::uuid;
  v_team_overtime_approve := NULLIF(current_setting('app.acl_team_overtime_approve_id', true), '')::uuid;
  v_team_overtime_reject := NULLIF(current_setting('app.acl_team_overtime_reject_id', true), '')::uuid;
  v_outside_overtime := NULLIF(current_setting('app.acl_team_overtime_outside_id', true), '')::uuid;

  IF v_team_attendance_approve IS NULL OR v_team_attendance_reject IS NULL
     OR v_outside_attendance IS NULL OR v_team_overtime_approve IS NULL
     OR v_team_overtime_reject IS NULL OR v_outside_overtime IS NULL THEN
    RAISE EXCEPTION 'Team approval fixture rows were not created';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000003', true);

  -- The scope helper is private to SECURITY DEFINER workflow functions. The
  -- public approval/rejection calls below prove both the positive assignment
  -- boundary and the negative outside-team boundary without exposing a
  -- cross-worker existence oracle.

  v_result := public.set_factory_attendance_status(
    v_team_attendance_approve, 'APPROVED', 'Tổ trưởng duyệt công', 'acl-team-attendance-approve-event'
  );
  IF v_result->>'status' <> 'APPROVED' THEN
    RAISE EXCEPTION 'Team leader could not approve assigned attendance: %', v_result;
  END IF;

  v_result := public.set_factory_attendance_status(
    v_team_attendance_reject, 'REJECTED', 'Sai dữ liệu sản lượng', 'acl-team-attendance-reject-event'
  );
  IF v_result->>'status' <> 'REJECTED' THEN
    RAISE EXCEPTION 'Team leader could not reject assigned attendance: %', v_result;
  END IF;

  v_result := public.set_factory_overtime_status(
    v_team_overtime_approve, 'APPROVED', 'Tổ trưởng duyệt tăng ca', 'acl-team-overtime-approve-event'
  );
  IF v_result->>'status' <> 'APPROVED' THEN
    RAISE EXCEPTION 'Team leader could not approve assigned overtime: %', v_result;
  END IF;

  v_result := public.set_factory_overtime_status(
    v_team_overtime_reject, 'REJECTED', 'Không đủ căn cứ', 'acl-team-overtime-reject-event'
  );
  IF v_result->>'status' <> 'REJECTED' THEN
    RAISE EXCEPTION 'Team leader could not reject assigned overtime: %', v_result;
  END IF;

  BEGIN
    PERFORM public.set_factory_attendance_status(
      v_outside_attendance, 'APPROVED', 'Duyệt ngoài tổ', 'acl-team-outside-attendance-event'
    );
    RAISE EXCEPTION 'Team leader approved attendance outside assigned team';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
    IF v_message = 'Team leader approved attendance outside assigned team' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.set_factory_overtime_status(
      v_outside_overtime, 'APPROVED', 'Duyệt tăng ca ngoài tổ', 'acl-team-outside-overtime-event'
    );
    RAISE EXCEPTION 'Team leader approved overtime outside assigned team';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
    IF v_message = 'Team leader approved overtime outside assigned team' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.set_factory_attendance_status(
      v_team_attendance_approve, 'LOCKED', 'Tổ trưởng khóa', 'acl-team-lock-event'
    );
    RAISE EXCEPTION 'Team leader locked attendance';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
    IF v_message = 'Team leader locked attendance' THEN RAISE; END IF;
  END;

  -- A team leader may confirm the employee-level day close, but cannot perform
  -- manager closure or reopening.
  PERFORM public.set_factory_attendance_day_closure(
    v_team_worker, DATE '2026-08-20', 'EMPLOYEE_CONFIRMED', NULL, 'acl-team-employee-close'
  );
  BEGIN
    PERFORM public.set_factory_attendance_day_closure(
      v_team_worker, DATE '2026-08-20', 'LEADER_CONFIRMED', 'Tổ trưởng chốt quản lý', 'acl-team-leader-close'
    );
    RAISE EXCEPTION 'Team leader performed manager day closure';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
    IF v_message = 'Team leader performed manager day closure' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.set_factory_attendance_day_closure(
      v_team_worker, DATE '2026-08-20', 'REOPENED', 'Tổ trưởng mở lại', 'acl-team-reopen'
    );
    RAISE EXCEPTION 'Team leader reopened a day';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
    IF v_message = 'Team leader reopened a day' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.reverse_factory_attendance(
      v_team_attendance_approve, 'Tổ trưởng đảo công', 'acl-team-reversal'
    );
    RAISE EXCEPTION 'Team leader reversed attendance';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
    IF v_message = 'Team leader reversed attendance' THEN RAISE; END IF;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
DO $$
DECLARE
  v_count integer;
  v_row record;
  v_result jsonb;
  v_linked_id uuid := '84000000-0000-0000-0000-000000000001';
  v_outside_id uuid := '84000000-0000-0000-0000-000000000002';
  v_own_review_id uuid;
BEGIN
  IF NOT public.factory_attendance_worker_in_scope(v_linked_id, DATE '2026-08-15')
     OR public.factory_attendance_worker_in_scope(v_outside_id, DATE '2026-08-15') THEN
    RAISE EXCEPTION 'Operator worker scope predicate is incorrect';
  END IF;

  SELECT count(*) INTO v_count FROM public.list_factory_attendance_workers();
  IF v_count <> 1 THEN RAISE EXCEPTION 'Operator worker list expected 1, got %', v_count; END IF;
  SELECT id INTO v_row FROM public.list_factory_attendance_workers();
  IF v_row.id <> v_linked_id THEN RAISE EXCEPTION 'Operator worker list returned an out-of-scope worker'; END IF;

  SELECT count(*) INTO v_count FROM public.production_workers;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Direct worker RLS expected 1 row, got %', v_count; END IF;
  SELECT count(*) INTO v_count FROM public.list_worker_attendance_methods();
  IF v_count <> 1 THEN RAISE EXCEPTION 'Operator method list expected 1, got %', v_count; END IF;

  SELECT count(*) INTO v_count
  FROM public.list_factory_attendance_month_v3(DATE '2026-08-01', true);
  IF v_count <> 2 THEN RAISE EXCEPTION 'Operator month list expected 2 rows, got %', v_count; END IF;
  SELECT worker_id INTO v_row
  FROM public.list_factory_attendance_month_v3(DATE '2026-08-01', true);
  IF v_row.worker_id <> v_linked_id THEN RAISE EXCEPTION 'Operator month list leaked an out-of-scope worker'; END IF;

  SELECT count(*) INTO v_count
  FROM public.list_factory_attendance_day_status_month(DATE '2026-08-01');
  IF v_count <> 1 THEN RAISE EXCEPTION 'Operator day-status list expected 1 row, got %', v_count; END IF;
  SELECT count(*) INTO v_count
  FROM public.list_factory_attendance_closures(DATE '2026-08-01');
  IF v_count <> 0 THEN RAISE EXCEPTION 'Operator closure list leaked an out-of-scope worker'; END IF;
  SELECT count(*) INTO v_count
  FROM public.list_factory_overtime_month(DATE '2026-08-01');
  IF v_count <> 0 THEN RAISE EXCEPTION 'Operator overtime list leaked an out-of-scope worker'; END IF;

  v_own_review_id := NULLIF(current_setting('app.acl_operator_review_id', true), '')::uuid;
  BEGIN
    PERFORM public.set_factory_attendance_status(
      v_own_review_id, 'APPROVED', 'Nhân viên tự duyệt', 'acl-operator-review-event'
    );
    RAISE EXCEPTION 'Ordinary employee approved own attendance';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Ordinary employee approved own attendance' THEN RAISE; END IF;
  END;

  -- Every write path must fail closed before its private implementation can
  -- inspect or mutate another worker's record.
  BEGIN
    PERFORM public.record_factory_attendance(
      v_outside_id, 'HOUR', DATE '2026-08-17', NULL, 1, NULL, 8,
      'ACL ghi ngoài phạm vi', 'acl-outside-write', NULL
    );
    RAISE EXCEPTION 'Operator recorded attendance outside scope';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Operator recorded attendance outside scope' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_factory_hour_attendance(
      v_outside_id, DATE '2026-08-17', TIME '08:00', TIME '09:00', 0,
      'ACL ghi giờ ngoài phạm vi', 'acl-outside-hour-write', NULL
    );
    RAISE EXCEPTION 'Operator recorded time-clock outside scope';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Operator recorded time-clock outside scope' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_factory_overtime(
      v_outside_id, DATE '2026-08-17', 'NORMAL_OVERTIME', 60,
      'ACL tăng ca ngoài phạm vi', 'acl-outside-overtime-write'
    );
    RAISE EXCEPTION 'Operator recorded overtime outside scope';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Operator recorded overtime outside scope' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.set_factory_attendance_day_status(
      v_outside_id, DATE '2026-08-17', 'ABSENT', false,
      'ACL trạng thái ngoài phạm vi', 'acl-outside-day-write'
    );
    RAISE EXCEPTION 'Operator changed day status outside scope';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Operator changed day status outside scope' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.set_factory_attendance_day_closure(
      v_outside_id, DATE '2026-08-15', 'EMPLOYEE_CONFIRMED', NULL,
      'acl-outside-closure-write'
    );
    RAISE EXCEPTION 'Operator closed day outside scope';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Operator closed day outside scope' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.set_factory_attendance_status(
      (current_setting('app.acl_team_attendance_outside_id', true))::uuid,
      'SUBMITTED', 'ACL gửi lại ngoài phạm vi', 'acl-outside-resubmit'
    );
    RAISE EXCEPTION 'Operator changed attendance workflow outside scope';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Operator changed attendance workflow outside scope' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.set_factory_overtime_status(
      (current_setting('app.acl_team_overtime_outside_id', true))::uuid,
      'SUBMITTED', 'ACL gửi lại tăng ca ngoài phạm vi', 'acl-outside-overtime-resubmit'
    );
    RAISE EXCEPTION 'Operator changed overtime workflow outside scope';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Operator changed overtime workflow outside scope' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.reverse_factory_attendance(
      (current_setting('app.acl_team_attendance_outside_id', true))::uuid,
      'ACL đảo ngoài phạm vi', 'acl-outside-reversal'
    );
    RAISE EXCEPTION 'Operator reversed attendance outside scope';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Operator reversed attendance outside scope' THEN RAISE; END IF;
  END;

  -- The linked worker remains usable for the operator's own submission path.
  v_result := public.record_factory_hour_attendance(
    v_linked_id, DATE '2026-08-17', TIME '08:00', TIME '09:00', 0,
    'ACL ghi trong phạm vi', 'acl-linked-write', NULL
  );
  IF (v_result->>'id') IS NULL OR (v_result->>'reused')::boolean THEN
    RAISE EXCEPTION 'Operator could not create an in-scope attendance row: %', v_result;
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
DO $$
DECLARE
  v_attendance_id uuid;
  v_result jsonb;
BEGIN
  v_attendance_id := NULLIF(current_setting('app.acl_team_attendance_approve_id', true), '')::uuid;

  -- Manager capabilities remain intact: close, lock, reopen, and reverse are
  -- still available to the admin after a delegated reviewer approved a row.
  PERFORM public.set_factory_attendance_day_closure(
    '84000000-0000-0000-0000-000000000004', DATE '2026-08-20',
    'LEADER_CONFIRMED', 'Admin chốt ngày kiểm thử', 'acl-admin-leader-close'
  );
  v_result := public.set_factory_attendance_status(
    v_attendance_id, 'LOCKED', 'Admin khóa công kiểm thử', 'acl-admin-lock'
  );
  IF v_result->>'status' <> 'LOCKED' THEN
    RAISE EXCEPTION 'Admin could not lock attendance: %', v_result;
  END IF;
  PERFORM public.set_factory_attendance_day_closure(
    '84000000-0000-0000-0000-000000000004', DATE '2026-08-20',
    'REOPENED', 'Admin mở lại để điều chỉnh', 'acl-admin-reopen'
  );
  v_result := public.reverse_factory_attendance(
    v_attendance_id, 'Admin đảo bản ghi kiểm thử', 'acl-admin-reversal'
  );
  IF v_result->>'attendance_record_id' IS NULL THEN
    RAISE EXCEPTION 'Admin could not reverse attendance: %', v_result;
  END IF;
END $$;

-- Internal workflow implementations must stay inaccessible to API roles.
DO $$
DECLARE
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.set_factory_attendance_status_team_base(uuid,text,text,text)',
    'public.set_factory_overtime_status_team_base(uuid,text,text,text)',
    'public.set_factory_attendance_status_review_base(uuid,text,text,text)',
    'public.set_factory_overtime_status_review_base(uuid,text,text,text)',
    'public.factory_attendance_can_review_worker(uuid,date)'
  ] LOOP
    IF to_regprocedure(v_signature) IS NOT NULL
       AND has_function_privilege('authenticated', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'Internal attendance function remains executable: %', v_signature;
    END IF;
  END LOOP;
END $$;

RESET ROLE;
ROLLBACK;

SELECT 'factory_attendance_acl_test: PASS';
