-- Sprint 1 completion: add an approval boundary to the existing worker-rate
-- table without creating a duplicate source of truth. Legacy attendance RPCs
-- continue to create APPROVED compatibility rows; the payroll UI uses the
-- draft/approve RPCs below.

BEGIN;

ALTER TABLE public.worker_compensation_rates
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS source_reference text,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.worker_compensation_rates'::regclass
      AND conname = 'worker_compensation_rates_status_check'
  ) THEN
    ALTER TABLE public.worker_compensation_rates
      ADD CONSTRAINT worker_compensation_rates_status_check
      CHECK (status IN ('DRAFT', 'APPROVED', 'RETIRED'));
  END IF;
END $$;

UPDATE public.worker_compensation_rates
SET approved_at = COALESCE(approved_at, created_at),
    approved_by = COALESCE(approved_by, created_by)
WHERE status IN ('APPROVED', 'RETIRED');

CREATE OR REPLACE FUNCTION public.set_worker_compensation_rate_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS worker_compensation_rates_updated_at ON public.worker_compensation_rates;
CREATE TRIGGER worker_compensation_rates_updated_at
BEFORE UPDATE ON public.worker_compensation_rates
FOR EACH ROW EXECUTE FUNCTION public.set_worker_compensation_rate_updated_at();

CREATE OR REPLACE FUNCTION public.reject_worker_rate_overlap()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('APPROVED', 'RETIRED') AND EXISTS (
    SELECT 1 FROM public.worker_compensation_rates r
    WHERE r.tenant_id = NEW.tenant_id
      AND r.worker_id = NEW.worker_id
      AND r.compensation_type = NEW.compensation_type
      AND r.id <> NEW.id
      AND r.status IN ('APPROVED', 'RETIRED')
      AND daterange(r.effective_from, COALESCE(r.effective_to + 1, 'infinity'::date), '[)')
          && daterange(NEW.effective_from, COALESCE(NEW.effective_to + 1, 'infinity'::date), '[)')
  ) THEN
    RAISE EXCEPTION 'Khoảng hiệu lực mức công bị chồng lấn';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS worker_compensation_rates_overlap ON public.worker_compensation_rates;
CREATE CONSTRAINT TRIGGER worker_compensation_rates_overlap
AFTER INSERT OR UPDATE ON public.worker_compensation_rates
DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW
EXECUTE FUNCTION public.reject_worker_rate_overlap();

