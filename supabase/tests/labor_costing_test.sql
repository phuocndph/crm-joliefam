\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('80000000-0000-0000-0000-000000000001', 'labor.admin@test.local'),
  ('80000000-0000-0000-0000-000000000002', 'labor.operator@test.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role, assigned_by)
VALUES
  ('80000000-0000-0000-0000-000000000001', 'admin', NULL),
  ('80000000-0000-0000-0000-000000000002', 'employee', '80000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
INSERT INTO public.employee_permissions (user_id, permission_type, enabled) VALUES
  ('80000000-0000-0000-0000-000000000002', 'production_view', true),
  ('80000000-0000-0000-0000-000000000002', 'production_operations', true)
ON CONFLICT (user_id, permission_type) DO UPDATE SET enabled = EXCLUDED.enabled;

INSERT INTO public.production_workers (id, tenant_id, employee_code, display_name, worker_type)
VALUES
  ('83000000-0000-0000-0000-000000000001', 'default', 'LAB-001', 'Cong nhan gio', 'GENERIC'),
  ('83000000-0000-0000-0000-000000000002', 'default', 'LAB-002', 'Tho may', 'SEWER'),
  ('83000000-0000-0000-0000-000000000003', 'default', 'LAB-003', 'Tho phu', 'HELPER')
ON CONFLICT (id) DO NOTHING;
-- The operator fixture is linked to exactly one worker. This mirrors the
-- production scope rule used by the attendance RPCs and lets the test prove
-- that the operator can submit only their own record.
UPDATE public.production_workers
SET user_id = '80000000-0000-0000-0000-000000000002'
WHERE id = '83000000-0000-0000-0000-000000000001';
INSERT INTO public.worker_compensation_profiles (worker_id, tenant_id, default_compensation_type)
VALUES
  ('83000000-0000-0000-0000-000000000001', 'default', 'HOURLY'),
  ('83000000-0000-0000-0000-000000000002', 'default', 'PIECE_RATE')
ON CONFLICT (tenant_id, worker_id) DO NOTHING;

-- Use the supported rate workflow so this fixture remains valid after approved
-- compensation history becomes immutable. The admin role is also the same
-- authenticated context used by the attendance RPCs below.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', true);
SELECT public.configure_worker_attendance_method(
  '83000000-0000-0000-0000-000000000001', 'HOUR', 60000,
  DATE '2026-01-01', NULL, 26, 8, 'Labor fixture hourly rate', false
);
SELECT public.configure_worker_attendance_method(
  '83000000-0000-0000-0000-000000000002', 'OUTPUT', 2500,
  DATE '2026-01-01', NULL, 26, 8, 'Labor fixture piece rate', false
);
SELECT public.configure_worker_attendance_method(
  '83000000-0000-0000-0000-000000000003', 'DAY', 10400000,
  DATE '2025-01-01', NULL, 26, 8, 'Labor fixture helper rate', false
);

SELECT set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', true);

DO $$
DECLARE
  v_po uuid;
  v_op uuid;
  v_result jsonb;
BEGIN
  SELECT id INTO v_po FROM public.production_orders WHERE status IN ('RELEASED', 'IN_PROGRESS') ORDER BY created_at DESC LIMIT 1;
  SELECT id INTO v_op FROM public.production_order_operations WHERE production_order_id = v_po ORDER BY sequence LIMIT 1;
  IF v_po IS NULL OR v_op IS NULL THEN RAISE EXCEPTION 'Production fixture missing'; END IF;
  v_result := public.record_production_attendance(v_op, '83000000-0000-0000-0000-000000000001', 'HOUR', DATE '2026-06-01', NULL, 1.5, NULL, 8, 'labor-test-hourly-' || v_po::text, NULL);
  IF ((v_result->'entry'->>'calculated_amount')::numeric) <> 90000 THEN RAISE EXCEPTION 'Hourly formula failed: %', v_result; END IF;
  IF NOT ((public.record_production_attendance(v_op, '83000000-0000-0000-0000-000000000001', 'HOUR', DATE '2026-06-01', NULL, 1.5, NULL, 8, 'labor-test-hourly-' || v_po::text, NULL)->>'reused')::boolean) THEN RAISE EXCEPTION 'Idempotent retry failed'; END IF;
  v_result := public.record_production_attendance(v_op, '83000000-0000-0000-0000-000000000002', 'OUTPUT', DATE '2026-06-01', NULL, NULL, 80, 8, 'labor-test-piece-' || v_po::text, NULL);
  IF ((v_result->'entry'->>'calculated_amount')::numeric) <> 200000 THEN RAISE EXCEPTION 'Piece-rate formula failed: %', v_result; END IF;
  IF (SELECT count(*) FROM public.labor_cost_entries WHERE production_order_id = v_po) <> 2 THEN RAISE EXCEPTION 'Unexpected labor entry count'; END IF;
  v_result := public.calculate_production_order_labor_cost(v_po);
  IF (v_result->>'total_labor_cost')::numeric <> 290000 THEN RAISE EXCEPTION 'Total labor cost failed: %', v_result; END IF;
END $$;

-- Factory attendance is independent from production orders and still reuses the
-- effective-dated worker compensation source of truth.
DO $$
DECLARE
  v_result jsonb;
  v_record uuid;
  v_hour_record uuid;
  v_clock_record uuid;
  v_before integer;
  v_after integer;
BEGIN
  v_result := public.record_factory_attendance(
    '83000000-0000-0000-0000-000000000003', 'DAY', DATE '2026-06-10',
    1, NULL, NULL, 8, 'Phụ việc xưởng', 'factory-day-independent', 'Không gắn lệnh'
  );
  IF (v_result->>'calculated_amount')::numeric <> 400000 THEN
    RAISE EXCEPTION 'Independent daily attendance formula failed: %', v_result;
  END IF;

  -- The compatibility RPC must not create an hourly row without an auditable
  -- check-in/check-out pair. Hourly attendance uses the time-clock RPC below.
  BEGIN
    PERFORM public.record_factory_attendance(
      '83000000-0000-0000-0000-000000000001', 'HOUR', DATE '2026-06-10',
      NULL, 2, NULL, 8, 'Dọn kho thiếu giờ', 'factory-hour-without-clock', NULL
    );
    RAISE EXCEPTION 'Hourly compatibility RPC accepted a row without clock times';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Hourly compatibility RPC accepted a row without clock times'
       OR position('giờ đến và giờ về' IN SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  v_result := public.record_factory_hour_attendance(
    '83000000-0000-0000-0000-000000000001', DATE '2026-06-10',
    TIME '08:00', TIME '10:00', 0, 'Dọn kho', 'factory-hour-independent', NULL
  );
  IF (v_result->>'calculated_amount')::numeric <> 120000 THEN
    RAISE EXCEPTION 'Independent hourly attendance formula failed: %', v_result;
  END IF;
  v_hour_record := (v_result->>'id')::uuid;
  v_result := public.record_factory_hour_attendance(
    '83000000-0000-0000-0000-000000000001', DATE '2026-06-11',
    TIME '08:00', TIME '17:00', 60, 'Kiểm kho', 'factory-hour-clock', NULL
  );
  IF (v_result->>'calculated_amount')::numeric <> 480000
     OR (v_result->>'attendance_value')::numeric <> 8 THEN
    RAISE EXCEPTION 'Time-clock attendance formula failed: %', v_result;
  END IF;
  v_clock_record := (v_result->>'id')::uuid;
  IF NOT ((public.record_factory_hour_attendance(
    '83000000-0000-0000-0000-000000000001', DATE '2026-06-11',
    TIME '08:00', TIME '17:00', 60, 'Kiểm kho', 'factory-hour-clock', NULL
  )->>'reused')::boolean) THEN
    RAISE EXCEPTION 'Time-clock attendance idempotent retry failed';
  END IF;
  v_result := public.record_factory_attendance(
    '83000000-0000-0000-0000-000000000002', 'OUTPUT', DATE '2026-06-10',
    NULL, NULL, 40, 8, 'May vỏ gối 50x70', 'factory-output-independent', NULL
  );
  IF (v_result->>'calculated_amount')::numeric <> 100000 THEN
    RAISE EXCEPTION 'Independent output attendance formula failed: %', v_result;
  END IF;
  IF (SELECT count(*) FROM public.list_factory_attendance_month_v2(DATE '2026-06-01', true) WHERE source_type='FACTORY') <> 4 THEN
    RAISE EXCEPTION 'Factory month list did not return independent attendance';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.list_factory_attendance_month_v2(DATE '2026-06-01', true)
    WHERE id = v_clock_record AND check_in_time = TIME '08:00'
      AND check_out_time = TIME '17:00' AND break_minutes = 60 AND work_hours = 8
  ) THEN
    RAISE EXCEPTION 'Factory month list did not return time-clock details';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.list_factory_attendance_month(DATE '2026-06-01', true) WHERE source_type='PRODUCTION_LEGACY') THEN
    RAISE EXCEPTION 'Factory month list did not preserve production attendance history';
  END IF;
  IF NOT ((public.record_factory_attendance(
    '83000000-0000-0000-0000-000000000002', 'OUTPUT', DATE '2026-06-10',
    NULL, NULL, 40, 8, 'May vỏ gối 50x70', 'factory-output-independent', NULL
  )->>'reused')::boolean) THEN
    RAISE EXCEPTION 'Factory attendance idempotent retry failed';
  END IF;

  BEGIN
    PERFORM public.record_factory_attendance(
      '83000000-0000-0000-0000-000000000003', 'DAY', DATE '2026-06-10',
      1, NULL, NULL, 7, 'Phụ việc xưởng', 'factory-day-independent', 'Không gắn lệnh'
    );
    RAISE EXCEPTION 'Day attendance accepted a changed standard-hours payload';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Day attendance accepted a changed standard-hours payload' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.record_factory_attendance(
      '83000000-0000-0000-0000-000000000002', 'OUTPUT', DATE '2026-06-11',
      NULL, NULL, 1, 8, NULL, 'factory-output-missing-activity', NULL
    );
    RAISE EXCEPTION 'Output attendance without activity was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Output attendance without activity was accepted' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.record_factory_hour_attendance(
      '83000000-0000-0000-0000-000000000001', DATE '2026-06-12',
      TIME '17:00', TIME '08:00', 0, NULL, 'factory-clock-invalid-order', NULL
    );
    RAISE EXCEPTION 'Time-clock attendance accepted invalid time order';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Time-clock attendance accepted invalid time order' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.record_factory_hour_attendance(
      '83000000-0000-0000-0000-000000000001', DATE '2026-06-12',
      TIME '08:00', TIME '09:00', 60, NULL, 'factory-clock-invalid-break', NULL
    );
    RAISE EXCEPTION 'Time-clock attendance accepted an excessive break';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Time-clock attendance accepted an excessive break' THEN RAISE; END IF;
  END;

  SELECT count(*) INTO v_before FROM public.list_factory_attendance_month(DATE '2026-06-01', false);
  v_record := v_hour_record;
  PERFORM public.reverse_factory_attendance(v_record, 'Điều chỉnh thử', 'factory-reversal-independent');
  SELECT count(*) INTO v_after FROM public.list_factory_attendance_month(DATE '2026-06-01', false);
  IF v_after <> v_before - 1 THEN RAISE EXCEPTION 'Factory attendance reversal did not leave the active month view'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.list_factory_attendance_month(DATE '2026-06-01', true) WHERE id=v_record AND is_reversed) THEN
    RAISE EXCEPTION 'Reversed factory attendance was not retained in history';
  END IF;
