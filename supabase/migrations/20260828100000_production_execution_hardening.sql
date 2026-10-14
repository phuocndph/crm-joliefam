-- Sprint 4 hardening: operation sequencing, material issue tolerance,
-- production loss totals, actual-start semantics and variance aggregation.

ALTER TABLE public.audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_action_check
  CHECK (action IN (
    'CREATE', 'UPDATE', 'DELETE', 'CONFIRM', 'VOID', 'APPROVE', 'SUPERSEDE',
    'RELEASE', 'COMPLETE', 'START', 'PAUSE', 'RESUME', 'HOLD', 'CANCEL', 'REPLAN'
  ));

-- actual_start_at is owned by the first operation start. Release must not set it,
-- and direct callers must not rewrite it.
CREATE OR REPLACE FUNCTION public.guard_production_actual_start()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('DRAFT', 'PLANNED') AND NEW.status = 'RELEASED' THEN
    NEW.actual_start_at := NULL;
  ELSIF NEW.actual_start_at IS DISTINCT FROM OLD.actual_start_at
        AND COALESCE(current_setting('app.production_operation_start', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'Thời điểm bắt đầu thực tế chỉ được ghi khi bắt đầu công đoạn';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS production_orders_actual_start_guard ON public.production_orders;
CREATE TRIGGER production_orders_actual_start_guard
BEFORE UPDATE OF status, actual_start_at ON public.production_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_production_actual_start();

REVOKE ALL ON FUNCTION public.guard_production_actual_start() FROM PUBLIC, anon, authenticated;

SELECT set_config('app.production_operation_start', 'on', false);
SELECT set_config('app.cost_suppress_audit', 'on', false);
UPDATE public.production_orders po
SET actual_start_at = starts.first_actual_start
FROM (
  SELECT p.id,
         min(o.actual_start) FILTER (WHERE o.actual_start IS NOT NULL) AS first_actual_start
  FROM public.production_orders p
  LEFT JOIN public.production_order_operations o ON o.production_order_id = p.id
  GROUP BY p.id
) starts
WHERE po.id = starts.id
  AND po.actual_start_at IS DISTINCT FROM starts.first_actual_start;
SELECT set_config('app.cost_suppress_audit', 'off', false);
SELECT set_config('app.production_operation_start', 'off', false);

-- Status changes no longer synthesize an actual start timestamp. Starting the
-- first operation is the only event that owns production_orders.actual_start_at.
CREATE OR REPLACE FUNCTION public.transition_production_order_status(
  p_production_order_id uuid,
  p_target_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_po public.production_orders;
  v_allowed boolean := false;
  v_previous_status text;
  v_audit_action text;
BEGIN
  SELECT * INTO v_po
  FROM public.production_orders
  WHERE id = p_production_order_id AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lệnh sản xuất'; END IF;
  v_previous_status := v_po.status;

  PERFORM pg_advisory_xact_lock(hashtextextended('prod-status:' || p_production_order_id::text, 0));
  IF v_po.status = p_target_status THEN RETURN to_jsonb(v_po); END IF;

  v_allowed := CASE
    WHEN v_po.status = 'DRAFT' AND p_target_status IN ('PLANNED', 'CANCELLED') THEN true
    WHEN v_po.status = 'PLANNED' AND p_target_status IN ('RELEASED', 'CANCELLED') THEN true
    WHEN v_po.status = 'RELEASED' AND p_target_status IN ('IN_PROGRESS', 'ON_HOLD', 'CANCELLED') THEN true
    WHEN v_po.status = 'IN_PROGRESS' AND p_target_status IN ('COMPLETED', 'ON_HOLD', 'CANCELLED') THEN true
    WHEN v_po.status = 'ON_HOLD' AND p_target_status IN ('IN_PROGRESS', 'CANCELLED') THEN true
    ELSE false
  END;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Chuyển trạng thái % -> % không được phép', v_po.status, p_target_status;
  END IF;

  IF p_target_status IN ('PLANNED', 'ON_HOLD', 'CANCELLED')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền quản lý trạng thái lệnh sản xuất';
  END IF;
  IF p_target_status = 'IN_PROGRESS'
     AND NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền vận hành lệnh sản xuất';
  END IF;
  IF p_target_status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Hoàn thành lệnh phải dùng complete_production_order';
  END IF;
  IF p_target_status = 'RELEASED' THEN
    RAISE EXCEPTION 'Phát hành lệnh phải dùng release_production_order';
  END IF;

  PERFORM set_config('app.production_transition', 'on', true);
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  UPDATE public.production_orders
  SET status = p_target_status,
      updated_at = now(),
      cancelled_at = CASE WHEN p_target_status = 'CANCELLED' THEN now() ELSE cancelled_at END,
      cancelled_by = CASE WHEN p_target_status = 'CANCELLED' THEN auth.uid() ELSE cancelled_by END,
      cancel_reason = CASE WHEN p_target_status = 'CANCELLED' THEN p_reason ELSE cancel_reason END
  WHERE id = p_production_order_id
  RETURNING * INTO v_po;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  v_audit_action := CASE
    WHEN p_target_status = 'ON_HOLD' THEN 'HOLD'
    WHEN p_target_status = 'IN_PROGRESS' AND v_previous_status = 'ON_HOLD' THEN 'RESUME'
    WHEN p_target_status = 'IN_PROGRESS' THEN 'START'
    WHEN p_target_status = 'CANCELLED' THEN 'CANCEL'
    ELSE 'UPDATE'
  END;
  PERFORM public.write_cost_audit('production_orders', v_po.id, v_audit_action, NULL::jsonb, to_jsonb(v_po), p_reason);
  PERFORM set_config('app.production_transition', 'off', true);
  RETURN to_jsonb(v_po);
END;
$$;

CREATE OR REPLACE FUNCTION public.start_production_operation(
  p_operation_id uuid,
  p_worker_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_op public.production_order_operations;
  v_po public.production_orders;
BEGIN
  IF NOT public.has_production_permission('production_operations') THEN
    RAISE EXCEPTION 'Bạn không có quyền vận hành công đoạn';
  END IF;

  SELECT * INTO v_op
  FROM public.production_order_operations
  WHERE id = p_operation_id AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy công đoạn'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('prod-operation:' || v_op.production_order_id::text, 0));
  SELECT * INTO v_po
  FROM public.production_orders
  WHERE id = v_op.production_order_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF v_po.status = 'ON_HOLD' THEN
    RAISE EXCEPTION 'Lệnh sản xuất đang tạm dừng';
  END IF;
  IF v_po.status NOT IN ('RELEASED', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'Lệnh sản xuất chưa sẵn sàng vận hành';
  END IF;
  IF v_op.status NOT IN ('PENDING', 'READY') THEN
    RAISE EXCEPTION 'Công đoạn không ở trạng thái chờ';
  END IF;
  IF p_worker_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_workers
    WHERE id = p_worker_id AND tenant_id = v_tenant AND is_active
  ) THEN
    RAISE EXCEPTION 'Công nhân không tồn tại hoặc không hoạt động';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.production_order_operations prev
    WHERE prev.production_order_id = v_op.production_order_id
      AND prev.sequence < v_op.sequence
      AND prev.status NOT IN ('COMPLETED', 'SKIPPED')
      AND prev.is_optional = false
  ) THEN
    RAISE EXCEPTION 'Công đoạn trước chưa hoàn thành';
  END IF;

  PERFORM set_config('app.production_transition', 'on', true);
  PERFORM set_config('app.production_operation_start', 'on', true);
  UPDATE public.production_order_operations
  SET status = 'IN_PROGRESS', actual_start = now(), updated_at = now()
  WHERE id = p_operation_id
  RETURNING * INTO v_op;

  UPDATE public.production_orders po
  SET status = CASE WHEN po.status = 'RELEASED' THEN 'IN_PROGRESS' ELSE po.status END,
      actual_start_at = (
        SELECT min(o.actual_start)
        FROM public.production_order_operations o
        WHERE o.production_order_id = po.id AND o.actual_start IS NOT NULL
      ),
      updated_at = now()
  WHERE po.id = v_po.id;
  PERFORM set_config('app.production_operation_start', 'off', true);
  PERFORM set_config('app.production_transition', 'off', true);

  INSERT INTO public.production_operation_logs (
    tenant_id, production_order_operation_id, event_type, worker_id,
    started_at, ended_at, created_by
  ) VALUES (
    v_tenant, p_operation_id, 'START', p_worker_id, v_op.actual_start, NULL, auth.uid()
  );
  RETURN to_jsonb(v_op);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_production_operation(
  p_operation_id uuid,
  p_quantity_good numeric DEFAULT NULL,
  p_quantity_scrap numeric DEFAULT 0,
  p_quantity_rework numeric DEFAULT 0,
  p_worker_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_op public.production_order_operations;
  v_po public.production_orders;
BEGIN
  IF NOT public.has_production_permission('production_operations') THEN
    RAISE EXCEPTION 'Bạn không có quyền hoàn thành công đoạn';
  END IF;

  SELECT * INTO v_op
  FROM public.production_order_operations
  WHERE id = p_operation_id AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy công đoạn'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('prod-operation:' || v_op.production_order_id::text, 0));
  SELECT * INTO v_po
  FROM public.production_orders
  WHERE id = v_op.production_order_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF v_po.status = 'ON_HOLD' THEN
    RAISE EXCEPTION 'Lệnh sản xuất đang tạm dừng';
  END IF;
  IF v_po.status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'Lệnh sản xuất chưa ở trạng thái đang thực hiện';
  END IF;
  IF v_op.status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'Công đoạn phải được bắt đầu trước khi hoàn thành';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.production_order_operations prev
    WHERE prev.production_order_id = v_op.production_order_id
      AND prev.sequence < v_op.sequence
      AND prev.status NOT IN ('COMPLETED', 'SKIPPED')
      AND prev.is_optional = false
  ) THEN
    RAISE EXCEPTION 'Công đoạn trước chưa hoàn thành';
  END IF;
  IF p_quantity_good IS NOT NULL AND p_quantity_good < 0 THEN
    RAISE EXCEPTION 'Số lượng đạt không hợp lệ';
  END IF;
  IF COALESCE(p_quantity_scrap, 0) < 0 OR COALESCE(p_quantity_rework, 0) < 0 THEN
    RAISE EXCEPTION 'Số lượng lỗi/làm lại không hợp lệ';
  END IF;
  IF p_worker_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_workers
    WHERE id = p_worker_id AND tenant_id = v_tenant AND is_active
  ) THEN
    RAISE EXCEPTION 'Công nhân không tồn tại hoặc không hoạt động';
  END IF;

  PERFORM set_config('app.production_transition', 'on', true);
  UPDATE public.production_order_operations
  SET status = 'COMPLETED',
      actual_end = now(),
      updated_at = now(),
      quantity_good = COALESCE(p_quantity_good, quantity_good),
      quantity_scrap = COALESCE(p_quantity_scrap, quantity_scrap),
      quantity_rework = COALESCE(p_quantity_rework, quantity_rework)
  WHERE id = p_operation_id
  RETURNING * INTO v_op;
  PERFORM set_config('app.production_transition', 'off', true);

  INSERT INTO public.production_operation_logs (
    tenant_id, production_order_operation_id, event_type, worker_id, quantity,
    started_at, ended_at, created_by
  ) VALUES (
    v_tenant, p_operation_id, 'COMPLETE', p_worker_id,
    COALESCE(p_quantity_good, v_op.quantity_good), v_op.actual_start, now(), auth.uid()
  );

  IF COALESCE(p_quantity_scrap, 0) > 0 THEN
    INSERT INTO public.production_scrap_records (
      tenant_id, production_order_id, production_order_operation_id,
      quantity, reason_code, created_by
    ) VALUES (
      v_tenant, v_op.production_order_id, p_operation_id,
      p_quantity_scrap, 'OPERATION_SCRAP', auth.uid()
    );
  END IF;
  IF COALESCE(p_quantity_rework, 0) > 0 THEN
    INSERT INTO public.production_rework_records (
      tenant_id, production_order_id, from_operation_id,
      quantity, reason_code, created_by
    ) VALUES (
      v_tenant, v_op.production_order_id, p_operation_id,
      p_quantity_rework, 'REWORK', auth.uid()
    );
  END IF;

  UPDATE public.production_orders po
  SET quantity_scrap = (
        SELECT COALESCE(sum(s.quantity), 0)
        FROM public.production_scrap_records s
        WHERE s.production_order_id = po.id AND s.tenant_id = po.tenant_id
      ),
      quantity_rework = (
        SELECT COALESCE(sum(r.quantity), 0)
        FROM public.production_rework_records r
        WHERE r.production_order_id = po.id AND r.tenant_id = po.tenant_id
      ),
      updated_at = now()
  WHERE po.id = v_op.production_order_id;

  RETURN to_jsonb(v_op);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_production_scrap(
  p_production_order_id uuid,
  p_quantity numeric,
  p_reason_code text,
  p_operation_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_po public.production_orders;
  v_row public.production_scrap_records;
BEGIN
  IF NOT public.has_production_permission('production_operations') THEN
    RAISE EXCEPTION 'Bạn không có quyền ghi lỗi';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('prod-operation:' || p_production_order_id::text, 0));
  SELECT * INTO v_po
  FROM public.production_orders
  WHERE id = p_production_order_id AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lệnh sản xuất'; END IF;
  IF v_po.status NOT IN ('RELEASED', 'IN_PROGRESS', 'ON_HOLD') THEN
    RAISE EXCEPTION 'Lệnh sản xuất không ở trạng thái có thể ghi nhận lỗi';
  END IF;
  IF p_operation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_order_operations
    WHERE id = p_operation_id
      AND production_order_id = p_production_order_id
      AND tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Công đoạn không thuộc lệnh sản xuất';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Số lượng lỗi phải lớn hơn 0';
  END IF;

  INSERT INTO public.production_scrap_records (
    tenant_id, production_order_id, production_order_operation_id,
    quantity, reason_code, notes, created_by
  ) VALUES (
    v_tenant, p_production_order_id, p_operation_id,
    p_quantity, btrim(p_reason_code), p_notes, auth.uid()
  ) RETURNING * INTO v_row;

  UPDATE public.production_orders po
  SET quantity_scrap = (
        SELECT COALESCE(sum(s.quantity), 0)
        FROM public.production_scrap_records s
        WHERE s.production_order_id = po.id AND s.tenant_id = po.tenant_id
      ),
      updated_at = now()
  WHERE po.id = p_production_order_id;
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_production_rework(
  p_production_order_id uuid,
  p_quantity numeric,
  p_reason_code text,
  p_from_operation_id uuid DEFAULT NULL,
  p_target_operation_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_po public.production_orders;
  v_row public.production_rework_records;
BEGIN
  IF NOT public.has_production_permission('production_operations') THEN
    RAISE EXCEPTION 'Bạn không có quyền ghi làm lại';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('prod-operation:' || p_production_order_id::text, 0));
  SELECT * INTO v_po
  FROM public.production_orders
  WHERE id = p_production_order_id AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lệnh sản xuất'; END IF;
  IF v_po.status NOT IN ('RELEASED', 'IN_PROGRESS', 'ON_HOLD') THEN
    RAISE EXCEPTION 'Lệnh sản xuất không ở trạng thái có thể ghi nhận làm lại';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Số lượng làm lại phải lớn hơn 0';
  END IF;
  IF p_from_operation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_order_operations
    WHERE id = p_from_operation_id
      AND production_order_id = p_production_order_id
      AND tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Công đoạn nguồn không thuộc lệnh sản xuất';
  END IF;
  IF p_target_operation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_order_operations
    WHERE id = p_target_operation_id
      AND production_order_id = p_production_order_id
      AND tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Công đoạn làm lại không thuộc lệnh sản xuất';
  END IF;

  INSERT INTO public.production_rework_records (
    tenant_id, production_order_id, from_operation_id, target_operation_id,
    quantity, reason_code, notes, created_by
  ) VALUES (
    v_tenant, p_production_order_id, p_from_operation_id, p_target_operation_id,
    p_quantity, btrim(p_reason_code), p_notes, auth.uid()
  ) RETURNING * INTO v_row;

  UPDATE public.production_orders po
  SET quantity_rework = (
        SELECT COALESCE(sum(r.quantity), 0)
        FROM public.production_rework_records r
        WHERE r.production_order_id = po.id AND r.tenant_id = po.tenant_id
      ),
      updated_at = now()
  WHERE po.id = p_production_order_id;
  RETURN to_jsonb(v_row);
END;
$$;

-- The header and output loss quantities are projections of the immutable loss
-- records. A non-zero completion argument must reconcile with those records.
CREATE OR REPLACE FUNCTION public.complete_production_order(
  p_production_order_id uuid,
  p_quantity_good numeric,
  p_quantity_scrap numeric DEFAULT 0,
  p_warehouse_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_po public.production_orders;
  v_out public.production_outputs;
  v_recorded_scrap numeric(18,4);
  v_recorded_rework numeric(18,4);
BEGIN
  IF NOT public.has_production_permission('production_complete') THEN
    RAISE EXCEPTION 'Bạn không có quyền hoàn thành lệnh sản xuất';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('prod-operation:' || p_production_order_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('prod-complete:' || p_production_order_id::text, 0));
  SELECT * INTO v_po
  FROM public.production_orders
  WHERE id = p_production_order_id AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lệnh sản xuất'; END IF;

  IF v_po.status = 'COMPLETED' THEN
    SELECT * INTO v_out FROM public.production_outputs WHERE production_order_id = p_production_order_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lệnh đã hoàn thành nhưng thiếu bản ghi sản lượng';
    END IF;
    IF v_out.quantity_good IS DISTINCT FROM p_quantity_good
       OR (COALESCE(p_quantity_scrap, 0) <> 0 AND v_out.quantity_scrap IS DISTINCT FROM p_quantity_scrap)
       OR v_out.warehouse_id IS DISTINCT FROM p_warehouse_id THEN
      RAISE EXCEPTION 'Yêu cầu hoàn thành lặp lại không khớp kết quả đã ghi nhận';
    END IF;
    RETURN jsonb_build_object('id', v_po.id, 'status', v_po.status, 'output', to_jsonb(v_out), 'reused', true);
  END IF;
  IF v_po.status NOT IN ('RELEASED', 'IN_PROGRESS', 'ON_HOLD') THEN
    RAISE EXCEPTION 'Chỉ lệnh đã phát hành/đang thực hiện mới được hoàn thành';
  END IF;
  IF p_quantity_good IS NULL OR p_quantity_good < 0 THEN
    RAISE EXCEPTION 'Số lượng đạt không hợp lệ';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.production_order_operations o
    WHERE o.production_order_id = p_production_order_id
      AND o.is_optional = false
      AND o.status NOT IN ('COMPLETED', 'SKIPPED')
  ) THEN
    RAISE EXCEPTION 'Công đoạn bắt buộc chưa hoàn thành';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.inventory_documents d
    WHERE d.production_order_id = p_production_order_id AND d.status = 'DRAFT'
  ) THEN
    RAISE EXCEPTION 'Còn phiếu vật tư nháp liên quan lệnh sản xuất';
  END IF;
  IF p_warehouse_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_warehouse_id AND tenant_id = v_tenant AND is_active
  ) THEN
    RAISE EXCEPTION 'Kho thành phẩm không tồn tại hoặc không hoạt động';
  END IF;

  SELECT COALESCE(sum(quantity), 0) INTO v_recorded_scrap
  FROM public.production_scrap_records
  WHERE production_order_id = p_production_order_id AND tenant_id = v_tenant;
  SELECT COALESCE(sum(quantity), 0) INTO v_recorded_rework
  FROM public.production_rework_records
  WHERE production_order_id = p_production_order_id AND tenant_id = v_tenant;

  IF COALESCE(p_quantity_scrap, 0) <> 0
     AND p_quantity_scrap IS DISTINCT FROM v_recorded_scrap THEN
    RAISE EXCEPTION 'Số lượng lỗi hoàn thành (%) không khớp nhật ký lỗi (%)', p_quantity_scrap, v_recorded_scrap;
  END IF;

  PERFORM set_config('app.production_transition', 'on', true);
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  UPDATE public.production_orders
  SET status = 'COMPLETED',
      quantity_good = p_quantity_good,
      quantity_scrap = v_recorded_scrap,
      quantity_rework = v_recorded_rework,
      actual_end_at = now(),
      completed_by = auth.uid(),
      completed_at = now(),
      updated_at = now()
  WHERE id = p_production_order_id
  RETURNING * INTO v_po;

  INSERT INTO public.production_outputs (
    tenant_id, production_order_id, product_id, quantity_good, quantity_scrap,
    output_date, warehouse_id, valuation_status, created_by
  ) VALUES (
    v_tenant, p_production_order_id, v_po.product_id, p_quantity_good, v_recorded_scrap,
    CURRENT_DATE, p_warehouse_id, 'PENDING_COST', auth.uid()
  ) ON CONFLICT (production_order_id) DO NOTHING;
  SELECT * INTO v_out FROM public.production_outputs WHERE production_order_id = p_production_order_id;

  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  PERFORM public.write_cost_audit('production_orders', v_po.id, 'COMPLETE', NULL::jsonb, to_jsonb(v_po), NULL);
  PERFORM set_config('app.production_transition', 'off', true);
  RETURN jsonb_build_object('id', v_po.id, 'status', v_po.status, 'output', to_jsonb(v_out), 'reused', false);
