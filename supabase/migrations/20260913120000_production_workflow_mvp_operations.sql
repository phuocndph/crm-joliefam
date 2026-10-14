-- Production workflow MVP operations: batch workflow, stage approvals, payroll output,
-- and the bridge to the legacy Fabric Management ledger.

BEGIN;

ALTER TABLE public.production_order_items
  ADD COLUMN IF NOT EXISTS source_order_item_key text;

ALTER TABLE public.production_stage_events
  ADD COLUMN IF NOT EXISTS production_entry_id uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS reversed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversal_reason text;

ALTER TABLE public.production_entries
  ADD COLUMN IF NOT EXISTS production_order_id uuid,
  ADD COLUMN IF NOT EXISTS production_order_number_snapshot text;

ALTER TABLE public.production_batches
  ADD COLUMN IF NOT EXISTS completed_quantity numeric(18,4) NOT NULL DEFAULT 0
    CHECK (completed_quantity >= 0 AND completed_quantity <= planned_quantity);

ALTER TABLE public.production_fabric_allocations
  ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'FABRIC_MANAGEMENT',
  ADD COLUMN IF NOT EXISTS source_fabric_usage_id uuid,
  ADD COLUMN IF NOT EXISTS source_fabric_transaction_id uuid,
  ADD COLUMN IF NOT EXISTS issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE UNIQUE INDEX IF NOT EXISTS production_entries_tenant_id_unique
  ON public.production_entries (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS production_stage_events_entry_unique
  ON public.production_stage_events (tenant_id, production_entry_id)
  WHERE production_entry_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_stage_events_entry_tenant_fkey') THEN
    ALTER TABLE public.production_stage_events
      ADD CONSTRAINT production_stage_events_entry_tenant_fkey
      FOREIGN KEY (tenant_id, production_entry_id)
      REFERENCES public.production_entries (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_entries_order_tenant_fkey') THEN
    ALTER TABLE public.production_entries
      ADD CONSTRAINT production_entries_order_tenant_fkey
      FOREIGN KEY (tenant_id, production_order_id)
      REFERENCES public.production_orders (tenant_id, id) NOT VALID;
  END IF;
END $$;

UPDATE public.production_entries e
SET production_order_id = op.production_order_id,
    production_order_number_snapshot = po.production_order_number
FROM public.production_order_operations op
JOIN public.production_orders po
  ON po.tenant_id = op.tenant_id AND po.id = op.production_order_id
WHERE e.tenant_id = op.tenant_id
  AND e.production_order_operation_id = op.id
  AND (e.production_order_id IS NULL OR e.production_order_number_snapshot IS NULL);

CREATE OR REPLACE FUNCTION public.guard_production_entry_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND current_setting('app.production_entry_workflow_transition', true) = 'on'
     AND NEW.id = OLD.id
     AND NEW.tenant_id = OLD.tenant_id
     AND NEW.worker_id = OLD.worker_id
     AND NEW.product_id = OLD.product_id
     AND NEW.production_order_operation_id IS NOT DISTINCT FROM OLD.production_order_operation_id
     AND NEW.production_order_id IS NOT DISTINCT FROM OLD.production_order_id
     AND NEW.production_order_number_snapshot IS NOT DISTINCT FROM OLD.production_order_number_snapshot
     AND NEW.work_date = OLD.work_date
     AND NEW.quantity = OLD.quantity
     AND NEW.product_sku_snapshot = OLD.product_sku_snapshot
     AND NEW.product_name_snapshot = OLD.product_name_snapshot
     AND NEW.product_rate_version_id = OLD.product_rate_version_id
     AND NEW.rate_unit_snapshot = OLD.rate_unit_snapshot
     AND NEW.rate_amount_snapshot = OLD.rate_amount_snapshot
     AND NEW.currency_code_snapshot = OLD.currency_code_snapshot
     AND NEW.calculated_amount_snapshot = OLD.calculated_amount_snapshot
     AND NEW.formula_basis = OLD.formula_basis
     AND NEW.idempotency_key = OLD.idempotency_key
     AND NEW.notes IS NOT DISTINCT FROM OLD.notes
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at = OLD.created_at
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Bản ghi sản lượng là bất biến; hãy dùng workflow hoặc tạo bản ghi điều chỉnh';
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_production_entry_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation_product_id uuid;
  v_operation_order_id uuid;
  v_order_number text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.production_workers w
    WHERE w.id = NEW.worker_id AND w.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Nhân sự không cùng phạm vi dữ liệu';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = NEW.product_id AND p.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Sản phẩm không cùng phạm vi dữ liệu';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.product_piece_rate_versions r
    WHERE r.id = NEW.product_rate_version_id
      AND r.tenant_id = NEW.tenant_id
      AND r.product_id = NEW.product_id
  ) THEN
    RAISE EXCEPTION 'Phiên bản đơn giá không thuộc sản phẩm';
  END IF;
  IF NEW.production_order_operation_id IS NOT NULL THEN
    SELECT po.product_id, po.id, po.production_order_number
    INTO v_operation_product_id, v_operation_order_id, v_order_number
    FROM public.production_order_operations op
    JOIN public.production_orders po
      ON po.id = op.production_order_id AND po.tenant_id = op.tenant_id
    WHERE op.id = NEW.production_order_operation_id
      AND op.tenant_id = NEW.tenant_id;
    IF v_operation_product_id IS NULL THEN
      RAISE EXCEPTION 'Công đoạn sản xuất không tồn tại trong phạm vi dữ liệu';
    END IF;
    IF v_operation_product_id <> NEW.product_id THEN
      RAISE EXCEPTION 'Sản phẩm không khớp lệnh sản xuất của công đoạn';
    END IF;
    IF NEW.production_order_id IS NOT NULL AND NEW.production_order_id <> v_operation_order_id THEN
      RAISE EXCEPTION 'Lệnh sản xuất không khớp công đoạn';
    END IF;
  END IF;
  IF NEW.production_order_id IS NOT NULL THEN
    SELECT production_order_number INTO v_order_number
    FROM public.production_orders
    WHERE id = NEW.production_order_id AND tenant_id = NEW.tenant_id
      AND product_id = NEW.product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lệnh sản xuất không cùng phạm vi hoặc không khớp sản phẩm';
    END IF;
    IF NEW.production_order_number_snapshot IS NOT NULL
       AND NEW.production_order_number_snapshot <> v_order_number THEN
      RAISE EXCEPTION 'Số lệnh sản xuất snapshot không khớp dữ liệu gốc';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_production_workflow_totals(
  p_production_order_id uuid,
  p_production_batch_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_final_stage text;
  v_good numeric := 0;
  v_item_count integer := 0;
BEGIN
  SELECT e.stage INTO v_final_stage
  FROM public.production_stage_events e
  WHERE e.tenant_id = v_tenant
    AND e.production_order_id = p_production_order_id
    AND e.production_batch_id = p_production_batch_id
    AND e.status = 'APPROVED'
  ORDER BY CASE e.stage
    WHEN 'SHIPPING' THEN 7 WHEN 'PACKING' THEN 6 WHEN 'FOLDING' THEN 5
    WHEN 'REWORK' THEN 4 WHEN 'QUALITY_CHECK' THEN 3 WHEN 'SEWING' THEN 2
    WHEN 'CUTTING' THEN 1 ELSE 0 END DESC
  LIMIT 1;

  IF v_final_stage IS NOT NULL THEN
    SELECT COALESCE(sum(quantity_good), 0) INTO v_good
    FROM public.production_stage_events
    WHERE tenant_id = v_tenant AND production_order_id = p_production_order_id
      AND production_batch_id = p_production_batch_id AND status = 'APPROVED'
      AND (stage = v_final_stage OR (v_final_stage = 'REWORK' AND stage = 'QUALITY_CHECK'));
  END IF;
  SELECT count(*) INTO v_item_count FROM public.production_order_items
  WHERE tenant_id = v_tenant AND production_order_id = p_production_order_id;

  PERFORM set_config('app.production_workflow_transition', 'on', true);
  PERFORM set_config('app.production_transition', 'on', true);
  UPDATE public.production_order_items i
  SET completed_quantity = LEAST(i.planned_quantity, COALESCE((
    WITH batch_stage AS (
      SELECT b.id, (
        SELECT e.stage FROM public.production_stage_events e
        WHERE e.tenant_id = v_tenant AND e.production_batch_id = b.id AND e.status = 'APPROVED'
        ORDER BY CASE e.stage
          WHEN 'SHIPPING' THEN 7 WHEN 'PACKING' THEN 6 WHEN 'FOLDING' THEN 5
          WHEN 'REWORK' THEN 4 WHEN 'QUALITY_CHECK' THEN 3 WHEN 'SEWING' THEN 2
          WHEN 'CUTTING' THEN 1 ELSE 0 END DESC LIMIT 1
      ) AS final_stage
      FROM public.production_batches b
      WHERE b.tenant_id = v_tenant AND b.production_order_id = p_production_order_id
        AND b.status <> 'CANCELLED'
    )
    SELECT sum(e.quantity_good)
    FROM batch_stage bs
    JOIN public.production_stage_events e ON e.production_batch_id = bs.id
    WHERE e.tenant_id = v_tenant AND e.status = 'APPROVED'
      AND (e.order_item_id = i.id OR (e.order_item_id IS NULL AND v_item_count = 1))
      AND (e.stage = bs.final_stage OR (bs.final_stage = 'REWORK' AND e.stage = 'QUALITY_CHECK'))
  ), 0))
  WHERE i.tenant_id = v_tenant AND i.production_order_id = p_production_order_id;

  UPDATE public.production_batches b
  SET completed_quantity = LEAST(b.planned_quantity, v_good)
  WHERE b.tenant_id = v_tenant AND b.production_order_id = p_production_order_id
    AND b.id = p_production_batch_id;

  UPDATE public.production_orders p
  SET quantity_good = LEAST(p.quantity_planned, COALESCE((
        SELECT sum(b.completed_quantity) FROM public.production_batches b
        WHERE b.tenant_id = v_tenant AND b.production_order_id = p.id
          AND b.status <> 'CANCELLED'
      ), 0)),
      updated_at = now()
  WHERE p.id = p_production_order_id AND p.tenant_id = v_tenant
    AND p.status <> 'COMPLETED';
  PERFORM set_config('app.production_transition', 'off', true);
  PERFORM set_config('app.production_workflow_transition', 'off', true);
END;
$$;

-- A NULL manager_id is a valid unassigned legacy row, not a missing record.
CREATE OR REPLACE FUNCTION public.delete_fabric_usage_and_transaction(p_usage_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_manager_id text;
BEGIN
  SELECT manager_id INTO v_manager_id FROM public.fabric_usage WHERE id = p_usage_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fabric usage record not found.'; END IF;
  IF v_manager_id IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.has_role(auth.uid(), 'accountant')
     AND v_manager_id IS DISTINCT FROM (
       SELECT COALESCE(ur.assigned_by, ur.user_id)::text
       FROM public.user_roles ur WHERE ur.user_id = auth.uid() LIMIT 1
     ) THEN
    RAISE EXCEPTION 'You do not have access to this usage record.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fabric_transactions' AND column_name = 'fabric_usage_id'
  ) THEN
    DELETE FROM public.fabric_transactions WHERE fabric_usage_id = p_usage_id;
  END IF;
  DELETE FROM public.fabric_usage WHERE id = p_usage_id;
  RETURN jsonb_build_object('success', true, 'usage_id', p_usage_id);
END;
$$;

-- Keep the production order link on payroll facts even when an order has no
-- routing operation yet. Legacy callers use the seven-argument wrapper below.
DROP FUNCTION IF EXISTS public.record_production_entry(uuid,uuid,date,numeric,uuid,text,text);
CREATE FUNCTION public.record_production_entry(
  p_worker_id uuid,
  p_product_id uuid,
  p_work_date date,
  p_quantity numeric,
  p_production_order_operation_id uuid,
  p_idempotency_key text,
  p_notes text,
  p_production_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_worker public.production_workers;
  v_product public.products;
  v_rate public.product_piece_rate_versions;
  v_existing public.production_entries;
  v_entry public.production_entries;
  v_order public.production_orders;
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_notes text := NULLIF(btrim(p_notes), '');
  v_rate_count integer;
  v_sku_count integer;
  v_order_id uuid := p_production_order_id;
  v_order_number text;
  v_cost_visible boolean := public.has_payroll_permission('payroll_rate_view')
    OR public.has_payroll_permission('payroll_rate_manage')
    OR public.has_cost_permission('inventory_cost_view');
BEGIN
  IF NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền ghi sản lượng sản phẩm';
  END IF;
  IF v_key IS NULL THEN RAISE EXCEPTION 'Mã yêu cầu sản lượng là bắt buộc'; END IF;
  IF p_work_date IS NULL OR p_work_date > CURRENT_DATE THEN RAISE EXCEPTION 'Ngày sản lượng không hợp lệ'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Số lượng sản phẩm phải lớn hơn 0'; END IF;
  IF p_product_id IS NULL THEN RAISE EXCEPTION 'Sản phẩm là bắt buộc'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('production-entry:' || v_tenant || ':' || v_key, 0));
  SELECT * INTO v_existing FROM public.production_entries
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.worker_id <> p_worker_id
       OR v_existing.product_id <> p_product_id
       OR v_existing.work_date <> p_work_date
       OR v_existing.quantity <> p_quantity
       OR v_existing.production_order_operation_id IS DISTINCT FROM p_production_order_operation_id
       OR v_existing.production_order_id IS DISTINCT FROM v_order_id
       OR v_existing.notes IS DISTINCT FROM v_notes THEN
      RAISE EXCEPTION 'Mã yêu cầu đã được dùng cho dữ liệu sản lượng khác';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id, 'reused', true,
      'status', public.current_production_entry_status(v_existing.id),
      'production_order_id', v_existing.production_order_id,
      'production_order_number', v_existing.production_order_number_snapshot,
      'cost_visible', v_cost_visible,
      'calculated_amount', CASE WHEN v_cost_visible THEN v_existing.calculated_amount_snapshot ELSE NULL END
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'factory-attendance-closure:' || v_tenant || ':' || p_worker_id::text || ':' || p_work_date::text, 0
  ));
  IF NOT public.factory_attendance_worker_in_scope(p_worker_id, p_work_date) THEN
    RAISE EXCEPTION 'Bạn không có quyền ghi sản lượng cho nhân sự này';
  END IF;
  SELECT * INTO v_worker FROM public.production_workers
  WHERE id = p_worker_id AND tenant_id = v_tenant AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nhân sự không tồn tại hoặc không hoạt động'; END IF;
  IF NOT public.production_entry_day_is_open(p_worker_id, p_work_date) THEN
    RAISE EXCEPTION 'Ngày công đã bị chặn hoặc đã được quản lý chốt; hãy mở lại/cập nhật trạng thái ngày trước';
  END IF;

  SELECT * INTO v_product FROM public.products
  WHERE id = p_product_id AND tenant_id = v_tenant AND COALESCE(in_stock, true);
  IF NOT FOUND THEN RAISE EXCEPTION 'Sản phẩm không tồn tại hoặc không còn sử dụng'; END IF;
  IF NULLIF(btrim(v_product.sku), '') IS NULL THEN
    RAISE EXCEPTION 'Sản phẩm chưa có mã SKU; chưa thể ghi sản lượng';
  END IF;
  SELECT count(*) INTO v_sku_count FROM public.products p
  WHERE p.tenant_id = v_tenant AND lower(btrim(p.sku)) = lower(btrim(v_product.sku));
  IF v_sku_count <> 1 THEN RAISE EXCEPTION 'SKU sản phẩm đang bị trùng; chưa thể ghi sản lượng'; END IF;

  IF p_production_order_operation_id IS NOT NULL THEN
    SELECT po.id, po.production_order_number INTO v_order_id, v_order_number
    FROM public.production_order_operations op
    JOIN public.production_orders po ON po.id = op.production_order_id AND po.tenant_id = op.tenant_id
    WHERE op.id = p_production_order_operation_id AND op.tenant_id = v_tenant AND po.product_id = p_product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Công đoạn không tồn tại hoặc không khớp sản phẩm'; END IF;
    IF p_production_order_id IS NOT NULL AND p_production_order_id <> v_order_id THEN
      RAISE EXCEPTION 'Lệnh sản xuất không khớp công đoạn';
    END IF;
  ELSIF v_order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.production_orders
    WHERE id = v_order_id AND tenant_id = v_tenant AND product_id = p_product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lệnh sản xuất không tồn tại hoặc không khớp sản phẩm'; END IF;
    v_order_number := v_order.production_order_number;
  END IF;

  SELECT count(*) INTO v_rate_count FROM public.product_piece_rate_versions x
  WHERE x.tenant_id = v_tenant AND x.product_id = p_product_id
    AND x.status IN ('APPROVED','RETIRED') AND x.effective_from <= p_work_date
    AND (x.effective_to IS NULL OR x.effective_to >= p_work_date);
  IF v_rate_count = 0 THEN RAISE EXCEPTION 'Sản phẩm chưa có đơn giá đã duyệt hiệu lực trong ngày sản xuất'; END IF;
  IF v_rate_count > 1 THEN RAISE EXCEPTION 'Sản phẩm có nhiều đơn giá cùng hiệu lực; cần xử lý dữ liệu đơn giá trước'; END IF;
  SELECT * INTO v_rate FROM public.product_piece_rate_versions x
  WHERE x.tenant_id = v_tenant AND x.product_id = p_product_id
    AND x.status IN ('APPROVED','RETIRED') AND x.effective_from <= p_work_date
    AND (x.effective_to IS NULL OR x.effective_to >= p_work_date)
  ORDER BY x.effective_from DESC, x.created_at DESC LIMIT 1;
  IF v_rate.rate <= 0 THEN RAISE EXCEPTION 'Đơn giá sản phẩm hiệu lực phải lớn hơn 0'; END IF;

  INSERT INTO public.production_entries (
    tenant_id, worker_id, product_id, production_order_id, production_order_operation_id,
    production_order_number_snapshot, work_date, quantity, product_sku_snapshot,
    product_name_snapshot, product_rate_version_id, rate_unit_snapshot, rate_amount_snapshot,
    currency_code_snapshot, calculated_amount_snapshot, idempotency_key, notes, created_by,
    submitted_by, submitted_at, workflow_actor_id, workflow_at
  ) VALUES (
    v_tenant, p_worker_id, p_product_id, v_order_id, p_production_order_operation_id,
    v_order_number, p_work_date, p_quantity, btrim(v_product.sku), btrim(v_product.name),
    v_rate.id, v_rate.unit, v_rate.rate, v_rate.currency_code, round(v_rate.rate * p_quantity, 2),
    v_key, v_notes, auth.uid(), auth.uid(), now(), auth.uid(), now()
  ) RETURNING * INTO v_entry;

  INSERT INTO public.production_entry_workflow_events (
    tenant_id, production_entry_id, status, idempotency_key, actor_id
  ) VALUES (v_tenant, v_entry.id, 'SUBMITTED', 'submit:' || v_entry.id::text, auth.uid());
  PERFORM public.write_cost_audit(
    'production_entries', v_entry.id, 'SUBMIT', NULL,
    jsonb_build_object('worker_id', v_entry.worker_id, 'product_id', v_entry.product_id,
      'production_order_id', v_entry.production_order_id, 'production_order_number', v_entry.production_order_number_snapshot,
      'work_date', v_entry.work_date, 'quantity', v_entry.quantity), v_notes
  );
  RETURN jsonb_build_object(
    'id', v_entry.id, 'reused', false, 'status', 'SUBMITTED',
    'production_order_id', v_entry.production_order_id,
    'production_order_number', v_entry.production_order_number_snapshot,
    'cost_visible', v_cost_visible,
    'calculated_amount', CASE WHEN v_cost_visible THEN v_entry.calculated_amount_snapshot ELSE NULL END
  );
