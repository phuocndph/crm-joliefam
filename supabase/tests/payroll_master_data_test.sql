\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('91000000-0000-0000-0000-000000000001', 'payroll.admin@test.local'),
  ('91000000-0000-0000-0000-000000000002', 'payroll.manager@test.local'),
  ('91000000-0000-0000-0000-000000000003', 'payroll.accountant@test.local'),
  ('91000000-0000-0000-0000-000000000004', 'payroll.leader@test.local'),
  ('91000000-0000-0000-0000-000000000005', 'payroll.worker.one@test.local'),
  ('91000000-0000-0000-0000-000000000006', 'payroll.worker.two@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role, assigned_by) VALUES
  ('91000000-0000-0000-0000-000000000001', 'admin', NULL),
  ('91000000-0000-0000-0000-000000000002', 'manager', NULL),
  ('91000000-0000-0000-0000-000000000003', 'accountant', '91000000-0000-0000-0000-000000000002'),
  ('91000000-0000-0000-0000-000000000004', 'employee', '91000000-0000-0000-0000-000000000002'),
  ('91000000-0000-0000-0000-000000000005', 'employee', '91000000-0000-0000-0000-000000000002'),
  ('91000000-0000-0000-0000-000000000006', 'employee', '91000000-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

INSERT INTO public.employee_permissions (user_id, permission_type, enabled) VALUES
  ('91000000-0000-0000-0000-000000000004', 'payroll_team_view', true),
  ('91000000-0000-0000-0000-000000000004', 'payroll_worker_manage', true),
  ('91000000-0000-0000-0000-000000000004', 'payroll_bank_manage', true),
  ('91000000-0000-0000-0000-000000000006', 'orders', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.price_lists (id, tenant_id, name, year, status) VALUES
  ('92500000-0000-0000-0000-000000000001', 'default', 'Bảng giá Hà Nội', 2026, 'active'),
  ('92500000-0000-0000-0000-000000000002', 'default', 'Bảng giá Bắc Ninh', 2026, 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.products (id, tenant_id, sku, name, price_list_id) VALUES
  ('92000000-0000-0000-0000-000000000001', 'default', 'VGBT', 'Vỏ gối bì thư Hà Nội', '92500000-0000-0000-0000-000000000001'),
  ('92000000-0000-0000-0000-000000000002', 'default', 'GACHUN', 'Ga chun', '92500000-0000-0000-0000-000000000001'),
  ('92000000-0000-0000-0000-000000000004', 'default', 'VGBT', 'Vỏ gối bì thư Bắc Ninh', '92500000-0000-0000-0000-000000000002'),
  ('92000000-0000-0000-0000-000000000003', 'tenant-b', 'FOREIGN', 'Sản phẩm tenant khác', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.production_workers (
  id, tenant_id, user_id, employee_code, display_name, worker_type
) VALUES
  ('93000000-0000-0000-0000-000000000001', 'default', '91000000-0000-0000-0000-000000000004', 'NV-LEADER', 'Tổ trưởng', 'SUPERVISOR'),
  ('93000000-0000-0000-0000-000000000002', 'default', '91000000-0000-0000-0000-000000000005', 'NV-001', 'Công nhân một', 'SEWER'),
  ('93000000-0000-0000-0000-000000000003', 'default', '91000000-0000-0000-0000-000000000006', 'NV-002', 'Công nhân hai', 'HELPER'),
  ('93000000-0000-0000-0000-000000000004', 'tenant-b', NULL, 'NV-FOREIGN', 'Nhân sự tenant khác', 'GENERIC')
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE payroll_test_state (key text PRIMARY KEY, value text NOT NULL);
GRANT ALL ON TABLE payroll_test_state TO authenticated;

CREATE FUNCTION pg_temp.fail_permission_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.permission_type = 'reports' THEN RAISE EXCEPTION 'forced permission insert failure'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payroll_test_permission_failure
  BEFORE INSERT ON public.employee_permissions
  FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_permission_insert();

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);

-- Manager owns worker, policy and product-rate setup, but not sensitive bank/BHXH data.
DO $$
DECLARE
  v_group jsonb;
  v_assignment jsonb;
  v_rate jsonb;
  v_team jsonb;
  v_retired_team jsonb;
BEGIN
  IF to_regprocedure('public.list_payroll_products(text)') IS NULL
     OR to_regprocedure('public.list_payroll_products_v2(text)') IS NULL THEN
    RAISE EXCEPTION 'Payroll product RPC compatibility contract is missing';
  END IF;

  v_group := public.upsert_payroll_policy_group(
    'HN_PIECE', 'Hà Nội - lương sản phẩm', 'Nhóm thử nghiệm', true, 'Khởi tạo nhóm test'
  );
  INSERT INTO payroll_test_state VALUES ('policy_group_id', v_group->>'id');

  PERFORM public.create_worker_compensation_rate(
    '93000000-0000-0000-0000-000000000001', 'MONTHLY_MANAGER',
    DATE '2026-01-01', NULL, NULL, NULL, 15000000, 12480,
    'Mức quản lý năm 2026', false
  );
  PERFORM public.create_worker_compensation_rate(
    '93000000-0000-0000-0000-000000000001', 'MONTHLY_MANAGER',
    DATE '2027-01-01', NULL, NULL, NULL, 16000000, 12480,
    'Điều chỉnh mức quản lý năm 2027', false
  );

  IF (SELECT count(*) FROM public.list_payroll_products_v2('VGBT')
      WHERE mapping_status = 'AMBIGUOUS_SKU' AND sku_match_count = 2
        AND price_list_name IS NOT NULL) <> 2 THEN
    RAISE EXCEPTION 'Duplicate SKU across price lists was not surfaced as ambiguous';
  END IF;

  v_team := public.create_payroll_team_assignment(
    '93000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000002',
    CURRENT_DATE - 1, CURRENT_DATE + 1, 'Phân công tổ độc lập metadata vai trò'
  );
  INSERT INTO payroll_test_state VALUES ('team_assignment_id', v_team->>'id');

  PERFORM public.update_payroll_worker_master(
    '93000000-0000-0000-0000-000000000002', 'HN', 'Thợ may', NULL,
    DATE '2026-01-01', NULL, 'ACTIVE', 'Chuẩn hóa hồ sơ thử nghiệm'
  );

  IF NOT (
    public.update_payroll_worker_master(
      '93000000-0000-0000-0000-000000000002', 'HN', 'Thợ may', NULL,
      DATE '2026-01-01', NULL, 'ACTIVE', 'Kiểm tra projection hồ sơ'
    ) ?& ARRAY['current_assignment_id','current_compensation_type','current_policy_group_id','current_policy_group_code']
  ) THEN RAISE EXCEPTION 'Worker update did not return the canonical payroll projection'; END IF;

  v_assignment := public.create_worker_compensation_assignment(
    '93000000-0000-0000-0000-000000000002', 'PIECE_RATE',
    (SELECT value::uuid FROM payroll_test_state WHERE key = 'policy_group_id'),
    DATE '2026-01-01', NULL, 'Phân loại lương đầu năm'
  );
  INSERT INTO payroll_test_state VALUES ('assignment_old_id', v_assignment->>'id');
  PERFORM public.approve_worker_compensation_assignment(
    (v_assignment->>'id')::uuid, 'Duyệt phân loại đầu năm', true
  );

  v_assignment := public.create_worker_compensation_assignment(
    '93000000-0000-0000-0000-000000000002', 'PIECE_RATE',
    (SELECT value::uuid FROM payroll_test_state WHERE key = 'policy_group_id'),
    DATE '2026-07-01', NULL, 'Phân loại lương nửa cuối năm'
  );
  INSERT INTO payroll_test_state VALUES ('assignment_new_id', v_assignment->>'id');
  PERFORM public.approve_worker_compensation_assignment(
    (v_assignment->>'id')::uuid, 'Duyệt phân loại nửa cuối năm', true
  );

  v_rate := public.create_product_piece_rate_draft(
    '92000000-0000-0000-0000-000000000001', 1800, DATE '2026-01-01',
    NULL, 'PIECE', 'Đơn giá đầu năm', 'don-gia-moi'
  );
  INSERT INTO payroll_test_state VALUES ('rate_old_id', v_rate->>'id');
  PERFORM public.approve_product_piece_rate((v_rate->>'id')::uuid, 'Duyệt giá đầu năm', true);

  v_rate := public.create_product_piece_rate_draft(
    '92000000-0000-0000-0000-000000000001', 2000, DATE '2026-07-01',
    NULL, 'PIECE', 'Đơn giá nửa cuối năm', 'don-gia-moi'
  );
  INSERT INTO payroll_test_state VALUES ('rate_new_id', v_rate->>'id');
  PERFORM public.approve_product_piece_rate((v_rate->>'id')::uuid, 'Duyệt giá nửa cuối năm', true);

  BEGIN
    PERFORM public.create_product_piece_rate_draft(
      '92000000-0000-0000-0000-000000000003', 999, DATE '2026-01-01',
      NULL, 'PIECE', 'Cross tenant phải lỗi', 'test'
    );
    RAISE EXCEPTION 'Cross-tenant product rate was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Cross-tenant product rate was accepted' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.update_payroll_worker_master(
      '93000000-0000-0000-0000-000000000004', 'HN', NULL, NULL,
      DATE '2026-01-01', NULL, 'ACTIVE', 'Cross tenant phải lỗi'
    );
    RAISE EXCEPTION 'Cross-tenant worker update was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Cross-tenant worker update was accepted' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.create_social_insurance_draft(
      '93000000-0000-0000-0000-000000000002', 500000, DATE '2026-01-01',
      NULL, 'test', 'Manager không được quản lý BHXH'
    );
    RAISE EXCEPTION 'Manager could manage social insurance';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Manager could manage social insurance' THEN RAISE; END IF;
  END;

  v_retired_team := public.retire_payroll_team_assignment(
    (SELECT value::uuid FROM payroll_test_state WHERE key = 'team_assignment_id'),
    CURRENT_DATE,
    'Kết thúc phụ trách sau hôm nay'
  );
  IF v_retired_team->>'status' <> 'RETIRED'
     OR (v_retired_team->>'effective_to')::date <> CURRENT_DATE THEN
    RAISE EXCEPTION 'Team assignment retire did not close the effective range';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.list_payroll_team_assignments(NULL, NULL, CURRENT_DATE + 1)
    WHERE id = (SELECT value::uuid FROM payroll_test_state WHERE key = 'team_assignment_id')
  ) THEN RAISE EXCEPTION 'Retired team assignment remained active after effective_to'; END IF;
END $$;

-- Capability matrix is server-owned and permission replacement is atomic.
DO $$
DECLARE v_count integer;
BEGIN
  IF public.has_payroll_permission('payroll_bank_manage') THEN
    RAISE EXCEPTION 'Manager unexpectedly received bank management';
  END IF;
  IF NOT public.has_payroll_permission('payroll_policy_manage') THEN
    RAISE EXCEPTION 'Manager lost role-owned payroll policy capability';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.list_payroll_capabilities()
    WHERE permission_type = 'payroll_policy_manage' AND allowed AND source = 'ROLE'
  ) THEN RAISE EXCEPTION 'Capability listing did not expose server role source'; END IF;

  BEGIN
    PERFORM public.replace_employee_permissions(
      '91000000-0000-0000-0000-000000000006',
      '[{"permission_type":"payroll_bank_manage","enabled":true}]'::jsonb,
      'Không được cấp quyền nhạy cảm'
    );
    RAISE EXCEPTION 'Sensitive payroll permission was delegated';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Sensitive payroll permission was delegated' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.replace_employee_permissions(
      '91000000-0000-0000-0000-000000000006',
      '[{"permission_type":"dashboard","enabled":true},{"permission_type":"reports","enabled":true}]'::jsonb,
      'Kiểm tra rollback atomic'
    );
    RAISE EXCEPTION 'Permission replacement did not fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Permission replacement did not fail' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO v_count FROM public.employee_permissions
  WHERE user_id = '91000000-0000-0000-0000-000000000006'
    AND permission_type = 'orders' AND enabled;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Failed atomic replace erased the previous permission set'; END IF;

  BEGIN
    PERFORM public.replace_employee_permissions(
      '91000000-0000-0000-0000-000000000006',
      '[{"permission_type":"orders","enabled":true}]'::jsonb,
      NULL
    );
    RAISE EXCEPTION 'Permission replacement accepted a missing reason';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Permission replacement accepted a missing reason' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO public.employee_permissions (user_id, permission_type, enabled)
    VALUES ('91000000-0000-0000-0000-000000000006', 'dashboard', true);
    RAISE EXCEPTION 'Direct permission insert remained available';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.create_payroll_team_assignment(
      '93000000-0000-0000-0000-000000000001',
      '93000000-0000-0000-0000-000000000002',
      CURRENT_DATE, NULL, 'Overlap phải bị chặn'
    );
    RAISE EXCEPTION 'Overlapping team assignment was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Overlapping team assignment was accepted' THEN RAISE; END IF;
  END;
END $$;

DO $$
DECLARE
  v_old public.product_piece_rate_versions;
  v_new public.product_piece_rate_versions;
  v_assignment public.worker_compensation_assignments;
  v_overlap jsonb;
BEGIN
  v_old := public.resolve_product_piece_rate(
    '92000000-0000-0000-0000-000000000001', DATE '2026-06-30'
  );
  v_new := public.resolve_product_piece_rate(
    '92000000-0000-0000-0000-000000000001', DATE '2026-07-01'
  );
  IF v_old.rate <> 1800 OR v_new.rate <> 2000 THEN
    RAISE EXCEPTION 'Piece-rate effective boundary failed: old %, new %', v_old.rate, v_new.rate;
  END IF;
  IF v_old.status <> 'RETIRED' OR v_old.effective_to <> DATE '2026-06-30' THEN
    RAISE EXCEPTION 'Superseded piece rate was not closed correctly: %', to_jsonb(v_old);
  END IF;

  v_assignment := public.resolve_worker_compensation_assignment(
    '93000000-0000-0000-0000-000000000002', DATE '2026-06-30'
  );
  IF v_assignment.id <> (SELECT value::uuid FROM payroll_test_state WHERE key = 'assignment_old_id') THEN
    RAISE EXCEPTION 'Old worker assignment did not resolve at boundary';
  END IF;
  v_assignment := public.resolve_worker_compensation_assignment(
    '93000000-0000-0000-0000-000000000002', DATE '2026-07-01'
  );
  IF v_assignment.id <> (SELECT value::uuid FROM payroll_test_state WHERE key = 'assignment_new_id') THEN
    RAISE EXCEPTION 'New worker assignment did not resolve at boundary';
  END IF;

  v_overlap := public.create_product_piece_rate_draft(
    '92000000-0000-0000-0000-000000000001', 1900, DATE '2026-06-15',
    DATE '2026-07-15', 'PIECE', 'Khoảng chồng lấn để test', 'test'
  );
  BEGIN
    PERFORM public.approve_product_piece_rate((v_overlap->>'id')::uuid, 'Không được duyệt overlap', false);
    RAISE EXCEPTION 'Overlapping product rate was approved';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Overlapping product rate was approved' THEN RAISE; END IF;
  END;
END $$;

-- Worker salary/hourly rates use a draft/approval lifecycle on the existing
-- worker_compensation_rates table. Draft rows must never resolve as costs.
DO $$
DECLARE
  v_draft jsonb;
  v_updated jsonb;
  v_approved jsonb;
  v_resolved public.worker_compensation_rates;
BEGIN
  v_draft := public.create_worker_payroll_rate_draft(
    '93000000-0000-0000-0000-000000000003', 'MONTHLY_HELPER',
    DATE '2025-01-01', DATE '2025-12-31',
    NULL, NULL, 9000000, 12480, 'luong_tong', 'Mức lương tháng mới', false
  );
  IF v_draft->>'status' <> 'DRAFT' THEN RAISE EXCEPTION 'Worker rate draft was not marked DRAFT'; END IF;
  BEGIN
    PERFORM public.resolve_worker_compensation_rate(
      '93000000-0000-0000-0000-000000000003', 'MONTHLY_HELPER', DATE '2025-01-01'
    );
    RAISE EXCEPTION 'Draft worker rate entered the operational resolver';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Draft worker rate entered the operational resolver' THEN RAISE; END IF;
  END;
  v_updated := public.update_worker_payroll_rate_draft(
    (v_draft->>'id')::uuid, DATE '2025-01-01', DATE '2025-12-31',
    NULL, NULL, 9500000, 12480, 'luong_tong', 'Sửa mức lương trước duyệt', false
  );
  IF (v_updated->>'monthly_rate')::numeric <> 9500000 THEN RAISE EXCEPTION 'Worker rate draft update failed'; END IF;
  v_approved := public.approve_worker_payroll_rate((v_draft->>'id')::uuid, 'Duyệt mức lương năm 2027', true);
  IF v_approved->>'status' <> 'APPROVED' THEN RAISE EXCEPTION 'Worker rate approval failed'; END IF;
  -- Rate resolution is an internal server helper. Client-facing payroll
  -- reads use the permission-checked list RPC instead of exposing the helper.
  SELECT r.*
  INTO v_resolved
  FROM public.list_worker_compensation_rates(
    '93000000-0000-0000-0000-000000000003'
  ) AS r
  WHERE r.compensation_type = 'MONTHLY_HELPER'
    AND r.status IN ('APPROVED', 'RETIRED')
    AND r.effective_from <= DATE '2025-01-01'
    AND (r.effective_to IS NULL OR r.effective_to >= DATE '2025-01-01')
  ORDER BY r.effective_from DESC
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Approved worker rate was not readable through payroll RPC'; END IF;
  IF v_resolved.monthly_rate <> 9500000 THEN RAISE EXCEPTION 'Approved worker rate did not resolve'; END IF;
  BEGIN
    PERFORM public.update_worker_payroll_rate_draft(
      (v_draft->>'id')::uuid, DATE '2025-01-01', DATE '2025-12-31',
      NULL, NULL, 1, 12480, 'test', 'Không được sửa mức đã duyệt', false
    );
    RAISE EXCEPTION 'Approved worker rate was mutable through draft RPC';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Approved worker rate was mutable through draft RPC' THEN RAISE; END IF;
  END;

  v_draft := public.create_worker_payroll_rate_draft(
    '93000000-0000-0000-0000-000000000003', 'MONTHLY_HELPER',
    DATE '2026-01-01', DATE '2026-06-30',
    NULL, NULL, 10000000, 12480, 'luong_tong', 'Nháp dùng để kiểm tra hủy', false
  );
  PERFORM public.discard_worker_payroll_rate_draft(
    (v_draft->>'id')::uuid, 'Hủy nháp mức lương chưa duyệt'
  );
  IF EXISTS (SELECT 1 FROM public.worker_compensation_rates WHERE id = (v_draft->>'id')::uuid) THEN
    RAISE EXCEPTION 'Worker rate draft discard failed';
  END IF;
END $$;

-- Drafts can be corrected or discarded, but approved master data is immutable.
DO $$
DECLARE
  v_draft jsonb;
  v_updated jsonb;
  v_approved jsonb;
  v_overlap jsonb;
  v_future jsonb;
  v_hour_assignment jsonb;
  v_day_record jsonb;
  v_hour_record jsonb;
  v_clock_record jsonb;
BEGIN
  v_draft := public.create_worker_compensation_assignment(
    '93000000-0000-0000-0000-000000000003', 'MONTHLY_HELPER',
    (SELECT value::uuid FROM payroll_test_state WHERE key = 'policy_group_id'),
    DATE '2026-01-01', NULL, 'Nháp phân loại cần sửa'
  );
  v_updated := public.update_worker_compensation_assignment_draft(
    (v_draft->>'id')::uuid, 'MONTHLY_HELPER',
    (SELECT value::uuid FROM payroll_test_state WHERE key = 'policy_group_id'),
    DATE '2026-02-01', NULL, 'Sửa ngày hiệu lực phân loại'
  );
  IF v_updated->>'effective_from' <> '2026-02-01' THEN RAISE EXCEPTION 'Worker assignment draft update failed'; END IF;
  PERFORM public.discard_worker_compensation_assignment_draft((v_draft->>'id')::uuid, 'Hủy nháp để nhập lại');
  IF EXISTS (
    SELECT 1
    FROM public.list_worker_compensation_assignments('93000000-0000-0000-0000-000000000003')
    WHERE id = (v_draft->>'id')::uuid
  ) THEN
    RAISE EXCEPTION 'Worker assignment draft discard failed';
  END IF;

  v_draft := public.create_worker_compensation_assignment(
    '93000000-0000-0000-0000-000000000003', 'MONTHLY_HELPER',
    (SELECT value::uuid FROM payroll_test_state WHERE key = 'policy_group_id'),
    DATE '2026-01-01', NULL, 'Phân loại chính thức thợ phụ'
  );
  v_approved := public.approve_worker_compensation_assignment((v_draft->>'id')::uuid, 'Duyệt phân loại thợ phụ', true);
  INSERT INTO payroll_test_state VALUES ('assignment_worker_two_id', v_approved->>'id');
  BEGIN
    PERFORM public.update_worker_compensation_assignment_draft(
      (v_approved->>'id')::uuid, 'HOURLY',
      (SELECT value::uuid FROM payroll_test_state WHERE key = 'policy_group_id'),
      DATE '2026-01-01', NULL, 'Không được sửa bản duyệt'
    );
    RAISE EXCEPTION 'Approved worker assignment was updated';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM = 'Approved worker assignment was updated' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.discard_worker_compensation_assignment_draft((v_approved->>'id')::uuid, 'Không được hủy bản duyệt');
    RAISE EXCEPTION 'Approved worker assignment was discarded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM = 'Approved worker assignment was discarded' THEN RAISE; END IF; END;
  v_overlap := public.create_worker_compensation_assignment(
    '93000000-0000-0000-0000-000000000003', 'HOURLY',
    (SELECT value::uuid FROM payroll_test_state WHERE key = 'policy_group_id'),
    DATE '2026-06-01', DATE '2026-08-01', 'Overlap phân loại'
  );
  BEGIN
    PERFORM public.approve_worker_compensation_assignment((v_overlap->>'id')::uuid, 'Overlap phải lỗi', false);
    RAISE EXCEPTION 'Overlapping worker assignment was approved';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM = 'Overlapping worker assignment was approved' THEN RAISE; END IF; END;
  PERFORM public.discard_worker_compensation_assignment_draft((v_overlap->>'id')::uuid, 'Dọn nháp overlap');

  PERFORM public.create_worker_compensation_rate(
    '93000000-0000-0000-0000-000000000003', 'MONTHLY_HELPER',
    DATE '2026-01-01', DATE '2026-06-30', NULL, NULL, 26000000, 12480,
    'Mức công tháng kiểm tra phân loại lịch sử', false
  );
  v_day_record := public.record_factory_attendance(
    '93000000-0000-0000-0000-000000000003', 'DAY', DATE '2026-06-30',
    1, NULL, NULL, 8, 'Công việc xưởng', 'payroll-canonical-day', 'Kiểm tra loại lương cũ'
  );
  v_hour_assignment := public.create_worker_compensation_assignment(
    '93000000-0000-0000-0000-000000000003', 'HOURLY',
    (SELECT value::uuid FROM payroll_test_state WHERE key = 'policy_group_id'),
    DATE '2026-07-01', NULL, 'Chuyển sang lương giờ'
  );
  PERFORM public.approve_worker_compensation_assignment(
    (v_hour_assignment->>'id')::uuid, 'Duyệt chuyển sang lương giờ', true
  );
  PERFORM public.configure_worker_attendance_method(
    '93000000-0000-0000-0000-000000000003', 'HOUR', 30000,
    DATE '2026-07-01', NULL, 26, 8,
    'Mức công giờ kiểm tra phân loại lịch sử', false
  );

  v_hour_record := public.record_factory_hour_attendance(
    '93000000-0000-0000-0000-000000000003', DATE '2026-07-01',
    TIME '08:00', TIME '17:00', 60, 'Công việc xưởng',
    'payroll-canonical-hour', 'Kiểm tra loại lương mới'
  );
  v_clock_record := public.record_factory_hour_attendance(
    '93000000-0000-0000-0000-000000000003', DATE '2026-07-02',
    TIME '08:00', TIME '17:00', 60, 'Công việc xưởng',
    'payroll-canonical-clock', 'Kiểm tra giờ đến và giờ về'
  );
  INSERT INTO payroll_test_state VALUES
    ('canonical_day_attendance_id', v_day_record->>'id'),
    ('canonical_hour_attendance_id', v_hour_record->>'id'),
    ('canonical_clock_attendance_id', v_clock_record->>'id');

  IF NOT EXISTS (
    SELECT 1 FROM public.list_worker_attendance_methods()
    WHERE worker_id = '93000000-0000-0000-0000-000000000003'
      AND attendance_method = 'HOUR' AND compensation_type = 'HOURLY'
  ) THEN RAISE EXCEPTION 'Attendance method did not use current canonical compensation'; END IF;

  v_draft := public.create_product_piece_rate_draft(
    '92000000-0000-0000-0000-000000000002', 900, DATE '2026-01-01',
    NULL, 'PIECE', 'Nháp đơn giá cần sửa', 'test'
  );
  v_updated := public.update_product_piece_rate_draft(
    (v_draft->>'id')::uuid, 1000, DATE '2026-02-01', NULL, 'SET', 'test-v2', 'Sửa đơn giá nháp'
  );
  IF (v_updated->>'rate')::numeric <> 1000 OR v_updated->>'unit' <> 'SET' THEN RAISE EXCEPTION 'Piece-rate draft update failed'; END IF;
  PERFORM public.discard_product_piece_rate_draft((v_draft->>'id')::uuid, 'Hủy đơn giá nháp');

  v_draft := public.create_product_piece_rate_draft(
    '92000000-0000-0000-0000-000000000002', 1000, DATE '2026-01-01',
    NULL, 'PIECE', 'Đơn giá chính thức', 'test'
  );
  v_approved := public.approve_product_piece_rate((v_draft->>'id')::uuid, 'Duyệt đơn giá', true);
  INSERT INTO payroll_test_state VALUES ('rate_product_two_id', v_approved->>'id');
  BEGIN
    PERFORM public.update_product_piece_rate_draft((v_approved->>'id')::uuid, 1100, DATE '2026-01-01', NULL, 'PIECE', 'test', 'Không sửa bản duyệt');
    RAISE EXCEPTION 'Approved product rate was updated through draft RPC';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM = 'Approved product rate was updated through draft RPC' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.discard_product_piece_rate_draft((v_approved->>'id')::uuid, 'Không hủy bản duyệt');
    RAISE EXCEPTION 'Approved product rate was discarded through draft RPC';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM = 'Approved product rate was discarded through draft RPC' THEN RAISE; END IF; END;
  v_overlap := public.create_product_piece_rate_draft(
    '92000000-0000-0000-0000-000000000002', 1200, DATE '2026-06-01', DATE '2026-08-01',
    'PIECE', 'Overlap đơn giá', 'test'
  );
  BEGIN
    PERFORM public.approve_product_piece_rate((v_overlap->>'id')::uuid, 'Overlap phải lỗi', false);
    RAISE EXCEPTION 'Overlapping second product rate was approved';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM = 'Overlapping second product rate was approved' THEN RAISE; END IF; END;
  PERFORM public.discard_product_piece_rate_draft((v_overlap->>'id')::uuid, 'Dọn nháp overlap');

  IF (SELECT employment_type FROM public.production_workers WHERE id = '93000000-0000-0000-0000-000000000002') <> 'PIECE_RATE'
     OR (SELECT default_compensation_type FROM public.worker_compensation_profiles WHERE worker_id = '93000000-0000-0000-0000-000000000002') <> 'PIECE_RATE' THEN
    RAISE EXCEPTION 'Approved assignment did not synchronize canonical compensation';
  END IF;
  v_future := public.create_worker_compensation_assignment(
    '93000000-0000-0000-0000-000000000002', 'HOURLY',
    (SELECT value::uuid FROM payroll_test_state WHERE key = 'policy_group_id'),
    CURRENT_DATE + 10, NULL, 'Phân loại tương lai'
  );
  PERFORM public.approve_worker_compensation_assignment((v_future->>'id')::uuid, 'Duyệt trước cho kỳ sau', true);
  IF (SELECT employment_type FROM public.production_workers WHERE id = '93000000-0000-0000-0000-000000000002') <> 'PIECE_RATE' THEN
    RAISE EXCEPTION 'Future assignment became current too early';
  END IF;
  BEGIN
    PERFORM public.upsert_worker_compensation_profile(
      '93000000-0000-0000-0000-000000000002', 'HOURLY', NULL
    );
    RAISE EXCEPTION 'Legacy profile diverged from canonical assignment';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM = 'Legacy profile diverged from canonical assignment' THEN RAISE; END IF; END;
END $$;

-- Team leader sees and manages only workers assigned to that leader.
SELECT set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000004', true);
DO $$
BEGIN
  IF public.has_payroll_permission('payroll_bank_manage') THEN
    RAISE EXCEPTION 'Delegated sensitive payroll permission was honored';
  END IF;
  IF NOT public.has_payroll_permission('payroll_team_view')
     OR NOT public.has_payroll_permission('payroll_worker_manage') THEN
    RAISE EXCEPTION 'Delegable payroll capability was not honored';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = '91000000-0000-0000-0000-000000000005'
      AND assigned_by = auth.uid()
  ) THEN RAISE EXCEPTION 'Test no longer proves scope independent of assigned_by'; END IF;
  IF public.payroll_worker_in_scope_at(
    '93000000-0000-0000-0000-000000000002', CURRENT_DATE - 2
  ) THEN RAISE EXCEPTION 'Team scope started before effective_from'; END IF;
  IF NOT public.payroll_worker_in_scope_at(
    '93000000-0000-0000-0000-000000000002', CURRENT_DATE - 1
  ) THEN RAISE EXCEPTION 'Team scope did not start on effective_from'; END IF;
  IF public.payroll_worker_in_scope_at(
    '93000000-0000-0000-0000-000000000002', CURRENT_DATE + 2
  ) THEN RAISE EXCEPTION 'Team scope continued after effective_to'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.list_payroll_workers(true)
    WHERE id = '93000000-0000-0000-0000-000000000002'
  ) THEN RAISE EXCEPTION 'Team leader could not see assigned worker'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.list_payroll_workers(true)
    WHERE id = '93000000-0000-0000-0000-000000000003'
  ) THEN RAISE EXCEPTION 'Team leader could see worker outside scope'; END IF;

  PERFORM public.update_payroll_worker_master(
    '93000000-0000-0000-0000-000000000002', 'HN', 'Thợ may chính', NULL,
    DATE '2026-01-01', NULL, 'ACTIVE', 'Tổ trưởng cập nhật vị trí'
  );
  BEGIN
    PERFORM public.update_payroll_worker_master(
      '93000000-0000-0000-0000-000000000003', 'BN', 'Thợ phụ', NULL,
      DATE '2026-01-01', NULL, 'ACTIVE', 'Ngoài phạm vi tổ'
    );
    RAISE EXCEPTION 'Team leader updated worker outside scope';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Team leader updated worker outside scope' THEN RAISE; END IF;
  END;
