\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('80000000-0000-0000-0000-000000000001', 'prod.admin@test.local'),
  ('80000000-0000-0000-0000-000000000002', 'prod.employee@test.local');
INSERT INTO public.user_roles (user_id, role, assigned_by) VALUES
  ('80000000-0000-0000-0000-000000000001', 'admin', NULL),
  ('80000000-0000-0000-0000-000000000002', 'employee', '80000000-0000-0000-000000000001');
INSERT INTO public.employee_permissions (user_id, permission_type, enabled) VALUES
  ('80000000-0000-0000-0000-000000000002', 'production_view', true);

INSERT INTO public.products (id, tenant_id) VALUES
  ('81000000-0000-0000-0000-000000000001', 'default'),
  ('81000000-0000-0000-0000-000000000002', 'default'),
  ('81000000-0000-0000-0000-000000000003', 'default'),
  ('81000000-0000-0000-0000-000000000004', 'default'),
  ('81000000-0000-0000-0000-000000000005', 'default'),
  ('81000000-0000-0000-0000-000000000006', 'tenant-b');

INSERT INTO public.inventory_items (id, tenant_id, code, name, item_type, base_unit) VALUES
  ('82000000-0000-0000-0000-000000000001', 'default', 'PROD-FABRIC', 'Vải T250', 'RAW_MATERIAL', 'METER'),
  ('82000000-0000-0000-0000-000000000002', 'default', 'PROD-ELASTIC', 'Chun', 'SUPPLY', 'METER'),
  ('82000000-0000-0000-0000-000000000003', 'default', 'PROD-LABEL', 'Nhãn', 'PACKAGING', 'PIECE'),
  ('82000000-0000-0000-0000-000000000004', 'default', 'PROD-BAG', 'Túi', 'PACKAGING', 'PIECE'),
  ('82000000-0000-0000-0000-000000000005', 'tenant-b', 'PROD-FOREIGN', 'Vật tư tenant B', 'RAW_MATERIAL', 'METER');

INSERT INTO public.warehouses (id, name, tenant_id, is_active)
VALUES ('83000000-0000-0000-0000-000000000001', 'Kho SX test', 'default', true);

SELECT set_config('app.inventory_posting', 'on', true);
INSERT INTO public.inventory_balances (tenant_id, inventory_item_id, warehouse_id, quantity_on_hand, average_unit_cost, inventory_value) VALUES
  ('default', '82000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', 5000, 42000, 210000000),
  ('default', '82000000-0000-0000-0000-000000000002', '83000000-0000-0000-0000-000000000001', 5000, 5000, 25000000),
  ('default', '82000000-0000-0000-0000-000000000003', '83000000-0000-0000-0000-000000000001', 5000, 1000, 5000000),
  ('default', '82000000-0000-0000-0000-000000000004', '83000000-0000-0000-0000-000000000001', 5000, 2000, 10000000);
SELECT set_config('app.inventory_posting', 'off', true);

CREATE TEMP TABLE prod_test_state (key text PRIMARY KEY, value text NOT NULL);
GRANT ALL ON TABLE prod_test_state TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', true);

