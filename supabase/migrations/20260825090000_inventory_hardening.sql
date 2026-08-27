-- Sprint 2 hardening: development/staging only.
-- No legacy fabric table is changed and no production migration is executed.

CREATE OR REPLACE FUNCTION public.guard_inventory_item_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.manager_id IS DISTINCT FROM OLD.manager_id
     OR NEW.code IS DISTINCT FROM OLD.code
     OR NEW.legacy_source_type IS DISTINCT FROM OLD.legacy_source_type
     OR NEW.legacy_source_id IS DISTINCT FROM OLD.legacy_source_id THEN
    RAISE EXCEPTION 'Không thể thay đổi định danh hoặc phạm vi của vật tư';
  END IF;
  IF NEW.item_type IS DISTINCT FROM OLD.item_type
     AND EXISTS (
       SELECT 1 FROM public.inventory_movements m
       WHERE m.tenant_id = OLD.tenant_id AND m.inventory_item_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'Không thể đổi loại vật tư đã có movement kho';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_items_update_guard ON public.inventory_items;
CREATE TRIGGER inventory_items_update_guard
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_item_update();

REVOKE ALL ON FUNCTION public.guard_inventory_item_update() FROM PUBLIC, anon, authenticated;

-- Keep the Business Transaction semantic mapping in one server-side boundary.
-- Document types without a matching Sprint 2 Transaction Type cannot be linked.
CREATE OR REPLACE FUNCTION public.validate_inventory_business_transaction(
  p_document_type text,
  p_business_transaction_id uuid,
  p_tenant_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected_type text;
  v_actual_type text;
BEGIN
  IF p_business_transaction_id IS NULL THEN
    RETURN;
  END IF;

  v_expected_type := CASE p_document_type
    WHEN 'RECEIPT' THEN 'PURCHASE_MATERIAL'
    WHEN 'ISSUE' THEN 'MATERIAL_ISSUE'
    WHEN 'RETURN_IN' THEN 'MATERIAL_RETURN'
    WHEN 'ADJUSTMENT' THEN 'INVENTORY_ADJUSTMENT'
    ELSE NULL
  END;

  IF v_expected_type IS NULL THEN
    RAISE EXCEPTION 'Loại phiếu % chưa hỗ trợ liên kết giao dịch nghiệp vụ', p_document_type;
  END IF;

  SELECT tt.code INTO v_actual_type
  FROM public.business_transactions bt
  JOIN public.transaction_types tt
    ON tt.id = bt.transaction_type_id
   AND tt.tenant_id = bt.tenant_id
  WHERE bt.id = p_business_transaction_id
    AND bt.tenant_id = p_tenant_id
    AND bt.status = 'CONFIRMED'
    AND tt.is_active
    AND tt.has_inventory_impact;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Giao dịch nghiệp vụ phải đã xác nhận, đang hoạt động, có tác động kho và cùng phạm vi dữ liệu';
  END IF;
  IF v_actual_type <> v_expected_type THEN
    RAISE EXCEPTION 'Phiếu % chỉ được liên kết giao dịch %, không phải %', p_document_type, v_expected_type, v_actual_type;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_inventory_business_transaction(text, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_inventory_document_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.warehouse_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.warehouses w
    WHERE w.id = NEW.warehouse_id AND w.tenant_id = NEW.tenant_id AND w.is_active
  ) THEN
    RAISE EXCEPTION 'Kho không hoạt động hoặc không cùng phạm vi dữ liệu';
  END IF;
  IF NEW.to_warehouse_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.warehouses w
    WHERE w.id = NEW.to_warehouse_id AND w.tenant_id = NEW.tenant_id AND w.is_active
  ) THEN
    RAISE EXCEPTION 'Kho nhận không hoạt động hoặc không cùng phạm vi dữ liệu';
  END IF;
  IF NEW.document_type = 'TRANSFER' THEN
    IF NEW.warehouse_id IS NULL OR NEW.to_warehouse_id IS NULL OR NEW.warehouse_id = NEW.to_warehouse_id THEN
      RAISE EXCEPTION 'Chuyển kho yêu cầu hai kho khác nhau';
    END IF;
  ELSIF NEW.warehouse_id IS NULL OR NEW.to_warehouse_id IS NOT NULL THEN
    RAISE EXCEPTION 'Loại phiếu này yêu cầu một kho và không có kho nhận';
  END IF;

  PERFORM public.validate_inventory_business_transaction(
    NEW.document_type,
    NEW.business_transaction_id,
    NEW.tenant_id
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_inventory_document_scope() FROM PUBLIC, anon, authenticated;

-- Re-check mutable references when a draft is posted. A draft may outlive a
-- master-data deactivation or a linked transaction state change.
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
    SELECT * INTO v_item FROM public.inventory_items
    WHERE id = v_line.inventory_item_id
      AND tenant_id = v_doc.tenant_id
      AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Vật tư trong phiếu không còn hoạt động'; END IF;
    IF v_line.unit <> v_item.base_unit THEN
      RAISE EXCEPTION 'Đơn vị dòng không còn khớp đơn vị gốc của vật tư';
    END IF;

    IF v_line.location_id IS NOT NULL THEN
      SELECT * INTO v_location FROM public.warehouse_locations
      WHERE id = v_line.location_id
        AND tenant_id = v_doc.tenant_id
        AND warehouse_id = v_doc.warehouse_id
        AND is_active;
      IF NOT FOUND THEN RAISE EXCEPTION 'Vị trí nguồn không còn hoạt động'; END IF;
    END IF;
    IF v_doc.document_type = 'TRANSFER' AND v_line.to_location_id IS NOT NULL THEN
      SELECT * INTO v_to_location FROM public.warehouse_locations
      WHERE id = v_line.to_location_id
        AND tenant_id = v_doc.tenant_id
        AND warehouse_id = v_doc.to_warehouse_id
        AND is_active;
      IF NOT FOUND THEN RAISE EXCEPTION 'Vị trí nhận không còn hoạt động'; END IF;
    END IF;

    IF v_line.cost_center_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.cost_centers c
      WHERE c.id = v_line.cost_center_id AND c.tenant_id = v_doc.tenant_id AND c.is_active
    ) THEN RAISE EXCEPTION 'Trung tâm chi phí trong phiếu không còn hoạt động'; END IF;
    IF v_line.cost_object_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.cost_objects c
      WHERE c.id = v_line.cost_object_id AND c.tenant_id = v_doc.tenant_id AND c.is_active
    ) THEN RAISE EXCEPTION 'Đối tượng chi phí trong phiếu không còn hoạt động'; END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_inventory_document_for_confirm(uuid) FROM PUBLIC, anon, authenticated;

