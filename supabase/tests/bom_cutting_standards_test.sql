\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('70000000-0000-0000-0000-000000000001', 'bom.admin@test.local'),
  ('70000000-0000-0000-0000-000000000002', 'bom.employee@test.local');
INSERT INTO public.user_roles (user_id, role, assigned_by) VALUES
  ('70000000-0000-0000-0000-000000000001', 'admin', NULL),
  ('70000000-0000-0000-0000-000000000002', 'employee', '70000000-0000-0000-0000-000000000001');
INSERT INTO public.employee_permissions (user_id, permission_type, enabled) VALUES
  ('70000000-0000-0000-0000-000000000002', 'bom_view', true);

INSERT INTO public.products (id, tenant_id) VALUES
  ('71000000-0000-0000-0000-000000000001', 'default'),
  ('71000000-0000-0000-0000-000000000002', 'default'),
  ('71000000-0000-0000-0000-000000000003', 'default'),
  ('71000000-0000-0000-0000-000000000004', 'default'),
  ('71000000-0000-0000-0000-000000000006', 'default'),
  ('71000000-0000-0000-0000-000000000007', 'default'),
  ('71000000-0000-0000-0000-000000000008', 'default'),
  ('71000000-0000-0000-0000-000000000009', 'default'),
  ('71000000-0000-0000-0000-000000000005', 'tenant-b');

INSERT INTO public.inventory_items (id, tenant_id, code, name, item_type, base_unit) VALUES
  ('72000000-0000-0000-0000-000000000001', 'default', 'BOM-LABEL', 'Nhãn BOM', 'PACKAGING', 'PIECE'),
  ('72000000-0000-0000-0000-000000000002', 'default', 'BOM-FABRIC', 'Vải BOM', 'RAW_MATERIAL', 'METER'),
  ('72000000-0000-0000-0000-000000000003', 'default', 'BOM-WASTE', 'Vải test hao hụt', 'RAW_MATERIAL', 'METER'),
  ('72000000-0000-0000-0000-000000000004', 'default', 'BOM-INACTIVE', 'Vật tư sẽ ngừng hoạt động', 'SUPPLY', 'PIECE'),
  ('72000000-0000-0000-0000-000000000005', 'tenant-b', 'BOM-FOREIGN', 'Vật tư tenant B', 'RAW_MATERIAL', 'METER'),
  ('72000000-0000-0000-0000-000000000006', 'default', 'BOM-BAG', 'Túi BOM', 'PACKAGING', 'PIECE');

INSERT INTO public.warehouses (id, name, tenant_id, is_active)
VALUES ('73000000-0000-0000-0000-000000000001', 'Kho BOM test', 'default', true);

SELECT set_config('app.inventory_posting', 'on', true);
INSERT INTO public.inventory_balances (
  tenant_id, inventory_item_id, warehouse_id, quantity_on_hand, average_unit_cost, inventory_value
) VALUES
  ('default', '72000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', 10000, 1000, 10000000),
  ('default', '72000000-0000-0000-0000-000000000002', '73000000-0000-0000-0000-000000000001', 1000, 45000, 45000000),
  ('default', '72000000-0000-0000-0000-000000000003', '73000000-0000-0000-0000-000000000001', 1000, 20000, 20000000),
  ('default', '72000000-0000-0000-0000-000000000004', '73000000-0000-0000-0000-000000000001', 1000, 500, 500000);
SELECT set_config('app.inventory_posting', 'off', true);

CREATE TEMP TABLE bom_test_state (key text PRIMARY KEY, value text NOT NULL);
GRANT ALL ON TABLE bom_test_state TO authenticated;

CREATE OR REPLACE FUNCTION public.bom_test_inventory_state()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'movement_count', (SELECT count(*) FROM public.inventory_movements),
    'balance_quantity', (SELECT COALESCE(sum(quantity_on_hand),0) FROM public.inventory_balances)
  )
$$;
GRANT EXECUTE ON FUNCTION public.bom_test_inventory_state() TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);

-- Structured manufacturing dimensions.
DO $$ DECLARE v_result jsonb; BEGIN
  v_result := public.save_product_manufacturing_profile(
    '71000000-0000-0000-0000-000000000001', 'GENERIC_SEWN_PRODUCT', 70, 100, NULL, 'CM', '{}'::jsonb, true
  );
  IF v_result->>'manufacturing_type' <> 'GENERIC_SEWN_PRODUCT' THEN RAISE EXCEPTION 'Manufacturing profile save failed'; END IF;
