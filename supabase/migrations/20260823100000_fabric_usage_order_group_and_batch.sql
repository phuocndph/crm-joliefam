-- Normalize fabric usage reporting without changing existing customer codes.
ALTER TABLE public.fabric_usage
  ADD COLUMN IF NOT EXISTS order_group text;

UPDATE public.fabric_usage
SET order_group = CASE customer_code
  WHEN 'don_phuoc' THEN 'don_phuoc'
  WHEN 'don_hoan' THEN 'don_hoan'
  ELSE 'unclassified'
END
WHERE order_group IS NULL;

ALTER TABLE public.fabric_usage
  ALTER COLUMN order_group SET DEFAULT 'unclassified';

ALTER TABLE public.fabric_usage
  ADD CONSTRAINT fabric_usage_order_group_check
  CHECK (order_group IN ('don_phuoc', 'don_hoan', 'unclassified'));

ALTER TABLE public.fabric_transactions
  ADD COLUMN IF NOT EXISTS fabric_usage_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fabric_transactions_usage_id
  ON public.fabric_transactions (fabric_usage_id)
  WHERE fabric_usage_id IS NOT NULL;

-- The application records fabric in meters. Preserve customer_code as a real
-- customer field; legacy values used for order grouping remain readable.
ALTER TABLE public.fabric_usage
  ALTER COLUMN unit SET DEFAULT 'm';
UPDATE public.fabric_usage SET unit = 'm' WHERE unit IS DISTINCT FROM 'm';
ALTER TABLE public.fabric_usage
  ADD CONSTRAINT fabric_usage_unit_m_check CHECK (unit = 'm');
ALTER TABLE public.fabric_variants
  ALTER COLUMN unit SET DEFAULT 'm';
UPDATE public.fabric_variants SET unit = 'm' WHERE unit IS DISTINCT FROM 'm';
ALTER TABLE public.fabric_variants
  ADD CONSTRAINT fabric_variants_unit_m_check CHECK (unit = 'm');

CREATE INDEX IF NOT EXISTS idx_fabric_usage_order_group_date
  ON public.fabric_usage (order_group, usage_date);

