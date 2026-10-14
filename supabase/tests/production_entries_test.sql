DO $$
DECLARE
  v_function text;
BEGIN
  FOR v_function IN
    SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'list_production_entry_products', 'record_production_entry',
        'set_production_entry_status', 'reverse_production_entry',
        'list_production_entries_month'
      )
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    RAISE EXCEPTION 'Anonymous execute privilege remains on %', v_function;
  END LOOP;
END $$;

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('91000000-0000-0000-0000-000000000001', 'production.entry.admin@test.local')
ON CONFLICT (id) DO NOTHING;
SELECT set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
INSERT INTO public.user_roles (user_id, role, assigned_by) VALUES
  ('91000000-0000-0000-0000-000000000001', 'admin', NULL)
ON CONFLICT DO NOTHING;
INSERT INTO public.production_workers (
  id, tenant_id, user_id, employee_code, display_name, worker_type, is_active
) VALUES (
  '92000000-0000-0000-0000-000000000001', 'default',
  '91000000-0000-0000-0000-000000000001', 'PE-01', 'Công nhân sản lượng', 'SEWER', true
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, tenant_id, sku, name, in_stock) VALUES
  ('93000000-0000-0000-0000-000000000001', 'default', 'PE-SKU-01', 'Sản phẩm kiểm thử', true),
  ('93000000-0000-0000-0000-000000000002', 'default', 'PE-SKU-02', 'Sản phẩm thiếu giá', true),
  ('93000000-0000-0000-0000-000000000003', 'default', 'PE-DUP', 'Sản phẩm trùng một', true),
  ('93000000-0000-0000-0000-000000000004', 'default', 'PE-DUP', 'Sản phẩm trùng hai', true),
  ('93000000-0000-0000-0000-000000000005', 'default', 'PE-INACTIVE', 'Sản phẩm ngừng sử dụng', false)
ON CONFLICT (id) DO NOTHING;

SET LOCAL app.payroll_master_transition = 'on';
INSERT INTO public.product_piece_rate_versions (
  id, tenant_id, product_id, unit, rate, effective_from, status, reason,
  approved_by, approved_at
) VALUES (
  '94000000-0000-0000-0000-000000000001', 'default',
  '93000000-0000-0000-0000-000000000001', 'PIECE', 12500,
  DATE '2026-01-01', 'APPROVED', 'Kiểm thử sản lượng',
  '91000000-0000-0000-0000-000000000001', now()
) ON CONFLICT (id) DO NOTHING;
SET LOCAL app.payroll_master_transition = 'off';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);