END $$;

-- Rejected attendance is retained as audit history but must not reserve a
-- clock interval or consume the daily hour cap. A corrected record can use the
-- same interval with a new idempotency key.
DO $$
DECLARE
  v_rejected jsonb;
  v_corrected jsonb;
  v_cap_record jsonb;
BEGIN
  v_rejected := public.record_factory_hour_attendance(
    '83000000-0000-0000-0000-000000000001', DATE '2026-06-19',
    TIME '08:00', TIME '17:00', 60, 'Ca bị từ chối', 'rejected-clock-source', NULL
  );
  PERFORM public.set_factory_attendance_status(
    (v_rejected->>'id')::uuid, 'REJECTED', 'Sai giờ vào/ra', 'rejected-clock-status'
  );
  v_corrected := public.record_factory_hour_attendance(
    '83000000-0000-0000-0000-000000000001', DATE '2026-06-19',
    TIME '08:00', TIME '17:00', 30, 'Ca sửa lại', 'rejected-clock-corrected', NULL
  );
  IF (v_corrected->>'reused')::boolean OR (v_corrected->>'attendance_value')::numeric <> 8.5 THEN
    RAISE EXCEPTION 'Rejected clock row still blocked corrected interval: %', v_corrected;
  END IF;

  v_cap_record := public.record_factory_hour_attendance(
    '83000000-0000-0000-0000-000000000001', DATE '2026-06-20',
    TIME '00:00', TIME '20:00', 0, 'Bản ghi bị từ chối không tính cap', 'rejected-cap-source', NULL
  );
  PERFORM public.set_factory_attendance_status(
    (v_cap_record->>'id')::uuid, 'REJECTED', 'Dữ liệu thử', 'rejected-cap-status'
  );
  v_cap_record := public.record_factory_hour_attendance(
    '83000000-0000-0000-0000-000000000001', DATE '2026-06-20',
    TIME '00:00', TIME '20:00', 0, 'Bản ghi thay thế sau từ chối', 'rejected-cap-corrected', NULL
  );
  IF (v_cap_record->>'reused')::boolean THEN
    RAISE EXCEPTION 'Corrected cap record unexpectedly reused';
  END IF;

  v_rejected := public.record_factory_hour_attendance(
    '83000000-0000-0000-0000-000000000001', DATE '2026-06-23',
    TIME '08:00', TIME '10:00', 0, 'Ngày chỉ còn bản ghi từ chối', 'rejected-only-day-source', NULL
  );
  PERFORM public.set_factory_attendance_status(
    (v_rejected->>'id')::uuid, 'REJECTED', 'Không hợp lệ', 'rejected-only-day-status'
  );
  IF (public.set_factory_attendance_day_status(
    '83000000-0000-0000-0000-000000000001', DATE '2026-06-23',
    'ABSENT', false, 'Không đi làm', 'rejected-only-day-absent'
  )->>'status') <> 'ABSENT' THEN
    RAISE EXCEPTION 'Rejected-only attendance blocked day classification';
  END IF;
