\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email) VALUES
  ('40000000-0000-0000-0000-000000000001', 'inventory-admin@test.local'),
  ('40000000-0000-0000-0000-000000000002', 'inventory-employee@test.local');
INSERT INTO public.user_roles (user_id, role, assigned_by) VALUES
  ('40000000-0000-0000-0000-000000000001', 'admin', NULL),
  ('40000000-0000-0000-0000-000000000002', 'employee', '40000000-0000-0000-0000-000000000001');
INSERT INTO public.employee_permissions (user_id, permission_type, enabled) VALUES
  ('40000000-0000-0000-0000-000000000002', 'inventory_view', true),
  ('40000000-0000-0000-0000-000000000002', 'inventory_documents', true),
  ('40000000-0000-0000-0000-000000000002', 'inventory_confirm', true);

INSERT INTO public.warehouses (id, name, warehouse_type, tenant_id, manager_id) VALUES
  ('50000000-0000-0000-0000-000000000001', 'Kho nguyên liệu A', 'main', 'default', NULL),
  ('50000000-0000-0000-0000-000000000002', 'Kho nguyên liệu B', 'branch', 'default', NULL),
  ('50000000-0000-0000-0000-000000000003', 'Kho tenant khác', 'branch', 'other-tenant', NULL);
INSERT INTO public.fabric_variants (id, variant_name, unit, tenant_id) VALUES
  ('51000000-0000-0000-0000-000000000001', 'T250 legacy', 'm', 'default');

CREATE TABLE public.inventory_test_state (key text PRIMARY KEY, value text NOT NULL);
GRANT ALL ON public.inventory_test_state TO authenticated;