-- Filter eligible Business Transactions by document semantics at the server so
-- the create dialog does not fetch or offer unrelated inventory transactions.
DROP FUNCTION IF EXISTS public.list_inventory_business_transactions();
CREATE OR REPLACE FUNCTION public.list_inventory_business_transactions(p_document_type text)
RETURNS TABLE(
  id uuid, transaction_number text, transaction_date date, description text,
  counterparty_name text, total_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can_cost boolean;
  v_expected_type text;
BEGIN
  IF NOT public.has_cost_permission('inventory_documents') THEN RAISE EXCEPTION 'Bạn không có quyền tạo phiếu kho'; END IF;
  v_expected_type := CASE p_document_type
    WHEN 'RECEIPT' THEN 'PURCHASE_MATERIAL'
    WHEN 'ISSUE' THEN 'MATERIAL_ISSUE'
    WHEN 'RETURN_IN' THEN 'MATERIAL_RETURN'
    WHEN 'ADJUSTMENT' THEN 'INVENTORY_ADJUSTMENT'
    ELSE NULL
  END;
  IF v_expected_type IS NULL THEN RETURN; END IF;

  v_can_cost := public.has_cost_permission('inventory_cost_view');
  RETURN QUERY
  SELECT bt.id, bt.transaction_number, bt.transaction_date, bt.description,
         bt.counterparty_name_snapshot,
         CASE WHEN v_can_cost THEN bt.total_amount ELSE NULL END
  FROM public.business_transactions bt
  JOIN public.transaction_types tt
    ON tt.id = bt.transaction_type_id
   AND tt.tenant_id = bt.tenant_id
  LEFT JOIN public.inventory_documents d ON d.business_transaction_id = bt.id
  WHERE bt.tenant_id = 'default'
    AND bt.status = 'CONFIRMED'
    AND tt.is_active
    AND tt.has_inventory_impact
    AND tt.code = v_expected_type
    AND d.id IS NULL
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'accountant'::public.app_role)
      OR bt.manager_id = public.current_cost_manager_id()
      OR bt.manager_id IS NULL)
  ORDER BY bt.transaction_date DESC, bt.created_at DESC
  LIMIT 500;
END;
$$;