END $$;

-- Overtime is a work fact: absence/leave/off days reject it, while a holiday
-- day remains eligible for holiday work and later payroll treatment.
DO $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.set_factory_attendance_day_status(
    '83000000-0000-0000-0000-000000000001', DATE '2026-06-21',
    'ABSENT', false, 'Nghỉ', 'overtime-absent-status'
  );
  BEGIN
    PERFORM public.record_factory_overtime(
      '83000000-0000-0000-0000-000000000001', DATE '2026-06-21',
      'NORMAL_OVERTIME', 60, 'Không được ghi tăng ca', 'overtime-absent-rejected'
    );
    RAISE EXCEPTION 'Overtime was accepted on an absent day';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Overtime was accepted on an absent day' THEN RAISE; END IF;
  END;

  PERFORM public.set_factory_attendance_day_status(
    '83000000-0000-0000-0000-000000000001', DATE '2026-06-22',
    'HOLIDAY', false, 'Ngày lễ', 'overtime-holiday-status'
  );
  v_result := public.record_factory_overtime(
    '83000000-0000-0000-0000-000000000001', DATE '2026-06-22',
    'HOLIDAY_OVERTIME', 60, 'Làm ngày lễ', 'overtime-holiday-accepted'
  );
  IF v_result->>'status' <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'Holiday overtime was not accepted: %', v_result;
  END IF;
