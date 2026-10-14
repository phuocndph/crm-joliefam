-- Sprint 5B: harden production attendance without rewriting posted facts.
-- Additive only. Existing rows remain valid and existing attendance RPC callers
-- keep the same signature.

ALTER TABLE public.audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_action_check
  CHECK (action IN (
    'CREATE', 'UPDATE', 'DELETE', 'CONFIRM', 'VOID', 'APPROVE', 'SUPERSEDE',
    'RELEASE', 'COMPLETE', 'START', 'PAUSE', 'RESUME', 'HOLD', 'CANCEL', 'REPLAN',
    'ASSIGN', 'UNASSIGN', 'REVERSE'
  ));

ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS attendance_assignment_enforced boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.production_order_worker_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE RESTRICT,
  production_order_operation_id uuid REFERENCES public.production_order_operations(id) ON DELETE RESTRICT,
  worker_id uuid NOT NULL REFERENCES public.production_workers(id) ON DELETE RESTRICT,
  assigned_from date NOT NULL,
  assigned_to date,
  source text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'BACKFILL')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ended_at timestamptz,
  end_reason text,
  CHECK (assigned_to IS NULL OR assigned_to >= assigned_from)
);
CREATE INDEX IF NOT EXISTS production_order_worker_assignments_order_idx
  ON public.production_order_worker_assignments (tenant_id, production_order_id, assigned_from, assigned_to, worker_id);
CREATE INDEX IF NOT EXISTS production_order_worker_assignments_worker_idx
  ON public.production_order_worker_assignments (tenant_id, worker_id, assigned_from, assigned_to);

CREATE OR REPLACE FUNCTION public.validate_production_worker_assignment()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.production_orders po
    WHERE po.id = NEW.production_order_id AND po.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Lệnh sản xuất không cùng phạm vi dữ liệu';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.production_workers w
    WHERE w.id = NEW.worker_id AND w.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Nhân sự không cùng phạm vi dữ liệu';
  END IF;
  IF NEW.production_order_operation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_order_operations o
    WHERE o.id = NEW.production_order_operation_id
      AND o.production_order_id = NEW.production_order_id
      AND o.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Công đoạn không thuộc lệnh sản xuất';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.production_order_worker_assignments a
    WHERE a.tenant_id = NEW.tenant_id
      AND a.id <> NEW.id
      AND a.production_order_id = NEW.production_order_id
      AND a.worker_id = NEW.worker_id
      AND a.production_order_operation_id IS NOT DISTINCT FROM NEW.production_order_operation_id
      AND daterange(a.assigned_from, COALESCE(a.assigned_to + 1, 'infinity'::date), '[)')
          && daterange(NEW.assigned_from, COALESCE(NEW.assigned_to + 1, 'infinity'::date), '[)')
  ) THEN
    RAISE EXCEPTION 'Phân công nhân sự bị chồng thời gian';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS production_worker_assignment_scope ON public.production_order_worker_assignments;
CREATE TRIGGER production_worker_assignment_scope
BEFORE INSERT OR UPDATE ON public.production_order_worker_assignments
FOR EACH ROW EXECUTE FUNCTION public.validate_production_worker_assignment();

-- This trigger is the last line of defence for the lower-level labor RPC too.
-- The attendance facade performs the same checks for friendly error messages,
-- while this keeps direct calls to record_production_labor_fact safe.
CREATE OR REPLACE FUNCTION public.guard_production_labor_fact_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.production_orders;
  v_day_total numeric;
  v_hour_total numeric;
  v_has_conflicting_type boolean;