-- Record all fabrics for one order atomically. Inventory is locked in a
-- deterministic order so concurrent operators cannot consume the same stock.
CREATE OR REPLACE FUNCTION public.record_fabric_usage_batch(
  p_order_id uuid,
  p_order_number text,
  p_warehouse_id uuid,
  p_items jsonb,
  p_customer_name text DEFAULT NULL,
  p_customer_code text DEFAULT NULL,
  p_order_type text DEFAULT NULL,
  p_order_group text DEFAULT 'unclassified',
  p_usage_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_manager_id uuid;
  v_item jsonb;
  v_variant_id uuid;
  v_quantity numeric;
  v_usage_id uuid;
  v_stock numeric;
  v_usage_count integer := 0;
  v_transaction_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required. Please log in again.';
  END IF;

  SELECT role INTO v_user_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
  IF v_user_role IS NULL OR v_user_role NOT IN ('admin', 'manager', 'accountant', 'employee') THEN
    RAISE EXCEPTION 'Permission denied.';
  END IF;

  IF v_user_role = 'manager' THEN
    v_manager_id := v_user_id;
  ELSIF v_user_role IN ('employee', 'accountant') THEN
    SELECT assigned_by INTO v_manager_id FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
  END IF;

  IF p_order_id IS NULL OR p_order_number IS NULL OR btrim(p_order_number) = '' THEN
    RAISE EXCEPTION 'Order ID and order number are required.';
  END IF;
  IF p_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse is required.';
  END IF;
  IF v_user_role NOT IN ('admin', 'accountant') AND NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_warehouse_id AND (manager_id IS NULL OR manager_id = v_manager_id::text)
  ) THEN
    RAISE EXCEPTION 'You do not have access to this warehouse.';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one fabric item is required.';
  END IF;
  IF p_order_group IS NULL OR p_order_group NOT IN ('don_phuoc', 'don_hoan', 'unclassified') THEN
    RAISE EXCEPTION 'Invalid order group.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) item
    GROUP BY (item->>'fabric_variant_id')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'A fabric variant may appear only once in a batch.';
  END IF;

  -- Lock every inventory row before inserting usage. The ordered pass avoids
  -- deadlocks when two batches contain the same variants in different order.
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_items)
    ORDER BY (value->>'fabric_variant_id')
  LOOP
    v_variant_id := (v_item->>'fabric_variant_id')::uuid;
    v_quantity := (v_item->>'quantity_used')::numeric;
    IF v_variant_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Each fabric item must have a positive quantity.';
    END IF;

    SELECT current_stock INTO v_stock
    FROM public.fabric_inventory
    WHERE fabric_variant_id = v_variant_id AND warehouse_id = p_warehouse_id
    FOR UPDATE;

    IF v_stock IS NULL THEN
      RAISE EXCEPTION 'No inventory record exists for the selected fabric and warehouse.';
    END IF;
    IF v_stock < v_quantity THEN
      RAISE EXCEPTION 'Insufficient fabric stock. Available: %, requested: % m.', v_stock, v_quantity;
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'fabric_variant_id')::uuid;
    v_quantity := (v_item->>'quantity_used')::numeric;

    INSERT INTO public.fabric_usage (
      order_id, order_number, fabric_variant_id, warehouse_id, quantity_used,
      unit, customer_name, customer_code, order_type, order_group,
      usage_date, notes, manager_id
    ) VALUES (
      p_order_id, p_order_number, v_variant_id, p_warehouse_id, v_quantity,
      'm', p_customer_name, p_customer_code, p_order_type, p_order_group,
      p_usage_date, p_notes, v_manager_id
    ) RETURNING id INTO v_usage_id;
    v_usage_count := v_usage_count + 1;

    INSERT INTO public.fabric_transactions (
      fabric_variant_id, warehouse_id, transaction_type, quantity,
      notes, transaction_date, manager_id, reference_number, fabric_usage_id
    ) VALUES (
      v_variant_id, p_warehouse_id, 'outbound', -v_quantity,
      COALESCE(p_notes, 'Xuất vải cho đơn hàng ' || p_order_number),
      p_usage_date, v_manager_id, p_order_number, v_usage_id
    );
    v_transaction_count := v_transaction_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'usage_count', v_usage_count,
    'transaction_count', v_transaction_count,
    'order_group', p_order_group,
    'unit', 'm'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'error_code', SQLSTATE);
END;
$$;

