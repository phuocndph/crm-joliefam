-- Payroll Sprint 1 hardening: server-owned capabilities, explicit team scope,
-- recoverable draft workflows, and canonical effective-dated compensation.
-- Forward-only. Payroll calculation and settlement remain out of scope.

-- Historical policies briefly allowed every authenticated user to mutate the
-- product master. Product/SKU mapping cannot be trusted while these survive.
DROP POLICY IF EXISTS "Users can insert products" ON public.products;
DROP POLICY IF EXISTS "Users can update products" ON public.products;
DROP POLICY IF EXISTS "Users can delete products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can insert products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can update products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can delete products" ON public.products;

CREATE OR REPLACE FUNCTION public.payroll_capability_is_known(p_permission text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_permission IN (
    'payroll_view', 'payroll_team_view', 'payroll_worker_manage',
    'payroll_rate_view', 'payroll_rate_manage', 'payroll_policy_manage',
    'payroll_insurance_manage', 'payroll_bank_manage', 'payroll_audit'
  )
$$;

CREATE OR REPLACE FUNCTION public.payroll_capability_is_delegable(p_permission text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_permission IN ('payroll_view', 'payroll_team_view', 'payroll_worker_manage')
$$;

CREATE OR REPLACE FUNCTION public.has_payroll_permission(p_permission text DEFAULT 'payroll_view')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.payroll_capability_is_known(p_permission)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR (
        public.has_role(auth.uid(), 'manager'::public.app_role)
        AND p_permission IN (
          'payroll_view', 'payroll_team_view', 'payroll_worker_manage',
          'payroll_rate_view', 'payroll_rate_manage', 'payroll_policy_manage',
          'payroll_audit'
        )
      )
      OR (
        public.has_role(auth.uid(), 'accountant'::public.app_role)
        AND p_permission IN (
          'payroll_view', 'payroll_rate_view', 'payroll_insurance_manage',
          'payroll_bank_manage', 'payroll_audit'
        )
      )
      OR (
        public.payroll_capability_is_delegable(p_permission)
        AND EXISTS (
          SELECT 1
          FROM public.employee_permissions ep
          WHERE ep.user_id = auth.uid()
            AND ep.permission_type = p_permission
            AND ep.enabled
        )
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.list_payroll_capabilities()
RETURNS TABLE(permission_type text, allowed boolean, source text, delegable boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH capabilities(permission_type) AS (
    VALUES
      ('payroll_view'::text),
      ('payroll_team_view'::text),
      ('payroll_worker_manage'::text),
      ('payroll_rate_view'::text),
      ('payroll_rate_manage'::text),
      ('payroll_policy_manage'::text),
      ('payroll_insurance_manage'::text),
      ('payroll_bank_manage'::text),
      ('payroll_audit'::text)
  )
  SELECT c.permission_type,
    public.has_payroll_permission(c.permission_type),
    CASE
      WHEN public.has_role(auth.uid(), 'admin'::public.app_role) THEN 'ROLE'
      WHEN public.has_role(auth.uid(), 'manager'::public.app_role)
        AND c.permission_type IN (
          'payroll_view', 'payroll_team_view', 'payroll_worker_manage',
          'payroll_rate_view', 'payroll_rate_manage', 'payroll_policy_manage', 'payroll_audit'
        ) THEN 'ROLE'
      WHEN public.has_role(auth.uid(), 'accountant'::public.app_role)
        AND c.permission_type IN (
          'payroll_view', 'payroll_rate_view', 'payroll_insurance_manage',
          'payroll_bank_manage', 'payroll_audit'
        ) THEN 'ROLE'
      WHEN public.payroll_capability_is_delegable(c.permission_type)
        AND EXISTS (
          SELECT 1 FROM public.employee_permissions ep
          WHERE ep.user_id = auth.uid()
            AND ep.permission_type = c.permission_type
            AND ep.enabled
        ) THEN 'DELEGATED'
      ELSE 'NONE'
    END,
    public.payroll_capability_is_delegable(c.permission_type)
  FROM capabilities c
  ORDER BY c.permission_type
$$;

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
    'production_operations','production_worker_manage',
    'payroll_view','payroll_team_view','payroll_worker_manage',
    'payroll_rate_view','payroll_rate_manage','payroll_policy_manage',
    'payroll_insurance_manage','payroll_bank_manage','payroll_audit'
  ];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Bạn chưa đăng nhập'; END IF;
  IF p_user_id IS NULL OR jsonb_typeof(p_permissions) <> 'array' THEN
    RAISE EXCEPTION 'Dữ liệu phân quyền không hợp lệ';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Lý do thay đổi quyền là bắt buộc'; END IF;

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
  ) THEN RAISE EXCEPTION 'Danh sách có quyền không hợp lệ'; END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT value->>'permission_type' AS permission_type, count(*)
      FROM jsonb_array_elements(p_permissions) value
      GROUP BY value->>'permission_type'
      HAVING count(*) > 1
    ) duplicates
  ) THEN RAISE EXCEPTION 'Danh sách quyền bị trùng'; END IF;

  IF v_target_employee AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_permissions) value
    WHERE (value->>'enabled')::boolean
      AND (value->>'permission_type') LIKE 'payroll_%'
      AND NOT public.payroll_capability_is_delegable(value->>'permission_type')
  ) THEN RAISE EXCEPTION 'Quyền payroll nhạy cảm không thể cấp cho nhân viên'; END IF;

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

DROP POLICY IF EXISTS "Admins can insert employee permissions" ON public.employee_permissions;
DROP POLICY IF EXISTS "Managers can insert permissions for their employees" ON public.employee_permissions;
DROP POLICY IF EXISTS "Admins can update employee permissions" ON public.employee_permissions;
DROP POLICY IF EXISTS "Managers can update permissions for their employees" ON public.employee_permissions;
DROP POLICY IF EXISTS "Admins can delete employee permissions" ON public.employee_permissions;
DROP POLICY IF EXISTS "Managers can delete permissions for their employees" ON public.employee_permissions;
REVOKE INSERT, UPDATE, DELETE ON public.employee_permissions FROM authenticated;

CREATE TABLE public.payroll_team_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  supervisor_worker_id uuid NOT NULL REFERENCES public.production_workers(id) ON DELETE RESTRICT,
  worker_id uuid NOT NULL REFERENCES public.production_workers(id) ON DELETE RESTRICT,
  effective_from date NOT NULL,
  effective_to date,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RETIRED')),
  reason text NOT NULL CHECK (NULLIF(btrim(reason), '') IS NOT NULL),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  retired_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  CHECK (supervisor_worker_id <> worker_id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX payroll_team_assignments_supervisor_idx
  ON public.payroll_team_assignments (tenant_id, supervisor_worker_id, effective_from DESC);
CREATE INDEX payroll_team_assignments_worker_idx
  ON public.payroll_team_assignments (tenant_id, worker_id, effective_from DESC);

CREATE OR REPLACE FUNCTION public.validate_payroll_team_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.production_workers w
    WHERE w.id = NEW.supervisor_worker_id
      AND w.tenant_id = NEW.tenant_id
      AND w.user_id IS NOT NULL
  ) THEN RAISE EXCEPTION 'Tổ trưởng không tồn tại hoặc chưa liên kết tài khoản'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.production_workers w
    WHERE w.id = NEW.worker_id AND w.tenant_id = NEW.tenant_id
  ) THEN RAISE EXCEPTION 'Nhân sự không cùng phạm vi dữ liệu'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_payroll_team_assignment_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.payroll_team_assignments x
    WHERE x.id <> NEW.id
      AND x.tenant_id = NEW.tenant_id
      AND x.supervisor_worker_id = NEW.supervisor_worker_id
      AND x.worker_id = NEW.worker_id
      AND daterange(x.effective_from, COALESCE(x.effective_to, 'infinity'::date), '[]')
          && daterange(NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'::date), '[]')
  ) THEN RAISE EXCEPTION 'Khoảng phụ trách nhân sự bị chồng lấn'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payroll_team_assignments_updated_at
BEFORE UPDATE ON public.payroll_team_assignments
FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
CREATE TRIGGER payroll_team_assignments_scope
BEFORE INSERT OR UPDATE ON public.payroll_team_assignments
FOR EACH ROW EXECUTE FUNCTION public.validate_payroll_team_assignment();
CREATE CONSTRAINT TRIGGER payroll_team_assignments_no_overlap
AFTER INSERT OR UPDATE ON public.payroll_team_assignments
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION public.reject_payroll_team_assignment_overlap();

