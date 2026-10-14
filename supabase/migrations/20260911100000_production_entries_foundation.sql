-- Product-linked daily production entries for factory payroll.
-- This is deliberately separate from legacy OUTPUT attendance: the product,
-- approved product-rate version and money snapshots are stable payroll facts.

BEGIN;

CREATE TABLE public.production_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  worker_id uuid NOT NULL REFERENCES public.production_workers(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  production_order_operation_id uuid REFERENCES public.production_order_operations(id) ON DELETE RESTRICT,
  work_date date NOT NULL,
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  product_sku_snapshot text NOT NULL CHECK (NULLIF(btrim(product_sku_snapshot), '') IS NOT NULL),
  product_name_snapshot text NOT NULL CHECK (NULLIF(btrim(product_name_snapshot), '') IS NOT NULL),
  product_rate_version_id uuid NOT NULL REFERENCES public.product_piece_rate_versions(id) ON DELETE RESTRICT,
  rate_unit_snapshot text NOT NULL CHECK (rate_unit_snapshot IN ('PIECE','SET')),
  rate_amount_snapshot numeric(18,6) NOT NULL CHECK (rate_amount_snapshot >= 0),
  currency_code_snapshot text NOT NULL DEFAULT 'VND' CHECK (currency_code_snapshot ~ '^[A-Z]{3}$'),
  calculated_amount_snapshot numeric(18,2) NOT NULL CHECK (calculated_amount_snapshot >= 0),
  formula_basis text NOT NULL DEFAULT 'PRODUCT_PIECE_RATE * QUANTITY',
  status text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','APPROVED','REJECTED','REVERSED')),
  workflow_reason text,
  workflow_actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  workflow_at timestamptz NOT NULL DEFAULT now(),
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  reversed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reversed_at timestamptz,
  reversal_reason text,
  idempotency_key text NOT NULL CHECK (NULLIF(btrim(idempotency_key), '') IS NOT NULL),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX production_entries_month_idx
  ON public.production_entries (tenant_id, work_date, worker_id);
CREATE INDEX production_entries_product_idx
  ON public.production_entries (tenant_id, product_id, work_date DESC);

CREATE TABLE public.production_entry_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tenant_id text NOT NULL DEFAULT 'default',
  production_entry_id uuid NOT NULL REFERENCES public.production_entries(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('SUBMITTED','APPROVED','REJECTED','REVERSED')),
  reason text,
  idempotency_key text NOT NULL CHECK (NULLIF(btrim(idempotency_key), '') IS NOT NULL),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX production_entry_workflow_lookup_idx
  ON public.production_entry_workflow_events (tenant_id, production_entry_id, event_sequence DESC);

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

CREATE TRIGGER production_entries_immutable
BEFORE UPDATE OR DELETE ON public.production_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_production_entry_immutable();

CREATE TRIGGER production_entry_workflow_immutable
BEFORE UPDATE OR DELETE ON public.production_entry_workflow_events
FOR EACH ROW EXECUTE FUNCTION public.guard_production_entry_immutable();

CREATE OR REPLACE FUNCTION public.current_production_entry_status(p_entry_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT e.status
    FROM public.production_entry_workflow_events e
    WHERE e.production_entry_id = p_entry_id
      AND e.tenant_id = COALESCE(
        (SELECT x.tenant_id FROM public.production_entries x WHERE x.id = p_entry_id),
        'default'
      )
    ORDER BY e.event_sequence DESC
    LIMIT 1
  ), 'SUBMITTED')
$$;

CREATE OR REPLACE FUNCTION public.validate_production_entry_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation_product_id uuid;
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
    SELECT po.product_id
    INTO v_operation_product_id
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
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER production_entries_scope
BEFORE INSERT ON public.production_entries
FOR EACH ROW EXECUTE FUNCTION public.validate_production_entry_scope();

-- Product output follows the same daily closure contract as factory attendance.
-- A manager must not lock a day while a product entry is still awaiting review.
CREATE OR REPLACE FUNCTION public.guard_factory_attendance_closure_pending_production()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'LEADER_CONFIRMED'
     AND EXISTS (
       SELECT 1
       FROM public.production_entries p
       WHERE p.tenant_id = NEW.tenant_id
         AND p.worker_id = NEW.worker_id
         AND p.work_date = NEW.work_date
         AND p.status = 'SUBMITTED'
     )
  THEN
    RAISE EXCEPTION 'Còn sản lượng sản phẩm chưa được duyệt cho ngày này';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS factory_attendance_closure_pending_production
  ON public.factory_attendance_daily_closure_events;