END;
$$;

-- Preserve the original RPC signature for existing clients and integrations.
CREATE FUNCTION public.record_production_entry(
  p_worker_id uuid,
  p_product_id uuid,
  p_work_date date,
  p_quantity numeric,
  p_production_order_operation_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.record_production_entry(
    p_worker_id, p_product_id, p_work_date, p_quantity,
    p_production_order_operation_id, p_idempotency_key, p_notes, NULL::uuid
  );
$$;

CREATE OR REPLACE FUNCTION public.list_production_entries_month(
  p_month_start date,
  p_include_reversed boolean DEFAULT false
)
RETURNS TABLE (
  id uuid, worker_id uuid, employee_code text, worker_name text, worker_type text,
  product_id uuid, product_sku text, product_name text, work_date date, quantity numeric,
  production_order_operation_id uuid, production_order_number text, rate_unit text,
  rate_amount numeric, calculated_amount numeric, currency_code text, workflow_status text,
  workflow_reason text, workflow_at timestamptz, workflow_actor_id uuid, notes text,
  created_at timestamptz, cost_visible boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_month_end date := ((p_month_start + INTERVAL '1 month')::date - 1);
  v_cost_visible boolean := public.has_payroll_permission('payroll_rate_view')
    OR public.has_payroll_permission('payroll_rate_manage')
    OR public.has_cost_permission('inventory_cost_view');
BEGIN
  IF NOT public.has_production_permission('production_view')
     AND NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem sản lượng sản phẩm';
  END IF;
  IF p_month_start IS NULL OR p_month_start <> date_trunc('month', p_month_start)::date THEN
    RAISE EXCEPTION 'Tháng sản lượng không hợp lệ';
  END IF;
  RETURN QUERY
  SELECT x.id, x.worker_id, w.employee_code, w.display_name, w.worker_type,
    x.product_id, x.product_sku_snapshot, x.product_name_snapshot, x.work_date, x.quantity,
    x.production_order_operation_id,
    COALESCE(po_op.production_order_number, x.production_order_number_snapshot, po_link.production_order_number),
    x.rate_unit_snapshot,
    CASE WHEN v_cost_visible THEN x.rate_amount_snapshot ELSE NULL END,
    CASE WHEN v_cost_visible THEN x.calculated_amount_snapshot ELSE NULL END,
    x.currency_code_snapshot, wf.status, wf.reason, wf.created_at, wf.actor_id,
    x.notes, x.created_at, v_cost_visible
  FROM public.production_entries x
  JOIN public.production_workers w ON w.id = x.worker_id AND w.tenant_id = x.tenant_id
  LEFT JOIN public.production_order_operations op
    ON op.id = x.production_order_operation_id AND op.tenant_id = x.tenant_id
  LEFT JOIN public.production_orders po_op
    ON po_op.id = op.production_order_id AND po_op.tenant_id = op.tenant_id
  LEFT JOIN public.production_orders po_link
    ON po_link.id = x.production_order_id AND po_link.tenant_id = x.tenant_id
  JOIN LATERAL (
    SELECT e.status, e.reason, e.created_at, e.actor_id
    FROM public.production_entry_workflow_events e
    WHERE e.tenant_id = x.tenant_id AND e.production_entry_id = x.id
    ORDER BY e.event_sequence DESC LIMIT 1
  ) wf ON true
  WHERE x.tenant_id = v_tenant
    AND x.work_date BETWEEN p_month_start AND v_month_end
    AND public.factory_attendance_worker_in_scope(x.worker_id, x.work_date)
    AND (COALESCE(p_include_reversed, false) OR wf.status <> 'REVERSED')
  ORDER BY x.work_date DESC, w.display_name, x.product_sku_snapshot, x.created_at DESC;
END;
$$;

CREATE TABLE IF NOT EXISTS public.production_batch_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tenant_id text NOT NULL DEFAULT 'default',
  production_batch_id uuid NOT NULL REFERENCES public.production_batches(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED')),
  reason text,
  idempotency_key text NOT NULL CHECK (NULLIF(btrim(idempotency_key), '') IS NOT NULL),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.production_stage_event_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tenant_id text NOT NULL DEFAULT 'default',
  production_stage_event_id uuid NOT NULL REFERENCES public.production_stage_events(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('SUBMITTED','APPROVED','REJECTED','REVERSED')),
  reason text,
  idempotency_key text NOT NULL CHECK (NULLIF(btrim(idempotency_key), '') IS NOT NULL),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.production_fabric_allocation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tenant_id text NOT NULL DEFAULT 'default',
  production_fabric_allocation_id uuid NOT NULL REFERENCES public.production_fabric_allocations(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('ISSUED','CONSUMED','RETURNED')),
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  reason text,
  idempotency_key text NOT NULL CHECK (NULLIF(btrim(idempotency_key), '') IS NOT NULL),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS production_batch_workflow_lookup_idx
  ON public.production_batch_workflow_events (tenant_id, production_batch_id, event_sequence DESC);
CREATE INDEX IF NOT EXISTS production_stage_event_workflow_lookup_idx
  ON public.production_stage_event_workflow_events (tenant_id, production_stage_event_id, event_sequence DESC);
CREATE INDEX IF NOT EXISTS production_fabric_allocation_events_lookup_idx
  ON public.production_fabric_allocation_events (tenant_id, production_fabric_allocation_id, event_sequence DESC);

CREATE OR REPLACE FUNCTION public.guard_production_workflow_event_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Lịch sử workflow sản xuất là append-only';
END;
$$;

DROP TRIGGER IF EXISTS production_batch_workflow_append_only ON public.production_batch_workflow_events;
CREATE TRIGGER production_batch_workflow_append_only BEFORE UPDATE OR DELETE ON public.production_batch_workflow_events
FOR EACH ROW EXECUTE FUNCTION public.guard_production_workflow_event_append_only();
DROP TRIGGER IF EXISTS production_stage_workflow_append_only ON public.production_stage_event_workflow_events;
CREATE TRIGGER production_stage_workflow_append_only BEFORE UPDATE OR DELETE ON public.production_stage_event_workflow_events
FOR EACH ROW EXECUTE FUNCTION public.guard_production_workflow_event_append_only();
DROP TRIGGER IF EXISTS production_fabric_events_append_only ON public.production_fabric_allocation_events;
CREATE TRIGGER production_fabric_events_append_only BEFORE UPDATE OR DELETE ON public.production_fabric_allocation_events
FOR EACH ROW EXECUTE FUNCTION public.guard_production_workflow_event_append_only();

-- The hardening migration attached the audit trigger to these tables, but its
-- original implementation passed raw trigger verbs (INSERT/UPDATE/DELETE).
-- Audit events use CREATE/UPDATE/DELETE, so normalize the insert action before
-- the backfill below and for all future workflow mutations.
CREATE OR REPLACE FUNCTION public.audit_production_workflow_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.write_cost_audit(
    TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE WHEN TG_OP = 'INSERT' THEN 'CREATE' ELSE TG_OP END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    NULL
  );
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Backfill a usable batch for orders created before this migration.
INSERT INTO public.production_batches (
  tenant_id, production_order_id, batch_number, planned_quantity, status,
  idempotency_key, created_by
)
SELECT p.tenant_id, p.id, 'LÔ-01', p.quantity_planned,
  CASE WHEN p.status = 'COMPLETED' THEN 'COMPLETED'
       WHEN p.status IN ('RELEASED','IN_PROGRESS','ON_HOLD') THEN 'IN_PROGRESS'
       WHEN p.status = 'CANCELLED' THEN 'CANCELLED'
       ELSE 'PLANNED' END,
  'default-batch:' || p.id::text, p.created_by
FROM public.production_orders p
WHERE NOT EXISTS (
  SELECT 1 FROM public.production_batches b
  WHERE b.tenant_id = p.tenant_id AND b.production_order_id = p.id
);

INSERT INTO public.production_batch_workflow_events (
  tenant_id, production_batch_id, status, idempotency_key, actor_id
)
SELECT b.tenant_id, b.id, b.status, 'batch-initial:' || b.id::text, b.created_by
FROM public.production_batches b
WHERE NOT EXISTS (
  SELECT 1 FROM public.production_batch_workflow_events e
  WHERE e.tenant_id = b.tenant_id AND e.production_batch_id = b.id
);

-- Replace group creation so source order line identifiers remain lossless text.
CREATE OR REPLACE FUNCTION public.create_production_order_group(
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_existing public.production_order_group_requests;
  v_group public.production_order_group_requests;
  v_lines jsonb;
  v_line jsonb;
  v_result jsonb;
  v_orders jsonb := '[]'::jsonb;
  v_order_id uuid;
  v_product_id uuid;
  v_fabric_id uuid;
  v_source_item_id uuid;
  v_source_item_key text;
  v_quantity numeric;
  v_source_type text;
  v_start date;
  v_end date;
  v_num text;
  v_order public.production_orders;
  v_item public.production_order_items;
  v_batch public.production_batches;
  v_product record;
  v_idx integer := 0;
BEGIN
  IF NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền tạo nhóm lệnh sản xuất';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Payload nhóm lệnh sản xuất không hợp lệ';
  END IF;
  IF NULLIF(btrim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'Thiếu khóa idempotency của nhóm lệnh';
  END IF;
  v_lines := p_payload -> 'lines';
  IF v_lines IS NULL OR jsonb_typeof(v_lines) <> 'array' OR jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'Nhóm lệnh phải có ít nhất một dòng sản phẩm';
  END IF;
  IF jsonb_array_length(v_lines) > 100 THEN
    RAISE EXCEPTION 'Nhóm lệnh không được vượt quá 100 dòng';
  END IF;

  SELECT * INTO v_existing FROM public.production_order_group_requests
  WHERE tenant_id = v_tenant AND idempotency_key = btrim(p_idempotency_key) FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_payload <> p_payload THEN
      RAISE EXCEPTION 'Khóa idempotency đã được dùng cho payload khác';
    END IF;
    RETURN v_existing.result_payload || jsonb_build_object('reused', true);
  END IF;

  BEGIN
    INSERT INTO public.production_order_group_requests (
      tenant_id, idempotency_key, request_payload, created_by
    ) VALUES (v_tenant, btrim(p_idempotency_key), p_payload, auth.uid())
    RETURNING * INTO v_group;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing FROM public.production_order_group_requests
    WHERE tenant_id = v_tenant AND idempotency_key = btrim(p_idempotency_key) FOR UPDATE;
    IF v_existing.request_payload <> p_payload THEN
      RAISE EXCEPTION 'Khóa idempotency đã được dùng cho payload khác';
    END IF;
    RETURN v_existing.result_payload || jsonb_build_object('reused', true);
  END;

  v_order_id := NULLIF(p_payload ->> 'order_id', '')::uuid;
  IF v_order_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = v_order_id AND o.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Đơn hàng nguồn không tồn tại hoặc không cùng phạm vi dữ liệu';
  END IF;
  v_source_type := COALESCE(NULLIF(p_payload ->> 'source_type', ''), 'FROM_ORDER');
  IF v_source_type NOT IN ('MANUAL','FROM_ORDER','FROM_STOCK_PLAN') THEN
    RAISE EXCEPTION 'Nguồn lệnh sản xuất không hợp lệ';
  END IF;
  v_start := NULLIF(p_payload ->> 'planned_start_date', '')::date;
  v_end := NULLIF(p_payload ->> 'planned_end_date', '')::date;
  IF v_start IS NOT NULL AND v_end IS NOT NULL AND v_end < v_start THEN
    RAISE EXCEPTION 'Ngày kế hoạch không hợp lệ';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines)
  LOOP
    v_idx := v_idx + 1;
    IF jsonb_typeof(v_line) <> 'object' THEN RAISE EXCEPTION 'Dòng % không hợp lệ', v_idx; END IF;
    v_product_id := NULLIF(v_line ->> 'product_id', '')::uuid;
    v_quantity := NULLIF(v_line ->> 'quantity', '')::numeric;
    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Dòng % phải có sản phẩm và số lượng lớn hơn 0', v_idx;
    END IF;
    SELECT p.id, p.sku, p.name INTO v_product
    FROM public.products p WHERE p.id = v_product_id AND p.tenant_id = v_tenant;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sản phẩm dòng % không tồn tại', v_idx; END IF;
    v_fabric_id := NULLIF(v_line ->> 'fabric_variant_id', '')::uuid;
    IF v_fabric_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.fabric_variants f WHERE f.id = v_fabric_id AND f.tenant_id = v_tenant
    ) THEN RAISE EXCEPTION 'Vải dòng % không tồn tại', v_idx; END IF;

    v_source_item_key := NULLIF(btrim(COALESCE(
      v_line ->> 'source_order_item_key', v_line ->> 'source_order_item_id'
    )), '');
    v_source_item_id := CASE
      WHEN v_source_item_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN v_source_item_key::uuid ELSE NULL END;

    v_num := public.generate_production_order_number();
    INSERT INTO public.production_orders (
      tenant_id, production_order_group_id, production_order_number, production_batch_number,
      product_id, quantity_planned, status, source_type, source_id, order_id,
      planned_start_date, planned_end_date, cutting_params_snapshot, created_by
    ) VALUES (
      v_tenant, v_group.id, v_num, v_num, v_product_id, v_quantity, 'DRAFT',
      v_source_type, v_order_id, v_order_id, v_start, v_end,
      jsonb_build_object('group_id', v_group.id, 'notes', NULLIF(p_payload ->> 'notes', '')),
      auth.uid()
    ) RETURNING * INTO v_order;
    PERFORM public.write_cost_audit('production_orders', v_order.id, 'CREATE', NULL, to_jsonb(v_order), NULL);

    INSERT INTO public.production_order_items (
      tenant_id, production_order_id, source_order_item_id, source_order_item_key,
      source_item_snapshot, product_id, product_sku_snapshot, product_name_snapshot,
      fabric_variant_id, color, size, dimensions, planned_quantity, notes
    ) VALUES (
      v_tenant, v_order.id, v_source_item_id, v_source_item_key,
      COALESCE(v_line -> 'source_item_snapshot', v_line), v_product_id,
      v_product.sku, v_product.name, v_fabric_id,
      NULLIF(v_line ->> 'color', ''), NULLIF(v_line ->> 'size', ''),
      NULLIF(v_line ->> 'dimensions', ''), v_quantity, NULLIF(v_line ->> 'notes', '')
    ) RETURNING * INTO v_item;

    INSERT INTO public.production_batches (
      tenant_id, production_order_id, batch_number, planned_quantity, status,
      idempotency_key, created_by
    ) VALUES (
      v_tenant, v_order.id, 'LÔ-01', v_quantity, 'PLANNED',
      v_group.id::text || ':batch:' || v_idx::text, auth.uid()
    ) RETURNING * INTO v_batch;
    INSERT INTO public.production_batch_workflow_events (
      tenant_id, production_batch_id, status, idempotency_key, actor_id
    ) VALUES (v_tenant, v_batch.id, 'PLANNED', 'batch-initial:' || v_batch.id::text, auth.uid());

    v_orders := v_orders || jsonb_build_array(jsonb_build_object(
      'id', v_order.id, 'production_order_number', v_order.production_order_number,
      'production_order_group_id', v_group.id, 'product_id', v_product_id,
      'quantity_planned', v_quantity, 'status', v_order.status,
      'order_item_id', v_item.id, 'production_batch_id', v_batch.id,
      'source_order_item_key', v_source_item_key, 'fabric_variant_id', v_fabric_id,
      'color', NULLIF(v_line ->> 'color', ''), 'size', NULLIF(v_line ->> 'size', ''),
      'dimensions', NULLIF(v_line ->> 'dimensions', '')
    ));
  END LOOP;

  v_result := jsonb_build_object(
    'group_id', v_group.id, 'idempotency_key', v_group.idempotency_key,
    'reused', false, 'orders', v_orders, 'order_count', jsonb_array_length(v_orders)
  );
  UPDATE public.production_order_group_requests SET result_payload = v_result WHERE id = v_group.id;
  PERFORM public.write_cost_audit('production_order_group_requests', v_group.id, 'CREATE', NULL, v_result, NULL);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_production_batch_status(
  p_production_batch_id uuid,
  p_target_status text,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_batch public.production_batches;
  v_existing public.production_batch_workflow_events;
  v_event public.production_batch_workflow_events;
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền cập nhật batch';
  END IF;
  IF v_key IS NULL OR p_target_status NOT IN ('IN_PROGRESS','COMPLETED','CANCELLED') THEN
    RAISE EXCEPTION 'Trạng thái hoặc mã yêu cầu batch không hợp lệ';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'production-batch-workflow:' || v_tenant || ':' || v_key, 0
  ));
  SELECT * INTO v_existing FROM public.production_batch_workflow_events
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.production_batch_id <> p_production_batch_id
       OR v_existing.status <> p_target_status OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'Mã yêu cầu đã dùng cho workflow batch khác';
    END IF;
    RETURN jsonb_build_object('id', p_production_batch_id, 'status', v_existing.status, 'reused', true);
  END IF;
  SELECT * INTO v_batch FROM public.production_batches
  WHERE id = p_production_batch_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch không tồn tại'; END IF;
  IF (v_batch.status = 'PLANNED' AND p_target_status NOT IN ('IN_PROGRESS','CANCELLED'))
     OR (v_batch.status = 'IN_PROGRESS' AND p_target_status NOT IN ('COMPLETED','CANCELLED'))
     OR v_batch.status IN ('COMPLETED','CANCELLED') THEN
    RAISE EXCEPTION 'Chuyển trạng thái batch không hợp lệ';
  END IF;
  IF p_target_status = 'COMPLETED' AND EXISTS (
    SELECT 1 FROM public.production_stage_events e
    WHERE e.tenant_id = v_tenant AND e.production_batch_id = v_batch.id AND e.status = 'SUBMITTED'
  ) THEN RAISE EXCEPTION 'Batch còn sự kiện công đoạn chờ duyệt'; END IF;
  PERFORM set_config('app.production_workflow_transition', 'on', true);
  UPDATE public.production_batches
  SET status = p_target_status,
      started_at = CASE WHEN p_target_status = 'IN_PROGRESS' THEN COALESCE(started_at, now()) ELSE started_at END,
      completed_at = CASE WHEN p_target_status = 'COMPLETED' THEN now() ELSE completed_at END
  WHERE id = v_batch.id;
  PERFORM set_config('app.production_workflow_transition', 'off', true);
  INSERT INTO public.production_batch_workflow_events (
    tenant_id, production_batch_id, status, reason, idempotency_key, actor_id
  ) VALUES (v_tenant, v_batch.id, p_target_status, v_reason, v_key, auth.uid())
  RETURNING * INTO v_event;
  RETURN jsonb_build_object('id', v_batch.id, 'workflow_event_id', v_event.id,
    'status', p_target_status, 'reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.production_stage_input_capacity(
  p_production_order_id uuid,
  p_production_batch_id uuid,
  p_stage text
)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_capacity numeric := 0;
BEGIN
  IF p_stage = 'CUTTING' THEN
    SELECT planned_quantity INTO v_capacity FROM public.production_batches
    WHERE id = p_production_batch_id AND production_order_id = p_production_order_id AND tenant_id = v_tenant;
  ELSIF p_stage = 'SEWING' THEN
    SELECT COALESCE(sum(quantity_good), 0) INTO v_capacity FROM public.production_stage_events
    WHERE tenant_id = v_tenant AND production_order_id = p_production_order_id
      AND production_batch_id = p_production_batch_id AND stage = 'CUTTING' AND status = 'APPROVED';
  ELSIF p_stage = 'QUALITY_CHECK' THEN
    SELECT COALESCE(sum(quantity_good), 0) INTO v_capacity FROM public.production_stage_events
    WHERE tenant_id = v_tenant AND production_order_id = p_production_order_id
      AND production_batch_id = p_production_batch_id AND stage = 'SEWING' AND status = 'APPROVED';
  ELSIF p_stage = 'REWORK' THEN
    SELECT COALESCE(sum(quantity_rework), 0) INTO v_capacity FROM public.production_stage_events
    WHERE tenant_id = v_tenant AND production_order_id = p_production_order_id
      AND production_batch_id = p_production_batch_id AND stage = 'QUALITY_CHECK' AND status = 'APPROVED';
  ELSIF p_stage = 'FOLDING' THEN
    SELECT COALESCE(sum(quantity_good), 0) INTO v_capacity FROM public.production_stage_events
    WHERE tenant_id = v_tenant AND production_order_id = p_production_order_id
      AND production_batch_id = p_production_batch_id AND stage IN ('QUALITY_CHECK','REWORK') AND status = 'APPROVED';
  ELSIF p_stage = 'PACKING' THEN
    SELECT COALESCE(sum(quantity_good), 0) INTO v_capacity FROM public.production_stage_events
    WHERE tenant_id = v_tenant AND production_order_id = p_production_order_id
      AND production_batch_id = p_production_batch_id AND stage = 'FOLDING' AND status = 'APPROVED';
  ELSIF p_stage = 'SHIPPING' THEN
    SELECT COALESCE(sum(quantity_good), 0) INTO v_capacity FROM public.production_stage_events
    WHERE tenant_id = v_tenant AND production_order_id = p_production_order_id
      AND production_batch_id = p_production_batch_id AND stage = 'PACKING' AND status = 'APPROVED';
  END IF;
  RETURN COALESCE(v_capacity, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_production_stage_event(
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_existing public.production_stage_events;
  v_event public.production_stage_events;
  v_batch public.production_batches;
  v_order_id uuid := NULLIF(p_payload ->> 'production_order_id', '')::uuid;
  v_batch_id uuid := NULLIF(p_payload ->> 'production_batch_id', '')::uuid;
  v_item_id uuid := NULLIF(p_payload ->> 'order_item_id', '')::uuid;
  v_worker_id uuid := NULLIF(p_payload ->> 'worker_id', '')::uuid;
  v_stage text := upper(NULLIF(btrim(p_payload ->> 'stage'), ''));
  v_received numeric := COALESCE(NULLIF(p_payload ->> 'quantity_received', '')::numeric, 0);
  v_good numeric := COALESCE(NULLIF(p_payload ->> 'quantity_good', '')::numeric, 0);
  v_rework numeric := COALESCE(NULLIF(p_payload ->> 'quantity_rework', '')::numeric, 0);
  v_remake numeric := COALESCE(NULLIF(p_payload ->> 'quantity_remake', '')::numeric, 0);
  v_defect numeric := COALESCE(NULLIF(p_payload ->> 'quantity_defect', '')::numeric, 0);
  v_minutes integer := NULLIF(p_payload ->> 'minutes_worked', '')::integer;
  v_occurred timestamptz := COALESCE(NULLIF(p_payload ->> 'occurred_at', '')::timestamptz, now());
  v_notes text := NULLIF(btrim(p_payload ->> 'notes'), '');
  v_key text := NULLIF(btrim(p_idempotency_key), '');
BEGIN
  IF NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền ghi công đoạn';
  END IF;
  IF v_key IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Payload hoặc mã yêu cầu công đoạn không hợp lệ';
  END IF;
  IF v_stage NOT IN ('CUTTING','SEWING','QUALITY_CHECK','REWORK','FOLDING','PACKING','SHIPPING') THEN
    RAISE EXCEPTION 'Công đoạn không hợp lệ';
  END IF;
  IF v_received <= 0 OR v_good < 0 OR v_rework < 0 OR v_remake < 0 OR v_defect < 0
     OR v_good + v_rework + v_remake + v_defect > v_received THEN
    RAISE EXCEPTION 'Số lượng công đoạn không hợp lệ';
  END IF;
  IF v_occurred > now() + interval '5 minutes' THEN RAISE EXCEPTION 'Thời gian công đoạn không hợp lệ'; END IF;
  IF v_worker_id IS NULL THEN RAISE EXCEPTION 'Phải chọn người thực hiện'; END IF;
  IF NOT public.factory_attendance_worker_in_scope(v_worker_id, v_occurred::date) THEN
    RAISE EXCEPTION 'Bạn không có quyền ghi công đoạn cho nhân sự này';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'production-stage-submit:' || v_tenant || ':' || v_key, 0
  ));
  SELECT * INTO v_existing FROM public.production_stage_events
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.production_order_id <> v_order_id OR v_existing.production_batch_id <> v_batch_id
       OR v_existing.order_item_id IS DISTINCT FROM v_item_id OR v_existing.stage <> v_stage
       OR v_existing.worker_id <> v_worker_id OR v_existing.quantity_received <> v_received
       OR v_existing.quantity_good <> v_good OR v_existing.quantity_rework <> v_rework
       OR v_existing.quantity_remake <> v_remake OR v_existing.quantity_defect <> v_defect
       OR v_existing.minutes_worked IS DISTINCT FROM v_minutes
       OR (p_payload ? 'occurred_at' AND v_existing.occurred_at <> v_occurred)
       OR v_existing.notes IS DISTINCT FROM v_notes THEN
      RAISE EXCEPTION 'Mã yêu cầu đã dùng cho sự kiện công đoạn khác';
    END IF;
    RETURN to_jsonb(v_existing) || jsonb_build_object('reused', true);
  END IF;
  SELECT * INTO v_batch FROM public.production_batches b
  WHERE b.id = v_batch_id AND b.production_order_id = v_order_id
    AND b.tenant_id = v_tenant AND b.status IN ('PLANNED','IN_PROGRESS')
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch không tồn tại hoặc đã khóa'; END IF;
  INSERT INTO public.production_stage_events (
    tenant_id, production_order_id, production_batch_id, order_item_id, stage,
    worker_id, quantity_received, quantity_good, quantity_rework, quantity_remake,
    quantity_defect, minutes_worked, event_type, status, occurred_at,
    created_by, notes, idempotency_key
  ) VALUES (
    v_tenant, v_order_id, v_batch_id, v_item_id, v_stage, v_worker_id,
    v_received, v_good, v_rework, v_remake, v_defect, v_minutes,
    'OUTPUT', 'SUBMITTED', v_occurred, auth.uid(), v_notes, v_key
  ) RETURNING * INTO v_event;
  INSERT INTO public.production_stage_event_workflow_events (
    tenant_id, production_stage_event_id, status, idempotency_key, actor_id
  ) VALUES (v_tenant, v_event.id, 'SUBMITTED', 'stage-submit:' || v_event.id::text, auth.uid());
  RETURN to_jsonb(v_event) || jsonb_build_object('reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_production_stage_event_status(
  p_production_stage_event_id uuid,
  p_target_status text,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_stage public.production_stage_events;
  v_existing public.production_stage_event_workflow_events;
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_reason text := NULLIF(btrim(p_reason), '');
  v_capacity numeric;
  v_used numeric;
  v_batch public.production_batches;
  v_order public.production_orders;
  v_operation_id uuid;
  v_entry_result jsonb;
  v_entry_id uuid;
BEGIN
  IF v_key IS NULL OR p_target_status NOT IN ('SUBMITTED','APPROVED','REJECTED') THEN
    RAISE EXCEPTION 'Trạng thái hoặc mã workflow công đoạn không hợp lệ';
  END IF;
  IF p_target_status = 'REJECTED' AND v_reason IS NULL THEN RAISE EXCEPTION 'Lý do từ chối là bắt buộc'; END IF;
  IF p_target_status = 'SUBMITTED' THEN
    IF NOT public.has_production_permission('production_operations')
       AND NOT public.has_production_permission('production_manage') THEN
      RAISE EXCEPTION 'Bạn không có quyền gửi lại công đoạn';
    END IF;
  ELSIF NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền duyệt công đoạn';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'production-stage-workflow:' || v_tenant || ':' || v_key, 0
  ));
  SELECT * INTO v_existing FROM public.production_stage_event_workflow_events
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.production_stage_event_id <> p_production_stage_event_id
       OR v_existing.status <> p_target_status OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'Mã yêu cầu đã dùng cho workflow công đoạn khác';
    END IF;
    SELECT * INTO v_stage FROM public.production_stage_events
    WHERE id = p_production_stage_event_id AND tenant_id = v_tenant;
    RETURN to_jsonb(v_stage) || jsonb_build_object('reused', true);
  END IF;
  SELECT * INTO v_stage FROM public.production_stage_events
  WHERE id = p_production_stage_event_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sự kiện công đoạn không tồn tại'; END IF;
  IF p_target_status = 'SUBMITTED' THEN
    IF v_stage.status <> 'REJECTED' THEN RAISE EXCEPTION 'Chỉ sự kiện bị từ chối mới được gửi lại'; END IF;
  ELSE
    IF v_stage.status <> 'SUBMITTED' THEN RAISE EXCEPTION 'Chỉ sự kiện chờ duyệt mới được xử lý'; END IF;
  END IF;
  IF p_target_status = 'APPROVED' THEN
    -- Serialize approval capacity checks with other approvals and batch closure.
    SELECT * INTO v_batch FROM public.production_batches b
    WHERE b.id = v_stage.production_batch_id
      AND b.production_order_id = v_stage.production_order_id
      AND b.tenant_id = v_tenant
    FOR UPDATE;
    IF NOT FOUND OR v_batch.status NOT IN ('PLANNED','IN_PROGRESS') THEN
      RAISE EXCEPTION 'Batch không tồn tại hoặc đã khóa';
    END IF;
    v_capacity := public.production_stage_input_capacity(
      v_stage.production_order_id, v_stage.production_batch_id, v_stage.stage
    );
    SELECT COALESCE(sum(e.quantity_received), 0) INTO v_used
    FROM public.production_stage_events e
    WHERE e.tenant_id = v_tenant AND e.production_order_id = v_stage.production_order_id
      AND e.production_batch_id = v_stage.production_batch_id AND e.stage = v_stage.stage
      AND e.status = 'APPROVED' AND e.id <> v_stage.id;
    IF v_used + v_stage.quantity_received > v_capacity THEN
      RAISE EXCEPTION 'Số lượng nhận công đoạn vượt nguồn đã duyệt (% > %)', v_used + v_stage.quantity_received, v_capacity;
    END IF;
    IF v_stage.stage = 'SEWING' THEN
      IF v_stage.worker_id IS NULL OR v_stage.quantity_good <= 0 THEN
        RAISE EXCEPTION 'Công đoạn may phải có thợ và số lượng đạt lớn hơn 0';
      END IF;
      SELECT * INTO v_order FROM public.production_orders
      WHERE id = v_stage.production_order_id AND tenant_id = v_tenant;
      SELECT op.id INTO v_operation_id FROM public.production_order_operations op
      WHERE op.tenant_id = v_tenant AND op.production_order_id = v_stage.production_order_id
        AND (upper(op.operation_code) IN ('SEWING','MAY') OR lower(op.operation_name) LIKE '%may%')
      ORDER BY op.sequence LIMIT 1;
      v_entry_result := public.record_production_entry(
        v_stage.worker_id, v_order.product_id, v_stage.occurred_at::date,
        v_stage.quantity_good, v_operation_id, 'stage-event:' || v_stage.id::text,
        concat_ws(' ', 'Sản lượng từ công đoạn may', v_stage.notes),
        v_stage.production_order_id
      );
      v_entry_id := (v_entry_result ->> 'id')::uuid;
    END IF;
  END IF;
  PERFORM set_config('app.production_workflow_transition', 'on', true);
  UPDATE public.production_stage_events
  SET status = p_target_status,
      approved_by = CASE WHEN p_target_status = 'APPROVED' THEN auth.uid() ELSE approved_by END,
      reviewed_at = CASE WHEN p_target_status IN ('APPROVED','REJECTED') THEN now() ELSE reviewed_at END,
      review_reason = CASE WHEN p_target_status IN ('APPROVED','REJECTED') THEN v_reason ELSE review_reason END,
      production_entry_id = COALESCE(production_entry_id, v_entry_id)
  WHERE id = v_stage.id;
  PERFORM set_config('app.production_workflow_transition', 'off', true);
  INSERT INTO public.production_stage_event_workflow_events (
    tenant_id, production_stage_event_id, status, reason, idempotency_key, actor_id
  ) VALUES (v_tenant, v_stage.id, p_target_status, v_reason, v_key, auth.uid());
  IF p_target_status IN ('APPROVED', 'REJECTED', 'SUBMITTED') THEN
    PERFORM public.sync_production_workflow_totals(v_stage.production_order_id, v_stage.production_batch_id);
  END IF;
  SELECT * INTO v_stage FROM public.production_stage_events WHERE id = v_stage.id;
  RETURN to_jsonb(v_stage) || jsonb_build_object('reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_production_stage_event(
  p_production_stage_event_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_stage public.production_stage_events;
  v_existing public.production_stage_event_workflow_events;
  v_status text;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_key text := NULLIF(btrim(p_idempotency_key), '');
BEGIN
  IF NOT public.has_production_permission('production_manage') THEN RAISE EXCEPTION 'Bạn không có quyền đảo công đoạn'; END IF;
  IF v_reason IS NULL OR v_key IS NULL THEN RAISE EXCEPTION 'Lý do và mã yêu cầu đảo là bắt buộc'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'production-stage-reversal:' || v_tenant || ':' || v_key, 0
  ));
  SELECT * INTO v_existing FROM public.production_stage_event_workflow_events
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.production_stage_event_id <> p_production_stage_event_id
       OR v_existing.status <> 'REVERSED' OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'Mã yêu cầu đã dùng cho thao tác khác';
    END IF;
    SELECT * INTO v_stage FROM public.production_stage_events WHERE id = p_production_stage_event_id;
    RETURN to_jsonb(v_stage) || jsonb_build_object('reused', true);
  END IF;
  SELECT * INTO v_stage FROM public.production_stage_events
  WHERE id = p_production_stage_event_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND OR v_stage.status <> 'APPROVED' THEN RAISE EXCEPTION 'Chỉ công đoạn đã duyệt mới được đảo'; END IF;
  IF v_stage.production_entry_id IS NOT NULL THEN
    v_status := public.current_production_entry_status(v_stage.production_entry_id);
    IF v_status = 'SUBMITTED' THEN
      PERFORM public.set_production_entry_status(v_stage.production_entry_id, 'REJECTED', v_reason,
        'stage-event-reject:' || v_stage.id::text);
    ELSIF v_status = 'APPROVED' THEN
      PERFORM public.reverse_production_entry(v_stage.production_entry_id, v_reason,
        'stage-event-reverse:' || v_stage.id::text);
    END IF;
  END IF;
  PERFORM set_config('app.production_workflow_transition', 'on', true);
  UPDATE public.production_stage_events
  SET status = 'REVERSED', reversed_by = auth.uid(), reversed_at = now(), reversal_reason = v_reason
  WHERE id = v_stage.id;
  PERFORM set_config('app.production_workflow_transition', 'off', true);
  INSERT INTO public.production_stage_event_workflow_events (
    tenant_id, production_stage_event_id, status, reason, idempotency_key, actor_id
  ) VALUES (v_tenant, v_stage.id, 'REVERSED', v_reason, v_key, auth.uid());
  PERFORM public.sync_production_workflow_totals(v_stage.production_order_id, v_stage.production_batch_id);
  SELECT * INTO v_stage FROM public.production_stage_events WHERE id = v_stage.id;
  RETURN to_jsonb(v_stage) || jsonb_build_object('reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_production_fabric(
  p_production_order_id uuid,
  p_production_batch_id uuid,
  p_fabric_variant_id uuid,
  p_warehouse_id uuid,
  p_quantity numeric,
  p_usage_date date,
  p_notes text,
  p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_order public.production_orders;
  v_source_order public.orders;
  v_existing public.production_fabric_allocations;
  v_allocation public.production_fabric_allocations;
  v_result jsonb;
  v_marker text;
  v_usage_id uuid;
  v_transaction_id uuid;
  v_stock numeric;
  v_has_legacy_rpc boolean := to_regprocedure('public.record_fabric_usage_batch(uuid,text,uuid,jsonb,text,text,text,text,date,text)') IS NOT NULL;
  v_has_usage_table boolean := to_regclass('public.fabric_usage') IS NOT NULL;
  v_has_transaction_table boolean := to_regclass('public.fabric_transactions') IS NOT NULL;
  v_has_usage_link boolean := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fabric_transactions' AND column_name = 'fabric_usage_id'
  );
  v_has_usage_inventory_trigger boolean := EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = to_regclass('public.fabric_usage') AND NOT tgisinternal
      AND tgname ILIKE '%inventory%'
  );
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_date date := COALESCE(p_usage_date, CURRENT_DATE);
BEGIN
  IF NOT public.has_production_permission('production_manage') THEN RAISE EXCEPTION 'Bạn không có quyền cấp vải'; END IF;
  IF v_key IS NULL OR p_quantity IS NULL OR p_quantity <= 0 OR v_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Số lượng, ngày hoặc mã yêu cầu cấp vải không hợp lệ';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'production-fabric-issue:' || v_tenant || ':' || v_key, 0
  ));
  SELECT * INTO v_existing FROM public.production_fabric_allocations
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.production_order_id <> p_production_order_id
       OR v_existing.production_batch_id IS DISTINCT FROM p_production_batch_id
       OR v_existing.fabric_variant_id <> p_fabric_variant_id
       OR v_existing.warehouse_id <> p_warehouse_id OR v_existing.issued_quantity <> p_quantity THEN
      RAISE EXCEPTION 'Mã yêu cầu đã dùng cho lần cấp vải khác';
    END IF;
    RETURN to_jsonb(v_existing) || jsonb_build_object('reused', true);
  END IF;
  SELECT * INTO v_order FROM public.production_orders
  WHERE id = p_production_order_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND OR v_order.order_id IS NULL THEN RAISE EXCEPTION 'Lệnh sản xuất phải gắn đơn hàng nguồn'; END IF;
  IF v_order.status NOT IN ('RELEASED', 'IN_PROGRESS', 'ON_HOLD') THEN
    RAISE EXCEPTION 'Chỉ lệnh đã phát hành/đang thực hiện mới được cấp vải';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.fabric_variants f
    WHERE f.id = p_fabric_variant_id AND f.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Mã vải không tồn tại hoặc không cùng phạm vi dữ liệu';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses w
    WHERE w.id = p_warehouse_id AND w.tenant_id = v_tenant AND w.is_active
      AND (
        public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant')
        OR w.manager_id IS NULL OR w.manager_id = auth.uid()::text
        OR w.manager_id IN (
          SELECT COALESCE(ur.assigned_by, ur.user_id)::text
          FROM public.user_roles ur WHERE ur.user_id = auth.uid()
        )
      )
  ) THEN
    RAISE EXCEPTION 'Kho không tồn tại, đã khóa hoặc bạn không có quyền sử dụng';
  END IF;
  SELECT * INTO v_source_order FROM public.orders WHERE id = v_order.order_id AND tenant_id = v_tenant;
  IF NOT EXISTS (
    SELECT 1 FROM public.production_batches b WHERE b.id = p_production_batch_id
      AND b.production_order_id = v_order.id AND b.tenant_id = v_tenant
  ) THEN RAISE EXCEPTION 'Batch cấp vải không thuộc lệnh sản xuất'; END IF;
  INSERT INTO public.production_fabric_allocations (
    tenant_id, production_order_id, production_batch_id, fabric_variant_id, warehouse_id,
    issued_quantity, idempotency_key, source_system, issued_at, issued_by, notes
  ) VALUES (
    v_tenant, v_order.id, p_production_batch_id, p_fabric_variant_id, p_warehouse_id,
    p_quantity, v_key, 'FABRIC_MANAGEMENT', now(), auth.uid(), NULLIF(btrim(p_notes), '')
  ) RETURNING * INTO v_allocation;
  v_marker := concat_ws(' ', NULLIF(btrim(p_notes), ''), '[production-allocation:' || v_allocation.id::text || ']');
  IF v_has_legacy_rpc THEN
    EXECUTE $sql$SELECT public.record_fabric_usage_batch(
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)$sql$
    INTO v_result
    USING v_order.order_id,
      COALESCE(NULLIF(to_jsonb(v_source_order) ->> 'display_order_number', ''),
        NULLIF(to_jsonb(v_source_order) ->> 'order_number', ''), v_order.production_order_number),
      p_warehouse_id,
      jsonb_build_array(jsonb_build_object('fabric_variant_id', p_fabric_variant_id, 'quantity_used', p_quantity)),
      NULLIF(to_jsonb(v_source_order) ->> 'customer_name', ''),
      NULLIF(to_jsonb(v_source_order) ->> 'customer_code', ''),
      NULLIF(to_jsonb(v_source_order) ->> 'order_type', ''),
      CASE WHEN lower(COALESCE(to_jsonb(v_source_order) ->> 'customer_code', '')) IN ('don_phuoc','don_hoan')
        THEN lower(to_jsonb(v_source_order) ->> 'customer_code') ELSE 'unclassified' END,
      v_date, v_marker;
  ELSIF v_has_usage_table THEN
    -- Older environments may have the Fabric tables but not the newer RPC.
    SELECT current_stock INTO v_stock
    FROM public.fabric_inventory
    WHERE tenant_id = v_tenant AND fabric_variant_id = p_fabric_variant_id
      AND warehouse_id = p_warehouse_id
    FOR UPDATE;
    IF v_stock IS NULL OR v_stock < p_quantity THEN
      RAISE EXCEPTION 'Tồn vải không đủ để cấp (còn %, cần %)', COALESCE(v_stock, 0), p_quantity;
    END IF;
    EXECUTE $sql$
      INSERT INTO public.fabric_usage (
        order_id, order_number, fabric_variant_id, warehouse_id, quantity_used,
        unit, usage_date, notes, tenant_id
      ) VALUES ($1, $2, $3, $4, $5, 'm', $6, $7, $8)
      RETURNING id$sql$
    INTO v_usage_id
    USING v_order.order_id,
      COALESCE(NULLIF(to_jsonb(v_source_order) ->> 'display_order_number', ''),
        NULLIF(to_jsonb(v_source_order) ->> 'order_number', ''), v_order.production_order_number),
      p_fabric_variant_id, p_warehouse_id, p_quantity, v_date, v_marker, v_tenant;
    IF NOT v_has_usage_inventory_trigger THEN
      UPDATE public.fabric_inventory
      SET current_stock = current_stock - p_quantity
      WHERE tenant_id = v_tenant AND fabric_variant_id = p_fabric_variant_id
        AND warehouse_id = p_warehouse_id;
    END IF;
    IF v_has_transaction_table THEN
      IF v_has_usage_link THEN
        EXECUTE $sql$
          INSERT INTO public.fabric_transactions (
            fabric_variant_id, warehouse_id, transaction_type, quantity,
            notes, transaction_date, reference_number, fabric_usage_id, tenant_id
          ) VALUES ($1, $2, 'outbound', -$3, $4, $5, $6, $7, $8)
          RETURNING id$sql$
        INTO v_transaction_id
        USING p_fabric_variant_id, p_warehouse_id, p_quantity, v_marker, v_date,
          v_order.production_order_number, v_usage_id, v_tenant;
      ELSE
        EXECUTE $sql$
          INSERT INTO public.fabric_transactions (
            fabric_variant_id, warehouse_id, transaction_type, quantity,
            notes, transaction_date, reference_number, tenant_id
          ) VALUES ($1, $2, 'outbound', -$3, $4, $5, $6, $7)
          RETURNING id$sql$
        INTO v_transaction_id
        USING p_fabric_variant_id, p_warehouse_id, p_quantity, v_marker, v_date,
          v_order.production_order_number, v_tenant;
      END IF;
    END IF;
    v_result := jsonb_build_object('success', true, 'usage_count', 1,
      'transaction_count', CASE WHEN v_transaction_id IS NULL THEN 0 ELSE 1 END, 'unit', 'm');
  ELSE
    v_result := jsonb_build_object('success', false,
      'error', 'Chưa có sổ Fabric Management để ghi cấp vải');
  END IF;
  IF NOT COALESCE((v_result ->> 'success')::boolean, false) THEN
    RAISE EXCEPTION 'Không thể ghi sổ Fabric Management: %', COALESCE(v_result ->> 'error', 'Lỗi không xác định');
  END IF;
  IF v_usage_id IS NULL AND v_has_usage_table THEN
    EXECUTE $sql$
      SELECT u.id FROM public.fabric_usage u
      WHERE u.order_id = $1 AND u.fabric_variant_id = $2
        AND u.warehouse_id = $3 AND u.quantity_used = $4
        AND u.usage_date::date = $5 AND u.notes = $6
      ORDER BY u.created_at DESC LIMIT 1$sql$
    INTO v_usage_id
    USING v_order.order_id, p_fabric_variant_id, p_warehouse_id, p_quantity, v_date, v_marker;
  END IF;
  IF v_usage_id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy chứng từ Fabric Management vừa ghi'; END IF;
  IF v_transaction_id IS NULL AND v_has_transaction_table AND v_has_usage_link THEN
    EXECUTE $sql$SELECT t.id FROM public.fabric_transactions t
      WHERE t.fabric_usage_id = $1 ORDER BY t.created_at DESC LIMIT 1$sql$
      INTO v_transaction_id USING v_usage_id;
  END IF;
  PERFORM set_config('app.production_workflow_transition', 'on', true);
  UPDATE public.production_fabric_allocations
  SET source_fabric_usage_id = v_usage_id, source_fabric_transaction_id = v_transaction_id
  WHERE id = v_allocation.id;
  PERFORM set_config('app.production_workflow_transition', 'off', true);
  INSERT INTO public.production_fabric_allocation_events (
    tenant_id, production_fabric_allocation_id, action, quantity, reason, idempotency_key, actor_id
  ) VALUES (v_tenant, v_allocation.id, 'ISSUED', p_quantity, NULLIF(btrim(p_notes), ''),
    'fabric-issue:' || v_allocation.id::text, auth.uid());
  SELECT * INTO v_allocation FROM public.production_fabric_allocations WHERE id = v_allocation.id;
  RETURN to_jsonb(v_allocation) || jsonb_build_object('reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_production_fabric_allocation(
  p_production_fabric_allocation_id uuid,
  p_action text,
  p_quantity numeric,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_allocation public.production_fabric_allocations;
  v_existing public.production_fabric_allocation_events;
  v_action text := upper(NULLIF(btrim(p_action), ''));
  v_reason text := NULLIF(btrim(p_reason), '');
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_remaining numeric;
  v_has_update_rpc boolean := to_regprocedure('public.update_fabric_usage_and_transaction(uuid,text,uuid,uuid,numeric,text,text,text,text,text,date,text)') IS NOT NULL;
  v_has_usage_table boolean := to_regclass('public.fabric_usage') IS NOT NULL;
  v_has_transaction_table boolean := to_regclass('public.fabric_transactions') IS NOT NULL;
  v_has_usage_link boolean := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fabric_transactions' AND column_name = 'fabric_usage_id'
  );
  v_has_usage_inventory_trigger boolean := EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = to_regclass('public.fabric_usage') AND NOT tgisinternal
      AND tgname ILIKE '%inventory%'
  );
