\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('10000000-0000-0000-0000-000000000001', 'admin@test.local'),
  ('20000000-0000-0000-0000-000000000002', 'employee@test.local');
INSERT INTO public.user_roles (user_id, role, assigned_by) VALUES
  ('10000000-0000-0000-0000-000000000001', 'admin', NULL),
  ('20000000-0000-0000-0000-000000000002', 'employee', '10000000-0000-0000-0000-000000000001');
INSERT INTO public.employee_permissions (user_id, permission_type, enabled) VALUES
  ('20000000-0000-0000-0000-000000000002', 'cost_transactions', true);

CREATE TEMP TABLE cost_test_state (key text PRIMARY KEY, value text);
GRANT ALL ON TABLE cost_test_state TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.cost_categories WHERE tenant_id = 'default') <> 8 THEN
    RAISE EXCEPTION 'Expected 8 seeded cost categories';
  END IF;
  IF (SELECT count(*) FROM public.cost_centers WHERE tenant_id = 'default') <> 19 THEN
    RAISE EXCEPTION 'Expected 19 seeded cost centers';
  END IF;
  IF (SELECT count(*) FROM public.transaction_types WHERE tenant_id = 'default') <> 15 THEN
    RAISE EXCEPTION 'Expected 15 seeded transaction types';
  END IF;
END $$;

DO $$
DECLARE
  v_type uuid := (SELECT id FROM public.transaction_types WHERE code = 'EXPENSE');
BEGIN
  INSERT INTO public.business_transactions (tenant_id, transaction_number, transaction_type_id, transaction_date, description, idempotency_key)
  VALUES ('default', 'BT-202601-100000', v_type, DATE '2026-01-01', 'Number threshold test', 'number-threshold-key-1');
  IF public.next_business_transaction_number('default', DATE '2026-01-02') <> 'BT-202601-100001' THEN
    RAISE EXCEPTION 'Business number calculation failed above 99999';
  END IF;
  BEGIN
    UPDATE public.cost_categories SET level = 99 WHERE code = 'OTHER_EXPENSE';
    RAISE EXCEPTION 'Direct category level update unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Direct category level update unexpectedly succeeded' THEN RAISE; END IF;
  END;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);

DO $$
DECLARE
  v_threshold_id uuid := (
    SELECT id FROM public.business_transactions
    WHERE idempotency_key = 'number-threshold-key-1'
  );
BEGIN
  BEGIN
    UPDATE public.business_transactions SET total_amount = 1 WHERE id = v_threshold_id;
    RAISE EXCEPTION 'Header total update with unset session flag unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Header total update with unset session flag unexpectedly succeeded' THEN RAISE; END IF;
  END;
END $$;

DO $$
DECLARE
  v_type uuid;
  v_other_type uuid;
  v_center uuid;
  v_result jsonb;
  v_again jsonb;
  v_second jsonb;
  v_id uuid;
  v_second_id uuid;