END $$;

-- 280 cm / 70 cm = four pieces across; quantity eight = two rows.
DO $$ DECLARE v_created jsonb; v_version uuid; v_result jsonb; BEGIN
  v_created := public.create_cutting_profile_draft(
    '71000000-0000-0000-0000-000000000001', 'CUT-GRID-280', 'Grid 280 test', 'GENERIC_SEWN_PRODUCT', NULL
  );
  v_version := (v_created->'version'->>'id')::uuid;
  PERFORM public.save_cutting_profile_draft(v_version, DATE '2026-01-01', NULL, jsonb_build_object(
    'piece_width_rule','FINISHED_WIDTH','piece_length_rule','FINISHED_LENGTH','pieces_per_product',1,
    'default_fabric_width_cm',280,'allow_rotation',false,'pattern_direction','NONE',
    'standard_waste_rate',0,'issue_rounding_increment',0.0001,'joining_allowed',false,'joining_rule','NONE'
  ));
  PERFORM public.approve_cutting_profile_version(v_version, 'Golden grid', true);
  v_result := public.calculate_cutting_consumption(v_version, 8, 280, false);
  IF v_result->>'status' <> 'FEASIBLE' OR (v_result->>'pieces_across')::integer <> 4 OR (v_result->>'rows')::integer <> 2 THEN
    RAISE EXCEPTION 'Pieces-across golden test failed: %', v_result;
  END IF;
  INSERT INTO bom_test_state VALUES ('grid_cutting_version', v_version::text);
END $$;

-- Whole-batch layout must differ from multiplying the single result.
DO $$ DECLARE v_version uuid := (SELECT value::uuid FROM bom_test_state WHERE key='grid_cutting_version'); v_one jsonb; v_eight jsonb; BEGIN
  v_one := public.calculate_cutting_consumption(v_version, 1, 280, false);
  v_eight := public.calculate_cutting_consumption(v_version, 8, 280, false);
  IF (v_eight->>'final_issue_recommendation_m')::numeric = (v_one->>'final_issue_recommendation_m')::numeric * 8 THEN
    RAISE EXCEPTION 'Batch calculation incorrectly multiplied a single-unit result';
  END IF;
END $$;

-- Rotation disabled versus enabled; one-direction pattern must block rotation.
DO $$ DECLARE
  v_created jsonb; v_disabled uuid; v_enabled uuid; v_directional uuid;
  v_disabled_result jsonb; v_enabled_result jsonb; v_directional_result jsonb;
BEGIN
  PERFORM public.save_product_manufacturing_profile(
    '71000000-0000-0000-0000-000000000002', 'GENERIC_SEWN_PRODUCT', 150, 70, NULL, 'CM', '{}'::jsonb, true
  );
  v_created := public.create_cutting_profile_draft('71000000-0000-0000-0000-000000000002','CUT-ROTATE-OFF','Rotation off','GENERIC_SEWN_PRODUCT',NULL);
  v_disabled := (v_created->'version'->>'id')::uuid;
  PERFORM public.save_cutting_profile_draft(v_disabled,DATE '2026-01-01',NULL,jsonb_build_object(
    'default_fabric_width_cm',280,'allow_rotation',false,'pattern_direction','NONE','joining_allowed',false,'joining_rule','NONE'
  ));
  PERFORM public.approve_cutting_profile_version(v_disabled,'Rotation off',true);

  v_created := public.create_cutting_profile_draft('71000000-0000-0000-0000-000000000002','CUT-ROTATE-ON','Rotation on','GENERIC_SEWN_PRODUCT',NULL);
  v_enabled := (v_created->'version'->>'id')::uuid;
  PERFORM public.save_cutting_profile_draft(v_enabled,DATE '2026-01-01',NULL,jsonb_build_object(
    'default_fabric_width_cm',280,'allow_rotation',true,'pattern_direction','BIDIRECTIONAL','joining_allowed',false,'joining_rule','NONE'
  ));
  PERFORM public.approve_cutting_profile_version(v_enabled,'Rotation on',true);

  v_created := public.create_cutting_profile_draft('71000000-0000-0000-0000-000000000002','CUT-ROTATE-DIRECTION','Directional','GENERIC_SEWN_PRODUCT',NULL);
  v_directional := (v_created->'version'->>'id')::uuid;
  PERFORM public.save_cutting_profile_draft(v_directional,DATE '2026-01-01',NULL,jsonb_build_object(
    'default_fabric_width_cm',280,'allow_rotation',true,'pattern_direction','ONE_DIRECTION','joining_allowed',false,'joining_rule','NONE'
  ));
  PERFORM public.approve_cutting_profile_version(v_directional,'Directional',true);

  v_disabled_result := public.calculate_cutting_consumption(v_disabled,4,280,false);
  v_enabled_result := public.calculate_cutting_consumption(v_enabled,4,280,false);
  v_directional_result := public.calculate_cutting_consumption(v_directional,4,280,false);
  IF v_disabled_result->>'selected_orientation' <> 'NORMAL' THEN RAISE EXCEPTION 'Rotation-disabled profile rotated'; END IF;
  IF v_enabled_result->>'selected_orientation' <> 'ROTATED' OR (v_enabled_result->>'final_issue_recommendation_m')::numeric >= (v_disabled_result->>'final_issue_recommendation_m')::numeric THEN
    RAISE EXCEPTION 'Rotation-enabled profile did not choose lower consumption';
  END IF;
  IF v_directional_result->>'selected_orientation' <> 'NORMAL' THEN RAISE EXCEPTION 'ONE_DIRECTION allowed an invalid rotation'; END IF;