REVOKE ALL ON FUNCTION public.list_inventory_business_transactions(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_inventory_business_transactions(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_inventory_return_sources()
RETURNS TABLE(
  id uuid,
  document_number text,
  inventory_item_id uuid,
  warehouse_id uuid,
  location_id uuid,
  movement_kind text,
  original_quantity numeric,
  returned_quantity numeric,
  remaining_quantity numeric,
  unit text,
  transaction_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_cost_permission('inventory_documents') THEN RAISE EXCEPTION 'Bạn không có quyền tạo phiếu kho'; END IF;
  RETURN QUERY
  WITH returned AS (
    SELECT m.source_movement_id, sum(m.quantity_delta)::numeric(18,4) AS quantity
    FROM public.inventory_movements m
    WHERE m.tenant_id = 'default'
      AND m.source_movement_id IS NOT NULL
      AND m.quantity_delta > 0
    GROUP BY m.source_movement_id
  )
  SELECT m.id, d.document_number, m.inventory_item_id, m.warehouse_id, m.location_id,
         m.movement_kind, abs(m.quantity_delta), COALESCE(r.quantity, 0),
         abs(m.quantity_delta) - COALESCE(r.quantity, 0), m.unit, m.transaction_at
  FROM public.inventory_movements m
  JOIN public.inventory_documents d ON d.id = m.document_id AND d.tenant_id = m.tenant_id
  JOIN public.warehouses w ON w.id = m.warehouse_id AND w.tenant_id = m.tenant_id
  LEFT JOIN returned r ON r.source_movement_id = m.id
  WHERE m.tenant_id = 'default'
    AND m.movement_kind IN ('ISSUE', 'RETURN_OUT', 'ADJUSTMENT_OUT')
    AND m.quantity_delta < 0
    AND abs(m.quantity_delta) > COALESCE(r.quantity, 0)
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'accountant'::public.app_role)
      OR d.manager_id = public.current_cost_manager_id()
      OR d.manager_id IS NULL)
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'accountant'::public.app_role)
      OR w.manager_id = public.current_cost_manager_id()
      OR w.manager_id IS NULL)
  ORDER BY m.transaction_at DESC, m.movement_sequence DESC
  LIMIT 2000;
END;
$$;

REVOKE ALL ON FUNCTION public.list_inventory_return_sources() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_inventory_return_sources() TO authenticated;