BEGIN
  SELECT id INTO v_type FROM public.transaction_types WHERE code = 'EXPENSE';
  SELECT id INTO v_other_type FROM public.transaction_types WHERE code = 'PURCHASE_SUPPLIES';
  SELECT id INTO v_center FROM public.cost_centers WHERE code = 'OFFICE';
  v_result := public.create_business_transaction(
    v_type, DATE '2026-08-24', 'Chi phí kiểm thử', 'sprint1-idempotency-001',
    jsonb_build_array(jsonb_build_object(
      'description', 'Dòng chi phí', 'quantity', 2, 'unit', 'lần',
      'unit_price', 100000, 'vat_rate', 10, 'cost_center_id', v_center
    )),
    '[]'::jsonb, 'OTHER', NULL, 'Nhà cung cấp kiểm thử', 'TEST-001'
  );
  v_id := (v_result ->> 'id')::uuid;
  IF v_result ->> 'status' <> 'DRAFT' THEN RAISE EXCEPTION 'Draft creation failed'; END IF;
  IF (SELECT total_amount FROM public.business_transactions WHERE id = v_id) <> 220000 THEN
    RAISE EXCEPTION 'Server total calculation failed';
  END IF;
  v_again := public.create_business_transaction(
    v_type, DATE '2026-08-24', 'Chi phí kiểm thử', 'sprint1-idempotency-001',
    jsonb_build_array(jsonb_build_object(
      'description', 'Dòng chi phí', 'quantity', 2, 'unit', 'lần',
      'unit_price', 100000, 'vat_rate', 10, 'cost_center_id', v_center
    )),
    '[]'::jsonb, 'OTHER', NULL, 'Nhà cung cấp kiểm thử', 'TEST-001'
  );
  IF (v_again ->> 'id')::uuid <> v_id OR (v_again ->> 'reused')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Idempotency reuse failed';
  END IF;
  IF (SELECT count(*) FROM public.business_transactions WHERE idempotency_key = 'sprint1-idempotency-001') <> 1 THEN
    RAISE EXCEPTION 'Idempotency created a duplicate';
  END IF;
  BEGIN
    PERFORM public.create_business_transaction(
      v_type, DATE '2026-08-24', 'Nội dung khác', 'sprint1-idempotency-001',
      jsonb_build_array(jsonb_build_object(
        'description', 'Dòng chi phí', 'quantity', 2, 'unit', 'lần',
        'unit_price', 100000, 'vat_rate', 10, 'cost_center_id', v_center
      )),
      '[]'::jsonb, 'OTHER', NULL, 'Nhà cung cấp kiểm thử', 'TEST-001'
    );
    RAISE EXCEPTION 'Conflicting idempotency payload unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Conflicting idempotency payload unexpectedly succeeded' THEN RAISE; END IF;
  END;
  v_second := public.create_business_transaction(
    v_type, DATE '2026-08-24', 'Giao dịch nháp thứ hai', 'sprint1-second-draft-001',
    jsonb_build_array(jsonb_build_object(
      'description', 'Dòng thứ hai', 'quantity', 1, 'unit', 'lần',
      'unit_price', 1000, 'vat_rate', 0, 'cost_center_id', v_center
    )),
    '[]'::jsonb, 'OTHER', NULL, 'Nhà cung cấp kiểm thử', 'TEST-002'
  );
  v_second_id := (v_second ->> 'id')::uuid;
  BEGIN
    UPDATE public.business_transaction_lines
       SET business_transaction_id = v_second_id
     WHERE business_transaction_id = v_id;
    RAISE EXCEPTION 'Moving a line between transactions unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Moving a line between transactions unexpectedly succeeded' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.business_transactions SET transaction_type_id = v_other_type WHERE id = v_id;
    RAISE EXCEPTION 'Changing type after lines exist unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Changing type after lines exist unexpectedly succeeded' THEN RAISE; END IF;
  END;
  INSERT INTO cost_test_state VALUES ('transaction_id', v_id::text);
END $$;

DO $$
DECLARE v_id uuid := (SELECT value::uuid FROM cost_test_state WHERE key = 'transaction_id');
BEGIN
  UPDATE public.business_transaction_lines
     SET unit_price = 120000,
         effect_kind = 'REVENUE',
         direction = 'CREDIT',
         classification_snapshot = '{"tampered":true}'::jsonb
   WHERE business_transaction_id = v_id;
  IF (SELECT total_amount FROM public.business_transactions WHERE id = v_id) <> 264000 THEN
    RAISE EXCEPTION 'Draft line edit did not recalculate header';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.business_transaction_lines
    WHERE business_transaction_id = v_id
      AND (effect_kind <> 'COST' OR direction <> 'DEBIT' OR classification_snapshot ? 'tampered')
  ) THEN
    RAISE EXCEPTION 'Server classification snapshot could be tampered with';
  END IF;
  BEGIN
    UPDATE public.business_transactions SET total_amount = 1 WHERE id = v_id;
    RAISE EXCEPTION 'Direct header total update unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Direct header total update unexpectedly succeeded' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.confirm_business_transaction(v_id);
    RAISE EXCEPTION 'Unauthorized confirm unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Unauthorized confirm unexpectedly succeeded' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;