-- ── Manufacturing profile, BOM and Routing for golden product ──
DO $$ DECLARE v_bom jsonb; v_ver uuid; v_routing jsonb; v_rver uuid; BEGIN
  PERFORM public.save_product_manufacturing_profile('81000000-0000-0000-0000-000000000001','GENERIC_SEWN_PRODUCT',180,200,NULL,'CM','{}'::jsonb,true);
  v_bom := public.create_bom_draft('81000000-0000-0000-0000-000000000001','BOM-PROD-GOLDEN','BOM Golden',NULL);
  v_ver := (v_bom->'version'->>'id')::uuid;
  PERFORM public.save_bom_draft(v_ver, DATE '2026-01-01', NULL, 'Golden BOM', jsonb_build_array(
    jsonb_build_object('inventory_item_id','82000000-0000-0000-0000-000000000001','quantity_method','PER_UNIT','standard_quantity',3.2,'unit','METER','sequence',1),
    jsonb_build_object('inventory_item_id','82000000-0000-0000-0000-000000000002','quantity_method','PER_UNIT','standard_quantity',8,'unit','METER','sequence',2),
    jsonb_build_object('inventory_item_id','82000000-0000-0000-0000-000000000003','quantity_method','PER_UNIT','standard_quantity',1,'unit','PIECE','sequence',3)
  ));
  PERFORM public.approve_bom_version(v_ver, 'Golden approve', true);
  INSERT INTO prod_test_state VALUES ('bom_golden_version', v_ver::text);

  v_routing := public.create_routing_draft('81000000-0000-0000-0000-000000000001','RT-GOLDEN','Routing Golden',NULL);
  v_rver := (v_routing->'version'->>'id')::uuid;
  PERFORM public.save_routing_draft(v_rver, DATE '2026-01-01', NULL, 'Golden routing', jsonb_build_array(
    jsonb_build_object('operation_code','CUT','operation_name','Cắt','sequence',10,'standard_minutes_per_unit',2,'setup_minutes',0,'is_optional',false),
    jsonb_build_object('operation_code','SEW','operation_name','May','sequence',20,'standard_minutes_per_unit',12,'setup_minutes',0,'is_optional',false),
    jsonb_build_object('operation_code','QC','operation_name','QC','sequence',30,'standard_minutes_per_unit',1,'setup_minutes',0,'is_optional',false),
    jsonb_build_object('operation_code','PACK','operation_name','Đóng gói','sequence',40,'standard_minutes_per_unit',1,'setup_minutes',0,'is_optional',false)
  ));
  PERFORM public.approve_routing_version(v_rver, 'Golden routing approve', true);
  INSERT INTO prod_test_state VALUES ('routing_golden_version', v_rver::text);

  -- Second product for cross-tenant / no-BOM tests
  PERFORM public.save_product_manufacturing_profile('81000000-0000-0000-0000-000000000002','GENERIC_SEWN_PRODUCT',100,100,NULL,'CM','{}'::jsonb,true);
END $$;

-- ── GOLDEN TEST: Release 100 units snapshots ──
DO $$ DECLARE v_po jsonb; v_po_id uuid; v_reqs integer; v_ops integer; v_total numeric; BEGIN
  v_po := public.create_production_order('81000000-0000-0000-0000-000000000001', 100, 'MANUAL', NULL, DATE '2026-06-01', DATE '2026-06-10', NULL);
  v_po_id := (v_po->>'id')::uuid;
  INSERT INTO prod_test_state VALUES ('po_golden_id', v_po_id::text);
  v_po := public.release_production_order(v_po_id, DATE '2026-06-01');
  IF (v_po->>'status') <> 'RELEASED' THEN RAISE EXCEPTION 'Release failed: %', v_po; END IF;
  SELECT count(*) INTO v_reqs FROM public.production_order_material_requirements WHERE production_order_id=v_po_id;
  IF v_reqs <> 3 THEN RAISE EXCEPTION 'Expected 3 material requirements, got %', v_reqs; END IF;
  IF (SELECT standard_quantity FROM public.production_order_material_requirements WHERE production_order_id=v_po_id AND inventory_item_id='82000000-0000-0000-0000-000000000001') <> 320 THEN
    RAISE EXCEPTION 'Fabric requirement not 320m';
  END IF;
  IF (SELECT standard_quantity FROM public.production_order_material_requirements WHERE production_order_id=v_po_id AND inventory_item_id='82000000-0000-0000-0000-000000000002') <> 800 THEN
    RAISE EXCEPTION 'Elastic requirement not 800m';
  END IF;
  IF (SELECT standard_quantity FROM public.production_order_material_requirements WHERE production_order_id=v_po_id AND inventory_item_id='82000000-0000-0000-0000-000000000003') <> 100 THEN
    RAISE EXCEPTION 'Label requirement not 100';
  END IF;
  SELECT count(*) INTO v_ops FROM public.production_order_operations WHERE production_order_id=v_po_id;
  IF v_ops <> 4 THEN RAISE EXCEPTION 'Expected 4 operations, got %', v_ops; END IF;
  SELECT standard_minutes_total INTO v_total FROM public.production_orders WHERE id=v_po_id;
  IF v_total <> 1600 THEN RAISE EXCEPTION 'Expected total 1600 minutes, got %', v_total; END IF;
  IF (SELECT standard_total_minutes FROM public.production_order_operations WHERE production_order_id=v_po_id AND operation_code='CUT') <> 200 THEN RAISE EXCEPTION 'CUT not 200'; END IF;
  IF (SELECT standard_total_minutes FROM public.production_order_operations WHERE production_order_id=v_po_id AND operation_code='SEW') <> 1200 THEN RAISE EXCEPTION 'SEW not 1200'; END IF;