END $$;

-- Hardening: a reused attendance key must have the same payload.
DO $$
DECLARE
  v_po uuid;
  v_op uuid;
  v_key text;
  v_result jsonb;
BEGIN
  SELECT production_order_id, production_order_operation_id, idempotency_key
  INTO v_po, v_op, v_key
  FROM public.production_operation_labor_facts
  WHERE idempotency_key LIKE 'labor-test-hourly-%'
  ORDER BY created_at DESC
  LIMIT 1;
  BEGIN
    v_result := public.record_production_attendance(v_op, '83000000-0000-0000-0000-000000000001', 'HOUR', DATE '2026-06-01', NULL, 2.5, NULL, 8, v_key, NULL);
    IF (v_result->>'reused')::boolean IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Idempotency retry created a new attendance fact: %', v_result;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Idempotency retry created a new attendance fact:%' THEN RAISE; END IF;
  END;
END $$;

-- Hardening: completed orders reject new attendance, but existing history remains readable.
DO $$
DECLARE
  v_po uuid;
  v_op uuid;
BEGIN
  SELECT id INTO v_po FROM public.production_orders WHERE status = 'COMPLETED' ORDER BY created_at DESC LIMIT 1;
  IF v_po IS NOT NULL THEN
    SELECT id INTO v_op FROM public.production_order_operations WHERE production_order_id = v_po ORDER BY sequence LIMIT 1;
    BEGIN
      PERFORM public.record_production_attendance(v_op, '83000000-0000-0000-0000-000000000001', 'HOUR', CURRENT_DATE, NULL, 1, NULL, 8, 'completed-attendance-' || v_po::text, NULL);
      RAISE EXCEPTION 'Completed attendance was accepted';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = 'Completed attendance was accepted' THEN RAISE; END IF;
    END;
  END IF;
END $$;

-- Hardening: assignment scope and enforcement reject an unassigned worker.
DO $$
DECLARE
  v_po uuid;
  v_op uuid;
  v_assignment jsonb;
BEGIN
  SELECT id INTO v_po FROM public.production_orders WHERE status IN ('RELEASED', 'IN_PROGRESS', 'ON_HOLD') ORDER BY created_at DESC LIMIT 1;
  SELECT id INTO v_op FROM public.production_order_operations WHERE production_order_id = v_po ORDER BY sequence LIMIT 1;
  -- Keep the assignment open so enforcement also works for orders without a
  -- planned start date (those are checked against CURRENT_DATE).
  v_assignment := public.assign_production_order_worker(v_po, '83000000-0000-0000-0000-000000000001', v_op, DATE '2026-06-01', NULL, 'hardening assignment');
  PERFORM public.set_production_order_assignment_enforcement(v_po, true, 'hardening test');
  BEGIN
    PERFORM public.record_production_attendance(v_op, '83000000-0000-0000-0000-000000000002', 'OUTPUT', DATE '2026-06-03', NULL, NULL, 1, 8, 'unassigned-attendance-' || v_po::text, NULL);
    RAISE EXCEPTION 'Unassigned attendance was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Unassigned attendance was accepted' THEN RAISE; END IF;
  END;
  PERFORM public.set_production_order_assignment_enforcement(v_po, false, 'hardening test cleanup');
END $$;

-- Hardening: reversal is append-only and removes the posting from net labor cost.
DO $$
DECLARE
  v_po uuid;
  v_op uuid;
  v_result jsonb;
  v_fact uuid;
  v_before numeric;
  v_after numeric;
BEGIN
  SELECT id INTO v_po FROM public.production_orders WHERE status IN ('RELEASED', 'IN_PROGRESS', 'ON_HOLD') ORDER BY created_at DESC LIMIT 1;
  SELECT id INTO v_op FROM public.production_order_operations WHERE production_order_id = v_po ORDER BY sequence LIMIT 1;
  v_result := public.record_production_attendance(v_op, '83000000-0000-0000-0000-000000000001', 'HOUR', DATE '2026-06-05', NULL, 1, NULL, 8, 'reversal-source-' || v_po::text, NULL);
  v_fact := (v_result->'fact'->>'id')::uuid;
  v_before := (public.calculate_production_order_labor_cost(v_po)->>'total_labor_cost')::numeric;
  PERFORM public.reverse_production_attendance(v_fact, 'Điều chỉnh thử', 'reversal-key-' || v_po::text);
  v_after := (public.calculate_production_order_labor_cost(v_po)->>'total_labor_cost')::numeric;
  IF v_after <> v_before - (v_result->'entry'->>'calculated_amount')::numeric THEN
    RAISE EXCEPTION 'Reversal did not reduce net labor cost: before %, after %', v_before, v_after;
  END IF;
  IF NOT ((public.reverse_production_attendance(v_fact, 'Điều chỉnh thử', 'reversal-key-' || v_po::text)->>'reused')::boolean) THEN
    RAISE EXCEPTION 'Reversal retry was not idempotent';
  END IF;
