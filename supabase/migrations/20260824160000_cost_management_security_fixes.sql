-- Sprint 1 security hardening discovered during staging acceptance review.
-- Additive only; no legacy rows or tables are modified.

CREATE OR REPLACE FUNCTION public.guard_system_transaction_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_system IS DISTINCT FROM OLD.is_system THEN
    RAISE EXCEPTION 'Không thể thay đổi cờ loại nghiệp vụ hệ thống';
  END IF;
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

CREATE OR REPLACE FUNCTION public.guard_business_transaction_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_transition text := COALESCE(current_setting('app.cost_transition', true), '');
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
     AND COALESCE(current_setting('app.cost_recalculate', true), 'off') <> 'on' THEN
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

CREATE OR REPLACE FUNCTION public.cost_target_exists_in_tenant(
  p_table_name text,
  p_target_id uuid,
  p_tenant_id text
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF p_table_name NOT IN (
    'products', 'orders', 'customers', 'cost_centers', 'expenses',
    'transactions', 'order_payments', 'finance_data', 'business_transactions'
  ) THEN
    RETURN false;
  END IF;
  IF to_regclass('public.' || p_table_name) IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1 AND tenant_id = $2)',
    p_table_name
  ) INTO v_exists USING p_target_id, p_tenant_id;
  RETURN COALESCE(v_exists, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_cost_object_source()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_table_name text;
BEGIN
  IF NEW.source_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_table_name := CASE NEW.object_type
    WHEN 'PRODUCT' THEN 'products'
    WHEN 'ORDER' THEN 'orders'
    WHEN 'CUSTOMER' THEN 'customers'
    WHEN 'COST_CENTER' THEN 'cost_centers'
    ELSE NULL
  END;
  IF v_table_name IS NULL THEN
    RAISE EXCEPTION 'Loại đối tượng chi phí này chưa hỗ trợ liên kết source_id';
  END IF;
  IF NOT public.cost_target_exists_in_tenant(v_table_name, NEW.source_id, NEW.tenant_id) THEN
    RAISE EXCEPTION 'Đối tượng nguồn không tồn tại hoặc không cùng phạm vi dữ liệu';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cost_objects_source_scope ON public.cost_objects;
CREATE TRIGGER cost_objects_source_scope
BEFORE INSERT OR UPDATE OF object_type, source_id, tenant_id ON public.cost_objects
FOR EACH ROW EXECUTE FUNCTION public.validate_cost_object_source();

CREATE OR REPLACE FUNCTION public.validate_business_transaction_link_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_tenant text;
  v_table_name text;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM public.business_transactions
  WHERE id = NEW.business_transaction_id;
  IF v_tenant IS NULL OR v_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Liên kết giao dịch không cùng phạm vi dữ liệu';
  END IF;

  v_table_name := CASE NEW.link_type
    WHEN 'ORDER' THEN 'orders'
    WHEN 'PRODUCT' THEN 'products'
    WHEN 'CUSTOMER' THEN 'customers'
    WHEN 'COST_CENTER' THEN 'cost_centers'
    WHEN 'LEGACY_EXPENSE' THEN 'expenses'
    WHEN 'LEGACY_TRANSACTION' THEN 'transactions'
    WHEN 'LEGACY_PAYMENT' THEN 'order_payments'
    WHEN 'LEGACY_FINANCE_DATA' THEN 'finance_data'
    WHEN 'REVERSAL' THEN 'business_transactions'
    ELSE NULL
  END;

  IF NEW.link_type IN ('PRODUCTION_ORDER', 'MARKETING_CAMPAIGN') THEN
    RAISE EXCEPTION 'Loại liên kết này chưa được triển khai';
  END IF;
  IF NEW.link_type = 'OTHER' THEN
    IF NULLIF(btrim(COALESCE(NEW.metadata ->> 'external_reference', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Liên kết OTHER yêu cầu external_reference trong metadata';
    END IF;
    RETURN NEW;
  END IF;
  IF v_table_name IS NULL OR NOT public.cost_target_exists_in_tenant(v_table_name, NEW.linked_id, NEW.tenant_id) THEN
    RAISE EXCEPTION 'Đối tượng liên kết không tồn tại hoặc không cùng phạm vi dữ liệu';
  END IF;
  IF NEW.link_type = 'REVERSAL' AND NEW.linked_id = NEW.business_transaction_id THEN
    RAISE EXCEPTION 'Giao dịch không thể tự liên kết đảo ngược';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.cost_target_exists_in_tenant(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_cost_object_source() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_system_transaction_type() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_business_transaction_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_business_transaction_link_scope() FROM PUBLIC, anon, authenticated;