-- Replace the confirm function only to call the revalidation boundary before
-- creating balances/movements. The original posting algorithm remains intact.
CREATE OR REPLACE FUNCTION public.confirm_inventory_document(p_document_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.inventory_documents;
  v_line public.inventory_document_lines;
  v_source public.inventory_movements;
  v_out public.inventory_movements;
  v_in public.inventory_movements;
  v_cost numeric(18,6);
  v_line_cost numeric(18,2);
  v_doc_subtotal numeric(18,2) := 0;
  v_doc_vat numeric(18,2) := 0;
  v_returned numeric(18,4);
BEGIN
  IF NOT public.has_cost_permission('inventory_confirm') THEN RAISE EXCEPTION 'Bạn không có quyền xác nhận phiếu kho'; END IF;
  SELECT * INTO v_doc FROM public.inventory_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiếu kho'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR v_doc.manager_id = public.current_cost_manager_id() OR v_doc.manager_id IS NULL) THEN
    RAISE EXCEPTION 'Bạn không có quyền xác nhận phiếu kho này';
  END IF;
  IF v_doc.status = 'CONFIRMED' THEN
    RETURN jsonb_build_object('id', v_doc.id, 'document_number', v_doc.document_number, 'status', v_doc.status, 'reused', true);
  END IF;
  IF v_doc.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ phiếu nháp mới được xác nhận'; END IF;
  IF v_doc.document_type = 'ADJUSTMENT' AND NOT public.has_cost_permission('inventory_adjustment') THEN RAISE EXCEPTION 'Bạn không có quyền điều chỉnh tồn kho'; END IF;
  IF v_doc.document_type = 'OPENING_BALANCE' AND NOT public.has_cost_permission('inventory_opening') THEN RAISE EXCEPTION 'Bạn không có quyền xác nhận tồn đầu kỳ'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_document_lines WHERE document_id = v_doc.id) THEN RAISE EXCEPTION 'Phiếu kho phải có ít nhất một dòng'; END IF;

  PERFORM public.validate_inventory_document_for_confirm(v_doc.id);
  PERFORM set_config('app.inventory_posting', 'on', true);
  INSERT INTO public.inventory_balances (tenant_id, inventory_item_id, warehouse_id, location_id)
  SELECT DISTINCT v_doc.tenant_id, l.inventory_item_id, v_doc.warehouse_id, l.location_id
  FROM public.inventory_document_lines l WHERE l.document_id = v_doc.id
  ON CONFLICT (tenant_id, inventory_item_id, warehouse_id, location_id) DO NOTHING;
  IF v_doc.document_type = 'TRANSFER' THEN
    INSERT INTO public.inventory_balances (tenant_id, inventory_item_id, warehouse_id, location_id)
    SELECT DISTINCT v_doc.tenant_id, l.inventory_item_id, v_doc.to_warehouse_id, l.to_location_id
    FROM public.inventory_document_lines l WHERE l.document_id = v_doc.id
    ON CONFLICT (tenant_id, inventory_item_id, warehouse_id, location_id) DO NOTHING;
  END IF;
  PERFORM b.id
  FROM public.inventory_balances b
  JOIN (
    SELECT l.inventory_item_id, v_doc.warehouse_id AS warehouse_id, l.location_id
    FROM public.inventory_document_lines l WHERE l.document_id = v_doc.id
    UNION
    SELECT l.inventory_item_id, v_doc.to_warehouse_id, l.to_location_id
    FROM public.inventory_document_lines l WHERE l.document_id = v_doc.id AND v_doc.document_type = 'TRANSFER'
  ) affected ON affected.inventory_item_id = b.inventory_item_id
    AND affected.warehouse_id = b.warehouse_id
    AND affected.location_id IS NOT DISTINCT FROM b.location_id
  WHERE b.tenant_id = v_doc.tenant_id
  ORDER BY b.warehouse_id::text, b.inventory_item_id::text, COALESCE(b.location_id::text, '')
  FOR UPDATE OF b;

  FOR v_line IN SELECT * FROM public.inventory_document_lines WHERE document_id = v_doc.id ORDER BY line_number LOOP
    IF v_doc.document_type = 'OPENING_BALANCE' AND EXISTS (
      SELECT 1 FROM public.inventory_movements m
      WHERE m.tenant_id = v_doc.tenant_id AND m.inventory_item_id = v_line.inventory_item_id
        AND m.warehouse_id = v_doc.warehouse_id AND m.location_id IS NOT DISTINCT FROM v_line.location_id
    ) THEN RAISE EXCEPTION 'Tồn đầu kỳ chỉ được tạo trước movement đầu tiên'; END IF;
    CASE v_doc.document_type
      WHEN 'RECEIPT' THEN
        v_in := public.apply_inventory_movement(v_doc.id, v_line.id, v_doc.warehouse_id, v_line.location_id, 'RECEIPT', v_line.quantity, v_line.input_unit_cost, NULL);
        v_cost := v_in.unit_cost; v_line_cost := v_in.value_delta;
      WHEN 'OPENING_BALANCE' THEN
        v_in := public.apply_inventory_movement(v_doc.id, v_line.id, v_doc.warehouse_id, v_line.location_id, 'OPENING_BALANCE', v_line.quantity, v_line.input_unit_cost, NULL);
        v_cost := v_in.unit_cost; v_line_cost := v_in.value_delta;
      WHEN 'ISSUE' THEN
        v_out := public.apply_inventory_movement(v_doc.id, v_line.id, v_doc.warehouse_id, v_line.location_id, 'ISSUE', -v_line.quantity, NULL, NULL);
        v_cost := v_out.unit_cost; v_line_cost := abs(v_out.value_delta);
      WHEN 'RETURN_OUT' THEN
        v_out := public.apply_inventory_movement(v_doc.id, v_line.id, v_doc.warehouse_id, v_line.location_id, 'RETURN_OUT', -v_line.quantity, NULL, NULL);
        v_cost := v_out.unit_cost; v_line_cost := abs(v_out.value_delta);
      WHEN 'RETURN_IN' THEN
        SELECT * INTO v_source FROM public.inventory_movements WHERE id = v_line.source_movement_id;
        IF v_source.id IS NULL OR v_source.tenant_id <> v_doc.tenant_id OR v_source.inventory_item_id <> v_line.inventory_item_id
           OR v_source.warehouse_id <> v_doc.warehouse_id OR v_source.location_id IS DISTINCT FROM v_line.location_id
           OR v_source.movement_kind NOT IN ('ISSUE', 'RETURN_OUT', 'ADJUSTMENT_OUT')
           OR v_source.quantity_delta >= 0 OR v_source.unit <> v_line.unit THEN
          RAISE EXCEPTION 'Movement nguồn trả lại không hợp lệ';
        END IF;
        SELECT COALESCE(SUM(m.quantity_delta), 0) INTO v_returned
        FROM public.inventory_movements m WHERE m.source_movement_id = v_source.id AND m.quantity_delta > 0;
        IF v_returned + v_line.quantity > abs(v_source.quantity_delta) THEN RAISE EXCEPTION 'Số lượng trả vượt movement xuất nguồn'; END IF;
        v_in := public.apply_inventory_movement(v_doc.id, v_line.id, v_doc.warehouse_id, v_line.location_id, 'RETURN_IN', v_line.quantity, v_source.unit_cost, v_source.id);
        v_cost := v_in.unit_cost; v_line_cost := v_in.value_delta;
      WHEN 'TRANSFER' THEN
        v_out := public.apply_inventory_movement(v_doc.id, v_line.id, v_doc.warehouse_id, v_line.location_id, 'TRANSFER_OUT', -v_line.quantity, NULL, NULL);
        v_in := public.apply_inventory_movement(v_doc.id, v_line.id, v_doc.to_warehouse_id, v_line.to_location_id, 'TRANSFER_IN', v_line.quantity, v_out.unit_cost, v_out.id);
        v_cost := v_out.unit_cost; v_line_cost := abs(v_out.value_delta);
        IF v_in.value_delta <> abs(v_out.value_delta) THEN RAISE EXCEPTION 'Giá trị chuyển kho không cân bằng'; END IF;
      WHEN 'ADJUSTMENT' THEN
        IF NULLIF(btrim(COALESCE(v_doc.reason, '')), '') IS NULL THEN RAISE EXCEPTION 'Điều chỉnh tồn kho yêu cầu lý do'; END IF;
        IF v_line.adjustment_direction = 'INCREASE' THEN
          v_in := public.apply_inventory_movement(v_doc.id, v_line.id, v_doc.warehouse_id, v_line.location_id, 'ADJUSTMENT_IN', v_line.quantity, v_line.input_unit_cost, NULL);
          v_cost := v_in.unit_cost; v_line_cost := v_in.value_delta;
        ELSE
          v_out := public.apply_inventory_movement(v_doc.id, v_line.id, v_doc.warehouse_id, v_line.location_id, 'ADJUSTMENT_OUT', -v_line.quantity, NULL, NULL);
          v_cost := v_out.unit_cost; v_line_cost := abs(v_out.value_delta);
        END IF;
    END CASE;
    UPDATE public.inventory_document_lines SET posted_unit_cost = v_cost, posted_total_cost = v_line_cost WHERE id = v_line.id;
    v_doc_subtotal := v_doc_subtotal + v_line_cost;
    v_doc_vat := v_doc_vat + v_line.vat_amount;
  END LOOP;

  PERFORM set_config('app.inventory_recalculate', 'on', true);
  PERFORM set_config('app.inventory_transition', 'confirm', true);
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  UPDATE public.inventory_documents
  SET subtotal = v_doc_subtotal, vat_amount = v_doc_vat, total_amount = v_doc_subtotal + v_doc_vat,
      status = 'CONFIRMED', confirmed_by = auth.uid(), confirmed_at = now(), updated_at = now()
  WHERE id = v_doc.id RETURNING * INTO v_doc;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  PERFORM public.write_cost_audit('inventory_documents', v_doc.id, 'CONFIRM', NULL, to_jsonb(v_doc));
  PERFORM set_config('app.inventory_posting', 'off', true);
  PERFORM set_config('app.inventory_recalculate', 'off', true);
  RETURN jsonb_build_object('id', v_doc.id, 'document_number', v_doc.document_number, 'status', v_doc.status, 'reused', false);
