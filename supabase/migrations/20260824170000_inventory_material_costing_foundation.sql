-- Sprint 2: general inventory and Moving Weighted Average foundation.
-- Development-only additive migration. Legacy fabric tables remain unchanged.

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  manager_id text,
  code text NOT NULL CHECK (btrim(code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  item_type text NOT NULL CHECK (item_type IN ('RAW_MATERIAL', 'SUPPLY', 'SEMI_FINISHED', 'FINISHED_GOOD', 'PACKAGING', 'OTHER')),
  base_unit text NOT NULL CHECK (base_unit IN ('METER', 'KG', 'PIECE', 'ROLL', 'SET', 'BAG', 'BOX')),
  category text,
  is_active boolean NOT NULL DEFAULT true,
  legacy_source_type text CHECK (legacy_source_type IN ('FABRIC_VARIANT')),
  legacy_source_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK ((legacy_source_type IS NULL) = (legacy_source_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_legacy_source_unique
  ON public.inventory_items (tenant_id, legacy_source_type, legacy_source_id)
  WHERE legacy_source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.warehouse_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  manager_id text,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (btrim(code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  parent_id uuid REFERENCES public.warehouse_locations(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, warehouse_id, code),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE IF NOT EXISTS public.inventory_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  manager_id text,
  document_number text NOT NULL CHECK (btrim(document_number) <> ''),
  document_type text NOT NULL CHECK (document_type IN ('RECEIPT', 'ISSUE', 'RETURN_IN', 'RETURN_OUT', 'TRANSFER', 'ADJUSTMENT', 'OPENING_BALANCE')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CONFIRMED', 'VOIDED')),
  transaction_at timestamptz NOT NULL DEFAULT now(),
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  business_transaction_id uuid REFERENCES public.business_transactions(id) ON DELETE RESTRICT,
  description text NOT NULL CHECK (btrim(description) <> ''),
  counterparty_name_snapshot text,
  external_reference text,
  reason text,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) >= 8),
  subtotal numeric(18,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  vat_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  total_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  voided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  UNIQUE (tenant_id, document_number),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (business_transaction_id),
  CHECK (warehouse_id IS NULL OR to_warehouse_id IS NULL OR warehouse_id <> to_warehouse_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_document_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  document_id uuid NOT NULL REFERENCES public.inventory_documents(id) ON DELETE CASCADE,
  line_number integer NOT NULL CHECK (line_number > 0),
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.warehouse_locations(id) ON DELETE RESTRICT,
  to_location_id uuid REFERENCES public.warehouse_locations(id) ON DELETE RESTRICT,
  description text,
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL CHECK (unit IN ('METER', 'KG', 'PIECE', 'ROLL', 'SET', 'BAG', 'BOX')),
  input_unit_cost numeric(18,6) CHECK (input_unit_cost >= 0),
  vat_rate numeric(7,4) NOT NULL DEFAULT 0 CHECK (vat_rate >= 0 AND vat_rate <= 100),
  input_subtotal numeric(18,2) NOT NULL DEFAULT 0 CHECK (input_subtotal >= 0),
  vat_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  input_total numeric(18,2) NOT NULL DEFAULT 0 CHECK (input_total >= 0),
  posted_unit_cost numeric(18,6) CHECK (posted_unit_cost >= 0),
  posted_total_cost numeric(18,2) CHECK (posted_total_cost >= 0),
  adjustment_direction text CHECK (adjustment_direction IN ('INCREASE', 'DECREASE')),
  source_movement_id uuid,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE RESTRICT,
  cost_object_id uuid REFERENCES public.cost_objects(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, line_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tenant_id text NOT NULL DEFAULT 'default',
  document_id uuid NOT NULL REFERENCES public.inventory_documents(id) ON DELETE RESTRICT,
  document_line_id uuid NOT NULL REFERENCES public.inventory_document_lines(id) ON DELETE RESTRICT,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.warehouse_locations(id) ON DELETE RESTRICT,
  movement_kind text NOT NULL CHECK (movement_kind IN ('RECEIPT', 'ISSUE', 'RETURN_IN', 'RETURN_OUT', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'OPENING_BALANCE')),
  quantity_delta numeric(18,4) NOT NULL CHECK (quantity_delta <> 0),
  unit text NOT NULL CHECK (unit IN ('METER', 'KG', 'PIECE', 'ROLL', 'SET', 'BAG', 'BOX')),
  unit_cost numeric(18,6) NOT NULL CHECK (unit_cost >= 0),
  value_delta numeric(18,2) NOT NULL,
  running_quantity numeric(18,4) NOT NULL CHECK (running_quantity >= 0),
  running_average_cost numeric(18,6) NOT NULL CHECK (running_average_cost >= 0),
  running_inventory_value numeric(18,2) NOT NULL CHECK (running_inventory_value >= 0),
  transaction_at timestamptz NOT NULL,
  source_type text,
  source_id uuid,
  source_movement_id uuid REFERENCES public.inventory_movements(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_line_id, warehouse_id, movement_kind),
  CHECK ((quantity_delta > 0 AND value_delta >= 0) OR (quantity_delta < 0 AND value_delta <= 0))
);

ALTER TABLE public.inventory_document_lines
  ADD CONSTRAINT inventory_document_lines_source_movement_fkey
  FOREIGN KEY (source_movement_id) REFERENCES public.inventory_movements(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.inventory_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.warehouse_locations(id) ON DELETE RESTRICT,
  quantity_on_hand numeric(18,4) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  average_unit_cost numeric(18,6) NOT NULL DEFAULT 0 CHECK (average_unit_cost >= 0),
  inventory_value numeric(18,2) NOT NULL DEFAULT 0 CHECK (inventory_value >= 0),
  last_movement_at timestamptz,
  last_movement_sequence bigint,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, inventory_item_id, warehouse_id, location_id)
);

CREATE INDEX IF NOT EXISTS inventory_items_active_idx ON public.inventory_items (tenant_id, is_active, item_type, code);
CREATE INDEX IF NOT EXISTS warehouse_locations_active_idx ON public.warehouse_locations (tenant_id, warehouse_id, is_active, code);
CREATE INDEX IF NOT EXISTS inventory_documents_filter_idx ON public.inventory_documents (tenant_id, transaction_at DESC, status, document_type, warehouse_id);
CREATE INDEX IF NOT EXISTS inventory_documents_creator_idx ON public.inventory_documents (tenant_id, created_by, transaction_at DESC);
CREATE INDEX IF NOT EXISTS inventory_document_lines_item_idx ON public.inventory_document_lines (tenant_id, inventory_item_id, document_id);
CREATE INDEX IF NOT EXISTS inventory_movements_ledger_idx ON public.inventory_movements (tenant_id, inventory_item_id, warehouse_id, location_id, transaction_at, movement_sequence);
CREATE INDEX IF NOT EXISTS inventory_movements_document_idx ON public.inventory_movements (tenant_id, document_id, document_line_id);
CREATE INDEX IF NOT EXISTS inventory_movements_source_idx ON public.inventory_movements (tenant_id, source_movement_id) WHERE source_movement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_balances_lookup_idx ON public.inventory_balances (tenant_id, inventory_item_id, warehouse_id, location_id);

CREATE OR REPLACE FUNCTION public.set_inventory_master_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL OR NEW.tenant_id = '' THEN NEW.tenant_id := 'default'; END IF;
  IF NEW.manager_id IS NULL AND auth.uid() IS NOT NULL THEN NEW.manager_id := public.current_cost_manager_id(); END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_inventory_item_legacy_source()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_unit text;
  v_expected_unit text;
BEGIN
  IF NEW.legacy_source_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.legacy_source_type <> 'FABRIC_VARIANT' OR to_regclass('public.fabric_variants') IS NULL THEN
    RAISE EXCEPTION 'Nguồn legacy không được hỗ trợ';
  END IF;
  EXECUTE 'SELECT unit FROM public.fabric_variants WHERE id = $1 AND tenant_id = $2'
    INTO v_unit USING NEW.legacy_source_id, NEW.tenant_id;
  IF v_unit IS NULL THEN
    RAISE EXCEPTION 'Biến thể vải legacy không tồn tại hoặc không cùng phạm vi dữ liệu';
  END IF;
  v_expected_unit := CASE lower(v_unit)
    WHEN 'm' THEN 'METER'
    WHEN 'meter' THEN 'METER'
    WHEN 'kg' THEN 'KG'
    WHEN 'piece' THEN 'PIECE'
    WHEN 'roll' THEN 'ROLL'
    ELSE NULL
  END;
  IF v_expected_unit IS NULL OR v_expected_unit <> NEW.base_unit THEN
    RAISE EXCEPTION 'Đơn vị vật tư phải khớp nguồn legacy; không tự chuyển đổi đơn vị';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_inventory_item_unit()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.base_unit IS DISTINCT FROM OLD.base_unit AND EXISTS (
    SELECT 1 FROM public.inventory_movements m
    WHERE m.tenant_id = OLD.tenant_id AND m.inventory_item_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Không thể đổi đơn vị gốc của vật tư đã có movement kho';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_warehouse_location_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses w
    WHERE w.id = NEW.warehouse_id AND w.tenant_id = NEW.tenant_id AND w.is_active
  ) THEN
    RAISE EXCEPTION 'Kho không hoạt động hoặc không cùng phạm vi dữ liệu';
  END IF;
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.warehouse_locations p
    WHERE p.id = NEW.parent_id AND p.tenant_id = NEW.tenant_id
      AND p.warehouse_id = NEW.warehouse_id
  ) THEN
    RAISE EXCEPTION 'Vị trí cha không cùng kho hoặc phạm vi dữ liệu';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_inventory_document_number(p_tenant_id text, p_transaction_at timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_period text := to_char(COALESCE(p_transaction_at, now()), 'YYYYMM');
  v_next bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('inventory-document-number:' || COALESCE(p_tenant_id, 'default') || ':' || v_period, 0));
  SELECT COALESCE(MAX((substring(document_number FROM 12))::bigint), 0) + 1
    INTO v_next
    FROM public.inventory_documents
   WHERE tenant_id = COALESCE(p_tenant_id, 'default')
     AND document_number ~ ('^INV-' || v_period || '-[0-9]+$');
  RETURN format('INV-%s-%s', v_period, lpad(v_next::text, 6, '0'));
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_warehouse_accessible(p_warehouse_id uuid, p_tenant_id text DEFAULT 'default')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.warehouses w
    WHERE w.id = p_warehouse_id AND w.tenant_id = p_tenant_id AND w.is_active
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'accountant'::public.app_role)
        OR w.manager_id = public.current_cost_manager_id()
        OR w.manager_id IS NULL
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.validate_inventory_document_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
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
  IF NEW.business_transaction_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.business_transactions bt
    JOIN public.transaction_types tt ON tt.id = bt.transaction_type_id AND tt.tenant_id = bt.tenant_id
    WHERE bt.id = NEW.business_transaction_id
      AND bt.tenant_id = NEW.tenant_id
      AND bt.status = 'CONFIRMED'
      AND tt.has_inventory_impact
  ) THEN
    RAISE EXCEPTION 'Giao dịch nghiệp vụ phải đã xác nhận, có tác động kho và cùng phạm vi dữ liệu';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_inventory_document_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_transition text := COALESCE(current_setting('app.inventory_transition', true), '');
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.manager_id IS DISTINCT FROM OLD.manager_id
     OR NEW.document_number IS DISTINCT FROM OLD.document_number
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Không thể thay đổi khóa hoặc phạm vi của phiếu kho';
  END IF;
  IF (NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount OR NEW.total_amount IS DISTINCT FROM OLD.total_amount)
     AND COALESCE(current_setting('app.inventory_recalculate', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'Tổng phiếu kho chỉ được hệ thống tính';
  END IF;
  IF (NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at)
     AND v_transition <> 'confirm' THEN
    RAISE EXCEPTION 'Thông tin xác nhận chỉ được cập nhật qua thao tác xác nhận';
  END IF;
  IF (NEW.voided_by IS DISTINCT FROM OLD.voided_by OR NEW.voided_at IS DISTINCT FROM OLD.voided_at OR NEW.void_reason IS DISTINCT FROM OLD.void_reason)
     AND v_transition <> 'void' THEN
    RAISE EXCEPTION 'Thông tin hủy chỉ được cập nhật qua thao tác hủy';
  END IF;
  IF OLD.status = 'CONFIRMED' THEN
    RAISE EXCEPTION 'Phiếu kho đã xác nhận không thể sửa hoặc hủy; hãy tạo chứng từ sửa sai';
  END IF;
  IF OLD.status = 'VOIDED' THEN
    RAISE EXCEPTION 'Phiếu kho đã hủy không thể chỉnh sửa';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (NEW.status = 'CONFIRMED' AND v_transition = 'confirm') OR
    (NEW.status = 'VOIDED' AND v_transition = 'void')
  ) THEN
    RAISE EXCEPTION 'Trạng thái phiếu kho chỉ được thay đổi qua thao tác hệ thống';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_inventory_document_line()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_doc public.inventory_documents;
  v_item public.inventory_items;
BEGIN
  SELECT * INTO v_doc FROM public.inventory_documents WHERE id = NEW.document_id;
  SELECT * INTO v_item FROM public.inventory_items WHERE id = NEW.inventory_item_id;
  IF v_doc.id IS NULL OR v_doc.tenant_id <> NEW.tenant_id OR v_doc.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Dòng phải thuộc phiếu nháp cùng phạm vi dữ liệu';
  END IF;
  IF v_item.id IS NULL OR v_item.tenant_id <> NEW.tenant_id OR NOT v_item.is_active THEN
    RAISE EXCEPTION 'Vật tư không hoạt động hoặc không cùng phạm vi dữ liệu';
  END IF;
  IF NEW.unit <> v_item.base_unit THEN
    RAISE EXCEPTION 'Đơn vị dòng không khớp đơn vị gốc của vật tư';
  END IF;
  IF NEW.location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.warehouse_locations l
    WHERE l.id = NEW.location_id AND l.tenant_id = NEW.tenant_id
      AND l.warehouse_id = v_doc.warehouse_id AND l.is_active
  ) THEN
    RAISE EXCEPTION 'Vị trí xuất/nhập không thuộc kho đã chọn';
  END IF;
  IF NEW.to_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.warehouse_locations l
    WHERE l.id = NEW.to_location_id AND l.tenant_id = NEW.tenant_id
      AND l.warehouse_id = v_doc.to_warehouse_id AND l.is_active
  ) THEN
    RAISE EXCEPTION 'Vị trí nhận không thuộc kho nhận';
  END IF;
  IF NEW.cost_center_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cost_centers c WHERE c.id = NEW.cost_center_id AND c.tenant_id = NEW.tenant_id AND c.is_active
  ) THEN RAISE EXCEPTION 'Trung tâm chi phí không hợp lệ'; END IF;
  IF NEW.cost_object_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cost_objects c WHERE c.id = NEW.cost_object_id AND c.tenant_id = NEW.tenant_id AND c.is_active
  ) THEN RAISE EXCEPTION 'Đối tượng chi phí không hợp lệ'; END IF;

  IF v_doc.document_type IN ('RECEIPT', 'OPENING_BALANCE') OR (v_doc.document_type = 'ADJUSTMENT' AND NEW.adjustment_direction = 'INCREASE') THEN
    IF NEW.input_unit_cost IS NULL OR NEW.input_unit_cost <= 0 THEN
      RAISE EXCEPTION 'Dòng nhập/tăng tồn yêu cầu đơn giá lớn hơn 0';
    END IF;
    NEW.input_subtotal := round(NEW.quantity * NEW.input_unit_cost, 2);
    NEW.vat_amount := round(NEW.input_subtotal * NEW.vat_rate / 100, 2);
    NEW.input_total := NEW.input_subtotal + NEW.vat_amount;
  ELSE
    NEW.input_unit_cost := NULL;
    NEW.input_subtotal := 0;
    NEW.vat_amount := 0;
    NEW.input_total := 0;
  END IF;
  IF v_doc.document_type = 'ADJUSTMENT' AND NEW.adjustment_direction IS NULL THEN
    RAISE EXCEPTION 'Điều chỉnh yêu cầu chiều tăng hoặc giảm';
  ELSIF v_doc.document_type <> 'ADJUSTMENT' THEN
    NEW.adjustment_direction := NULL;
  END IF;
  IF v_doc.document_type = 'RETURN_IN' AND NEW.source_movement_id IS NULL THEN
    RAISE EXCEPTION 'Phiếu trả lại kho yêu cầu movement xuất nguồn';
  ELSIF v_doc.document_type <> 'RETURN_IN' AND v_doc.document_type <> 'TRANSFER' THEN
    NEW.source_movement_id := NULL;
  END IF;
  IF COALESCE(current_setting('app.inventory_posting', true), 'off') <> 'on' THEN
    NEW.posted_unit_cost := NULL;
    NEW.posted_total_cost := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_inventory_document_line()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.document_id IS DISTINCT FROM OLD.document_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN RAISE EXCEPTION 'Không thể chuyển dòng sang phiếu hoặc phạm vi khác'; END IF;
  SELECT status INTO v_status FROM public.inventory_documents WHERE id = COALESCE(NEW.document_id, OLD.document_id);
  IF v_status IS NULL OR v_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Chỉ được chỉnh sửa dòng của phiếu nháp';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_inventory_movement_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF COALESCE(current_setting('app.inventory_posting', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'Sổ movement kho là bất biến';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_inventory_balance_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF COALESCE(current_setting('app.inventory_posting', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'Tồn kho chỉ được cập nhật từ movement ledger';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_inventory_movement(
  p_document_id uuid,
  p_line_id uuid,
  p_warehouse_id uuid,
  p_location_id uuid,
  p_movement_kind text,
  p_quantity_delta numeric,
  p_inbound_unit_cost numeric DEFAULT NULL,
  p_source_movement_id uuid DEFAULT NULL
)
RETURNS public.inventory_movements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc public.inventory_documents;
  v_line public.inventory_document_lines;
  v_balance public.inventory_balances;
  v_movement public.inventory_movements;
  v_unit_cost numeric(18,6);
  v_value_delta numeric(18,2);
  v_new_quantity numeric(18,4);
  v_new_value numeric(18,2);
  v_new_average numeric(18,6);