END $$;

DO $$
DECLARE
  v_po uuid;
  v_op uuid;
  v_result jsonb;
  v_total numeric;
  v_attendance_count integer;
BEGIN
  SELECT id INTO v_po FROM public.production_orders WHERE status IN ('RELEASED', 'IN_PROGRESS') ORDER BY created_at DESC LIMIT 1;
  SELECT id INTO v_op FROM public.production_order_operations WHERE production_order_id = v_po ORDER BY sequence LIMIT 1;

  PERFORM public.configure_worker_attendance_method(
    '83000000-0000-0000-0000-000000000003', 'DAY', 10400000,
    DATE '2026-01-01', NULL, 26, 8, 'Attendance daily test', false
  );
  PERFORM public.configure_worker_attendance_method(
    '83000000-0000-0000-0000-000000000003', 'DAY', 13000000,
    DATE '2026-07-01', NULL, 26, 8, 'Attendance rate rollover test', false
  );
  IF (SELECT effective_to FROM public.worker_compensation_rates WHERE worker_id='83000000-0000-0000-0000-000000000003' AND effective_from=DATE '2026-01-01') <> DATE '2026-06-30' THEN
    RAISE EXCEPTION 'Previous attendance rate was not closed correctly';
  END IF;

  v_result := public.record_production_attendance(
    v_op, '83000000-0000-0000-0000-000000000003', 'DAY', DATE '2026-06-02',
    1, NULL, NULL, 8, 'attendance-day-' || v_po::text, NULL
  );
  IF ((v_result->'entry'->>'calculated_amount')::numeric) <> 400000 THEN
    RAISE EXCEPTION 'Daily attendance formula failed: %', v_result;
  END IF;

  v_result := public.record_production_attendance(
    v_op, '83000000-0000-0000-0000-000000000001', 'HOUR', DATE '2026-06-02',
    NULL, 2, NULL, 8, 'attendance-hour-' || v_po::text, NULL
  );
  IF ((v_result->'entry'->>'calculated_amount')::numeric) <> 120000 THEN
    RAISE EXCEPTION 'Hourly attendance formula failed: %', v_result;
  END IF;

  v_result := public.record_production_attendance(
    v_op, '83000000-0000-0000-0000-000000000002', 'OUTPUT', DATE '2026-06-02',
    NULL, NULL, 40, 8, 'attendance-output-' || v_po::text, NULL
  );
  IF ((v_result->'entry'->>'calculated_amount')::numeric) <> 100000 THEN
    RAISE EXCEPTION 'Output attendance formula failed: %', v_result;
  END IF;

  IF NOT ((public.record_production_attendance(
    v_op, '83000000-0000-0000-0000-000000000002', 'OUTPUT', DATE '2026-06-02',
    NULL, NULL, 40, 8, 'attendance-output-' || v_po::text, NULL
  )->>'reused')::boolean) THEN
    RAISE EXCEPTION 'Attendance idempotent retry failed';
  END IF;

  SELECT count(*) INTO v_attendance_count FROM public.list_production_attendance(v_po);
  IF v_attendance_count <> 5 THEN
    RAISE EXCEPTION 'Attendance list expected 5 rows, got %', v_attendance_count;
  END IF;
  SELECT (public.calculate_production_order_labor_cost(v_po)->>'total_labor_cost')::numeric INTO v_total;
  IF v_total <> 910000 THEN RAISE EXCEPTION 'Attendance total labor cost failed: %', v_total; END IF;

  BEGIN
    PERFORM public.record_production_attendance(
      v_op, '83000000-0000-0000-0000-000000000002', 'HOUR', DATE '2026-06-03',
      NULL, 1, NULL, 8, 'attendance-invalid-' || v_po::text, NULL
    );
    RAISE EXCEPTION 'Incompatible attendance method was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Incompatible attendance method was accepted' THEN RAISE; END IF;
  END;
END $$;

-- Factory attendance workflow is append-only: submit -> approve/reject -> lock,
-- and daily closure prevents late inserts after the leader closes the day.
DO $$
DECLARE
  v_record uuid;
  v_retry jsonb;
  v_row record;
  v_overtime jsonb;