END $$;

-- ── Master change after release must not affect old PO ──
DO $$ DECLARE v_bom jsonb; v_v2 uuid; v_po_id uuid := (SELECT value::uuid FROM prod_test_state WHERE key='po_golden_id'); v_req numeric; BEGIN
  v_bom := public.create_bom_draft('81000000-0000-0000-0000-000000000001','BOM-PROD-GOLDEN','BOM Golden V2', (SELECT value::uuid FROM prod_test_state WHERE key='bom_golden_version'));
  v_v2 := (v_bom->'version'->>'id')::uuid;
  PERFORM public.save_bom_draft(v_v2, DATE '2026-07-01', NULL, 'V2', jsonb_build_array(
    jsonb_build_object('inventory_item_id','82000000-0000-0000-0000-000000000001','quantity_method','PER_UNIT','standard_quantity',99,'unit','METER','sequence',1)
  ));
  PERFORM public.approve_bom_version(v_v2, 'V2 approve', true);
  SELECT standard_quantity INTO v_req FROM public.production_order_material_requirements WHERE production_order_id=v_po_id AND inventory_item_id='82000000-0000-0000-0000-000000000001';
  IF v_req <> 320 THEN RAISE EXCEPTION 'Old PO snapshot changed after BOM V2: %', v_req; END IF;
END $$;

-- ── Routing effective-date resolution: 2026 V1 vs 2027 V2 ──
DO $$ DECLARE v_v2 jsonb; v_id uuid; BEGIN
  v_v2 := public.create_routing_draft('81000000-0000-0000-0000-000000000001','RT-GOLDEN','Routing V2', (SELECT value::uuid FROM prod_test_state WHERE key='routing_golden_version'));
  v_id := (v_v2->'version'->>'id')::uuid;
  PERFORM public.save_routing_draft(v_id, DATE '2027-01-01', NULL, 'V2', jsonb_build_array(
    jsonb_build_object('operation_code','CUT','operation_name','Cắt V2','sequence',10,'standard_minutes_per_unit',5,'setup_minutes',0,'is_optional',false)
  ));
  PERFORM public.approve_routing_version(v_id, 'V2 2027', true);
  IF public.resolve_effective_routing_version('81000000-0000-0000-0000-000000000001', DATE '2026-06-01') <> (SELECT value::uuid FROM prod_test_state WHERE key='routing_golden_version') THEN
    RAISE EXCEPTION 'Routing 2026 resolution failed';
  END IF;
  IF public.resolve_effective_routing_version('81000000-0000-0000-0000-000000000001', DATE '2027-06-01') <> v_id THEN
    RAISE EXCEPTION 'Routing 2027 resolution failed';
  END IF;
END $$;

-- ── Partial issue / return / actual consumption variance ──
DO $$ DECLARE v_po_id uuid := (SELECT value::uuid FROM prod_test_state WHERE key='po_golden_id'); v_doc jsonb; v_doc_id uuid; v_var jsonb; v_row jsonb; BEGIN
  -- Issue 200m fabric
  v_doc := public.create_inventory_document('ISSUE', now(), '83000000-0000-0000-0000-000000000001', NULL, 'Cap vai dot 1', 'prod-issue-001', jsonb_build_array(jsonb_build_object('inventory_item_id','82000000-0000-0000-0000-000000000001','quantity',200,'unit','METER')), NULL, NULL, NULL, NULL, v_po_id);
  v_doc_id := (v_doc->>'id')::uuid;
  PERFORM public.confirm_inventory_document(v_doc_id);
  -- Issue 125m fabric
  v_doc := public.create_inventory_document('ISSUE', now(), '83000000-0000-0000-0000-000000000001', NULL, 'Cap vai dot 2', 'prod-issue-002', jsonb_build_array(jsonb_build_object('inventory_item_id','82000000-0000-0000-0000-000000000001','quantity',125,'unit','METER')), NULL, NULL, NULL, NULL, v_po_id);
  v_doc_id := (v_doc->>'id')::uuid;
  PERFORM public.confirm_inventory_document(v_doc_id);
  -- Return 3m (need source movement)
  DECLARE v_src uuid; BEGIN
    SELECT id INTO v_src FROM public.inventory_movements WHERE document_id = (SELECT id FROM public.inventory_documents WHERE idempotency_key='prod-issue-002') LIMIT 1;
    v_doc := public.create_inventory_document('RETURN_IN', now(), '83000000-0000-0000-0000-000000000001', NULL, 'Tra vai', 'prod-return-001', jsonb_build_array(jsonb_build_object('inventory_item_id','82000000-0000-0000-0000-000000000001','quantity',3,'unit','METER','source_movement_id',v_src::text)), NULL, NULL, NULL, NULL, v_po_id);
    v_doc_id := (v_doc->>'id')::uuid;
    PERFORM public.confirm_inventory_document(v_doc_id);
  END;
  v_var := public.get_production_order_variance(v_po_id);
  SELECT value INTO v_row FROM jsonb_array_elements(v_var->'materials') value WHERE value->>'inventory_item_id'='82000000-0000-0000-0000-000000000001';
  IF (v_row->>'issued_quantity')::numeric <> 325 THEN RAISE EXCEPTION 'Issued not 325: %', v_row; END IF;
  IF (v_row->>'returned_quantity')::numeric <> 3 THEN RAISE EXCEPTION 'Returned not 3: %', v_row; END IF;
  IF (v_row->>'actual_consumption_quantity')::numeric <> 322 THEN RAISE EXCEPTION 'Actual not 322: %', v_row; END IF;
  IF (v_row->>'quantity_variance')::numeric <> 2 THEN RAISE EXCEPTION 'Variance not 2: %', v_row; END IF;