-- Link the legacy single-item RPC to its usage transaction when available.
CREATE OR REPLACE FUNCTION public.record_fabric_usage_and_transaction(
  p_order_id uuid, p_order_number text, p_fabric_variant_id uuid,
  p_warehouse_id uuid, p_quantity_used numeric, p_customer_name text DEFAULT NULL,
  p_customer_code text DEFAULT NULL, p_order_type text DEFAULT NULL,
  p_fabric_width text DEFAULT NULL, p_usage_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  SELECT public.record_fabric_usage_batch(
    p_order_id, p_order_number, p_warehouse_id,
    jsonb_build_array(jsonb_build_object('fabric_variant_id', p_fabric_variant_id, 'quantity_used', p_quantity_used)),
    p_customer_name, p_customer_code, p_order_type,
    CASE WHEN p_customer_code IN ('don_phuoc', 'don_hoan') THEN p_customer_code ELSE 'unclassified' END,
    p_usage_date, p_notes
  ) INTO r;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_fabric_usage_and_transaction(
  p_usage_id uuid,
  p_order_number text DEFAULT NULL,
  p_fabric_variant_id uuid DEFAULT NULL,
  p_warehouse_id uuid DEFAULT NULL,
  p_quantity_used numeric DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_customer_code text DEFAULT NULL,
  p_order_type text DEFAULT NULL,
  p_order_group text DEFAULT NULL,
  p_fabric_width text DEFAULT NULL,
  p_usage_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_row public.fabric_usage; new_variant uuid; new_warehouse uuid; new_qty numeric; tx_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'manager', 'accountant', 'employee')
  ) THEN RAISE EXCEPTION 'Permission denied.'; END IF;
  SELECT * INTO old_row FROM public.fabric_usage WHERE id = p_usage_id FOR UPDATE;
  IF old_row.id IS NULL THEN RAISE EXCEPTION 'Fabric usage record not found.'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'accountant')
     AND old_row.manager_id IS DISTINCT FROM (
       SELECT COALESCE(ur.assigned_by, ur.user_id)::text FROM public.user_roles ur WHERE ur.user_id = auth.uid() LIMIT 1
     ) THEN RAISE EXCEPTION 'You do not have access to this usage record.'; END IF;
  new_variant := COALESCE(p_fabric_variant_id, old_row.fabric_variant_id);
  new_warehouse := COALESCE(p_warehouse_id, old_row.warehouse_id);
  new_qty := COALESCE(p_quantity_used, old_row.quantity_used);
  IF new_qty <= 0 THEN RAISE EXCEPTION 'Quantity used must be greater than 0.'; END IF;

  SELECT id INTO tx_id FROM public.fabric_transactions WHERE fabric_usage_id = p_usage_id FOR UPDATE;
  UPDATE public.fabric_usage SET
    order_number = COALESCE(p_order_number, order_number),
    fabric_variant_id = new_variant, warehouse_id = new_warehouse, quantity_used = new_qty,
    customer_name = COALESCE(p_customer_name, customer_name), customer_code = COALESCE(p_customer_code, customer_code),
    order_type = COALESCE(p_order_type, order_type), order_group = COALESCE(p_order_group, order_group, 'unclassified'),
    fabric_width = COALESCE(p_fabric_width, fabric_width), usage_date = COALESCE(p_usage_date, usage_date), notes = COALESCE(p_notes, notes)
  WHERE id = p_usage_id;

  IF tx_id IS NOT NULL THEN
    UPDATE public.fabric_transactions SET
      fabric_variant_id = new_variant, warehouse_id = new_warehouse,
      quantity = -new_qty, transaction_date = COALESCE(p_usage_date, transaction_date),
      reference_number = COALESCE(p_order_number, reference_number), notes = p_notes
    WHERE id = tx_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'usage_id', p_usage_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_fabric_usage_and_transaction(p_usage_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_manager_id text;
BEGIN
  SELECT manager_id INTO old_manager_id FROM public.fabric_usage WHERE id = p_usage_id FOR UPDATE;
  IF old_manager_id IS NULL THEN RAISE EXCEPTION 'Fabric usage record not found.'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'accountant')
     AND old_manager_id IS DISTINCT FROM (
       SELECT COALESCE(ur.assigned_by, ur.user_id)::text FROM public.user_roles ur WHERE ur.user_id = auth.uid() LIMIT 1
     ) THEN RAISE EXCEPTION 'You do not have access to this usage record.'; END IF;
  DELETE FROM public.fabric_transactions WHERE fabric_usage_id = p_usage_id;
  DELETE FROM public.fabric_usage WHERE id = p_usage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fabric usage record not found.'; END IF;
  RETURN jsonb_build_object('success', true, 'usage_id', p_usage_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_fabric_usage_and_transaction(uuid, text, uuid, uuid, numeric, text, text, text, text, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_fabric_usage_and_transaction(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.record_fabric_usage_batch(uuid, text, uuid, jsonb, text, text, text, text, date, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_fabric_usage_batch(uuid, text, uuid, jsonb, text, text, text, text, date, text) TO authenticated;