END;
$$;

-- Extend the existing inventory validation. The advisory lock is acquired
-- before movements are posted, so concurrent issue documents cannot both pass
-- the same production-order tolerance check.
CREATE OR REPLACE FUNCTION public.validate_inventory_document_for_confirm(p_document_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.inventory_documents;
  v_item public.inventory_items;
  v_location public.warehouse_locations;
  v_to_location public.warehouse_locations;
  v_line public.inventory_document_lines;
  v_issue record;
  v_po public.production_orders;
  v_planned numeric(18,4);
  v_already_issued numeric(18,4);
  v_allowed numeric;
BEGIN
  SELECT * INTO v_doc
  FROM public.inventory_documents
  WHERE id = p_document_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiếu kho'; END IF;

  IF NOT public.inventory_warehouse_accessible(v_doc.warehouse_id, v_doc.tenant_id) THEN
    RAISE EXCEPTION 'Kho nguồn không còn hoạt động hoặc không thuộc phạm vi hiện tại';
  END IF;
  IF v_doc.document_type = 'TRANSFER'
     AND NOT public.inventory_warehouse_accessible(v_doc.to_warehouse_id, v_doc.tenant_id) THEN
    RAISE EXCEPTION 'Kho nhận không còn hoạt động hoặc không thuộc phạm vi hiện tại';
  END IF;

  PERFORM public.validate_inventory_business_transaction(
    v_doc.document_type,
    v_doc.business_transaction_id,
    v_doc.tenant_id
  );

  FOR v_line IN
    SELECT * FROM public.inventory_document_lines
    WHERE document_id = v_doc.id
    ORDER BY line_number
  LOOP
    SELECT * INTO v_item
    FROM public.inventory_items
    WHERE id = v_line.inventory_item_id
      AND tenant_id = v_doc.tenant_id
      AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Vật tư trong phiếu không còn hoạt động'; END IF;
    IF v_line.unit <> v_item.base_unit THEN
      RAISE EXCEPTION 'Đơn vị dòng không còn khớp đơn vị gốc của vật tư';
    END IF;

    IF v_line.location_id IS NOT NULL THEN
      SELECT * INTO v_location
      FROM public.warehouse_locations
      WHERE id = v_line.location_id
        AND tenant_id = v_doc.tenant_id
        AND warehouse_id = v_doc.warehouse_id
        AND is_active;
      IF NOT FOUND THEN RAISE EXCEPTION 'Vị trí nguồn không còn hoạt động'; END IF;
    END IF;
    IF v_doc.document_type = 'TRANSFER' AND v_line.to_location_id IS NOT NULL THEN
      SELECT * INTO v_to_location
      FROM public.warehouse_locations
      WHERE id = v_line.to_location_id
        AND tenant_id = v_doc.tenant_id
        AND warehouse_id = v_doc.to_warehouse_id
        AND is_active;
      IF NOT FOUND THEN RAISE EXCEPTION 'Vị trí nhận không còn hoạt động'; END IF;
    END IF;

    IF v_line.cost_center_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.cost_centers c
      WHERE c.id = v_line.cost_center_id
        AND c.tenant_id = v_doc.tenant_id
        AND c.is_active
    ) THEN
      RAISE EXCEPTION 'Trung tâm chi phí trong phiếu không còn hoạt động';
    END IF;
    IF v_line.cost_object_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.cost_objects c
      WHERE c.id = v_line.cost_object_id
        AND c.tenant_id = v_doc.tenant_id
        AND c.is_active
    ) THEN
      RAISE EXCEPTION 'Đối tượng chi phí trong phiếu không còn hoạt động';
    END IF;
  END LOOP;

  IF v_doc.production_order_id IS NOT NULL
     AND v_doc.document_type IN ('ISSUE', 'RETURN_IN') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'production-material-issue:' || v_doc.production_order_id::text,
      0
    ));
    SELECT * INTO v_po
    FROM public.production_orders
    WHERE id = v_doc.production_order_id AND tenant_id = v_doc.tenant_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lệnh sản xuất của phiếu vật tư'; END IF;
    IF v_doc.document_type = 'ISSUE'
       AND v_po.status NOT IN ('RELEASED', 'IN_PROGRESS', 'ON_HOLD') THEN
      RAISE EXCEPTION 'Chỉ được cấp vật tư cho lệnh đã phát hành hoặc đang thực hiện';
    END IF;
  END IF;

  IF v_doc.production_order_id IS NOT NULL AND v_doc.document_type = 'ISSUE' THEN
    FOR v_issue IN
      SELECT inventory_item_id, unit, sum(quantity)::numeric(18,4) AS quantity
      FROM public.inventory_document_lines
      WHERE document_id = v_doc.id
      GROUP BY inventory_item_id, unit
    LOOP
      SELECT r.planned_quantity INTO v_planned
      FROM public.production_order_material_requirements r
      WHERE r.production_order_id = v_doc.production_order_id
        AND r.tenant_id = v_doc.tenant_id
        AND r.inventory_item_id = v_issue.inventory_item_id
        AND r.unit = v_issue.unit;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Vật tư % không thuộc kế hoạch của lệnh sản xuất', v_issue.inventory_item_id;
      END IF;

      SELECT COALESCE(sum(
        CASE
          WHEN d.document_type = 'ISSUE' AND m.movement_kind = 'ISSUE' THEN abs(m.quantity_delta)
          WHEN d.document_type = 'RETURN_IN' AND m.movement_kind = 'RETURN_IN' THEN -abs(m.quantity_delta)
          ELSE 0
        END
      ), 0)::numeric(18,4)
      INTO v_already_issued
      FROM public.inventory_movements m
      JOIN public.inventory_documents d ON d.id = m.document_id
      WHERE d.production_order_id = v_doc.production_order_id
        AND d.tenant_id = v_doc.tenant_id
        AND d.status = 'CONFIRMED'
        AND m.inventory_item_id = v_issue.inventory_item_id
        AND m.unit = v_issue.unit
        AND d.document_type IN ('ISSUE', 'RETURN_IN');

      v_allowed := round(v_planned * (1 + v_po.material_issue_tolerance_percent / 100.0), 4);
      IF v_already_issued + v_issue.quantity > v_allowed THEN
        RAISE EXCEPTION 'Cấp vật tư vượt dung sai của lệnh sản xuất. Đã cấp ròng: %, phiếu mới: %, tối đa: %',
          v_already_issued, v_issue.quantity, v_allowed;
      END IF;
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_inventory_document_for_confirm(uuid) FROM PUBLIC, anon, authenticated;