BEGIN
  IF NOT public.has_production_permission('production_manage') THEN RAISE EXCEPTION 'Bạn không có quyền cập nhật vải sản xuất'; END IF;
  IF v_key IS NULL OR p_quantity IS NULL OR p_quantity <= 0 OR v_action NOT IN ('CONSUMED','RETURNED') THEN
    RAISE EXCEPTION 'Thao tác, số lượng hoặc mã yêu cầu không hợp lệ';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'production-fabric-update:' || v_tenant || ':' || v_key, 0
  ));
  SELECT * INTO v_existing FROM public.production_fabric_allocation_events
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.production_fabric_allocation_id <> p_production_fabric_allocation_id
       OR v_existing.action <> v_action OR v_existing.quantity <> p_quantity
       OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'Mã yêu cầu đã dùng cho thao tác vải khác';
    END IF;
    SELECT * INTO v_allocation FROM public.production_fabric_allocations WHERE id = p_production_fabric_allocation_id;
    RETURN to_jsonb(v_allocation) || jsonb_build_object('reused', true);
  END IF;
  SELECT * INTO v_allocation FROM public.production_fabric_allocations
  WHERE id = p_production_fabric_allocation_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lần cấp vải không tồn tại'; END IF;
  IF v_action = 'CONSUMED' THEN
    IF v_allocation.consumed_quantity + v_allocation.returned_quantity + p_quantity > v_allocation.issued_quantity THEN
      RAISE EXCEPTION 'Số lượng tiêu hao vượt số vải còn lại';
    END IF;
    PERFORM set_config('app.production_workflow_transition', 'on', true);
    UPDATE public.production_fabric_allocations
    SET consumed_quantity = consumed_quantity + p_quantity
    WHERE id = v_allocation.id;
    PERFORM set_config('app.production_workflow_transition', 'off', true);
  ELSE
    IF v_allocation.consumed_quantity + v_allocation.returned_quantity + p_quantity > v_allocation.issued_quantity THEN
      RAISE EXCEPTION 'Số lượng trả vượt số vải còn lại';
    END IF;
    -- Fabric Management tracks material removed from inventory. Consumed
    -- material remains issued, so only a return reduces the ledger quantity.
    v_remaining := v_allocation.issued_quantity - v_allocation.returned_quantity - p_quantity;
    IF v_allocation.source_fabric_usage_id IS NULL THEN RAISE EXCEPTION 'Thiếu liên kết Fabric Management'; END IF;
    IF NOT v_has_usage_table THEN
      RAISE EXCEPTION 'Chưa có sổ Fabric Management để xử lý trả vải';
    ELSIF v_remaining > 0 AND v_has_update_rpc THEN
      EXECUTE 'SELECT public.update_fabric_usage_and_transaction($1, NULL, NULL, NULL, $2, NULL, NULL, NULL, NULL, NULL, NULL, NULL)'
        USING v_allocation.source_fabric_usage_id, v_remaining;
    ELSIF v_remaining = 0 THEN
      IF v_has_transaction_table AND v_has_usage_link THEN
        EXECUTE 'DELETE FROM public.fabric_transactions WHERE fabric_usage_id = $1'
          USING v_allocation.source_fabric_usage_id;
      END IF;
      EXECUTE 'DELETE FROM public.fabric_usage WHERE id = $1'
        USING v_allocation.source_fabric_usage_id;
      IF NOT v_has_usage_inventory_trigger THEN
        UPDATE public.fabric_inventory
        SET current_stock = current_stock + v_allocation.issued_quantity - v_allocation.returned_quantity
        WHERE tenant_id = v_tenant AND fabric_variant_id = v_allocation.fabric_variant_id
          AND warehouse_id = v_allocation.warehouse_id;
      END IF;
    ELSE
      EXECUTE 'UPDATE public.fabric_usage SET quantity_used = $2 WHERE id = $1'
        USING v_allocation.source_fabric_usage_id, v_remaining;
      IF v_has_transaction_table AND v_has_usage_link THEN
        EXECUTE 'UPDATE public.fabric_transactions SET quantity = -$2 WHERE fabric_usage_id = $1'
          USING v_allocation.source_fabric_usage_id, v_remaining;
      END IF;
    END IF;
    PERFORM set_config('app.production_workflow_transition', 'on', true);
    UPDATE public.production_fabric_allocations
    SET returned_quantity = returned_quantity + p_quantity
    WHERE id = v_allocation.id;
    PERFORM set_config('app.production_workflow_transition', 'off', true);
  END IF;
  INSERT INTO public.production_fabric_allocation_events (
    tenant_id, production_fabric_allocation_id, action, quantity, reason, idempotency_key, actor_id
  ) VALUES (v_tenant, v_allocation.id, v_action, p_quantity, v_reason, v_key, auth.uid());
  SELECT * INTO v_allocation FROM public.production_fabric_allocations WHERE id = v_allocation.id;
  RETURN to_jsonb(v_allocation) || jsonb_build_object('reused', false);