END;
$$;

-- Reconciliation includes ledger-only rows and masks value fields without the
-- dedicated cost permission.
CREATE OR REPLACE FUNCTION public.reconcile_inventory_balances()
RETURNS TABLE(
  inventory_item_id uuid, warehouse_id uuid, location_id uuid,
  ledger_quantity numeric, balance_quantity numeric, quantity_difference numeric,
  ledger_value numeric, balance_value numeric, value_difference numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can_cost boolean;
BEGIN
  IF NOT public.has_cost_permission('inventory_audit') THEN RAISE EXCEPTION 'Bạn không có quyền đối soát kho'; END IF;
  v_can_cost := public.has_cost_permission('inventory_cost_view');
  RETURN QUERY
  WITH ledger AS (
    SELECT m.inventory_item_id, m.warehouse_id, m.location_id,
           SUM(m.quantity_delta)::numeric(18,4) AS qty,
           SUM(m.value_delta)::numeric(18,2) AS val
    FROM public.inventory_movements m
    JOIN public.warehouses w ON w.id = m.warehouse_id AND w.tenant_id = m.tenant_id
    WHERE m.tenant_id = 'default'
      AND (public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'accountant'::public.app_role)
        OR w.manager_id = public.current_cost_manager_id()
        OR w.manager_id IS NULL)
    GROUP BY m.inventory_item_id, m.warehouse_id, m.location_id
  ), balances AS (
    SELECT b.*
    FROM public.inventory_balances b
    JOIN public.warehouses w ON w.id = b.warehouse_id AND w.tenant_id = b.tenant_id
    WHERE b.tenant_id = 'default'
      AND (public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'accountant'::public.app_role)
        OR w.manager_id = public.current_cost_manager_id()
        OR w.manager_id IS NULL)
  ), keys AS (
    SELECT l.inventory_item_id, l.warehouse_id, l.location_id FROM ledger l
    UNION
    SELECT b.inventory_item_id, b.warehouse_id, b.location_id
    FROM balances b
  )
  SELECT k.inventory_item_id, k.warehouse_id, k.location_id,
         COALESCE(l.qty, 0), COALESCE(b.quantity_on_hand, 0), COALESCE(l.qty, 0) - COALESCE(b.quantity_on_hand, 0),
         CASE WHEN v_can_cost THEN COALESCE(l.val, 0) ELSE 0 END,
         CASE WHEN v_can_cost THEN COALESCE(b.inventory_value, 0) ELSE 0 END,
         CASE WHEN v_can_cost THEN COALESCE(l.val, 0) - COALESCE(b.inventory_value, 0) ELSE 0 END
  FROM keys k
  LEFT JOIN ledger l ON l.inventory_item_id = k.inventory_item_id AND l.warehouse_id = k.warehouse_id AND l.location_id IS NOT DISTINCT FROM k.location_id
  LEFT JOIN balances b ON b.inventory_item_id = k.inventory_item_id AND b.warehouse_id = k.warehouse_id AND b.location_id IS NOT DISTINCT FROM k.location_id
  ORDER BY k.inventory_item_id, k.warehouse_id, k.location_id;