-- Balance projection is aggregated before joining the requirement so a material
-- present in several warehouses still produces exactly one variance row.
CREATE OR REPLACE VIEW public.production_order_material_variance AS
WITH issued AS (
  SELECT
    d.production_order_id,
    d.tenant_id,
    m.inventory_item_id,
    m.unit,
    sum(abs(m.value_delta)) AS value,
    sum(abs(m.quantity_delta)) AS qty
  FROM public.inventory_movements m
  JOIN public.inventory_documents d ON d.id = m.document_id
  WHERE d.status = 'CONFIRMED'
    AND d.document_type = 'ISSUE'
    AND m.movement_kind = 'ISSUE'
    AND d.production_order_id IS NOT NULL
  GROUP BY d.production_order_id, d.tenant_id, m.inventory_item_id, m.unit
), returned AS (
  SELECT
    d.production_order_id,
    d.tenant_id,
    m.inventory_item_id,
    m.unit,
    sum(abs(m.value_delta)) AS value,
    sum(abs(m.quantity_delta)) AS qty
  FROM public.inventory_movements m
  JOIN public.inventory_documents d ON d.id = m.document_id
  WHERE d.status = 'CONFIRMED'
    AND d.document_type = 'RETURN_IN'
    AND m.movement_kind = 'RETURN_IN'
    AND d.production_order_id IS NOT NULL
  GROUP BY d.production_order_id, d.tenant_id, m.inventory_item_id, m.unit
), balances AS (
  SELECT tenant_id, inventory_item_id, sum(quantity_on_hand)::numeric(18,4) AS quantity_on_hand
  FROM public.inventory_balances
  GROUP BY tenant_id, inventory_item_id
)
SELECT
  r.production_order_id,
  r.tenant_id,
  r.inventory_item_id,
  r.unit,
  r.standard_quantity,
  r.planned_quantity,
  COALESCE(i.qty, 0) AS issued_quantity,
  COALESCE(ret.qty, 0) AS returned_quantity,
  COALESCE(i.qty, 0) - COALESCE(ret.qty, 0) AS actual_consumption_quantity,
  (COALESCE(i.qty, 0) - COALESCE(ret.qty, 0)) - r.standard_quantity AS quantity_variance,
  COALESCE(i.value, 0) - COALESCE(ret.value, 0) AS actual_material_cost,
  b.quantity_on_hand AS current_stock
