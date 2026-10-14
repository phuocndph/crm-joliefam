-- Production workflow MVP hardening. Additive after 20260913100000.

BEGIN;

-- The MVP tables were created before tenant-aware constraints existed. Backfill
-- the tenant from the real production order and keep the original table names.
ALTER TABLE public.production_order_items ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE public.production_batches ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE public.production_stage_events ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE public.production_fabric_allocations ADD COLUMN IF NOT EXISTS tenant_id text;

UPDATE public.production_order_items i
SET tenant_id = p.tenant_id
FROM public.production_orders p
WHERE p.id = i.production_order_id
  AND i.tenant_id IS DISTINCT FROM p.tenant_id;
UPDATE public.production_batches b
SET tenant_id = p.tenant_id
FROM public.production_orders p
WHERE p.id = b.production_order_id
  AND b.tenant_id IS DISTINCT FROM p.tenant_id;
UPDATE public.production_stage_events e
SET tenant_id = p.tenant_id
FROM public.production_orders p
WHERE p.id = e.production_order_id
  AND e.tenant_id IS DISTINCT FROM p.tenant_id;
UPDATE public.production_fabric_allocations a
SET tenant_id = p.tenant_id
FROM public.production_orders p
WHERE p.id = a.production_order_id
  AND a.tenant_id IS DISTINCT FROM p.tenant_id;

ALTER TABLE public.production_order_items ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE public.production_batches ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE public.production_stage_events ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE public.production_fabric_allocations ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE public.production_order_items ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.production_batches ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.production_stage_events ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.production_fabric_allocations ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.production_order_items ADD COLUMN IF NOT EXISTS product_sku_snapshot text;
ALTER TABLE public.production_order_items ADD COLUMN IF NOT EXISTS product_name_snapshot text;
ALTER TABLE public.production_order_items ADD COLUMN IF NOT EXISTS source_item_snapshot jsonb;
ALTER TABLE public.production_order_items ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.production_batches ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.production_stage_events ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.production_fabric_allocations ADD COLUMN IF NOT EXISTS idempotency_key text;

UPDATE public.production_order_items i
SET product_sku_snapshot = p.sku,
    product_name_snapshot = p.name
FROM public.products p
WHERE p.id = i.product_id
  AND (i.product_sku_snapshot IS NULL OR i.product_name_snapshot IS NULL);

