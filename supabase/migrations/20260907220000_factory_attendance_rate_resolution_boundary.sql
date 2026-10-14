-- Keep worker-rate resolution private to server-owned attendance/payroll RPCs.
-- Public callers must use the permission-checked list/read endpoints; operational
-- attendance still needs the resolver internally to snapshot the effective rate.

BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_worker_compensation_rate(
  p_worker_id uuid,
  p_compensation_type text,
  p_fact_date date
)
RETURNS public.worker_compensation_rates
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_rate public.worker_compensation_rates;
BEGIN
  IF p_worker_id IS NULL OR p_compensation_type IS NULL OR p_fact_date IS NULL THEN
    RAISE EXCEPTION 'Thông tin tra cứu mức công không đầy đủ';
  END IF;

  SELECT r.*
  INTO v_rate
  FROM public.worker_compensation_rates r
  JOIN public.production_workers w
    ON w.id = r.worker_id
   AND w.tenant_id = r.tenant_id
  WHERE r.worker_id = p_worker_id
    AND r.tenant_id = v_tenant
    AND r.compensation_type = p_compensation_type
    AND r.status IN ('APPROVED', 'RETIRED')
    AND r.effective_from <= p_fact_date
    AND (r.effective_to IS NULL OR r.effective_to >= p_fact_date)
  ORDER BY r.effective_from DESC, r.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chưa có mức công hiệu lực cho công nhân';
  END IF;
  RETURN v_rate;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_worker_compensation_rate(uuid, text, date)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.resolve_worker_compensation_rate(uuid, text, date) IS
  'Private server-side resolver. Use permission-checked payroll read RPCs for client access.';

COMMIT;