BEGIN
  IF COALESCE(current_setting('app.inventory_posting', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'Movement chỉ được tạo trong thao tác xác nhận';
  END IF;
  SELECT * INTO v_doc FROM public.inventory_documents WHERE id = p_document_id;
  SELECT * INTO v_line FROM public.inventory_document_lines WHERE id = p_line_id AND document_id = p_document_id;
  SELECT * INTO v_balance FROM public.inventory_balances
   WHERE tenant_id = v_doc.tenant_id AND inventory_item_id = v_line.inventory_item_id
     AND warehouse_id = p_warehouse_id AND location_id IS NOT DISTINCT FROM p_location_id
   FOR UPDATE;
  IF v_balance.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy projection tồn kho đã khóa'; END IF;
  IF v_balance.last_movement_at IS NOT NULL AND v_doc.transaction_at < v_balance.last_movement_at THEN
    RAISE EXCEPTION 'Không thể xác nhận chứng từ lùi trước movement kho cuối cùng';
  END IF;
  IF p_quantity_delta > 0 THEN
    IF p_inbound_unit_cost IS NULL OR p_inbound_unit_cost < 0 THEN RAISE EXCEPTION 'Movement nhập yêu cầu đơn giá'; END IF;
    v_unit_cost := round(p_inbound_unit_cost, 6);
    v_value_delta := round(p_quantity_delta * v_unit_cost, 2);
    v_new_quantity := v_balance.quantity_on_hand + p_quantity_delta;
    v_new_value := v_balance.inventory_value + v_value_delta;
    v_new_average := CASE WHEN v_new_quantity = 0 THEN 0 ELSE round(v_new_value / v_new_quantity, 6) END;
  ELSE
    IF v_balance.quantity_on_hand < abs(p_quantity_delta) THEN
      RAISE EXCEPTION 'Số lượng xuất vượt tồn kho hiện tại. Tồn: %, yêu cầu: %', v_balance.quantity_on_hand, abs(p_quantity_delta);
    END IF;
    v_unit_cost := v_balance.average_unit_cost;
    v_value_delta := -round(abs(p_quantity_delta) * v_unit_cost, 2);
    v_new_quantity := v_balance.quantity_on_hand + p_quantity_delta;
    v_new_value := CASE WHEN v_new_quantity = 0 THEN 0 ELSE v_balance.inventory_value + v_value_delta END;
    IF v_new_value < 0 AND abs(v_new_value) <= 0.01 THEN v_new_value := 0; END IF;
    IF v_new_value < 0 THEN RAISE EXCEPTION 'Giá trị tồn kho không thể âm'; END IF;
    v_new_average := CASE WHEN v_new_quantity = 0 THEN 0 ELSE v_balance.average_unit_cost END;
  END IF;

  INSERT INTO public.inventory_movements (
    tenant_id, document_id, document_line_id, inventory_item_id, warehouse_id,
    location_id, movement_kind, quantity_delta, unit, unit_cost, value_delta,
    running_quantity, running_average_cost, running_inventory_value,
    transaction_at, source_movement_id, created_by
  ) VALUES (
    v_doc.tenant_id, v_doc.id, v_line.id, v_line.inventory_item_id, p_warehouse_id,
    p_location_id, p_movement_kind, p_quantity_delta, v_line.unit, v_unit_cost,
    v_value_delta, v_new_quantity, v_new_average, v_new_value,
    v_doc.transaction_at, p_source_movement_id, auth.uid()
  ) RETURNING * INTO v_movement;

  UPDATE public.inventory_balances
     SET quantity_on_hand = v_new_quantity, average_unit_cost = v_new_average,
         inventory_value = v_new_value, last_movement_at = v_doc.transaction_at,
         last_movement_sequence = v_movement.movement_sequence, updated_at = now()
   WHERE id = v_balance.id;
  RETURN v_movement;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_inventory_document(
  p_document_type text,
  p_transaction_at timestamptz,
  p_warehouse_id uuid,
  p_to_warehouse_id uuid,
  p_description text,
  p_idempotency_key text,
  p_lines jsonb,
  p_business_transaction_id uuid DEFAULT NULL,
  p_counterparty_name text DEFAULT NULL,
  p_external_reference text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := 'default';
  v_hash text;
  v_existing public.inventory_documents;
  v_doc public.inventory_documents;
  v_line jsonb;
  v_line_number integer := 0;
  v_subtotal numeric(18,2) := 0;
  v_vat numeric(18,2) := 0;
  v_line_subtotal numeric(18,2);
  v_line_vat numeric(18,2);
BEGIN
  IF NOT public.has_cost_permission('inventory_documents') THEN RAISE EXCEPTION 'Bạn không có quyền tạo phiếu kho'; END IF;
  IF p_document_type = 'ADJUSTMENT' AND NOT public.has_cost_permission('inventory_adjustment') THEN RAISE EXCEPTION 'Bạn không có quyền điều chỉnh tồn kho'; END IF;
  IF p_document_type = 'OPENING_BALANCE' AND NOT public.has_cost_permission('inventory_opening') THEN RAISE EXCEPTION 'Bạn không có quyền tạo tồn đầu kỳ'; END IF;
  IF p_document_type NOT IN ('RECEIPT', 'ISSUE', 'RETURN_IN', 'RETURN_OUT', 'TRANSFER', 'ADJUSTMENT', 'OPENING_BALANCE') THEN RAISE EXCEPTION 'Loại phiếu kho không hợp lệ'; END IF;
  IF p_description IS NULL OR length(btrim(p_description)) < 3 THEN RAISE EXCEPTION 'Nội dung phiếu kho là bắt buộc'; END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) < 8 THEN RAISE EXCEPTION 'Khóa chống trùng không hợp lệ'; END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'Phiếu kho phải có ít nhất một dòng'; END IF;
  IF NOT public.inventory_warehouse_accessible(p_warehouse_id, v_tenant) THEN RAISE EXCEPTION 'Bạn không có quyền sử dụng kho đã chọn'; END IF;
  IF p_to_warehouse_id IS NOT NULL AND NOT public.inventory_warehouse_accessible(p_to_warehouse_id, v_tenant) THEN RAISE EXCEPTION 'Bạn không có quyền sử dụng kho nhận'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) line
    GROUP BY line ->> 'inventory_item_id', COALESCE(line ->> 'location_id', ''), COALESCE(line ->> 'to_location_id', '')
    HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Một vật tư/vị trí chỉ được xuất hiện một lần trong phiếu'; END IF;
  v_hash := md5(jsonb_build_object(
    'type', p_document_type, 'transaction_at', p_transaction_at, 'warehouse', p_warehouse_id,
    'to_warehouse', p_to_warehouse_id, 'description', btrim(p_description),
    'business_transaction', p_business_transaction_id, 'counterparty', p_counterparty_name,
    'external_reference', p_external_reference, 'reason', p_reason, 'lines', p_lines
  )::text);
  PERFORM pg_advisory_xact_lock(hashtextextended('inventory-document-create:' || v_tenant || ':' || p_idempotency_key, 0));
  SELECT * INTO v_existing FROM public.inventory_documents WHERE tenant_id = v_tenant AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.idempotency_keys k
      WHERE k.tenant_id = v_tenant AND k.operation_type = 'CREATE_INVENTORY_DOCUMENT'
        AND k.business_key = p_idempotency_key AND k.payload_hash = v_hash
    ) THEN RAISE EXCEPTION 'Khóa chống trùng đã được dùng với dữ liệu khác'; END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'document_number', v_existing.document_number, 'status', v_existing.status, 'reused', true);
  END IF;
  INSERT INTO public.idempotency_keys (tenant_id, operation_type, business_key, payload_hash, actor_id)
  VALUES (v_tenant, 'CREATE_INVENTORY_DOCUMENT', p_idempotency_key, v_hash, auth.uid());

  INSERT INTO public.inventory_documents (
    tenant_id, manager_id, document_number, document_type, transaction_at,
    warehouse_id, to_warehouse_id, business_transaction_id, description,
    counterparty_name_snapshot, external_reference, reason, idempotency_key, created_by
  ) VALUES (
    v_tenant, public.current_cost_manager_id(), public.next_inventory_document_number(v_tenant, p_transaction_at),
    p_document_type, COALESCE(p_transaction_at, now()), p_warehouse_id, p_to_warehouse_id,
    p_business_transaction_id, btrim(p_description), NULLIF(btrim(p_counterparty_name), ''),
    NULLIF(btrim(p_external_reference), ''), NULLIF(btrim(p_reason), ''), p_idempotency_key, auth.uid()
  ) RETURNING * INTO v_doc;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_number := v_line_number + 1;
    INSERT INTO public.inventory_document_lines (
      tenant_id, document_id, line_number, inventory_item_id, location_id,
      to_location_id, description, quantity, unit, input_unit_cost, vat_rate,
      adjustment_direction, source_movement_id, cost_center_id, cost_object_id
    ) VALUES (
      v_tenant, v_doc.id, v_line_number, (v_line ->> 'inventory_item_id')::uuid,
      NULLIF(v_line ->> 'location_id', '')::uuid, NULLIF(v_line ->> 'to_location_id', '')::uuid,
      NULLIF(btrim(v_line ->> 'description'), ''), (v_line ->> 'quantity')::numeric,
      v_line ->> 'unit', NULLIF(v_line ->> 'input_unit_cost', '')::numeric,
      COALESCE(NULLIF(v_line ->> 'vat_rate', '')::numeric, 0),
      NULLIF(v_line ->> 'adjustment_direction', ''), NULLIF(v_line ->> 'source_movement_id', '')::uuid,
      NULLIF(v_line ->> 'cost_center_id', '')::uuid, NULLIF(v_line ->> 'cost_object_id', '')::uuid
    ) RETURNING input_subtotal, vat_amount INTO v_line_subtotal, v_line_vat;
    v_subtotal := v_subtotal + v_line_subtotal;
    v_vat := v_vat + v_line_vat;
  END LOOP;
  PERFORM set_config('app.inventory_recalculate', 'on', true);
  UPDATE public.inventory_documents
     SET subtotal = v_subtotal, vat_amount = v_vat, total_amount = v_subtotal + v_vat
   WHERE id = v_doc.id RETURNING * INTO v_doc;
  PERFORM set_config('app.inventory_recalculate', 'off', true);
  UPDATE public.idempotency_keys SET status = 'COMPLETED', result_entity_id = v_doc.id, completed_at = now()
   WHERE tenant_id = v_tenant AND operation_type = 'CREATE_INVENTORY_DOCUMENT' AND business_key = p_idempotency_key;
  RETURN jsonb_build_object('id', v_doc.id, 'document_number', v_doc.document_number, 'status', v_doc.status, 'reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_inventory_document(p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  FOR v_line IN SELECT * FROM public.inventory_document_lines WHERE document_id = v_doc.id ORDER BY line_number
  LOOP
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

CREATE OR REPLACE FUNCTION public.void_inventory_document(p_document_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc public.inventory_documents;
  v_before jsonb;
BEGIN
  IF NOT public.has_cost_permission('inventory_documents') THEN RAISE EXCEPTION 'Bạn không có quyền hủy phiếu kho'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN RAISE EXCEPTION 'Lý do hủy là bắt buộc'; END IF;
  SELECT * INTO v_doc FROM public.inventory_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiếu kho'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR v_doc.manager_id = public.current_cost_manager_id() OR v_doc.manager_id IS NULL) THEN
    RAISE EXCEPTION 'Bạn không có quyền hủy phiếu kho này';
  END IF;
  IF v_doc.status = 'CONFIRMED' THEN RAISE EXCEPTION 'Phiếu kho đã xác nhận không thể hủy; hãy tạo chứng từ sửa sai'; END IF;
  IF v_doc.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ phiếu nháp mới được hủy'; END IF;
  v_before := to_jsonb(v_doc);
  PERFORM set_config('app.inventory_transition', 'void', true);
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  UPDATE public.inventory_documents SET status = 'VOIDED', voided_by = auth.uid(), voided_at = now(), void_reason = btrim(p_reason), updated_at = now()
  WHERE id = v_doc.id RETURNING * INTO v_doc;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  PERFORM public.write_cost_audit('inventory_documents', v_doc.id, 'VOID', v_before, to_jsonb(v_doc), btrim(p_reason));
  RETURN jsonb_build_object('id', v_doc.id, 'document_number', v_doc.document_number, 'status', v_doc.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_inventory_warehouses()
RETURNS TABLE(id uuid, name text, address text, warehouse_type text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_cost_permission('inventory_view') THEN RAISE EXCEPTION 'Bạn không có quyền xem kho'; END IF;
  RETURN QUERY SELECT w.id, w.name, w.address, w.warehouse_type
  FROM public.warehouses w
  WHERE w.tenant_id = 'default' AND w.is_active
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR w.manager_id = public.current_cost_manager_id() OR w.manager_id IS NULL)
  ORDER BY w.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_inventory_business_transactions()
RETURNS TABLE(
  id uuid, transaction_number text, transaction_date date, description text,
  counterparty_name text, total_amount numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_can_cost boolean;
BEGIN
  IF NOT public.has_cost_permission('inventory_documents') THEN RAISE EXCEPTION 'Bạn không có quyền tạo phiếu kho'; END IF;
  v_can_cost := public.has_cost_permission('inventory_cost_view');
  RETURN QUERY
  SELECT bt.id, bt.transaction_number, bt.transaction_date, bt.description,
         bt.counterparty_name_snapshot,
         CASE WHEN v_can_cost THEN bt.total_amount ELSE NULL END
  FROM public.business_transactions bt
  JOIN public.transaction_types tt ON tt.id = bt.transaction_type_id AND tt.tenant_id = bt.tenant_id
  LEFT JOIN public.inventory_documents d ON d.business_transaction_id = bt.id
  WHERE bt.tenant_id = 'default' AND bt.status = 'CONFIRMED' AND tt.has_inventory_impact
    AND d.id IS NULL
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR bt.manager_id = public.current_cost_manager_id() OR bt.manager_id IS NULL)
  ORDER BY bt.transaction_date DESC, bt.created_at DESC
  LIMIT 500;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_inventory_balances()
RETURNS TABLE(
  id uuid, inventory_item_id uuid, item_code text, item_name text, item_type text,
  warehouse_id uuid, warehouse_name text, location_id uuid, location_name text,
  quantity_on_hand numeric, unit text, average_unit_cost numeric,
  inventory_value numeric, last_movement_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
  ORDER BY i.code, w.name, l.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_inventory_documents(p_limit integer DEFAULT 300)
RETURNS TABLE(
  id uuid, document_number text, document_type text, status text, transaction_at timestamptz,
  warehouse_id uuid, warehouse_name text, to_warehouse_id uuid, to_warehouse_name text,
  description text, counterparty_name text, external_reference text,
  subtotal numeric, vat_amount numeric, total_amount numeric,
  created_by uuid, confirmed_at timestamptz, voided_at timestamptz, void_reason text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_can_cost boolean;
BEGIN
  IF NOT public.has_cost_permission('inventory_view') THEN RAISE EXCEPTION 'Bạn không có quyền xem phiếu kho'; END IF;
  v_can_cost := public.has_cost_permission('inventory_cost_view');
  RETURN QUERY
  SELECT d.id, d.document_number, d.document_type, d.status, d.transaction_at,
         d.warehouse_id, w.name, d.to_warehouse_id, tw.name, d.description,
         d.counterparty_name_snapshot, d.external_reference,
         CASE WHEN v_can_cost THEN d.subtotal ELSE NULL END,
         CASE WHEN v_can_cost THEN d.vat_amount ELSE NULL END,
         CASE WHEN v_can_cost THEN d.total_amount ELSE NULL END,
         d.created_by, d.confirmed_at, d.voided_at, d.void_reason
  FROM public.inventory_documents d
  LEFT JOIN public.warehouses w ON w.id = d.warehouse_id
  LEFT JOIN public.warehouses tw ON tw.id = d.to_warehouse_id
  WHERE d.tenant_id = 'default'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR d.manager_id = public.current_cost_manager_id() OR d.manager_id IS NULL)
  ORDER BY d.transaction_at DESC, d.created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 300), 1), 1000);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_inventory_movements(p_inventory_item_id uuid DEFAULT NULL, p_limit integer DEFAULT 500)
RETURNS TABLE(
  id uuid, movement_sequence bigint, document_id uuid, document_number text,
  inventory_item_id uuid, item_code text, item_name text, warehouse_id uuid,
  warehouse_name text, movement_kind text, quantity_delta numeric, unit text,
  unit_cost numeric, value_delta numeric, running_quantity numeric,
  running_average_cost numeric, running_inventory_value numeric,
  transaction_at timestamptz, created_by uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
         m.transaction_at, m.created_by
  FROM public.inventory_movements m
  JOIN public.inventory_documents d ON d.id = m.document_id AND d.tenant_id = m.tenant_id
  JOIN public.inventory_items i ON i.id = m.inventory_item_id AND i.tenant_id = m.tenant_id
  JOIN public.warehouses w ON w.id = m.warehouse_id AND w.tenant_id = m.tenant_id
  WHERE m.tenant_id = 'default' AND (p_inventory_item_id IS NULL OR m.inventory_item_id = p_inventory_item_id)
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR d.manager_id = public.current_cost_manager_id() OR d.manager_id IS NULL)
  ORDER BY m.transaction_at DESC, m.movement_sequence DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_inventory_balances()
RETURNS TABLE(
  inventory_item_id uuid, warehouse_id uuid, location_id uuid,
  ledger_quantity numeric, balance_quantity numeric, quantity_difference numeric,
  ledger_value numeric, balance_value numeric, value_difference numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_cost_permission('inventory_audit') THEN RAISE EXCEPTION 'Bạn không có quyền đối soát kho'; END IF;
  RETURN QUERY
  WITH ledger AS (
    SELECT m.inventory_item_id, m.warehouse_id, m.location_id,
           SUM(m.quantity_delta)::numeric(18,4) AS qty,
           SUM(m.value_delta)::numeric(18,2) AS val
    FROM public.inventory_movements m WHERE m.tenant_id = 'default'
    GROUP BY m.inventory_item_id, m.warehouse_id, m.location_id
  )
  SELECT b.inventory_item_id, b.warehouse_id, b.location_id,
         COALESCE(l.qty, 0), b.quantity_on_hand, COALESCE(l.qty, 0) - b.quantity_on_hand,
         COALESCE(l.val, 0), b.inventory_value, COALESCE(l.val, 0) - b.inventory_value
  FROM public.inventory_balances b
  LEFT JOIN ledger l ON l.inventory_item_id = b.inventory_item_id AND l.warehouse_id = b.warehouse_id
    AND l.location_id IS NOT DISTINCT FROM b.location_id
  WHERE b.tenant_id = 'default';
END;
$$;

DROP TRIGGER IF EXISTS inventory_items_updated_at ON public.inventory_items;
CREATE TRIGGER inventory_items_updated_at BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS inventory_items_scope ON public.inventory_items;
CREATE TRIGGER inventory_items_scope BEFORE INSERT ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.set_inventory_master_scope();
DROP TRIGGER IF EXISTS inventory_items_legacy_scope ON public.inventory_items;
CREATE TRIGGER inventory_items_legacy_scope BEFORE INSERT OR UPDATE OF tenant_id, base_unit, legacy_source_type, legacy_source_id ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_item_legacy_source();
DROP TRIGGER IF EXISTS inventory_items_unit_guard ON public.inventory_items;
CREATE TRIGGER inventory_items_unit_guard BEFORE UPDATE OF base_unit ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_item_unit();
DROP TRIGGER IF EXISTS warehouse_locations_updated_at ON public.warehouse_locations;
CREATE TRIGGER warehouse_locations_updated_at BEFORE UPDATE ON public.warehouse_locations FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS warehouse_locations_scope ON public.warehouse_locations;
CREATE TRIGGER warehouse_locations_scope BEFORE INSERT ON public.warehouse_locations FOR EACH ROW EXECUTE FUNCTION public.set_inventory_master_scope();
DROP TRIGGER IF EXISTS warehouse_locations_validate ON public.warehouse_locations;
CREATE TRIGGER warehouse_locations_validate BEFORE INSERT OR UPDATE OF tenant_id, warehouse_id, parent_id ON public.warehouse_locations FOR EACH ROW EXECUTE FUNCTION public.validate_warehouse_location_scope();
DROP TRIGGER IF EXISTS inventory_documents_updated_at ON public.inventory_documents;
CREATE TRIGGER inventory_documents_updated_at BEFORE UPDATE ON public.inventory_documents FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS inventory_documents_validate ON public.inventory_documents;
CREATE TRIGGER inventory_documents_validate BEFORE INSERT OR UPDATE OF tenant_id, document_type, warehouse_id, to_warehouse_id, business_transaction_id ON public.inventory_documents FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_document_scope();
DROP TRIGGER IF EXISTS inventory_documents_guard ON public.inventory_documents;
CREATE TRIGGER inventory_documents_guard BEFORE UPDATE ON public.inventory_documents FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_document_update();
DROP TRIGGER IF EXISTS inventory_document_lines_updated_at ON public.inventory_document_lines;
CREATE TRIGGER inventory_document_lines_updated_at BEFORE UPDATE ON public.inventory_document_lines FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS inventory_document_lines_guard ON public.inventory_document_lines;
CREATE TRIGGER inventory_document_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON public.inventory_document_lines FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_document_line();
DROP TRIGGER IF EXISTS inventory_document_lines_prepare ON public.inventory_document_lines;
CREATE TRIGGER inventory_document_lines_prepare BEFORE INSERT OR UPDATE ON public.inventory_document_lines FOR EACH ROW EXECUTE FUNCTION public.prepare_inventory_document_line();
DROP TRIGGER IF EXISTS inventory_movements_immutable ON public.inventory_movements;
CREATE TRIGGER inventory_movements_immutable BEFORE UPDATE OR DELETE ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_movement_immutable();
DROP TRIGGER IF EXISTS inventory_balances_guard ON public.inventory_balances;
CREATE TRIGGER inventory_balances_guard BEFORE INSERT OR UPDATE OR DELETE ON public.inventory_balances FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_balance_write();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_items', 'warehouse_locations', 'inventory_documents', 'inventory_document_lines']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%s ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER audit_%s AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_cost_change()', t, t);
  END LOOP;
END;
$$;

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_document_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_items_select ON public.inventory_items FOR SELECT TO authenticated
USING (tenant_id = 'default' AND (public.has_cost_permission('inventory_view') OR public.has_cost_permission('inventory_items')));
CREATE POLICY inventory_items_insert ON public.inventory_items FOR INSERT TO authenticated
WITH CHECK (tenant_id = 'default' AND public.has_cost_permission('inventory_items'));
CREATE POLICY inventory_items_update ON public.inventory_items FOR UPDATE TO authenticated
USING (tenant_id = 'default' AND public.has_cost_permission('inventory_items'))
WITH CHECK (tenant_id = 'default' AND public.has_cost_permission('inventory_items'));

CREATE POLICY warehouse_locations_select ON public.warehouse_locations FOR SELECT TO authenticated
USING (tenant_id = 'default' AND public.has_cost_permission('inventory_view'));
CREATE POLICY warehouse_locations_insert ON public.warehouse_locations FOR INSERT TO authenticated
WITH CHECK (tenant_id = 'default' AND public.has_cost_permission('inventory_items'));
CREATE POLICY warehouse_locations_update ON public.warehouse_locations FOR UPDATE TO authenticated
USING (tenant_id = 'default' AND public.has_cost_permission('inventory_items'))
WITH CHECK (tenant_id = 'default' AND public.has_cost_permission('inventory_items'));

CREATE POLICY inventory_documents_select ON public.inventory_documents FOR SELECT TO authenticated
USING (tenant_id = 'default' AND public.has_cost_permission('inventory_view') AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR manager_id = public.current_cost_manager_id() OR manager_id IS NULL));
CREATE POLICY inventory_document_lines_select ON public.inventory_document_lines FOR SELECT TO authenticated
USING (tenant_id = 'default' AND public.has_cost_permission('inventory_view') AND EXISTS (SELECT 1 FROM public.inventory_documents d WHERE d.id = document_id));
CREATE POLICY inventory_movements_select ON public.inventory_movements FOR SELECT TO authenticated
USING (tenant_id = 'default' AND public.has_cost_permission('inventory_view') AND EXISTS (SELECT 1 FROM public.inventory_documents d WHERE d.id = document_id));
CREATE POLICY inventory_balances_select ON public.inventory_balances FOR SELECT TO authenticated
USING (tenant_id = 'default' AND public.has_cost_permission('inventory_view'));

