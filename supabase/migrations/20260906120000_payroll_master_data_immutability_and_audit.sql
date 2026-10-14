-- Payroll Sprint 1 hardening follow-up.
-- Forward-only: keep the existing worker_compensation_rates source of truth,
-- extend audit vocabulary, and protect approved history from direct mutation.

BEGIN;

ALTER TABLE public.audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_action_check
  CHECK (action IN (
    'CREATE', 'UPDATE', 'DELETE', 'CONFIRM', 'VOID', 'APPROVE', 'SUPERSEDE',
    'RELEASE', 'COMPLETE', 'START', 'PAUSE', 'RESUME', 'HOLD', 'CANCEL',
    'REPLAN', 'ASSIGN', 'UNASSIGN', 'REVERSE',
    'CREATE_DRAFT', 'UPDATE_DRAFT', 'DISCARD_DRAFT'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS worker_compensation_rates_single_draft_idx
  ON public.worker_compensation_rates (tenant_id, worker_id, compensation_type)
  WHERE status = 'DRAFT';

CREATE OR REPLACE FUNCTION public.guard_worker_compensation_rate_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transition text := COALESCE(current_setting('app.payroll_rate_transition', true), 'off');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' AND v_transition <> 'on' THEN
      RAISE EXCEPTION 'Mức công mới phải đi qua quy trình nháp và duyệt';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' OR v_transition <> 'on' THEN
      RAISE EXCEPTION 'Mức công đã duyệt/bảo lưu là bất biến; hãy tạo phiên bản mới hoặc điều chỉnh';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'DRAFT' THEN
    IF NEW.status <> 'DRAFT' AND v_transition <> 'on' THEN
      RAISE EXCEPTION 'Không thể đổi trạng thái mức công nháp trực tiếp';
    END IF;
    RETURN NEW;
  END IF;

  IF v_transition <> 'on' THEN
    RAISE EXCEPTION 'Mức công đã duyệt/bảo lưu là bất biến; hãy tạo phiên bản mới';
  END IF;

  IF OLD.status = 'APPROVED' AND NEW.status = 'RETIRED'
     AND NEW.worker_id = OLD.worker_id
     AND NEW.compensation_type = OLD.compensation_type
     AND NEW.effective_from = OLD.effective_from
     AND NEW.effective_to IS NOT NULL
     AND NEW.effective_to >= OLD.effective_from
     AND (OLD.effective_to IS NULL OR NEW.effective_to <= OLD.effective_to)
     AND NEW.hourly_rate IS NOT DISTINCT FROM OLD.hourly_rate
     AND NEW.piece_rate IS NOT DISTINCT FROM OLD.piece_rate
     AND NEW.monthly_rate IS NOT DISTINCT FROM OLD.monthly_rate
     AND NEW.monthly_productive_minutes IS NOT DISTINCT FROM OLD.monthly_productive_minutes
     AND NEW.reason IS NOT DISTINCT FROM OLD.reason
     AND NEW.source_reference IS NOT DISTINCT FROM OLD.source_reference
     AND NEW.is_estimated IS NOT DISTINCT FROM OLD.is_estimated THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Chỉ được kết thúc phiên bản mức công qua quy trình thay thế';
END;
$$;

DROP TRIGGER IF EXISTS worker_compensation_rates_immutable ON public.worker_compensation_rates;
CREATE TRIGGER worker_compensation_rates_immutable
BEFORE INSERT OR UPDATE OR DELETE ON public.worker_compensation_rates
FOR EACH ROW EXECUTE FUNCTION public.guard_worker_compensation_rate_immutable();

-- The legacy attendance configuration remains supported, but its supersede
-- update must pass through the same server-owned transition gate.
CREATE OR REPLACE FUNCTION public.configure_worker_attendance_method(
  p_worker_id uuid,
  p_attendance_method text,
  p_rate_amount numeric,
  p_effective_from date,
  p_effective_to date DEFAULT NULL,
  p_standard_days_per_month numeric DEFAULT 26,
  p_standard_hours_per_day numeric DEFAULT 8,
  p_reason text DEFAULT NULL,
  p_is_estimated boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_worker public.production_workers;
  v_compensation_type text;
  v_monthly_productive_minutes numeric;
  v_rate jsonb;
  v_profile jsonb;
BEGIN
  IF NOT public.has_payroll_permission('payroll_rate_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền quản lý mức công';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Lý do cập nhật mức công là bắt buộc';
  END IF;

  SELECT * INTO v_worker
  FROM public.production_workers
  WHERE id = p_worker_id AND tenant_id = v_tenant AND is_active
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nhân sự không tồn tại hoặc không hoạt động'; END IF;
  IF p_attendance_method NOT IN ('DAY', 'HOUR', 'OUTPUT') THEN
    RAISE EXCEPTION 'Hình thức chấm công không hợp lệ';
  END IF;
  IF p_rate_amount IS NULL OR p_rate_amount < 0 THEN
    RAISE EXCEPTION 'Mức công không hợp lệ';
  END IF;
  IF p_effective_from IS NULL OR (p_effective_to IS NOT NULL AND p_effective_to < p_effective_from) THEN
    RAISE EXCEPTION 'Khoảng hiệu lực không hợp lệ';
  END IF;

  IF p_attendance_method = 'DAY' THEN
    IF p_standard_days_per_month IS NULL OR p_standard_days_per_month <= 0
       OR p_standard_hours_per_day IS NULL OR p_standard_hours_per_day <= 0
       OR p_standard_hours_per_day > 24 THEN
      RAISE EXCEPTION 'Ngày công hoặc số giờ chuẩn không hợp lệ';
    END IF;
    v_compensation_type := CASE WHEN v_worker.worker_type = 'SUPERVISOR'
      THEN 'MONTHLY_MANAGER' ELSE 'MONTHLY_HELPER' END;
    v_monthly_productive_minutes := p_standard_days_per_month * p_standard_hours_per_day * 60;
  ELSIF p_attendance_method = 'HOUR' THEN
    v_compensation_type := 'HOURLY';
    v_monthly_productive_minutes := NULL;
  ELSE
    v_compensation_type := 'PIECE_RATE';
    v_monthly_productive_minutes := NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'worker-rate:' || v_tenant || ':' || p_worker_id::text || ':' || v_compensation_type, 0));
  v_rate := public.create_worker_compensation_rate(
    p_worker_id, v_compensation_type, p_effective_from, p_effective_to,
    CASE WHEN v_compensation_type = 'HOURLY' THEN p_rate_amount ELSE NULL END,
    CASE WHEN v_compensation_type = 'PIECE_RATE' THEN p_rate_amount ELSE NULL END,
    CASE WHEN v_compensation_type IN ('MONTHLY_MANAGER', 'MONTHLY_HELPER') THEN p_rate_amount ELSE NULL END,
    v_monthly_productive_minutes, btrim(p_reason), p_is_estimated);
  v_profile := public.upsert_worker_compensation_profile(
    p_worker_id, v_compensation_type, v_monthly_productive_minutes);
  RETURN jsonb_build_object('attendance_method', p_attendance_method, 'profile', v_profile, 'rate', v_rate);
END;
$$;

-- Approval is the only supported transition from DRAFT to APPROVED and may
-- retire one prior version atomically.
CREATE OR REPLACE FUNCTION public.approve_worker_payroll_rate(
  p_rate_id uuid, p_reason text, p_supersede_previous boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_row public.worker_compensation_rates;
  v_previous public.worker_compensation_rates;
  v_previous_before jsonb;
  v_after public.worker_compensation_rates;
  v_expected_type text;
BEGIN
  IF NOT public.has_payroll_permission('payroll_rate_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền duyệt mức lương';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Lý do duyệt mức lương là bắt buộc';
  END IF;
  SELECT * INTO v_row FROM public.worker_compensation_rates
  WHERE id = p_rate_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND OR NOT public.payroll_worker_in_scope(v_row.worker_id) THEN
    RAISE EXCEPTION 'Không tìm thấy mức lương';
  END IF;
  IF v_row.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ mức lương nháp mới được duyệt'; END IF;

  v_expected_type := public.resolve_payroll_compensation_type(v_row.worker_id, v_row.effective_from);
  IF v_expected_type <> v_row.compensation_type THEN
    RAISE EXCEPTION 'Loại lương phải khớp phân loại đang hiệu lực (%)', v_expected_type;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'worker-rate:' || v_tenant || ':' || v_row.worker_id::text || ':' || v_row.compensation_type, 0));
  IF EXISTS (
    SELECT 1 FROM public.worker_compensation_rates r
    WHERE r.tenant_id = v_tenant AND r.worker_id = v_row.worker_id
      AND r.compensation_type = v_row.compensation_type AND r.id <> v_row.id
      AND r.status IN ('APPROVED','RETIRED') AND r.effective_from >= v_row.effective_from
      AND daterange(r.effective_from, COALESCE(r.effective_to + 1, 'infinity'::date), '[)')
          && daterange(v_row.effective_from, COALESCE(v_row.effective_to + 1, 'infinity'::date), '[)')
  ) THEN RAISE EXCEPTION 'Đã có mức lương cùng hoặc sau ngày hiệu lực này'; END IF;

  SELECT * INTO v_previous FROM public.worker_compensation_rates r
  WHERE r.tenant_id = v_tenant AND r.worker_id = v_row.worker_id
    AND r.compensation_type = v_row.compensation_type AND r.id <> v_row.id
    AND r.status IN ('APPROVED','RETIRED') AND r.effective_from < v_row.effective_from
    AND (r.effective_to IS NULL OR r.effective_to >= v_row.effective_from)
  ORDER BY r.effective_from DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF NOT p_supersede_previous THEN RAISE EXCEPTION 'Khoảng hiệu lực mức lương bị chồng lấn'; END IF;
    v_previous_before := to_jsonb(v_previous);
    PERFORM set_config('app.payroll_rate_transition', 'on', true);
    UPDATE public.worker_compensation_rates
    SET status = 'RETIRED', effective_to = v_row.effective_from - 1, updated_at = now()
    WHERE id = v_previous.id RETURNING * INTO v_previous;
    PERFORM set_config('app.payroll_rate_transition', 'off', true);
    PERFORM public.write_cost_audit(
      'worker_compensation_rates', v_previous.id, 'SUPERSEDE',
      v_previous_before, to_jsonb(v_previous), btrim(p_reason));
  END IF;

  PERFORM set_config('app.payroll_rate_transition', 'on', true);
  UPDATE public.worker_compensation_rates
  SET status = 'APPROVED', approved_by = auth.uid(), approved_at = now(), updated_at = now()
  WHERE id = v_row.id RETURNING * INTO v_after;
  PERFORM set_config('app.payroll_rate_transition', 'off', true);
  PERFORM public.write_cost_audit('worker_compensation_rates', v_after.id, 'APPROVE', to_jsonb(v_row), to_jsonb(v_after), btrim(p_reason));
  RETURN to_jsonb(v_after);
END;
$$;

-- Preserve the historical RPC signature for existing attendance screens, but
-- route it through the same draft and approval functions used by payroll.
CREATE OR REPLACE FUNCTION public.create_worker_compensation_rate(
  p_worker_id uuid, p_compensation_type text, p_effective_from date, p_effective_to date DEFAULT NULL,
  p_hourly_rate numeric DEFAULT NULL, p_piece_rate numeric DEFAULT NULL, p_monthly_rate numeric DEFAULT NULL,
  p_monthly_productive_minutes numeric DEFAULT NULL, p_reason text DEFAULT NULL, p_is_estimated boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_draft jsonb;
BEGIN
  IF NOT public.has_payroll_permission('payroll_rate_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền quản lý mức công';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Lý do cập nhật mức công là bắt buộc';
  END IF;
  v_draft := public.create_worker_payroll_rate_draft(
    p_worker_id, p_compensation_type, p_effective_from, p_effective_to,
    p_hourly_rate, p_piece_rate, p_monthly_rate, p_monthly_productive_minutes,
    'legacy-attendance-config', btrim(p_reason), p_is_estimated
  );
  RETURN public.approve_worker_payroll_rate((v_draft->>'id')::uuid, btrim(p_reason), true);
END;
$$;

CREATE OR REPLACE FUNCTION public.discard_worker_payroll_rate_draft(p_rate_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_row public.worker_compensation_rates;
BEGIN
  IF NOT public.has_payroll_permission('payroll_rate_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền hủy mức lương';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Lý do hủy mức lương là bắt buộc';
  END IF;
  SELECT * INTO v_row FROM public.worker_compensation_rates
  WHERE id = p_rate_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND OR NOT public.payroll_worker_in_scope(v_row.worker_id) THEN
    RAISE EXCEPTION 'Không tìm thấy mức lương';
  END IF;
  IF v_row.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ mức lương nháp mới được hủy'; END IF;
  PERFORM set_config('app.payroll_rate_transition', 'on', true);
  DELETE FROM public.worker_compensation_rates WHERE id = v_row.id;
  PERFORM set_config('app.payroll_rate_transition', 'off', true);
  PERFORM public.write_cost_audit(
    'worker_compensation_rates', v_row.id, 'DISCARD_DRAFT',
    to_jsonb(v_row), NULL, btrim(p_reason));
  RETURN to_jsonb(v_row);
END;
$$;

-- Product codes are only unique within a price list in the legacy catalog.
-- Keep the v1 return contract for older clients and expose the richer identity
-- through a versioned RPC so this forward migration does not drop dependencies.
CREATE OR REPLACE FUNCTION public.list_payroll_products_v2(p_search text DEFAULT NULL)
RETURNS TABLE(
  id uuid, sku text, name text, category text, specifications text, in_stock boolean,
  price_list_id uuid, price_list_name text, price_list_year integer,
  sku_match_count bigint, mapping_status text,
  current_rate_id uuid, current_rate numeric, current_rate_unit text,
  current_rate_effective_from date, current_rate_effective_to date
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_search text := NULLIF(btrim(p_search), '');
BEGIN
  IF NOT public.has_payroll_permission('payroll_rate_view')
     AND NOT public.has_payroll_permission('payroll_rate_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem đơn giá công';
  END IF;
  RETURN QUERY
  WITH catalog AS (
    SELECT p.id, p.sku, p.name, p.category, p.specifications,
      COALESCE(p.in_stock, true) AS in_stock,
      p.price_list_id, pl.name AS price_list_name, pl.year AS price_list_year,
      CASE WHEN NULLIF(btrim(p.sku), '') IS NULL THEN 0::bigint
        ELSE count(*) OVER (PARTITION BY lower(btrim(p.sku))) END AS sku_match_count
    FROM public.products p
    LEFT JOIN public.price_lists pl
      ON pl.id = p.price_list_id AND pl.tenant_id = p.tenant_id
    WHERE p.tenant_id = v_tenant
  )
  SELECT c.id, c.sku, c.name, c.category, c.specifications, c.in_stock,
    c.price_list_id, c.price_list_name, c.price_list_year, c.sku_match_count,
    CASE WHEN NULLIF(btrim(c.sku), '') IS NULL THEN 'MISSING_SKU'
      WHEN c.sku_match_count > 1 THEN 'AMBIGUOUS_SKU'
      ELSE 'UNIQUE_SKU' END,
    r.id, r.rate, r.unit, r.effective_from, r.effective_to
  FROM catalog c
  LEFT JOIN LATERAL (
    SELECT x.* FROM public.product_piece_rate_versions x
    WHERE x.tenant_id = v_tenant AND x.product_id = c.id
      AND x.status IN ('APPROVED','RETIRED')
      AND x.effective_from <= CURRENT_DATE
      AND (x.effective_to IS NULL OR x.effective_to >= CURRENT_DATE)
    ORDER BY x.effective_from DESC LIMIT 1
  ) r ON true
  WHERE v_search IS NULL
    OR c.name ILIKE '%' || v_search || '%'
    OR c.sku ILIKE '%' || v_search || '%'
    OR c.price_list_name ILIKE '%' || v_search || '%'
  ORDER BY c.sku NULLS LAST, c.name, c.price_list_year DESC NULLS LAST, c.price_list_name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_payroll_products_v2(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_worker_compensation_rate(uuid,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_payroll_products_v2(text),
  public.create_worker_compensation_rate(uuid,text,date,date,numeric,numeric,numeric,numeric,text,boolean),
  public.configure_worker_attendance_method(uuid,text,numeric,date,date,numeric,numeric,text,boolean)
TO authenticated;
REVOKE ALL ON FUNCTION public.guard_worker_compensation_rate_immutable() FROM PUBLIC, anon, authenticated;

COMMIT;