END;
$$;

-- Keep the existing return shape while enriching the name from fabric_types.
CREATE OR REPLACE FUNCTION public.list_production_fabric_variants(p_search text DEFAULT NULL)
RETURNS TABLE (
  id uuid, variant_name text, color text, width_code text, weight text,
  unit text, fabric_type_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant();
BEGIN
  IF NOT public.has_production_permission('production_view')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem danh mục vải sản xuất';
  END IF;
  IF to_regclass('public.fabric_types') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'fabric_variants' AND column_name = 'fabric_type_id') THEN
    RETURN QUERY EXECUTE $sql$
      SELECT f.id, f.variant_name, to_jsonb(f) ->> 'color',
        to_jsonb(f) ->> 'width_code', to_jsonb(f) ->> 'weight', f.unit, t.name
      FROM public.fabric_variants f
      LEFT JOIN public.fabric_types t ON t.id = f.fabric_type_id
        AND COALESCE(to_jsonb(t) ->> 'tenant_id', $1) = $1
      WHERE f.tenant_id = $1
        AND ($2 IS NULL OR concat_ws(' ', f.variant_name, t.name,
          to_jsonb(f) ->> 'color', to_jsonb(f) ->> 'width_code', to_jsonb(f) ->> 'weight') ILIKE '%' || $2 || '%')
      ORDER BY t.name NULLS LAST, f.variant_name, to_jsonb(f) ->> 'color'
      LIMIT 500
    $sql$ USING v_tenant, NULLIF(btrim(p_search), '');
  ELSE
    RETURN QUERY SELECT f.id, f.variant_name, to_jsonb(f) ->> 'color',
      to_jsonb(f) ->> 'width_code', to_jsonb(f) ->> 'weight', f.unit, NULL::text
    FROM public.fabric_variants f
    WHERE f.tenant_id = v_tenant
      AND (NULLIF(btrim(p_search), '') IS NULL OR concat_ws(' ', f.variant_name,
        to_jsonb(f) ->> 'color', to_jsonb(f) ->> 'width_code', to_jsonb(f) ->> 'weight')
        ILIKE '%' || btrim(p_search) || '%')
    ORDER BY f.variant_name LIMIT 500;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_production_fabric_stock(p_fabric_variant_id uuid DEFAULT NULL)