END $$;

-- Accountant owns sensitive payroll master data.
SELECT set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000003', true);
DO $$
DECLARE
  v_insurance jsonb;
  v_bank jsonb;
  v_draft jsonb;
  v_updated jsonb;
  v_overlap jsonb;
  v_resolved public.employee_social_insurance_versions;
BEGIN
  v_insurance := public.create_social_insurance_draft(
    '93000000-0000-0000-0000-000000000002', 500000, DATE '2026-01-01',
    NULL, 'nv đóng bhxh', 'Mức BHXH đầu năm'
  );
  INSERT INTO payroll_test_state VALUES ('insurance_old_id', v_insurance->>'id');
  PERFORM public.approve_social_insurance_version((v_insurance->>'id')::uuid, 'Duyệt BHXH đầu năm', true);

  v_insurance := public.create_social_insurance_draft(
    '93000000-0000-0000-0000-000000000002', 600000, DATE '2026-07-01',
    NULL, 'nv đóng bhxh', 'Mức BHXH nửa cuối năm'
  );
  INSERT INTO payroll_test_state VALUES ('insurance_new_id', v_insurance->>'id');
  PERFORM public.approve_social_insurance_version((v_insurance->>'id')::uuid, 'Duyệt BHXH nửa cuối năm', true);

  v_resolved := public.resolve_social_insurance_version(
    '93000000-0000-0000-0000-000000000002', DATE '2026-06-30'
  );
  IF v_resolved.employee_amount <> 500000 THEN RAISE EXCEPTION 'Old BHXH boundary failed'; END IF;
  v_resolved := public.resolve_social_insurance_version(
    '93000000-0000-0000-0000-000000000002', DATE '2026-07-01'
  );
  IF v_resolved.employee_amount <> 600000 THEN RAISE EXCEPTION 'New BHXH boundary failed'; END IF;

  v_draft := public.create_social_insurance_draft(
    '93000000-0000-0000-0000-000000000003', 300000, DATE '2026-01-01',
    NULL, 'test', 'Nháp BHXH cần sửa'
  );
  v_updated := public.update_social_insurance_draft(
    (v_draft->>'id')::uuid, 350000, DATE '2026-02-01', NULL, 'test-v2', 'Sửa BHXH nháp'
  );
  IF (v_updated->>'employee_amount')::numeric <> 350000 THEN RAISE EXCEPTION 'BHXH draft update failed'; END IF;
  PERFORM public.discard_social_insurance_draft((v_draft->>'id')::uuid, 'Hủy BHXH nháp');
  BEGIN
    PERFORM public.update_social_insurance_draft(
      (SELECT value::uuid FROM payroll_test_state WHERE key = 'insurance_new_id'),
      650000, DATE '2026-07-01', NULL, 'test', 'Không sửa BHXH duyệt'
    );
    RAISE EXCEPTION 'Approved BHXH was updated through draft RPC';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM = 'Approved BHXH was updated through draft RPC' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.discard_social_insurance_draft(
      (SELECT value::uuid FROM payroll_test_state WHERE key = 'insurance_new_id'), 'Không hủy BHXH duyệt'
    );
    RAISE EXCEPTION 'Approved BHXH was discarded through draft RPC';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM = 'Approved BHXH was discarded through draft RPC' THEN RAISE; END IF; END;
  v_overlap := public.create_social_insurance_draft(
    '93000000-0000-0000-0000-000000000002', 550000, DATE '2026-06-01',
    DATE '2026-08-01', 'test', 'Overlap BHXH'
  );
  BEGIN
    PERFORM public.approve_social_insurance_version((v_overlap->>'id')::uuid, 'Overlap phải lỗi', false);
    RAISE EXCEPTION 'Overlapping BHXH was approved';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM = 'Overlapping BHXH was approved' THEN RAISE; END IF; END;
  PERFORM public.discard_social_insurance_draft((v_overlap->>'id')::uuid, 'Dọn nháp overlap');

  v_bank := public.create_bank_account_draft(
    '93000000-0000-0000-0000-000000000002', '001234567890', 'CONG NHAN MOT',
    'Ngân hàng test', 'TEST', true, DATE '2026-01-01', NULL, 'PL', 'Tài khoản nhận lương'
  );
  IF v_bank ? 'account_number' OR v_bank->>'account_number_masked' <> '********7890' THEN
    RAISE EXCEPTION 'Bank draft response leaked or masked incorrectly: %', v_bank;
  END IF;
  INSERT INTO payroll_test_state VALUES ('bank_primary_id', v_bank->>'id');
  PERFORM public.verify_bank_account((v_bank->>'id')::uuid, 'Đối chiếu tài khoản chính', true);

  v_bank := public.create_bank_account_draft(
    '93000000-0000-0000-0000-000000000002', '00009999', 'CONG NHAN MOT',
    'Ngân hàng phụ', NULL, false, DATE '2026-01-01', NULL, 'PL', 'Tài khoản phụ'
  );
  PERFORM public.verify_bank_account((v_bank->>'id')::uuid, 'Đối chiếu tài khoản phụ', true);

  v_draft := public.create_bank_account_draft(
    '93000000-0000-0000-0000-000000000003', '00001234', 'CONG NHAN HAI',
    'Ngân hàng nháp', NULL, true, DATE '2026-01-01', NULL, 'PL', 'Nháp ngân hàng cần sửa'
  );
  v_updated := public.update_bank_account_draft(
    (v_draft->>'id')::uuid, '00005678', 'CONG NHAN HAI', 'Ngân hàng mới', 'NEW', true,
    DATE '2026-02-01', NULL, 'PL-v2', 'Sửa ngân hàng nháp'
  );
  IF v_updated ? 'account_number' OR v_updated->>'account_number_masked' <> '****5678' THEN
    RAISE EXCEPTION 'Bank draft update leaked account number or masked incorrectly: %', v_updated;
  END IF;
  PERFORM public.discard_bank_account_draft((v_draft->>'id')::uuid, 'Hủy ngân hàng nháp');
  BEGIN
    PERFORM public.update_bank_account_draft(
      (SELECT value::uuid FROM payroll_test_state WHERE key = 'bank_primary_id'),
      '99999999', 'CONG NHAN MOT', 'Không hợp lệ', NULL, true,
      DATE '2026-01-01', NULL, 'test', 'Không sửa tài khoản xác minh'
    );
    RAISE EXCEPTION 'Verified bank account was updated through draft RPC';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM = 'Verified bank account was updated through draft RPC' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.discard_bank_account_draft(
      (SELECT value::uuid FROM payroll_test_state WHERE key = 'bank_primary_id'), 'Không hủy tài khoản xác minh'
    );
    RAISE EXCEPTION 'Verified bank account was discarded through draft RPC';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM = 'Verified bank account was discarded through draft RPC' THEN RAISE; END IF; END;
  v_overlap := public.create_bank_account_draft(
    '93000000-0000-0000-0000-000000000002', '55556666', 'CONG NHAN MOT',
    'Ngân hàng overlap', NULL, true, DATE '2026-06-01', DATE '2026-08-01',
    'test', 'Overlap tài khoản chính'
  );
  BEGIN
    PERFORM public.verify_bank_account((v_overlap->>'id')::uuid, 'Overlap phải lỗi', false);
    RAISE EXCEPTION 'Overlapping primary bank account was verified';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM = 'Overlapping primary bank account was verified' THEN RAISE; END IF; END;
  PERFORM public.discard_bank_account_draft((v_overlap->>'id')::uuid, 'Dọn nháp overlap');

  IF NOT EXISTS (
    SELECT 1 FROM public.list_worker_bank_accounts('93000000-0000-0000-0000-000000000002')
    WHERE id = (SELECT value::uuid FROM payroll_test_state WHERE key = 'bank_primary_id')
      AND account_number = '001234567890' AND account_number_masked = '********7890'
  ) THEN RAISE EXCEPTION 'Accountant could not read verified bank account'; END IF;

  BEGIN
    PERFORM public.resolve_primary_bank_account(
      '93000000-0000-0000-0000-000000000002', DATE '2026-08-01'
    );
    RAISE EXCEPTION 'Restricted full bank resolver was callable by authenticated';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- Employee can only use masked self-service reads and cannot manage rates.