END;
$$;

-- Lightweight first-paint metrics. Heavy document, movement, audit and
-- reconciliation datasets are loaded only when their tab is opened.
CREATE OR REPLACE FUNCTION public.get_inventory_dashboard_summary()
RETURNS TABLE(
  active_item_count bigint,
  stocked_balance_count bigint,
  draft_document_count bigint,
  warehouse_count bigint,
  total_inventory_value numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_can_cost boolean;
BEGIN
  IF NOT public.has_cost_permission('inventory_view') THEN RAISE EXCEPTION 'Bạn không có quyền xem kho'; END IF;
  v_can_cost := public.has_cost_permission('inventory_cost_view');
  RETURN QUERY
  WITH accessible_warehouses AS (
    SELECT w.id
    FROM public.warehouses w
    WHERE w.tenant_id = 'default'
      AND w.is_active
      AND (public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'accountant'::public.app_role)
        OR w.manager_id = public.current_cost_manager_id()
        OR w.manager_id IS NULL)
  ), accessible_items AS (
    SELECT i.id
    FROM public.inventory_items i
    WHERE i.tenant_id = 'default'
      AND i.is_active
      AND (public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'accountant'::public.app_role)
        OR i.manager_id = public.current_cost_manager_id()
        OR i.manager_id IS NULL)
  ), balance_summary AS (
    SELECT count(*) FILTER (WHERE b.quantity_on_hand > 0)::bigint AS stocked_count,
           sum(b.inventory_value)::numeric(18,2) AS inventory_value
    FROM public.inventory_balances b
    JOIN accessible_warehouses w ON w.id = b.warehouse_id
  ), document_summary AS (
    SELECT count(*)::bigint AS draft_count
    FROM public.inventory_documents d
    WHERE d.tenant_id = 'default'
      AND d.status = 'DRAFT'
      AND (public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'accountant'::public.app_role)
        OR d.manager_id = public.current_cost_manager_id()
        OR d.manager_id IS NULL)
  )
  SELECT
    (SELECT count(*)::bigint FROM accessible_items),
    COALESCE(bs.stocked_count, 0),
    ds.draft_count,
    (SELECT count(*)::bigint FROM accessible_warehouses),
    CASE WHEN v_can_cost THEN COALESCE(bs.inventory_value, 0) ELSE NULL END
  FROM balance_summary bs
  CROSS JOIN document_summary ds;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_inventory_balances()
RETURNS TABLE(
  id uuid, inventory_item_id uuid, item_code text, item_name text, item_type text,
  warehouse_id uuid, warehouse_name text, location_id uuid, location_name text,
  quantity_on_hand numeric, unit text, average_unit_cost numeric, inventory_value numeric,
  last_movement_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_can_cost boolean;
BEGIN
  IF NOT public.has_cost_permission('inventory_view') THEN RAISE EXCEPTION 'Bạn không có quyền xem tồn kho'; END IF;
  v_can_cost := public.has_cost_permission('inventory_cost_view');
  RETURN QUERY
  SELECT b.id, i.id, i.code, i.name, i.item_type, w.id, w.name, l.id, l.name,
         b.quantity_on_hand, i.base_unit,
         CASE WHEN v_can_cost THEN b.average_unit_cost ELSE NULL END,
         CASE WHEN v_can_cost THEN b.inventory_value ELSE NULL END,
         b.last_movement_at
  FROM public.inventory_balances b
  JOIN public.inventory_items i ON i.id = b.inventory_item_id AND i.tenant_id = b.tenant_id
  JOIN public.warehouses w ON w.id = b.warehouse_id AND w.tenant_id = b.tenant_id
  LEFT JOIN public.warehouse_locations l ON l.id = b.location_id AND l.tenant_id = b.tenant_id
  WHERE b.tenant_id = 'default'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'accountant'::public.app_role)
      OR w.manager_id = public.current_cost_manager_id()
      OR w.manager_id IS NULL)
  ORDER BY i.code, w.name, l.name;
END;
$$;