CREATE OR REPLACE FUNCTION public.payroll_worker_in_scope_at(p_worker_id uuid, p_on_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_on_date IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.production_workers w
    WHERE w.id = p_worker_id
      AND w.tenant_id = 'default'
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'manager'::public.app_role)
        OR public.has_role(auth.uid(), 'accountant'::public.app_role)
        OR w.user_id = auth.uid()
        OR (
          public.has_payroll_permission('payroll_team_view')
          AND EXISTS (
            SELECT 1
            FROM public.payroll_team_assignments a
            JOIN public.production_workers supervisor
              ON supervisor.id = a.supervisor_worker_id
             AND supervisor.tenant_id = a.tenant_id
            WHERE a.tenant_id = w.tenant_id
              AND a.worker_id = w.id
              AND supervisor.user_id = auth.uid()
              AND a.effective_from <= p_on_date
              AND (a.effective_to IS NULL OR a.effective_to >= p_on_date)
          )
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.payroll_worker_in_scope(p_worker_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.payroll_worker_in_scope_at(p_worker_id, CURRENT_DATE)
$$;

CREATE OR REPLACE FUNCTION public.payroll_worker_manageable_at(p_worker_id uuid, p_on_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_on_date IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.production_workers w
    WHERE w.id = p_worker_id
      AND w.tenant_id = 'default'
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'manager'::public.app_role)
        OR (
          public.has_payroll_permission('payroll_worker_manage')
          AND EXISTS (
            SELECT 1
            FROM public.payroll_team_assignments a
            JOIN public.production_workers supervisor
              ON supervisor.id = a.supervisor_worker_id
             AND supervisor.tenant_id = a.tenant_id
            WHERE a.tenant_id = w.tenant_id
              AND a.worker_id = w.id
              AND supervisor.user_id = auth.uid()
              AND a.effective_from <= p_on_date
              AND (a.effective_to IS NULL OR a.effective_to >= p_on_date)
          )
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.payroll_worker_manageable(p_worker_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.payroll_worker_manageable_at(p_worker_id, CURRENT_DATE)
$$;

CREATE OR REPLACE FUNCTION public.create_payroll_team_assignment(
  p_supervisor_worker_id uuid,
  p_worker_id uuid,
  p_effective_from date,
  p_effective_to date DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_row public.payroll_team_assignments;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'manager'::public.app_role) THEN
    RAISE EXCEPTION 'Bạn không có quyền phân công tổ';
  END IF;
  IF p_effective_from IS NULL OR NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Ngày hiệu lực và lý do phân công là bắt buộc';
  END IF;
  INSERT INTO public.payroll_team_assignments (
    tenant_id, supervisor_worker_id, worker_id, effective_from, effective_to, reason, created_by
  ) VALUES (
    v_tenant, p_supervisor_worker_id, p_worker_id, p_effective_from, p_effective_to,
    btrim(p_reason), auth.uid()
  ) RETURNING * INTO v_row;
  PERFORM public.write_cost_audit(
    'payroll_team_assignments', v_row.id, 'CREATE', NULL, to_jsonb(v_row), btrim(p_reason)
  );
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.retire_payroll_team_assignment(
  p_assignment_id uuid,
  p_effective_to date,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_before public.payroll_team_assignments;
  v_after public.payroll_team_assignments;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'manager'::public.app_role) THEN
    RAISE EXCEPTION 'Bạn không có quyền kết thúc phân công tổ';
  END IF;
  IF p_effective_to IS NULL OR NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Ngày kết thúc và lý do là bắt buộc';
  END IF;
  SELECT * INTO v_before FROM public.payroll_team_assignments
  WHERE id = p_assignment_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phân công tổ'; END IF;
  IF v_before.status = 'RETIRED' THEN RAISE EXCEPTION 'Phân công tổ đã kết thúc'; END IF;
  IF p_effective_to < v_before.effective_from THEN RAISE EXCEPTION 'Ngày kết thúc không hợp lệ'; END IF;
  UPDATE public.payroll_team_assignments SET
    effective_to = p_effective_to,
    status = 'RETIRED',
    retired_by = auth.uid(),
    retired_at = now(),
    reason = btrim(p_reason),
    updated_at = now()
  WHERE id = v_before.id RETURNING * INTO v_after;
  PERFORM public.write_cost_audit(
    'payroll_team_assignments', v_after.id, 'UPDATE', to_jsonb(v_before), to_jsonb(v_after), btrim(p_reason)
  );
  RETURN to_jsonb(v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_payroll_team_assignments(
  p_supervisor_worker_id uuid DEFAULT NULL,
  p_worker_id uuid DEFAULT NULL,
  p_on_date date DEFAULT NULL
)
RETURNS SETOF public.payroll_team_assignments
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a
  FROM public.payroll_team_assignments a
  JOIN public.production_workers supervisor
    ON supervisor.id = a.supervisor_worker_id AND supervisor.tenant_id = a.tenant_id
  JOIN public.production_workers worker
    ON worker.id = a.worker_id AND worker.tenant_id = a.tenant_id
  WHERE a.tenant_id = public.require_default_tenant()
    AND (p_supervisor_worker_id IS NULL OR a.supervisor_worker_id = p_supervisor_worker_id)
    AND (p_worker_id IS NULL OR a.worker_id = p_worker_id)
    AND (p_on_date IS NULL OR (
      a.effective_from <= p_on_date AND (a.effective_to IS NULL OR a.effective_to >= p_on_date)
    ))
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR public.has_role(auth.uid(), 'accountant'::public.app_role)
      OR supervisor.user_id = auth.uid()
      OR worker.user_id = auth.uid()
    )
  ORDER BY a.effective_from DESC, a.created_at DESC
$$;

ALTER TABLE public.payroll_team_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payroll_team_assignments_select
ON public.payroll_team_assignments FOR SELECT TO authenticated
USING (
  tenant_id = 'default' AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_role(auth.uid(), 'accountant'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.production_workers w
      WHERE w.tenant_id = payroll_team_assignments.tenant_id
        AND w.id IN (
          payroll_team_assignments.supervisor_worker_id,
          payroll_team_assignments.worker_id
        )
        AND w.user_id = auth.uid()
    )
  )
);
REVOKE ALL ON public.payroll_team_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payroll_team_assignments TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_payroll_compensation_type(
  p_worker_id uuid,
  p_effective_date date
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_type text;
  v_count integer;
  v_worker_type text;
BEGIN
  IF p_effective_date IS NULL THEN RAISE EXCEPTION 'Ngày hiệu lực là bắt buộc'; END IF;
  SELECT count(*), max(a.compensation_type)
  INTO v_count, v_type
  FROM public.worker_compensation_assignments a
  WHERE a.tenant_id = v_tenant
    AND a.worker_id = p_worker_id
    AND a.status IN ('APPROVED','RETIRED')
    AND a.effective_from <= p_effective_date
    AND (a.effective_to IS NULL OR a.effective_to >= p_effective_date);
  IF v_count > 1 THEN RAISE EXCEPTION 'Có nhiều phân loại lương cùng hiệu lực'; END IF;
  IF v_count = 1 THEN RETURN v_type; END IF;
  IF EXISTS (
    SELECT 1 FROM public.worker_compensation_assignments a
    WHERE a.tenant_id = v_tenant AND a.worker_id = p_worker_id
      AND a.status IN ('APPROVED','RETIRED')
      AND a.effective_from <= p_effective_date
  ) THEN RAISE EXCEPTION 'Chưa có phân loại lương hiệu lực tại ngày làm việc'; END IF;
  SELECT w.worker_type INTO v_worker_type
  FROM public.production_workers w
  WHERE w.id = p_worker_id AND w.tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nhân sự không tồn tại'; END IF;
  SELECT p.default_compensation_type INTO v_type
  FROM public.worker_compensation_profiles p
  WHERE p.worker_id = p_worker_id AND p.tenant_id = v_tenant AND p.is_active;
  RETURN COALESCE(v_type, CASE
    WHEN v_worker_type = 'SUPERVISOR' THEN 'MONTHLY_MANAGER'
    WHEN v_worker_type = 'HELPER' THEN 'MONTHLY_HELPER'
    WHEN v_worker_type = 'SEWER' THEN 'PIECE_RATE'
    ELSE 'HOURLY'
  END);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_worker_compensation_master(
  p_worker_id uuid,
  p_on_date date DEFAULT CURRENT_DATE
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_assignment public.worker_compensation_assignments;
  v_worker_before public.production_workers;
  v_worker_after public.production_workers;
  v_profile_before public.worker_compensation_profiles;
  v_profile_after public.worker_compensation_profiles;
BEGIN
  SELECT * INTO v_assignment
  FROM public.worker_compensation_assignments a
  WHERE a.tenant_id = v_tenant
    AND a.worker_id = p_worker_id
    AND a.status IN ('APPROVED','RETIRED')
    AND a.effective_from <= p_on_date
    AND (a.effective_to IS NULL OR a.effective_to >= p_on_date)
  ORDER BY a.effective_from DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_worker_before FROM public.production_workers
  WHERE id = p_worker_id AND tenant_id = v_tenant FOR UPDATE;
  PERFORM set_config('app.payroll_canonical_sync', 'on', true);
  IF v_worker_before.employment_type IS DISTINCT FROM v_assignment.compensation_type THEN
    PERFORM set_config('app.cost_suppress_audit', 'on', true);
    UPDATE public.production_workers SET
      employment_type = v_assignment.compensation_type,
      updated_at = now()
    WHERE id = p_worker_id AND tenant_id = v_tenant
    RETURNING * INTO v_worker_after;
    PERFORM set_config('app.cost_suppress_audit', 'off', true);
    PERFORM public.write_cost_audit(
      'production_workers', p_worker_id, 'UPDATE', to_jsonb(v_worker_before),
      to_jsonb(v_worker_after), 'Đồng bộ phân loại lương đang hiệu lực'
    );
  END IF;

  SELECT * INTO v_profile_before FROM public.worker_compensation_profiles
  WHERE worker_id = p_worker_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND OR v_profile_before.default_compensation_type IS DISTINCT FROM v_assignment.compensation_type
     OR NOT v_profile_before.is_active THEN
    PERFORM set_config('app.cost_suppress_audit', 'on', true);
    INSERT INTO public.worker_compensation_profiles (
      tenant_id, worker_id, default_compensation_type, is_active, created_by
    ) VALUES (
      v_tenant, p_worker_id, v_assignment.compensation_type, true, auth.uid()
    )
    ON CONFLICT (tenant_id, worker_id) DO UPDATE SET
      default_compensation_type = EXCLUDED.default_compensation_type,
      is_active = true,
      updated_at = now()
    RETURNING * INTO v_profile_after;
    PERFORM set_config('app.cost_suppress_audit', 'off', true);
    PERFORM public.write_cost_audit(
      'worker_compensation_profiles', v_profile_after.id, 'UPDATE',
      CASE WHEN v_profile_before.id IS NULL THEN NULL ELSE to_jsonb(v_profile_before) END,
      to_jsonb(v_profile_after), 'Đồng bộ phân loại lương đang hiệu lực'
    );
  END IF;
  PERFORM set_config('app.payroll_canonical_sync', 'off', true);
  RETURN v_assignment.compensation_type;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_canonical_worker_compensation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_expected text;
BEGIN
  IF COALESCE(current_setting('app.payroll_canonical_sync', true), 'off') = 'on' THEN RETURN NEW; END IF;
  SELECT a.compensation_type INTO v_expected
  FROM public.worker_compensation_assignments a
  WHERE a.tenant_id = NEW.tenant_id AND a.worker_id = NEW.id
    AND a.status IN ('APPROVED','RETIRED')
    AND a.effective_from <= CURRENT_DATE
    AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
  ORDER BY a.effective_from DESC LIMIT 1;
  IF FOUND AND NEW.employment_type IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Loại lương được quản lý bằng phân loại lương có hiệu lực';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_canonical_compensation_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_expected text;
BEGIN
  IF COALESCE(current_setting('app.payroll_canonical_sync', true), 'off') = 'on' THEN RETURN NEW; END IF;
  SELECT a.compensation_type INTO v_expected
  FROM public.worker_compensation_assignments a
  WHERE a.tenant_id = NEW.tenant_id AND a.worker_id = NEW.worker_id
    AND a.status IN ('APPROVED','RETIRED')
    AND a.effective_from <= CURRENT_DATE
    AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
  ORDER BY a.effective_from DESC LIMIT 1;
  IF FOUND AND NEW.default_compensation_type IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Hồ sơ tương thích phải theo phân loại lương đang hiệu lực';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS production_workers_canonical_compensation ON public.production_workers;
CREATE TRIGGER production_workers_canonical_compensation
BEFORE UPDATE OF employment_type ON public.production_workers
FOR EACH ROW EXECUTE FUNCTION public.guard_canonical_worker_compensation();
DROP TRIGGER IF EXISTS worker_compensation_profiles_canonical ON public.worker_compensation_profiles;
CREATE TRIGGER worker_compensation_profiles_canonical
BEFORE INSERT OR UPDATE OF default_compensation_type ON public.worker_compensation_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_canonical_compensation_profile();

CREATE OR REPLACE FUNCTION public.update_payroll_worker_master(
  p_worker_id uuid,
  p_location_code text DEFAULT NULL,
  p_position_title text DEFAULT NULL,
  p_employment_type text DEFAULT NULL,
  p_employment_start_date date DEFAULT NULL,
  p_employment_end_date date DEFAULT NULL,
  p_payroll_status text DEFAULT 'ACTIVE',
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_before public.production_workers;
  v_row public.production_workers;
BEGIN
  IF NOT public.payroll_worker_manageable(p_worker_id) THEN RAISE EXCEPTION 'Bạn không có quyền cập nhật nhân sự này'; END IF;
  IF p_employment_type IS NOT NULL THEN
    RAISE EXCEPTION 'Loại lương chỉ được thay đổi qua phân loại lương có hiệu lực';
  END IF;
  IF p_payroll_status NOT IN ('ACTIVE','SUSPENDED','TERMINATED') THEN RAISE EXCEPTION 'Trạng thái lương không hợp lệ'; END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Lý do cập nhật nhân sự là bắt buộc'; END IF;
  SELECT * INTO v_before FROM public.production_workers
  WHERE id = p_worker_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy nhân sự'; END IF;
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  UPDATE public.production_workers SET
    location_code = NULLIF(upper(btrim(p_location_code)), ''),
    position_title = NULLIF(btrim(p_position_title), ''),
    employment_start_date = p_employment_start_date,
    employment_end_date = p_employment_end_date,
    payroll_status = p_payroll_status,
    updated_at = now()
  WHERE id = p_worker_id AND tenant_id = v_tenant
  RETURNING * INTO v_row;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  PERFORM public.write_cost_audit('production_workers', v_row.id, 'UPDATE', to_jsonb(v_before), to_jsonb(v_row), btrim(p_reason));
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_worker_compensation_assignment(
  p_assignment_id uuid, p_reason text, p_supersede_previous boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_row public.worker_compensation_assignments;
  v_previous public.worker_compensation_assignments;
  v_after public.worker_compensation_assignments;
BEGIN
  IF NOT public.has_payroll_permission('payroll_policy_manage') THEN RAISE EXCEPTION 'Bạn không có quyền duyệt phân loại lương'; END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Lý do duyệt là bắt buộc'; END IF;
  SELECT * INTO v_row FROM public.worker_compensation_assignments
  WHERE id = p_assignment_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy cấu hình phân loại lương'; END IF;
  IF NOT public.payroll_worker_manageable(v_row.worker_id) THEN RAISE EXCEPTION 'Bạn không có quyền duyệt nhân sự này'; END IF;
  IF v_row.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ cấu hình nháp mới được duyệt'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.payroll_policy_groups g
    WHERE g.id = v_row.payroll_policy_group_id AND g.tenant_id = v_tenant AND g.is_active
  ) THEN RAISE EXCEPTION 'Nhóm chính sách lương không hoạt động'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('payroll-assignment:' || v_tenant || ':' || v_row.worker_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.worker_compensation_assignments x
    WHERE x.tenant_id = v_tenant AND x.worker_id = v_row.worker_id AND x.id <> v_row.id
      AND x.status IN ('APPROVED','RETIRED') AND x.effective_from >= v_row.effective_from
      AND daterange(x.effective_from, COALESCE(x.effective_to, 'infinity'::date), '[]')
          && daterange(v_row.effective_from, COALESCE(v_row.effective_to, 'infinity'::date), '[]')
  ) THEN RAISE EXCEPTION 'Đã có cấu hình cùng hoặc sau ngày hiệu lực này'; END IF;
  SELECT * INTO v_previous FROM public.worker_compensation_assignments x
  WHERE x.tenant_id = v_tenant AND x.worker_id = v_row.worker_id AND x.id <> v_row.id
    AND x.status IN ('APPROVED','RETIRED') AND x.effective_from < v_row.effective_from
    AND (x.effective_to IS NULL OR x.effective_to >= v_row.effective_from)
  ORDER BY x.effective_from DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF NOT p_supersede_previous THEN RAISE EXCEPTION 'Khoảng hiệu lực phân loại lương bị chồng lấn'; END IF;
    PERFORM set_config('app.payroll_master_transition', 'on', true);
    PERFORM set_config('app.cost_suppress_audit', 'on', true);
    UPDATE public.worker_compensation_assignments
      SET status = 'RETIRED', effective_to = v_row.effective_from - 1, updated_at = now()
    WHERE id = v_previous.id;
    PERFORM set_config('app.cost_suppress_audit', 'off', true);
    PERFORM public.write_cost_audit(
      'worker_compensation_assignments', v_previous.id, 'SUPERSEDE', to_jsonb(v_previous),
      to_jsonb((SELECT x FROM public.worker_compensation_assignments x WHERE x.id = v_previous.id)), p_reason
    );
  END IF;
  PERFORM set_config('app.payroll_master_transition', 'on', true);
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  UPDATE public.worker_compensation_assignments SET
    status = 'APPROVED', approved_by = auth.uid(), approved_at = now(), updated_at = now()
  WHERE id = v_row.id RETURNING * INTO v_after;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  PERFORM public.write_cost_audit('worker_compensation_assignments', v_after.id, 'APPROVE', to_jsonb(v_row), to_jsonb(v_after), p_reason);
  PERFORM public.sync_worker_compensation_master(v_after.worker_id, CURRENT_DATE);
  PERFORM set_config('app.payroll_master_transition', 'off', true);
  RETURN to_jsonb(v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_worker_compensation_profile(
  p_worker_id uuid, p_compensation_type text, p_monthly_productive_minutes numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_row public.worker_compensation_profiles;
  v_canonical text;
BEGIN
  IF NOT public.has_production_permission('production_worker_manage')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền quản lý mức công';
  END IF;
  IF p_compensation_type NOT IN ('MONTHLY_MANAGER','MONTHLY_HELPER','PIECE_RATE','HOURLY') THEN
    RAISE EXCEPTION 'Loại trả công không hợp lệ';
  END IF;
  SELECT a.compensation_type INTO v_canonical
  FROM public.worker_compensation_assignments a
  WHERE a.tenant_id = v_tenant AND a.worker_id = p_worker_id
    AND a.status IN ('APPROVED','RETIRED')
    AND a.effective_from <= CURRENT_DATE
    AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
  ORDER BY a.effective_from DESC LIMIT 1;
  IF FOUND AND p_compensation_type <> v_canonical THEN
    RAISE EXCEPTION 'Loại trả công phải theo phân loại lương đang hiệu lực (%)', v_canonical;
  END IF;
  INSERT INTO public.worker_compensation_profiles (
    tenant_id, worker_id, default_compensation_type, monthly_productive_minutes, created_by
  ) VALUES (
    v_tenant, p_worker_id, COALESCE(v_canonical, p_compensation_type), p_monthly_productive_minutes, auth.uid()
  )
  ON CONFLICT (tenant_id, worker_id) DO UPDATE SET
    default_compensation_type = EXCLUDED.default_compensation_type,
    monthly_productive_minutes = EXCLUDED.monthly_productive_minutes,
    is_active = true,
    updated_at = now()
  RETURNING * INTO v_row;
  PERFORM public.write_cost_audit('worker_compensation_profiles', v_row.id, 'UPDATE', NULL, to_jsonb(v_row), NULL);
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_worker_compensation_assignment_draft(
  p_assignment_id uuid,
  p_compensation_type text,
  p_payroll_policy_group_id uuid,
  p_effective_from date,
  p_effective_to date DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_before public.worker_compensation_assignments;
  v_after public.worker_compensation_assignments;
BEGIN
  IF NOT public.has_payroll_permission('payroll_policy_manage') THEN RAISE EXCEPTION 'Bạn không có quyền sửa phân loại lương'; END IF;
  IF p_compensation_type NOT IN ('MONTHLY_MANAGER','MONTHLY_HELPER','PIECE_RATE','HOURLY') THEN RAISE EXCEPTION 'Hình thức trả lương không hợp lệ'; END IF;
  IF p_effective_from IS NULL OR NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Ngày hiệu lực và lý do là bắt buộc'; END IF;
  SELECT * INTO v_before FROM public.worker_compensation_assignments
  WHERE id = p_assignment_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy cấu hình phân loại lương'; END IF;
  IF v_before.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ cấu hình nháp mới được sửa'; END IF;
  IF NOT public.payroll_worker_manageable(v_before.worker_id) THEN RAISE EXCEPTION 'Bạn không có quyền sửa nhân sự này'; END IF;
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  UPDATE public.worker_compensation_assignments SET
    compensation_type = p_compensation_type,
    payroll_policy_group_id = p_payroll_policy_group_id,
    effective_from = p_effective_from,
    effective_to = p_effective_to,
    reason = btrim(p_reason),
    updated_at = now()
  WHERE id = v_before.id RETURNING * INTO v_after;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  PERFORM public.write_cost_audit('worker_compensation_assignments', v_after.id, 'UPDATE', to_jsonb(v_before), to_jsonb(v_after), btrim(p_reason));
  RETURN to_jsonb(v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.discard_worker_compensation_assignment_draft(
  p_assignment_id uuid, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_before public.worker_compensation_assignments;
BEGIN
  IF NOT public.has_payroll_permission('payroll_policy_manage') THEN RAISE EXCEPTION 'Bạn không có quyền hủy phân loại lương'; END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Lý do hủy nháp là bắt buộc'; END IF;
  SELECT * INTO v_before FROM public.worker_compensation_assignments
  WHERE id = p_assignment_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy cấu hình phân loại lương'; END IF;
  IF v_before.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ cấu hình nháp mới được hủy'; END IF;
  IF NOT public.payroll_worker_manageable(v_before.worker_id) THEN RAISE EXCEPTION 'Bạn không có quyền hủy cấu hình nhân sự này'; END IF;
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  DELETE FROM public.worker_compensation_assignments WHERE id = v_before.id;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  PERFORM public.write_cost_audit('worker_compensation_assignments', v_before.id, 'DELETE', to_jsonb(v_before), NULL, btrim(p_reason));
  RETURN to_jsonb(v_before);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_product_piece_rate_draft(
  p_rate_version_id uuid,
  p_rate numeric,
  p_effective_from date,
  p_effective_to date DEFAULT NULL,
  p_unit text DEFAULT 'PIECE',
  p_source_reference text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_before public.product_piece_rate_versions;
  v_after public.product_piece_rate_versions;
BEGIN
  IF NOT public.has_payroll_permission('payroll_rate_manage') THEN RAISE EXCEPTION 'Bạn không có quyền sửa đơn giá công'; END IF;
  IF p_rate IS NULL OR p_rate < 0 THEN RAISE EXCEPTION 'Đơn giá phải lớn hơn hoặc bằng 0'; END IF;
  IF p_unit NOT IN ('PIECE','SET') THEN RAISE EXCEPTION 'Đơn vị đơn giá không hợp lệ'; END IF;
  IF p_effective_from IS NULL OR NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Ngày hiệu lực và lý do là bắt buộc'; END IF;
  SELECT * INTO v_before FROM public.product_piece_rate_versions
  WHERE id = p_rate_version_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên bản đơn giá'; END IF;
  IF v_before.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ đơn giá nháp mới được sửa'; END IF;
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  UPDATE public.product_piece_rate_versions SET
    rate = p_rate,
    effective_from = p_effective_from,
    effective_to = p_effective_to,
    unit = p_unit,
    source_reference = NULLIF(btrim(p_source_reference), ''),
    reason = btrim(p_reason),
    updated_at = now()
  WHERE id = v_before.id RETURNING * INTO v_after;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  PERFORM public.write_cost_audit('product_piece_rate_versions', v_after.id, 'UPDATE', to_jsonb(v_before), to_jsonb(v_after), btrim(p_reason));
  RETURN to_jsonb(v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.discard_product_piece_rate_draft(
  p_rate_version_id uuid, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_before public.product_piece_rate_versions;
BEGIN
  IF NOT public.has_payroll_permission('payroll_rate_manage') THEN RAISE EXCEPTION 'Bạn không có quyền hủy đơn giá công'; END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Lý do hủy nháp là bắt buộc'; END IF;
  SELECT * INTO v_before FROM public.product_piece_rate_versions
  WHERE id = p_rate_version_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên bản đơn giá'; END IF;
  IF v_before.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ đơn giá nháp mới được hủy'; END IF;
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  DELETE FROM public.product_piece_rate_versions WHERE id = v_before.id;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  PERFORM public.write_cost_audit('product_piece_rate_versions', v_before.id, 'DELETE', to_jsonb(v_before), NULL, btrim(p_reason));
  RETURN to_jsonb(v_before);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_social_insurance_draft(
  p_version_id uuid,
  p_employee_amount numeric,
  p_effective_from date,
  p_effective_to date DEFAULT NULL,
  p_source_reference text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_before public.employee_social_insurance_versions;
  v_after public.employee_social_insurance_versions;
BEGIN
  IF NOT public.has_payroll_permission('payroll_insurance_manage') THEN RAISE EXCEPTION 'Bạn không có quyền sửa BHXH'; END IF;
  IF p_employee_amount IS NULL OR p_employee_amount < 0 THEN RAISE EXCEPTION 'Mức BHXH không hợp lệ'; END IF;
  IF p_effective_from IS NULL OR NULLIF(btrim(p_source_reference), '') IS NULL OR NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Ngày hiệu lực, nguồn và lý do là bắt buộc';
  END IF;
  SELECT * INTO v_before FROM public.employee_social_insurance_versions
  WHERE id = p_version_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy cấu hình BHXH'; END IF;
  IF v_before.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ cấu hình BHXH nháp mới được sửa'; END IF;
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  UPDATE public.employee_social_insurance_versions SET
    employee_amount = p_employee_amount,
    effective_from = p_effective_from,
    effective_to = p_effective_to,
    source_reference = btrim(p_source_reference),
    reason = btrim(p_reason),
    updated_at = now()
  WHERE id = v_before.id RETURNING * INTO v_after;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  PERFORM public.write_cost_audit('employee_social_insurance_versions', v_after.id, 'UPDATE', to_jsonb(v_before), to_jsonb(v_after), btrim(p_reason));
  RETURN to_jsonb(v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.discard_social_insurance_draft(
  p_version_id uuid, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_before public.employee_social_insurance_versions;
BEGIN
  IF NOT public.has_payroll_permission('payroll_insurance_manage') THEN RAISE EXCEPTION 'Bạn không có quyền hủy BHXH'; END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Lý do hủy nháp là bắt buộc'; END IF;
  SELECT * INTO v_before FROM public.employee_social_insurance_versions
  WHERE id = p_version_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy cấu hình BHXH'; END IF;
  IF v_before.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ cấu hình BHXH nháp mới được hủy'; END IF;
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  DELETE FROM public.employee_social_insurance_versions WHERE id = v_before.id;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  PERFORM public.write_cost_audit('employee_social_insurance_versions', v_before.id, 'DELETE', to_jsonb(v_before), NULL, btrim(p_reason));
  RETURN to_jsonb(v_before);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_bank_account_draft(
  p_bank_account_id uuid,
  p_account_number text,
  p_account_name text,
  p_bank_name text,
  p_bank_code text DEFAULT NULL,
  p_is_primary boolean DEFAULT true,
  p_effective_from date DEFAULT CURRENT_DATE,
  p_effective_to date DEFAULT NULL,
  p_source_reference text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_before public.bank_accounts;
  v_after public.bank_accounts;
  v_before_json jsonb;
  v_after_json jsonb;
BEGIN
  IF NOT public.has_payroll_permission('payroll_bank_manage') THEN RAISE EXCEPTION 'Bạn không có quyền sửa tài khoản nhận lương'; END IF;
  IF NULLIF(btrim(p_account_number), '') IS NULL OR NULLIF(btrim(p_account_name), '') IS NULL
     OR NULLIF(btrim(p_bank_name), '') IS NULL OR p_effective_from IS NULL
     OR NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Số tài khoản, tên, ngân hàng, ngày hiệu lực và lý do là bắt buộc';
  END IF;
  SELECT * INTO v_before FROM public.bank_accounts
  WHERE id = p_bank_account_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tài khoản nhận lương'; END IF;
  IF v_before.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ tài khoản nháp mới được sửa'; END IF;
  v_before_json := (to_jsonb(v_before) - 'account_number')
    || jsonb_build_object('account_number_masked', public.mask_bank_account(v_before.account_number));
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  UPDATE public.bank_accounts SET
    account_number = btrim(p_account_number),
    account_name = btrim(p_account_name),
    bank_name = btrim(p_bank_name),
    bank_code = NULLIF(upper(btrim(p_bank_code)), ''),
    is_primary = COALESCE(p_is_primary, true),
    effective_from = p_effective_from,
    effective_to = p_effective_to,
    source_reference = NULLIF(btrim(p_source_reference), ''),
    reason = btrim(p_reason),
    updated_at = now()
  WHERE id = v_before.id RETURNING * INTO v_after;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  v_after_json := (to_jsonb(v_after) - 'account_number')
    || jsonb_build_object('account_number_masked', public.mask_bank_account(v_after.account_number));
  INSERT INTO public.audit_events (
    tenant_id, entity_type, entity_id, action, before_data, after_data, actor_id, reason
  ) VALUES (
    v_tenant, 'bank_accounts', v_after.id, 'UPDATE', v_before_json, v_after_json, auth.uid(), btrim(p_reason)
  );
  RETURN v_after_json;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Nhân sự đang có một tài khoản nhận lương chính nháp';
END;
$$;

CREATE OR REPLACE FUNCTION public.discard_bank_account_draft(
  p_bank_account_id uuid, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_before public.bank_accounts;
  v_before_json jsonb;
BEGIN
  IF NOT public.has_payroll_permission('payroll_bank_manage') THEN RAISE EXCEPTION 'Bạn không có quyền hủy tài khoản nhận lương'; END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Lý do hủy nháp là bắt buộc'; END IF;
  SELECT * INTO v_before FROM public.bank_accounts
  WHERE id = p_bank_account_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tài khoản nhận lương'; END IF;
  IF v_before.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ tài khoản nháp mới được hủy'; END IF;
  v_before_json := (to_jsonb(v_before) - 'account_number')
    || jsonb_build_object('account_number_masked', public.mask_bank_account(v_before.account_number));
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  DELETE FROM public.bank_accounts WHERE id = v_before.id;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  INSERT INTO public.audit_events (
    tenant_id, entity_type, entity_id, action, before_data, after_data, actor_id, reason
  ) VALUES (
    v_tenant, 'bank_accounts', v_before.id, 'DELETE', v_before_json, NULL, auth.uid(), btrim(p_reason)
  );
  RETURN v_before_json;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_payroll_workers(p_include_inactive boolean DEFAULT false)
RETURNS TABLE(
  id uuid, employee_code text, display_name text, user_id uuid, worker_type text,
  primary_cost_center_id uuid, location_code text, position_title text,
  employment_type text, employment_start_date date, employment_end_date date,
  payroll_status text, is_active boolean, current_assignment_id uuid,
  current_compensation_type text, current_policy_group_id uuid, current_policy_group_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant text := public.require_default_tenant();
BEGIN
  RETURN QUERY
  SELECT w.id, w.employee_code, w.display_name, w.user_id, w.worker_type,
    w.primary_cost_center_id, w.location_code, w.position_title,
    COALESCE(a.compensation_type, w.employment_type),
    w.employment_start_date, w.employment_end_date, w.payroll_status, w.is_active,
    a.id, a.compensation_type, g.id, g.code
  FROM public.production_workers w
  LEFT JOIN LATERAL (
    SELECT x.* FROM public.worker_compensation_assignments x
    WHERE x.worker_id = w.id AND x.tenant_id = w.tenant_id
      AND x.status IN ('APPROVED','RETIRED')
      AND x.effective_from <= CURRENT_DATE
      AND (x.effective_to IS NULL OR x.effective_to >= CURRENT_DATE)
    ORDER BY x.effective_from DESC LIMIT 1
  ) a ON true
  LEFT JOIN public.payroll_policy_groups g ON g.id = a.payroll_policy_group_id
  WHERE w.tenant_id = v_tenant
    AND (COALESCE(p_include_inactive, false) OR (w.is_active AND w.payroll_status <> 'TERMINATED'))
    AND public.payroll_worker_in_scope(w.id)
  ORDER BY w.employee_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_worker_attendance_methods()
RETURNS TABLE(worker_id uuid, attendance_method text, compensation_type text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant text := public.require_default_tenant();
BEGIN
  IF NOT public.has_production_permission('production_view')
     AND NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem hình thức chấm công';
  END IF;
  RETURN QUERY
  SELECT w.id,
    CASE WHEN resolved.compensation_type IN ('MONTHLY_MANAGER','MONTHLY_HELPER') THEN 'DAY'
         WHEN resolved.compensation_type = 'PIECE_RATE' THEN 'OUTPUT'
         ELSE 'HOUR' END,
    resolved.compensation_type
  FROM public.production_workers w
  CROSS JOIN LATERAL (
    SELECT public.resolve_payroll_compensation_type(w.id, CURRENT_DATE) AS compensation_type
  ) resolved
  WHERE w.tenant_id = v_tenant AND w.is_active
  ORDER BY w.employee_code;
END;
$$;

-- Operational labor facts must resolve the worker classification at the fact
-- date. Reading the current compatibility profile would rewrite history when a
-- worker changes compensation method.
CREATE OR REPLACE FUNCTION public.record_production_labor_fact(
  p_production_order_operation_id uuid, p_worker_id uuid, p_quantity numeric DEFAULT 0,
  p_accepted_quantity numeric DEFAULT 0, p_minutes numeric DEFAULT 0, p_fact_date date DEFAULT CURRENT_DATE,
  p_compensation_type text DEFAULT NULL, p_idempotency_key text DEFAULT NULL, p_source_log_id uuid DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_op public.production_order_operations;
  v_worker public.production_workers;
  v_rate public.worker_compensation_rates;
  v_type text;
  v_amount numeric(18,2);
  v_rate_amount numeric(18,6);
  v_class text;
  v_formula text;
  v_fact public.production_operation_labor_facts;
  v_entry public.labor_cost_entries;
  v_existing_entry public.labor_cost_entries;
  v_category uuid;
  v_center uuid;
  v_object uuid;
  v_key text := NULLIF(btrim(p_idempotency_key), '');
BEGIN
  IF NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền ghi nhận nhân công';
  END IF;
  IF v_key IS NULL THEN RAISE EXCEPTION 'Idempotency key là bắt buộc'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('labor-fact:' || v_tenant || ':' || v_key, 0));
  SELECT * INTO v_op
  FROM public.production_order_operations
  WHERE id = p_production_order_operation_id AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Công đoạn không tồn tại'; END IF;

  SELECT * INTO v_worker
  FROM public.production_workers
  WHERE id = p_worker_id AND tenant_id = v_tenant AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Công nhân không tồn tại hoặc không hoạt động'; END IF;

  IF p_source_log_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_operation_logs l
    WHERE l.id = p_source_log_id AND l.tenant_id = v_tenant
      AND l.production_order_operation_id = v_op.id
  ) THEN
    RAISE EXCEPTION 'Log nhân công không thuộc công đoạn';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.production_operation_labor_facts
    WHERE tenant_id = v_tenant AND idempotency_key = v_key
  ) THEN
    SELECT f.* INTO v_fact
    FROM public.production_operation_labor_facts f
    WHERE f.tenant_id = v_tenant AND f.idempotency_key = v_key;
    SELECT e.* INTO v_existing_entry
    FROM public.labor_cost_entries e
    WHERE e.labor_fact_id = v_fact.id;
    RETURN jsonb_build_object('fact', to_jsonb(v_fact), 'entry', to_jsonb(v_existing_entry), 'reused', true);
  END IF;

  IF p_quantity < 0 OR p_accepted_quantity < 0 OR p_minutes < 0 THEN
    RAISE EXCEPTION 'Số lượng/thời gian không hợp lệ';
  END IF;
  v_type := public.resolve_payroll_compensation_type(v_worker.id, p_fact_date);
  IF p_compensation_type IS NOT NULL AND p_compensation_type <> v_type THEN
    RAISE EXCEPTION 'Loại trả công không khớp phân loại lương tại ngày ghi nhận';
  END IF;

  v_rate := public.resolve_worker_compensation_rate(v_worker.id, v_type, p_fact_date);
  IF v_type = 'HOURLY' THEN
    IF p_minutes <= 0 THEN RAISE EXCEPTION 'Nhân công theo giờ cần số phút hợp lệ'; END IF;
    v_rate_amount := v_rate.hourly_rate;
    v_amount := round(p_minutes / 60.0 * v_rate.hourly_rate, 2);
    v_class := 'DIRECT_LABOR';
    v_formula := format('minutes/60 * hourly_rate = %s/60 * %s', p_minutes, v_rate.hourly_rate);
  ELSIF v_type = 'PIECE_RATE' THEN
    IF p_accepted_quantity <= 0 THEN RAISE EXCEPTION 'Nhân công theo sản phẩm cần số lượng đạt'; END IF;
    v_rate_amount := v_rate.piece_rate;
    v_amount := round(p_accepted_quantity * v_rate.piece_rate, 2);
    v_class := 'DIRECT_LABOR';
    v_formula := format('accepted_quantity * piece_rate = %s * %s', p_accepted_quantity, v_rate.piece_rate);
  ELSE
    IF p_minutes <= 0 OR v_rate.monthly_productive_minutes IS NULL OR v_rate.monthly_productive_minutes <= 0 THEN
      RAISE EXCEPTION 'Nhân công tháng cần phút sản xuất và mẫu số tháng';
    END IF;
    v_rate_amount := v_rate.monthly_rate;
    v_amount := round(v_rate.monthly_rate / v_rate.monthly_productive_minutes * p_minutes, 2);
    v_class := CASE
      WHEN v_type = 'MONTHLY_HELPER' AND p_production_order_operation_id IS NOT NULL THEN 'DIRECT_LABOR'
      ELSE 'MANUFACTURING_OVERHEAD'
    END;
    v_formula := format(
      'monthly_rate / monthly_productive_minutes * minutes = %s/%s * %s',
      v_rate.monthly_rate, v_rate.monthly_productive_minutes, p_minutes
    );
  END IF;

  SELECT id INTO v_category
  FROM public.cost_categories
  WHERE tenant_id = v_tenant AND code = CASE
    WHEN v_class = 'DIRECT_LABOR' THEN 'DIRECT_LABOR'
    WHEN v_type = 'MONTHLY_MANAGER' THEN 'FIXED_MANUFACTURING_OVERHEAD'
    ELSE 'VARIABLE_MANUFACTURING_OVERHEAD'
  END;
  IF v_category IS NULL THEN RAISE EXCEPTION 'Chưa cấu hình danh mục chi phí nhân công'; END IF;

  SELECT COALESCE(v_op.cost_center_id, v_worker.primary_cost_center_id) INTO v_center;
  SELECT id INTO v_object
  FROM public.cost_objects
  WHERE tenant_id = v_tenant AND object_type = 'PRODUCTION_ORDER' AND source_id = v_op.production_order_id;
  IF v_object IS NULL THEN
    INSERT INTO public.cost_objects (
      tenant_id, object_type, source_id, display_code, display_name
    ) VALUES (
      v_tenant, 'PRODUCTION_ORDER', v_op.production_order_id,
      'SX-' || left(v_op.production_order_id::text, 8),
      'Lệnh sản xuất ' || left(v_op.production_order_id::text, 8)
    ) ON CONFLICT DO NOTHING;
    SELECT id INTO v_object
    FROM public.cost_objects
    WHERE tenant_id = v_tenant AND object_type = 'PRODUCTION_ORDER' AND source_id = v_op.production_order_id;
  END IF;

  INSERT INTO public.production_operation_labor_facts (
    tenant_id, production_order_id, production_order_operation_id, worker_id, rate_id,
    compensation_type, quantity, accepted_quantity, minutes, fact_date, rate_amount,
    monthly_productive_minutes, calculated_amount, cost_classification, is_estimated,
    formula_basis, source_log_id, idempotency_key, notes, created_by
  ) VALUES (
    v_tenant, v_op.production_order_id, v_op.id, v_worker.id, v_rate.id,
    v_type, p_quantity, p_accepted_quantity, p_minutes, p_fact_date, v_rate_amount,
    v_rate.monthly_productive_minutes, v_amount, v_class, v_rate.is_estimated,
    v_formula, p_source_log_id, v_key, p_notes, auth.uid()
  ) RETURNING * INTO v_fact;

  INSERT INTO public.labor_cost_entries (
    tenant_id, labor_fact_id, production_order_id, production_order_operation_id,
    worker_id, rate_id, cost_category_id, cost_center_id, cost_object_id,
    compensation_type, quantity, accepted_quantity, minutes, rate_amount,
    calculated_amount, cost_classification, is_estimated, formula_basis, fact_date, created_by
  ) VALUES (
    v_tenant, v_fact.id, v_fact.production_order_id, v_fact.production_order_operation_id,
    v_fact.worker_id, v_fact.rate_id, v_category, v_center, v_object,
    v_fact.compensation_type, v_fact.quantity, v_fact.accepted_quantity, v_fact.minutes,
    v_fact.rate_amount, v_fact.calculated_amount, v_fact.cost_classification,
    v_fact.is_estimated, v_fact.formula_basis, v_fact.fact_date, auth.uid()
  ) RETURNING * INTO v_entry;
  PERFORM public.write_cost_audit('labor_cost_entries', v_entry.id, 'CREATE', NULL, to_jsonb(v_entry), NULL);
  RETURN jsonb_build_object('fact', to_jsonb(v_fact), 'entry', to_jsonb(v_entry), 'reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_production_attendance(
  p_production_order_operation_id uuid,
  p_worker_id uuid,
  p_attendance_method text,
  p_work_date date DEFAULT CURRENT_DATE,
  p_day_units numeric DEFAULT NULL,
  p_work_hours numeric DEFAULT NULL,
  p_output_quantity numeric DEFAULT NULL,
  p_standard_hours_per_day numeric DEFAULT 8,
  p_idempotency_key text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_worker public.production_workers;
  v_operation public.production_order_operations;
  v_order public.production_orders;
  v_compensation_type text;
  v_quantity numeric := 0;
  v_accepted_quantity numeric := 0;
  v_minutes numeric := 0;
  v_result jsonb;
BEGIN
  IF NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền chấm công';
  END IF;

  SELECT * INTO v_operation
  FROM public.production_order_operations
  WHERE id = p_production_order_operation_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Công đoạn không tồn tại'; END IF;
  SELECT * INTO v_order
  FROM public.production_orders
  WHERE id = v_operation.production_order_id AND tenant_id = v_tenant;
  IF v_order.status NOT IN ('RELEASED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD') THEN
    RAISE EXCEPTION 'Lệnh sản xuất chưa ở trạng thái cho phép chấm công';
  END IF;

  SELECT * INTO v_worker
  FROM public.production_workers
  WHERE id = p_worker_id AND tenant_id = v_tenant AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nhân sự không tồn tại hoặc không hoạt động'; END IF;

  v_compensation_type := public.resolve_payroll_compensation_type(v_worker.id, p_work_date);
  IF p_attendance_method = 'DAY' THEN
    IF v_compensation_type NOT IN ('MONTHLY_MANAGER', 'MONTHLY_HELPER') THEN
      RAISE EXCEPTION 'Vị trí này chưa được cấu hình chấm công theo ngày';
    END IF;
    IF p_day_units IS NULL OR p_day_units <= 0 OR p_day_units > 2 THEN
      RAISE EXCEPTION 'Số ngày công phải lớn hơn 0 và không vượt quá 2';
    END IF;
    IF p_standard_hours_per_day IS NULL OR p_standard_hours_per_day <= 0 OR p_standard_hours_per_day > 24 THEN
      RAISE EXCEPTION 'Số giờ chuẩn trong ngày không hợp lệ';
    END IF;
    v_quantity := p_day_units;
    v_minutes := p_day_units * p_standard_hours_per_day * 60;
  ELSIF p_attendance_method = 'HOUR' THEN
    IF v_compensation_type <> 'HOURLY' THEN
      RAISE EXCEPTION 'Vị trí này chưa được cấu hình chấm công theo giờ';
    END IF;
    IF p_work_hours IS NULL OR p_work_hours <= 0 OR p_work_hours > 24 THEN
      RAISE EXCEPTION 'Số giờ làm phải lớn hơn 0 và không vượt quá 24';
    END IF;
    v_quantity := p_work_hours;
    v_minutes := p_work_hours * 60;
  ELSIF p_attendance_method = 'OUTPUT' THEN
    IF v_compensation_type <> 'PIECE_RATE' THEN
      RAISE EXCEPTION 'Vị trí này chưa được cấu hình chấm công theo sản lượng';
    END IF;
    IF p_output_quantity IS NULL OR p_output_quantity <= 0 THEN
      RAISE EXCEPTION 'Sản lượng đạt phải lớn hơn 0';
    END IF;
    v_quantity := p_output_quantity;
    v_accepted_quantity := p_output_quantity;
  ELSE
    RAISE EXCEPTION 'Hình thức chấm công không hợp lệ';
  END IF;

  v_result := public.record_production_labor_fact(
    p_production_order_operation_id, p_worker_id, v_quantity,
    v_accepted_quantity, v_minutes, p_work_date, v_compensation_type,
    p_idempotency_key, NULL, p_notes
  );

  IF NOT public.has_cost_permission('inventory_cost_view') THEN
    RETURN jsonb_build_object(
      'fact_id', v_result->'fact'->>'id',
      'entry_id', v_result->'entry'->>'id',
      'reused', COALESCE((v_result->>'reused')::boolean, false),
      'attendance_method', p_attendance_method,
      'attendance_value', CASE
        WHEN p_attendance_method = 'DAY' THEN p_day_units
        WHEN p_attendance_method = 'HOUR' THEN p_work_hours
        ELSE p_output_quantity
      END,
      'cost_visible', false
    );
  END IF;

  RETURN v_result || jsonb_build_object(
    'attendance_method', p_attendance_method,
    'attendance_value', CASE
      WHEN p_attendance_method = 'DAY' THEN p_day_units
      WHEN p_attendance_method = 'HOUR' THEN p_work_hours
      ELSE p_output_quantity
    END,
    'cost_visible', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_factory_attendance(
  p_worker_id uuid,
  p_attendance_method text,
  p_work_date date DEFAULT CURRENT_DATE,
  p_day_units numeric DEFAULT NULL,
  p_work_hours numeric DEFAULT NULL,
  p_output_quantity numeric DEFAULT NULL,
  p_standard_hours_per_day numeric DEFAULT 8,
  p_activity_name text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_worker public.production_workers;
  v_rate public.worker_compensation_rates;
  v_existing public.factory_attendance_records;
  v_record public.factory_attendance_records;
  v_compensation_type text;
  v_rate_amount numeric(18,6);
  v_amount numeric(18,2);
  v_day_total numeric := 0;
  v_hour_total numeric := 0;
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_activity text := NULLIF(btrim(p_activity_name), '');
  v_notes text := NULLIF(btrim(p_notes), '');
  v_formula text;
BEGIN
  IF NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền chấm công';
  END IF;
  IF v_key IS NULL THEN RAISE EXCEPTION 'Mã yêu cầu chấm công là bắt buộc'; END IF;
  IF p_work_date IS NULL OR p_work_date > CURRENT_DATE THEN RAISE EXCEPTION 'Ngày chấm công không hợp lệ'; END IF;
  IF p_attendance_method NOT IN ('DAY','HOUR','OUTPUT') THEN RAISE EXCEPTION 'Hình thức chấm công không hợp lệ'; END IF;

  SELECT * INTO v_worker
  FROM public.production_workers
  WHERE id = p_worker_id AND tenant_id = v_tenant AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nhân sự không tồn tại hoặc không hoạt động'; END IF;

  v_compensation_type := public.resolve_payroll_compensation_type(v_worker.id, p_work_date);
  IF (p_attendance_method = 'DAY' AND v_compensation_type NOT IN ('MONTHLY_MANAGER','MONTHLY_HELPER'))
     OR (p_attendance_method = 'HOUR' AND v_compensation_type <> 'HOURLY')
     OR (p_attendance_method = 'OUTPUT' AND v_compensation_type <> 'PIECE_RATE') THEN
    RAISE EXCEPTION 'Hình thức chấm công không khớp phân loại lương tại ngày chấm';
  END IF;

  v_rate := public.resolve_worker_compensation_rate(v_worker.id, v_compensation_type, p_work_date);
  IF p_attendance_method = 'DAY' THEN
    IF p_day_units IS NULL OR p_day_units <= 0 OR p_day_units > 2
       OR p_standard_hours_per_day IS NULL OR p_standard_hours_per_day <= 0 OR p_standard_hours_per_day > 24 THEN
      RAISE EXCEPTION 'Số ngày công hoặc giờ chuẩn không hợp lệ';
    END IF;
    v_rate_amount := v_rate.monthly_rate;
    v_amount := round(
      v_rate.monthly_rate * (p_day_units * p_standard_hours_per_day * 60)
      / v_rate.monthly_productive_minutes, 2
    );
    v_formula := 'MONTHLY_RATE * ATTENDANCE_MINUTES / MONTHLY_PRODUCTIVE_MINUTES';
  ELSIF p_attendance_method = 'HOUR' THEN
    IF p_work_hours IS NULL OR p_work_hours <= 0 OR p_work_hours > 24 THEN
      RAISE EXCEPTION 'Số giờ làm không hợp lệ';
    END IF;
    v_rate_amount := v_rate.hourly_rate;
    v_amount := round(v_rate.hourly_rate * p_work_hours, 2);
    v_formula := 'HOURLY_RATE * WORK_HOURS';
  ELSE
    IF p_output_quantity IS NULL OR p_output_quantity <= 0 THEN RAISE EXCEPTION 'Sản lượng phải lớn hơn 0'; END IF;
    IF v_activity IS NULL THEN RAISE EXCEPTION 'Công việc hoặc sản phẩm là bắt buộc khi chấm theo sản lượng'; END IF;
    v_rate_amount := v_rate.piece_rate;
    v_amount := round(v_rate.piece_rate * p_output_quantity, 2);
    v_formula := 'PIECE_RATE * OUTPUT_QUANTITY';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('factory-attendance:' || v_tenant || ':' || v_key, 0));
  SELECT * INTO v_existing
  FROM public.factory_attendance_records
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.worker_id <> v_worker.id OR v_existing.attendance_method <> p_attendance_method
       OR v_existing.work_date <> p_work_date
       OR v_existing.day_units <> COALESCE(p_day_units, 0)
       OR v_existing.work_hours <> COALESCE(p_work_hours, 0)
       OR v_existing.output_quantity <> COALESCE(p_output_quantity, 0)
       OR v_existing.activity_name IS DISTINCT FROM v_activity
       OR v_existing.notes IS DISTINCT FROM v_notes THEN
      RAISE EXCEPTION 'Mã yêu cầu đã được dùng cho dữ liệu chấm công khác';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id, 'reused', true, 'attendance_method', v_existing.attendance_method,
      'attendance_value', CASE v_existing.attendance_method
        WHEN 'DAY' THEN v_existing.day_units
        WHEN 'HOUR' THEN v_existing.work_hours
        ELSE v_existing.output_quantity
      END,
      'cost_visible', public.has_cost_permission('inventory_cost_view'),
      'calculated_amount', CASE
        WHEN public.has_cost_permission('inventory_cost_view') THEN v_existing.calculated_amount
        ELSE NULL
      END
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'factory-attendance-cap:' || v_tenant || ':' || v_worker.id::text || ':' || p_work_date::text, 0
  ));
  SELECT COALESCE(sum(x.day_units),0), COALESCE(sum(x.work_hours),0)
  INTO v_day_total, v_hour_total
  FROM (
    SELECT f.day_units, f.work_hours
    FROM public.factory_attendance_records f
    WHERE f.tenant_id = v_tenant AND f.worker_id = v_worker.id AND f.work_date = p_work_date
      AND NOT EXISTS (
        SELECT 1 FROM public.factory_attendance_reversals r
        WHERE r.attendance_record_id = f.id AND r.tenant_id = f.tenant_id
      )
    UNION ALL
    SELECT
      CASE WHEN f.compensation_type IN ('MONTHLY_MANAGER','MONTHLY_HELPER') THEN f.quantity ELSE 0 END,
      CASE WHEN f.compensation_type = 'HOURLY' THEN f.minutes / 60.0 ELSE 0 END
    FROM public.production_operation_labor_facts f
    WHERE f.tenant_id = v_tenant AND f.worker_id = v_worker.id AND f.fact_date = p_work_date
      AND NOT EXISTS (
        SELECT 1 FROM public.production_attendance_reversals r
        WHERE r.labor_fact_id = f.id AND r.tenant_id = f.tenant_id
      )
  ) x;
  IF p_attendance_method = 'DAY' AND v_day_total + p_day_units > 2 THEN
    RAISE EXCEPTION 'Tổng ngày công trong ngày vượt 2 ngày (đã có %)', v_day_total;
  END IF;
  IF p_attendance_method = 'HOUR' AND v_hour_total + p_work_hours > 24 THEN
    RAISE EXCEPTION 'Tổng giờ công trong ngày vượt 24 giờ (đã có %)', v_hour_total;
  END IF;

  INSERT INTO public.factory_attendance_records (
    tenant_id, worker_id, rate_id, compensation_type, attendance_method, work_date,
    day_units, work_hours, output_quantity, standard_hours_per_day, activity_name,
    rate_amount, calculated_amount, cost_classification, is_estimated, formula_basis,
    idempotency_key, notes, created_by
  ) VALUES (
    v_tenant, v_worker.id, v_rate.id, v_compensation_type, p_attendance_method, p_work_date,
    COALESCE(p_day_units,0), COALESCE(p_work_hours,0), COALESCE(p_output_quantity,0),
    CASE WHEN p_attendance_method = 'DAY' THEN p_standard_hours_per_day ELSE NULL END,
    v_activity, v_rate_amount, v_amount,
    CASE WHEN p_attendance_method = 'OUTPUT' THEN 'DIRECT_LABOR' ELSE 'MANUFACTURING_OVERHEAD' END,
    v_rate.is_estimated, v_formula, v_key, v_notes, auth.uid()
  ) RETURNING * INTO v_record;
  PERFORM public.write_cost_audit(
    'factory_attendance_records', v_record.id, 'CREATE', NULL, to_jsonb(v_record), v_notes
  );
  RETURN jsonb_build_object(
    'id', v_record.id, 'reused', false, 'attendance_method', v_record.attendance_method,
    'attendance_value', CASE v_record.attendance_method
      WHEN 'DAY' THEN v_record.day_units
      WHEN 'HOUR' THEN v_record.work_hours
      ELSE v_record.output_quantity
    END,
    'cost_visible', public.has_cost_permission('inventory_cost_view'),
    'calculated_amount', CASE
      WHEN public.has_cost_permission('inventory_cost_view') THEN v_record.calculated_amount
      ELSE NULL
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_factory_hour_attendance(
  p_worker_id uuid,
  p_work_date date,
  p_check_in_time time,
  p_check_out_time time,
  p_break_minutes integer DEFAULT 0,
  p_activity_name text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_worker public.production_workers;
  v_rate public.worker_compensation_rates;
  v_existing public.factory_attendance_records;
  v_record public.factory_attendance_records;
  v_compensation_type text;
  v_gross_minutes numeric(18,4);
  v_work_hours numeric(18,4);
  v_hour_total numeric := 0;
  v_amount numeric(18,2);
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_activity text := NULLIF(btrim(p_activity_name), '');
  v_notes text := NULLIF(btrim(p_notes), '');
BEGIN
  IF NOT public.has_production_permission('production_operations')
     AND NOT public.has_production_permission('production_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền chấm công';
  END IF;
  IF v_key IS NULL THEN RAISE EXCEPTION 'Mã yêu cầu chấm công là bắt buộc'; END IF;
  IF p_work_date IS NULL OR p_work_date > CURRENT_DATE THEN RAISE EXCEPTION 'Ngày chấm công không hợp lệ'; END IF;
  IF p_check_in_time IS NULL OR p_check_out_time IS NULL OR p_check_out_time <= p_check_in_time THEN
    RAISE EXCEPTION 'Giờ về phải sau giờ đến trong cùng ngày';
  END IF;
  IF p_break_minutes IS NULL OR p_break_minutes < 0 THEN
    RAISE EXCEPTION 'Thời gian nghỉ không hợp lệ';
  END IF;

  v_gross_minutes := extract(epoch FROM (p_check_out_time - p_check_in_time)) / 60;
  IF p_break_minutes >= v_gross_minutes THEN
    RAISE EXCEPTION 'Thời gian nghỉ phải nhỏ hơn tổng thời gian có mặt';
  END IF;
  v_work_hours := round((v_gross_minutes - p_break_minutes) / 60, 4);
  IF v_work_hours <= 0 OR v_work_hours > 24 THEN RAISE EXCEPTION 'Số giờ làm không hợp lệ'; END IF;

  SELECT * INTO v_worker
  FROM public.production_workers
  WHERE id = p_worker_id AND tenant_id = v_tenant AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nhân sự không tồn tại hoặc không hoạt động'; END IF;

  v_compensation_type := public.resolve_payroll_compensation_type(v_worker.id, p_work_date);
  IF v_compensation_type <> 'HOURLY' THEN
    RAISE EXCEPTION 'Hình thức chấm công không khớp phân loại lương tại ngày chấm';
  END IF;

  v_rate := public.resolve_worker_compensation_rate(v_worker.id, v_compensation_type, p_work_date);
  v_amount := round(v_rate.hourly_rate * v_work_hours, 2);

  PERFORM pg_advisory_xact_lock(hashtextextended('factory-attendance:' || v_tenant || ':' || v_key, 0));
  SELECT * INTO v_existing
  FROM public.factory_attendance_records
  WHERE tenant_id = v_tenant AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.worker_id <> v_worker.id
       OR v_existing.attendance_method <> 'HOUR'
       OR v_existing.work_date <> p_work_date
       OR v_existing.work_hours <> v_work_hours
       OR v_existing.check_in_time IS DISTINCT FROM p_check_in_time
       OR v_existing.check_out_time IS DISTINCT FROM p_check_out_time
       OR v_existing.break_minutes <> p_break_minutes
       OR v_existing.activity_name IS DISTINCT FROM v_activity
       OR v_existing.notes IS DISTINCT FROM v_notes THEN
      RAISE EXCEPTION 'Mã yêu cầu đã được dùng cho dữ liệu chấm công khác';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id, 'reused', true, 'attendance_method', 'HOUR',
      'attendance_value', v_existing.work_hours,
      'check_in_time', v_existing.check_in_time,
      'check_out_time', v_existing.check_out_time,
      'break_minutes', v_existing.break_minutes,
      'cost_visible', public.has_cost_permission('inventory_cost_view'),
      'calculated_amount', CASE
        WHEN public.has_cost_permission('inventory_cost_view') THEN v_existing.calculated_amount
        ELSE NULL
      END
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'factory-attendance-cap:' || v_tenant || ':' || v_worker.id::text || ':' || p_work_date::text, 0
  ));
  SELECT COALESCE(sum(x.work_hours), 0)
  INTO v_hour_total
  FROM (
    SELECT f.work_hours
    FROM public.factory_attendance_records f
    WHERE f.tenant_id = v_tenant AND f.worker_id = v_worker.id AND f.work_date = p_work_date
      AND NOT EXISTS (
        SELECT 1 FROM public.factory_attendance_reversals r
        WHERE r.attendance_record_id = f.id AND r.tenant_id = f.tenant_id
      )
    UNION ALL
    SELECT CASE WHEN f.compensation_type = 'HOURLY' THEN f.minutes / 60.0 ELSE 0 END
    FROM public.production_operation_labor_facts f
    WHERE f.tenant_id = v_tenant AND f.worker_id = v_worker.id AND f.fact_date = p_work_date
      AND NOT EXISTS (
        SELECT 1 FROM public.production_attendance_reversals r
        WHERE r.labor_fact_id = f.id AND r.tenant_id = f.tenant_id
      )
  ) x;
  IF v_hour_total + v_work_hours > 24 THEN
    RAISE EXCEPTION 'Tổng giờ công trong ngày vượt 24 giờ (đã có %)', v_hour_total;
  END IF;

  INSERT INTO public.factory_attendance_records (
    tenant_id, worker_id, rate_id, compensation_type, attendance_method, work_date,
    day_units, work_hours, output_quantity, standard_hours_per_day, activity_name,
    check_in_time, check_out_time, break_minutes,
    rate_amount, calculated_amount, cost_classification, is_estimated, formula_basis,
    idempotency_key, notes, created_by
  ) VALUES (
    v_tenant, v_worker.id, v_rate.id, v_compensation_type, 'HOUR', p_work_date,
    0, v_work_hours, 0, NULL, v_activity,
    p_check_in_time, p_check_out_time, p_break_minutes,
    v_rate.hourly_rate, v_amount, 'MANUFACTURING_OVERHEAD', v_rate.is_estimated,
    'HOURLY_RATE * ((CHECK_OUT - CHECK_IN - BREAK_MINUTES) / 60)',
    v_key, v_notes, auth.uid()
  ) RETURNING * INTO v_record;

  PERFORM public.write_cost_audit(
    'factory_attendance_records', v_record.id, 'CREATE', NULL, to_jsonb(v_record), v_notes
  );
  RETURN jsonb_build_object(
    'id', v_record.id, 'reused', false, 'attendance_method', 'HOUR',
    'attendance_value', v_record.work_hours,
    'check_in_time', v_record.check_in_time,
    'check_out_time', v_record.check_out_time,
    'break_minutes', v_record.break_minutes,
    'cost_visible', public.has_cost_permission('inventory_cost_view'),
    'calculated_amount', CASE
      WHEN public.has_cost_permission('inventory_cost_view') THEN v_record.calculated_amount
      ELSE NULL
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_capability_is_known(text),
  public.payroll_capability_is_delegable(text),
  public.has_payroll_permission(text),
  public.list_payroll_capabilities(),
  public.replace_employee_permissions(uuid,jsonb,text),
  public.payroll_worker_in_scope_at(uuid,date),
  public.payroll_worker_in_scope(uuid),
  public.payroll_worker_manageable_at(uuid,date),
  public.payroll_worker_manageable(uuid),
  public.create_payroll_team_assignment(uuid,uuid,date,date,text),
  public.retire_payroll_team_assignment(uuid,date,text),
  public.list_payroll_team_assignments(uuid,uuid,date),
  public.resolve_payroll_compensation_type(uuid,date),
  public.sync_worker_compensation_master(uuid,date),
  public.update_worker_compensation_assignment_draft(uuid,text,uuid,date,date,text),
  public.discard_worker_compensation_assignment_draft(uuid,text),
  public.update_product_piece_rate_draft(uuid,numeric,date,date,text,text,text),
  public.discard_product_piece_rate_draft(uuid,text),
  public.update_social_insurance_draft(uuid,numeric,date,date,text,text),
  public.discard_social_insurance_draft(uuid,text),
  public.update_bank_account_draft(uuid,text,text,text,text,boolean,date,date,text,text),
  public.discard_bank_account_draft(uuid,text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_payroll_permission(text),
  public.list_payroll_capabilities(),
  public.replace_employee_permissions(uuid,jsonb,text),
  public.payroll_worker_in_scope_at(uuid,date),
  public.payroll_worker_in_scope(uuid),
  public.payroll_worker_manageable_at(uuid,date),
  public.payroll_worker_manageable(uuid),
  public.create_payroll_team_assignment(uuid,uuid,date,date,text),
  public.retire_payroll_team_assignment(uuid,date,text),
  public.list_payroll_team_assignments(uuid,uuid,date),
  public.update_worker_compensation_assignment_draft(uuid,text,uuid,date,date,text),
  public.discard_worker_compensation_assignment_draft(uuid,text),
  public.update_product_piece_rate_draft(uuid,numeric,date,date,text,text,text),
  public.discard_product_piece_rate_draft(uuid,text),
  public.update_social_insurance_draft(uuid,numeric,date,date,text,text),
  public.discard_social_insurance_draft(uuid,text),
  public.update_bank_account_draft(uuid,text,text,text,text,boolean,date,date,text,text),
  public.discard_bank_account_draft(uuid,text)
TO authenticated;

REVOKE ALL ON FUNCTION public.payroll_capability_is_known(text),
  public.payroll_capability_is_delegable(text),
  public.resolve_payroll_compensation_type(uuid,date),
  public.sync_worker_compensation_master(uuid,date),
  public.validate_payroll_team_assignment(),
  public.reject_payroll_team_assignment_overlap(),
  public.guard_canonical_worker_compensation(),
  public.guard_canonical_compensation_profile()
FROM authenticated;

COMMENT ON TABLE public.payroll_team_assignments IS
  'Effective-dated payroll team scope. Payroll authorization never derives team membership from user_roles.assigned_by.';
COMMENT ON FUNCTION public.has_payroll_permission(text) IS
  'Server-owned payroll capability matrix. Only view/team-view/worker-manage may be delegated through employee_permissions.';
COMMENT ON FUNCTION public.replace_employee_permissions(uuid,jsonb,text) IS
  'Atomically validates and replaces the complete permission set for one employee/accountant.';
COMMENT ON FUNCTION public.resolve_payroll_compensation_type(uuid,date) IS
  'Canonical effective-date resolver with legacy fallback only before the first approved payroll assignment.';