END $$;

-- ── Actual material cost: issue 320m @ 42000, return 3m @ source cost ──
DO $$ DECLARE v_var jsonb; v_row jsonb; v_cost numeric; BEGIN
  v_var := public.get_production_order_variance((SELECT value::uuid FROM prod_test_state WHERE key='po_golden_id'));
  SELECT value INTO v_row FROM jsonb_array_elements(v_var->'materials') value WHERE value->>'inventory_item_id'='82000000-0000-0000-0000-000000000001';
  v_cost := (v_row->>'actual_material_cost')::numeric;
  -- 322 * 42000 = 13524000
  IF v_cost <> 13524000 THEN RAISE EXCEPTION 'Actual material cost not 13524000 got %', v_cost; END IF;
END $$;

-- ── No stock: attempt issue 10000m must fail at ledger level ──
DO $$ DECLARE v_po_id uuid; v_doc jsonb; v_doc_id uuid; BEGIN
  v_po_id := (SELECT value::uuid FROM prod_test_state WHERE key='po_golden_id');
  BEGIN
    v_doc := public.create_inventory_document('ISSUE', now(), '83000000-0000-0000-0000-000000000001', NULL, 'Cap qua ton', 'prod-issue-nostock', jsonb_build_array(jsonb_build_object('inventory_item_id','82000000-0000-0000-0000-000000000001','quantity',10000,'unit','METER')), NULL, NULL, NULL, NULL, v_po_id);
    v_doc_id := (v_doc->>'id')::uuid;
    PERFORM public.confirm_inventory_document(v_doc_id);
    RAISE EXCEPTION 'Over-stock issue unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Over-stock issue unexpectedly succeeded' THEN RAISE; END IF; END;
END $$;

-- ── Scrap / Rework ──
DO $$ DECLARE v_po_id uuid := (SELECT value::uuid FROM prod_test_state WHERE key='po_golden_id'); BEGIN
  PERFORM public.record_production_scrap(v_po_id, 1, 'CUTTING_ERROR', NULL);
  PERFORM public.record_production_rework(v_po_id, 2, 'SEWING_ERROR', NULL, NULL);
  IF (SELECT quantity_scrap FROM public.production_orders WHERE id=v_po_id) <> 1 THEN RAISE EXCEPTION 'Scrap not 1'; END IF;
  IF (SELECT quantity_rework FROM public.production_orders WHERE id=v_po_id) <> 2 THEN RAISE EXCEPTION 'Rework not 2'; END IF;
END $$;