BEGIN
  SELECT * INTO v_order
  FROM public.production_orders
  WHERE id = NEW.production_order_id AND tenant_id = NEW.tenant_id
  FOR UPDATE;
  IF NOT FOUND OR v_order.status NOT IN ('RELEASED', 'IN_PROGRESS', 'ON_HOLD') THEN
    RAISE EXCEPTION 'Chỉ lệnh đã phát hành, đang thực hiện hoặc tạm dừng mới được ghi nhận nhân công';
  END IF;
  IF NEW.fact_date IS NULL OR NEW.fact_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Ngày ghi nhận nhân công không được ở tương lai';
  END IF;
  IF v_order.planned_start_date IS NOT NULL AND NEW.fact_date < v_order.planned_start_date THEN
    RAISE EXCEPTION 'Ngày ghi nhận nhân công trước ngày bắt đầu lệnh';
  END IF;
  -- Planned end is advisory for active work: an order can legitimately run
  -- over schedule, but future dates are still rejected above.
  PERFORM pg_advisory_xact_lock(hashtextextended('attendance-cap:' || NEW.tenant_id || ':' || NEW.worker_id::text || ':' || NEW.fact_date::text, 0));
  SELECT COALESCE(sum(f.quantity), 0) INTO v_day_total
  FROM public.production_operation_labor_facts f
  WHERE f.tenant_id = NEW.tenant_id AND f.worker_id = NEW.worker_id AND f.fact_date = NEW.fact_date
    AND f.compensation_type IN ('MONTHLY_MANAGER', 'MONTHLY_HELPER')
    AND NOT EXISTS (SELECT 1 FROM public.production_attendance_reversals r WHERE r.tenant_id=f.tenant_id AND r.labor_fact_id=f.id);
  SELECT COALESCE(sum(f.minutes) / 60.0, 0) INTO v_hour_total
  FROM public.production_operation_labor_facts f
  WHERE f.tenant_id = NEW.tenant_id AND f.worker_id = NEW.worker_id AND f.fact_date = NEW.fact_date
    AND f.compensation_type = 'HOURLY'
    AND NOT EXISTS (SELECT 1 FROM public.production_attendance_reversals r WHERE r.tenant_id=f.tenant_id AND r.labor_fact_id=f.id);
  SELECT EXISTS (
    SELECT 1
    FROM public.production_operation_labor_facts f
    WHERE f.tenant_id = NEW.tenant_id
      AND f.worker_id = NEW.worker_id
      AND f.fact_date = NEW.fact_date
      AND f.compensation_type <> NEW.compensation_type
      AND NOT EXISTS (
        SELECT 1 FROM public.production_attendance_reversals r
        WHERE r.tenant_id = f.tenant_id AND r.labor_fact_id = f.id
      )
  ) INTO v_has_conflicting_type;
  IF v_has_conflicting_type THEN
    RAISE EXCEPTION 'Nhân sự không thể chấm nhiều loại trả công trong cùng một ngày';
  END IF;
  IF NEW.compensation_type IN ('MONTHLY_MANAGER', 'MONTHLY_HELPER') AND v_day_total + NEW.quantity > 2 THEN
    RAISE EXCEPTION 'Tổng ngày công của nhân sự trong ngày vượt 2 ngày (đã có %)', v_day_total;
  END IF;
  IF NEW.compensation_type = 'HOURLY' AND v_hour_total + NEW.minutes / 60.0 > 24 THEN
    RAISE EXCEPTION 'Tổng giờ công của nhân sự trong ngày vượt 24 giờ (đã có %)', v_hour_total;
  END IF;
  IF v_order.attendance_assignment_enforced AND NOT EXISTS (
    SELECT 1 FROM public.production_order_worker_assignments a
    WHERE a.tenant_id=NEW.tenant_id AND a.production_order_id=NEW.production_order_id
      AND a.worker_id=NEW.worker_id AND NEW.fact_date>=a.assigned_from
      AND (a.assigned_to IS NULL OR NEW.fact_date<=a.assigned_to)
      AND (a.production_order_operation_id IS NULL OR a.production_order_operation_id=NEW.production_order_operation_id)
  ) THEN
    RAISE EXCEPTION 'Nhân sự chưa được phân công cho lệnh/công đoạn vào ngày này';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS production_labor_fact_insert_guard ON public.production_operation_labor_facts;
CREATE TRIGGER production_labor_fact_insert_guard
BEFORE INSERT ON public.production_operation_labor_facts
FOR EACH ROW EXECUTE FUNCTION public.guard_production_labor_fact_insert();

CREATE TABLE IF NOT EXISTS public.production_attendance_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  labor_fact_id uuid NOT NULL UNIQUE REFERENCES public.production_operation_labor_facts(id) ON DELETE RESTRICT,
  labor_cost_entry_id uuid UNIQUE REFERENCES public.labor_cost_entries(id) ON DELETE RESTRICT,
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE RESTRICT,
  production_order_operation_id uuid NOT NULL REFERENCES public.production_order_operations(id) ON DELETE RESTRICT,
  worker_id uuid NOT NULL REFERENCES public.production_workers(id) ON DELETE RESTRICT,
  fact_date date NOT NULL,
  reversed_amount numeric(18,2) NOT NULL CHECK (reversed_amount >= 0),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  idempotency_key text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS production_attendance_reversals_order_idx
  ON public.production_attendance_reversals (tenant_id, production_order_id, fact_date);