END $$;

-- Width too small with joining disabled must be explicitly not feasible.
DO $$ DECLARE v_created jsonb; v_version uuid; v_result jsonb; BEGIN
  v_created := public.create_cutting_profile_draft('71000000-0000-0000-0000-000000000002','CUT-NOT-FEASIBLE','Not feasible','GENERIC_SEWN_PRODUCT',NULL);
  v_version := (v_created->'version'->>'id')::uuid;
  PERFORM public.save_cutting_profile_draft(v_version,DATE '2026-01-01',NULL,jsonb_build_object(
    'default_fabric_width_cm',60,'allow_rotation',false,'pattern_direction','NONE','joining_allowed',false,'joining_rule','NONE'
  ));
  PERFORM public.approve_cutting_profile_version(v_version,'No joining',true);
  v_result := public.calculate_cutting_consumption(v_version,1,60,false);
  IF v_result->>'status' <> 'NOT_FEASIBLE' THEN RAISE EXCEPTION 'Insufficient width unexpectedly feasible'; END IF;
END $$;

-- Fixed/per-unit BOM: 100 products require 100 labels and 100 bags; cutting is server resolved.
DO $$ DECLARE v_created jsonb; v_version uuid; v_cutting_profile uuid; v_result jsonb; v_label jsonb; v_bag jsonb; BEGIN
  SELECT cutting_profile_id INTO v_cutting_profile FROM public.cutting_profile_versions WHERE id=(SELECT value::uuid FROM bom_test_state WHERE key='grid_cutting_version');
  v_created := public.create_bom_draft('71000000-0000-0000-0000-000000000001','BOM-PRODUCT-1','BOM Product 1',NULL);
  v_version := (v_created->'version'->>'id')::uuid;
  PERFORM public.save_bom_draft(v_version,DATE '2026-01-01',NULL,'V1',jsonb_build_array(
    jsonb_build_object('inventory_item_id','72000000-0000-0000-0000-000000000001','line_type','PACKAGING','quantity_method','PER_UNIT','standard_quantity',1,'unit','PIECE','sequence',1),
    jsonb_build_object('inventory_item_id','72000000-0000-0000-0000-000000000006','line_type','PACKAGING','quantity_method','PER_UNIT','standard_quantity',1,'unit','PIECE','sequence',2),
    jsonb_build_object('inventory_item_id','72000000-0000-0000-0000-000000000002','line_type','MATERIAL','quantity_method','CUTTING_ENGINE','unit','METER','cutting_profile_id',v_cutting_profile,'sequence',3)
  ));
  PERFORM public.approve_bom_version(v_version,'Approved V1',true);
  v_result := public.calculate_standard_material_requirements('71000000-0000-0000-0000-000000000001',100,DATE '2026-06-01',NULL,false,'73000000-0000-0000-0000-000000000001',false);
  SELECT value INTO v_label FROM jsonb_array_elements(v_result->'materials') WHERE value->>'inventory_item_id'='72000000-0000-0000-0000-000000000001';
  SELECT value INTO v_bag FROM jsonb_array_elements(v_result->'materials') WHERE value->>'inventory_item_id'='72000000-0000-0000-0000-000000000006';
  IF (v_label->>'standard_quantity')::numeric <> 100 THEN RAISE EXCEPTION '100 products did not require 100 labels'; END IF;
  IF (v_bag->>'standard_quantity')::numeric <> 100 THEN RAISE EXCEPTION '100 products did not require 100 bags'; END IF;
  INSERT INTO bom_test_state VALUES ('bom_v1',v_version::text),('bom_header',(v_created->'header'->>'id'));