-- Audit metadata is available through a masked RPC. Direct table reads of
-- inventory audit rows are restricted to users who may view cost values.
CREATE OR REPLACE FUNCTION public.inventory_audit_event_accessible(
  p_entity_type text,
  p_entity_id uuid,
  p_before_data jsonb,
  p_after_data jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_manager_id text := public.current_cost_manager_id();
  v_document_id uuid;
BEGIN
  IF public.has_role(auth.uid(), 'admin'::public.app_role)
     OR public.has_role(auth.uid(), 'accountant'::public.app_role) THEN
    RETURN true;
  END IF;

  IF p_entity_type = 'inventory_items' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.inventory_items i
      WHERE i.id = p_entity_id AND i.tenant_id = 'default'
        AND (i.manager_id = v_manager_id OR i.manager_id IS NULL)
    ) OR COALESCE(p_after_data ->> 'manager_id', p_before_data ->> 'manager_id') IS NULL
      OR COALESCE(p_after_data ->> 'manager_id', p_before_data ->> 'manager_id') = v_manager_id;
  ELSIF p_entity_type = 'warehouse_locations' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.warehouse_locations l
      WHERE l.id = p_entity_id AND l.tenant_id = 'default'
        AND (l.manager_id = v_manager_id OR l.manager_id IS NULL)
    ) OR COALESCE(p_after_data ->> 'manager_id', p_before_data ->> 'manager_id') IS NULL
      OR COALESCE(p_after_data ->> 'manager_id', p_before_data ->> 'manager_id') = v_manager_id;
  ELSIF p_entity_type = 'inventory_documents' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.inventory_documents d
      WHERE d.id = p_entity_id AND d.tenant_id = 'default'
        AND (d.manager_id = v_manager_id OR d.manager_id IS NULL)
    ) OR COALESCE(p_after_data ->> 'manager_id', p_before_data ->> 'manager_id') IS NULL
      OR COALESCE(p_after_data ->> 'manager_id', p_before_data ->> 'manager_id') = v_manager_id;
  ELSIF p_entity_type = 'inventory_document_lines' THEN
    v_document_id := COALESCE(
      NULLIF(p_after_data ->> 'document_id', '')::uuid,
      NULLIF(p_before_data ->> 'document_id', '')::uuid
    );
    RETURN EXISTS (
      SELECT 1 FROM public.inventory_documents d
      WHERE d.id = v_document_id AND d.tenant_id = 'default'
        AND (d.manager_id = v_manager_id OR d.manager_id IS NULL)
    );
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_audit_event_accessible(text, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_audit_event_accessible(text, uuid, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_inventory_audit_events(p_limit integer DEFAULT 300)
RETURNS TABLE(id uuid, entity_type text, entity_id uuid, action text, actor_id uuid, reason text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_cost_permission('inventory_audit') THEN RAISE EXCEPTION 'Bạn không có quyền xem audit kho'; END IF;
  RETURN QUERY
  SELECT e.id, e.entity_type, e.entity_id, e.action, e.actor_id, e.reason, e.created_at
  FROM public.audit_events e
  WHERE e.tenant_id = 'default'
    AND e.entity_type IN ('inventory_items', 'warehouse_locations', 'inventory_documents', 'inventory_document_lines')
    AND public.inventory_audit_event_accessible(e.entity_type, e.entity_id, e.before_data, e.after_data)
  ORDER BY e.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 300), 1), 1000);
END;
$$;

DROP FUNCTION IF EXISTS public.list_inventory_movements(uuid, integer);
CREATE FUNCTION public.list_inventory_movements(p_inventory_item_id uuid DEFAULT NULL, p_limit integer DEFAULT 500)
RETURNS TABLE(
  id uuid, movement_sequence bigint, document_id uuid, document_number text,
  inventory_item_id uuid, item_code text, item_name text, warehouse_id uuid,
  warehouse_name text, movement_kind text, quantity_delta numeric, unit text,
  unit_cost numeric, value_delta numeric, running_quantity numeric,
  running_average_cost numeric, running_inventory_value numeric,
  transaction_at timestamptz, created_by uuid, source_movement_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_can_cost boolean;
BEGIN
  IF NOT public.has_cost_permission('inventory_view') THEN RAISE EXCEPTION 'Bạn không có quyền xem lịch sử kho'; END IF;
  v_can_cost := public.has_cost_permission('inventory_cost_view');
  RETURN QUERY
  SELECT m.id, m.movement_sequence, m.document_id, d.document_number,
         m.inventory_item_id, i.code, i.name, m.warehouse_id, w.name,
         m.movement_kind, m.quantity_delta, m.unit,
         CASE WHEN v_can_cost THEN m.unit_cost ELSE NULL END,
         CASE WHEN v_can_cost THEN m.value_delta ELSE NULL END,
         m.running_quantity,
         CASE WHEN v_can_cost THEN m.running_average_cost ELSE NULL END,
         CASE WHEN v_can_cost THEN m.running_inventory_value ELSE NULL END,
         m.transaction_at, m.created_by, m.source_movement_id
  FROM public.inventory_movements m
  JOIN public.inventory_documents d ON d.id = m.document_id AND d.tenant_id = m.tenant_id
  JOIN public.inventory_items i ON i.id = m.inventory_item_id AND i.tenant_id = m.tenant_id
  JOIN public.warehouses w ON w.id = m.warehouse_id AND w.tenant_id = m.tenant_id
  WHERE m.tenant_id = 'default'
    AND (p_inventory_item_id IS NULL OR m.inventory_item_id = p_inventory_item_id)
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'accountant'::public.app_role)
      OR d.manager_id = public.current_cost_manager_id()
      OR d.manager_id IS NULL)
  ORDER BY m.transaction_at DESC, m.movement_sequence DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
