-- Allow a delegated team leader to approve/reject attendance and overtime for
-- workers assigned to that leader, without granting production-order manage.
-- Locking, reopening/closing days, day classification, and reversals remain
-- manager/admin operations. All workflow state is still append-only.

BEGIN;

-- Worker-management permission is intentionally not a whole-factory attendance
-- scope. Only an administrator, manager, or production manager may see every
-- worker; delegated supervisors use an effective team assignment instead.
CREATE OR REPLACE FUNCTION public.factory_attendance_can_manage_all()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_production_permission('production_manage')
  )
$$;

CREATE OR REPLACE FUNCTION public.factory_attendance_can_review_worker(
  p_worker_id uuid,
  p_on_date date
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR p_worker_id IS NULL OR p_on_date IS NULL THEN
    RETURN false;
  END IF;

  -- Administrators and production managers can review the whole tenant.
  IF public.has_role(v_user_id, 'admin'::public.app_role)
     OR public.has_role(v_user_id, 'manager'::public.app_role)
     OR public.has_production_permission('production_manage') THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.production_workers w
      WHERE w.id = p_worker_id
        AND w.tenant_id = public.require_default_tenant()
    );
  END IF;

  -- A delegated reviewer must have the explicit attendance permission and an
  -- effective team assignment. This permission never implies order management.
  IF NOT public.has_cost_permission('production_attendance_approve') THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.payroll_team_assignments a
    JOIN public.production_workers supervisor
      ON supervisor.id = a.supervisor_worker_id
     AND supervisor.tenant_id = a.tenant_id
    JOIN public.production_workers worker
      ON worker.id = a.worker_id
     AND worker.tenant_id = a.tenant_id
    WHERE a.tenant_id = public.require_default_tenant()
      AND supervisor.user_id = v_user_id
      AND supervisor.is_active
      AND a.worker_id = p_worker_id
      AND a.status = 'ACTIVE'
      AND a.effective_from <= p_on_date
      AND (a.effective_to IS NULL OR a.effective_to >= p_on_date)
  );
END;
$$;