SELECT set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000005', true);
DO $$
DECLARE v_row record;
BEGIN
  SELECT * INTO v_row
  FROM public.list_worker_bank_accounts('93000000-0000-0000-0000-000000000002')
  WHERE id = (SELECT value::uuid FROM payroll_test_state WHERE key = 'bank_primary_id');
  IF NOT FOUND OR v_row.account_number IS NOT NULL OR v_row.account_number_masked <> '********7890' THEN
    RAISE EXCEPTION 'Employee bank masking failed: %', to_jsonb(v_row);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.list_worker_bank_accounts('93000000-0000-0000-0000-000000000003')
  ) THEN RAISE EXCEPTION 'Employee could view another worker bank account'; END IF;

  BEGIN
    PERFORM public.create_product_piece_rate_draft(
      '92000000-0000-0000-0000-000000000002', 1000, DATE '2026-01-01',
      NULL, 'PIECE', 'Employee không được nhập giá', 'test'
    );
    RAISE EXCEPTION 'Employee could manage product rates';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Employee could manage product rates' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM 1 FROM public.bank_accounts LIMIT 1;
    RAISE EXCEPTION 'Employee could read bank table directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

RESET ROLE;

-- Database-level guards protect approved history even from direct table writes.
DO $$
BEGIN
  BEGIN
    UPDATE public.product_piece_rate_versions
    SET rate = 2100
    WHERE id = (SELECT value::uuid FROM payroll_test_state WHERE key = 'rate_new_id');
    RAISE EXCEPTION 'Approved product rate was mutable';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Approved product rate was mutable' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.worker_compensation_rates
    SET monthly_rate = 1
    WHERE worker_id = '93000000-0000-0000-0000-000000000003'
      AND compensation_type = 'MONTHLY_HELPER'
      AND effective_from = DATE '2025-01-01';
    RAISE EXCEPTION 'Approved worker rate was mutable directly';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Approved worker rate was mutable directly' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO public.worker_compensation_rates (
      tenant_id, worker_id, compensation_type, effective_from,
      monthly_rate, monthly_productive_minutes, status
    ) VALUES (
      'default', '93000000-0000-0000-0000-000000000003', 'MONTHLY_HELPER', DATE '2030-01-01',
      1, 1, 'APPROVED'
    );
    RAISE EXCEPTION 'Approved worker rate could be inserted directly';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Approved worker rate could be inserted directly' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM public.bank_accounts
    WHERE id = (SELECT value::uuid FROM payroll_test_state WHERE key = 'bank_primary_id');
    RAISE EXCEPTION 'Verified bank account was deletable';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Verified bank account was deletable' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.employee_social_insurance_versions
    SET employee_amount = 1
    WHERE id = (SELECT value::uuid FROM payroll_test_state WHERE key = 'insurance_new_id');
    RAISE EXCEPTION 'Approved social insurance was mutable';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Approved social insurance was mutable' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.bank_accounts
    SET bank_name = 'Changed directly'
    WHERE id = (SELECT value::uuid FROM payroll_test_state WHERE key = 'bank_primary_id');
    RAISE EXCEPTION 'Verified bank account was mutable';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Verified bank account was mutable' THEN RAISE; END IF;
  END;

  IF (SELECT account_number FROM public.bank_accounts
      WHERE id = (SELECT value::uuid FROM payroll_test_state WHERE key = 'bank_primary_id')) <> '001234567890' THEN
    RAISE EXCEPTION 'Leading zero bank account was not stored as text';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.audit_events
    WHERE entity_type = 'bank_accounts'
      AND (COALESCE(before_data::text, '') ~ '(001234567890|00009999|00001234|00005678|55556666)'
        OR COALESCE(after_data::text, '') ~ '(001234567890|00009999|00001234|00005678|55556666)')
  ) THEN RAISE EXCEPTION 'Audit log leaked a full bank account number'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.factory_attendance_records f
    WHERE (f.id = (SELECT value::uuid FROM payroll_test_state WHERE key = 'canonical_day_attendance_id')
        AND (f.compensation_type <> 'MONTHLY_HELPER' OR f.calculated_amount <> 1000000))
       OR (f.id = (SELECT value::uuid FROM payroll_test_state WHERE key = 'canonical_hour_attendance_id')
        AND (f.compensation_type <> 'HOURLY' OR f.calculated_amount <> 240000))
       OR (f.id = (SELECT value::uuid FROM payroll_test_state WHERE key = 'canonical_clock_attendance_id')
        AND (f.compensation_type <> 'HOURLY' OR f.calculated_amount <> 240000))
  ) THEN RAISE EXCEPTION 'Operational attendance did not snapshot the effective-dated compensation'; END IF;

  IF to_regprocedure('public.record_production_labor_fact(uuid,uuid,numeric,numeric,numeric,date,text,text,uuid,text)') IS NULL
     OR to_regprocedure('public.record_production_attendance(uuid,uuid,text,date,numeric,numeric,numeric,numeric,text,text)') IS NULL
     OR to_regprocedure('public.record_factory_attendance(uuid,text,date,numeric,numeric,numeric,numeric,text,text,text)') IS NULL
     OR to_regprocedure('public.record_factory_hour_attendance(uuid,date,time,time,integer,text,text,text)') IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname IN ('record_production_labor_fact', 'record_production_attendance')
      AND position('resolve_payroll_compensation_type' IN pg_get_functiondef(p.oid)) > 0
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname LIKE 'record_factory_attendance%'
      AND position('resolve_worker_compensation_rate' IN pg_get_functiondef(p.oid)) > 0
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname LIKE 'record_factory_hour_attendance%'
      AND position('resolve_worker_compensation_rate' IN pg_get_functiondef(p.oid)) > 0
  ) THEN RAISE EXCEPTION 'An operational labor path still bypasses the canonical compensation resolver'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'products'
      AND policyname IN (
        'Users can insert products', 'Users can update products', 'Users can delete products',
        'Authenticated users can insert products', 'Authenticated users can update products',
        'Authenticated users can delete products'
      )
  ) THEN RAISE EXCEPTION 'A historical broad product write policy still exists'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.audit_events
    WHERE entity_type = 'payroll_policy_groups' AND reason = 'Khởi tạo nhóm test'
  ) THEN RAISE EXCEPTION 'Policy group change reason was not audited'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.audit_events
    WHERE entity_type = 'production_workers' AND action = 'UPDATE'
      AND reason IN ('Chuẩn hóa hồ sơ thử nghiệm', 'Tổ trưởng cập nhật vị trí')
  ) THEN RAISE EXCEPTION 'Worker master change reason was not audited'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.audit_events
    WHERE entity_type = 'worker_compensation_rates' AND action = 'SUPERSEDE'
      AND before_data IS NOT NULL AND after_data IS NOT NULL
      AND before_data->>'status' = 'APPROVED'
      AND after_data->>'status' = 'RETIRED'
      AND reason = 'Điều chỉnh mức quản lý năm 2027'
  ) THEN RAISE EXCEPTION 'Worker rate supersede audit is missing before/after data'; END IF;
END $$;

SELECT 'payroll_master_data_test: PASS' AS result;

ROLLBACK;
