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
        'set_production_batch_status', 'record_production_stage_event',
        'set_production_stage_event_status', 'reverse_production_stage_event',
        'issue_production_fabric', 'update_production_fabric_allocation',
        'list_production_fabric_stock'
      )
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    RAISE EXCEPTION 'Anonymous execute privilege remains on %', v_function;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.production_batches b
    WHERE NOT EXISTS (
      SELECT 1 FROM public.production_batch_workflow_events e
      WHERE e.tenant_id = b.tenant_id AND e.production_batch_id = b.id
    )
  ) THEN
    RAISE EXCEPTION 'A production batch is missing its initial workflow event';
  END IF;

END $$;

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'production.workflow.operations@test.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role, assigned_by) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'admin', NULL)
ON CONFLICT DO NOTHING;
INSERT INTO public.production_workers (
  id, tenant_id, user_id, employee_code, display_name, worker_type, is_active
) VALUES (
  'b2000000-0000-0000-0000-000000000001', 'default',
  'b1000000-0000-0000-0000-000000000001', 'WF-01', 'Thợ may workflow', 'SEWER', true
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, tenant_id, name, sku, in_stock) VALUES
  ('b3000000-0000-0000-0000-000000000001', 'default', 'Áo workflow', 'WF-SKU-01', true)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.orders (id, tenant_id) VALUES
  ('b4000000-0000-0000-0000-000000000001', 'default')
ON CONFLICT (id) DO NOTHING;

SET LOCAL app.payroll_master_transition = 'on';
INSERT INTO public.product_piece_rate_versions (
  id, tenant_id, product_id, unit, rate, effective_from, status, reason,
  approved_by, approved_at
) VALUES (
  'b5000000-0000-0000-0000-000000000001', 'default',
  'b3000000-0000-0000-0000-000000000001', 'PIECE', 12500,
  DATE '2026-01-01', 'APPROVED', 'Kiểm thử workflow xưởng',
  'b1000000-0000-0000-0000-000000000001', now()
) ON CONFLICT (id) DO NOTHING;
SET LOCAL app.payroll_master_transition = 'off';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);

DO $$
DECLARE
  v_group jsonb;
  v_order_id uuid;
  v_item_id uuid;
  v_batch_id uuid;
  v_cutting jsonb;
  v_sewing jsonb;
  v_entry_id uuid;
  v_entry record;
BEGIN
  v_group := public.create_production_order_group(
    jsonb_build_object(
      'order_id', 'b4000000-0000-0000-0000-000000000001',
      'source_type', 'FROM_ORDER',
      'lines', jsonb_build_array(jsonb_build_object(
        'product_id', 'b3000000-0000-0000-0000-000000000001',
        'quantity', 12,
        'source_order_item_key', 'excel:T8(HN):row-4:item-H'
      ))
    ),
    'workflow-operations-group-1'
  );
  v_order_id := (v_group -> 'orders' -> 0 ->> 'id')::uuid;
  v_item_id := (v_group -> 'orders' -> 0 ->> 'order_item_id')::uuid;
  v_batch_id := (v_group -> 'orders' -> 0 ->> 'production_batch_id')::uuid;

  IF (SELECT source_order_item_key FROM public.production_order_items WHERE id = v_item_id)
       <> 'excel:T8(HN):row-4:item-H'
     OR (SELECT source_order_item_id FROM public.production_order_items WHERE id = v_item_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Non-UUID Excel source item key was not preserved losslessly';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_events
    WHERE entity_type = 'production_batches' AND entity_id = v_batch_id AND action = 'CREATE'
  ) THEN
    RAISE EXCEPTION 'Production batch CREATE audit is missing';
  END IF;

  PERFORM public.set_production_batch_status(
    v_batch_id, 'IN_PROGRESS', 'Bắt đầu lô kiểm thử', 'workflow-batch-start-1'
  );
  IF NOT (public.set_production_batch_status(
    v_batch_id, 'IN_PROGRESS', 'Bắt đầu lô kiểm thử', 'workflow-batch-start-1'
  ) ->> 'reused')::boolean THEN
    RAISE EXCEPTION 'Batch status retry was not idempotent';
  END IF;

  v_cutting := public.record_production_stage_event(
    jsonb_build_object(
      'production_order_id', v_order_id,
      'production_batch_id', v_batch_id,
      'order_item_id', v_item_id,
      'stage', 'CUTTING',
      'worker_id', 'b2000000-0000-0000-0000-000000000001',
      'quantity_received', 12,
      'quantity_good', 12,
      'occurred_at', now() - interval '2 hours'
    ),
    'workflow-cutting-submit-1'
  );
  PERFORM public.set_production_stage_event_status(
    (v_cutting ->> 'id')::uuid, 'APPROVED', NULL, 'workflow-cutting-approve-1'
  );

  -- A retry with the same key must resolve as an idempotent reuse.
  IF NOT (public.set_production_stage_event_status(
    (v_cutting ->> 'id')::uuid, 'APPROVED', NULL, 'workflow-cutting-approve-1'
  ) ->> 'reused')::boolean THEN
    RAISE EXCEPTION 'Stage approval retry was not idempotent';
  END IF;

  v_sewing := public.record_production_stage_event(
    jsonb_build_object(
      'production_order_id', v_order_id,
      'production_batch_id', v_batch_id,
      'order_item_id', v_item_id,
      'stage', 'SEWING',
      'worker_id', 'b2000000-0000-0000-0000-000000000001',
      'quantity_received', 10,
      'quantity_good', 10,
      'minutes_worked', 120,
      'occurred_at', now() - interval '1 hour'
    ),
    'workflow-sewing-submit-1'
  );
  v_sewing := public.set_production_stage_event_status(
    (v_sewing ->> 'id')::uuid, 'APPROVED', 'Duyệt sản lượng may', 'workflow-sewing-approve-1'
  );
  v_entry_id := (v_sewing ->> 'production_entry_id')::uuid;
  SELECT * INTO v_entry
  FROM public.list_production_entries_month(date_trunc('month', CURRENT_DATE)::date, true)
  WHERE id = v_entry_id;
  IF v_entry_id IS NULL OR NOT FOUND OR v_entry.quantity <> 10
     OR v_entry.calculated_amount <> 125000 OR v_entry.workflow_status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'Approved sewing event did not create the payroll production entry';
  END IF;

  PERFORM public.reverse_production_stage_event(
    (v_sewing ->> 'id')::uuid, 'Đảo kiểm thử', 'workflow-sewing-reverse-1'
  );
  SELECT * INTO v_entry
  FROM public.list_production_entries_month(date_trunc('month', CURRENT_DATE)::date, true)
  WHERE id = v_entry_id;
  IF NOT FOUND OR v_entry.workflow_status <> 'REJECTED' THEN
    RAISE EXCEPTION 'Reversing a sewing event did not reject its submitted production entry';
  END IF;
END $$;

RESET ROLE;
ROLLBACK;

SELECT 'production_workflow_mvp_operations_test: PASS';