BEGIN
  SELECT id INTO v_record
  FROM public.list_factory_attendance_month_v3(DATE '2026-06-01', true)
  WHERE worker_id = '83000000-0000-0000-0000-000000000003'
    AND work_date = DATE '2026-06-10'
    AND source_type = 'FACTORY'
  ORDER BY created_at
  LIMIT 1;
  IF v_record IS NULL THEN RAISE EXCEPTION 'Workflow fixture attendance missing'; END IF;

  SELECT * INTO v_row
  FROM public.list_factory_attendance_month_v3(DATE '2026-06-01', true)
  WHERE id = v_record;
  IF v_row.workflow_status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'New attendance did not start as SUBMITTED: %', v_row.workflow_status;
  END IF;

  v_retry := public.set_factory_attendance_status(v_record, 'APPROVED', 'Duyệt thử', 'attendance-approve-workflow');
  IF v_retry->>'status' <> 'APPROVED' THEN RAISE EXCEPTION 'Attendance approval failed: %', v_retry; END IF;
  IF NOT ((public.set_factory_attendance_status(v_record, 'APPROVED', 'Duyệt thử', 'attendance-approve-workflow')->>'reused')::boolean) THEN
    RAISE EXCEPTION 'Attendance approval retry was not idempotent';
  END IF;

  PERFORM public.set_factory_attendance_day_closure(
    '83000000-0000-0000-0000-000000000003', DATE '2026-06-10',
    'EMPLOYEE_CONFIRMED', NULL, 'closure-employee-workflow'
  );
  PERFORM public.set_factory_attendance_day_closure(
    '83000000-0000-0000-0000-000000000003', DATE '2026-06-10',
    'LEADER_CONFIRMED', 'Đã đối soát', 'closure-leader-workflow'
  );
  PERFORM public.set_factory_attendance_status(v_record, 'LOCKED', 'Khóa kỳ thử', 'attendance-lock-workflow');
  SELECT * INTO v_row
  FROM public.list_factory_attendance_month_v3(DATE '2026-06-01', true)
  WHERE id = v_record;
  IF v_row.workflow_status <> 'LOCKED' OR v_row.closure_status <> 'LEADER_CONFIRMED' THEN
    RAISE EXCEPTION 'Attendance lock/closure state incorrect: % / %', v_row.workflow_status, v_row.closure_status;
  END IF;

  BEGIN
    PERFORM public.reverse_factory_attendance(v_record, 'Không được sửa sau khi chốt', 'reverse-after-close');
    RAISE EXCEPTION 'Attendance reversal was accepted after leader closure';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Attendance reversal was accepted after leader closure' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.record_factory_attendance(
      '83000000-0000-0000-0000-000000000003', 'DAY', DATE '2026-06-10',
      0.5, NULL, NULL, 8, 'Ghi muộn', 'attendance-after-close', NULL
    );
    RAISE EXCEPTION 'Attendance was accepted after leader closure';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Attendance was accepted after leader closure' THEN RAISE; END IF;
  END;

  v_overtime := public.record_factory_overtime(
    '83000000-0000-0000-0000-000000000003', DATE '2026-06-12',
    'NORMAL_OVERTIME', 90, 'Đơn hàng gấp', 'overtime-workflow'
  );
  IF v_overtime->>'status' <> 'SUBMITTED' THEN RAISE EXCEPTION 'Overtime did not start as SUBMITTED'; END IF;
  PERFORM public.set_factory_overtime_status(
    (v_overtime->>'id')::uuid, 'APPROVED', 'Tổ trưởng duyệt', 'overtime-approve-workflow'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.list_factory_overtime_month(DATE '2026-06-01')
    WHERE id = (v_overtime->>'id')::uuid AND status = 'APPROVED' AND overtime_minutes = 90
  ) THEN RAISE EXCEPTION 'Overtime list/approval failed'; END IF;
  IF NOT ((public.record_factory_overtime(
    '83000000-0000-0000-0000-000000000003', DATE '2026-06-12',
    'NORMAL_OVERTIME', 90, 'Đơn hàng gấp', 'overtime-workflow'
  )->>'reused')::boolean) THEN
    RAISE EXCEPTION 'Overtime duplicate retry was not reused';
  END IF;

  -- A day cannot be closed while overtime for that worker/day is still pending.
  v_overtime := public.record_factory_overtime(
    '83000000-0000-0000-0000-000000000003', DATE '2026-06-13',
    'NORMAL_OVERTIME', 60, 'Kiểm tra chặn chốt ngày', 'overtime-pending-close'
  );
  PERFORM public.set_factory_attendance_day_closure(
    '83000000-0000-0000-0000-000000000003', DATE '2026-06-13',
    'EMPLOYEE_CONFIRMED', NULL, 'closure-pending-overtime-employee'
  );
  BEGIN
    PERFORM public.set_factory_attendance_day_closure(
      '83000000-0000-0000-0000-000000000003', DATE '2026-06-13',
      'LEADER_CONFIRMED', 'Không được chốt khi còn tăng ca chờ duyệt', 'closure-pending-overtime-leader'
    );
    RAISE EXCEPTION 'Leader closure accepted pending overtime';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Leader closure accepted pending overtime' THEN RAISE; END IF;
  END;
  PERFORM public.set_factory_overtime_status(
    (v_overtime->>'id')::uuid, 'APPROVED', 'Đã duyệt tăng ca thử', 'overtime-pending-close-approve'
  );
  PERFORM public.set_factory_attendance_day_closure(
    '83000000-0000-0000-0000-000000000003', DATE '2026-06-13',
    'LEADER_CONFIRMED', 'Đã đối soát tăng ca', 'closure-pending-overtime-leader-approved'
  );
END $$;

-- Explicit day status events keep an empty day auditable without inventing a
-- zero-value attendance fact. Status changes are append-only and respect the
-- same daily closure boundary as attendance records.
DO $$
DECLARE
  v_result jsonb;
  v_row record;