-- Existing operational callers keep their legacy behavior, but every row is
-- explicitly marked approved so payroll resolvers never consume a draft.
CREATE OR REPLACE FUNCTION public.create_worker_compensation_rate(
  p_worker_id uuid, p_compensation_type text, p_effective_from date, p_effective_to date DEFAULT NULL,
  p_hourly_rate numeric DEFAULT NULL, p_piece_rate numeric DEFAULT NULL, p_monthly_rate numeric DEFAULT NULL,
  p_monthly_productive_minutes numeric DEFAULT NULL, p_reason text DEFAULT NULL, p_is_estimated boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_row public.worker_compensation_rates;
BEGIN
  IF NOT public.has_production_permission('production_worker_manage')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền quản lý mức công';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.production_workers w WHERE w.id = p_worker_id AND w.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Công nhân không cùng phạm vi dữ liệu';
  END IF;
  INSERT INTO public.worker_compensation_rates (
    tenant_id, worker_id, compensation_type, effective_from, effective_to,
    hourly_rate, piece_rate, monthly_rate, monthly_productive_minutes,
    reason, is_estimated, status, approved_by, approved_at, created_by
  ) VALUES (
    v_tenant, p_worker_id, p_compensation_type, p_effective_from, p_effective_to,
    p_hourly_rate, p_piece_rate, p_monthly_rate, p_monthly_productive_minutes,
    p_reason, p_is_estimated, 'APPROVED', auth.uid(), now(), auth.uid()
  ) RETURNING * INTO v_row;
  PERFORM public.write_cost_audit('worker_compensation_rates', v_row.id, 'CREATE', NULL, to_jsonb(v_row), p_reason);
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_worker_compensation_rates(p_worker_id uuid DEFAULT NULL)
RETURNS SETOF public.worker_compensation_rates
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r FROM public.worker_compensation_rates r
  WHERE r.tenant_id = public.require_default_tenant()
    AND (p_worker_id IS NULL OR r.worker_id = p_worker_id)
    AND public.payroll_worker_in_scope(r.worker_id)
    AND (
      public.has_payroll_permission('payroll_rate_view')
      OR public.has_payroll_permission('payroll_rate_manage')
      OR public.has_cost_permission('inventory_cost_view')
      OR public.has_production_permission('production_worker_manage')
      OR public.has_production_permission('production_manage')
    )
  ORDER BY r.worker_id, r.effective_from DESC, r.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.resolve_worker_compensation_rate(p_worker_id uuid, p_compensation_type text, p_fact_date date)
RETURNS public.worker_compensation_rates
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_rate public.worker_compensation_rates;
BEGIN
  IF NOT public.has_cost_permission('inventory_cost_view')
     AND NOT public.has_production_permission('production_worker_manage')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem mức công';
  END IF;
  SELECT r.* INTO v_rate
  FROM public.worker_compensation_rates r
  JOIN public.production_workers w ON w.id = r.worker_id AND w.tenant_id = v_tenant
  WHERE r.worker_id = p_worker_id AND r.tenant_id = v_tenant
    AND r.compensation_type = p_compensation_type
    AND r.status IN ('APPROVED', 'RETIRED')
    AND r.effective_from <= p_fact_date
    AND (r.effective_to IS NULL OR r.effective_to >= p_fact_date)
  ORDER BY r.effective_from DESC, r.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chưa có mức công hiệu lực cho công nhân'; END IF;
  RETURN v_rate;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_worker_payroll_rate_draft(
  p_worker_id uuid, p_compensation_type text, p_effective_from date, p_effective_to date DEFAULT NULL,
  p_hourly_rate numeric DEFAULT NULL, p_piece_rate numeric DEFAULT NULL, p_monthly_rate numeric DEFAULT NULL,
  p_monthly_productive_minutes numeric DEFAULT NULL, p_source_reference text DEFAULT NULL,
  p_reason text DEFAULT NULL, p_is_estimated boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_row public.worker_compensation_rates;
BEGIN
  IF NOT public.has_payroll_permission('payroll_rate_manage') THEN RAISE EXCEPTION 'Bạn không có quyền tạo mức lương'; END IF;
  IF NOT public.payroll_worker_in_scope(p_worker_id) THEN RAISE EXCEPTION 'Nhân sự ngoài phạm vi được phân quyền'; END IF;
  IF p_effective_from IS NULL OR (p_effective_to IS NOT NULL AND p_effective_to < p_effective_from) THEN RAISE EXCEPTION 'Khoảng hiệu lực không hợp lệ'; END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Lý do tạo mức lương là bắt buộc'; END IF;
  IF p_compensation_type NOT IN ('MONTHLY_MANAGER','MONTHLY_HELPER','PIECE_RATE','HOURLY') THEN RAISE EXCEPTION 'Loại trả lương không hợp lệ'; END IF;
  INSERT INTO public.worker_compensation_rates (
    tenant_id, worker_id, compensation_type, effective_from, effective_to,
    hourly_rate, piece_rate, monthly_rate, monthly_productive_minutes,
    source_reference, reason, is_estimated, status, created_by
  ) VALUES (
    v_tenant, p_worker_id, p_compensation_type, p_effective_from, p_effective_to,
    p_hourly_rate, p_piece_rate, p_monthly_rate, p_monthly_productive_minutes,
    NULLIF(btrim(p_source_reference), ''), btrim(p_reason), p_is_estimated, 'DRAFT', auth.uid()
  ) RETURNING * INTO v_row;
  PERFORM public.write_cost_audit('worker_compensation_rates', v_row.id, 'CREATE_DRAFT', NULL, to_jsonb(v_row), btrim(p_reason));
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_worker_payroll_rate_draft(
  p_rate_id uuid, p_effective_from date, p_effective_to date DEFAULT NULL,
  p_hourly_rate numeric DEFAULT NULL, p_piece_rate numeric DEFAULT NULL, p_monthly_rate numeric DEFAULT NULL,
  p_monthly_productive_minutes numeric DEFAULT NULL, p_source_reference text DEFAULT NULL,
  p_reason text DEFAULT NULL, p_is_estimated boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_before public.worker_compensation_rates; v_row public.worker_compensation_rates;
BEGIN
  IF NOT public.has_payroll_permission('payroll_rate_manage') THEN RAISE EXCEPTION 'Bạn không có quyền sửa mức lương'; END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Lý do sửa mức lương là bắt buộc'; END IF;
  SELECT * INTO v_before FROM public.worker_compensation_rates r
  WHERE r.id = p_rate_id AND r.tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND OR NOT public.payroll_worker_in_scope(v_before.worker_id) THEN RAISE EXCEPTION 'Không tìm thấy mức lương'; END IF;
  IF v_before.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ mức lương nháp mới được sửa'; END IF;
  IF p_effective_to IS NOT NULL AND p_effective_to < p_effective_from THEN RAISE EXCEPTION 'Khoảng hiệu lực không hợp lệ'; END IF;
  UPDATE public.worker_compensation_rates SET
    effective_from = p_effective_from, effective_to = p_effective_to,
    hourly_rate = p_hourly_rate, piece_rate = p_piece_rate, monthly_rate = p_monthly_rate,
    monthly_productive_minutes = p_monthly_productive_minutes,
    source_reference = NULLIF(btrim(p_source_reference), ''), reason = btrim(p_reason),
    is_estimated = p_is_estimated
  WHERE id = p_rate_id RETURNING * INTO v_row;
  PERFORM public.write_cost_audit('worker_compensation_rates', v_row.id, 'UPDATE_DRAFT', to_jsonb(v_before), to_jsonb(v_row), btrim(p_reason));
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_worker_payroll_rate(
  p_rate_id uuid, p_reason text, p_supersede_previous boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_row public.worker_compensation_rates; v_previous public.worker_compensation_rates; v_after public.worker_compensation_rates;
BEGIN
  IF NOT public.has_payroll_permission('payroll_rate_manage') THEN RAISE EXCEPTION 'Bạn không có quyền duyệt mức lương'; END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Lý do duyệt mức lương là bắt buộc'; END IF;
  SELECT * INTO v_row FROM public.worker_compensation_rates r WHERE r.id = p_rate_id AND r.tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND OR NOT public.payroll_worker_in_scope(v_row.worker_id) THEN RAISE EXCEPTION 'Không tìm thấy mức lương'; END IF;
  IF v_row.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ mức lương nháp mới được duyệt'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('worker-rate:' || v_tenant || ':' || v_row.worker_id::text || ':' || v_row.compensation_type, 0));
  IF EXISTS (
    SELECT 1 FROM public.worker_compensation_rates r
    WHERE r.tenant_id = v_tenant AND r.worker_id = v_row.worker_id AND r.compensation_type = v_row.compensation_type
      AND r.id <> v_row.id AND r.status IN ('APPROVED','RETIRED') AND r.effective_from >= v_row.effective_from
      AND daterange(r.effective_from, COALESCE(r.effective_to + 1, 'infinity'::date), '[)')
          && daterange(v_row.effective_from, COALESCE(v_row.effective_to + 1, 'infinity'::date), '[)')
  ) THEN RAISE EXCEPTION 'Đã có mức lương cùng hoặc sau ngày hiệu lực này'; END IF;
  SELECT * INTO v_previous FROM public.worker_compensation_rates r
  WHERE r.tenant_id = v_tenant AND r.worker_id = v_row.worker_id AND r.compensation_type = v_row.compensation_type
    AND r.id <> v_row.id AND r.status IN ('APPROVED','RETIRED') AND r.effective_from < v_row.effective_from
    AND (r.effective_to IS NULL OR r.effective_to >= v_row.effective_from)
  ORDER BY r.effective_from DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF NOT p_supersede_previous THEN RAISE EXCEPTION 'Khoảng hiệu lực mức lương bị chồng lấn'; END IF;
    UPDATE public.worker_compensation_rates SET status = 'RETIRED', effective_to = v_row.effective_from - 1 WHERE id = v_previous.id RETURNING * INTO v_previous;
    PERFORM public.write_cost_audit('worker_compensation_rates', v_previous.id, 'SUPERSEDE', NULL, to_jsonb(v_previous), btrim(p_reason));
  END IF;
  UPDATE public.worker_compensation_rates SET status = 'APPROVED', approved_by = auth.uid(), approved_at = now() WHERE id = v_row.id RETURNING * INTO v_after;
  PERFORM public.write_cost_audit('worker_compensation_rates', v_after.id, 'APPROVE', to_jsonb(v_row), to_jsonb(v_after), btrim(p_reason));
  RETURN to_jsonb(v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.discard_worker_payroll_rate_draft(p_rate_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_row public.worker_compensation_rates;
BEGIN
  IF NOT public.has_payroll_permission('payroll_rate_manage') THEN RAISE EXCEPTION 'Bạn không có quyền hủy mức lương'; END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Lý do hủy mức lương là bắt buộc'; END IF;
  SELECT * INTO v_row FROM public.worker_compensation_rates r WHERE r.id = p_rate_id AND r.tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND OR NOT public.payroll_worker_in_scope(v_row.worker_id) THEN RAISE EXCEPTION 'Không tìm thấy mức lương'; END IF;
  IF v_row.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ mức lương nháp mới được hủy'; END IF;
  DELETE FROM public.worker_compensation_rates WHERE id = v_row.id;
  PERFORM public.write_cost_audit('worker_compensation_rates', v_row.id, 'DISCARD_DRAFT', to_jsonb(v_row), NULL, btrim(p_reason));
  RETURN to_jsonb(v_row);
END;
$$;

-- Return the same canonical projection as list_payroll_workers so the client
-- never receives a raw production_workers row with missing payroll fields.
CREATE OR REPLACE FUNCTION public.update_payroll_worker_master(
  p_worker_id uuid, p_location_code text DEFAULT NULL, p_position_title text DEFAULT NULL,
  p_employment_type text DEFAULT NULL, p_employment_start_date date DEFAULT NULL,
  p_employment_end_date date DEFAULT NULL, p_payroll_status text DEFAULT 'ACTIVE', p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_before public.production_workers; v_row public.production_workers; v_projection jsonb;
BEGIN
  IF NOT public.payroll_worker_manageable(p_worker_id) THEN RAISE EXCEPTION 'Bạn không có quyền cập nhật nhân sự này'; END IF;
  IF p_employment_type IS NOT NULL THEN RAISE EXCEPTION 'Loại lương chỉ được thay đổi qua phân loại lương có hiệu lực'; END IF;
  IF p_payroll_status NOT IN ('ACTIVE','SUSPENDED','TERMINATED') THEN RAISE EXCEPTION 'Trạng thái lương không hợp lệ'; END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Lý do cập nhật nhân sự là bắt buộc'; END IF;
  SELECT * INTO v_before FROM public.production_workers WHERE id = p_worker_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy nhân sự'; END IF;
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  UPDATE public.production_workers SET
    location_code = NULLIF(upper(btrim(p_location_code)), ''), position_title = NULLIF(btrim(p_position_title), ''),
    employment_start_date = p_employment_start_date, employment_end_date = p_employment_end_date,
    payroll_status = p_payroll_status, updated_at = now()
  WHERE id = p_worker_id AND tenant_id = v_tenant RETURNING * INTO v_row;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  PERFORM public.write_cost_audit('production_workers', v_row.id, 'UPDATE', to_jsonb(v_before), to_jsonb(v_row), btrim(p_reason));
  SELECT to_jsonb(x) INTO v_projection FROM public.list_payroll_workers(true) x WHERE x.id = p_worker_id;
  RETURN COALESCE(v_projection, to_jsonb(v_row));
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_worker_compensation_rates(uuid),
  public.create_worker_payroll_rate_draft(uuid,text,date,date,numeric,numeric,numeric,numeric,text,text,boolean),
  public.update_worker_payroll_rate_draft(uuid,date,date,numeric,numeric,numeric,numeric,text,text,boolean),
  public.approve_worker_payroll_rate(uuid,text,boolean),
  public.discard_worker_payroll_rate_draft(uuid,text)
TO authenticated;

COMMIT;