END $$;

-- 100 m net plus five percent line waste equals 105 m.
DO $$ DECLARE v_created jsonb; v_version uuid; v_result jsonb; v_material jsonb; BEGIN
  PERFORM public.save_product_manufacturing_profile('71000000-0000-0000-0000-000000000003','OTHER',1,1,NULL,'CM','{}'::jsonb,true);
  v_created := public.create_bom_draft('71000000-0000-0000-0000-000000000003','BOM-WASTE-5','Waste 5%',NULL);
  v_version := (v_created->'version'->>'id')::uuid;
  PERFORM public.save_bom_draft(v_version,DATE '2026-01-01',NULL,NULL,jsonb_build_array(
    jsonb_build_object('inventory_item_id','72000000-0000-0000-0000-000000000003','quantity_method','PER_UNIT','standard_quantity',0.4,'unit','METER','waste_rate',5,'sequence',1),
    jsonb_build_object('inventory_item_id','72000000-0000-0000-0000-000000000003','quantity_method','PER_UNIT','standard_quantity',0.6,'unit','METER','waste_rate',5,'sequence',2)
  ));
  PERFORM public.approve_bom_version(v_version,'Waste golden',true);
  v_result := public.calculate_standard_material_requirements('71000000-0000-0000-0000-000000000003',100,DATE '2026-06-01',NULL,false,NULL,false);
  v_material := v_result->'materials'->0;
  IF jsonb_array_length(v_result->'materials') <> 1 OR (v_material->>'standard_quantity')::numeric <> 105 THEN RAISE EXCEPTION 'Five-percent waste aggregation golden failed: %',v_result; END IF;
END $$;

-- Historical V1/V2 resolution and approved immutability.
DO $$ DECLARE v_v1 uuid := (SELECT value::uuid FROM bom_test_state WHERE key='bom_v1'); v_created jsonb; v_v2 uuid; BEGIN
  v_created := public.create_bom_draft('71000000-0000-0000-0000-000000000001','BOM-PRODUCT-1','BOM Product 1',v_v1);
  v_v2 := (v_created->'version'->>'id')::uuid;
  PERFORM public.save_bom_draft(v_v2,DATE '2027-01-01',NULL,'V2',jsonb_build_array(
    jsonb_build_object('inventory_item_id','72000000-0000-0000-0000-000000000001','line_type','PACKAGING','quantity_method','PER_UNIT','standard_quantity',2,'unit','PIECE','sequence',1)
  ));
  PERFORM public.approve_bom_version(v_v2,'Approved V2',true);
  IF public.resolve_effective_bom_version('71000000-0000-0000-0000-000000000001',DATE '2026-06-01') <> v_v1 THEN RAISE EXCEPTION '2026 did not resolve V1'; END IF;
  IF public.resolve_effective_bom_version('71000000-0000-0000-0000-000000000001',DATE '2027-06-01') <> v_v2 THEN RAISE EXCEPTION '2027 did not resolve V2'; END IF;
  IF (SELECT status FROM public.bom_versions WHERE id=v_v1) <> 'SUPERSEDED' THEN RAISE EXCEPTION 'V1 was not superseded'; END IF;
  INSERT INTO bom_test_state VALUES ('bom_v2',v_v2::text);
END $$;