-- Composite parent keys make cross-tenant foreign keys enforceable even though
-- the legacy parent primary keys remain globally unique UUIDs.
CREATE UNIQUE INDEX IF NOT EXISTS production_orders_tenant_id_unique
  ON public.production_orders (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS production_order_items_tenant_id_unique
  ON public.production_order_items (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS production_batches_tenant_id_unique
  ON public.production_batches (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_id_unique
  ON public.products (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS production_workers_tenant_id_unique
  ON public.production_workers (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_tenant_id_unique
  ON public.inventory_items (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS fabric_variants_tenant_id_unique
  ON public.fabric_variants (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS warehouses_tenant_id_unique
  ON public.warehouses (tenant_id, id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_order_items_order_tenant_fkey') THEN
    ALTER TABLE public.production_order_items
      ADD CONSTRAINT production_order_items_order_tenant_fkey
      FOREIGN KEY (tenant_id, production_order_id)
      REFERENCES public.production_orders (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_order_items_product_tenant_fkey') THEN
    ALTER TABLE public.production_order_items
      ADD CONSTRAINT production_order_items_product_tenant_fkey
      FOREIGN KEY (tenant_id, product_id)
      REFERENCES public.products (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_order_items_fabric_tenant_fkey') THEN
    ALTER TABLE public.production_order_items
      ADD CONSTRAINT production_order_items_fabric_tenant_fkey
      FOREIGN KEY (tenant_id, fabric_variant_id)
      REFERENCES public.fabric_variants (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_batches_order_tenant_fkey') THEN
    ALTER TABLE public.production_batches
      ADD CONSTRAINT production_batches_order_tenant_fkey
      FOREIGN KEY (tenant_id, production_order_id)
      REFERENCES public.production_orders (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_stage_events_order_tenant_fkey') THEN
    ALTER TABLE public.production_stage_events
      ADD CONSTRAINT production_stage_events_order_tenant_fkey
      FOREIGN KEY (tenant_id, production_order_id)
      REFERENCES public.production_orders (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_stage_events_batch_tenant_fkey') THEN
    ALTER TABLE public.production_stage_events
      ADD CONSTRAINT production_stage_events_batch_tenant_fkey
      FOREIGN KEY (tenant_id, production_batch_id)
      REFERENCES public.production_batches (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_stage_events_item_tenant_fkey') THEN
    ALTER TABLE public.production_stage_events
      ADD CONSTRAINT production_stage_events_item_tenant_fkey
      FOREIGN KEY (tenant_id, order_item_id)
      REFERENCES public.production_order_items (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_stage_events_worker_tenant_fkey') THEN
    ALTER TABLE public.production_stage_events
      ADD CONSTRAINT production_stage_events_worker_tenant_fkey
      FOREIGN KEY (tenant_id, worker_id)
      REFERENCES public.production_workers (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_stage_events_approved_by_fkey') THEN
    ALTER TABLE public.production_stage_events
      ADD CONSTRAINT production_stage_events_approved_by_fkey
      FOREIGN KEY (approved_by) REFERENCES auth.users (id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_fabric_allocations_order_tenant_fkey') THEN
    ALTER TABLE public.production_fabric_allocations
      ADD CONSTRAINT production_fabric_allocations_order_tenant_fkey
      FOREIGN KEY (tenant_id, production_order_id)
      REFERENCES public.production_orders (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_fabric_allocations_batch_tenant_fkey') THEN
    ALTER TABLE public.production_fabric_allocations
      ADD CONSTRAINT production_fabric_allocations_batch_tenant_fkey
      FOREIGN KEY (tenant_id, production_batch_id)
      REFERENCES public.production_batches (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_fabric_allocations_fabric_tenant_fkey') THEN
    ALTER TABLE public.production_fabric_allocations
      ADD CONSTRAINT production_fabric_allocations_fabric_tenant_fkey
      FOREIGN KEY (tenant_id, fabric_variant_id)
      REFERENCES public.fabric_variants (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_fabric_allocations_inventory_tenant_fkey') THEN
    ALTER TABLE public.production_fabric_allocations
      ADD CONSTRAINT production_fabric_allocations_inventory_tenant_fkey
      FOREIGN KEY (tenant_id, inventory_item_id)
      REFERENCES public.inventory_items (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_fabric_allocations_warehouse_tenant_fkey') THEN
    ALTER TABLE public.production_fabric_allocations
      ADD CONSTRAINT production_fabric_allocations_warehouse_tenant_fkey
      FOREIGN KEY (tenant_id, warehouse_id)
      REFERENCES public.warehouses (tenant_id, id) NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS production_batches_idempotency_unique
  ON public.production_batches (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS production_stage_events_idempotency_unique
  ON public.production_stage_events (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS production_fabric_allocations_idempotency_unique
  ON public.production_fabric_allocations (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Group request records make a multi-order create retry-safe without placing a
-- single idempotency key on every generated production order.
CREATE TABLE IF NOT EXISTS public.production_order_group_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  idempotency_key text NOT NULL CHECK (btrim(idempotency_key) <> ''),
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  result_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result_payload) = 'object'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS production_order_group_requests_tenant_id_unique
  ON public.production_order_group_requests (tenant_id, id);
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS production_order_group_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_orders_group_tenant_fkey') THEN
    ALTER TABLE public.production_orders
      ADD CONSTRAINT production_orders_group_tenant_fkey
      FOREIGN KEY (tenant_id, production_order_group_id)
      REFERENCES public.production_order_group_requests (tenant_id, id) NOT VALID;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS production_orders_group_idx
  ON public.production_orders (tenant_id, production_order_group_id)
  WHERE production_order_group_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_production_workflow_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_new jsonb := to_jsonb(NEW);
  v_order_id uuid := NULLIF(v_new ->> 'production_order_id', '')::uuid;
  v_batch_id uuid := NULLIF(v_new ->> 'production_batch_id', '')::uuid;
  v_item_id uuid := NULLIF(v_new ->> 'order_item_id', '')::uuid;
  v_worker_id uuid := NULLIF(v_new ->> 'worker_id', '')::uuid;
  v_product_id uuid := NULLIF(v_new ->> 'product_id', '')::uuid;
  v_fabric_id uuid := NULLIF(v_new ->> 'fabric_variant_id', '')::uuid;
  v_inventory_id uuid := NULLIF(v_new ->> 'inventory_item_id', '')::uuid;
  v_warehouse_id uuid := NULLIF(v_new ->> 'warehouse_id', '')::uuid;
  v_tenant text := v_new ->> 'tenant_id';
BEGIN
  IF v_tenant IS NULL OR btrim(v_tenant) = '' THEN
    RAISE EXCEPTION 'Tenant của dữ liệu sản xuất không hợp lệ';
  END IF;
  IF v_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_orders p WHERE p.id = v_order_id AND p.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Lệnh sản xuất không cùng phạm vi dữ liệu';
  END IF;
  IF TG_TABLE_NAME = 'production_order_items' THEN
    IF v_product_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.products p WHERE p.id = v_product_id AND p.tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'Sản phẩm dòng lệnh không cùng phạm vi dữ liệu';
    END IF;
    IF v_fabric_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.fabric_variants f
      WHERE f.id = v_fabric_id AND f.tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'Vải dòng lệnh không cùng phạm vi dữ liệu';
    END IF;
  ELSIF TG_TABLE_NAME = 'production_batches' THEN
    IF v_order_id IS NULL THEN RAISE EXCEPTION 'Batch phải thuộc một lệnh sản xuất'; END IF;
  ELSIF TG_TABLE_NAME = 'production_stage_events' THEN
    IF v_batch_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.production_batches b
      WHERE b.id = v_batch_id AND b.tenant_id = v_tenant AND b.production_order_id = v_order_id
    ) THEN
      RAISE EXCEPTION 'Batch của sự kiện không thuộc lệnh sản xuất';
    END IF;
    IF v_item_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.production_order_items i
      WHERE i.id = v_item_id AND i.tenant_id = v_tenant AND i.production_order_id = v_order_id
    ) THEN
      RAISE EXCEPTION 'Dòng sản phẩm của sự kiện không thuộc lệnh sản xuất';
    END IF;
    IF v_worker_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.production_workers w WHERE w.id = v_worker_id AND w.tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'Công nhân của sự kiện không cùng phạm vi dữ liệu';
    END IF;
  ELSIF TG_TABLE_NAME = 'production_fabric_allocations' THEN
    IF v_batch_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.production_batches b
      WHERE b.id = v_batch_id AND b.tenant_id = v_tenant AND b.production_order_id = v_order_id
    ) THEN
      RAISE EXCEPTION 'Batch cấp vải không thuộc lệnh sản xuất';
    END IF;
    IF v_fabric_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.fabric_variants f
      WHERE f.id = v_fabric_id AND f.tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'Vải cấp phát không cùng phạm vi dữ liệu';
    END IF;
    IF v_inventory_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.inventory_items i WHERE i.id = v_inventory_id AND i.tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'Vật tư cấp phát không cùng phạm vi dữ liệu';
    END IF;
    IF v_warehouse_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.warehouses w WHERE w.id = v_warehouse_id AND w.tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'Kho cấp phát không cùng phạm vi dữ liệu';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_production_workflow_invariants()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_new jsonb := to_jsonb(NEW); v_received numeric; v_outputs numeric;
BEGIN
  IF TG_TABLE_NAME = 'production_order_items' THEN
    IF COALESCE((v_new ->> 'planned_quantity')::numeric, 0) <= 0
       OR COALESCE((v_new ->> 'completed_quantity')::numeric, 0) < 0
       OR (v_new ->> 'completed_quantity')::numeric > (v_new ->> 'planned_quantity')::numeric THEN
      RAISE EXCEPTION 'Số lượng dòng lệnh không hợp lệ';
    END IF;
  ELSIF TG_TABLE_NAME = 'production_stage_events' THEN
    v_received := COALESCE((v_new ->> 'quantity_received')::numeric, 0);
    v_outputs := COALESCE((v_new ->> 'quantity_good')::numeric, 0)
      + COALESCE((v_new ->> 'quantity_rework')::numeric, 0)
      + COALESCE((v_new ->> 'quantity_remake')::numeric, 0)
      + COALESCE((v_new ->> 'quantity_defect')::numeric, 0);
    IF v_outputs > v_received THEN RAISE EXCEPTION 'Sản lượng công đoạn vượt số lượng nhận'; END IF;
  ELSIF TG_TABLE_NAME = 'production_fabric_allocations' THEN
    IF COALESCE((v_new ->> 'returned_quantity')::numeric, 0)
       + COALESCE((v_new ->> 'consumed_quantity')::numeric, 0)
       + COALESCE((v_new ->> 'scrap_quantity')::numeric, 0)
       > COALESCE((v_new ->> 'issued_quantity')::numeric, 0) THEN
      RAISE EXCEPTION 'Số lượng sử dụng/hoàn trả vải vượt số lượng đã cấp';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_production_workflow_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  IF current_setting('app.production_workflow_transition', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_TABLE_NAME = 'production_order_items' THEN
    SELECT status INTO v_status FROM public.production_orders WHERE id = OLD.production_order_id;
    IF v_status IN ('RELEASED','IN_PROGRESS','COMPLETED','CANCELLED','ON_HOLD') THEN
      RAISE EXCEPTION 'Không được sửa dòng lệnh sau khi phát hành';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'Dữ liệu workflow sản xuất là append-only; hãy dùng nghiệp vụ đảo/điều chỉnh';
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_production_workflow_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.write_cost_audit(
    TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    TG_OP,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    NULL
  );
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS production_order_items_scope ON public.production_order_items;
CREATE TRIGGER production_order_items_scope BEFORE INSERT OR UPDATE ON public.production_order_items
FOR EACH ROW EXECUTE FUNCTION public.validate_production_workflow_scope();
DROP TRIGGER IF EXISTS production_order_items_invariants ON public.production_order_items;
CREATE TRIGGER production_order_items_invariants BEFORE INSERT OR UPDATE ON public.production_order_items
FOR EACH ROW EXECUTE FUNCTION public.validate_production_workflow_invariants();
DROP TRIGGER IF EXISTS production_order_items_guard ON public.production_order_items;
CREATE TRIGGER production_order_items_guard BEFORE UPDATE OR DELETE ON public.production_order_items
FOR EACH ROW EXECUTE FUNCTION public.guard_production_workflow_mutation();
DROP TRIGGER IF EXISTS production_order_items_audit ON public.production_order_items;
CREATE TRIGGER production_order_items_audit AFTER INSERT OR UPDATE OR DELETE ON public.production_order_items
FOR EACH ROW EXECUTE FUNCTION public.audit_production_workflow_row();

DROP TRIGGER IF EXISTS production_batches_scope ON public.production_batches;
CREATE TRIGGER production_batches_scope BEFORE INSERT OR UPDATE ON public.production_batches
FOR EACH ROW EXECUTE FUNCTION public.validate_production_workflow_scope();
DROP TRIGGER IF EXISTS production_batches_guard ON public.production_batches;
CREATE TRIGGER production_batches_guard BEFORE UPDATE OR DELETE ON public.production_batches
FOR EACH ROW EXECUTE FUNCTION public.guard_production_workflow_mutation();
DROP TRIGGER IF EXISTS production_batches_audit ON public.production_batches;
CREATE TRIGGER production_batches_audit AFTER INSERT OR UPDATE OR DELETE ON public.production_batches
FOR EACH ROW EXECUTE FUNCTION public.audit_production_workflow_row();

DROP TRIGGER IF EXISTS production_stage_events_scope ON public.production_stage_events;
CREATE TRIGGER production_stage_events_scope BEFORE INSERT OR UPDATE ON public.production_stage_events
FOR EACH ROW EXECUTE FUNCTION public.validate_production_workflow_scope();
DROP TRIGGER IF EXISTS production_stage_events_invariants ON public.production_stage_events;
CREATE TRIGGER production_stage_events_invariants BEFORE INSERT OR UPDATE ON public.production_stage_events
FOR EACH ROW EXECUTE FUNCTION public.validate_production_workflow_invariants();
DROP TRIGGER IF EXISTS production_stage_events_guard ON public.production_stage_events;
CREATE TRIGGER production_stage_events_guard BEFORE UPDATE OR DELETE ON public.production_stage_events
FOR EACH ROW EXECUTE FUNCTION public.guard_production_workflow_mutation();
DROP TRIGGER IF EXISTS production_stage_events_audit ON public.production_stage_events;
CREATE TRIGGER production_stage_events_audit AFTER INSERT OR UPDATE OR DELETE ON public.production_stage_events
FOR EACH ROW EXECUTE FUNCTION public.audit_production_workflow_row();

DROP TRIGGER IF EXISTS production_fabric_allocations_scope ON public.production_fabric_allocations;
CREATE TRIGGER production_fabric_allocations_scope BEFORE INSERT OR UPDATE ON public.production_fabric_allocations
FOR EACH ROW EXECUTE FUNCTION public.validate_production_workflow_scope();
DROP TRIGGER IF EXISTS production_fabric_allocations_invariants ON public.production_fabric_allocations;
CREATE TRIGGER production_fabric_allocations_invariants BEFORE INSERT OR UPDATE ON public.production_fabric_allocations
FOR EACH ROW EXECUTE FUNCTION public.validate_production_workflow_invariants();
DROP TRIGGER IF EXISTS production_fabric_allocations_guard ON public.production_fabric_allocations;
CREATE TRIGGER production_fabric_allocations_guard BEFORE UPDATE OR DELETE ON public.production_fabric_allocations
FOR EACH ROW EXECUTE FUNCTION public.guard_production_workflow_mutation();
DROP TRIGGER IF EXISTS production_fabric_allocations_audit ON public.production_fabric_allocations;
CREATE TRIGGER production_fabric_allocations_audit AFTER INSERT OR UPDATE OR DELETE ON public.production_fabric_allocations
FOR EACH ROW EXECUTE FUNCTION public.audit_production_workflow_row();

-- Atomic group creation from real orders, products, and fabric variants.
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
  v_quantity numeric;
  v_source_type text;
  v_start date;
  v_end date;
  v_num text;
  v_order public.production_orders;
  v_item public.production_order_items;
  v_product record;
  v_idx integer := 0;
BEGIN
  IF NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền tạo nhóm lệnh sản xuất';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Payload nhóm lệnh sản xuất không hợp lệ';
  END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'Thiếu khóa idempotency của nhóm lệnh';
  END IF;
  v_lines := p_payload -> 'lines';
  IF v_lines IS NULL OR jsonb_typeof(v_lines) <> 'array' OR jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'Nhóm lệnh phải có ít nhất một dòng sản phẩm';
  END IF;
  IF jsonb_array_length(v_lines) > 100 THEN
    RAISE EXCEPTION 'Nhóm lệnh không được vượt quá 100 dòng';
  END IF;

  SELECT * INTO v_existing
  FROM public.production_order_group_requests
  WHERE tenant_id = v_tenant AND idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_payload <> p_payload THEN
      RAISE EXCEPTION 'Khóa idempotency đã được dùng cho payload khác';
    END IF;
    RETURN v_existing.result_payload || jsonb_build_object('reused', true);
  END IF;

  BEGIN
    INSERT INTO public.production_order_group_requests (tenant_id, idempotency_key, request_payload, created_by)
    VALUES (v_tenant, btrim(p_idempotency_key), p_payload, auth.uid())
    RETURNING * INTO v_group;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.production_order_group_requests
    WHERE tenant_id = v_tenant AND idempotency_key = btrim(p_idempotency_key)
    FOR UPDATE;
    IF v_existing.request_payload <> p_payload THEN
      RAISE EXCEPTION 'Khóa idempotency đã được dùng cho payload khác';
    END IF;
    RETURN v_existing.result_payload || jsonb_build_object('reused', true);
  END;

  v_order_id := NULLIF(p_payload ->> 'order_id', '')::uuid;
  IF v_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = v_order_id AND o.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Đơn hàng nguồn không tồn tại hoặc không cùng phạm vi dữ liệu';
  END IF;
  v_source_type := COALESCE(NULLIF(p_payload ->> 'source_type', ''), CASE WHEN v_order_id IS NULL THEN 'MANUAL' ELSE 'FROM_ORDER' END);
  IF v_source_type NOT IN ('MANUAL','FROM_ORDER','FROM_STOCK_PLAN') THEN
    RAISE EXCEPTION 'Nguồn lệnh sản xuất không hợp lệ';
  END IF;
  IF v_source_type = 'FROM_ORDER' AND v_order_id IS NULL THEN
    RAISE EXCEPTION 'Nguồn từ đơn hàng phải chọn đơn hàng thật';
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
    IF NOT FOUND THEN RAISE EXCEPTION 'Sản phẩm dòng % không tồn tại hoặc không cùng phạm vi dữ liệu', v_idx; END IF;
    v_fabric_id := NULLIF(v_line ->> 'fabric_variant_id', '')::uuid;
    IF v_fabric_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.fabric_variants f
      WHERE f.id = v_fabric_id AND f.tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'Vải dòng % không tồn tại hoặc không cùng phạm vi dữ liệu', v_idx;
    END IF;
    v_source_item_id := NULLIF(v_line ->> 'source_order_item_id', '')::uuid;
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
      tenant_id, production_order_id, source_order_item_id, source_item_snapshot,
      product_id, product_sku_snapshot, product_name_snapshot, fabric_variant_id,
      color, size, dimensions, planned_quantity, notes
    ) VALUES (
      v_tenant, v_order.id, v_source_item_id, v_line -> 'source_item_snapshot',
      v_product_id, v_product.sku, v_product.name, v_fabric_id,
      NULLIF(v_line ->> 'color', ''), NULLIF(v_line ->> 'size', ''),
      NULLIF(v_line ->> 'dimensions', ''), v_quantity, NULLIF(v_line ->> 'notes', '')
    ) RETURNING * INTO v_item;
    v_orders := v_orders || jsonb_build_array(jsonb_build_object(
      'id', v_order.id, 'production_order_number', v_order.production_order_number,
      'production_order_group_id', v_group.id, 'product_id', v_product_id,
      'quantity_planned', v_quantity, 'status', v_order.status,
      'order_item_id', v_item.id, 'fabric_variant_id', v_fabric_id,
      'color', NULLIF(v_line ->> 'color', ''), 'size', NULLIF(v_line ->> 'size', ''),
      'dimensions', NULLIF(v_line ->> 'dimensions', '')
    ));
  END LOOP;

  v_result := jsonb_build_object(
    'group_id', v_group.id,
    'idempotency_key', v_group.idempotency_key,
    'reused', false,
    'orders', v_orders,
    'order_count', jsonb_array_length(v_orders)
  );
  UPDATE public.production_order_group_requests
  SET result_payload = v_result
  WHERE id = v_group.id;
  PERFORM public.write_cost_audit('production_order_group_requests', v_group.id, 'CREATE', NULL, v_result, NULL);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_production_source_orders()
RETURNS TABLE (
  id uuid, order_number text, display_order_number text, status text,
  delivery_date date, total_amount numeric, items jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_production_permission('production_view') AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem đơn hàng nguồn sản xuất';
  END IF;
  RETURN QUERY
  SELECT o.id,
    NULLIF(to_jsonb(o) ->> 'order_number', ''),
    NULLIF(to_jsonb(o) ->> 'display_order_number', ''),
    COALESCE(NULLIF(to_jsonb(o) ->> 'status', ''), 'UNKNOWN'),
    CASE WHEN (to_jsonb(o) ->> 'delivery_date') ~ '^\d{4}-\d{2}-\d{2}'
      THEN (to_jsonb(o) ->> 'delivery_date')::date ELSE NULL END,
    NULLIF(to_jsonb(o) ->> 'total_amount', '')::numeric,
    COALESCE(to_jsonb(o) -> 'items', '[]'::jsonb)
  FROM public.orders o
  WHERE o.tenant_id = public.require_default_tenant()
    AND COALESCE(to_jsonb(o) ->> 'status', '') NOT IN ('CANCELLED','CANCELED')
  ORDER BY COALESCE(
    CASE WHEN (to_jsonb(o) ->> 'delivery_date') ~ '^\d{4}-\d{2}-\d{2}'
      THEN (to_jsonb(o) ->> 'delivery_date')::date ELSE NULL END,
    '9999-12-31'::date
  ), (to_jsonb(o) ->> 'created_at') DESC NULLS LAST
  LIMIT 500;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_production_fabric_variants(p_search text DEFAULT NULL)
RETURNS TABLE (
  id uuid, variant_name text, color text, width_code text, weight text,
  unit text, fabric_type_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_production_permission('production_view') AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem danh mục vải sản xuất';
  END IF;
  RETURN QUERY
  SELECT f.id, f.variant_name, to_jsonb(f) ->> 'color',
    to_jsonb(f) ->> 'width_code', to_jsonb(f) ->> 'weight', f.unit, NULL::text
  FROM public.fabric_variants f
  WHERE f.tenant_id = public.require_default_tenant()
    AND (NULLIF(btrim(p_search), '') IS NULL OR concat_ws(' ', f.variant_name,
      to_jsonb(f) ->> 'color', to_jsonb(f) ->> 'width_code', to_jsonb(f) ->> 'weight') ILIKE '%' || btrim(p_search) || '%')
  ORDER BY f.variant_name, to_jsonb(f) ->> 'color', to_jsonb(f) ->> 'width_code'
  LIMIT 500;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_production_order_items(p_production_order_id uuid)
RETURNS TABLE (
  id uuid, production_order_id uuid, product_id uuid, product_sku text, product_name text,
  fabric_variant_id uuid, fabric_variant_name text, color text, size text, dimensions text,
  planned_quantity numeric, completed_quantity numeric, notes text, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_production_permission('production_view') AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem dòng lệnh sản xuất';
  END IF;
  RETURN QUERY
  SELECT i.id, i.production_order_id, i.product_id,
    COALESCE(i.product_sku_snapshot, p.sku), COALESCE(i.product_name_snapshot, p.name),
    i.fabric_variant_id, f.variant_name, i.color, i.size, i.dimensions,
    i.planned_quantity, i.completed_quantity, i.notes, i.created_at
  FROM public.production_order_items i
  JOIN public.products p ON p.id = i.product_id AND p.tenant_id = i.tenant_id
  LEFT JOIN public.fabric_variants f ON f.id = i.fabric_variant_id AND f.tenant_id = i.tenant_id
  WHERE i.tenant_id = public.require_default_tenant() AND i.production_order_id = p_production_order_id
  ORDER BY i.created_at, i.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_production_batches(p_production_order_id uuid)
RETURNS SETOF public.production_batches
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.* FROM public.production_batches b
  WHERE b.tenant_id = public.require_default_tenant() AND b.production_order_id = p_production_order_id
  ORDER BY b.created_at, b.id
$$;

CREATE OR REPLACE FUNCTION public.list_production_stage_events(p_production_order_id uuid)
RETURNS SETOF public.production_stage_events
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.* FROM public.production_stage_events e
  WHERE e.tenant_id = public.require_default_tenant() AND e.production_order_id = p_production_order_id
  ORDER BY e.occurred_at, e.created_at, e.id
$$;

CREATE OR REPLACE FUNCTION public.list_production_fabric_allocations(p_production_order_id uuid)
RETURNS SETOF public.production_fabric_allocations
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.* FROM public.production_fabric_allocations a
  WHERE a.tenant_id = public.require_default_tenant() AND a.production_order_id = p_production_order_id
  ORDER BY a.created_at, a.id
$$;

ALTER TABLE public.production_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_stage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_fabric_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_group_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS production_order_items_select ON public.production_order_items;
CREATE POLICY production_order_items_select ON public.production_order_items FOR SELECT TO authenticated
  USING (tenant_id = public.require_default_tenant() AND public.has_production_permission('production_view'));
DROP POLICY IF EXISTS production_batches_select ON public.production_batches;
CREATE POLICY production_batches_select ON public.production_batches FOR SELECT TO authenticated
  USING (tenant_id = public.require_default_tenant() AND public.has_production_permission('production_view'));
DROP POLICY IF EXISTS production_stage_events_select ON public.production_stage_events;
CREATE POLICY production_stage_events_select ON public.production_stage_events FOR SELECT TO authenticated
  USING (tenant_id = public.require_default_tenant() AND public.has_production_permission('production_view'));
DROP POLICY IF EXISTS production_fabric_allocations_select ON public.production_fabric_allocations;
CREATE POLICY production_fabric_allocations_select ON public.production_fabric_allocations FOR SELECT TO authenticated
  USING (tenant_id = public.require_default_tenant() AND public.has_production_permission('production_view'));

REVOKE ALL ON public.production_order_items, public.production_batches,
  public.production_stage_events, public.production_fabric_allocations,
  public.production_order_group_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.production_order_items, public.production_batches,
  public.production_stage_events, public.production_fabric_allocations TO authenticated;
REVOKE ALL ON FUNCTION public.create_production_order_group(jsonb,text),
  public.list_production_source_orders(), public.list_production_fabric_variants(text),
  public.list_production_order_items(uuid), public.list_production_batches(uuid),
  public.list_production_stage_events(uuid), public.list_production_fabric_allocations(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_production_order_group(jsonb,text),
  public.list_production_source_orders(), public.list_production_fabric_variants(text),
  public.list_production_order_items(uuid), public.list_production_batches(uuid),
  public.list_production_stage_events(uuid), public.list_production_fabric_allocations(uuid)
TO authenticated;

COMMIT;