END;
$$;

DROP POLICY IF EXISTS audit_events_select ON public.audit_events;
CREATE POLICY audit_events_select ON public.audit_events FOR SELECT TO authenticated USING (
  tenant_id = 'default'
  AND (
    (entity_type IN ('inventory_items', 'warehouse_locations', 'inventory_documents', 'inventory_document_lines')
      AND public.has_cost_permission('inventory_audit')
      AND public.has_cost_permission('inventory_cost_view')
      AND public.inventory_audit_event_accessible(entity_type, entity_id, before_data, after_data))
    OR (entity_type NOT IN ('inventory_items', 'warehouse_locations', 'inventory_documents', 'inventory_document_lines')
      AND public.has_cost_permission('cost_audit'))
  )
);

REVOKE ALL ON FUNCTION public.list_inventory_audit_events(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_inventory_audit_events(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_inventory_balances() TO authenticated;
REVOKE ALL ON FUNCTION public.get_inventory_dashboard_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_dashboard_summary() TO authenticated;
REVOKE ALL ON FUNCTION public.reconcile_inventory_balances() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_inventory_balances() TO authenticated;
REVOKE ALL ON FUNCTION public.list_inventory_movements(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_inventory_movements(uuid, integer) TO authenticated;

DROP POLICY IF EXISTS inventory_items_select ON public.inventory_items;
CREATE POLICY inventory_items_select ON public.inventory_items FOR SELECT TO authenticated
USING (
  tenant_id = 'default'
  AND (public.has_cost_permission('inventory_view') OR public.has_cost_permission('inventory_items'))
  AND (public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'accountant'::public.app_role)
    OR manager_id = public.current_cost_manager_id()
    OR manager_id IS NULL)
);
DROP POLICY IF EXISTS inventory_items_insert ON public.inventory_items;
CREATE POLICY inventory_items_insert ON public.inventory_items FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = 'default'
  AND public.has_cost_permission('inventory_items')
  AND (public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'accountant'::public.app_role)
    OR manager_id = public.current_cost_manager_id()
    OR manager_id IS NULL)
);
DROP POLICY IF EXISTS inventory_items_update ON public.inventory_items;
CREATE POLICY inventory_items_update ON public.inventory_items FOR UPDATE TO authenticated
USING (
  tenant_id = 'default'
  AND public.has_cost_permission('inventory_items')
  AND (public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'accountant'::public.app_role)
    OR manager_id = public.current_cost_manager_id()
    OR manager_id IS NULL)
)
WITH CHECK (
  tenant_id = 'default'
  AND public.has_cost_permission('inventory_items')
  AND (public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'accountant'::public.app_role)
    OR manager_id = public.current_cost_manager_id()
    OR manager_id IS NULL)
);

DROP POLICY IF EXISTS warehouse_locations_select ON public.warehouse_locations;
CREATE POLICY warehouse_locations_select ON public.warehouse_locations FOR SELECT TO authenticated
USING (
  tenant_id = 'default'
  AND public.has_cost_permission('inventory_view')
  AND (public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'accountant'::public.app_role)
    OR manager_id = public.current_cost_manager_id()
    OR manager_id IS NULL)
);
DROP POLICY IF EXISTS warehouse_locations_insert ON public.warehouse_locations;
CREATE POLICY warehouse_locations_insert ON public.warehouse_locations FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = 'default'
  AND public.has_cost_permission('inventory_items')
  AND (public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'accountant'::public.app_role)
    OR manager_id = public.current_cost_manager_id()
    OR manager_id IS NULL)
);
DROP POLICY IF EXISTS warehouse_locations_update ON public.warehouse_locations;
CREATE POLICY warehouse_locations_update ON public.warehouse_locations FOR UPDATE TO authenticated
USING (
  tenant_id = 'default'
  AND public.has_cost_permission('inventory_items')
  AND (public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'accountant'::public.app_role)
    OR manager_id = public.current_cost_manager_id()
    OR manager_id IS NULL)
)
WITH CHECK (
  tenant_id = 'default'
  AND public.has_cost_permission('inventory_items')
  AND (public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'accountant'::public.app_role)
    OR manager_id = public.current_cost_manager_id()
    OR manager_id IS NULL)
);