-- Production context must ignore a newer DRAFT.
DO $$ DECLARE v_v2 uuid := (SELECT value::uuid FROM bom_test_state WHERE key='bom_v2'); v_created jsonb; v_draft uuid; BEGIN
  v_created := public.create_bom_draft('71000000-0000-0000-0000-000000000001','BOM-PRODUCT-1','BOM Product 1',v_v2);
  v_draft := (v_created->'version'->>'id')::uuid;
  PERFORM public.save_bom_draft(v_draft,DATE '2028-01-01',NULL,'Draft V3',jsonb_build_array(
    jsonb_build_object('inventory_item_id','72000000-0000-0000-0000-000000000001','quantity_method','PER_UNIT','standard_quantity',3,'unit','PIECE','sequence',1)
  ));
  IF public.resolve_effective_bom_version('71000000-0000-0000-0000-000000000001',DATE '2028-06-01') <> v_v2 THEN RAISE EXCEPTION 'Production resolution selected a DRAFT'; END IF;
  BEGIN
    PERFORM public.calculate_standard_material_requirements('71000000-0000-0000-0000-000000000001',1,DATE '2028-06-01',v_draft,false,NULL,false);
    RAISE EXCEPTION 'Production calculation accepted a DRAFT';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Production calculation accepted a DRAFT' THEN RAISE; END IF; END;
END $$;

-- Cross-tenant material references and incompatible units must fail clearly.
DO $$ DECLARE v_created jsonb; v_version uuid; BEGIN
  PERFORM public.save_product_manufacturing_profile('71000000-0000-0000-0000-000000000004','OTHER',1,1,NULL,'CM','{}'::jsonb,true);
  v_created := public.create_bom_draft('71000000-0000-0000-0000-000000000004','BOM-SECURITY','BOM Security',NULL);
  v_version := (v_created->'version'->>'id')::uuid;
  BEGIN
    PERFORM public.save_bom_draft(v_version,DATE '2026-01-01',NULL,NULL,jsonb_build_array(
      jsonb_build_object('inventory_item_id','72000000-0000-0000-0000-000000000005','quantity_method','PER_UNIT','standard_quantity',1,'unit','METER','sequence',1)
    ));
    RAISE EXCEPTION 'Cross-tenant material unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Cross-tenant material unexpectedly succeeded' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.save_bom_draft(v_version,DATE '2026-01-01',NULL,NULL,jsonb_build_array(
      jsonb_build_object('inventory_item_id','72000000-0000-0000-0000-000000000002','quantity_method','PER_UNIT','standard_quantity',1,'unit','KG','sequence',1)
    ));
    RAISE EXCEPTION 'Unit mismatch unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Unit mismatch unexpectedly succeeded' THEN RAISE; END IF; END;
END $$;

-- Direct approval bypass is blocked for the authenticated API role.
DO $$ DECLARE v_v2 uuid := (SELECT value::uuid FROM bom_test_state WHERE key='bom_v2'); BEGIN
  BEGIN
    UPDATE public.bom_versions SET status='DRAFT' WHERE id=v_v2;
    RAISE EXCEPTION 'Direct status bypass unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Direct status bypass unexpectedly succeeded' THEN RAISE; END IF; END;
END $$;

-- Cost preview: 3.2 m x 45,000 = 144,000; employee quantity view must mask cost.
DO $$ DECLARE v_created jsonb; v_version uuid; v_result jsonb; v_material jsonb; v_before jsonb; v_after jsonb; BEGIN
  PERFORM public.save_product_manufacturing_profile('71000000-0000-0000-0000-000000000006','OTHER',1,1,NULL,'CM','{}'::jsonb,true);
  v_created := public.create_bom_draft('71000000-0000-0000-0000-000000000006','BOM-COST-PREVIEW','Cost preview',NULL);
  v_version := (v_created->'version'->>'id')::uuid;
  PERFORM public.save_bom_draft(v_version,DATE '2026-01-01',NULL,NULL,jsonb_build_array(
    jsonb_build_object('inventory_item_id','72000000-0000-0000-0000-000000000002','quantity_method','PER_UNIT','standard_quantity',3.2,'unit','METER','sequence',1)
  ));
  PERFORM public.approve_bom_version(v_version,'Cost preview golden',true);
  v_before := public.bom_test_inventory_state();
  v_result := public.calculate_standard_material_requirements('71000000-0000-0000-0000-000000000006',1,DATE '2026-06-01',NULL,false,'73000000-0000-0000-0000-000000000001',false);
  v_material := v_result->'materials'->0;
  IF (v_material->>'estimated_material_cost')::numeric <> 144000 OR (v_result->>'estimated_material_cost_total')::numeric <> 144000 THEN
    RAISE EXCEPTION 'Cost preview golden failed: %',v_result;
  END IF;
  v_after := public.bom_test_inventory_state();
  IF v_after->>'movement_count' <> v_before->>'movement_count' THEN RAISE EXCEPTION 'Calculation created an inventory movement'; END IF;
  IF v_after->>'balance_quantity' <> v_before->>'balance_quantity' THEN RAISE EXCEPTION 'Calculation changed inventory balances'; END IF;
  INSERT INTO bom_test_state VALUES ('cost_bom_version',v_version::text);