-- Keep the existing scope/closure implementation private while the public
-- wrapper below routes only APPROVED/REJECTED through the delegated reviewer.
DO $$
BEGIN
  IF to_regprocedure('public.set_factory_attendance_status_team_base(uuid,text,text,text)') IS NULL
     AND to_regprocedure('public.set_factory_attendance_status(uuid,text,text,text)') IS NOT NULL THEN
    ALTER FUNCTION public.set_factory_attendance_status(uuid, text, text, text)
      RENAME TO set_factory_attendance_status_team_base;
  END IF;
  IF to_regprocedure('public.set_factory_overtime_status_team_base(uuid,text,text,text)') IS NULL
     AND to_regprocedure('public.set_factory_overtime_status(uuid,text,text,text)') IS NOT NULL THEN
    ALTER FUNCTION public.set_factory_overtime_status(uuid, text, text, text)
      RENAME TO set_factory_overtime_status_team_base;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_factory_attendance_status_review_base(
  p_attendance_record_id uuid,
  p_target_status text,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_record public.factory_attendance_records;
  v_existing public.factory_attendance_workflow_events;
  v_event public.factory_attendance_workflow_events;
  v_current text;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_key text := NULLIF(btrim(p_idempotency_key), '');
BEGIN
  IF p_target_status NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'Trạng thái duyệt chấm công không hợp lệ';
  END IF;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Mã yêu cầu workflow là bắt buộc';
  END IF;
  IF p_target_status = 'REJECTED' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Lý do từ chối là bắt buộc';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'factory-attendance-workflow:' || v_tenant || ':' || p_attendance_record_id::text,
    0
  ));

  SELECT * INTO v_record
  FROM public.factory_attendance_records f
  WHERE f.id = p_attendance_record_id
    AND f.tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bản ghi chấm công không tồn tại';
  END IF;
  IF NOT public.factory_attendance_can_review_worker(v_record.worker_id, v_record.work_date) THEN
    RAISE EXCEPTION 'Bạn không có quyền duyệt chấm công cho nhân sự này';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.factory_attendance_reversals r
    WHERE r.attendance_record_id = v_record.id
      AND r.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Không thể duyệt bản ghi đã đảo';
  END IF;

  SELECT * INTO v_existing
  FROM public.factory_attendance_workflow_events e
  WHERE e.tenant_id = v_tenant
    AND e.idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.attendance_record_id <> p_attendance_record_id
       OR v_existing.status <> p_target_status
       OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'Mã yêu cầu đã được dùng cho workflow khác';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'attendance_record_id', p_attendance_record_id,
      'status', v_existing.status,
      'reused', true
    );
  END IF;

  v_current := public.current_factory_attendance_status(v_record.id);
  IF v_current <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'Chỉ bản ghi đang chờ duyệt mới được xử lý';
  END IF;
  IF public.current_factory_attendance_closure(v_record.worker_id, v_record.work_date)
     = 'LEADER_CONFIRMED' THEN
    RAISE EXCEPTION 'Ngày công đã được quản lý chốt; hãy mở lại trước khi duyệt';
  END IF;

  INSERT INTO public.factory_attendance_workflow_events (
    tenant_id, attendance_record_id, status, reason, idempotency_key, actor_id
  ) VALUES (
    v_tenant, v_record.id, p_target_status, v_reason, v_key, auth.uid()
  )
  RETURNING * INTO v_event;

  PERFORM public.write_cost_audit(
    'factory_attendance_records', v_record.id,
    CASE WHEN p_target_status = 'APPROVED' THEN 'APPROVE' ELSE 'REJECT' END,
    jsonb_build_object('status', v_current),
    jsonb_build_object('status', p_target_status),
    v_reason
  );

  RETURN jsonb_build_object(
    'id', v_event.id,
    'attendance_record_id', v_record.id,
    'status', v_event.status,
    'reused', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_factory_overtime_status_review_base(
  p_overtime_record_id uuid,
  p_target_status text,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_record public.factory_overtime_records;
  v_existing public.factory_overtime_workflow_events;
  v_event public.factory_overtime_workflow_events;
  v_current text;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_key text := NULLIF(btrim(p_idempotency_key), '');
BEGIN
  IF p_target_status NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'Trạng thái duyệt tăng ca không hợp lệ';
  END IF;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Mã yêu cầu workflow là bắt buộc';
  END IF;
  IF p_target_status = 'REJECTED' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Lý do từ chối là bắt buộc';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'factory-overtime-workflow:' || v_tenant || ':' || p_overtime_record_id::text,
    0
  ));

  SELECT * INTO v_record
  FROM public.factory_overtime_records o
  WHERE o.id = p_overtime_record_id
    AND o.tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bản ghi tăng ca không tồn tại';
  END IF;
  IF NOT public.factory_attendance_can_review_worker(v_record.worker_id, v_record.work_date) THEN
    RAISE EXCEPTION 'Bạn không có quyền duyệt tăng ca cho nhân sự này';
  END IF;

  SELECT * INTO v_existing
  FROM public.factory_overtime_workflow_events e
  WHERE e.tenant_id = v_tenant
    AND e.idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.overtime_record_id <> p_overtime_record_id
       OR v_existing.status <> p_target_status
       OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'Mã yêu cầu đã được dùng cho workflow tăng ca khác';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'overtime_record_id', p_overtime_record_id,
      'status', v_existing.status,
      'reused', true
    );
  END IF;

  v_current := public.current_factory_overtime_status(v_record.id);
  IF v_current <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'Chỉ tăng ca đang chờ duyệt mới được xử lý';
  END IF;
  IF public.current_factory_attendance_closure(v_record.worker_id, v_record.work_date)
     = 'LEADER_CONFIRMED' THEN
    RAISE EXCEPTION 'Ngày công đã được quản lý chốt; hãy mở lại trước khi duyệt tăng ca';
  END IF;

  INSERT INTO public.factory_overtime_workflow_events (
    tenant_id, overtime_record_id, status, reason, idempotency_key, actor_id
  ) VALUES (
    v_tenant, v_record.id, p_target_status, v_reason, v_key, auth.uid()
  )
  RETURNING * INTO v_event;

  PERFORM public.write_cost_audit(
    'factory_overtime_records', v_record.id,
    CASE WHEN p_target_status = 'APPROVED' THEN 'APPROVE' ELSE 'REJECT' END,
    jsonb_build_object('status', v_current),
    jsonb_build_object('status', p_target_status),
    v_reason
  );

  RETURN jsonb_build_object(
    'id', v_event.id,
    'overtime_record_id', v_record.id,
    'status', v_event.status,
    'reused', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_factory_attendance_status(
  p_attendance_record_id uuid,
  p_target_status text,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker_id uuid;
  v_work_date date;
BEGIN
  IF p_target_status IN ('APPROVED', 'REJECTED') THEN
    SELECT f.worker_id, f.work_date
    INTO v_worker_id, v_work_date
    FROM public.factory_attendance_records f
    WHERE f.id = p_attendance_record_id
      AND f.tenant_id = public.require_default_tenant();
    IF NOT FOUND OR NOT public.factory_attendance_can_review_worker(v_worker_id, v_work_date) THEN
      RAISE EXCEPTION 'Bạn không có quyền duyệt chấm công cho nhân sự này';
    END IF;
    RETURN public.set_factory_attendance_status_review_base(
      p_attendance_record_id, p_target_status, p_reason, p_idempotency_key
    );
  END IF;

  IF p_target_status = 'SUBMITTED' THEN
    SELECT f.worker_id, f.work_date
    INTO v_worker_id, v_work_date
    FROM public.factory_attendance_records f
    WHERE f.id = p_attendance_record_id
      AND f.tenant_id = public.require_default_tenant();
    IF NOT FOUND OR NOT public.factory_attendance_worker_in_scope(v_worker_id, v_work_date) THEN
      RAISE EXCEPTION 'Bạn không có quyền gửi lại chấm công cho nhân sự này';
    END IF;
  ELSIF p_target_status = 'LOCKED' THEN
    IF NOT public.has_production_permission('production_manage') THEN
      RAISE EXCEPTION 'Bạn không có quyền khóa chấm công';
    END IF;
  ELSE
    RAISE EXCEPTION 'Trạng thái chấm công không hợp lệ';
  END IF;

  RETURN public.set_factory_attendance_status_team_base(
    p_attendance_record_id, p_target_status, p_reason, p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_factory_overtime_status(
  p_overtime_record_id uuid,
  p_target_status text,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker_id uuid;
  v_work_date date;
BEGIN
  IF p_target_status IN ('APPROVED', 'REJECTED') THEN
    SELECT o.worker_id, o.work_date
    INTO v_worker_id, v_work_date
    FROM public.factory_overtime_records o
    WHERE o.id = p_overtime_record_id
      AND o.tenant_id = public.require_default_tenant();
    IF NOT FOUND OR NOT public.factory_attendance_can_review_worker(v_worker_id, v_work_date) THEN
      RAISE EXCEPTION 'Bạn không có quyền duyệt tăng ca cho nhân sự này';
    END IF;
    RETURN public.set_factory_overtime_status_review_base(
      p_overtime_record_id, p_target_status, p_reason, p_idempotency_key
    );
  END IF;

  IF p_target_status = 'SUBMITTED' THEN
    SELECT o.worker_id, o.work_date
    INTO v_worker_id, v_work_date
    FROM public.factory_overtime_records o
    WHERE o.id = p_overtime_record_id
      AND o.tenant_id = public.require_default_tenant();
    IF NOT FOUND OR NOT public.factory_attendance_worker_in_scope(v_worker_id, v_work_date) THEN
      RAISE EXCEPTION 'Bạn không có quyền gửi lại tăng ca cho nhân sự này';
    END IF;
  ELSIF p_target_status = 'LOCKED' THEN
    IF NOT public.has_production_permission('production_manage') THEN
      RAISE EXCEPTION 'Bạn không có quyền khóa tăng ca';
    END IF;
  ELSE
    RAISE EXCEPTION 'Trạng thái tăng ca không hợp lệ';
  END IF;

  RETURN public.set_factory_overtime_status_team_base(
    p_overtime_record_id, p_target_status, p_reason, p_idempotency_key
  );
END;
$$;

-- Extend the generic permission catalog without changing any existing role.
CREATE OR REPLACE FUNCTION public.replace_employee_permissions(
  p_user_id uuid,
  p_permissions jsonb,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_is_admin boolean := public.has_role(auth.uid(), 'admin'::public.app_role);
  v_is_manager boolean := public.has_role(auth.uid(), 'manager'::public.app_role);
  v_target_employee boolean;
  v_target_accountant boolean;
  v_catalog constant text[] := ARRAY[
    'dashboard','customers','products','quotes','orders','cash_flow','transactions','reports',
    'user_management','quote_supplement','customer_care','fabric_management','ghn_tracking',
    'quote_approval','knowledge_base','contracts','shipping_companies',
    'cost_transactions','cost_categories','cost_centers','cost_objects','transaction_types',
    'cost_transaction_confirm','cost_transaction_void','cost_audit',
    'inventory_view','inventory_items','inventory_documents','inventory_confirm',
    'inventory_adjustment','inventory_opening','inventory_cost_view','inventory_audit',
    'bom_view','bom_manage','bom_approve','cutting_profiles','cutting_approve',
    'production_view','production_manage','production_release','production_complete',
    'production_operations','production_worker_manage','production_attendance_approve',
    'payroll_view','payroll_team_view','payroll_worker_manage',
    'payroll_rate_view','payroll_rate_manage','payroll_policy_manage',
    'payroll_insurance_manage','payroll_bank_manage','payroll_audit'
  ];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Bạn chưa đăng nhập'; END IF;
  IF p_user_id IS NULL OR jsonb_typeof(p_permissions) <> 'array' THEN
    RAISE EXCEPTION 'Dữ liệu phân quyền không hợp lệ';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Lý do thay đổi quyền là bắt buộc';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_user_id AND ur.role = 'employee'::public.app_role
  ), EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_user_id AND ur.role = 'accountant'::public.app_role
  ) INTO v_target_employee, v_target_accountant;

  IF NOT v_target_employee AND NOT v_target_accountant THEN
    RAISE EXCEPTION 'Chỉ có thể cấu hình quyền cho nhân viên hoặc kế toán';
  END IF;
  IF NOT v_is_admin AND NOT (
    v_is_manager AND v_target_employee AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p_user_id
        AND ur.role = 'employee'::public.app_role
        AND ur.assigned_by = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Bạn không có quyền cập nhật phân quyền này';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_permissions) value
    WHERE jsonb_typeof(value) <> 'object'
      OR jsonb_typeof(value->'permission_type') <> 'string'
      OR jsonb_typeof(value->'enabled') <> 'boolean'
      OR NOT ((value->>'permission_type') = ANY(v_catalog))
  ) THEN
    RAISE EXCEPTION 'Danh sách có quyền không hợp lệ';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (
      SELECT value->>'permission_type' AS permission_type, count(*)
      FROM jsonb_array_elements(p_permissions) value
      GROUP BY value->>'permission_type'
      HAVING count(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'Danh sách quyền bị trùng';
  END IF;

  IF v_target_employee AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_permissions) value
    WHERE (value->>'enabled')::boolean
      AND (value->>'permission_type') LIKE 'payroll_%'
      AND NOT public.payroll_capability_is_delegable(value->>'permission_type')
  ) THEN
    RAISE EXCEPTION 'Quyền payroll nhạy cảm không thể cấp cho nhân viên';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'permission_type', ep.permission_type, 'enabled', ep.enabled
  ) ORDER BY ep.permission_type), '[]'::jsonb)
  INTO v_before
  FROM public.employee_permissions ep
  WHERE ep.user_id = p_user_id;

  DELETE FROM public.employee_permissions WHERE user_id = p_user_id;
  INSERT INTO public.employee_permissions (user_id, permission_type, enabled)
  SELECT p_user_id, value->>'permission_type', true
  FROM jsonb_array_elements(p_permissions) value
  WHERE (value->>'enabled')::boolean;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'permission_type', ep.permission_type, 'enabled', ep.enabled
  ) ORDER BY ep.permission_type), '[]'::jsonb)
  INTO v_after
  FROM public.employee_permissions ep
  WHERE ep.user_id = p_user_id;

  PERFORM public.write_cost_audit(
    'employee_permissions', p_user_id, 'UPDATE', v_before, v_after, btrim(p_reason)
  );
  RETURN jsonb_build_object('user_id', p_user_id, 'permissions', v_after);
END;
$$;

REVOKE ALL ON FUNCTION public.factory_attendance_can_review_worker(uuid, date),
  public.set_factory_attendance_status_team_base(uuid, text, text, text),
  public.set_factory_overtime_status_team_base(uuid, text, text, text),
  public.set_factory_attendance_status_review_base(uuid, text, text, text),
  public.set_factory_overtime_status_review_base(uuid, text, text, text)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_factory_attendance_status(uuid, text, text, text),
  public.set_factory_overtime_status(uuid, text, text, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_factory_attendance_status(uuid, text, text, text),
  public.set_factory_overtime_status(uuid, text, text, text)
TO authenticated;

COMMENT ON FUNCTION public.factory_attendance_can_review_worker(uuid, date) IS
  'Team-scoped reviewer check for attendance/overtime approval. It does not grant production-order management.';
COMMENT ON FUNCTION public.set_factory_attendance_status(uuid, text, text, text) IS
  'Attendance workflow wrapper: delegated team reviewers may approve/reject; locking remains manager-only.';
COMMENT ON FUNCTION public.set_factory_overtime_status(uuid, text, text, text) IS
  'Overtime workflow wrapper: delegated team reviewers may approve/reject; locking remains manager-only.';

COMMIT;