CREATE OR REPLACE FUNCTION public.validate_attendance_reversal()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_fact public.production_operation_labor_facts; v_entry public.labor_cost_entries;
BEGIN
  SELECT * INTO v_fact FROM public.production_operation_labor_facts
  WHERE id = NEW.labor_fact_id AND tenant_id = NEW.tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bản ghi chấm công không cùng phạm vi dữ liệu'; END IF;
  SELECT * INTO v_entry FROM public.labor_cost_entries WHERE labor_fact_id = v_fact.id AND tenant_id = NEW.tenant_id;
  IF NEW.production_order_id <> v_fact.production_order_id
     OR NEW.production_order_operation_id <> v_fact.production_order_operation_id
     OR NEW.worker_id <> v_fact.worker_id
     OR NEW.fact_date <> v_fact.fact_date
     OR NEW.reversed_amount <> v_fact.calculated_amount THEN
    RAISE EXCEPTION 'Bản đảo phải giữ nguyên ảnh chụp của bản ghi gốc';
  END IF;
  IF NEW.labor_cost_entry_id IS DISTINCT FROM v_entry.id THEN
    RAISE EXCEPTION 'Bản đảo không khớp bút toán chi phí nhân công';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS production_attendance_reversal_scope ON public.production_attendance_reversals;
CREATE TRIGGER production_attendance_reversal_scope
BEFORE INSERT OR UPDATE ON public.production_attendance_reversals
FOR EACH ROW EXECUTE FUNCTION public.validate_attendance_reversal();