FROM public.production_order_material_requirements r
LEFT JOIN issued i
  ON i.production_order_id = r.production_order_id
 AND i.tenant_id = r.tenant_id
 AND i.inventory_item_id = r.inventory_item_id
 AND i.unit = r.unit
LEFT JOIN returned ret
  ON ret.production_order_id = r.production_order_id
 AND ret.tenant_id = r.tenant_id
 AND ret.inventory_item_id = r.inventory_item_id
 AND ret.unit = r.unit
LEFT JOIN balances b
  ON b.tenant_id = r.tenant_id
 AND b.inventory_item_id = r.inventory_item_id;

-- Cost and tenant filtering are enforced by get_production_order_variance().
-- The raw owner-executed view must never be exposed through PostgREST.
REVOKE SELECT ON public.production_order_material_variance FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.start_production_operation(uuid, uuid) IS
  'Starts an operation only on an active production order and records the first real operation start on the header.';
COMMENT ON FUNCTION public.complete_production_operation(uuid, numeric, numeric, numeric, uuid) IS
  'Completes only an already-started operation after mandatory predecessors and synchronizes loss totals.';
COMMENT ON FUNCTION public.validate_inventory_document_for_confirm(uuid) IS
  'Revalidates inventory documents at confirm time and enforces production material issue tolerance under a production-order lock.';
COMMENT ON VIEW public.production_order_material_variance IS
  'Actual material = confirmed production ISSUE minus RETURN_IN; stock is aggregated before joining requirements.';