DO $$
DECLARE
  v_result jsonb;
  v_reused jsonb;
  v_entry_id uuid;
  v_reverse_entry_id uuid;
  v_closed_entry_id uuid;
  v_pending_entry_id uuid;
  v_row record;
  v_count integer;
  v_message text;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.list_production_entry_products(DATE '2026-08-20', 'trùng một')
  WHERE mapping_status = 'AMBIGUOUS_SKU';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Filtered product list did not preserve duplicate SKU status';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.list_production_entry_products(DATE '2026-08-20', 'PE-INACTIVE');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Inactive product remained selectable';
  END IF;

  v_result := public.record_production_entry(
    '92000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    DATE '2026-08-20', 10, NULL, 'production-entry-test-1', 'Ca sáng'
  );
  v_entry_id := (v_result->>'id')::uuid;
  IF v_result->>'status' <> 'SUBMITTED' OR (v_result->>'reused')::boolean THEN
    RAISE EXCEPTION 'Production entry was not submitted';
  END IF;

  v_reused := public.record_production_entry(
    '92000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    DATE '2026-08-20', 10, NULL, 'production-entry-test-1', 'Ca sáng'
  );
  IF NOT (v_reused->>'reused')::boolean OR (v_reused->>'id')::uuid <> v_entry_id THEN
    RAISE EXCEPTION 'Production entry retry was not idempotent';
  END IF;

  SELECT * INTO v_row
  FROM public.list_production_entries_month(DATE '2026-08-01', true)
  WHERE id = v_entry_id;
  IF NOT FOUND OR v_row.quantity <> 10 OR v_row.product_sku <> 'PE-SKU-01'
     OR v_row.calculated_amount <> 125000 OR v_row.workflow_status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'Production entry snapshot/list result is incorrect';
  END IF;

  BEGIN
    PERFORM public.reverse_production_entry(
      v_entry_id, 'Chưa duyệt', 'production-entry-reverse-submitted'
    );
    RAISE EXCEPTION 'Submitted production entry was reversed';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
    IF v_message = 'Submitted production entry was reversed'
       OR position('đã duyệt mới được đảo' IN v_message) = 0 THEN
      RAISE;
    END IF;
  END;

  PERFORM public.set_production_entry_status(
    v_entry_id, 'APPROVED', 'Duyệt kiểm thử', 'production-entry-approve-1'
  );
  SELECT workflow_status INTO v_row
  FROM public.list_production_entries_month(DATE '2026-08-01', true)
  WHERE id = v_entry_id;
  IF NOT FOUND OR v_row.workflow_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Production entry approval failed';
  END IF;

  BEGIN
    PERFORM public.set_production_entry_status(
      v_entry_id, 'REJECTED', 'Không hợp lệ', 'production-entry-reject-after-approve'
    );
    RAISE EXCEPTION 'Approved production entry accepted another review transition';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
    IF v_message = 'Approved production entry accepted another review transition'
       OR position('đang chờ duyệt' IN v_message) = 0 THEN
      RAISE;
    END IF;
  END;

  v_result := public.record_production_entry(
    '92000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    DATE '2026-08-21', 2, NULL, 'production-entry-reverse-row', NULL
  );
  v_reverse_entry_id := (v_result->>'id')::uuid;
  PERFORM public.set_production_entry_status(
    v_reverse_entry_id, 'APPROVED', NULL, 'production-entry-reverse-approve'
  );
  v_result := public.reverse_production_entry(
    v_reverse_entry_id, 'Đảo kiểm thử', 'production-entry-reverse-approved'
  );
  IF v_result->>'status' <> 'REVERSED' OR (v_result->>'reused')::boolean THEN
    RAISE EXCEPTION 'Approved production entry reversal failed';
  END IF;
  v_reused := public.reverse_production_entry(
    v_reverse_entry_id, 'Đảo kiểm thử', 'production-entry-reverse-approved'
  );
  IF NOT (v_reused->>'reused')::boolean THEN
    RAISE EXCEPTION 'Production entry reversal retry was not idempotent';
  END IF;

  v_result := public.record_production_entry(
    '92000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    DATE '2026-08-22', 3, NULL, 'production-entry-closed-row', NULL
  );
  v_closed_entry_id := (v_result->>'id')::uuid;
  PERFORM public.set_production_entry_status(
    v_closed_entry_id, 'APPROVED', NULL, 'production-entry-closed-approve'
  );
  v_result := public.record_production_entry(
    '92000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    DATE '2026-08-23', 4, NULL, 'production-entry-pending-close', NULL
  );
  v_pending_entry_id := (v_result->>'id')::uuid;
  PERFORM public.set_factory_attendance_day_status(
    '92000000-0000-0000-0000-000000000001', DATE '2026-08-23',
    'PRESENT', false, 'Có mặt để kiểm thử chặn chốt', 'production-entry-pending-close-day-status'
  );
  PERFORM public.set_factory_attendance_day_closure(
    '92000000-0000-0000-0000-000000000001', DATE '2026-08-23',
    'EMPLOYEE_CONFIRMED', NULL, 'production-entry-pending-close-employee'
  );
  BEGIN
    PERFORM public.set_factory_attendance_day_closure(
      '92000000-0000-0000-0000-000000000001', DATE '2026-08-23',
      'LEADER_CONFIRMED', 'Không được chốt khi còn chờ duyệt', 'production-entry-pending-close-leader'
    );
    RAISE EXCEPTION 'Day with pending production entry was closed';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
    IF v_message = 'Day with pending production entry was closed'
       OR position('sản lượng sản phẩm chưa được duyệt' IN v_message) = 0 THEN
      RAISE;
    END IF;
  END;
  PERFORM public.set_production_entry_status(
    v_pending_entry_id, 'APPROVED', NULL, 'production-entry-pending-close-approve'
  );
  PERFORM public.set_factory_attendance_day_closure(
    '92000000-0000-0000-0000-000000000001', DATE '2026-08-23',
    'LEADER_CONFIRMED', 'Chốt sau khi duyệt sản lượng', 'production-entry-pending-close-leader-approved'
  );
  PERFORM public.set_factory_attendance_day_status(
    '92000000-0000-0000-0000-000000000001', DATE '2026-08-22',
    'PRESENT', false, 'Có mặt để kiểm thử chốt ngày', 'production-entry-closed-day-status'
  );
  PERFORM public.set_factory_attendance_day_closure(
    '92000000-0000-0000-0000-000000000001', DATE '2026-08-22',
    'EMPLOYEE_CONFIRMED', NULL, 'production-entry-close-employee'
  );
  PERFORM public.set_factory_attendance_day_closure(
    '92000000-0000-0000-0000-000000000001', DATE '2026-08-22',
    'LEADER_CONFIRMED', 'Chốt kiểm thử', 'production-entry-close-leader'
  );
  BEGIN
    PERFORM public.reverse_production_entry(
      v_closed_entry_id, 'Đảo sau chốt', 'production-entry-reverse-after-close'
    );
    RAISE EXCEPTION 'Closed-day production entry was reversed';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
    IF v_message = 'Closed-day production entry was reversed'
       OR position('đã được quản lý chốt' IN v_message) = 0 THEN
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM public.record_production_entry(
      '92000000-0000-0000-0000-000000000001',
      '93000000-0000-0000-0000-000000000002',
      DATE '2026-08-20', 1, NULL, 'production-entry-missing-rate', NULL
    );
    RAISE EXCEPTION 'Product without approved rate was accepted';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
    IF v_message = 'Product without approved rate was accepted'
       OR position('chưa có đơn giá đã duyệt' IN lower(v_message)) = 0 THEN
      RAISE;
    END IF;
  END;
END $$;

RESET ROLE;
ROLLBACK;

SELECT 'production_entries_test: PASS';