-- ── Labor: start operations, log durations, variance ──
DO $$ DECLARE v_po_id uuid := (SELECT value::uuid FROM prod_test_state WHERE key='po_golden_id'); v_cut uuid; v_sew uuid; BEGIN
  SELECT id INTO v_cut FROM public.production_order_operations WHERE production_order_id=v_po_id AND operation_code='CUT';
  SELECT id INTO v_sew FROM public.production_order_operations WHERE production_order_id=v_po_id AND operation_code='SEW';
  PERFORM public.start_production_operation(v_cut, NULL);
  PERFORM public.complete_production_operation(v_cut, 100, 0, 0, NULL);
  PERFORM public.start_production_operation(v_sew, NULL);
  -- Log an explicit duration for labor variance: COMPLETE with time range
  PERFORM public.log_production_operation(v_sew, 'COMPLETE', NULL, 98, NULL, now() - interval '1350 minutes', now(), 'SEW complete');
  PERFORM public.complete_production_operation(v_sew, 98, 1, 1, NULL);
  -- Complete remaining ops to allow PO completion
  DECLARE v_qc uuid; v_pack uuid; BEGIN
    SELECT id INTO v_qc FROM public.production_order_operations WHERE production_order_id=v_po_id AND operation_code='QC';
    SELECT id INTO v_pack FROM public.production_order_operations WHERE production_order_id=v_po_id AND operation_code='PACK';
    PERFORM public.start_production_operation(v_qc, NULL);
    PERFORM public.complete_production_operation(v_qc, 97, 0, 0, NULL);
    PERFORM public.start_production_operation(v_pack, NULL);
    PERFORM public.complete_production_operation(v_pack, 97, 0, 0, NULL);
  END;
END $$;

DO $$ DECLARE v_var jsonb; BEGIN
  v_var := public.get_production_labor_variance((SELECT value::uuid FROM prod_test_state WHERE key='po_golden_id'));
  IF (v_var->>'standard_minutes')::numeric <> 1600 THEN RAISE EXCEPTION 'Labor standard not 1600: %', v_var; END IF;
  -- Actual is at least 1350 from SEW log; check variance logic is valid
  IF (v_var->>'actual_minutes')::numeric < 1300 THEN RAISE EXCEPTION 'Labor actual too low: %', v_var; END IF;
END $$;

-- ── Complete blocker: mandatory operation not completed must fail ──
DO $$ DECLARE v_po2 jsonb; v_po2_id uuid; BEGIN
  -- create a fresh PO with same golden setup but will not complete operations
  v_po2 := public.create_production_order('81000000-0000-0000-0000-000000000001', 10, 'MANUAL', NULL, NULL, NULL, NULL);
  v_po2_id := (v_po2->>'id')::uuid;
  PERFORM public.release_production_order(v_po2_id, DATE '2026-06-01');
  INSERT INTO prod_test_state VALUES ('po_blocker_id', v_po2_id::text);
  BEGIN
    PERFORM public.complete_production_order(v_po2_id, 10, 0, NULL);
    RAISE EXCEPTION 'Complete blocker unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Complete blocker unexpectedly succeeded' THEN RAISE; END IF; END;
END $$;

-- ── Idempotent complete ──
DO $$ DECLARE v_po_id uuid := (SELECT value::uuid FROM prod_test_state WHERE key='po_golden_id'); v_r1 jsonb; v_r2 jsonb; BEGIN
  v_r1 := public.complete_production_order(v_po_id, 97, 1, NULL);
  v_r2 := public.complete_production_order(v_po_id, 97, 1, NULL);
  IF (v_r2->>'reused')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Second complete not idempotent'; END IF;
  IF (SELECT count(*) FROM public.production_outputs WHERE production_order_id=v_po_id) <> 1 THEN RAISE EXCEPTION 'Duplicate output created'; END IF;
END $$;

-- ── Direct API bypass must be blocked ──
DO $$ DECLARE v_po_id uuid := (SELECT value::uuid FROM prod_test_state WHERE key='po_golden_id'); BEGIN
  BEGIN
    UPDATE public.production_orders SET bom_version_id = gen_random_uuid() WHERE id=v_po_id;
    RAISE EXCEPTION 'Direct BOM snapshot bypass unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Direct BOM snapshot bypass unexpectedly succeeded' THEN RAISE; END IF; END;
  BEGIN
    UPDATE public.production_order_operations SET standard_total_minutes = 999 WHERE production_order_id=v_po_id;
    RAISE EXCEPTION 'Direct standard minutes bypass unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Direct standard minutes bypass unexpectedly succeeded' THEN RAISE; END IF; END;
  BEGIN
    UPDATE public.production_operation_logs SET notes='tampered' WHERE tenant_id='default';
    RAISE EXCEPTION 'Log mutation bypass unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Log mutation bypass unexpectedly succeeded' THEN RAISE; END IF; END;