BEGIN
  v_result := public.set_factory_attendance_day_status(
    '83000000-0000-0000-0000-000000000001', DATE '2026-06-15',
    'PRESENT', true, 'Có mặt đủ ca', 'day-status-present'
  );
  IF v_result->>'status' <> 'PRESENT' OR (v_result->>'meal_eligible')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Present day status failed: %', v_result;
  END IF;
  IF NOT ((public.set_factory_attendance_day_status(
    '83000000-0000-0000-0000-000000000001', DATE '2026-06-15',
    'PRESENT', true, 'Có mặt đủ ca', 'day-status-present'
  )->>'reused')::boolean) THEN
    RAISE EXCEPTION 'Day status idempotent retry failed';
  END IF;
  PERFORM public.set_factory_attendance_day_status(
    '83000000-0000-0000-0000-000000000001', DATE '2026-06-15',
    'PAID_LEAVE', false, 'Nghỉ phép đã duyệt', 'day-status-paid-leave'
  );
  SELECT * INTO v_row
  FROM public.list_factory_attendance_day_status_month(DATE '2026-06-01')
  WHERE worker_id = '83000000-0000-0000-0000-000000000001' AND work_date = DATE '2026-06-15';
  IF v_row.status <> 'PAID_LEAVE' OR v_row.meal_eligible OR v_row.reason <> 'Nghỉ phép đã duyệt' THEN
    RAISE EXCEPTION 'Day status append-only replacement failed: %', v_row;
  END IF;

  BEGIN
    PERFORM public.set_factory_attendance_day_status(
      '83000000-0000-0000-0000-000000000001', DATE '2026-06-15',
      'PRESENT', false, 'Đổi payload', 'day-status-present'
    );
    RAISE EXCEPTION 'Day status accepted a changed idempotency payload';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Day status accepted a changed idempotency payload' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.set_factory_attendance_day_status(
      '83000000-0000-0000-0000-000000000001', DATE '2026-06-15',
      'ABSENT', true, 'Không hợp lệ', 'day-status-meal-invalid'
    );
    RAISE EXCEPTION 'Non-present day status accepted meal eligibility';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Non-present day status accepted meal eligibility' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.set_factory_attendance_day_status(
      '83000000-0000-0000-0000-000000000003', DATE '2026-06-10',
      'ABSENT', false, 'Đã có công', 'day-status-active-attendance'
    );
    RAISE EXCEPTION 'Non-present day status coexisted with attendance';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Non-present day status coexisted with attendance' THEN RAISE; END IF;
  END;

  v_result := public.set_factory_attendance_day_status(
    '83000000-0000-0000-0000-000000000003', DATE '2026-06-16',
    'ABSENT', false, 'Nghỉ không báo trước', 'day-status-absent'
  );
  IF v_result->>'status' <> 'ABSENT' THEN RAISE EXCEPTION 'Absent day status failed: %', v_result; END IF;
  SELECT * INTO v_row
  FROM public.list_factory_attendance_day_status_month(DATE '2026-06-01')
  WHERE worker_id = '83000000-0000-0000-0000-000000000003' AND work_date = DATE '2026-06-16';
  IF v_row.status <> 'ABSENT' OR v_row.reason <> 'Nghỉ không báo trước' THEN
    RAISE EXCEPTION 'Day status list failed: %', v_row;
  END IF;

  PERFORM public.set_factory_attendance_day_closure(
    '83000000-0000-0000-0000-000000000003', DATE '2026-06-16',
    'EMPLOYEE_CONFIRMED', NULL, 'day-status-closure-employee'
  );
  PERFORM public.set_factory_attendance_day_closure(
    '83000000-0000-0000-0000-000000000003', DATE '2026-06-16',
    'LEADER_CONFIRMED', 'Đã đối soát trạng thái vắng', 'day-status-closure-leader'
  );
  BEGIN
    PERFORM public.set_factory_attendance_day_status(
      '83000000-0000-0000-0000-000000000003', DATE '2026-06-16',
      'PRESENT', false, 'Sửa sau chốt', 'day-status-after-close'
    );
    RAISE EXCEPTION 'Day status changed after leader closure';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Day status changed after leader closure' THEN RAISE; END IF;
  END;
END $$;