END $$;

SELECT set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
DO $$ DECLARE v_result jsonb; v_material jsonb; BEGIN
  v_result := public.calculate_standard_material_requirements('71000000-0000-0000-0000-000000000006',1,DATE '2026-06-01',NULL,false,'73000000-0000-0000-0000-000000000001',false);
  v_material := v_result->'materials'->0;
  IF (v_result->>'cost_visible')::boolean OR v_material->>'average_unit_cost' IS NOT NULL OR v_material->>'estimated_material_cost' IS NOT NULL THEN
    RAISE EXCEPTION 'Cost masking failed for quantity-only employee';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);

-- Inactive material cannot enter a new DRAFT, but an approved historical line remains visible.
DO $$ DECLARE v_created jsonb; v_version uuid; BEGIN
  PERFORM public.save_product_manufacturing_profile('71000000-0000-0000-0000-000000000007','OTHER',1,1,NULL,'CM','{}'::jsonb,true);
  v_created := public.create_bom_draft('71000000-0000-0000-0000-000000000007','BOM-INACTIVE-HISTORY','Inactive history',NULL);
  v_version := (v_created->'version'->>'id')::uuid;
  PERFORM public.save_bom_draft(v_version,DATE '2029-01-01',NULL,NULL,jsonb_build_array(
    jsonb_build_object('inventory_item_id','72000000-0000-0000-0000-000000000004','quantity_method','PER_UNIT','standard_quantity',1,'unit','PIECE','sequence',1)
  ));
  PERFORM public.approve_bom_version(v_version,'Historical inactive setup',true);
  UPDATE public.inventory_items SET is_active=false WHERE id='72000000-0000-0000-0000-000000000004';
  IF NOT EXISTS (SELECT 1 FROM public.bom_lines WHERE bom_version_id=v_version AND inventory_item_id='72000000-0000-0000-0000-000000000004') THEN
    RAISE EXCEPTION 'Inactive material disappeared from historical BOM';
  END IF;
  BEGIN
    PERFORM public.create_bom_draft('71000000-0000-0000-0000-000000000007','BOM-INACTIVE-HISTORY','Inactive history',v_version);
    RAISE EXCEPTION 'Inactive material entered a new version';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Inactive material entered a new version' THEN RAISE; END IF; END;
END $$;

RESET ROLE;

-- Database immutability remains effective even for an owner-style direct write without transition flags.
DO $$ DECLARE v_v2 uuid := (SELECT value::uuid FROM bom_test_state WHERE key='bom_v2'); v_line uuid; BEGIN
  SELECT id INTO v_line FROM public.bom_lines WHERE bom_version_id=v_v2 LIMIT 1;
  BEGIN
    UPDATE public.bom_versions SET notes='forbidden' WHERE id=v_v2;
    RAISE EXCEPTION 'Approved version mutation unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Approved version mutation unexpectedly succeeded' THEN RAISE; END IF; END;
  BEGIN
    UPDATE public.bom_lines SET standard_quantity=999 WHERE id=v_line;
    RAISE EXCEPTION 'Approved line mutation unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='Approved line mutation unexpectedly succeeded' THEN RAISE; END IF; END;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.audit_events WHERE entity_type='bom_versions' AND action='APPROVE') THEN RAISE EXCEPTION 'BOM approval audit missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_events WHERE entity_type='bom_versions' AND action='SUPERSEDE') THEN RAISE EXCEPTION 'BOM supersede audit missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_events WHERE entity_type='cutting_profile_versions' AND action='APPROVE') THEN RAISE EXCEPTION 'Cutting approval audit missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_events WHERE entity_type='bom_lines' AND action IN ('CREATE','UPDATE','DELETE')) THEN RAISE EXCEPTION 'BOM line audit missing'; END IF;