END $$;

-- ── Routing immutability ──
DO $$ DECLARE v_v1 uuid := (SELECT value::uuid FROM prod_test_state WHERE key='routing_golden_version'); BEGIN
  BEGIN
    UPDATE public.routing_versions SET notes='tampered' WHERE id=v_v1;
    RAISE EXCEPTION 'Approved routing mutation unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Approved routing mutation unexpectedly succeeded' THEN RAISE; END IF; END;
END $$;

-- ── Invalid state transition ──
DO $$ DECLARE v_completed uuid := (SELECT value::uuid FROM prod_test_state WHERE key='po_golden_id'); BEGIN
  BEGIN
    PERFORM public.transition_production_order_status(v_completed, 'DRAFT', NULL);
    RAISE EXCEPTION 'Invalid transition COMPLETED->DRAFT unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Invalid transition COMPLETED->DRAFT unexpectedly succeeded' THEN RAISE; END IF; END;
END $$;

-- ── Cross-tenant: tenant-b product cannot be used from default context ──
-- The function validates tenant via products.tenant_id, so a product in tenant-b
-- should fail when the caller tenant is 'default'.
DO $$ BEGIN
  BEGIN
    PERFORM public.create_production_order('81000000-0000-0000-0000-000000000006', 10, 'MANUAL', NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'Cross-tenant product unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Cross-tenant product unexpectedly succeeded' THEN RAISE; END IF; END;
END $$;

-- ── Release without BOM must fail ──
DO $$ BEGIN
  BEGIN
    PERFORM public.create_production_order('81000000-0000-0000-0000-000000000004', 10, 'MANUAL', NULL, NULL, NULL, NULL);
    -- product 000004 has no BOM; try release
    DECLARE v_po jsonb; v_id uuid; BEGIN
      v_po := public.create_production_order('81000000-0000-0000-0000-000000000004', 10, 'MANUAL', NULL, NULL, NULL, NULL);
      v_id := (v_po->>'id')::uuid;
      PERFORM public.release_production_order(v_id, DATE '2026-06-01');
      RAISE EXCEPTION 'Release without BOM unexpectedly succeeded';
    EXCEPTION WHEN OTHERS THEN IF SQLERRM='Release without BOM unexpectedly succeeded' THEN RAISE; END IF; END;
  END;
END $$;

-- ── Sequential operation guard: SEW before CUT must fail ──
DO $$ DECLARE v_po jsonb; v_po_id uuid; v_sew uuid; BEGIN
  v_po := public.create_production_order('81000000-0000-0000-0000-000000000001', 5, 'MANUAL', NULL, NULL, NULL, NULL);
  v_po_id := (v_po->>'id')::uuid;
  PERFORM public.release_production_order(v_po_id, DATE '2026-06-01');
  SELECT id INTO v_sew FROM public.production_order_operations WHERE production_order_id=v_po_id AND operation_code='SEW';
  BEGIN
    PERFORM public.start_production_operation(v_sew, NULL);
    RAISE EXCEPTION 'Sequential guard unexpectedly bypassed';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Sequential guard unexpectedly bypassed' THEN RAISE; END IF; END;
END $$;

-- ── Cost visibility: employee without inventory_cost_view must not see actual_material_cost ──
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', true);
DO $$ DECLARE v_var jsonb; v_row jsonb; BEGIN
  v_var := public.get_production_order_variance((SELECT value::uuid FROM prod_test_state WHERE key='po_golden_id'));
  IF (v_var->>'cost_visible')::boolean IS TRUE THEN RAISE EXCEPTION 'Cost leaked to quantity-only employee'; END IF;
  SELECT value INTO v_row FROM jsonb_array_elements(v_var->'materials') LIMIT 1;
  IF v_row->>'actual_material_cost' IS NOT NULL THEN RAISE EXCEPTION 'Actual cost leaked'; END IF;
END $$;
RESET ROLE;

-- ── Audit exists ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.audit_events WHERE entity_type='production_orders' AND action='RELEASE') THEN RAISE EXCEPTION 'Production RELEASE audit missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_events WHERE entity_type='production_orders' AND action='COMPLETE') THEN RAISE EXCEPTION 'Production COMPLETE audit missing'; END IF;
END $$;

ROLLBACK;

SELECT 'production_execution_test: PASS' AS result;