RETURNS TABLE (
  fabric_variant_id uuid, variant_name text, fabric_type_name text, color text,
  width_code text, unit text, warehouse_id uuid, warehouse_name text,
  current_stock numeric, reserved_stock numeric, available_stock numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant();
BEGIN
  IF NOT public.has_production_permission('production_view')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem tồn vải';
  END IF;
  IF to_regclass('public.fabric_types') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'fabric_variants' AND column_name = 'fabric_type_id') THEN
    RETURN QUERY EXECUTE $sql$
      SELECT f.id, f.variant_name, t.name, to_jsonb(f) ->> 'color',
        to_jsonb(f) ->> 'width_code', to_jsonb(f) ->> 'unit',
        w.id, w.name, i.current_stock, i.reserved_stock,
        greatest(i.current_stock - i.reserved_stock, 0)
      FROM public.fabric_inventory i
      JOIN public.fabric_variants f ON f.id = i.fabric_variant_id AND f.tenant_id = $1
      LEFT JOIN public.fabric_types t ON t.id = f.fabric_type_id
        AND COALESCE(to_jsonb(t) ->> 'tenant_id', $1) = $1
      JOIN public.warehouses w ON w.id = i.warehouse_id AND w.tenant_id = $1
      WHERE i.tenant_id = $1 AND w.is_active
        AND ($2 IS NULL OR f.id = $2)
      ORDER BY f.variant_name, w.name
    $sql$ USING v_tenant, p_fabric_variant_id;
  ELSE
    RETURN QUERY
    SELECT f.id, f.variant_name, NULL::text, to_jsonb(f) ->> 'color',
      to_jsonb(f) ->> 'width_code', to_jsonb(f) ->> 'unit',
      w.id, w.name, i.current_stock, i.reserved_stock,
      greatest(i.current_stock - i.reserved_stock, 0)
    FROM public.fabric_inventory i
    JOIN public.fabric_variants f ON f.id = i.fabric_variant_id AND f.tenant_id = v_tenant
    JOIN public.warehouses w ON w.id = i.warehouse_id AND w.tenant_id = v_tenant
    WHERE i.tenant_id = v_tenant AND w.is_active
      AND (p_fabric_variant_id IS NULL OR f.id = p_fabric_variant_id)
    ORDER BY f.variant_name, w.name;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.list_production_order_items(uuid);