END $$;

-- Regression HIGH-1: snapshot cost leakage through RLS.
-- Admin saves a cost-visible snapshot, then the quantity-only employee (bom_view only,
-- no inventory_cost_view) must not read it back.
DO $$ DECLARE v_created jsonb; v_version uuid; v_snapshot_id uuid; BEGIN
  PERFORM public.save_product_manufacturing_profile('71000000-0000-0000-0000-000000000008','OTHER',1,1,NULL,'CM','{}'::jsonb,true);
  v_created := public.create_bom_draft('71000000-0000-0000-0000-000000000008','BOM-SNAP-LEAK','Snapshot leak test',NULL);
  v_version := (v_created->'version'->>'id')::uuid;
  PERFORM public.save_bom_draft(v_version,DATE '2026-01-01',NULL,NULL,jsonb_build_array(
    jsonb_build_object('inventory_item_id','72000000-0000-0000-0000-000000000002','quantity_method','PER_UNIT','standard_quantity',3.2,'unit','METER','sequence',1)
  ));
  PERFORM public.approve_bom_version(v_version,'Snapshot leak golden',true);
  v_snapshot_id := (public.calculate_standard_material_requirements(
    '71000000-0000-0000-0000-000000000008',1,DATE '2026-06-01',NULL,false,'73000000-0000-0000-0000-000000000001',true
  )->>'snapshot_id')::uuid;
  IF v_snapshot_id IS NULL THEN RAISE EXCEPTION 'Snapshot was not saved'; END IF;
  IF (SELECT COALESCE((output_snapshot->>'cost_visible')::boolean,false) FROM public.material_requirement_calculations WHERE id=v_snapshot_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Expected a cost-visible snapshot for this regression';
  END IF;
  INSERT INTO bom_test_state VALUES ('snapshot_id',v_snapshot_id::text);
END $$;

-- Switch to quantity-only employee and verify snapshot is not readable via RLS.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
DO $$ DECLARE v_readable integer; v_snapshot_id uuid := (SELECT value::uuid FROM bom_test_state WHERE key='snapshot_id'); BEGIN
  SELECT count(*) INTO v_readable FROM public.material_requirement_calculations WHERE id=v_snapshot_id;
  IF v_readable <> 0 THEN RAISE EXCEPTION 'Cost snapshot leaked to a user without inventory_cost_view'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);

-- Regression HIGH-2: explicit BOM version outside its effective interval must be rejected.
DO $$ DECLARE v_v1 uuid := (SELECT value::uuid FROM bom_test_state WHERE key='bom_v1'); v_result jsonb; BEGIN
  BEGIN
    v_result := public.calculate_standard_material_requirements('71000000-0000-0000-0000-000000000001',1,DATE '2025-01-01',v_v1,false,NULL,false);
    RAISE EXCEPTION 'Out-of-effective-date BOM was unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='Out-of-effective-date BOM was unexpectedly accepted' THEN RAISE; END IF;
  END;
END $$;

-- Regression MEDIUM: PER_BATCH formula must reject JSON null batch_size.
DO $$ DECLARE v_created jsonb; v_version uuid; BEGIN
  PERFORM public.save_product_manufacturing_profile('71000000-0000-0000-0000-000000000009','OTHER',1,1,NULL,'CM','{}'::jsonb,true);
  v_created := public.create_bom_draft('71000000-0000-0000-0000-000000000009','BOM-BATCH-NULL','Batch null test',NULL);
  v_version := (v_created->'version'->>'id')::uuid;
  BEGIN
    PERFORM public.save_bom_draft(v_version,DATE '2026-01-01',NULL,NULL,jsonb_build_array(
      jsonb_build_object('inventory_item_id','72000000-0000-0000-0000-000000000004','quantity_method','FORMULA','formula_type','PER_BATCH','formula_parameters','{"batch_size": null}'::jsonb,'standard_quantity',1,'unit','PIECE','sequence',1)
    ));
    RAISE EXCEPTION 'PER_BATCH with JSON null batch_size unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='PER_BATCH with JSON null batch_size unexpectedly succeeded' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;

SELECT 'bom_cutting_standards_test: PASS' AS result;
