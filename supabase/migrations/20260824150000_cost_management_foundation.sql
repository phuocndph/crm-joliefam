-- Sprint 1: additive cost-management foundation.
-- This migration intentionally does not modify legacy financial tables.

CREATE TABLE IF NOT EXISTS public.cost_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  code text NOT NULL CHECK (btrim(code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text,
  parent_id uuid REFERENCES public.cost_categories(id) ON DELETE RESTRICT,
  level integer NOT NULL DEFAULT 0 CHECK (level >= 0),
  is_active boolean NOT NULL DEFAULT true,
  default_behavior text NOT NULL DEFAULT 'VARIABLE' CHECK (default_behavior IN ('FIXED', 'VARIABLE', 'MIXED')),
  default_traceability text NOT NULL DEFAULT 'INDIRECT' CHECK (default_traceability IN ('DIRECT', 'INDIRECT', 'SHARED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE IF NOT EXISTS public.cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  code text NOT NULL CHECK (btrim(code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  parent_id uuid REFERENCES public.cost_centers(id) ON DELETE RESTRICT,
  center_type text NOT NULL DEFAULT 'SERVICE' CHECK (center_type IN ('PRODUCTION', 'SERVICE', 'SALES', 'ADMIN', 'OTHER')),
  manager_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  manager_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE IF NOT EXISTS public.cost_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  object_type text NOT NULL CHECK (object_type IN ('PRODUCT', 'ORDER', 'CUSTOMER', 'COST_CENTER', 'PRODUCTION_ORDER', 'MARKETING_CAMPAIGN', 'OTHER')),
  source_id uuid,
  display_code text NOT NULL CHECK (btrim(display_code) <> ''),
  display_name text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED', 'INACTIVE')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, object_type, display_code)
);

CREATE UNIQUE INDEX IF NOT EXISTS cost_objects_source_unique
  ON public.cost_objects (tenant_id, object_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.transaction_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  code text NOT NULL CHECK (btrim(code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text,
  is_system boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  has_cash_impact boolean NOT NULL DEFAULT false,
  has_inventory_impact boolean NOT NULL DEFAULT false,
  can_create_cost boolean NOT NULL DEFAULT false,
  can_create_asset boolean NOT NULL DEFAULT false,
  default_effect_kind text NOT NULL DEFAULT 'COST' CHECK (default_effect_kind IN ('CASH', 'RECEIVABLE', 'PAYABLE', 'INVENTORY', 'ASSET', 'COST', 'REVENUE', 'TAX', 'LIABILITY')),
  default_direction text NOT NULL DEFAULT 'DEBIT' CHECK (default_direction IN ('DEBIT', 'CREDIT')),
  requires_counterparty boolean NOT NULL DEFAULT false,
  requires_cost_center boolean NOT NULL DEFAULT false,
  requires_cost_object boolean NOT NULL DEFAULT false,
  default_cost_category_id uuid REFERENCES public.cost_categories(id) ON DELETE RESTRICT,
  default_cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE RESTRICT,
  default_cost_behavior text CHECK (default_cost_behavior IN ('FIXED', 'VARIABLE', 'MIXED')),
  default_traceability text CHECK (default_traceability IN ('DIRECT', 'INDIRECT', 'SHARED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'CONFIRM', 'VOID')),
  before_data jsonb,
  after_data jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  source text NOT NULL DEFAULT 'cost-management',
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  operation_type text NOT NULL,
  business_key text NOT NULL,
  payload_hash text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
  result_entity_id uuid,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, operation_type, business_key)
);

CREATE TABLE IF NOT EXISTS public.business_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  manager_id text,
  transaction_number text NOT NULL CHECK (btrim(transaction_number) <> ''),
  transaction_type_id uuid NOT NULL REFERENCES public.transaction_types(id) ON DELETE RESTRICT,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL CHECK (btrim(description) <> ''),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CONFIRMED', 'VOIDED')),
  counterparty_type text,
  counterparty_id uuid,
  counterparty_name_snapshot text,
  currency_code text NOT NULL DEFAULT 'VND' CHECK (currency_code ~ '^[A-Z]{3}$'),
  subtotal numeric(18,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  vat_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  total_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  payment_status text CHECK (payment_status IN ('UNPAID', 'PARTIAL', 'PAID', 'NOT_APPLICABLE')),
  source_type text,
  source_id uuid,
  external_reference text,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) >= 8),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  voided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  UNIQUE (tenant_id, transaction_number),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.business_transaction_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  business_transaction_id uuid NOT NULL REFERENCES public.business_transactions(id) ON DELETE CASCADE,
  line_number integer NOT NULL CHECK (line_number > 0),
  description text NOT NULL CHECK (btrim(description) <> ''),
  quantity numeric(18,4) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit text NOT NULL DEFAULT 'unit' CHECK (btrim(unit) <> ''),
  unit_price numeric(18,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  subtotal numeric(18,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  vat_rate numeric(7,4) NOT NULL DEFAULT 0 CHECK (vat_rate >= 0 AND vat_rate <= 100),
  vat_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  total_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  effect_kind text NOT NULL DEFAULT 'COST' CHECK (effect_kind IN ('CASH', 'RECEIVABLE', 'PAYABLE', 'INVENTORY', 'ASSET', 'COST', 'REVENUE', 'TAX', 'LIABILITY')),
  direction text NOT NULL DEFAULT 'DEBIT' CHECK (direction IN ('DEBIT', 'CREDIT')),
  cost_category_id uuid REFERENCES public.cost_categories(id) ON DELETE RESTRICT,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE RESTRICT,
  cost_object_id uuid REFERENCES public.cost_objects(id) ON DELETE RESTRICT,
  cost_behavior text CHECK (cost_behavior IN ('FIXED', 'VARIABLE', 'MIXED')),
  traceability text CHECK (traceability IN ('DIRECT', 'INDIRECT', 'SHARED')),
  classification_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_transaction_id, line_number)
);

CREATE TABLE IF NOT EXISTS public.business_transaction_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  business_transaction_id uuid NOT NULL REFERENCES public.business_transactions(id) ON DELETE CASCADE,
  link_type text NOT NULL CHECK (link_type IN ('ORDER', 'PRODUCT', 'CUSTOMER', 'COST_CENTER', 'PRODUCTION_ORDER', 'MARKETING_CAMPAIGN', 'LEGACY_EXPENSE', 'LEGACY_TRANSACTION', 'LEGACY_PAYMENT', 'LEGACY_FINANCE_DATA', 'REVERSAL', 'OTHER')),
  linked_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_transaction_id, link_type, linked_id)
);

CREATE INDEX IF NOT EXISTS cost_categories_active_idx ON public.cost_categories (tenant_id, is_active, code);
CREATE INDEX IF NOT EXISTS cost_centers_active_idx ON public.cost_centers (tenant_id, is_active, code);
CREATE INDEX IF NOT EXISTS transaction_types_active_idx ON public.transaction_types (tenant_id, is_active, code);
CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON public.audit_events (tenant_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idempotency_keys_result_idx ON public.idempotency_keys (tenant_id, result_entity_id, status);
CREATE INDEX IF NOT EXISTS business_transactions_filter_idx ON public.business_transactions (tenant_id, transaction_date DESC, status, transaction_type_id);
CREATE INDEX IF NOT EXISTS business_transactions_creator_idx ON public.business_transactions (tenant_id, created_by, transaction_date DESC);
CREATE INDEX IF NOT EXISTS business_transaction_lines_classification_idx ON public.business_transaction_lines (tenant_id, cost_category_id, cost_center_id, cost_object_id);
CREATE INDEX IF NOT EXISTS business_transaction_links_target_idx ON public.business_transaction_links (tenant_id, link_type, linked_id);

CREATE OR REPLACE FUNCTION public.set_cost_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_cost_manager_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    WHEN public.has_role(auth.uid(), 'manager'::public.app_role) THEN auth.uid()::text
    ELSE COALESCE((
      SELECT ur.assigned_by::text
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.assigned_by IS NOT NULL
      ORDER BY ur.created_at DESC
      LIMIT 1
    ), auth.uid()::text)
  END
$$;

CREATE OR REPLACE FUNCTION public.has_cost_permission(p_permission text DEFAULT 'cost_transactions')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.employee_permissions ep
      WHERE ep.user_id = auth.uid() AND ep.permission_type = p_permission AND ep.enabled
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.set_cost_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL OR NEW.tenant_id = '' THEN
    NEW.tenant_id := 'default';
  END IF;
  IF NEW.manager_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.manager_id := public.current_cost_manager_id();
  END IF;
  IF TG_TABLE_NAME = 'business_transactions' AND NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_cost_master_parent()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_parent_tenant text;
  v_parent_level integer;
  v_cycle boolean;
BEGIN
  IF NEW.parent_id IS NULL THEN
    IF TG_TABLE_NAME = 'cost_categories' THEN NEW.level := 0; END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'cost_categories' THEN
    SELECT tenant_id, level INTO v_parent_tenant, v_parent_level FROM public.cost_categories WHERE id = NEW.parent_id;
  ELSE
    SELECT tenant_id INTO v_parent_tenant FROM public.cost_centers WHERE id = NEW.parent_id;
  END IF;
  IF v_parent_tenant IS NULL OR v_parent_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Cấp cha không cùng phạm vi dữ liệu';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'cost_categories' THEN
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_id FROM public.cost_categories WHERE id = NEW.parent_id
        UNION
        SELECT c.id, c.parent_id
        FROM public.cost_categories c
        JOIN ancestors a ON c.id = a.parent_id
      )
      SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id) INTO v_cycle;
    ELSE
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_id FROM public.cost_centers WHERE id = NEW.parent_id
        UNION
        SELECT c.id, c.parent_id
        FROM public.cost_centers c
        JOIN ancestors a ON c.id = a.parent_id
      )
      SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id) INTO v_cycle;
    END IF;
    IF v_cycle THEN
      RAISE EXCEPTION 'Cấu trúc cây không được tạo vòng lặp';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'cost_categories' THEN NEW.level := COALESCE(v_parent_level, 0) + 1; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_cost_category_levels()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.cost_level_refresh', 'on', true);
  WITH RECURSIVE category_tree AS (
    SELECT c.id, 0 AS depth
    FROM public.cost_categories c
    WHERE c.tenant_id = NEW.tenant_id AND c.parent_id IS NULL
    UNION
    SELECT child.id, parent.depth + 1
    FROM public.cost_categories child
    JOIN category_tree parent ON child.parent_id = parent.id
    WHERE child.tenant_id = NEW.tenant_id
  )
  UPDATE public.cost_categories c
     SET level = category_tree.depth
   FROM category_tree
   WHERE c.id = category_tree.id AND c.level IS DISTINCT FROM category_tree.depth;
  PERFORM set_config('app.cost_level_refresh', 'off', true);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_cost_category_level()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.level IS DISTINCT FROM OLD.level
     AND COALESCE(current_setting('app.cost_level_refresh', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'Cấp danh mục được hệ thống tính từ cấu trúc cây';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_system_transaction_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.is_system AND (
    NEW.code IS DISTINCT FROM OLD.code OR
    NEW.has_cash_impact IS DISTINCT FROM OLD.has_cash_impact OR
    NEW.has_inventory_impact IS DISTINCT FROM OLD.has_inventory_impact OR
    NEW.can_create_cost IS DISTINCT FROM OLD.can_create_cost OR
    NEW.can_create_asset IS DISTINCT FROM OLD.can_create_asset OR
    NEW.default_effect_kind IS DISTINCT FROM OLD.default_effect_kind OR
    NEW.default_direction IS DISTINCT FROM OLD.default_direction
  ) THEN
    RAISE EXCEPTION 'Không thể thay đổi hành vi cốt lõi của loại nghiệp vụ hệ thống';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_transaction_type_defaults()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.default_cost_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cost_categories c
    WHERE c.id = NEW.default_cost_category_id AND c.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Danh mục mặc định không cùng phạm vi dữ liệu';
  END IF;
  IF NEW.default_cost_center_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cost_centers c
    WHERE c.id = NEW.default_cost_center_id AND c.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Trung tâm mặc định không cùng phạm vi dữ liệu';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_business_transaction_number(p_tenant_id text, p_date date)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_period text := to_char(COALESCE(p_date, CURRENT_DATE), 'YYYYMM');
  v_next bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('business-transaction-number:' || COALESCE(p_tenant_id, 'default') || ':' || v_period, 0));
  SELECT COALESCE(MAX((substring(transaction_number FROM 11))::bigint), 0) + 1
    INTO v_next
    FROM public.business_transactions
   WHERE tenant_id = COALESCE(p_tenant_id, 'default')
     AND transaction_number ~ ('^BT-' || v_period || '-[0-9]+$');
  RETURN format('BT-%s-%s', v_period, lpad(v_next::text, 6, '0'));
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_business_transaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.transaction_number IS NULL OR btrim(NEW.transaction_number) = '' THEN
    NEW.transaction_number := public.next_business_transaction_number(NEW.tenant_id, NEW.transaction_date);
  END IF;
  IF NEW.idempotency_key IS NULL OR btrim(NEW.idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key is required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_business_transaction_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.transaction_types tt
    WHERE tt.id = NEW.transaction_type_id
      AND tt.tenant_id = NEW.tenant_id
      AND tt.is_active
  ) THEN
    RAISE EXCEPTION 'Loại nghiệp vụ không hoạt động hoặc không cùng phạm vi dữ liệu';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_business_transaction_line()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_type public.transaction_types;
  v_category_code text;
  v_category_behavior text;
  v_category_traceability text;
  v_center_code text;
BEGIN
  SELECT tt.* INTO v_type
  FROM public.business_transactions bt
  JOIN public.transaction_types tt ON tt.id = bt.transaction_type_id AND tt.tenant_id = bt.tenant_id
  WHERE bt.id = NEW.business_transaction_id;
  IF NOT FOUND OR NOT v_type.is_active THEN
    RAISE EXCEPTION 'Loại nghiệp vụ không hoạt động hoặc không tồn tại';
  END IF;
  NEW.cost_category_id := COALESCE(NEW.cost_category_id, v_type.default_cost_category_id);
  NEW.cost_center_id := COALESCE(NEW.cost_center_id, v_type.default_cost_center_id);
  IF v_type.requires_cost_center AND NEW.cost_center_id IS NULL THEN
    RAISE EXCEPTION 'Loại nghiệp vụ yêu cầu trung tâm chi phí';
  END IF;
  IF v_type.requires_cost_object AND NEW.cost_object_id IS NULL THEN
    RAISE EXCEPTION 'Loại nghiệp vụ yêu cầu đối tượng chi phí';
  END IF;
  SELECT code, default_behavior, default_traceability
    INTO v_category_code, v_category_behavior, v_category_traceability
    FROM public.cost_categories
   WHERE id = NEW.cost_category_id AND tenant_id = NEW.tenant_id AND is_active;
  IF v_type.can_create_cost AND NEW.cost_category_id IS NULL THEN
    RAISE EXCEPTION 'Loại nghiệp vụ yêu cầu danh mục chi phí';
  END IF;
  NEW.cost_behavior := COALESCE(NEW.cost_behavior, v_type.default_cost_behavior, v_category_behavior);
  NEW.traceability := COALESCE(NEW.traceability, v_type.default_traceability, v_category_traceability);
  SELECT code INTO v_center_code
  FROM public.cost_centers
  WHERE id = NEW.cost_center_id AND tenant_id = NEW.tenant_id AND is_active;
  NEW.effect_kind := v_type.default_effect_kind;
  NEW.direction := v_type.default_direction;
  NEW.subtotal := round(NEW.quantity * NEW.unit_price, 2);
  NEW.vat_amount := round(NEW.subtotal * NEW.vat_rate / 100, 2);
  NEW.total_amount := NEW.subtotal + NEW.vat_amount;
  NEW.classification_snapshot := jsonb_build_object(
    'transaction_type_code', v_type.code,
    'cost_category_code', v_category_code,
    'cost_behavior', NEW.cost_behavior,
    'traceability', NEW.traceability,
    'cost_center_code', v_center_code,
    'cost_object_id', NEW.cost_object_id
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_business_transaction_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_transaction_id uuid := COALESCE(NEW.business_transaction_id, OLD.business_transaction_id);
BEGIN
  IF current_setting('app.cost_suppress_audit', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  PERFORM set_config('app.cost_recalculate', 'on', true);
  UPDATE public.business_transactions bt
     SET subtotal = totals.subtotal,
         vat_amount = totals.vat_amount,
         total_amount = totals.total_amount
    FROM (
      SELECT COALESCE(SUM(l.subtotal), 0)::numeric(18,2) AS subtotal,
             COALESCE(SUM(l.vat_amount), 0)::numeric(18,2) AS vat_amount,
             COALESCE(SUM(l.total_amount), 0)::numeric(18,2) AS total_amount
      FROM public.business_transaction_lines l
      WHERE l.business_transaction_id = v_transaction_id
    ) totals
   WHERE bt.id = v_transaction_id AND bt.status = 'DRAFT';
  PERFORM set_config('app.cost_recalculate', 'off', true);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_business_transaction(
  p_transaction_type_id uuid,
  p_transaction_date date,
  p_description text,
  p_idempotency_key text,
  p_lines jsonb,
  p_links jsonb DEFAULT '[]'::jsonb,
  p_counterparty_type text DEFAULT NULL,
  p_counterparty_id uuid DEFAULT NULL,
  p_counterparty_name text DEFAULT NULL,
  p_external_reference text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := 'default';
  v_hash text;
  v_existing public.business_transactions;
  v_type public.transaction_types;
  v_tx public.business_transactions;
  v_line jsonb;
  v_link jsonb;
  v_line_number integer := 0;
  v_quantity numeric(18,4);
  v_unit_price numeric(18,2);
  v_vat_rate numeric(7,4);
  v_subtotal numeric(18,2);
  v_vat numeric(18,2);
  v_total numeric(18,2);
  v_header_subtotal numeric(18,2) := 0;
  v_header_vat numeric(18,2) := 0;
  v_header_total numeric(18,2) := 0;
  v_category_id uuid;
  v_category_code text;
  v_category_behavior text;
  v_category_traceability text;
  v_center_id uuid;
  v_center_code text;
  v_cost_object_id uuid;
  v_behavior text;
  v_traceability text;
BEGIN
  IF NOT public.has_cost_permission('cost_transactions') THEN
    RAISE EXCEPTION 'Bạn không có quyền tạo giao dịch';
  END IF;
  IF p_description IS NULL OR length(btrim(p_description)) < 3 THEN
    RAISE EXCEPTION 'Nội dung giao dịch là bắt buộc';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Khóa chống trùng không hợp lệ';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Giao dịch phải có ít nhất một dòng';
  END IF;
  IF jsonb_typeof(p_links) <> 'array' THEN
    RAISE EXCEPTION 'Danh sách liên kết không hợp lệ';
  END IF;
  SELECT * INTO v_type FROM public.transaction_types WHERE id = p_transaction_type_id AND tenant_id = v_tenant AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loại nghiệp vụ không hoạt động hoặc không tồn tại'; END IF;
  IF v_type.requires_counterparty
     AND p_counterparty_id IS NULL
     AND NULLIF(btrim(p_counterparty_name), '') IS NULL THEN
    RAISE EXCEPTION 'Loại nghiệp vụ yêu cầu đối tượng nhận hoặc trả';
  END IF;

  v_hash := md5(jsonb_build_object(
    'type', p_transaction_type_id, 'date', p_transaction_date, 'description', btrim(p_description),
    'counterparty_type', p_counterparty_type, 'counterparty_id', p_counterparty_id,
    'counterparty_name', p_counterparty_name, 'external_reference', p_external_reference,
    'lines', p_lines, 'links', p_links
  )::text);
  PERFORM pg_advisory_xact_lock(hashtextextended('business-transaction-create:' || v_tenant || ':' || p_idempotency_key, 0));
  SELECT * INTO v_existing FROM public.business_transactions WHERE tenant_id = v_tenant AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.idempotency_keys k WHERE k.tenant_id = v_tenant AND k.operation_type = 'CREATE_BUSINESS_TRANSACTION' AND k.business_key = p_idempotency_key AND k.payload_hash = v_hash) THEN
      RAISE EXCEPTION 'Khóa chống trùng đã được dùng với dữ liệu khác';
    END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'transaction_number', v_existing.transaction_number, 'status', v_existing.status, 'reused', true);
  END IF;
  INSERT INTO public.idempotency_keys (tenant_id, operation_type, business_key, payload_hash, actor_id)
  VALUES (v_tenant, 'CREATE_BUSINESS_TRANSACTION', p_idempotency_key, v_hash, auth.uid());

  PERFORM set_config('app.cost_suppress_audit', 'on', true);

  INSERT INTO public.business_transactions (
    tenant_id, manager_id, transaction_type_id, transaction_date, description, counterparty_type,
    counterparty_id, counterparty_name_snapshot, external_reference, idempotency_key,
    subtotal, vat_amount, total_amount
  ) VALUES (
    v_tenant, public.current_cost_manager_id(), p_transaction_type_id, COALESCE(p_transaction_date, CURRENT_DATE), btrim(p_description), p_counterparty_type,
    p_counterparty_id, NULLIF(btrim(p_counterparty_name), ''), NULLIF(btrim(p_external_reference), ''), p_idempotency_key,
    0, 0, 0
  ) RETURNING * INTO v_tx;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_number := v_line_number + 1;
    v_category_id := NULL;
    v_category_code := NULL;
    v_category_behavior := NULL;
    v_category_traceability := NULL;
    v_center_id := NULL;
    v_center_code := NULL;
    v_cost_object_id := NULL;
    v_quantity := COALESCE((v_line ->> 'quantity')::numeric, 1);
    v_unit_price := COALESCE((v_line ->> 'unit_price')::numeric, 0);
    v_vat_rate := COALESCE((v_line ->> 'vat_rate')::numeric, 0);
    IF v_quantity < 0 OR v_unit_price < 0 OR v_vat_rate < 0 OR v_vat_rate > 100 THEN
      RAISE EXCEPTION 'Số lượng, đơn giá hoặc VAT không hợp lệ tại dòng %', v_line_number;
    END IF;
    v_subtotal := round(v_quantity * v_unit_price, 2);
    v_vat := round(v_subtotal * v_vat_rate / 100, 2);
    v_total := v_subtotal + v_vat;
    IF NULLIF(v_line ->> 'cost_category_id', '') IS NOT NULL THEN
      SELECT id, code, default_behavior, default_traceability
        INTO v_category_id, v_category_code, v_category_behavior, v_category_traceability
        FROM public.cost_categories
       WHERE id = (v_line ->> 'cost_category_id')::uuid AND tenant_id = v_tenant AND is_active;
      IF NOT FOUND THEN RAISE EXCEPTION 'Danh mục chi phí không hoạt động tại dòng %', v_line_number; END IF;
    ELSE
      SELECT id, code, default_behavior, default_traceability
        INTO v_category_id, v_category_code, v_category_behavior, v_category_traceability
        FROM public.cost_categories
       WHERE id = v_type.default_cost_category_id AND tenant_id = v_tenant AND is_active;
    END IF;
    IF v_type.can_create_cost AND v_category_id IS NULL THEN
      RAISE EXCEPTION 'Loại nghiệp vụ yêu cầu danh mục chi phí tại dòng %', v_line_number;
    END IF;
    IF NULLIF(v_line ->> 'cost_center_id', '') IS NOT NULL THEN
      SELECT id, code INTO v_center_id, v_center_code
        FROM public.cost_centers
       WHERE id = (v_line ->> 'cost_center_id')::uuid AND tenant_id = v_tenant AND is_active;
      IF NOT FOUND THEN RAISE EXCEPTION 'Trung tâm chi phí không hoạt động tại dòng %', v_line_number; END IF;
    ELSIF v_type.default_cost_center_id IS NOT NULL THEN
      SELECT id, code INTO v_center_id, v_center_code
        FROM public.cost_centers
       WHERE id = v_type.default_cost_center_id AND tenant_id = v_tenant AND is_active;
    END IF;
    IF NULLIF(v_line ->> 'cost_object_id', '') IS NOT NULL THEN
      SELECT id INTO v_cost_object_id
        FROM public.cost_objects
       WHERE id = (v_line ->> 'cost_object_id')::uuid AND tenant_id = v_tenant AND is_active;
      IF NOT FOUND THEN RAISE EXCEPTION 'Đối tượng chi phí không hoạt động tại dòng %', v_line_number; END IF;
    END IF;
    IF v_type.requires_cost_center AND v_center_id IS NULL THEN
      RAISE EXCEPTION 'Loại nghiệp vụ yêu cầu trung tâm chi phí tại dòng %', v_line_number;
    END IF;
    IF v_type.requires_cost_object AND v_cost_object_id IS NULL THEN
      RAISE EXCEPTION 'Loại nghiệp vụ yêu cầu đối tượng chi phí tại dòng %', v_line_number;
    END IF;
    v_behavior := COALESCE(NULLIF(v_line ->> 'cost_behavior', ''), v_type.default_cost_behavior, v_category_behavior);
    v_traceability := COALESCE(NULLIF(v_line ->> 'traceability', ''), v_type.default_traceability, v_category_traceability);
    INSERT INTO public.business_transaction_lines (
      tenant_id, business_transaction_id, line_number, description, quantity, unit, unit_price,
      subtotal, vat_rate, vat_amount, total_amount, effect_kind, direction, cost_category_id,
      cost_center_id, cost_object_id, cost_behavior, traceability, classification_snapshot
    ) VALUES (
      v_tenant, v_tx.id, v_line_number, COALESCE(NULLIF(btrim(v_line ->> 'description'), ''), btrim(p_description)),
      v_quantity, COALESCE(NULLIF(btrim(v_line ->> 'unit'), ''), 'unit'), v_unit_price,
      v_subtotal, v_vat_rate, v_vat, v_total, v_type.default_effect_kind,
      v_type.default_direction, v_category_id, v_center_id, v_cost_object_id,
      v_behavior, v_traceability,
      jsonb_build_object('transaction_type_code', v_type.code, 'cost_category_code', v_category_code,
        'cost_behavior', v_behavior, 'traceability', v_traceability,
        'cost_center_code', v_center_code,
        'cost_object_id', v_cost_object_id)
    );
    v_header_subtotal := v_header_subtotal + v_subtotal;
    v_header_vat := v_header_vat + v_vat;
    v_header_total := v_header_total + v_total;
  END LOOP;
  FOR v_link IN SELECT value FROM jsonb_array_elements(p_links)
  LOOP
    INSERT INTO public.business_transaction_links (
      tenant_id, business_transaction_id, link_type, linked_id, metadata, created_by
    ) VALUES (
      v_tenant,
      v_tx.id,
      v_link ->> 'link_type',
      (v_link ->> 'linked_id')::uuid,
      COALESCE(v_link -> 'metadata', '{}'::jsonb),
      auth.uid()
    );
  END LOOP;
  PERFORM set_config('app.cost_recalculate', 'on', true);
  UPDATE public.business_transactions
     SET subtotal = v_header_subtotal, vat_amount = v_header_vat, total_amount = v_header_total
   WHERE id = v_tx.id
   RETURNING * INTO v_tx;
  PERFORM set_config('app.cost_recalculate', 'off', true);
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  PERFORM public.write_cost_audit('business_transactions', v_tx.id, 'CREATE', NULL, to_jsonb(v_tx));
  UPDATE public.idempotency_keys
     SET status = 'COMPLETED', result_entity_id = v_tx.id, completed_at = now()
   WHERE tenant_id = v_tenant AND operation_type = 'CREATE_BUSINESS_TRANSACTION' AND business_key = p_idempotency_key;
  RETURN jsonb_build_object('id', v_tx.id, 'transaction_number', v_tx.transaction_number, 'status', v_tx.status, 'reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_cost_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action text := CASE WHEN TG_OP = 'INSERT' THEN 'CREATE' WHEN TG_OP = 'DELETE' THEN 'DELETE' ELSE 'UPDATE' END;
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END;
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE NULL END;
  v_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  v_tenant text := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
BEGIN
  IF current_setting('app.cost_suppress_audit', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_TABLE_NAME = 'business_transactions' AND TG_OP = 'UPDATE'
     AND ((v_old ->> 'status') IS DISTINCT FROM (v_new ->> 'status'))
  THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.audit_events (tenant_id, entity_type, entity_id, action, before_data, after_data, actor_id)
  VALUES (v_tenant, TG_TABLE_NAME, v_id, v_action, v_old, v_new, auth.uid());
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_business_transaction_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_transition text := current_setting('app.cost_transition', true);
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.manager_id IS DISTINCT FROM OLD.manager_id
     OR NEW.transaction_number IS DISTINCT FROM OLD.transaction_number
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Không thể thay đổi khóa hoặc phạm vi của giao dịch';
  END IF;
  IF (NEW.subtotal IS DISTINCT FROM OLD.subtotal
      OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
      OR NEW.total_amount IS DISTINCT FROM OLD.total_amount)
     AND current_setting('app.cost_recalculate', true) <> 'on' THEN
    RAISE EXCEPTION 'Tổng tiền chỉ được tính từ các dòng giao dịch';
  END IF;
  IF (NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at)
     AND v_transition <> 'confirm' THEN
    RAISE EXCEPTION 'Thông tin xác nhận chỉ được cập nhật qua thao tác xác nhận';
  END IF;
  IF (NEW.voided_by IS DISTINCT FROM OLD.voided_by
      OR NEW.voided_at IS DISTINCT FROM OLD.voided_at
      OR NEW.void_reason IS DISTINCT FROM OLD.void_reason)
     AND v_transition <> 'void' THEN
    RAISE EXCEPTION 'Thông tin hủy chỉ được cập nhật qua thao tác hủy';
  END IF;
  IF NEW.transaction_type_id IS DISTINCT FROM OLD.transaction_type_id
     AND EXISTS (SELECT 1 FROM public.business_transaction_lines l WHERE l.business_transaction_id = OLD.id) THEN
    RAISE EXCEPTION 'Không thể đổi loại nghiệp vụ khi giao dịch đã có dòng chi tiết';
  END IF;
  IF OLD.status = 'VOIDED' THEN
    RAISE EXCEPTION 'Giao dịch đã hủy, không thể chỉnh sửa';
  END IF;
  IF OLD.status = 'CONFIRMED' AND NOT (
    NEW.status = 'VOIDED'
    AND v_transition = 'void'
    AND public.has_cost_permission('cost_transaction_void')
  ) THEN
    RAISE EXCEPTION 'Giao dịch đã được xác nhận và không thể chỉnh sửa';
  END IF;
  IF OLD.status = 'DRAFT' AND NEW.status <> 'DRAFT' AND NOT (
    NEW.status = 'CONFIRMED'
    AND v_transition = 'confirm'
    AND public.has_cost_permission('cost_transaction_confirm')
  ) THEN
    RAISE EXCEPTION 'Trạng thái giao dịch chỉ được thay đổi qua thao tác xác nhận';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_business_transaction_line()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.business_transaction_id IS DISTINCT FROM OLD.business_transaction_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'Không thể chuyển dòng sang giao dịch hoặc phạm vi khác';
  END IF;
  SELECT status INTO v_status FROM public.business_transactions WHERE id = COALESCE(NEW.business_transaction_id, OLD.business_transaction_id);
  IF v_status IS NULL OR v_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Chỉ được chỉnh sửa dòng của giao dịch nháp';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_business_transaction_link()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.business_transaction_id IS DISTINCT FROM OLD.business_transaction_id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'Không thể chuyển liên kết sang giao dịch hoặc phạm vi khác';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  SELECT status INTO v_status FROM public.business_transactions WHERE id = COALESCE(NEW.business_transaction_id, OLD.business_transaction_id);
  IF v_status IS NULL OR v_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Chỉ được chỉnh sửa liên kết của giao dịch nháp';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_business_transaction_line_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_tenant text;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.business_transactions WHERE id = NEW.business_transaction_id;
  IF v_tenant IS NULL OR v_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Dòng giao dịch không cùng phạm vi dữ liệu';
  END IF;
  IF NEW.cost_category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cost_categories c WHERE c.id = NEW.cost_category_id AND c.tenant_id = NEW.tenant_id AND c.is_active) THEN
    RAISE EXCEPTION 'Danh mục chi phí không hoạt động hoặc không cùng phạm vi dữ liệu';
  END IF;
  IF NEW.cost_center_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cost_centers c WHERE c.id = NEW.cost_center_id AND c.tenant_id = NEW.tenant_id AND c.is_active) THEN
    RAISE EXCEPTION 'Trung tâm chi phí không hoạt động hoặc không cùng phạm vi dữ liệu';
  END IF;
  IF NEW.cost_object_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cost_objects c WHERE c.id = NEW.cost_object_id AND c.tenant_id = NEW.tenant_id AND c.is_active) THEN
    RAISE EXCEPTION 'Đối tượng chi phí không hoạt động hoặc không cùng phạm vi dữ liệu';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_business_transaction_link_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_tenant text;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM public.business_transactions
  WHERE id = NEW.business_transaction_id;
  IF v_tenant IS NULL OR v_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Liên kết giao dịch không cùng phạm vi dữ liệu';
  END IF;
  IF NEW.link_type = 'COST_CENTER' AND NOT EXISTS (
    SELECT 1 FROM public.cost_centers c
    WHERE c.id = NEW.linked_id AND c.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Trung tâm được liên kết không cùng phạm vi dữ liệu';
  END IF;
  IF NEW.link_type = 'REVERSAL' AND NEW.linked_id = NEW.business_transaction_id THEN
    RAISE EXCEPTION 'Giao dịch không thể tự liên kết đảo ngược';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.write_cost_audit(
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_before jsonb,
  p_after jsonb,
  p_reason text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_events (tenant_id, entity_type, entity_id, action, before_data, after_data, actor_id, reason)
  VALUES (COALESCE((p_after ->> 'tenant_id'), (p_before ->> 'tenant_id'), 'default'), p_entity_type, p_entity_id, p_action, p_before, p_after, auth.uid(), p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_business_transaction(p_transaction_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tx public.business_transactions;
  v_type public.transaction_types;
  v_line_count integer;
  v_line_subtotal numeric(18,2);
  v_line_vat numeric(18,2);
  v_line_total numeric(18,2);
BEGIN
  IF NOT public.has_cost_permission('cost_transaction_confirm') THEN
    RAISE EXCEPTION 'Bạn không có quyền xác nhận giao dịch';
  END IF;
  SELECT * INTO v_tx FROM public.business_transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy giao dịch'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR v_tx.manager_id = public.current_cost_manager_id() OR v_tx.manager_id IS NULL) THEN
    RAISE EXCEPTION 'Bạn không có quyền xác nhận giao dịch này';
  END IF;
  IF v_tx.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ giao dịch nháp mới được xác nhận'; END IF;
  SELECT * INTO v_type
  FROM public.transaction_types
  WHERE id = v_tx.transaction_type_id AND tenant_id = v_tx.tenant_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loại nghiệp vụ đã ngừng hoạt động'; END IF;
  IF v_type.requires_counterparty
     AND v_tx.counterparty_id IS NULL
     AND NULLIF(btrim(v_tx.counterparty_name_snapshot), '') IS NULL THEN
    RAISE EXCEPTION 'Giao dịch chưa có đối tượng nhận hoặc trả';
  END IF;
  SELECT COUNT(*), COALESCE(SUM(subtotal), 0), COALESCE(SUM(vat_amount), 0), COALESCE(SUM(total_amount), 0)
    INTO v_line_count, v_line_subtotal, v_line_vat, v_line_total
    FROM public.business_transaction_lines WHERE business_transaction_id = v_tx.id;
  IF v_line_count = 0 THEN RAISE EXCEPTION 'Giao dịch phải có ít nhất một dòng'; END IF;
  IF abs(v_line_subtotal - v_tx.subtotal) > 0.01
     OR abs(v_line_vat - v_tx.vat_amount) > 0.01
     OR abs(v_line_total - v_tx.total_amount) > 0.01 THEN
    RAISE EXCEPTION 'Tổng dòng giao dịch không khớp tổng chứng từ';
  END IF;
  IF v_type.requires_cost_center AND EXISTS (
    SELECT 1 FROM public.business_transaction_lines l
    WHERE l.business_transaction_id = v_tx.id AND l.cost_center_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Giao dịch còn dòng chưa có trung tâm chi phí';
  END IF;
  IF v_type.requires_cost_object AND EXISTS (
    SELECT 1 FROM public.business_transaction_lines l
    WHERE l.business_transaction_id = v_tx.id AND l.cost_object_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Giao dịch còn dòng chưa có đối tượng chi phí';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.business_transaction_lines l
    LEFT JOIN public.cost_categories cc ON cc.id = l.cost_category_id AND cc.tenant_id = l.tenant_id AND cc.is_active
    LEFT JOIN public.cost_centers ce ON ce.id = l.cost_center_id AND ce.tenant_id = l.tenant_id AND ce.is_active
    LEFT JOIN public.cost_objects co ON co.id = l.cost_object_id AND co.tenant_id = l.tenant_id AND co.is_active
    WHERE l.business_transaction_id = v_tx.id
      AND ((l.cost_category_id IS NOT NULL AND cc.id IS NULL)
        OR (l.cost_center_id IS NOT NULL AND ce.id IS NULL)
        OR (l.cost_object_id IS NOT NULL AND co.id IS NULL))
  ) THEN
    RAISE EXCEPTION 'Giao dịch có phân loại chi phí đã ngừng hoạt động';
  END IF;
  PERFORM set_config('app.cost_transition', 'confirm', true);
  UPDATE public.business_transactions
     SET status = 'CONFIRMED', confirmed_by = auth.uid(), confirmed_at = now(), updated_at = now()
   WHERE id = v_tx.id;
  PERFORM public.write_cost_audit('business_transactions', v_tx.id, 'CONFIRM', to_jsonb(v_tx), to_jsonb((SELECT t FROM public.business_transactions t WHERE t.id = v_tx.id)));
  RETURN (SELECT jsonb_build_object('id', t.id, 'transaction_number', t.transaction_number, 'status', t.status) FROM public.business_transactions t WHERE t.id = v_tx.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.void_business_transaction(p_transaction_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tx public.business_transactions;
  v_after public.business_transactions;
BEGIN
  IF NOT public.has_cost_permission('cost_transaction_void') THEN
    RAISE EXCEPTION 'Bạn không có quyền hủy giao dịch';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Lý do hủy giao dịch là bắt buộc';
  END IF;
  SELECT * INTO v_tx FROM public.business_transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy giao dịch'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR v_tx.manager_id = public.current_cost_manager_id() OR v_tx.manager_id IS NULL) THEN
    RAISE EXCEPTION 'Bạn không có quyền hủy giao dịch này';
  END IF;
  IF v_tx.status <> 'CONFIRMED' THEN RAISE EXCEPTION 'Chỉ giao dịch đã xác nhận mới được hủy'; END IF;
  PERFORM set_config('app.cost_transition', 'void', true);
  UPDATE public.business_transactions
     SET status = 'VOIDED', voided_by = auth.uid(), voided_at = now(), void_reason = btrim(p_reason), updated_at = now()
   WHERE id = v_tx.id
   RETURNING * INTO v_after;
  PERFORM public.write_cost_audit('business_transactions', v_tx.id, 'VOID', to_jsonb(v_tx), to_jsonb(v_after), btrim(p_reason));
  RETURN jsonb_build_object('id', v_after.id, 'transaction_number', v_after.transaction_number, 'status', v_after.status);
END;
$$;

DROP TRIGGER IF EXISTS cost_categories_updated_at ON public.cost_categories;
CREATE TRIGGER cost_categories_updated_at BEFORE UPDATE ON public.cost_categories FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS cost_categories_parent_scope ON public.cost_categories;
CREATE TRIGGER cost_categories_parent_scope BEFORE INSERT OR UPDATE OF parent_id, tenant_id ON public.cost_categories FOR EACH ROW EXECUTE FUNCTION public.validate_cost_master_parent();
DROP TRIGGER IF EXISTS cost_categories_refresh_levels ON public.cost_categories;
CREATE TRIGGER cost_categories_refresh_levels AFTER INSERT OR UPDATE OF parent_id ON public.cost_categories FOR EACH ROW EXECUTE FUNCTION public.refresh_cost_category_levels();
DROP TRIGGER IF EXISTS cost_categories_guard_level ON public.cost_categories;
CREATE TRIGGER cost_categories_guard_level BEFORE UPDATE OF level ON public.cost_categories FOR EACH ROW EXECUTE FUNCTION public.guard_cost_category_level();
DROP TRIGGER IF EXISTS cost_centers_updated_at ON public.cost_centers;
CREATE TRIGGER cost_centers_updated_at BEFORE UPDATE ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS cost_centers_parent_scope ON public.cost_centers;
CREATE TRIGGER cost_centers_parent_scope BEFORE INSERT OR UPDATE OF parent_id, tenant_id ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION public.validate_cost_master_parent();
DROP TRIGGER IF EXISTS cost_objects_updated_at ON public.cost_objects;
CREATE TRIGGER cost_objects_updated_at BEFORE UPDATE ON public.cost_objects FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS transaction_types_updated_at ON public.transaction_types;
CREATE TRIGGER transaction_types_updated_at BEFORE UPDATE ON public.transaction_types FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS transaction_types_system_guard ON public.transaction_types;
CREATE TRIGGER transaction_types_system_guard BEFORE UPDATE ON public.transaction_types FOR EACH ROW EXECUTE FUNCTION public.guard_system_transaction_type();
DROP TRIGGER IF EXISTS transaction_types_defaults_scope ON public.transaction_types;
CREATE TRIGGER transaction_types_defaults_scope BEFORE INSERT OR UPDATE OF tenant_id, default_cost_category_id, default_cost_center_id ON public.transaction_types FOR EACH ROW EXECUTE FUNCTION public.validate_transaction_type_defaults();
DROP TRIGGER IF EXISTS business_transactions_updated_at ON public.business_transactions;
CREATE TRIGGER business_transactions_updated_at BEFORE UPDATE ON public.business_transactions FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS business_transactions_scope ON public.business_transactions;
CREATE TRIGGER business_transactions_scope BEFORE INSERT ON public.business_transactions FOR EACH ROW EXECUTE FUNCTION public.set_cost_scope();
DROP TRIGGER IF EXISTS business_transactions_prepare ON public.business_transactions;
CREATE TRIGGER business_transactions_prepare BEFORE INSERT ON public.business_transactions FOR EACH ROW EXECUTE FUNCTION public.prepare_business_transaction();
DROP TRIGGER IF EXISTS business_transactions_validate_scope ON public.business_transactions;
CREATE TRIGGER business_transactions_validate_scope BEFORE INSERT OR UPDATE OF tenant_id, transaction_type_id ON public.business_transactions FOR EACH ROW EXECUTE FUNCTION public.validate_business_transaction_scope();
DROP TRIGGER IF EXISTS business_transactions_guard ON public.business_transactions;
CREATE TRIGGER business_transactions_guard BEFORE UPDATE ON public.business_transactions FOR EACH ROW EXECUTE FUNCTION public.guard_business_transaction_update();
DROP TRIGGER IF EXISTS business_transaction_lines_guard ON public.business_transaction_lines;
CREATE TRIGGER business_transaction_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON public.business_transaction_lines FOR EACH ROW EXECUTE FUNCTION public.guard_business_transaction_line();
DROP TRIGGER IF EXISTS business_transaction_lines_prepare ON public.business_transaction_lines;
CREATE TRIGGER business_transaction_lines_prepare BEFORE INSERT OR UPDATE ON public.business_transaction_lines FOR EACH ROW EXECUTE FUNCTION public.prepare_business_transaction_line();
DROP TRIGGER IF EXISTS business_transaction_lines_scope ON public.business_transaction_lines;
CREATE TRIGGER business_transaction_lines_scope BEFORE INSERT OR UPDATE ON public.business_transaction_lines FOR EACH ROW EXECUTE FUNCTION public.validate_business_transaction_line_scope();
DROP TRIGGER IF EXISTS business_transaction_lines_recalculate ON public.business_transaction_lines;
CREATE TRIGGER business_transaction_lines_recalculate AFTER INSERT OR UPDATE OR DELETE ON public.business_transaction_lines FOR EACH ROW EXECUTE FUNCTION public.recalculate_business_transaction_totals();
DROP TRIGGER IF EXISTS business_transaction_links_guard ON public.business_transaction_links;
CREATE TRIGGER business_transaction_links_guard BEFORE INSERT OR UPDATE OR DELETE ON public.business_transaction_links FOR EACH ROW EXECUTE FUNCTION public.guard_business_transaction_link();
DROP TRIGGER IF EXISTS business_transaction_links_scope ON public.business_transaction_links;
CREATE TRIGGER business_transaction_links_scope BEFORE INSERT OR UPDATE ON public.business_transaction_links FOR EACH ROW EXECUTE FUNCTION public.validate_business_transaction_link_scope();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cost_categories','cost_centers','cost_objects','transaction_types','business_transactions','business_transaction_lines','business_transaction_links'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%s ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER audit_%s AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_cost_change()', t, t);
  END LOOP;
END;
$$;

ALTER TABLE public.cost_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_transaction_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_transaction_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cost_categories_select ON public.cost_categories;
CREATE POLICY cost_categories_select ON public.cost_categories FOR SELECT TO authenticated USING (tenant_id = 'default' AND (public.has_cost_permission('cost_transactions') OR public.has_cost_permission('cost_categories')));
DROP POLICY IF EXISTS cost_categories_manage ON public.cost_categories;
CREATE POLICY cost_categories_manage ON public.cost_categories FOR INSERT TO authenticated WITH CHECK (public.has_cost_permission('cost_categories') AND tenant_id = 'default');
DROP POLICY IF EXISTS cost_categories_update ON public.cost_categories;
CREATE POLICY cost_categories_update ON public.cost_categories FOR UPDATE TO authenticated USING (public.has_cost_permission('cost_categories')) WITH CHECK (public.has_cost_permission('cost_categories') AND tenant_id = 'default');

DROP POLICY IF EXISTS cost_centers_select ON public.cost_centers;
CREATE POLICY cost_centers_select ON public.cost_centers FOR SELECT TO authenticated USING (tenant_id = 'default' AND (public.has_cost_permission('cost_transactions') OR public.has_cost_permission('cost_centers')));
DROP POLICY IF EXISTS cost_centers_manage ON public.cost_centers;
CREATE POLICY cost_centers_manage ON public.cost_centers FOR INSERT TO authenticated WITH CHECK (public.has_cost_permission('cost_centers') AND tenant_id = 'default');
DROP POLICY IF EXISTS cost_centers_update ON public.cost_centers;
CREATE POLICY cost_centers_update ON public.cost_centers FOR UPDATE TO authenticated USING (public.has_cost_permission('cost_centers')) WITH CHECK (public.has_cost_permission('cost_centers') AND tenant_id = 'default');

DROP POLICY IF EXISTS cost_objects_select ON public.cost_objects;
CREATE POLICY cost_objects_select ON public.cost_objects FOR SELECT TO authenticated USING (tenant_id = 'default' AND (public.has_cost_permission('cost_transactions') OR public.has_cost_permission('cost_objects')));
DROP POLICY IF EXISTS cost_objects_manage ON public.cost_objects;
CREATE POLICY cost_objects_manage ON public.cost_objects FOR INSERT TO authenticated WITH CHECK (public.has_cost_permission('cost_objects') AND tenant_id = 'default');
DROP POLICY IF EXISTS cost_objects_update ON public.cost_objects;
CREATE POLICY cost_objects_update ON public.cost_objects FOR UPDATE TO authenticated USING (public.has_cost_permission('cost_objects')) WITH CHECK (public.has_cost_permission('cost_objects') AND tenant_id = 'default');

DROP POLICY IF EXISTS transaction_types_select ON public.transaction_types;
CREATE POLICY transaction_types_select ON public.transaction_types FOR SELECT TO authenticated USING (tenant_id = 'default' AND (public.has_cost_permission('cost_transactions') OR public.has_cost_permission('transaction_types')));
DROP POLICY IF EXISTS transaction_types_manage ON public.transaction_types;
CREATE POLICY transaction_types_manage ON public.transaction_types FOR INSERT TO authenticated WITH CHECK (public.has_cost_permission('transaction_types') AND tenant_id = 'default');
DROP POLICY IF EXISTS transaction_types_update ON public.transaction_types;
CREATE POLICY transaction_types_update ON public.transaction_types FOR UPDATE TO authenticated USING (public.has_cost_permission('transaction_types')) WITH CHECK (public.has_cost_permission('transaction_types') AND tenant_id = 'default');

DROP POLICY IF EXISTS audit_events_select ON public.audit_events;
CREATE POLICY audit_events_select ON public.audit_events FOR SELECT TO authenticated USING (
  tenant_id = 'default'
  AND public.has_cost_permission('cost_audit')
  AND (
    (entity_type = 'business_transactions' AND EXISTS (
      SELECT 1 FROM public.business_transactions bt WHERE bt.id = entity_id
    ))
    OR (entity_type IN ('business_transaction_lines', 'business_transaction_links') AND EXISTS (
      SELECT 1 FROM public.business_transactions bt
      WHERE bt.id = COALESCE(
        NULLIF(after_data ->> 'business_transaction_id', '')::uuid,
        NULLIF(before_data ->> 'business_transaction_id', '')::uuid
      )
    ))
    OR entity_type NOT IN ('business_transactions', 'business_transaction_lines', 'business_transaction_links')
  )
);

DROP POLICY IF EXISTS business_transactions_select ON public.business_transactions;
CREATE POLICY business_transactions_select ON public.business_transactions FOR SELECT TO authenticated USING (tenant_id = 'default' AND public.has_cost_permission('cost_transactions') AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR manager_id = public.current_cost_manager_id() OR manager_id IS NULL));
DROP POLICY IF EXISTS business_transactions_insert ON public.business_transactions;
DROP POLICY IF EXISTS business_transactions_update ON public.business_transactions;
CREATE POLICY business_transactions_update ON public.business_transactions FOR UPDATE TO authenticated USING (tenant_id = 'default' AND public.has_cost_permission('cost_transactions') AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR manager_id = public.current_cost_manager_id() OR manager_id IS NULL)) WITH CHECK (tenant_id = 'default');

DROP POLICY IF EXISTS business_transaction_lines_select ON public.business_transaction_lines;
CREATE POLICY business_transaction_lines_select ON public.business_transaction_lines FOR SELECT TO authenticated USING (tenant_id = 'default' AND public.has_cost_permission('cost_transactions') AND EXISTS (SELECT 1 FROM public.business_transactions bt WHERE bt.id = business_transaction_id));
DROP POLICY IF EXISTS business_transaction_lines_insert ON public.business_transaction_lines;
CREATE POLICY business_transaction_lines_insert ON public.business_transaction_lines FOR INSERT TO authenticated WITH CHECK (tenant_id = 'default' AND public.has_cost_permission('cost_transactions') AND EXISTS (SELECT 1 FROM public.business_transactions bt WHERE bt.id = business_transaction_id AND bt.status = 'DRAFT'));
DROP POLICY IF EXISTS business_transaction_lines_update ON public.business_transaction_lines;
CREATE POLICY business_transaction_lines_update ON public.business_transaction_lines FOR UPDATE TO authenticated USING (tenant_id = 'default' AND public.has_cost_permission('cost_transactions') AND EXISTS (SELECT 1 FROM public.business_transactions bt WHERE bt.id = business_transaction_id AND bt.status = 'DRAFT')) WITH CHECK (tenant_id = 'default' AND EXISTS (SELECT 1 FROM public.business_transactions bt WHERE bt.id = business_transaction_id AND bt.status = 'DRAFT'));
DROP POLICY IF EXISTS business_transaction_lines_delete ON public.business_transaction_lines;
CREATE POLICY business_transaction_lines_delete ON public.business_transaction_lines FOR DELETE TO authenticated USING (tenant_id = 'default' AND public.has_cost_permission('cost_transactions') AND EXISTS (SELECT 1 FROM public.business_transactions bt WHERE bt.id = business_transaction_id AND bt.status = 'DRAFT'));

DROP POLICY IF EXISTS business_transaction_links_select ON public.business_transaction_links;
CREATE POLICY business_transaction_links_select ON public.business_transaction_links FOR SELECT TO authenticated USING (tenant_id = 'default' AND public.has_cost_permission('cost_transactions') AND EXISTS (SELECT 1 FROM public.business_transactions bt WHERE bt.id = business_transaction_id));
DROP POLICY IF EXISTS business_transaction_links_insert ON public.business_transaction_links;
CREATE POLICY business_transaction_links_insert ON public.business_transaction_links FOR INSERT TO authenticated WITH CHECK (tenant_id = 'default' AND public.has_cost_permission('cost_transactions') AND EXISTS (SELECT 1 FROM public.business_transactions bt WHERE bt.id = business_transaction_id AND bt.status = 'DRAFT'));
DROP POLICY IF EXISTS business_transaction_links_update ON public.business_transaction_links;
CREATE POLICY business_transaction_links_update ON public.business_transaction_links FOR UPDATE TO authenticated USING (tenant_id = 'default' AND public.has_cost_permission('cost_transactions') AND EXISTS (SELECT 1 FROM public.business_transactions bt WHERE bt.id = business_transaction_id AND bt.status = 'DRAFT')) WITH CHECK (tenant_id = 'default' AND EXISTS (SELECT 1 FROM public.business_transactions bt WHERE bt.id = business_transaction_id AND bt.status = 'DRAFT'));
DROP POLICY IF EXISTS business_transaction_links_delete ON public.business_transaction_links;
CREATE POLICY business_transaction_links_delete ON public.business_transaction_links FOR DELETE TO authenticated USING (tenant_id = 'default' AND public.has_cost_permission('cost_transactions') AND EXISTS (SELECT 1 FROM public.business_transactions bt WHERE bt.id = business_transaction_id AND bt.status = 'DRAFT'));

REVOKE ALL ON TABLE public.audit_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.idempotency_keys FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.set_cost_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_cost_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_cost_master_parent() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_cost_category_levels() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_cost_category_level() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_system_transaction_type() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_transaction_type_defaults() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_business_transaction_number(text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_business_transaction() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_business_transaction_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_business_transaction_line() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculate_business_transaction_totals() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_cost_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_business_transaction_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_business_transaction_line() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_business_transaction_link() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_business_transaction_line_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_business_transaction_link_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.write_cost_audit(text, uuid, text, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_business_transaction(uuid, date, text, text, jsonb, jsonb, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_business_transaction(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.void_business_transaction(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_cost_permission(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_cost_manager_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_business_transaction(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_business_transaction(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_transaction(uuid, date, text, text, jsonb, jsonb, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_cost_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_cost_manager_id() TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cost_categories, public.cost_centers, public.cost_objects, public.transaction_types TO authenticated;
GRANT SELECT, UPDATE ON public.business_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_transaction_lines, public.business_transaction_links TO authenticated;
GRANT SELECT ON public.audit_events TO authenticated;

INSERT INTO public.cost_categories (tenant_id, code, name, description, default_behavior, default_traceability)
VALUES
  ('default', 'DIRECT_MATERIAL', 'Nguyên vật liệu trực tiếp', 'Chi phí vật liệu truy xuất trực tiếp cho đối tượng chi phí', 'VARIABLE', 'DIRECT'),
  ('default', 'DIRECT_LABOR', 'Nhân công trực tiếp', 'Chi phí nhân công trực tiếp', 'VARIABLE', 'DIRECT'),
  ('default', 'VARIABLE_MANUFACTURING_OVERHEAD', 'Biến phí sản xuất chung', 'Chi phí sản xuất chung biến đổi', 'VARIABLE', 'INDIRECT'),
  ('default', 'FIXED_MANUFACTURING_OVERHEAD', 'Định phí sản xuất chung', 'Chi phí sản xuất chung cố định', 'FIXED', 'INDIRECT'),
  ('default', 'SELLING_EXPENSE', 'Chi phí bán hàng', 'Chi phí phục vụ bán hàng và giao hàng', 'VARIABLE', 'INDIRECT'),
  ('default', 'MANAGEMENT_EXPENSE', 'Chi phí quản lý', 'Chi phí quản lý doanh nghiệp', 'FIXED', 'INDIRECT'),
  ('default', 'FINANCIAL_EXPENSE', 'Chi phí tài chính', 'Lãi vay và chi phí tài chính', 'FIXED', 'INDIRECT'),
  ('default', 'OTHER_EXPENSE', 'Chi phí khác', 'Khoản chi phí chưa thuộc nhóm chuẩn', 'MIXED', 'INDIRECT')
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.cost_centers (tenant_id, code, name, center_type)
VALUES
  ('default', 'PRODUCTION', 'Sản xuất', 'PRODUCTION'),
  ('default', 'COMMERCIAL', 'Kinh doanh', 'SALES'),
  ('default', 'MANAGEMENT', 'Quản lý', 'ADMIN')
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.cost_centers (tenant_id, code, name, center_type, parent_id)
SELECT 'default', v.code, v.name, v.center_type, p.id
FROM (VALUES
  ('CUT', 'Cắt', 'PRODUCTION', 'PRODUCTION'), ('SEW', 'May', 'PRODUCTION', 'PRODUCTION'), ('IRON', 'Là/ủi', 'PRODUCTION', 'PRODUCTION'), ('PACK', 'Đóng gói', 'PRODUCTION', 'PRODUCTION'), ('MATTRESS', 'Nệm', 'PRODUCTION', 'PRODUCTION'), ('PROD_WAREHOUSE', 'Kho sản xuất', 'PRODUCTION', 'PRODUCTION'), ('PROD_MANAGEMENT', 'Quản lý sản xuất', 'PRODUCTION', 'PRODUCTION'),
  ('SALES', 'Bán hàng', 'SALES', 'COMMERCIAL'), ('MARKETING', 'Marketing', 'SALES', 'COMMERCIAL'), ('CUSTOMER_SERVICE', 'Chăm sóc khách hàng', 'SERVICE', 'COMMERCIAL'), ('LOGISTICS', 'Logistics', 'SERVICE', 'COMMERCIAL'),
  ('BOD', 'Ban giám đốc', 'ADMIN', 'MANAGEMENT'), ('ACCOUNTING', 'Kế toán', 'ADMIN', 'MANAGEMENT'), ('ADMIN', 'Hành chính', 'ADMIN', 'MANAGEMENT'), ('IT', 'Công nghệ thông tin', 'SERVICE', 'MANAGEMENT'), ('OFFICE', 'Văn phòng', 'SERVICE', 'MANAGEMENT')
) AS v(code, name, center_type, parent_code)
JOIN public.cost_centers p ON p.tenant_id = 'default' AND p.code = v.parent_code
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.transaction_types (tenant_id, code, name, description, has_cash_impact, has_inventory_impact, can_create_cost, can_create_asset, default_effect_kind, default_direction, requires_counterparty, requires_cost_center, requires_cost_object, default_cost_category_id, default_cost_behavior, default_traceability)
SELECT 'default', v.code, v.name, v.description, v.cash_impact, v.inventory_impact, v.can_cost, v.can_asset, v.effect_kind, v.direction, v.counterparty, v.center, v.object_required, c.id, v.behavior, v.traceability
FROM (VALUES
  ('PURCHASE_MATERIAL','Mua nguyên vật liệu','Mua vật liệu nhập kho',true,true,false,false,'INVENTORY','DEBIT',true,true,false,'DIRECT_MATERIAL','VARIABLE','DIRECT'),
  ('PURCHASE_SUPPLIES','Mua vật tư tiêu hao','Mua vật tư tiêu hao',true,false,true,false,'COST','DEBIT',true,true,false,'VARIABLE_MANUFACTURING_OVERHEAD','VARIABLE','INDIRECT'),
  ('PURCHASE_ASSET','Mua tài sản','Mua máy móc hoặc tài sản',true,false,false,true,'ASSET','DEBIT',true,true,false,'OTHER_EXPENSE','FIXED','INDIRECT'),
  ('EXPENSE','Chi phí','Ghi nhận một khoản chi phí phát sinh',false,false,true,false,'COST','DEBIT',true,true,false,'OTHER_EXPENSE','MIXED','INDIRECT'),
  ('SUPPLIER_PAYMENT','Thanh toán nhà cung cấp','Thanh toán công nợ nhà cung cấp',true,false,false,false,'PAYABLE','DEBIT',true,false,false,'OTHER_EXPENSE','MIXED','INDIRECT'),
  ('CUSTOMER_RECEIPT','Thu tiền khách hàng','Ghi nhận tiền khách hàng thanh toán',true,false,false,false,'RECEIVABLE','CREDIT',true,false,false,'OTHER_EXPENSE','MIXED','INDIRECT'),
  ('ADVANCE','Tạm ứng','Tạm ứng cho nhân sự hoặc đối tác',true,false,false,false,'RECEIVABLE','DEBIT',true,true,false,'OTHER_EXPENSE','MIXED','INDIRECT'),
  ('ADVANCE_SETTLEMENT','Quyết toán tạm ứng','Quyết toán khoản tạm ứng',false,false,true,false,'COST','DEBIT',true,true,false,'OTHER_EXPENSE','MIXED','INDIRECT'),
  ('DEPOSIT','Tiền đặt cọc','Ghi nhận tiền đặt cọc',true,false,false,false,'LIABILITY','CREDIT',true,false,false,'OTHER_EXPENSE','MIXED','INDIRECT'),
  ('LOAN_RECEIPT','Nhận khoản vay','Nhận tiền vay',true,false,false,false,'LIABILITY','CREDIT',true,false,false,'OTHER_EXPENSE','FIXED','INDIRECT'),
  ('LOAN_REPAYMENT','Trả khoản vay','Trả nợ gốc hoặc lãi vay',true,false,true,false,'LIABILITY','DEBIT',true,true,false,'FINANCIAL_EXPENSE','FIXED','INDIRECT'),
  ('INVENTORY_ADJUSTMENT','Điều chỉnh kho','Điều chỉnh số lượng tồn kho',false,true,true,false,'INVENTORY','DEBIT',false,true,false,'OTHER_EXPENSE','MIXED','INDIRECT'),
  ('MATERIAL_ISSUE','Xuất nguyên vật liệu','Xuất vật liệu cho sản xuất',false,true,true,false,'INVENTORY','CREDIT',false,true,true,'DIRECT_MATERIAL','VARIABLE','DIRECT'),
  ('MATERIAL_RETURN','Trả nguyên vật liệu','Trả vật liệu chưa sử dụng',false,true,true,false,'INVENTORY','DEBIT',false,true,true,'DIRECT_MATERIAL','VARIABLE','DIRECT'),
  ('MANUAL_ADJUSTMENT','Điều chỉnh thủ công','Điều chỉnh nghiệp vụ có kiểm soát',false,false,true,false,'COST','DEBIT',false,true,false,'OTHER_EXPENSE','MIXED','INDIRECT')
) AS v(code,name,description,cash_impact,inventory_impact,can_cost,can_asset,effect_kind,direction,counterparty,center,object_required,category_code,behavior,traceability)
JOIN public.cost_categories c ON c.tenant_id = 'default' AND c.code = v.category_code
ON CONFLICT (tenant_id, code) DO NOTHING;