CREATE TRIGGER factory_attendance_closure_pending_production
BEFORE INSERT ON public.factory_attendance_daily_closure_events
FOR EACH ROW EXECUTE FUNCTION public.guard_factory_attendance_closure_pending_production();

CREATE OR REPLACE FUNCTION public.production_entry_day_is_open(
  p_worker_id uuid,
  p_work_date date
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_status text;
BEGIN
  IF public.current_factory_attendance_closure(p_worker_id, p_work_date) = 'LEADER_CONFIRMED' THEN
    RETURN false;
  END IF;
  SELECT e.status
  INTO v_day_status
  FROM public.factory_attendance_day_status_events e
  WHERE e.tenant_id = public.require_default_tenant()
    AND e.worker_id = p_worker_id
    AND e.work_date = p_work_date
  ORDER BY e.event_sequence DESC
  LIMIT 1;
  RETURN v_day_status IS NULL OR v_day_status IN ('PRESENT','HOLIDAY');
END;
$$;

CREATE OR REPLACE FUNCTION public.list_production_entry_products(
  p_work_date date DEFAULT CURRENT_DATE,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  sku text,
  name text,
  category text,
  price_list_name text,
  mapping_status text,
  rate_available boolean,
  rate_visible boolean,
  rate numeric,
  rate_unit text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_search text := NULLIF(btrim(p_search), '');
  v_rate_visible boolean := public.has_payroll_permission('payroll_rate_view')
    OR public.has_payroll_permission('payroll_rate_manage')
    OR public.has_cost_permission('inventory_cost_view');
BEGIN
  IF NOT public.has_production_permission('production_view')
     AND NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem sản phẩm sản xuất';
  END IF;
  IF p_work_date IS NULL OR p_work_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Ngày sản lượng không hợp lệ';
  END IF;

  RETURN QUERY
  WITH catalog_all AS (
    SELECT p.id, p.sku, p.name, p.category, p.in_stock, pl.name AS price_list_name,
      CASE WHEN NULLIF(btrim(p.sku), '') IS NULL THEN 0::bigint
        ELSE count(*) OVER (PARTITION BY lower(btrim(p.sku))) END AS sku_count
    FROM public.products p
    LEFT JOIN public.price_lists pl
      ON pl.id = p.price_list_id AND pl.tenant_id = p.tenant_id
    WHERE p.tenant_id = v_tenant
  ), catalog AS (
    SELECT *
    FROM catalog_all c
    WHERE COALESCE(c.in_stock, true)
      AND (v_search IS NULL OR c.name ILIKE '%' || v_search || '%'
        OR c.sku ILIKE '%' || v_search || '%')
  )
  SELECT c.id, c.sku, c.name, c.category, c.price_list_name,
    CASE WHEN NULLIF(btrim(c.sku), '') IS NULL THEN 'MISSING_SKU'
      WHEN c.sku_count > 1 THEN 'AMBIGUOUS_SKU' ELSE 'UNIQUE_SKU' END,
    (r.rate_count = 1), v_rate_visible,
    CASE WHEN v_rate_visible THEN r.rate ELSE NULL END,
    CASE WHEN v_rate_visible THEN r.unit ELSE NULL END
  FROM catalog c
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS rate_count,
      max(x.rate) AS rate, max(x.unit) AS unit
    FROM public.product_piece_rate_versions x
    WHERE x.tenant_id = v_tenant
      AND x.product_id = c.id
      AND x.status IN ('APPROVED','RETIRED')
      AND x.effective_from <= p_work_date
      AND (x.effective_to IS NULL OR x.effective_to >= p_work_date)
  ) r ON true
  ORDER BY c.sku NULLS LAST, c.name, c.price_list_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_production_entry(
  p_worker_id uuid,
  p_product_id uuid,
  p_work_date date,
  p_quantity numeric,
  p_production_order_operation_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_notes text DEFAULT NULL
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
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_notes text := NULLIF(btrim(p_notes), '');
  v_rate_count integer;
  v_sku_count integer;
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
       OR v_existing.notes IS DISTINCT FROM v_notes THEN
      RAISE EXCEPTION 'Mã yêu cầu đã được dùng cho dữ liệu sản lượng khác';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id, 'reused', true,
      'status', public.current_production_entry_status(v_existing.id),
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
  SELECT count(*) INTO v_sku_count
  FROM public.products p
  WHERE p.tenant_id = v_tenant AND lower(btrim(p.sku)) = lower(btrim(v_product.sku));
  IF v_sku_count <> 1 THEN
    RAISE EXCEPTION 'SKU sản phẩm đang bị trùng; chưa thể ghi sản lượng';
  END IF;

  SELECT count(*) INTO v_rate_count
  FROM public.product_piece_rate_versions x
  WHERE x.tenant_id = v_tenant AND x.product_id = p_product_id
    AND x.status IN ('APPROVED','RETIRED')
    AND x.effective_from <= p_work_date
    AND (x.effective_to IS NULL OR x.effective_to >= p_work_date);
  IF v_rate_count = 0 THEN RAISE EXCEPTION 'Sản phẩm chưa có đơn giá đã duyệt hiệu lực trong ngày sản xuất'; END IF;
  IF v_rate_count > 1 THEN RAISE EXCEPTION 'Sản phẩm có nhiều đơn giá cùng hiệu lực; cần xử lý dữ liệu đơn giá trước'; END IF;
  SELECT * INTO v_rate
  FROM public.product_piece_rate_versions x
  WHERE x.tenant_id = v_tenant AND x.product_id = p_product_id
    AND x.status IN ('APPROVED','RETIRED')
    AND x.effective_from <= p_work_date
    AND (x.effective_to IS NULL OR x.effective_to >= p_work_date)
  ORDER BY x.effective_from DESC, x.created_at DESC LIMIT 1;
  IF v_rate.rate <= 0 THEN RAISE EXCEPTION 'Đơn giá sản phẩm hiệu lực phải lớn hơn 0'; END IF;

  INSERT INTO public.production_entries (
    tenant_id, worker_id, product_id, production_order_operation_id, work_date, quantity,
    product_sku_snapshot, product_name_snapshot, product_rate_version_id, rate_unit_snapshot,
    rate_amount_snapshot, currency_code_snapshot, calculated_amount_snapshot,
    idempotency_key, notes, created_by, submitted_by, submitted_at, workflow_actor_id, workflow_at
  ) VALUES (
    v_tenant, p_worker_id, p_product_id, p_production_order_operation_id, p_work_date, p_quantity,
    btrim(v_product.sku), btrim(v_product.name), v_rate.id, v_rate.unit,
    v_rate.rate, v_rate.currency_code, round(v_rate.rate * p_quantity, 2),
    v_key, v_notes, auth.uid(), auth.uid(), now(), auth.uid(), now()
  ) RETURNING * INTO v_entry;

  INSERT INTO public.production_entry_workflow_events (
    tenant_id, production_entry_id, status, idempotency_key, actor_id
  ) VALUES (v_tenant, v_entry.id, 'SUBMITTED', 'submit:' || v_entry.id::text, auth.uid());

  PERFORM public.write_cost_audit(
    'production_entries', v_entry.id, 'SUBMIT', NULL,
    jsonb_build_object('worker_id', v_entry.worker_id, 'product_id', v_entry.product_id,
      'work_date', v_entry.work_date, 'quantity', v_entry.quantity), v_notes
  );
  RETURN jsonb_build_object(
    'id', v_entry.id, 'reused', false, 'status', 'SUBMITTED',
    'cost_visible', v_cost_visible,
    'calculated_amount', CASE WHEN v_cost_visible THEN v_entry.calculated_amount_snapshot ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_production_entry_status(
  p_production_entry_id uuid,
  p_target_status text,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_entry public.production_entries;
  v_existing public.production_entry_workflow_events;
  v_event public.production_entry_workflow_events;
  v_current text;
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF p_target_status NOT IN ('SUBMITTED','APPROVED','REJECTED') THEN
    RAISE EXCEPTION 'Trạng thái sản lượng không hợp lệ';
  END IF;
  IF v_key IS NULL THEN RAISE EXCEPTION 'Mã yêu cầu workflow sản lượng là bắt buộc'; END IF;
  IF p_target_status = 'REJECTED' AND v_reason IS NULL THEN RAISE EXCEPTION 'Lý do từ chối sản lượng là bắt buộc'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('production-entry-workflow:' || v_tenant || ':' || p_production_entry_id::text, 0));
  SELECT * INTO v_entry FROM public.production_entries
  WHERE id = p_production_entry_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bản ghi sản lượng không tồn tại'; END IF;

  v_current := public.current_production_entry_status(v_entry.id);
  IF p_target_status = 'SUBMITTED' THEN
    IF NOT public.has_production_permission('production_operations')
       AND NOT public.has_production_permission('production_manage') THEN
      RAISE EXCEPTION 'Bạn không có quyền gửi lại sản lượng';
    END IF;
    IF NOT public.factory_attendance_worker_in_scope(v_entry.worker_id, v_entry.work_date) THEN
      RAISE EXCEPTION 'Bạn không có quyền gửi lại sản lượng cho nhân sự này';
    END IF;
  ELSE
    IF NOT public.factory_attendance_can_review_worker(v_entry.worker_id, v_entry.work_date) THEN
      RAISE EXCEPTION 'Bạn không có quyền duyệt sản lượng cho nhân sự này';
    END IF;
  END IF;

  SELECT * INTO v_existing FROM public.production_entry_workflow_events
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.production_entry_id <> p_production_entry_id
       OR v_existing.status <> p_target_status
       OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'Mã yêu cầu đã được dùng cho workflow sản lượng khác';
    END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'production_entry_id', p_production_entry_id,
      'status', v_existing.status, 'reused', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'factory-attendance-closure:' || v_tenant || ':' || v_entry.worker_id::text || ':' || v_entry.work_date::text, 0
  ));
  IF NOT public.production_entry_day_is_open(v_entry.worker_id, v_entry.work_date) THEN
    RAISE EXCEPTION 'Ngày công đã bị chặn hoặc đã được quản lý chốt; hãy mở lại/cập nhật trạng thái ngày trước';
  END IF;
  IF p_target_status = 'SUBMITTED' AND v_current <> 'REJECTED' THEN
    RAISE EXCEPTION 'Chỉ sản lượng bị từ chối mới được gửi lại';
  ELSIF p_target_status IN ('APPROVED','REJECTED') AND v_current <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'Chỉ sản lượng đang chờ duyệt mới được xử lý';
  END IF;

  PERFORM set_config('app.production_entry_workflow_transition', 'on', true);
  UPDATE public.production_entries
  SET status = p_target_status,
      workflow_reason = v_reason,
      workflow_actor_id = auth.uid(),
      workflow_at = now(),
      approved_by = CASE WHEN p_target_status = 'APPROVED' THEN auth.uid() ELSE approved_by END,
      approved_at = CASE WHEN p_target_status = 'APPROVED' THEN now() ELSE approved_at END,
      rejected_by = CASE WHEN p_target_status = 'REJECTED' THEN auth.uid() ELSE NULL END,
      rejected_at = CASE WHEN p_target_status = 'REJECTED' THEN now() ELSE NULL END,
      submitted_by = CASE WHEN p_target_status = 'SUBMITTED' THEN auth.uid() ELSE submitted_by END,
      submitted_at = CASE WHEN p_target_status = 'SUBMITTED' THEN now() ELSE submitted_at END
  WHERE id = v_entry.id AND tenant_id = v_tenant;
  PERFORM set_config('app.production_entry_workflow_transition', 'off', true);

  INSERT INTO public.production_entry_workflow_events (
    tenant_id, production_entry_id, status, reason, idempotency_key, actor_id
  ) VALUES (v_tenant, v_entry.id, p_target_status, v_reason, v_key, auth.uid())
  RETURNING * INTO v_event;

  PERFORM public.write_cost_audit(
    'production_entries', v_entry.id,
    CASE p_target_status WHEN 'SUBMITTED' THEN 'SUBMIT' WHEN 'APPROVED' THEN 'APPROVE' ELSE 'REJECT' END,
    jsonb_build_object('status', v_current), jsonb_build_object('status', p_target_status), v_reason
  );
  RETURN jsonb_build_object('id', v_event.id, 'production_entry_id', v_entry.id,
    'status', v_event.status, 'reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_production_entry(
  p_production_entry_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_entry public.production_entries;
  v_existing public.production_entry_workflow_events;
  v_event public.production_entry_workflow_events;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_current text;
BEGIN
  IF NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền đảo bản ghi sản lượng';
  END IF;
  IF v_reason IS NULL OR v_key IS NULL THEN RAISE EXCEPTION 'Lý do và mã yêu cầu đảo sản lượng là bắt buộc'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('production-entry-workflow:' || v_tenant || ':' || p_production_entry_id::text, 0));
  SELECT * INTO v_entry FROM public.production_entries
  WHERE id = p_production_entry_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bản ghi sản lượng không tồn tại'; END IF;
  SELECT * INTO v_existing FROM public.production_entry_workflow_events
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.production_entry_id <> p_production_entry_id OR v_existing.status <> 'REVERSED'
       OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'Mã yêu cầu đã được dùng cho thao tác khác';
    END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'production_entry_id', p_production_entry_id,
      'status', 'REVERSED', 'reused', true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'factory-attendance-closure:' || v_tenant || ':' || v_entry.worker_id::text || ':' || v_entry.work_date::text, 0
  ));
  IF NOT public.production_entry_day_is_open(v_entry.worker_id, v_entry.work_date) THEN
    RAISE EXCEPTION 'Ngày công đã bị chặn hoặc đã được quản lý chốt; hãy mở lại/cập nhật trạng thái ngày trước';
  END IF;
  v_current := public.current_production_entry_status(v_entry.id);
  IF v_current = 'REVERSED' THEN RAISE EXCEPTION 'Bản ghi sản lượng đã được đảo'; END IF;
  IF v_current <> 'APPROVED' THEN RAISE EXCEPTION 'Chỉ sản lượng đã duyệt mới được đảo'; END IF;
  PERFORM set_config('app.production_entry_workflow_transition', 'on', true);
  UPDATE public.production_entries
  SET status = 'REVERSED', workflow_reason = v_reason, workflow_actor_id = auth.uid(), workflow_at = now(),
      reversed_by = auth.uid(), reversed_at = now(), reversal_reason = v_reason
  WHERE id = v_entry.id AND tenant_id = v_tenant;
  PERFORM set_config('app.production_entry_workflow_transition', 'off', true);
  INSERT INTO public.production_entry_workflow_events (
    tenant_id, production_entry_id, status, reason, idempotency_key, actor_id
  ) VALUES (v_tenant, v_entry.id, 'REVERSED', v_reason, v_key, auth.uid())
  RETURNING * INTO v_event;
  PERFORM public.write_cost_audit('production_entries', v_entry.id, 'REVERSE',
    jsonb_build_object('status', v_current), jsonb_build_object('status', 'REVERSED'), v_reason);
  RETURN jsonb_build_object('id', v_event.id, 'production_entry_id', v_entry.id,
    'status', 'REVERSED', 'reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_production_entries_month(
  p_month_start date,
  p_include_reversed boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  worker_id uuid,
  employee_code text,
  worker_name text,
  worker_type text,
  product_id uuid,
  product_sku text,
  product_name text,
  work_date date,
  quantity numeric,
  production_order_operation_id uuid,
  production_order_number text,
  rate_unit text,
  rate_amount numeric,
  calculated_amount numeric,
  currency_code text,
  workflow_status text,
  workflow_reason text,
  workflow_at timestamptz,
  workflow_actor_id uuid,
  notes text,
  created_at timestamptz,
  cost_visible boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    x.production_order_operation_id, po.production_order_number, x.rate_unit_snapshot,
    CASE WHEN v_cost_visible THEN x.rate_amount_snapshot ELSE NULL END,
    CASE WHEN v_cost_visible THEN x.calculated_amount_snapshot ELSE NULL END,
    x.currency_code_snapshot, wf.status, wf.reason, wf.created_at, wf.actor_id,
    x.notes, x.created_at, v_cost_visible
  FROM public.production_entries x
  JOIN public.production_workers w ON w.id = x.worker_id AND w.tenant_id = x.tenant_id
  LEFT JOIN public.production_order_operations op
    ON op.id = x.production_order_operation_id AND op.tenant_id = x.tenant_id
  LEFT JOIN public.production_orders po ON po.id = op.production_order_id AND po.tenant_id = op.tenant_id
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

ALTER TABLE public.production_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_entry_workflow_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.production_entries, public.production_entry_workflow_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_production_entry_immutable(),
  public.current_production_entry_status(uuid), public.validate_production_entry_scope(),
  public.production_entry_day_is_open(uuid,date),
  public.guard_factory_attendance_closure_pending_production()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_production_entry_products(date,text),
  public.record_production_entry(uuid,uuid,date,numeric,uuid,text,text),
  public.set_production_entry_status(uuid,text,text,text),
  public.reverse_production_entry(uuid,text,text),
  public.list_production_entries_month(date,boolean)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_production_entry_products(date,text),
  public.record_production_entry(uuid,uuid,date,numeric,uuid,text,text),
  public.set_production_entry_status(uuid,text,text,text),
  public.reverse_production_entry(uuid,text,text),
  public.list_production_entries_month(date,boolean)
TO authenticated;

COMMENT ON TABLE public.production_entries IS
  'Immutable daily worker output linked to a canonical CRM product and approved product rate snapshot.';
COMMENT ON FUNCTION public.record_production_entry(uuid,uuid,date,numeric,uuid,text,text) IS
  'Records product-linked output separately from legacy free-text OUTPUT attendance.';

COMMIT;