INSERT INTO public.employee_permissions (user_id, permission_type, enabled)
VALUES ('20000000-0000-0000-0000-000000000002', 'cost_transaction_confirm', true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);

DO $$
DECLARE v_id uuid := (SELECT value::uuid FROM cost_test_state WHERE key = 'transaction_id');
BEGIN
  PERFORM public.confirm_business_transaction(v_id);
  IF (SELECT status FROM public.business_transactions WHERE id = v_id) <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'Confirm transition failed';
  END IF;
  BEGIN
    PERFORM public.confirm_business_transaction(v_id);
    RAISE EXCEPTION 'Second confirm unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Second confirm unexpectedly succeeded' THEN RAISE; END IF;
  END;
  UPDATE public.business_transaction_lines SET unit_price = 1 WHERE business_transaction_id = v_id;
  IF FOUND THEN RAISE EXCEPTION 'Confirmed line update unexpectedly succeeded'; END IF;
  BEGIN
    PERFORM public.void_business_transaction(v_id, 'Kiểm thử không quyền');
    RAISE EXCEPTION 'Unauthorized void unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Unauthorized void unexpectedly succeeded' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;
INSERT INTO public.employee_permissions (user_id, permission_type, enabled)
VALUES ('20000000-0000-0000-0000-000000000002', 'cost_transaction_void', true),
       ('20000000-0000-0000-0000-000000000002', 'cost_audit', true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);

DO $$
DECLARE v_id uuid := (SELECT value::uuid FROM cost_test_state WHERE key = 'transaction_id');
BEGIN
  IF (SELECT count(*) FROM public.audit_events WHERE entity_id = v_id AND action = 'CREATE') <> 1 THEN
    RAISE EXCEPTION 'Create audit count is not deterministic';
  END IF;
  IF (SELECT count(*) FROM public.audit_events WHERE entity_id = v_id AND action = 'CONFIRM') <> 1 THEN
    RAISE EXCEPTION 'Confirm audit count is not deterministic';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_events
    WHERE entity_type = 'business_transaction_lines'
      AND action = 'UPDATE'
      AND COALESCE(after_data ->> 'business_transaction_id', before_data ->> 'business_transaction_id') = v_id::text
  ) THEN
    RAISE EXCEPTION 'Draft line update audit is missing';
  END IF;
  PERFORM public.void_business_transaction(v_id, 'Hủy trong kiểm thử');
  IF (SELECT status FROM public.business_transactions WHERE id = v_id) <> 'VOIDED' THEN
    RAISE EXCEPTION 'Void transition failed';
  END IF;
  IF (SELECT count(*) FROM public.audit_events WHERE entity_id = v_id AND action = 'VOID' AND reason = 'Hủy trong kiểm thử') <> 1 THEN
    RAISE EXCEPTION 'Void audit missing';
  END IF;
  BEGIN
    UPDATE public.audit_events SET reason = 'tamper' WHERE entity_id = v_id;
    RAISE EXCEPTION 'Audit update unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Audit update unexpectedly succeeded' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;
INSERT INTO public.cost_categories (tenant_id, code, name) VALUES ('other-tenant', 'TEST', 'Other tenant');
INSERT INTO public.orders (id, tenant_id) VALUES
  ('30000000-0000-0000-0000-000000000001', 'default'),
  ('30000000-0000-0000-0000-000000000002', 'other-tenant');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cost_categories WHERE tenant_id = 'other-tenant') THEN
    RAISE EXCEPTION 'Tenant isolation failed';
  END IF;
  BEGIN
    INSERT INTO public.cost_objects (tenant_id, object_type, source_id, display_code)
    VALUES ('default', 'ORDER', '30000000-0000-0000-0000-000000000002', 'CROSS-TENANT-ORDER');
    RAISE EXCEPTION 'Cross-tenant cost object unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Cross-tenant cost object unexpectedly succeeded' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;
DO $$
DECLARE
  v_type uuid := (SELECT id FROM public.transaction_types WHERE code = 'EXPENSE');
  v_tx uuid;