CREATE OR REPLACE FUNCTION public.inventory_test_balance_json(p_item uuid, p_warehouse uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT to_jsonb(b) FROM public.inventory_balances b
  WHERE b.inventory_item_id=p_item AND b.warehouse_id=p_warehouse AND b.location_id IS NULL
$$;
CREATE OR REPLACE FUNCTION public.inventory_test_movement_json(p_document uuid, p_kind text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT to_jsonb(m) FROM public.inventory_movements m
  WHERE m.document_id=p_document AND m.movement_kind=p_kind ORDER BY m.movement_sequence LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.inventory_test_movement_by_id_json(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT to_jsonb(m) FROM public.inventory_movements m WHERE m.id=p_id
$$;
CREATE OR REPLACE FUNCTION public.inventory_test_document_movement_summary(p_document uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object('count',count(*),'value',COALESCE(sum(value_delta),0))
  FROM public.inventory_movements WHERE document_id=p_document
$$;
CREATE OR REPLACE FUNCTION public.inventory_test_audit_count(p_entity_type text, p_action text)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT count(*) FROM public.audit_events
  WHERE entity_type=p_entity_type AND action=p_action
$$;
CREATE OR REPLACE FUNCTION public.inventory_test_balance_count(p_item uuid, p_warehouse uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT count(*) FROM public.inventory_balances b
  WHERE b.inventory_item_id=p_item AND b.warehouse_id=p_warehouse AND b.location_id IS NULL
$$;
CREATE OR REPLACE FUNCTION public.inventory_test_ledger_only_reconciliation(p_item uuid, p_warehouse uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_balance public.inventory_balances;
  v_detected boolean;
BEGIN
  SELECT * INTO STRICT v_balance FROM public.inventory_balances
  WHERE inventory_item_id=p_item AND warehouse_id=p_warehouse AND location_id IS NULL;
  PERFORM set_config('app.inventory_posting', 'on', true);
  DELETE FROM public.inventory_balances WHERE id=v_balance.id;
  PERFORM set_config('app.inventory_posting', 'off', true);
  SELECT EXISTS (
    SELECT 1 FROM public.reconcile_inventory_balances()
    WHERE inventory_item_id=v_balance.inventory_item_id
      AND warehouse_id=v_balance.warehouse_id
      AND location_id IS NOT DISTINCT FROM v_balance.location_id
      AND quantity_difference <> 0
  ) INTO v_detected;
  PERFORM set_config('app.inventory_posting', 'on', true);
  INSERT INTO public.inventory_balances SELECT v_balance.*;
  PERFORM set_config('app.inventory_posting', 'off', true);
  RETURN v_detected;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.inventory_posting', 'on', true);
  IF v_balance.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_balances WHERE id=v_balance.id) THEN
    INSERT INTO public.inventory_balances SELECT v_balance.*;
  END IF;
  PERFORM set_config('app.inventory_posting', 'off', true);
  RAISE;
END;
$$;
CREATE OR REPLACE FUNCTION public.inventory_test_confirm_result(p_document uuid, p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  v_result := public.confirm_inventory_document(p_document);
  RETURN jsonb_build_object('success', true, 'result', v_result);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
CREATE OR REPLACE FUNCTION public.inventory_test_delay_concurrent_movement()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.inventory_item_id IN (
    '60000000-0000-0000-0000-000000000006'::uuid,
    '60000000-0000-0000-0000-000000000007'::uuid
  ) THEN
    PERFORM pg_sleep(1);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_test_delay_concurrent_movement
BEFORE INSERT ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.inventory_test_delay_concurrent_movement();
GRANT EXECUTE ON FUNCTION public.inventory_test_balance_json(uuid,uuid), public.inventory_test_movement_json(uuid,text), public.inventory_test_movement_by_id_json(uuid), public.inventory_test_document_movement_summary(uuid), public.inventory_test_audit_count(text,text), public.inventory_test_balance_count(uuid,uuid), public.inventory_test_ledger_only_reconciliation(uuid,uuid), public.inventory_test_confirm_result(uuid,uuid) TO authenticated;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', false);

INSERT INTO public.cost_objects (id, tenant_id, object_type, display_code, display_name)
VALUES ('61000000-0000-0000-0000-000000000001', 'default', 'OTHER', 'INVENTORY_TEST', 'Đối tượng chi phí test kho');

INSERT INTO public.inventory_items (id, tenant_id, code, name, item_type, base_unit, legacy_source_type, legacy_source_id) VALUES
  ('60000000-0000-0000-0000-000000000001', 'default', 'FABRIC_T250', 'Vải T250', 'RAW_MATERIAL', 'METER', 'FABRIC_VARIANT', '51000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000002', 'default', 'ELASTIC', 'Dây chun', 'RAW_MATERIAL', 'METER', NULL, NULL),
  ('60000000-0000-0000-0000-000000000003', 'default', 'THREAD', 'Chỉ may', 'SUPPLY', 'ROLL', NULL, NULL),
  ('60000000-0000-0000-0000-000000000004', 'default', 'LABEL', 'Nhãn', 'PACKAGING', 'PIECE', NULL, NULL),
  ('60000000-0000-0000-0000-000000000005', 'default', 'TRANSFER_MATERIAL', 'Vật tư chuyển kho', 'RAW_MATERIAL', 'METER', NULL, NULL),
  ('60000000-0000-0000-0000-000000000006', 'default', 'CONCURRENT_ISSUE', 'Vật tư test xuất đồng thời', 'RAW_MATERIAL', 'METER', NULL, NULL),
  ('60000000-0000-0000-0000-000000000007', 'default', 'CONCURRENT_RECEIPT', 'Vật tư test nhập đồng thời', 'RAW_MATERIAL', 'METER', NULL, NULL);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.inventory_items (tenant_id, code, name, item_type, base_unit, legacy_source_type, legacy_source_id)
    VALUES ('default', 'BAD_LEGACY_UNIT', 'Sai đơn vị', 'RAW_MATERIAL', 'KG', 'FABRIC_VARIANT', '51000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'Legacy unit mismatch unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Legacy unit mismatch unexpectedly succeeded' THEN RAISE; END IF;
  END;
END $$;

-- Golden 1: opening 1000 x 40,000.
DO $$
DECLARE v_result jsonb; v_id uuid; v_balance jsonb;
BEGIN
  v_result := public.create_inventory_document(
    'OPENING_BALANCE', '2026-08-01 08:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
    'Tồn đầu kỳ T250', 'inv-open-t250-0001',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000001','quantity',1000,'unit','METER','input_unit_cost',40000)),
    NULL, NULL, 'OPEN-T250', 'Khởi tạo test'
  );
  v_id := (v_result->>'id')::uuid;
  IF public.inventory_test_balance_json('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001') IS NOT NULL THEN RAISE EXCEPTION 'Draft changed inventory'; END IF;
  PERFORM public.confirm_inventory_document(v_id);
  v_balance := public.inventory_test_balance_json('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001');
  IF (v_balance->>'quantity_on_hand')::numeric<>1000 OR (v_balance->>'average_unit_cost')::numeric<>40000 OR (v_balance->>'inventory_value')::numeric<>40000000 THEN RAISE EXCEPTION 'Golden costing test 1 failed'; END IF;
END $$;

-- Golden 2: receipt 500 x 46,000 => 1,500 x 42,000.
DO $$
DECLARE v_result jsonb; v_balance jsonb;
BEGIN
  v_result := public.create_inventory_document(
    'RECEIPT', '2026-08-02 08:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
    'Nhập thêm T250', 'inv-receipt-t250-0002',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000001','quantity',500,'unit','METER','input_unit_cost',46000,'vat_rate',10)),
    NULL, 'Nhà cung cấp test', 'REC-T250-1', NULL
  );
  PERFORM public.confirm_inventory_document((v_result->>'id')::uuid);
  v_balance := public.inventory_test_balance_json('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001');
  IF (v_balance->>'quantity_on_hand')::numeric<>1500 OR (v_balance->>'average_unit_cost')::numeric<>42000 OR (v_balance->>'inventory_value')::numeric<>63000000 THEN RAISE EXCEPTION 'Golden costing test 2 failed'; END IF;
END $$;

-- Golden 3: issue 300 at 42,000 => remaining 1,200 / 50.4m.
DO $$
DECLARE v_result jsonb; v_id uuid; v_movement uuid; v_balance jsonb; v_movement_data jsonb;
BEGIN
  v_result := public.create_inventory_document(
    'ISSUE', '2026-08-03 08:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
    'Xuất T250', 'inv-issue-t250-0003',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000001','quantity',300,'unit','METER')),
    NULL, NULL, 'ISS-T250-1', NULL
  );
  v_id := (v_result->>'id')::uuid;
  PERFORM public.confirm_inventory_document(v_id);
  v_movement_data := public.inventory_test_movement_json(v_id,'ISSUE');
  v_movement := (v_movement_data->>'id')::uuid;
  INSERT INTO public.inventory_test_state VALUES ('first_issue_movement', v_movement::text);
  v_balance := public.inventory_test_balance_json('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001');
  IF (v_balance->>'quantity_on_hand')::numeric<>1200 OR (v_balance->>'average_unit_cost')::numeric<>42000 OR (v_balance->>'inventory_value')::numeric<>50400000 THEN RAISE EXCEPTION 'Golden costing test 3 balance failed'; END IF;
  IF (v_movement_data->>'unit_cost')::numeric<>42000 OR (v_movement_data->>'value_delta')::numeric<>-12600000 THEN RAISE EXCEPTION 'Golden costing test 3 issue value failed'; END IF;
END $$;

-- Golden 4: receipt 800 x 45,000 => 2,000 x 43,200.
DO $$
DECLARE v_result jsonb; v_balance jsonb;
BEGIN
  v_result := public.create_inventory_document(
    'RECEIPT', '2026-08-04 08:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
    'Nhập lô T250 thứ hai', 'inv-receipt-t250-0004',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000001','quantity',800,'unit','METER','input_unit_cost',45000)),
    NULL, 'Nhà cung cấp test', 'REC-T250-2', NULL
  );
  PERFORM public.confirm_inventory_document((v_result->>'id')::uuid);
  v_balance := public.inventory_test_balance_json('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001');
  IF (v_balance->>'quantity_on_hand')::numeric<>2000 OR (v_balance->>'average_unit_cost')::numeric<>43200 OR (v_balance->>'inventory_value')::numeric<>86400000 THEN RAISE EXCEPTION 'Golden costing test 4 failed'; END IF;
END $$;

-- Golden 5: issue 500 => 1,500 / 64.8m.
DO $$
DECLARE v_result jsonb; v_id uuid; v_movement uuid; v_balance jsonb;
BEGIN
  v_result := public.create_inventory_document(
    'ISSUE', '2026-08-05 08:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
    'Xuất T250 lần hai', 'inv-issue-t250-0005',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000001','quantity',500,'unit','METER')),
    NULL, NULL, 'ISS-T250-2', NULL
  );
  v_id := (v_result->>'id')::uuid;
  PERFORM public.confirm_inventory_document(v_id);
  v_movement := (public.inventory_test_movement_json(v_id,'ISSUE')->>'id')::uuid;
  INSERT INTO public.inventory_test_state VALUES ('return_source_movement', v_movement::text);
  v_balance := public.inventory_test_balance_json('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001');
  IF (v_balance->>'quantity_on_hand')::numeric<>1500 OR (v_balance->>'average_unit_cost')::numeric<>43200 OR (v_balance->>'inventory_value')::numeric<>64800000 THEN RAISE EXCEPTION 'Golden costing test 5 failed'; END IF;
END $$;

-- Exact-cost return of 100 from the second issue.
DO $$
DECLARE v_result jsonb; v_source uuid := (SELECT value::uuid FROM public.inventory_test_state WHERE key='return_source_movement'); v_balance jsonb; v_movement jsonb;
BEGIN
  v_result := public.create_inventory_document(
    'RETURN_IN', '2026-08-06 08:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
    'Trả lại T250 chưa dùng', 'inv-return-t250-0006',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000001','quantity',100,'unit','METER','source_movement_id',v_source)),
    NULL, NULL, 'RET-T250-1', NULL
  );
  PERFORM public.confirm_inventory_document((v_result->>'id')::uuid);
  v_balance := public.inventory_test_balance_json('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001');
  v_movement := public.inventory_test_movement_json((v_result->>'id')::uuid,'RETURN_IN');
  IF (v_balance->>'quantity_on_hand')::numeric<>1600 OR (v_balance->>'average_unit_cost')::numeric<>43200 OR (v_balance->>'inventory_value')::numeric<>69120000 THEN RAISE EXCEPTION 'Return balance failed'; END IF;
  IF (v_movement->>'unit_cost')::numeric<>43200 OR (v_movement->>'value_delta')::numeric<>4320000 OR (v_movement->>'source_movement_id')::uuid<>v_source THEN RAISE EXCEPTION 'Return source cost failed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.list_inventory_return_sources()
    WHERE id=v_source AND original_quantity=500 AND returned_quantity=100 AND remaining_quantity=400
  ) THEN RAISE EXCEPTION 'Eligible return source quantity was not calculated correctly'; END IF;
END $$;

-- Transfer 100 at 42,000 from A to B.
DO $$
DECLARE v_open jsonb; v_transfer jsonb; v_source_balance jsonb; v_destination_balance jsonb; v_summary jsonb;
BEGIN
  v_open := public.create_inventory_document(
    'OPENING_BALANCE', '2026-08-01 09:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
    'Tồn đầu kỳ vật tư chuyển', 'inv-open-transfer-001',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000005','quantity',500,'unit','METER','input_unit_cost',42000)),
    NULL, NULL, 'OPEN-TRANSFER', 'Khởi tạo test'
  );
  PERFORM public.confirm_inventory_document((v_open->>'id')::uuid);
  v_transfer := public.create_inventory_document(
    'TRANSFER', '2026-08-02 09:00:00+07', '50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002',
    'Chuyển vật tư A sang B', 'inv-transfer-0001',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000005','quantity',100,'unit','METER')),
    NULL, NULL, 'TRANSFER-1', NULL
  );
  PERFORM public.confirm_inventory_document((v_transfer->>'id')::uuid);
  v_source_balance := public.inventory_test_balance_json('60000000-0000-0000-0000-000000000005','50000000-0000-0000-0000-000000000001');
  v_destination_balance := public.inventory_test_balance_json('60000000-0000-0000-0000-000000000005','50000000-0000-0000-0000-000000000002');
  v_summary := public.inventory_test_document_movement_summary((v_transfer->>'id')::uuid);
  IF (v_source_balance->>'quantity_on_hand')::numeric<>400 OR (v_source_balance->>'inventory_value')::numeric<>16800000 THEN RAISE EXCEPTION 'Transfer source failed'; END IF;
  IF (v_destination_balance->>'quantity_on_hand')::numeric<>100 OR (v_destination_balance->>'average_unit_cost')::numeric<>42000 OR (v_destination_balance->>'inventory_value')::numeric<>4200000 THEN RAISE EXCEPTION 'Transfer destination failed'; END IF;
  IF (v_summary->>'value')::numeric<>0 THEN RAISE EXCEPTION 'Transfer created artificial value'; END IF;
END $$;

-- Negative stock, backdate, draft/no impact and void policy.
DO $$
DECLARE v_negative jsonb; v_backdate jsonb; v_draft jsonb; v_confirmed uuid; v_balance jsonb; v_source_movement jsonb;
BEGIN
  v_negative := public.create_inventory_document(
    'ISSUE', '2026-08-07 08:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
    'Xuất vượt tồn', 'inv-negative-0001',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000001','quantity',1601,'unit','METER')),
    NULL, NULL, 'NEGATIVE', NULL
  );
  BEGIN
    PERFORM public.confirm_inventory_document((v_negative->>'id')::uuid);
    RAISE EXCEPTION 'Negative stock unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Negative stock unexpectedly succeeded' THEN RAISE; END IF; END;
  v_balance := public.inventory_test_balance_json('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001');
  IF (v_balance->>'quantity_on_hand')::numeric<>1600 THEN RAISE EXCEPTION 'Negative attempt changed balance'; END IF;

  v_backdate := public.create_inventory_document(
    'RECEIPT', '2026-08-03 10:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
    'Nhập lùi ngày', 'inv-backdate-0001',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000001','quantity',1,'unit','METER','input_unit_cost',43000)),
    NULL, NULL, 'BACKDATE', NULL
  );
  BEGIN
    PERFORM public.confirm_inventory_document((v_backdate->>'id')::uuid);
    RAISE EXCEPTION 'Backdated confirmation unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Backdated confirmation unexpectedly succeeded' THEN RAISE; END IF; END;

  v_draft := public.create_inventory_document(
    'RECEIPT', '2026-08-08 08:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
    'Phiếu nháp nhãn', 'inv-draft-label-01',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000004','quantity',100,'unit','PIECE','input_unit_cost',1000)),
    NULL, NULL, 'DRAFT-LABEL', NULL
  );
  IF public.inventory_test_balance_json('60000000-0000-0000-0000-000000000004','50000000-0000-0000-0000-000000000001') IS NOT NULL THEN RAISE EXCEPTION 'Draft affected label stock'; END IF;
  PERFORM public.void_inventory_document((v_draft->>'id')::uuid, 'Hủy phiếu test');
  v_source_movement := public.inventory_test_movement_by_id_json((SELECT value::uuid FROM public.inventory_test_state WHERE key='first_issue_movement'));
  v_confirmed := (v_source_movement->>'document_id')::uuid;
  BEGIN
    PERFORM public.void_inventory_document(v_confirmed, 'Không được hủy');
    RAISE EXCEPTION 'Confirmed document void unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Confirmed document void unexpectedly succeeded' THEN RAISE; END IF; END;
END $$;

-- Idempotent create and confirm.
DO $$
DECLARE v_first jsonb; v_again jsonb; v_confirm_again jsonb;
BEGIN
  v_first := public.create_inventory_document(
    'RECEIPT', '2026-08-09 08:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
    'Nhập dây chun idempotent', 'inv-idempotent-0001',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000002','quantity',10,'unit','METER','input_unit_cost',5000)),
    NULL, NULL, 'IDEMPOTENT', NULL
  );
  v_again := public.create_inventory_document(
    'RECEIPT', '2026-08-09 08:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
    'Nhập dây chun idempotent', 'inv-idempotent-0001',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000002','quantity',10,'unit','METER','input_unit_cost',5000)),
    NULL, NULL, 'IDEMPOTENT', NULL
  );
  IF (v_first->>'id') <> (v_again->>'id') OR (v_again->>'reused')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Inventory create idempotency failed'; END IF;
  PERFORM public.confirm_inventory_document((v_first->>'id')::uuid);
  v_confirm_again := public.confirm_inventory_document((v_first->>'id')::uuid);
  IF (v_confirm_again->>'reused')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Inventory confirm idempotency failed'; END IF;
  IF (public.inventory_test_document_movement_summary((v_first->>'id')::uuid)->>'count')::integer<>1 THEN RAISE EXCEPTION 'Repeated confirm duplicated movement'; END IF;
END $$;

-- Confirmed, inventory-impact Business Transaction can link to one receipt only.
DO $$
DECLARE
  v_type uuid := (SELECT id FROM public.transaction_types WHERE code='PURCHASE_MATERIAL');
  v_center uuid := (SELECT id FROM public.cost_centers WHERE code='PROD_WAREHOUSE');
  v_bt jsonb;
  v_bt_draft jsonb;
  v_doc jsonb;
BEGIN
  v_bt := public.create_business_transaction(
    v_type, DATE '2026-08-10', 'Mua chỉ nhập kho', 'inventory-bt-link-0001',
    jsonb_build_array(jsonb_build_object('description','Mua chỉ','quantity',2,'unit','cuộn','unit_price',30000,'vat_rate',0,'cost_center_id',v_center)),
    '[]'::jsonb, 'SUPPLIER', NULL, 'Nhà cung cấp chỉ', 'PO-THREAD-1'
  );
  PERFORM public.confirm_business_transaction((v_bt->>'id')::uuid);
  IF EXISTS (SELECT 1 FROM public.business_transaction_lines WHERE business_transaction_id=(v_bt->>'id')::uuid AND effect_kind<>'INVENTORY') THEN
    RAISE EXCEPTION 'Material purchase was incorrectly classified as immediate cost';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.list_inventory_business_transactions('RECEIPT') WHERE id=(v_bt->>'id')::uuid) THEN
    RAISE EXCEPTION 'Eligible inventory Business Transaction was not listed';
  END IF;
  v_doc := public.create_inventory_document(
    'RECEIPT', '2026-08-10 12:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
    'Nhập chỉ theo giao dịch mua', 'inv-bt-linked-receipt-01',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000003','quantity',2,'unit','ROLL','input_unit_cost',30000)),
    (v_bt->>'id')::uuid, 'Nhà cung cấp chỉ', 'PO-THREAD-1', NULL
  );
  PERFORM public.confirm_inventory_document((v_doc->>'id')::uuid);
  IF EXISTS (SELECT 1 FROM public.list_inventory_business_transactions('RECEIPT') WHERE id=(v_bt->>'id')::uuid) THEN
    RAISE EXCEPTION 'Linked Business Transaction remained eligible for a duplicate receipt';
  END IF;
  BEGIN
    PERFORM public.create_inventory_document(
      'RECEIPT', '2026-08-11 12:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
      'Nhập trùng giao dịch mua', 'inv-bt-duplicate-link-01',
      jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000003','quantity',1,'unit','ROLL','input_unit_cost',30000)),
      (v_bt->>'id')::uuid, NULL, NULL, NULL
    );
    RAISE EXCEPTION 'Duplicate Business Transaction inventory link unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Duplicate Business Transaction inventory link unexpectedly succeeded' THEN RAISE; END IF; END;

  v_bt_draft := public.create_business_transaction(
    v_type, DATE '2026-08-11', 'Giao dịch mua chưa xác nhận', 'inventory-bt-draft-0001',
    jsonb_build_array(jsonb_build_object('description','Mua nhãn','quantity',1,'unit','cái','unit_price',1000,'vat_rate',0,'cost_center_id',v_center)),
    '[]'::jsonb, 'SUPPLIER', NULL, 'Nhà cung cấp nhãn', NULL
  );
  BEGIN
    PERFORM public.create_inventory_document(
      'RECEIPT', '2026-08-11 12:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
      'Không được link giao dịch nháp', 'inv-bt-draft-link-001',
      jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000004','quantity',1,'unit','PIECE','input_unit_cost',1000)),
      (v_bt_draft->>'id')::uuid, NULL, NULL, NULL
    );
    RAISE EXCEPTION 'Draft Business Transaction inventory link unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Draft Business Transaction inventory link unexpectedly succeeded' THEN RAISE; END IF; END;
END $$;

-- Direct API bypass and immutable ledger/balance.
DO $$
DECLARE v_balance uuid := (public.inventory_test_balance_json('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001')->>'id')::uuid; v_movement uuid := (SELECT value::uuid FROM public.inventory_test_state WHERE key='first_issue_movement'); v_doc uuid := (public.inventory_test_movement_by_id_json(v_movement)->>'document_id')::uuid;
BEGIN
  BEGIN INSERT INTO public.inventory_movements DEFAULT VALUES; RAISE EXCEPTION 'Direct movement insert unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Direct movement insert unexpectedly succeeded' THEN RAISE; END IF; END;
  BEGIN INSERT INTO public.inventory_balances DEFAULT VALUES; RAISE EXCEPTION 'Direct balance insert unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Direct balance insert unexpectedly succeeded' THEN RAISE; END IF; END;
  BEGIN UPDATE public.inventory_balances SET quantity_on_hand=999 WHERE id=v_balance; RAISE EXCEPTION 'Direct balance update unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Direct balance update unexpectedly succeeded' THEN RAISE; END IF; END;
  BEGIN UPDATE public.inventory_movements SET value_delta=0 WHERE id=v_movement; RAISE EXCEPTION 'Movement update unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Movement update unexpectedly succeeded' THEN RAISE; END IF; END;
  BEGIN DELETE FROM public.inventory_movements WHERE id=v_movement; RAISE EXCEPTION 'Movement delete unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Movement delete unexpectedly succeeded' THEN RAISE; END IF; END;
  BEGIN UPDATE public.inventory_documents SET description='Tamper' WHERE id=v_doc; RAISE EXCEPTION 'Confirmed document update unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Confirmed document update unexpectedly succeeded' THEN RAISE; END IF; END;
  BEGIN UPDATE public.inventory_items SET base_unit='KG' WHERE id='60000000-0000-0000-0000-000000000002'; RAISE EXCEPTION 'Posted item unit update unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Posted item unit update unexpectedly succeeded' THEN RAISE; END IF; END;
END $$;

RESET ROLE;
INSERT INTO public.inventory_items (id, tenant_id, code, name, item_type, base_unit)
VALUES ('60000000-0000-0000-0000-000000000099','other-tenant','OTHER-TENANT-ITEM','Other tenant','RAW_MATERIAL','METER');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', false);
DO $$
BEGIN
  BEGIN
    PERFORM public.create_inventory_document(
      'RECEIPT', now(), '50000000-0000-0000-0000-000000000003', NULL,
      'Cross tenant warehouse', 'inv-cross-tenant-01',
      jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000001','quantity',1,'unit','METER','input_unit_cost',1)),
      NULL,NULL,NULL,NULL
    );
    RAISE EXCEPTION 'Cross-tenant warehouse unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Cross-tenant warehouse unexpectedly succeeded' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.create_inventory_document(
      'RECEIPT', now(), '50000000-0000-0000-0000-000000000001', NULL,
      'Cross tenant item', 'inv-cross-tenant-02',
      jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000099','quantity',1,'unit','METER','input_unit_cost',1)),
      NULL,NULL,NULL,NULL
    );
    RAISE EXCEPTION 'Cross-tenant inventory item unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Cross-tenant inventory item unexpectedly succeeded' THEN RAISE; END IF; END;
END $$;

-- Cost masking for an employee with quantity-only permission.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', false);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.list_inventory_balances() WHERE quantity_on_hand > 0) THEN RAISE EXCEPTION 'Employee cannot see quantity'; END IF;
  IF EXISTS (SELECT 1 FROM public.list_inventory_balances() WHERE average_unit_cost IS NOT NULL OR inventory_value IS NOT NULL) THEN RAISE EXCEPTION 'Inventory cost leaked to employee'; END IF;
  BEGIN
    PERFORM public.create_inventory_document(
      'ADJUSTMENT', now(), '50000000-0000-0000-0000-000000000001', NULL,
      'Unauthorized adjustment', 'inv-no-adjust-001',
      jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000001','quantity',1,'unit','METER','input_unit_cost',1,'adjustment_direction','INCREASE')),
      NULL,NULL,NULL,'Test'
    );
    RAISE EXCEPTION 'Unauthorized adjustment unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Unauthorized adjustment unexpectedly succeeded' THEN RAISE; END IF; END;
END $$;

-- Reconciliation and audit as admin.
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', false);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.reconcile_inventory_balances() WHERE quantity_difference <> 0 OR value_difference <> 0) THEN RAISE EXCEPTION 'Ledger/balance reconciliation failed'; END IF;
  IF public.inventory_test_audit_count('inventory_documents', 'CONFIRM') = 0 THEN RAISE EXCEPTION 'Inventory confirm audit missing'; END IF;
  IF public.inventory_test_balance_count('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001') <> 1 THEN RAISE EXCEPTION 'NULL location balance uniqueness failed'; END IF;
  IF EXISTS (SELECT 1 FROM public.list_inventory_balances() WHERE quantity_on_hand > 0 AND average_unit_cost IS NULL) THEN RAISE EXCEPTION 'Admin cost visibility missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.get_inventory_dashboard_summary()
    WHERE active_item_count > 0 AND stocked_balance_count > 0 AND warehouse_count > 0 AND total_inventory_value IS NOT NULL
  ) THEN RAISE EXCEPTION 'Inventory dashboard summary is invalid for admin'; END IF;
END $$;

-- Hardening: stale drafts are rejected at confirm time.
DO $$
DECLARE v_doc jsonb;
BEGIN
  v_doc := public.create_inventory_document(
    'RECEIPT', '2026-08-12 08:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
    'Draft vật tư sẽ ngừng dùng', 'inv-stale-item-0001',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000004','quantity',1,'unit','PIECE','input_unit_cost',1000)),
    NULL, NULL, 'STALE-ITEM', NULL
  );
  UPDATE public.inventory_items SET is_active=false WHERE id='60000000-0000-0000-0000-000000000004';
  BEGIN
    PERFORM public.confirm_inventory_document((v_doc->>'id')::uuid);
    RAISE EXCEPTION 'Stale inactive item unexpectedly confirmed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='Stale inactive item unexpectedly confirmed' THEN RAISE; END IF;
  END;
  UPDATE public.inventory_items SET is_active=true WHERE id='60000000-0000-0000-0000-000000000004';
END $$;

-- Hardening: linked transaction type must match the inventory document.
DO $$
DECLARE
  v_type uuid := (SELECT id FROM public.transaction_types WHERE code='MATERIAL_ISSUE');
  v_center uuid := (SELECT id FROM public.cost_centers WHERE code='PROD_WAREHOUSE');
  v_object uuid := (SELECT id FROM public.cost_objects LIMIT 1);
  v_bt jsonb;
BEGIN
  v_bt := public.create_business_transaction(
    v_type, DATE '2026-08-12', 'Xuất vật tư nhưng link phiếu nhập', 'inventory-bt-type-0001',
    jsonb_build_array(jsonb_build_object('description','Xuất chỉ','quantity',1,'unit','cuộn','unit_price',30000,'vat_rate',0,'cost_center_id',v_center,'cost_object_id',v_object)),
    '[]'::jsonb, NULL, NULL, NULL, 'ISSUE-MISMATCH'
  );
  PERFORM public.confirm_business_transaction((v_bt->>'id')::uuid);
  IF EXISTS (
    SELECT 1 FROM public.list_inventory_business_transactions('RECEIPT')
    WHERE id = (v_bt->>'id')::uuid
  ) THEN RAISE EXCEPTION 'Receipt selector exposed MATERIAL_ISSUE transaction'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.list_inventory_business_transactions('ISSUE')
    WHERE id = (v_bt->>'id')::uuid
  ) THEN RAISE EXCEPTION 'Issue selector omitted eligible MATERIAL_ISSUE transaction'; END IF;
  BEGIN
    PERFORM public.create_inventory_document(
      'RECEIPT', '2026-08-12 12:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
      'Không được link phiếu nhập', 'inv-bt-type-link-001',
      jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000003','quantity',1,'unit','ROLL','input_unit_cost',30000)),
      (v_bt->>'id')::uuid, NULL, NULL, NULL
    );
    RAISE EXCEPTION 'Mismatched inventory transaction type unexpectedly linked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='Mismatched inventory transaction type unexpectedly linked' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.create_inventory_document(
      'OPENING_BALANCE', '2026-08-12 12:30:00+07', '50000000-0000-0000-0000-000000000001', NULL,
      'Tồn đầu kỳ không được link', 'inv-bt-open-link-0001',
      jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000003','quantity',1,'unit','ROLL','input_unit_cost',30000)),
      (v_bt->>'id')::uuid, NULL, NULL, 'Kiểm tra semantic link'
    );
    RAISE EXCEPTION 'Unsupported opening balance transaction link unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='Unsupported opening balance transaction link unexpectedly succeeded' THEN RAISE; END IF;
  END;
END $$;

-- Hardening: quantity-only auditors receive masked values and masked audit metadata.
RESET ROLE;
INSERT INTO public.employee_permissions (user_id, permission_type, enabled)
VALUES ('40000000-0000-0000-0000-000000000002', 'inventory_audit', true)
ON CONFLICT (user_id, permission_type) DO UPDATE SET enabled=true;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', false);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.reconcile_inventory_balances()
    WHERE ledger_value <> 0 OR balance_value <> 0 OR value_difference <> 0
  ) THEN RAISE EXCEPTION 'Reconciliation leaked inventory value'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.list_inventory_audit_events(50)) THEN
    RAISE EXCEPTION 'Masked inventory audit RPC returned no events';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.audit_events
    WHERE entity_type IN ('inventory_documents','inventory_document_lines')
  ) THEN RAISE EXCEPTION 'Raw inventory audit rows leaked without cost permission'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.get_inventory_dashboard_summary()
    WHERE total_inventory_value IS NOT NULL
  ) THEN RAISE EXCEPTION 'Inventory dashboard summary leaked inventory value'; END IF;