DROP POLICY IF EXISTS audit_events_select ON public.audit_events;
CREATE POLICY audit_events_select ON public.audit_events FOR SELECT TO authenticated USING (
  tenant_id = 'default'
  AND (
    public.has_cost_permission('cost_audit')
    OR (public.has_cost_permission('inventory_audit') AND entity_type IN ('inventory_items', 'warehouse_locations', 'inventory_documents', 'inventory_document_lines'))
  )
  AND (
    (entity_type = 'business_transactions' AND EXISTS (SELECT 1 FROM public.business_transactions bt WHERE bt.id = entity_id))
    OR (entity_type IN ('business_transaction_lines', 'business_transaction_links') AND EXISTS (
      SELECT 1 FROM public.business_transactions bt
      WHERE bt.id = COALESCE(NULLIF(after_data ->> 'business_transaction_id', '')::uuid, NULLIF(before_data ->> 'business_transaction_id', '')::uuid)
    ))
    OR (entity_type = 'inventory_documents' AND EXISTS (SELECT 1 FROM public.inventory_documents d WHERE d.id = entity_id))
    OR (entity_type = 'inventory_document_lines' AND EXISTS (
      SELECT 1 FROM public.inventory_documents d
      WHERE d.id = COALESCE(NULLIF(after_data ->> 'document_id', '')::uuid, NULLIF(before_data ->> 'document_id', '')::uuid)
    ))
    OR entity_type NOT IN ('business_transactions', 'business_transaction_lines', 'business_transaction_links', 'inventory_documents', 'inventory_document_lines')
  )
);

REVOKE ALL ON public.inventory_documents, public.inventory_document_lines, public.inventory_movements, public.inventory_balances FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.inventory_items, public.warehouse_locations TO authenticated;
GRANT SELECT ON public.audit_events TO authenticated;

REVOKE ALL ON FUNCTION public.validate_inventory_item_legacy_source() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_inventory_item_unit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_inventory_master_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_warehouse_location_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_inventory_document_number(text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inventory_warehouse_accessible(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_inventory_document_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_inventory_document_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_inventory_document_line() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_inventory_document_line() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_inventory_movement_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_inventory_balance_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_inventory_movement(uuid, uuid, uuid, uuid, text, numeric, numeric, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_inventory_document(text, timestamptz, uuid, uuid, text, text, jsonb, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_inventory_document(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.void_inventory_document(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_inventory_warehouses() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_inventory_business_transactions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_inventory_balances() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_inventory_documents(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_inventory_movements(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_inventory_balances() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_inventory_document(text, timestamptz, uuid, uuid, text, text, jsonb, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_inventory_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_inventory_document(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_inventory_warehouses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_inventory_business_transactions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_inventory_balances() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_inventory_documents(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_inventory_movements(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_inventory_balances() TO authenticated;