BEGIN
  BEGIN
    UPDATE public.transaction_types SET is_system = false WHERE id = v_type;
    RAISE EXCEPTION 'System transaction type downgrade unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'System transaction type downgrade unexpectedly succeeded' THEN RAISE; END IF;
  END;
  INSERT INTO public.business_transactions (
    tenant_id, transaction_number, transaction_type_id, transaction_date,
    description, idempotency_key
  ) VALUES (
    'default', 'BT-202608-999998', v_type, DATE '2026-08-24',
    'Cross tenant link test', 'cross-tenant-link-key-1'
  ) RETURNING id INTO v_tx;
  BEGIN
    INSERT INTO public.business_transaction_links (
      tenant_id, business_transaction_id, link_type, linked_id
    ) VALUES (
      'default', v_tx, 'ORDER', '30000000-0000-0000-0000-000000000002'
    );
    RAISE EXCEPTION 'Cross-tenant transaction link unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Cross-tenant transaction link unexpectedly succeeded' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;
DO $$
DECLARE
  v_type uuid := (SELECT id FROM public.transaction_types WHERE code = 'EXPENSE');
BEGIN
  INSERT INTO public.business_transactions (tenant_id, transaction_number, transaction_type_id, transaction_date, description, idempotency_key)
  VALUES ('default', 'BT-202608-999999', v_type, DATE '2026-08-24', 'Duplicate number one', 'duplicate-number-key-1');
  BEGIN
    INSERT INTO public.business_transactions (tenant_id, transaction_number, transaction_type_id, transaction_date, description, idempotency_key)
    VALUES ('default', 'BT-202608-999999', v_type, DATE '2026-08-24', 'Duplicate number two', 'duplicate-number-key-2');
    RAISE EXCEPTION 'Duplicate business number unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;

UPDATE public.cost_centers SET is_active = false WHERE code = 'OFFICE';
DO $$
DECLARE v_id uuid := (SELECT value::uuid FROM cost_test_state WHERE key = 'transaction_id');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.business_transaction_lines
    WHERE business_transaction_id = v_id
      AND cost_center_id = (SELECT id FROM public.cost_centers WHERE code = 'OFFICE')
  ) THEN
    RAISE EXCEPTION 'Historical center reference was not preserved';
  END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_type uuid := (SELECT id FROM public.transaction_types WHERE code = 'EXPENSE');
  v_center uuid := (SELECT id FROM public.cost_centers WHERE code = 'OFFICE');
BEGIN
  BEGIN
    PERFORM public.create_business_transaction(
      v_type, DATE '2026-08-24', 'Inactive center test', 'inactive-center-key-001',
      jsonb_build_array(jsonb_build_object('description', 'Test', 'quantity', 1, 'unit', 'lần', 'unit_price', 1, 'vat_rate', 0, 'cost_center_id', v_center)),
      '[]'::jsonb, 'OTHER', NULL, 'Test supplier', NULL
    );
    RAISE EXCEPTION 'Inactive center unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Inactive center unexpectedly accepted' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;
UPDATE public.cost_categories SET is_active = false WHERE code = 'OTHER_EXPENSE';
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_type uuid := (SELECT id FROM public.transaction_types WHERE code = 'EXPENSE');
  v_center uuid := (SELECT id FROM public.cost_centers WHERE code = 'ACCOUNTING');
BEGIN
  BEGIN
    PERFORM public.create_business_transaction(
      v_type, DATE '2026-08-24', 'Inactive category test', 'inactive-category-key-001',
      jsonb_build_array(jsonb_build_object('description', 'Test', 'quantity', 1, 'unit', 'lần', 'unit_price', 1, 'vat_rate', 0, 'cost_center_id', v_center)),
      '[]'::jsonb, 'OTHER', NULL, 'Test supplier', NULL
    );
    RAISE EXCEPTION 'Inactive category unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Inactive category unexpectedly accepted' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;

SELECT 'cost_management_foundation_test: PASS' AS result;