CREATE OR REPLACE FUNCTION public.assign_production_order_worker(
  p_production_order_id uuid,
  p_worker_id uuid,
  p_production_order_operation_id uuid DEFAULT NULL,
  p_assigned_from date DEFAULT CURRENT_DATE,
  p_assigned_to date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_row public.production_order_worker_assignments;
BEGIN
  IF NOT public.has_production_permission('production_worker_manage') AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền phân công nhân sự';
  END IF;
  IF p_assigned_from IS NULL OR p_assigned_to IS NOT NULL AND p_assigned_to < p_assigned_from THEN
    RAISE EXCEPTION 'Khoảng ngày phân công không hợp lệ';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('assignment:' || v_tenant || ':' || p_production_order_id::text || ':' || p_worker_id::text, 0));
  INSERT INTO public.production_order_worker_assignments (
    tenant_id, production_order_id, production_order_operation_id, worker_id,
    assigned_from, assigned_to, notes, created_by
  ) VALUES (
    v_tenant, p_production_order_id, p_production_order_operation_id, p_worker_id,
    p_assigned_from, p_assigned_to, NULLIF(btrim(p_notes), ''), auth.uid()
  ) RETURNING * INTO v_row;
  PERFORM public.write_cost_audit('production_order_worker_assignments', v_row.id, 'ASSIGN', NULL, to_jsonb(v_row), v_row.notes);
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.end_production_order_worker_assignment(
  p_assignment_id uuid, p_assigned_to date DEFAULT CURRENT_DATE, p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_row public.production_order_worker_assignments; v_before jsonb;
BEGIN
  IF NOT public.has_production_permission('production_worker_manage') AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền kết thúc phân công';
  END IF;
  SELECT * INTO v_row FROM public.production_order_worker_assignments WHERE id=p_assignment_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Phân công không tồn tại'; END IF;
  IF v_row.ended_at IS NOT NULL THEN RAISE EXCEPTION 'Phân công đã được kết thúc'; END IF;
  IF p_assigned_to IS NULL OR p_assigned_to < v_row.assigned_from THEN RAISE EXCEPTION 'Ngày kết thúc phân công không hợp lệ'; END IF;
  v_before := to_jsonb(v_row);
  UPDATE public.production_order_worker_assignments
  SET assigned_to=p_assigned_to, ended_by=auth.uid(), ended_at=now(), end_reason=NULLIF(btrim(p_reason), '')
  WHERE id=v_row.id
  RETURNING * INTO v_row;
  PERFORM public.write_cost_audit('production_order_worker_assignments', v_row.id, 'UNASSIGN', v_before, to_jsonb(v_row), p_reason);
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_production_order_assignment_enforcement(
  p_production_order_id uuid, p_enforced boolean, p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_po public.production_orders; v_before jsonb;
BEGIN
  IF NOT public.has_production_permission('production_worker_manage') AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền bật kiểm soát phân công';
  END IF;
  SELECT * INTO v_po FROM public.production_orders WHERE id=p_production_order_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lệnh sản xuất không tồn tại'; END IF;
  IF p_enforced AND NOT EXISTS (SELECT 1 FROM public.production_order_worker_assignments a WHERE a.production_order_id=v_po.id AND a.tenant_id=v_tenant AND (a.assigned_to IS NULL OR a.assigned_to >= COALESCE(v_po.planned_start_date, CURRENT_DATE))) THEN
    RAISE EXCEPTION 'Cần có ít nhất một phân công trước khi bật kiểm soát';
  END IF;
  v_before := to_jsonb(v_po);
  UPDATE public.production_orders SET attendance_assignment_enforced=p_enforced WHERE id=v_po.id RETURNING * INTO v_po;
  PERFORM public.write_cost_audit('production_orders', v_po.id, CASE WHEN p_enforced THEN 'ASSIGN' ELSE 'UNASSIGN' END, v_before, to_jsonb(v_po), p_reason);
  RETURN to_jsonb(v_po);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_production_order_worker_assignments(p_production_order_id uuid)
RETURNS TABLE (
  id uuid, production_order_id uuid, production_order_operation_id uuid, worker_id uuid,
  employee_code text, worker_name text, worker_type text, assigned_from date, assigned_to date,
  notes text, is_active boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant();
BEGIN
  IF NOT public.has_production_permission('production_view') AND NOT public.has_production_permission('production_operations') AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem phân công';
  END IF;
  RETURN QUERY
  SELECT a.id, a.production_order_id, a.production_order_operation_id, a.worker_id,
    w.employee_code, w.display_name, w.worker_type, a.assigned_from, a.assigned_to, a.notes,
    (a.assigned_to IS NULL OR a.assigned_to >= CURRENT_DATE) AND w.is_active
  FROM public.production_order_worker_assignments a
  JOIN public.production_workers w ON w.id=a.worker_id AND w.tenant_id=a.tenant_id
  WHERE a.tenant_id=v_tenant AND a.production_order_id=p_production_order_id
  ORDER BY w.employee_code, a.assigned_from;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_production_attendance(
  p_production_order_operation_id uuid, p_worker_id uuid, p_attendance_method text,
  p_work_date date DEFAULT CURRENT_DATE, p_day_units numeric DEFAULT NULL,
  p_work_hours numeric DEFAULT NULL, p_output_quantity numeric DEFAULT NULL,
  p_standard_hours_per_day numeric DEFAULT 8, p_idempotency_key text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant(); v_worker public.production_workers;
  v_operation public.production_order_operations; v_order public.production_orders;
  v_compensation_type text; v_quantity numeric := 0; v_accepted numeric := 0; v_minutes numeric := 0;
  v_key text := NULLIF(btrim(p_idempotency_key), ''); v_existing public.production_operation_labor_facts;
  v_entry public.labor_cost_entries; v_result jsonb; v_day_total numeric; v_hour_total numeric; v_has_conflicting_type boolean;
BEGIN
  IF NOT public.has_production_permission('production_operations') AND NOT public.has_production_permission('production_manage') THEN RAISE EXCEPTION 'Bạn không có quyền chấm công'; END IF;
  IF v_key IS NULL THEN RAISE EXCEPTION 'Idempotency key là bắt buộc'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('attendance-key:' || v_tenant || ':' || v_key, 0));
  SELECT * INTO v_operation FROM public.production_order_operations WHERE id=p_production_order_operation_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Công đoạn không tồn tại'; END IF;
  SELECT * INTO v_order FROM public.production_orders WHERE id=v_operation.production_order_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND OR v_order.status NOT IN ('RELEASED','IN_PROGRESS','ON_HOLD') THEN RAISE EXCEPTION 'Chỉ lệnh đã phát hành, đang thực hiện hoặc tạm dừng mới được chấm công'; END IF;
  IF p_work_date IS NULL OR p_work_date > CURRENT_DATE THEN RAISE EXCEPTION 'Ngày chấm công không được ở tương lai'; END IF;
  IF v_order.planned_start_date IS NOT NULL AND p_work_date < v_order.planned_start_date THEN RAISE EXCEPTION 'Ngày chấm công trước ngày bắt đầu lệnh'; END IF;
  SELECT * INTO v_worker FROM public.production_workers WHERE id=p_worker_id AND tenant_id=v_tenant AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nhân sự không tồn tại hoặc không hoạt động'; END IF;
  v_compensation_type := COALESCE((SELECT default_compensation_type FROM public.worker_compensation_profiles WHERE worker_id=v_worker.id AND tenant_id=v_tenant AND is_active), CASE WHEN v_worker.worker_type='SUPERVISOR' THEN 'MONTHLY_MANAGER' WHEN v_worker.worker_type='HELPER' THEN 'MONTHLY_HELPER' WHEN v_worker.worker_type='SEWER' THEN 'PIECE_RATE' ELSE 'HOURLY' END);
  IF p_attendance_method='DAY' THEN
    IF v_compensation_type NOT IN ('MONTHLY_MANAGER','MONTHLY_HELPER') THEN RAISE EXCEPTION 'Vị trí này chưa được cấu hình chấm công theo ngày'; END IF;
    IF p_day_units IS NULL OR p_day_units <= 0 OR p_day_units > 2 THEN RAISE EXCEPTION 'Số ngày công phải lớn hơn 0 và không vượt quá 2'; END IF;
    IF p_standard_hours_per_day IS NULL OR p_standard_hours_per_day <= 0 OR p_standard_hours_per_day > 24 THEN RAISE EXCEPTION 'Số giờ chuẩn trong ngày không hợp lệ'; END IF;
    v_quantity:=p_day_units; v_minutes:=p_day_units*p_standard_hours_per_day*60;
  ELSIF p_attendance_method='HOUR' THEN
    IF v_compensation_type <> 'HOURLY' THEN RAISE EXCEPTION 'Vị trí này chưa được cấu hình chấm công theo giờ'; END IF;
    IF p_work_hours IS NULL OR p_work_hours <= 0 OR p_work_hours > 24 THEN RAISE EXCEPTION 'Số giờ làm phải lớn hơn 0 và không vượt quá 24'; END IF;
    v_quantity:=p_work_hours; v_minutes:=p_work_hours*60;
  ELSIF p_attendance_method='OUTPUT' THEN
    IF v_compensation_type <> 'PIECE_RATE' THEN RAISE EXCEPTION 'Vị trí này chưa được cấu hình chấm công theo sản lượng'; END IF;
    IF p_output_quantity IS NULL OR p_output_quantity <= 0 THEN RAISE EXCEPTION 'Sản lượng đạt phải lớn hơn 0'; END IF;
    v_quantity:=p_output_quantity; v_accepted:=p_output_quantity;
  ELSE RAISE EXCEPTION 'Hình thức chấm công không hợp lệ';
  END IF;
  IF (p_attendance_method = 'DAY' AND v_compensation_type NOT IN ('MONTHLY_MANAGER','MONTHLY_HELPER'))
     OR (p_attendance_method = 'HOUR' AND v_compensation_type <> 'HOURLY')
     OR (p_attendance_method = 'OUTPUT' AND v_compensation_type <> 'PIECE_RATE') THEN
    RAISE EXCEPTION 'Hình thức chấm công không khớp hồ sơ nhân sự';
  END IF;
  SELECT * INTO v_existing FROM public.production_operation_labor_facts WHERE tenant_id=v_tenant AND idempotency_key=v_key;
  IF FOUND THEN
    IF v_existing.production_order_operation_id<>v_operation.id OR v_existing.worker_id<>v_worker.id OR v_existing.fact_date<>p_work_date OR v_existing.quantity<>v_quantity OR v_existing.accepted_quantity<>v_accepted OR v_existing.minutes<>v_minutes OR v_existing.notes IS DISTINCT FROM NULLIF(btrim(p_notes),'') THEN
      RAISE EXCEPTION 'Idempotency key đã được dùng cho dữ liệu khác';
    END IF;
    SELECT * INTO v_entry FROM public.labor_cost_entries WHERE labor_fact_id=v_existing.id AND tenant_id=v_tenant;
    IF NOT public.has_cost_permission('inventory_cost_view') THEN
      RETURN jsonb_build_object('fact_id',v_existing.id,'entry_id',v_entry.id,'reused',true,'attendance_method',p_attendance_method,'attendance_value',CASE WHEN p_attendance_method='DAY' THEN p_day_units WHEN p_attendance_method='HOUR' THEN p_work_hours ELSE p_output_quantity END,'cost_visible',false);
    END IF;
    RETURN jsonb_build_object('fact',to_jsonb(v_existing),'entry',to_jsonb(v_entry),'reused',true,'attendance_method',p_attendance_method,'attendance_value',CASE WHEN p_attendance_method='DAY' THEN p_day_units WHEN p_attendance_method='HOUR' THEN p_work_hours ELSE p_output_quantity END,'cost_visible',true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('attendance-cap:' || v_tenant || ':' || v_worker.id::text || ':' || p_work_date::text, 0));
  SELECT COALESCE(sum(f.quantity),0) INTO v_day_total
  FROM public.production_operation_labor_facts f
  WHERE f.tenant_id=v_tenant AND f.worker_id=v_worker.id AND f.fact_date=p_work_date
    AND f.compensation_type IN ('MONTHLY_MANAGER','MONTHLY_HELPER')
    AND NOT EXISTS (SELECT 1 FROM public.production_attendance_reversals r WHERE r.labor_fact_id=f.id AND r.tenant_id=f.tenant_id);
  SELECT COALESCE(sum(f.minutes)/60.0,0) INTO v_hour_total
  FROM public.production_operation_labor_facts f
  WHERE f.tenant_id=v_tenant AND f.worker_id=v_worker.id AND f.fact_date=p_work_date
    AND f.compensation_type='HOURLY'
    AND NOT EXISTS (SELECT 1 FROM public.production_attendance_reversals r WHERE r.labor_fact_id=f.id AND r.tenant_id=f.tenant_id);
  SELECT EXISTS (
    SELECT 1 FROM public.production_operation_labor_facts f
    WHERE f.tenant_id=v_tenant AND f.worker_id=v_worker.id AND f.fact_date=p_work_date
      AND f.compensation_type<>v_compensation_type
      AND NOT EXISTS (SELECT 1 FROM public.production_attendance_reversals r WHERE r.labor_fact_id=f.id AND r.tenant_id=f.tenant_id)
  ) INTO v_has_conflicting_type;
  IF v_has_conflicting_type THEN RAISE EXCEPTION 'Nhân sự không thể chấm nhiều loại trả công trong cùng một ngày'; END IF;
  IF p_attendance_method='DAY' AND v_day_total+v_quantity>2 THEN RAISE EXCEPTION 'Tổng ngày công của nhân sự trong ngày vượt 2 ngày (đã có %)', v_day_total; END IF;
  IF p_attendance_method='HOUR' AND v_hour_total+(v_minutes/60.0)>24 THEN RAISE EXCEPTION 'Tổng giờ công của nhân sự trong ngày vượt 24 giờ (đã có %)', v_hour_total; END IF;
  IF v_order.attendance_assignment_enforced AND NOT EXISTS (
    SELECT 1 FROM public.production_order_worker_assignments a
    WHERE a.tenant_id=v_tenant AND a.production_order_id=v_order.id AND a.worker_id=v_worker.id
      AND p_work_date>=a.assigned_from AND (a.assigned_to IS NULL OR p_work_date<=a.assigned_to)
      AND (a.production_order_operation_id IS NULL OR a.production_order_operation_id=v_operation.id)
  ) THEN RAISE EXCEPTION 'Nhân sự chưa được phân công cho lệnh/công đoạn vào ngày này'; END IF;
  v_result := public.record_production_labor_fact(v_operation.id,v_worker.id,v_quantity,v_accepted,v_minutes,p_work_date,v_compensation_type,v_key,NULL,p_notes);
  IF NOT public.has_cost_permission('inventory_cost_view') THEN
    RETURN jsonb_build_object('fact_id',v_result->'fact'->>'id','entry_id',v_result->'entry'->>'id','reused',COALESCE((v_result->>'reused')::boolean,false),'attendance_method',p_attendance_method,'attendance_value',CASE WHEN p_attendance_method='DAY' THEN p_day_units WHEN p_attendance_method='HOUR' THEN p_work_hours ELSE p_output_quantity END,'cost_visible',false);
  END IF;
  RETURN v_result || jsonb_build_object('attendance_method',p_attendance_method,'attendance_value',CASE WHEN p_attendance_method='DAY' THEN p_day_units WHEN p_attendance_method='HOUR' THEN p_work_hours ELSE p_output_quantity END,'cost_visible',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_production_attendance(
  p_labor_fact_id uuid, p_reason text, p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_fact public.production_operation_labor_facts; v_entry public.labor_cost_entries; v_row public.production_attendance_reversals; v_key text:=NULLIF(btrim(p_idempotency_key),'');
BEGIN
  IF NOT public.has_production_permission('production_manage') THEN RAISE EXCEPTION 'Bạn không có quyền đảo bản ghi chấm công'; END IF;
  IF NULLIF(btrim(p_reason),'') IS NULL OR v_key IS NULL THEN RAISE EXCEPTION 'Lý do và mã yêu cầu là bắt buộc'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('attendance-reversal:'||v_tenant||':'||v_key,0));
  SELECT * INTO v_row FROM public.production_attendance_reversals WHERE tenant_id=v_tenant AND idempotency_key=v_key;
  IF FOUND THEN
    IF v_row.labor_fact_id <> p_labor_fact_id OR v_row.reason <> btrim(p_reason) THEN
      RAISE EXCEPTION 'Idempotency key đã được dùng cho dữ liệu đảo khác';
    END IF;
    RETURN jsonb_build_object('id',v_row.id,'reused',true,'labor_fact_id',v_row.labor_fact_id);
  END IF;
  SELECT * INTO v_fact FROM public.production_operation_labor_facts WHERE id=p_labor_fact_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bản ghi chấm công không tồn tại'; END IF;
  IF EXISTS (SELECT 1 FROM public.production_attendance_reversals r WHERE r.tenant_id=v_tenant AND r.labor_fact_id=v_fact.id) THEN RAISE EXCEPTION 'Bản ghi chấm công đã được đảo'; END IF;
  IF EXISTS (SELECT 1 FROM public.production_outputs o WHERE o.production_order_id=v_fact.production_order_id AND (o.status='FINAL' OR o.valuation_status='FINAL')) THEN RAISE EXCEPTION 'Không thể đảo công khi sản lượng đã chốt giá thành'; END IF;
  SELECT * INTO v_entry FROM public.labor_cost_entries WHERE labor_fact_id=v_fact.id AND tenant_id=v_tenant;
  INSERT INTO public.production_attendance_reversals (tenant_id,labor_fact_id,labor_cost_entry_id,production_order_id,production_order_operation_id,worker_id,fact_date,reversed_amount,reason,idempotency_key,created_by)
  VALUES (v_tenant,v_fact.id,v_entry.id,v_fact.production_order_id,v_fact.production_order_operation_id,v_fact.worker_id,v_fact.fact_date,v_fact.calculated_amount,btrim(p_reason),v_key,auth.uid()) RETURNING * INTO v_row;
  PERFORM public.write_cost_audit('production_operation_labor_facts',v_fact.id,'REVERSE',to_jsonb(v_fact),jsonb_build_object('reversal_id',v_row.id,'reversed_amount',v_row.reversed_amount,'reason',v_row.reason),p_reason);
  RETURN jsonb_build_object('id',v_row.id,'reused',false,'labor_fact_id',v_row.labor_fact_id,'reversed_amount',v_row.reversed_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_production_attendance_month(
  p_production_order_id uuid, p_month_start date, p_include_reversed boolean DEFAULT false
)
RETURNS TABLE (
  id uuid, production_order_id uuid, production_order_operation_id uuid, operation_code text, operation_name text,
  worker_id uuid, employee_code text, worker_name text, worker_type text, attendance_method text, work_date date,
  day_units numeric, work_hours numeric, output_quantity numeric, rate_amount numeric, calculated_amount numeric,
  cost_classification text, is_estimated boolean, notes text, created_at timestamptz, cost_visible boolean,
  is_reversed boolean, reversal_reason text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_cost_visible boolean:=public.has_cost_permission('inventory_cost_view'); v_month_end date:=((p_month_start+INTERVAL '1 month')::date-1);
BEGIN
  IF NOT public.has_production_permission('production_view') AND NOT public.has_production_permission('production_operations') AND NOT public.has_production_permission('production_manage') THEN RAISE EXCEPTION 'Bạn không có quyền xem chấm công'; END IF;
  IF p_month_start IS NULL OR p_month_start <> date_trunc('month',p_month_start)::date THEN RAISE EXCEPTION 'Tháng báo cáo không hợp lệ'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.production_orders po WHERE po.id=p_production_order_id AND po.tenant_id=v_tenant) THEN RAISE EXCEPTION 'Lệnh sản xuất không tồn tại'; END IF;
  RETURN QUERY
  SELECT f.id,f.production_order_id,f.production_order_operation_id,o.operation_code,o.operation_name,f.worker_id,w.employee_code,w.display_name,w.worker_type,
    CASE WHEN f.compensation_type IN ('MONTHLY_MANAGER','MONTHLY_HELPER') THEN 'DAY' WHEN f.compensation_type='HOURLY' THEN 'HOUR' ELSE 'OUTPUT' END,
    f.fact_date,CASE WHEN f.compensation_type IN ('MONTHLY_MANAGER','MONTHLY_HELPER') THEN f.quantity ELSE NULL END,
    CASE WHEN f.compensation_type='HOURLY' THEN f.minutes/60.0 ELSE NULL END,
    CASE WHEN f.compensation_type='PIECE_RATE' THEN f.accepted_quantity ELSE NULL END,
    CASE WHEN v_cost_visible THEN f.rate_amount ELSE NULL END,CASE WHEN v_cost_visible THEN f.calculated_amount ELSE NULL END,
    f.cost_classification,f.is_estimated,f.notes,f.created_at,v_cost_visible,(r.id IS NOT NULL),r.reason
  FROM public.production_operation_labor_facts f
  JOIN public.production_order_operations o ON o.id=f.production_order_operation_id AND o.tenant_id=f.tenant_id
  JOIN public.production_workers w ON w.id=f.worker_id AND w.tenant_id=f.tenant_id
  LEFT JOIN public.production_attendance_reversals r ON r.labor_fact_id=f.id AND r.tenant_id=f.tenant_id
  WHERE f.tenant_id=v_tenant AND f.production_order_id=p_production_order_id AND f.fact_date BETWEEN p_month_start AND v_month_end
    AND (p_include_reversed OR r.id IS NULL)
  ORDER BY f.fact_date DESC,f.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_production_order_labor_cost(p_production_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text:=public.require_default_tenant(); v_direct numeric(18,2); v_overhead numeric(18,2); v_total numeric(18,2); v_by_worker jsonb; v_by_operation jsonb;
BEGIN
  IF NOT public.has_production_permission('production_view') AND NOT public.has_cost_permission('inventory_cost_view') THEN RAISE EXCEPTION 'Bạn không có quyền xem chi phí nhân công'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.production_orders WHERE id=p_production_order_id AND tenant_id=v_tenant) THEN RAISE EXCEPTION 'Lệnh sản xuất không tồn tại'; END IF;
  WITH net AS (SELECT e.*,CASE WHEN r.id IS NULL THEN e.calculated_amount ELSE 0 END AS active_amount FROM public.labor_cost_entries e LEFT JOIN public.production_attendance_reversals r ON r.labor_cost_entry_id=e.id AND r.tenant_id=e.tenant_id WHERE e.production_order_id=p_production_order_id AND e.tenant_id=v_tenant)
  SELECT COALESCE(sum(active_amount) FILTER (WHERE cost_classification='DIRECT_LABOR'),0),COALESCE(sum(active_amount) FILTER (WHERE cost_classification='MANUFACTURING_OVERHEAD'),0) INTO v_direct,v_overhead FROM net;
  v_total:=v_direct+v_overhead;
  IF NOT public.has_cost_permission('inventory_cost_view') THEN RETURN jsonb_build_object('production_order_id',p_production_order_id,'direct_labor_cost',NULL,'manufacturing_overhead_cost',NULL,'total_labor_cost',NULL,'is_estimated',NULL,'cost_visible',false,'by_worker','[]'::jsonb,'by_operation','[]'::jsonb); END IF;
  SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) INTO v_by_worker FROM (SELECT e.worker_id,max(w.display_name) worker_name,sum(CASE WHEN r.id IS NULL THEN e.calculated_amount ELSE 0 END)::numeric(18,2) amount,bool_or(e.is_estimated) is_estimated FROM public.labor_cost_entries e JOIN public.production_workers w ON w.id=e.worker_id LEFT JOIN public.production_attendance_reversals r ON r.labor_cost_entry_id=e.id AND r.tenant_id=e.tenant_id WHERE e.production_order_id=p_production_order_id AND e.tenant_id=v_tenant GROUP BY e.worker_id ORDER BY worker_name) x;
  SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) INTO v_by_operation FROM (SELECT e.production_order_operation_id operation_id,max(o.operation_name) operation_name,sum(CASE WHEN r.id IS NULL THEN e.calculated_amount ELSE 0 END)::numeric(18,2) amount,bool_or(e.is_estimated) is_estimated FROM public.labor_cost_entries e JOIN public.production_order_operations o ON o.id=e.production_order_operation_id LEFT JOIN public.production_attendance_reversals r ON r.labor_cost_entry_id=e.id AND r.tenant_id=e.tenant_id WHERE e.production_order_id=p_production_order_id AND e.tenant_id=v_tenant GROUP BY e.production_order_operation_id ORDER BY min(o.sequence)) x;
  RETURN jsonb_build_object('production_order_id',p_production_order_id,'direct_labor_cost',v_direct,'manufacturing_overhead_cost',v_overhead,'total_labor_cost',v_total,'is_estimated',EXISTS(SELECT 1 FROM public.labor_cost_entries e LEFT JOIN public.production_attendance_reversals r ON r.labor_cost_entry_id=e.id WHERE e.production_order_id=p_production_order_id AND e.tenant_id=v_tenant AND r.id IS NULL AND e.is_estimated),'cost_visible',true,'by_worker',v_by_worker,'by_operation',v_by_operation);
END;
$$;

ALTER TABLE public.production_order_worker_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_attendance_reversals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS production_order_worker_assignments_select ON public.production_order_worker_assignments;
CREATE POLICY production_order_worker_assignments_select ON public.production_order_worker_assignments FOR SELECT TO authenticated USING (tenant_id='default' AND (public.has_production_permission('production_view') OR public.has_production_permission('production_operations') OR public.has_production_permission('production_manage')));
DROP POLICY IF EXISTS production_attendance_reversals_select ON public.production_attendance_reversals;
CREATE POLICY production_attendance_reversals_select ON public.production_attendance_reversals FOR SELECT TO authenticated USING (tenant_id='default' AND public.has_production_permission('production_manage'));
GRANT SELECT ON public.production_order_worker_assignments, public.production_attendance_reversals TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.production_order_worker_assignments, public.production_attendance_reversals FROM authenticated;
REVOKE ALL ON FUNCTION public.validate_production_worker_assignment(), public.validate_attendance_reversal() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_production_order_worker(uuid,uuid,uuid,date,date,text), public.end_production_order_worker_assignment(uuid,date,text), public.set_production_order_assignment_enforcement(uuid,boolean,text), public.list_production_order_worker_assignments(uuid), public.record_production_attendance(uuid,uuid,text,date,numeric,numeric,numeric,numeric,text,text), public.reverse_production_attendance(uuid,text,text), public.list_production_attendance_month(uuid,date,boolean), public.calculate_production_order_labor_cost(uuid) TO authenticated;
