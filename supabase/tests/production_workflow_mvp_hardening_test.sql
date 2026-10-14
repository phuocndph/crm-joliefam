\set ON_ERROR_STOP on

DO $$
DECLARE v_function text;
BEGIN
  FOR v_function IN
    SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_production_order_group', 'list_production_source_orders',
        'list_production_fabric_variants', 'list_production_order_items',
        'list_production_batches', 'list_production_stage_events',
        'list_production_fabric_allocations'
      )
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    RAISE EXCEPTION 'Anonymous execute privilege remains on %', v_function;
  END LOOP;
END $$;

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'production.workflow.admin@test.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role, assigned_by) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'admin', NULL)
ON CONFLICT DO NOTHING;
INSERT INTO public.products (id, tenant_id, name, sku, in_stock) VALUES
  ('a2000000-0000-0000-0000-000000000001', 'default', 'Áo kiểm thử', 'MVP-001', true),
  ('a2000000-0000-0000-0000-000000000002', 'other-tenant', 'Sản phẩm tenant khác', 'OTHER-001', true)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.fabric_variants (id, tenant_id, variant_name, unit) VALUES
  ('a3000000-0000-0000-0000-000000000001', 'default', 'Vải canvas trắng', 'm'),
  ('a3000000-0000-0000-0000-000000000002', 'other-tenant', 'Vải tenant khác', 'm')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.orders (id, tenant_id) VALUES
  ('a4000000-0000-0000-0000-000000000001', 'default'),
  ('a4000000-0000-0000-0000-000000000002', 'other-tenant')
ON CONFLICT (id) DO NOTHING;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);

DO $$
DECLARE
  v_payload jsonb := jsonb_build_object(
    'order_id', 'a4000000-0000-0000-0000-000000000001',
    'source_type', 'FROM_ORDER',
    'planned_start_date', '2026-09-14',
    'planned_end_date', '2026-09-20',
    'notes', 'Nhóm kiểm thử atomic',
    'lines', jsonb_build_array(
      jsonb_build_object('product_id', 'a2000000-0000-0000-0000-000000000001', 'quantity', 12, 'fabric_variant_id', 'a3000000-0000-0000-0000-000000000001', 'color', 'Trắng', 'size', 'M'),
      jsonb_build_object('product_id', 'a2000000-0000-0000-0000-000000000001', 'quantity', 8, 'fabric_variant_id', 'a3000000-0000-0000-0000-000000000001', 'color', 'Trắng', 'size', 'L')
    )
  );
  v_result jsonb;
  v_retry jsonb;
  v_group_id uuid;
  v_message text;
BEGIN
  v_result := public.create_production_order_group(v_payload, 'mvp-group-001');
  v_group_id := (v_result ->> 'group_id')::uuid;
  IF (v_result ->> 'reused')::boolean OR (v_result ->> 'order_count')::integer <> 2 THEN
    RAISE EXCEPTION 'Atomic group create returned an unexpected result';
  END IF;
  IF (SELECT count(*) FROM public.production_orders WHERE production_order_group_id = v_group_id) <> 2
     OR (SELECT count(*) FROM public.production_order_items WHERE tenant_id = 'default' AND production_order_id IN (SELECT id FROM public.production_orders WHERE production_order_group_id = v_group_id)) <> 2 THEN
    RAISE EXCEPTION 'Group metadata rows were not created atomically';
  END IF;
  v_retry := public.create_production_order_group(v_payload, 'mvp-group-001');
  IF NOT (v_retry ->> 'reused')::boolean
     OR (SELECT count(*) FROM public.production_orders WHERE production_order_group_id = v_group_id) <> 2 THEN
    RAISE EXCEPTION 'Group create retry was not idempotent';
  END IF;

  BEGIN
    PERFORM public.create_production_order_group(
      jsonb_set(v_payload, '{notes}', '"khác"'::jsonb), 'mvp-group-001'
    );
    RAISE EXCEPTION 'Idempotency key accepted a different payload';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
    IF v_message = 'Idempotency key accepted a different payload' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.create_production_order_group(
      jsonb_set(v_payload, '{lines,0,product_id}', '"a2000000-0000-0000-0000-000000000002"'::jsonb), 'mvp-group-cross-tenant'
    );
    RAISE EXCEPTION 'Cross-tenant product was accepted';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
    IF v_message = 'Cross-tenant product was accepted' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.create_production_order_group(
      jsonb_set(v_payload, '{planned_end_date}', '"2026-09-01"'::jsonb), 'mvp-group-bad-date'
    );
    RAISE EXCEPTION 'Invalid planned dates were accepted';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
    IF v_message = 'Invalid planned dates were accepted' THEN RAISE; END IF;
  END;

  IF (SELECT count(*) FROM public.list_production_order_items((v_result -> 'orders' -> 0 ->> 'id')::uuid)) <> 1 THEN
    RAISE EXCEPTION 'Metadata list API returned an unexpected row count';
  END IF;
  IF (SELECT count(*) FROM public.list_production_fabric_variants(NULL)) < 1 THEN
    RAISE EXCEPTION 'Fabric list API returned no real variants';
  END IF;
END $$;

RESET ROLE;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.production_order_items (tenant_id, production_order_id, product_id, planned_quantity)
    VALUES ('default', 'a5000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 1);
    RAISE EXCEPTION 'Direct workflow table insert unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Direct workflow table insert unexpectedly succeeded' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;
SELECT 'production_workflow_mvp_hardening_test: PASS';