-- Invariant guards: explicit non-working status blocks both independent and
-- legacy/order-linked attendance, while adjacent clock intervals are valid and
-- overlapping intervals are rejected.
DO $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.set_factory_attendance_day_status(
    '83000000-0000-0000-0000-000000000003', DATE '2026-06-17',
    'ABSENT', false, 'Không đi làm', 'day-status-guard-absent'
  );
  BEGIN
    PERFORM public.record_factory_attendance(
      '83000000-0000-0000-0000-000000000003', 'DAY', DATE '2026-06-17',
      1, NULL, NULL, 8, 'Không được ghi sau khi vắng', 'day-status-guard-factory', NULL
    );
    RAISE EXCEPTION 'Factory attendance bypassed non-working day status';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Factory attendance bypassed non-working day status' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.record_production_attendance(
      (SELECT id FROM public.production_order_operations ORDER BY created_at LIMIT 1),
      '83000000-0000-0000-0000-000000000003', 'DAY', DATE '2026-06-17',
      1, NULL, NULL, 8, 'legacy-day-status-guard', NULL
    );
    RAISE EXCEPTION 'Legacy attendance bypassed non-working day status';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Legacy attendance bypassed non-working day status' THEN RAISE; END IF;
  END;

  v_result := public.record_factory_hour_attendance(
    '83000000-0000-0000-0000-000000000001', DATE '2026-06-18',
    TIME '08:00', TIME '12:00', 0, 'Ca sáng', 'clock-adjacent-1', NULL
  );
  v_result := public.record_factory_hour_attendance(
    '83000000-0000-0000-0000-000000000001', DATE '2026-06-18',
    TIME '12:00', TIME '17:00', 0, 'Ca chiều', 'clock-adjacent-2', NULL
  );
  BEGIN
    PERFORM public.record_factory_hour_attendance(
      '83000000-0000-0000-0000-000000000001', DATE '2026-06-18',
      TIME '11:00', TIME '13:00', 0, 'Ca chồng', 'clock-overlap', NULL
    );
    RAISE EXCEPTION 'Overlapping clock interval was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Overlapping clock interval was accepted' THEN RAISE; END IF;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', true);
DO $$
DECLARE
  v_po uuid;
  v_op uuid;
  v_result jsonb;
  v_row record;
BEGIN
  SELECT id INTO v_po FROM public.production_orders WHERE status IN ('RELEASED', 'IN_PROGRESS') ORDER BY created_at DESC LIMIT 1;
  SELECT id INTO v_op FROM public.production_order_operations WHERE production_order_id = v_po ORDER BY sequence LIMIT 1;
  v_result := public.record_production_attendance(
    v_op, '83000000-0000-0000-0000-000000000001', 'HOUR', DATE '2026-06-04',
    NULL, 1, NULL, 8, 'attendance-operator-' || v_po::text, NULL
  );
  IF (v_result->>'cost_visible')::boolean OR v_result ? 'entry' OR v_result ? 'fact' THEN
    RAISE EXCEPTION 'Operator attendance response leaked wage data: %', v_result;
  END IF;
  SELECT * INTO v_row
  FROM public.list_production_attendance(v_po)
  WHERE work_date = DATE '2026-06-04';
  IF v_row.cost_visible OR v_row.calculated_amount IS NOT NULL OR v_row.rate_amount IS NOT NULL THEN
    RAISE EXCEPTION 'Attendance wage leaked to operator';
  END IF;
  SELECT * INTO v_row
  FROM public.list_factory_attendance_month_v2(DATE '2026-06-01', true)
  WHERE source_type = 'FACTORY'
  LIMIT 1;
  IF v_row.cost_visible OR v_row.calculated_amount IS NOT NULL OR v_row.rate_amount IS NOT NULL THEN
    RAISE EXCEPTION 'Factory attendance wage leaked to operator';
  END IF;
  BEGIN
    PERFORM 1 FROM public.factory_attendance_records LIMIT 1;
    RAISE EXCEPTION 'Operator could read private factory attendance rates directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.factory_attendance_day_status_events LIMIT 1;
    RAISE EXCEPTION 'Operator could read day status event table directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.resolve_worker_compensation_rate('83000000-0000-0000-0000-000000000001', 'HOURLY', DATE '2026-06-04');
    RAISE EXCEPTION 'Private rate resolver was callable by operator';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Operators may submit their own operational facts, but cannot approve,
  -- lock or perform the manager-level daily closure.
  v_result := public.record_factory_hour_attendance(
    '83000000-0000-0000-0000-000000000001', DATE '2026-06-14',
    TIME '08:00', TIME '12:00', 0, 'Operator workflow test', 'operator-workflow-fact', NULL
  );
  BEGIN
    PERFORM public.set_factory_attendance_status(
      (v_result->>'id')::uuid, 'APPROVED', 'Operator cannot approve', 'operator-cannot-approve'
    );
    RAISE EXCEPTION 'Operator approved attendance';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Operator approved attendance' THEN RAISE; END IF;
  END;
  PERFORM public.set_factory_attendance_day_closure(
    '83000000-0000-0000-0000-000000000001', DATE '2026-06-14',
    'EMPLOYEE_CONFIRMED', NULL, 'operator-employee-confirm'
  );
  BEGIN
    PERFORM public.set_factory_attendance_day_closure(
      '83000000-0000-0000-0000-000000000001', DATE '2026-06-14',
      'LEADER_CONFIRMED', 'Operator cannot close', 'operator-cannot-leader-close'
    );
    RAISE EXCEPTION 'Operator performed leader closure';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Operator performed leader closure' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.worker_compensation_rates (worker_id, tenant_id, compensation_type, effective_from, hourly_rate, unit_basis)
    VALUES ('83000000-0000-0000-0000-000000000001', 'default', 'HOURLY', DATE '2026-06-01', 65000, 'HOUR');
    RAISE EXCEPTION 'Overlapping worker rate was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Overlapping worker rate was accepted' THEN RAISE; END IF;
  END;
END $$;

SELECT 'labor_costing_test: PASS' AS result;

ROLLBACK;