CREATE FUNCTION public.list_production_order_items(p_production_order_id uuid)
RETURNS TABLE (
  id uuid, production_order_id uuid, product_id uuid, product_sku text, product_name text,
  source_order_item_key text, fabric_variant_id uuid, fabric_variant_name text,
  color text, size text, dimensions text, planned_quantity numeric,
  completed_quantity numeric, notes text, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_production_permission('production_view')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem dòng lệnh sản xuất';
  END IF;
  RETURN QUERY SELECT i.id, i.production_order_id, i.product_id,
    COALESCE(i.product_sku_snapshot, p.sku), COALESCE(i.product_name_snapshot, p.name),
    i.source_order_item_key, i.fabric_variant_id, f.variant_name, i.color, i.size,
    i.dimensions, i.planned_quantity, i.completed_quantity, i.notes, i.created_at
  FROM public.production_order_items i
  JOIN public.products p ON p.id = i.product_id AND p.tenant_id = i.tenant_id
  LEFT JOIN public.fabric_variants f ON f.id = i.fabric_variant_id AND f.tenant_id = i.tenant_id
  WHERE i.tenant_id = public.require_default_tenant() AND i.production_order_id = p_production_order_id
  ORDER BY i.created_at, i.id;
END;
$$;

ALTER TABLE public.production_batch_workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_stage_event_workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_fabric_allocation_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.production_batch_workflow_events,
  public.production_stage_event_workflow_events,
  public.production_fabric_allocation_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.production_batch_workflow_events,
  public.production_stage_event_workflow_events,
  public.production_fabric_allocation_events TO authenticated;

REVOKE ALL ON FUNCTION public.guard_production_workflow_event_append_only(),
  public.production_stage_input_capacity(uuid,uuid,text),
  public.sync_production_workflow_totals(uuid,uuid)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_production_batch_status(uuid,text,text,text),
  public.record_production_entry(uuid,uuid,date,numeric,uuid,text,text),
  public.record_production_entry(uuid,uuid,date,numeric,uuid,text,text,uuid),
  public.record_production_stage_event(jsonb,text),
  public.set_production_stage_event_status(uuid,text,text,text),
  public.reverse_production_stage_event(uuid,text,text),
  public.issue_production_fabric(uuid,uuid,uuid,uuid,numeric,date,text,text),
  public.update_production_fabric_allocation(uuid,text,numeric,text,text),
  public.list_production_fabric_stock(uuid),
  public.list_production_order_items(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_production_batch_status(uuid,text,text,text),
  public.record_production_entry(uuid,uuid,date,numeric,uuid,text,text),
  public.record_production_entry(uuid,uuid,date,numeric,uuid,text,text,uuid),
  public.record_production_stage_event(jsonb,text),
  public.set_production_stage_event_status(uuid,text,text,text),
  public.reverse_production_stage_event(uuid,text,text),
  public.issue_production_fabric(uuid,uuid,uuid,uuid,numeric,date,text,text),
  public.update_production_fabric_allocation(uuid,text,numeric,text,text),
  public.list_production_fabric_stock(uuid),
  public.list_production_order_items(uuid)
TO authenticated;

COMMIT;