END $$;
RESET ROLE;
INSERT INTO public.employee_permissions (user_id, permission_type, enabled)
VALUES
  ('40000000-0000-0000-0000-000000000002', 'inventory_audit', false),
  ('40000000-0000-0000-0000-000000000002', 'inventory_cost_view', true)
ON CONFLICT (user_id, permission_type) DO UPDATE SET enabled=EXCLUDED.enabled;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', false);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.audit_events
    WHERE entity_type IN ('inventory_documents','inventory_document_lines')
  ) THEN RAISE EXCEPTION 'Inventory cost permission bypassed inventory audit permission'; END IF;
END $$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', false);

-- Hardening: reconciliation must report a ledger key even if its balance row is missing.
DO $$
BEGIN
  IF NOT public.inventory_test_ledger_only_reconciliation(
    '60000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001'
  ) THEN RAISE EXCEPTION 'Ledger-only inventory key was not reconciled'; END IF;
END $$;

RESET ROLE;

-- Prepare documents for the PowerShell runner to confirm through separate PostgreSQL sessions.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', false);
DO $$
DECLARE v_open jsonb; v_issue_a jsonb; v_issue_b jsonb; v_receipt_a jsonb; v_receipt_b jsonb;
BEGIN
  v_open := public.create_inventory_document(
    'OPENING_BALANCE', '2026-08-01 07:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
    'Tồn đầu kỳ test xuất đồng thời', 'inv-concurrent-issue-open',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000006','quantity',1000,'unit','METER','input_unit_cost',40000)),
    NULL, NULL, 'CONCURRENT-ISSUE-OPEN', 'Khởi tạo test'
  );
  PERFORM public.confirm_inventory_document((v_open->>'id')::uuid);
  v_issue_a := public.create_inventory_document(
    'ISSUE', '2026-08-02 07:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
    'Xuất đồng thời A', 'inv-concurrent-issue-a',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000006','quantity',600,'unit','METER')),
    NULL, NULL, 'CONCURRENT-ISSUE-A', NULL
  );
  v_issue_b := public.create_inventory_document(
    'ISSUE', '2026-08-02 07:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
    'Xuất đồng thời B', 'inv-concurrent-issue-b',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000006','quantity',600,'unit','METER')),
    NULL, NULL, 'CONCURRENT-ISSUE-B', NULL
  );
  INSERT INTO public.inventory_test_state(key,value) VALUES
    ('concurrent_issue_a', v_issue_a->>'id'), ('concurrent_issue_b', v_issue_b->>'id');

  v_open := public.create_inventory_document(
    'OPENING_BALANCE', '2026-08-01 07:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
    'Tồn đầu kỳ test nhập đồng thời', 'inv-concurrent-receipt-open',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000007','quantity',1000,'unit','METER','input_unit_cost',40000)),
    NULL, NULL, 'CONCURRENT-RECEIPT-OPEN', 'Khởi tạo test'
  );
  PERFORM public.confirm_inventory_document((v_open->>'id')::uuid);
  v_receipt_a := public.create_inventory_document(
    'RECEIPT', '2026-08-02 07:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
    'Nhập đồng thời A', 'inv-concurrent-receipt-a',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000007','quantity',500,'unit','METER','input_unit_cost',44000)),
    NULL, NULL, 'CONCURRENT-RECEIPT-A', NULL
  );
  v_receipt_b := public.create_inventory_document(
    'RECEIPT', '2026-08-02 07:00:00+07', '50000000-0000-0000-0000-000000000001', NULL,
    'Nhập đồng thời B', 'inv-concurrent-receipt-b',
    jsonb_build_array(jsonb_build_object('inventory_item_id','60000000-0000-0000-0000-000000000007','quantity',500,'unit','METER','input_unit_cost',46000)),
    NULL, NULL, 'CONCURRENT-RECEIPT-B', NULL
  );
  INSERT INTO public.inventory_test_state(key,value) VALUES
    ('concurrent_receipt_a', v_receipt_a->>'id'), ('concurrent_receipt_b', v_receipt_b->>'id');
END $$;
RESET ROLE;

SELECT 'inventory_material_costing_test: PASS' AS result;
