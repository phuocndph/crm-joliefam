-- Payroll Sprint 1: master data, effective-dated rates and sensitive worker data.
-- Additive only. Payroll calculation, attendance workflow and production entries
-- remain outside this migration.

ALTER TABLE public.production_workers
  ADD COLUMN IF NOT EXISTS location_code text,
  ADD COLUMN IF NOT EXISTS position_title text,
  ADD COLUMN IF NOT EXISTS employment_type text,
  ADD COLUMN IF NOT EXISTS employment_start_date date,
  ADD COLUMN IF NOT EXISTS employment_end_date date,
  ADD COLUMN IF NOT EXISTS payroll_status text NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE public.production_workers
  ADD CONSTRAINT production_workers_location_code_check
    CHECK (location_code IS NULL OR location_code ~ '^[A-Z0-9_-]{1,20}$'),
  ADD CONSTRAINT production_workers_employment_type_check
    CHECK (employment_type IS NULL OR employment_type IN ('MONTHLY_MANAGER','MONTHLY_HELPER','PIECE_RATE','HOURLY')),
  ADD CONSTRAINT production_workers_employment_dates_check
    CHECK (employment_end_date IS NULL OR (employment_start_date IS NOT NULL AND employment_end_date >= employment_start_date)),
  ADD CONSTRAINT production_workers_payroll_status_check
    CHECK (payroll_status IN ('ACTIVE','SUSPENDED','TERMINATED')),
  ADD CONSTRAINT production_workers_terminated_date_check
    CHECK (payroll_status <> 'TERMINATED' OR employment_end_date IS NOT NULL);

CREATE INDEX IF NOT EXISTS production_workers_payroll_lookup_idx
  ON public.production_workers (tenant_id, payroll_status, location_code, employee_code);

CREATE TABLE public.payroll_policy_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  code text NOT NULL CHECK (code ~ '^[A-Z0-9_-]{2,40}$'),
  name text NOT NULL CHECK (NULLIF(btrim(name), '') IS NOT NULL),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE public.worker_compensation_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  worker_id uuid NOT NULL REFERENCES public.production_workers(id) ON DELETE RESTRICT,
  compensation_type text NOT NULL CHECK (compensation_type IN ('MONTHLY_MANAGER','MONTHLY_HELPER','PIECE_RATE','HOURLY')),
  payroll_policy_group_id uuid NOT NULL REFERENCES public.payroll_policy_groups(id) ON DELETE RESTRICT,
  effective_from date NOT NULL,
  effective_to date,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
  reason text NOT NULL CHECK (NULLIF(btrim(reason), '') IS NOT NULL),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX worker_compensation_assignments_lookup_idx
  ON public.worker_compensation_assignments (tenant_id, worker_id, effective_from DESC, status);
CREATE UNIQUE INDEX worker_compensation_assignments_single_draft_idx
  ON public.worker_compensation_assignments (tenant_id, worker_id) WHERE status = 'DRAFT';

CREATE TABLE public.product_piece_rate_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  unit text NOT NULL DEFAULT 'PIECE' CHECK (unit IN ('PIECE','SET')),
  rate numeric(18,6) NOT NULL CHECK (rate >= 0),
  currency_code text NOT NULL DEFAULT 'VND' CHECK (currency_code ~ '^[A-Z]{3}$'),
  effective_from date NOT NULL,
  effective_to date,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
  reason text NOT NULL CHECK (NULLIF(btrim(reason), '') IS NOT NULL),
  source_reference text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX product_piece_rate_versions_lookup_idx
  ON public.product_piece_rate_versions (tenant_id, product_id, effective_from DESC, status);
CREATE UNIQUE INDEX product_piece_rate_versions_single_draft_idx
  ON public.product_piece_rate_versions (tenant_id, product_id) WHERE status = 'DRAFT';

CREATE TABLE public.employee_social_insurance_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  worker_id uuid NOT NULL REFERENCES public.production_workers(id) ON DELETE RESTRICT,
  calculation_type text NOT NULL DEFAULT 'FIXED_AMOUNT' CHECK (calculation_type = 'FIXED_AMOUNT'),
  employee_amount numeric(18,2) NOT NULL CHECK (employee_amount >= 0),
  currency_code text NOT NULL DEFAULT 'VND' CHECK (currency_code ~ '^[A-Z]{3}$'),
  effective_from date NOT NULL,
  effective_to date,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
  source_reference text NOT NULL CHECK (NULLIF(btrim(source_reference), '') IS NOT NULL),
  reason text NOT NULL CHECK (NULLIF(btrim(reason), '') IS NOT NULL),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX employee_social_insurance_versions_lookup_idx
  ON public.employee_social_insurance_versions (tenant_id, worker_id, effective_from DESC, status);
CREATE UNIQUE INDEX employee_social_insurance_versions_single_draft_idx
  ON public.employee_social_insurance_versions (tenant_id, worker_id) WHERE status = 'DRAFT';

CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  worker_id uuid NOT NULL REFERENCES public.production_workers(id) ON DELETE RESTRICT,
  account_number text NOT NULL CHECK (length(btrim(account_number)) BETWEEN 3 AND 64),
  account_name text NOT NULL CHECK (NULLIF(btrim(account_name), '') IS NOT NULL),
  bank_code text,
  bank_name text NOT NULL CHECK (NULLIF(btrim(bank_name), '') IS NOT NULL),
  is_primary boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL,
  effective_to date,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','VERIFIED','RETIRED')),
  source_reference text,
  reason text NOT NULL CHECK (NULLIF(btrim(reason), '') IS NOT NULL),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX bank_accounts_lookup_idx
  ON public.bank_accounts (tenant_id, worker_id, effective_from DESC, status);
CREATE UNIQUE INDEX bank_accounts_single_draft_idx
  ON public.bank_accounts (tenant_id, worker_id) WHERE status = 'DRAFT' AND is_primary;

CREATE OR REPLACE FUNCTION public.has_payroll_permission(p_permission text DEFAULT 'payroll_view')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'manager'::public.app_role)
      AND p_permission IN (
        'payroll_view','payroll_worker_manage','payroll_rate_view','payroll_rate_manage',
        'payroll_policy_manage','payroll_team_view','payroll_audit'
      )
    )
    OR (
      public.has_role(auth.uid(), 'accountant'::public.app_role)
      AND p_permission IN (
        'payroll_view','payroll_rate_view','payroll_insurance_manage',
        'payroll_bank_manage','payroll_audit'
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.employee_permissions ep
      WHERE ep.user_id = auth.uid() AND ep.permission_type = p_permission AND ep.enabled
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.payroll_worker_in_scope(p_worker_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.production_workers w
    WHERE w.id = p_worker_id AND w.tenant_id = 'default' AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR public.has_role(auth.uid(), 'accountant'::public.app_role)
      OR w.user_id = auth.uid()
      OR (
        public.has_payroll_permission('payroll_team_view')
        AND w.user_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = w.user_id AND ur.assigned_by = auth.uid()
        )
      )
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.payroll_worker_manageable(p_worker_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.production_workers w
    WHERE w.id = p_worker_id AND w.tenant_id = 'default' AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR (
        public.has_payroll_permission('payroll_worker_manage')
        AND w.user_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = w.user_id AND ur.assigned_by = auth.uid()
        )
      )
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.mask_bank_account(p_account_number text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_account_number IS NULL THEN NULL
    WHEN length(btrim(p_account_number)) <= 4 THEN repeat('*', length(btrim(p_account_number)))
    ELSE repeat('*', LEAST(length(btrim(p_account_number)) - 4, 12)) || right(btrim(p_account_number), 4)
  END
$$;

CREATE OR REPLACE FUNCTION public.validate_worker_compensation_assignment_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.production_workers w
    WHERE w.id = NEW.worker_id AND w.tenant_id = NEW.tenant_id
  ) THEN RAISE EXCEPTION 'Nhân sự không cùng phạm vi dữ liệu'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.payroll_policy_groups g
    WHERE g.id = NEW.payroll_policy_group_id AND g.tenant_id = NEW.tenant_id
  ) THEN RAISE EXCEPTION 'Nhóm chính sách lương không cùng phạm vi dữ liệu'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_product_piece_rate_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = NEW.product_id AND p.tenant_id = NEW.tenant_id
  ) THEN RAISE EXCEPTION 'Sản phẩm không cùng phạm vi dữ liệu'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_payroll_worker_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.production_workers w
    WHERE w.id = NEW.worker_id AND w.tenant_id = NEW.tenant_id
  ) THEN RAISE EXCEPTION 'Nhân sự không cùng phạm vi dữ liệu'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_payroll_version_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_transition text := COALESCE(current_setting('app.payroll_master_transition', true), 'off');
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN RAISE EXCEPTION 'Phiên bản đã duyệt không được xóa'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.created_by IS DISTINCT FROM NEW.created_by
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'Không thể thay đổi khóa phạm vi của phiên bản';
  END IF;
  IF OLD.status <> 'DRAFT' AND v_transition <> 'on' THEN
    RAISE EXCEPTION 'Phiên bản đã duyệt là bất biến; hãy tạo phiên bản mới';
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status AND v_transition <> 'on' THEN
    RAISE EXCEPTION 'Trạng thái chỉ được thay đổi qua nghiệp vụ duyệt';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_worker_assignment_overlap()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('APPROVED','RETIRED') AND EXISTS (
    SELECT 1 FROM public.worker_compensation_assignments x
    WHERE x.id <> NEW.id AND x.tenant_id = NEW.tenant_id AND x.worker_id = NEW.worker_id
      AND x.status IN ('APPROVED','RETIRED')
      AND daterange(x.effective_from, COALESCE(x.effective_to, 'infinity'::date), '[]')
          && daterange(NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'::date), '[]')
  ) THEN RAISE EXCEPTION 'Khoảng hiệu lực phân loại lương bị chồng lấn'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_product_piece_rate_overlap()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('APPROVED','RETIRED') AND EXISTS (
    SELECT 1 FROM public.product_piece_rate_versions x
    WHERE x.id <> NEW.id AND x.tenant_id = NEW.tenant_id AND x.product_id = NEW.product_id
      AND x.status IN ('APPROVED','RETIRED')
      AND daterange(x.effective_from, COALESCE(x.effective_to, 'infinity'::date), '[]')
          && daterange(NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'::date), '[]')
  ) THEN RAISE EXCEPTION 'Khoảng hiệu lực đơn giá sản phẩm bị chồng lấn'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_social_insurance_overlap()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('APPROVED','RETIRED') AND EXISTS (
    SELECT 1 FROM public.employee_social_insurance_versions x
    WHERE x.id <> NEW.id AND x.tenant_id = NEW.tenant_id AND x.worker_id = NEW.worker_id
      AND x.status IN ('APPROVED','RETIRED')
      AND daterange(x.effective_from, COALESCE(x.effective_to, 'infinity'::date), '[]')
          && daterange(NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'::date), '[]')
  ) THEN RAISE EXCEPTION 'Khoảng hiệu lực BHXH bị chồng lấn'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_primary_bank_account_overlap()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_primary AND NEW.status IN ('VERIFIED','RETIRED') AND EXISTS (
    SELECT 1 FROM public.bank_accounts x
    WHERE x.id <> NEW.id AND x.tenant_id = NEW.tenant_id AND x.worker_id = NEW.worker_id
      AND x.is_primary AND x.status IN ('VERIFIED','RETIRED')
      AND daterange(x.effective_from, COALESCE(x.effective_to, 'infinity'::date), '[]')
          && daterange(NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'::date), '[]')
  ) THEN RAISE EXCEPTION 'Khoảng hiệu lực tài khoản nhận lương chính bị chồng lấn'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_bank_account_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action text := CASE WHEN TG_OP = 'INSERT' THEN 'CREATE' WHEN TG_OP = 'DELETE' THEN 'DELETE' ELSE 'UPDATE' END;
  v_before jsonb;
  v_after jsonb;
  v_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  v_tenant text := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
BEGIN
  IF current_setting('app.cost_suppress_audit', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_before := (to_jsonb(OLD) - 'account_number')
      || jsonb_build_object('account_number_masked', public.mask_bank_account(OLD.account_number));
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_after := (to_jsonb(NEW) - 'account_number')
      || jsonb_build_object('account_number_masked', public.mask_bank_account(NEW.account_number));
  END IF;
  INSERT INTO public.audit_events (tenant_id, entity_type, entity_id, action, before_data, after_data, actor_id)
  VALUES (v_tenant, 'bank_accounts', v_id, v_action, v_before, v_after, auth.uid());
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER payroll_policy_groups_updated_at BEFORE UPDATE ON public.payroll_policy_groups
FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
CREATE TRIGGER worker_compensation_assignments_updated_at BEFORE UPDATE ON public.worker_compensation_assignments
FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
CREATE TRIGGER product_piece_rate_versions_updated_at BEFORE UPDATE ON public.product_piece_rate_versions
FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
CREATE TRIGGER employee_social_insurance_versions_updated_at BEFORE UPDATE ON public.employee_social_insurance_versions
FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
CREATE TRIGGER bank_accounts_updated_at BEFORE UPDATE ON public.bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();

CREATE TRIGGER worker_compensation_assignments_scope BEFORE INSERT OR UPDATE ON public.worker_compensation_assignments
FOR EACH ROW EXECUTE FUNCTION public.validate_worker_compensation_assignment_scope();
CREATE TRIGGER product_piece_rate_versions_scope BEFORE INSERT OR UPDATE ON public.product_piece_rate_versions
FOR EACH ROW EXECUTE FUNCTION public.validate_product_piece_rate_scope();
CREATE TRIGGER employee_social_insurance_versions_scope BEFORE INSERT OR UPDATE ON public.employee_social_insurance_versions
FOR EACH ROW EXECUTE FUNCTION public.validate_payroll_worker_scope();
CREATE TRIGGER bank_accounts_scope BEFORE INSERT OR UPDATE ON public.bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.validate_payroll_worker_scope();

CREATE TRIGGER worker_compensation_assignments_guard BEFORE UPDATE OR DELETE ON public.worker_compensation_assignments
FOR EACH ROW EXECUTE FUNCTION public.guard_payroll_version_mutation();
CREATE TRIGGER product_piece_rate_versions_guard BEFORE UPDATE OR DELETE ON public.product_piece_rate_versions
FOR EACH ROW EXECUTE FUNCTION public.guard_payroll_version_mutation();
CREATE TRIGGER employee_social_insurance_versions_guard BEFORE UPDATE OR DELETE ON public.employee_social_insurance_versions
FOR EACH ROW EXECUTE FUNCTION public.guard_payroll_version_mutation();
CREATE TRIGGER bank_accounts_guard BEFORE UPDATE OR DELETE ON public.bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.guard_payroll_version_mutation();

CREATE CONSTRAINT TRIGGER worker_compensation_assignments_no_overlap
AFTER INSERT OR UPDATE ON public.worker_compensation_assignments DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION public.reject_worker_assignment_overlap();
CREATE CONSTRAINT TRIGGER product_piece_rate_versions_no_overlap
AFTER INSERT OR UPDATE ON public.product_piece_rate_versions DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION public.reject_product_piece_rate_overlap();
CREATE CONSTRAINT TRIGGER employee_social_insurance_versions_no_overlap
AFTER INSERT OR UPDATE ON public.employee_social_insurance_versions DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION public.reject_social_insurance_overlap();
CREATE CONSTRAINT TRIGGER bank_accounts_primary_no_overlap
AFTER INSERT OR UPDATE ON public.bank_accounts DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION public.reject_primary_bank_account_overlap();

CREATE TRIGGER audit_payroll_policy_groups AFTER INSERT OR UPDATE OR DELETE ON public.payroll_policy_groups
FOR EACH ROW EXECUTE FUNCTION public.audit_cost_change();
CREATE TRIGGER audit_worker_compensation_assignments AFTER INSERT OR UPDATE OR DELETE ON public.worker_compensation_assignments
FOR EACH ROW EXECUTE FUNCTION public.audit_cost_change();
CREATE TRIGGER audit_product_piece_rate_versions AFTER INSERT OR UPDATE OR DELETE ON public.product_piece_rate_versions
FOR EACH ROW EXECUTE FUNCTION public.audit_cost_change();
CREATE TRIGGER audit_employee_social_insurance_versions AFTER INSERT OR UPDATE OR DELETE ON public.employee_social_insurance_versions
FOR EACH ROW EXECUTE FUNCTION public.audit_cost_change();
CREATE TRIGGER audit_bank_accounts AFTER INSERT OR UPDATE OR DELETE ON public.bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.audit_bank_account_change();

CREATE OR REPLACE FUNCTION public.upsert_payroll_policy_group(
  p_code text, p_name text, p_description text DEFAULT NULL,
  p_is_active boolean DEFAULT true, p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_existing public.payroll_policy_groups;
  v_row public.payroll_policy_groups;
  v_action text;
BEGIN
  IF NOT public.has_payroll_permission('payroll_policy_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền quản lý nhóm chính sách lương';
  END IF;
  IF NULLIF(btrim(p_code), '') IS NULL OR NULLIF(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Mã và tên nhóm chính sách là bắt buộc';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Lý do thay đổi nhóm chính sách là bắt buộc';
  END IF;
  SELECT * INTO v_existing
  FROM public.payroll_policy_groups
  WHERE tenant_id = v_tenant AND code = upper(btrim(p_code))
  FOR UPDATE;
  v_action := CASE WHEN FOUND THEN 'UPDATE' ELSE 'CREATE' END;
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  INSERT INTO public.payroll_policy_groups (tenant_id, code, name, description, is_active, created_by)
  VALUES (v_tenant, upper(btrim(p_code)), btrim(p_name), NULLIF(btrim(p_description), ''), COALESCE(p_is_active, true), auth.uid())
  ON CONFLICT (tenant_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    updated_at = now()
  RETURNING * INTO v_row;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  PERFORM public.write_cost_audit(
    'payroll_policy_groups', v_row.id, v_action,
    CASE WHEN v_action = 'UPDATE' THEN to_jsonb(v_existing) ELSE NULL END,
    to_jsonb(v_row), btrim(p_reason)
  );
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_payroll_policy_groups()
RETURNS SETOF public.payroll_policy_groups
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g FROM public.payroll_policy_groups g
  WHERE g.tenant_id = public.require_default_tenant()
    AND (
      public.has_payroll_permission('payroll_view')
      OR public.has_payroll_permission('payroll_policy_manage')
      OR public.has_payroll_permission('payroll_rate_view')
    )
  ORDER BY g.is_active DESC, g.code
$$;

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
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_before public.production_workers;
  v_row public.production_workers;
BEGIN
  IF NOT public.payroll_worker_manageable(p_worker_id) THEN
    RAISE EXCEPTION 'Bạn không có quyền cập nhật nhân sự này';
  END IF;
  IF p_employment_type IS NOT NULL AND p_employment_type NOT IN ('MONTHLY_MANAGER','MONTHLY_HELPER','PIECE_RATE','HOURLY') THEN
    RAISE EXCEPTION 'Loại nhân sự trả lương không hợp lệ';
  END IF;
  IF p_payroll_status NOT IN ('ACTIVE','SUSPENDED','TERMINATED') THEN
    RAISE EXCEPTION 'Trạng thái lương không hợp lệ';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Lý do cập nhật nhân sự là bắt buộc';
  END IF;
  SELECT * INTO v_before
  FROM public.production_workers
  WHERE id = p_worker_id AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy nhân sự'; END IF;
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  UPDATE public.production_workers SET
    location_code = NULLIF(upper(btrim(p_location_code)), ''),
    position_title = NULLIF(btrim(p_position_title), ''),
    employment_type = p_employment_type,
    employment_start_date = p_employment_start_date,
    employment_end_date = p_employment_end_date,
    payroll_status = p_payroll_status,
    updated_at = now()
  WHERE id = p_worker_id AND tenant_id = v_tenant
  RETURNING * INTO v_row;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  PERFORM public.write_cost_audit(
    'production_workers', v_row.id, 'UPDATE',
    to_jsonb(v_before), to_jsonb(v_row), btrim(p_reason)
  );
  RETURN to_jsonb(v_row);
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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant();
BEGIN
  RETURN QUERY
  SELECT w.id, w.employee_code, w.display_name, w.user_id, w.worker_type,
    w.primary_cost_center_id, w.location_code, w.position_title, w.employment_type,
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

CREATE OR REPLACE FUNCTION public.create_worker_compensation_assignment(
  p_worker_id uuid, p_compensation_type text, p_payroll_policy_group_id uuid,
  p_effective_from date, p_effective_to date DEFAULT NULL, p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_row public.worker_compensation_assignments;
BEGIN
  IF NOT public.payroll_worker_manageable(p_worker_id) OR NOT public.has_payroll_permission('payroll_policy_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền cấu hình phân loại lương';
  END IF;
  IF p_compensation_type NOT IN ('MONTHLY_MANAGER','MONTHLY_HELPER','PIECE_RATE','HOURLY') THEN
    RAISE EXCEPTION 'Hình thức trả lương không hợp lệ';
  END IF;
  IF p_effective_from IS NULL OR NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Ngày hiệu lực và lý do là bắt buộc';
  END IF;
  INSERT INTO public.worker_compensation_assignments (
    tenant_id, worker_id, compensation_type, payroll_policy_group_id,
    effective_from, effective_to, reason, created_by
  ) VALUES (
    v_tenant, p_worker_id, p_compensation_type, p_payroll_policy_group_id,
    p_effective_from, p_effective_to, btrim(p_reason), auth.uid()
  ) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Nhân sự đang có một cấu hình phân loại lương nháp';
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_worker_compensation_assignment(
  p_assignment_id uuid, p_reason text, p_supersede_previous boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_row public.worker_compensation_assignments;
  v_previous public.worker_compensation_assignments;
  v_after public.worker_compensation_assignments;
BEGIN
  IF NOT public.has_payroll_permission('payroll_policy_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền duyệt phân loại lương';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Lý do duyệt là bắt buộc'; END IF;
  SELECT * INTO v_row FROM public.worker_compensation_assignments
  WHERE id = p_assignment_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy cấu hình phân loại lương'; END IF;
  IF NOT public.payroll_worker_manageable(v_row.worker_id) THEN RAISE EXCEPTION 'Bạn không có quyền duyệt nhân sự này'; END IF;
  IF v_row.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ cấu hình nháp mới được duyệt'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payroll_policy_groups g WHERE g.id = v_row.payroll_policy_group_id AND g.tenant_id = v_tenant AND g.is_active) THEN
    RAISE EXCEPTION 'Nhóm chính sách lương không hoạt động';
  END IF;
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
  PERFORM set_config('app.payroll_master_transition', 'off', true);
  RETURN to_jsonb(v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_worker_compensation_assignments(p_worker_id uuid DEFAULT NULL)
RETURNS SETOF public.worker_compensation_assignments
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a FROM public.worker_compensation_assignments a
  WHERE a.tenant_id = public.require_default_tenant()
    AND (p_worker_id IS NULL OR a.worker_id = p_worker_id)
    AND public.payroll_worker_in_scope(a.worker_id)
  ORDER BY a.worker_id, a.effective_from DESC, a.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.resolve_worker_compensation_assignment(p_worker_id uuid, p_effective_date date)
RETURNS public.worker_compensation_assignments
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_row public.worker_compensation_assignments; v_count integer;
BEGIN
  IF NOT public.payroll_worker_in_scope(p_worker_id) THEN RAISE EXCEPTION 'Bạn không có quyền xem nhân sự này'; END IF;
  IF p_effective_date IS NULL THEN RAISE EXCEPTION 'Ngày hiệu lực là bắt buộc'; END IF;
  SELECT count(*) INTO v_count
  FROM public.worker_compensation_assignments x
  WHERE x.tenant_id = v_tenant AND x.worker_id = p_worker_id
    AND x.status IN ('APPROVED','RETIRED')
    AND x.effective_from <= p_effective_date
    AND (x.effective_to IS NULL OR x.effective_to >= p_effective_date);
  IF v_count = 0 THEN RAISE EXCEPTION 'Chưa có phân loại lương hiệu lực'; END IF;
  IF v_count > 1 THEN RAISE EXCEPTION 'Có nhiều phân loại lương cùng hiệu lực'; END IF;
  SELECT * INTO v_row
  FROM public.worker_compensation_assignments x
  WHERE x.tenant_id = v_tenant AND x.worker_id = p_worker_id
    AND x.status IN ('APPROVED','RETIRED')
    AND x.effective_from <= p_effective_date
    AND (x.effective_to IS NULL OR x.effective_to >= p_effective_date)
  ORDER BY x.effective_from DESC
  LIMIT 1;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_payroll_products(p_search text DEFAULT NULL)
RETURNS TABLE(
  id uuid, sku text, name text, category text, specifications text, in_stock boolean,
  current_rate_id uuid, current_rate numeric, current_rate_unit text,
  current_rate_effective_from date, current_rate_effective_to date
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_search text := NULLIF(btrim(p_search), '');
BEGIN
  IF NOT public.has_payroll_permission('payroll_rate_view') AND NOT public.has_payroll_permission('payroll_rate_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem đơn giá công';
  END IF;
  RETURN QUERY
  SELECT p.id, p.sku, p.name, p.category, p.specifications, COALESCE(p.in_stock, true),
    r.id, r.rate, r.unit, r.effective_from, r.effective_to
  FROM public.products p
  LEFT JOIN LATERAL (
    SELECT x.* FROM public.product_piece_rate_versions x
    WHERE x.tenant_id = p.tenant_id AND x.product_id = p.id
      AND x.status IN ('APPROVED','RETIRED') AND x.effective_from <= CURRENT_DATE
      AND (x.effective_to IS NULL OR x.effective_to >= CURRENT_DATE)
    ORDER BY x.effective_from DESC LIMIT 1
  ) r ON true
  WHERE p.tenant_id = v_tenant
    AND (v_search IS NULL OR p.name ILIKE '%' || v_search || '%' OR p.sku ILIKE '%' || v_search || '%')
  ORDER BY p.name LIMIT 500;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_product_piece_rate_draft(
  p_product_id uuid, p_rate numeric, p_effective_from date,
  p_effective_to date DEFAULT NULL, p_unit text DEFAULT 'PIECE',
  p_reason text DEFAULT NULL, p_source_reference text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_row public.product_piece_rate_versions;
BEGIN
  IF NOT public.has_payroll_permission('payroll_rate_manage') THEN RAISE EXCEPTION 'Bạn không có quyền quản lý đơn giá công'; END IF;
  IF p_rate IS NULL OR p_rate < 0 THEN RAISE EXCEPTION 'Đơn giá phải lớn hơn hoặc bằng 0'; END IF;
  IF p_unit NOT IN ('PIECE','SET') THEN RAISE EXCEPTION 'Đơn vị đơn giá không hợp lệ'; END IF;
  IF p_effective_from IS NULL OR NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Ngày hiệu lực và lý do là bắt buộc'; END IF;
  INSERT INTO public.product_piece_rate_versions (
    tenant_id, product_id, unit, rate, effective_from, effective_to,
    reason, source_reference, created_by
  ) VALUES (
    v_tenant, p_product_id, p_unit, p_rate, p_effective_from, p_effective_to,
    btrim(p_reason), NULLIF(btrim(p_source_reference), ''), auth.uid()
  ) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Sản phẩm đang có một đơn giá nháp';
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_product_piece_rate(
  p_rate_version_id uuid, p_reason text, p_supersede_previous boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_row public.product_piece_rate_versions;
  v_previous public.product_piece_rate_versions;
  v_after public.product_piece_rate_versions;
BEGIN
  IF NOT public.has_payroll_permission('payroll_rate_manage') THEN RAISE EXCEPTION 'Bạn không có quyền duyệt đơn giá công'; END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Lý do duyệt là bắt buộc'; END IF;
  SELECT * INTO v_row FROM public.product_piece_rate_versions
  WHERE id = p_rate_version_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên bản đơn giá'; END IF;
  IF v_row.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ đơn giá nháp mới được duyệt'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('piece-rate:' || v_tenant || ':' || v_row.product_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.product_piece_rate_versions x
    WHERE x.tenant_id = v_tenant AND x.product_id = v_row.product_id AND x.id <> v_row.id
      AND x.status IN ('APPROVED','RETIRED') AND x.effective_from >= v_row.effective_from
      AND daterange(x.effective_from, COALESCE(x.effective_to, 'infinity'::date), '[]')
          && daterange(v_row.effective_from, COALESCE(v_row.effective_to, 'infinity'::date), '[]')
  ) THEN RAISE EXCEPTION 'Đã có đơn giá cùng hoặc sau ngày hiệu lực này'; END IF;
  SELECT * INTO v_previous FROM public.product_piece_rate_versions x
  WHERE x.tenant_id = v_tenant AND x.product_id = v_row.product_id AND x.id <> v_row.id
    AND x.status IN ('APPROVED','RETIRED') AND x.effective_from < v_row.effective_from
    AND (x.effective_to IS NULL OR x.effective_to >= v_row.effective_from)
  ORDER BY x.effective_from DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF NOT p_supersede_previous THEN RAISE EXCEPTION 'Khoảng hiệu lực đơn giá bị chồng lấn'; END IF;
    PERFORM set_config('app.payroll_master_transition', 'on', true);
    PERFORM set_config('app.cost_suppress_audit', 'on', true);
    UPDATE public.product_piece_rate_versions
      SET status = 'RETIRED', effective_to = v_row.effective_from - 1, updated_at = now()
    WHERE id = v_previous.id;
    PERFORM set_config('app.cost_suppress_audit', 'off', true);
    PERFORM public.write_cost_audit(
      'product_piece_rate_versions', v_previous.id, 'SUPERSEDE', to_jsonb(v_previous),
      to_jsonb((SELECT x FROM public.product_piece_rate_versions x WHERE x.id = v_previous.id)), p_reason
    );
  END IF;
  PERFORM set_config('app.payroll_master_transition', 'on', true);
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  UPDATE public.product_piece_rate_versions SET
    status = 'APPROVED', approved_by = auth.uid(), approved_at = now(), updated_at = now()
  WHERE id = v_row.id RETURNING * INTO v_after;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  PERFORM public.write_cost_audit('product_piece_rate_versions', v_after.id, 'APPROVE', to_jsonb(v_row), to_jsonb(v_after), p_reason);
  PERFORM set_config('app.payroll_master_transition', 'off', true);
  RETURN to_jsonb(v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_product_piece_rates(p_product_id uuid DEFAULT NULL)
RETURNS SETOF public.product_piece_rate_versions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_payroll_permission('payroll_rate_view') AND NOT public.has_payroll_permission('payroll_rate_manage') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem đơn giá công';
  END IF;
  RETURN QUERY SELECT r FROM public.product_piece_rate_versions r
  WHERE r.tenant_id = public.require_default_tenant() AND (p_product_id IS NULL OR r.product_id = p_product_id)
  ORDER BY r.product_id, r.effective_from DESC, r.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_product_piece_rate(p_product_id uuid, p_work_date date)
RETURNS public.product_piece_rate_versions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_row public.product_piece_rate_versions; v_count integer;
BEGIN
  IF NOT public.has_payroll_permission('payroll_rate_view')
     AND NOT public.has_payroll_permission('payroll_rate_manage')
     AND NOT public.has_production_permission('production_operations') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem đơn giá công';
  END IF;
  IF p_work_date IS NULL THEN RAISE EXCEPTION 'Ngày làm việc là bắt buộc'; END IF;
  SELECT count(*) INTO v_count
  FROM public.product_piece_rate_versions x
  WHERE x.tenant_id = v_tenant AND x.product_id = p_product_id
    AND x.status IN ('APPROVED','RETIRED')
    AND x.effective_from <= p_work_date
    AND (x.effective_to IS NULL OR x.effective_to >= p_work_date);
  IF v_count = 0 THEN RAISE EXCEPTION 'Chưa có đơn giá sản phẩm hiệu lực'; END IF;
  IF v_count > 1 THEN RAISE EXCEPTION 'Có nhiều đơn giá sản phẩm cùng hiệu lực'; END IF;
  SELECT * INTO v_row
  FROM public.product_piece_rate_versions x
  WHERE x.tenant_id = v_tenant AND x.product_id = p_product_id
    AND x.status IN ('APPROVED','RETIRED')
    AND x.effective_from <= p_work_date
    AND (x.effective_to IS NULL OR x.effective_to >= p_work_date)
  ORDER BY x.effective_from DESC
  LIMIT 1;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_social_insurance_draft(
  p_worker_id uuid, p_employee_amount numeric, p_effective_from date,
  p_effective_to date DEFAULT NULL, p_source_reference text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_row public.employee_social_insurance_versions;
BEGIN
  IF NOT public.has_payroll_permission('payroll_insurance_manage') THEN RAISE EXCEPTION 'Bạn không có quyền quản lý BHXH'; END IF;
  IF p_employee_amount IS NULL OR p_employee_amount < 0 THEN RAISE EXCEPTION 'Mức BHXH không hợp lệ'; END IF;
  IF p_effective_from IS NULL OR NULLIF(btrim(p_source_reference), '') IS NULL OR NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Ngày hiệu lực, nguồn và lý do là bắt buộc';
  END IF;
  INSERT INTO public.employee_social_insurance_versions (
    tenant_id, worker_id, employee_amount, effective_from, effective_to,
    source_reference, reason, created_by
  ) VALUES (
    v_tenant, p_worker_id, p_employee_amount, p_effective_from, p_effective_to,
    btrim(p_source_reference), btrim(p_reason), auth.uid()
  ) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Nhân sự đang có một cấu hình BHXH nháp';
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_social_insurance_version(
  p_version_id uuid, p_reason text, p_supersede_previous boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_row public.employee_social_insurance_versions;
  v_previous public.employee_social_insurance_versions;
  v_after public.employee_social_insurance_versions;
BEGIN
  IF NOT public.has_payroll_permission('payroll_insurance_manage') THEN RAISE EXCEPTION 'Bạn không có quyền duyệt BHXH'; END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Lý do duyệt là bắt buộc'; END IF;
  SELECT * INTO v_row FROM public.employee_social_insurance_versions
  WHERE id = p_version_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy cấu hình BHXH'; END IF;
  IF v_row.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ cấu hình BHXH nháp mới được duyệt'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('social-insurance:' || v_tenant || ':' || v_row.worker_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.employee_social_insurance_versions x
    WHERE x.tenant_id = v_tenant AND x.worker_id = v_row.worker_id AND x.id <> v_row.id
      AND x.status IN ('APPROVED','RETIRED') AND x.effective_from >= v_row.effective_from
      AND daterange(x.effective_from, COALESCE(x.effective_to, 'infinity'::date), '[]')
          && daterange(v_row.effective_from, COALESCE(v_row.effective_to, 'infinity'::date), '[]')
  ) THEN RAISE EXCEPTION 'Đã có mức BHXH cùng hoặc sau ngày hiệu lực này'; END IF;
  SELECT * INTO v_previous FROM public.employee_social_insurance_versions x
  WHERE x.tenant_id = v_tenant AND x.worker_id = v_row.worker_id AND x.id <> v_row.id
    AND x.status IN ('APPROVED','RETIRED') AND x.effective_from < v_row.effective_from
    AND (x.effective_to IS NULL OR x.effective_to >= v_row.effective_from)
  ORDER BY x.effective_from DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF NOT p_supersede_previous THEN RAISE EXCEPTION 'Khoảng hiệu lực BHXH bị chồng lấn'; END IF;
    PERFORM set_config('app.payroll_master_transition', 'on', true);
    PERFORM set_config('app.cost_suppress_audit', 'on', true);
    UPDATE public.employee_social_insurance_versions
      SET status = 'RETIRED', effective_to = v_row.effective_from - 1, updated_at = now()
    WHERE id = v_previous.id;
    PERFORM set_config('app.cost_suppress_audit', 'off', true);
    PERFORM public.write_cost_audit(
      'employee_social_insurance_versions', v_previous.id, 'SUPERSEDE', to_jsonb(v_previous),
      to_jsonb((SELECT x FROM public.employee_social_insurance_versions x WHERE x.id = v_previous.id)), p_reason
    );
  END IF;
  PERFORM set_config('app.payroll_master_transition', 'on', true);
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  UPDATE public.employee_social_insurance_versions SET
    status = 'APPROVED', approved_by = auth.uid(), approved_at = now(), updated_at = now()
  WHERE id = v_row.id RETURNING * INTO v_after;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  PERFORM public.write_cost_audit('employee_social_insurance_versions', v_after.id, 'APPROVE', to_jsonb(v_row), to_jsonb(v_after), p_reason);
  PERFORM set_config('app.payroll_master_transition', 'off', true);
  RETURN to_jsonb(v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_social_insurance_versions(p_worker_id uuid DEFAULT NULL)
RETURNS SETOF public.employee_social_insurance_versions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT s FROM public.employee_social_insurance_versions s
  WHERE s.tenant_id = public.require_default_tenant()
    AND (p_worker_id IS NULL OR s.worker_id = p_worker_id)
    AND (public.has_payroll_permission('payroll_insurance_manage') OR s.worker_id IN (
      SELECT w.id FROM public.production_workers w WHERE w.user_id = auth.uid() AND w.tenant_id = s.tenant_id
    ))
  ORDER BY s.worker_id, s.effective_from DESC, s.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_social_insurance_version(p_worker_id uuid, p_effective_date date)
RETURNS public.employee_social_insurance_versions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_row public.employee_social_insurance_versions; v_count integer;
BEGIN
  IF NOT public.has_payroll_permission('payroll_insurance_manage')
     AND NOT EXISTS (SELECT 1 FROM public.production_workers w WHERE w.id = p_worker_id AND w.tenant_id = v_tenant AND w.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Bạn không có quyền xem BHXH của nhân sự này';
  END IF;
  IF p_effective_date IS NULL THEN RAISE EXCEPTION 'Ngày hiệu lực là bắt buộc'; END IF;
  SELECT count(*) INTO v_count
  FROM public.employee_social_insurance_versions x
  WHERE x.tenant_id = v_tenant AND x.worker_id = p_worker_id
    AND x.status IN ('APPROVED','RETIRED')
    AND x.effective_from <= p_effective_date
    AND (x.effective_to IS NULL OR x.effective_to >= p_effective_date);
  IF v_count = 0 THEN RAISE EXCEPTION 'Chưa có mức BHXH hiệu lực'; END IF;
  IF v_count > 1 THEN RAISE EXCEPTION 'Có nhiều mức BHXH cùng hiệu lực'; END IF;
  SELECT * INTO v_row
  FROM public.employee_social_insurance_versions x
  WHERE x.tenant_id = v_tenant AND x.worker_id = p_worker_id
    AND x.status IN ('APPROVED','RETIRED')
    AND x.effective_from <= p_effective_date
    AND (x.effective_to IS NULL OR x.effective_to >= p_effective_date)
  ORDER BY x.effective_from DESC
  LIMIT 1;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_bank_account_draft(
  p_worker_id uuid, p_account_number text, p_account_name text, p_bank_name text,
  p_bank_code text DEFAULT NULL, p_is_primary boolean DEFAULT true,
  p_effective_from date DEFAULT CURRENT_DATE, p_effective_to date DEFAULT NULL,
  p_source_reference text DEFAULT NULL, p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_row public.bank_accounts;
BEGIN
  IF NOT public.has_payroll_permission('payroll_bank_manage') THEN RAISE EXCEPTION 'Bạn không có quyền quản lý tài khoản nhận lương'; END IF;
  IF NULLIF(btrim(p_account_number), '') IS NULL OR NULLIF(btrim(p_account_name), '') IS NULL
     OR NULLIF(btrim(p_bank_name), '') IS NULL OR p_effective_from IS NULL
     OR NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Số tài khoản, tên, ngân hàng, ngày hiệu lực và lý do là bắt buộc';
  END IF;
  INSERT INTO public.bank_accounts (
    tenant_id, worker_id, account_number, account_name, bank_code, bank_name,
    is_primary, effective_from, effective_to, source_reference, reason, created_by
  ) VALUES (
    v_tenant, p_worker_id, btrim(p_account_number), btrim(p_account_name),
    NULLIF(upper(btrim(p_bank_code)), ''), btrim(p_bank_name), COALESCE(p_is_primary, true),
    p_effective_from, p_effective_to, NULLIF(btrim(p_source_reference), ''), btrim(p_reason), auth.uid()
  ) RETURNING * INTO v_row;
  RETURN (to_jsonb(v_row) - 'account_number')
    || jsonb_build_object('account_number_masked', public.mask_bank_account(v_row.account_number));
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Nhân sự đang có một tài khoản nhận lương chính nháp';
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_bank_account(
  p_bank_account_id uuid, p_reason text, p_supersede_previous boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant();
  v_row public.bank_accounts;
  v_previous public.bank_accounts;
  v_after public.bank_accounts;
  v_before_json jsonb;
  v_after_json jsonb;
  v_has_previous boolean := false;
BEGIN
  IF NOT public.has_payroll_permission('payroll_bank_manage') THEN RAISE EXCEPTION 'Bạn không có quyền xác minh tài khoản nhận lương'; END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Lý do xác minh là bắt buộc'; END IF;
  SELECT * INTO v_row FROM public.bank_accounts WHERE id = p_bank_account_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tài khoản nhận lương'; END IF;
  IF v_row.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ tài khoản nháp mới được xác minh'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('bank-account:' || v_tenant || ':' || v_row.worker_id::text, 0));
  IF v_row.is_primary AND EXISTS (
    SELECT 1 FROM public.bank_accounts x
    WHERE x.tenant_id = v_tenant AND x.worker_id = v_row.worker_id AND x.id <> v_row.id AND x.is_primary
      AND x.status IN ('VERIFIED','RETIRED') AND x.effective_from >= v_row.effective_from
      AND daterange(x.effective_from, COALESCE(x.effective_to, 'infinity'::date), '[]')
          && daterange(v_row.effective_from, COALESCE(v_row.effective_to, 'infinity'::date), '[]')
  ) THEN RAISE EXCEPTION 'Đã có tài khoản nhận lương cùng hoặc sau ngày hiệu lực này'; END IF;
  IF v_row.is_primary THEN
    SELECT * INTO v_previous FROM public.bank_accounts x
    WHERE x.tenant_id = v_tenant AND x.worker_id = v_row.worker_id AND x.id <> v_row.id AND x.is_primary
      AND x.status IN ('VERIFIED','RETIRED') AND x.effective_from < v_row.effective_from
      AND (x.effective_to IS NULL OR x.effective_to >= v_row.effective_from)
    ORDER BY x.effective_from DESC LIMIT 1 FOR UPDATE;
    v_has_previous := FOUND;
  END IF;
  IF v_has_previous THEN
    IF NOT p_supersede_previous THEN RAISE EXCEPTION 'Khoảng hiệu lực tài khoản nhận lương bị chồng lấn'; END IF;
    v_before_json := (to_jsonb(v_previous) - 'account_number')
      || jsonb_build_object('account_number_masked', public.mask_bank_account(v_previous.account_number));
    PERFORM set_config('app.payroll_master_transition', 'on', true);
    PERFORM set_config('app.cost_suppress_audit', 'on', true);
    UPDATE public.bank_accounts SET status = 'RETIRED', effective_to = v_row.effective_from - 1, updated_at = now()
    WHERE id = v_previous.id;
    PERFORM set_config('app.cost_suppress_audit', 'off', true);
    SELECT (to_jsonb(x) - 'account_number') || jsonb_build_object('account_number_masked', public.mask_bank_account(x.account_number))
      INTO v_after_json FROM public.bank_accounts x WHERE x.id = v_previous.id;
    INSERT INTO public.audit_events (tenant_id, entity_type, entity_id, action, before_data, after_data, actor_id, reason)
    VALUES (v_tenant, 'bank_accounts', v_previous.id, 'SUPERSEDE', v_before_json, v_after_json, auth.uid(), p_reason);
  END IF;
  v_before_json := (to_jsonb(v_row) - 'account_number')
    || jsonb_build_object('account_number_masked', public.mask_bank_account(v_row.account_number));
  PERFORM set_config('app.payroll_master_transition', 'on', true);
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  UPDATE public.bank_accounts SET status = 'VERIFIED', verified_by = auth.uid(), verified_at = now(), updated_at = now()
  WHERE id = v_row.id RETURNING * INTO v_after;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  v_after_json := (to_jsonb(v_after) - 'account_number')
    || jsonb_build_object('account_number_masked', public.mask_bank_account(v_after.account_number));
  INSERT INTO public.audit_events (tenant_id, entity_type, entity_id, action, before_data, after_data, actor_id, reason)
  VALUES (v_tenant, 'bank_accounts', v_after.id, 'APPROVE', v_before_json, v_after_json, auth.uid(), p_reason);
  PERFORM set_config('app.payroll_master_transition', 'off', true);
  RETURN v_after_json;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_worker_bank_accounts(p_worker_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid, worker_id uuid, account_number text, account_number_masked text,
  account_name text, bank_code text, bank_name text, is_primary boolean,
  effective_from date, effective_to date, status text, source_reference text,
  reason text, verified_at timestamptz, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_full boolean := public.has_payroll_permission('payroll_bank_manage');
BEGIN
  RETURN QUERY
  SELECT b.id, b.worker_id,
    CASE WHEN v_full THEN b.account_number ELSE NULL END,
    public.mask_bank_account(b.account_number), b.account_name, b.bank_code, b.bank_name,
    b.is_primary, b.effective_from, b.effective_to, b.status, b.source_reference,
    b.reason, b.verified_at, b.created_at
  FROM public.bank_accounts b
  JOIN public.production_workers w ON w.id = b.worker_id AND w.tenant_id = b.tenant_id
  WHERE b.tenant_id = v_tenant
    AND (p_worker_id IS NULL OR b.worker_id = p_worker_id)
    AND (v_full OR w.user_id = auth.uid())
  ORDER BY b.worker_id, b.effective_from DESC, b.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_primary_bank_account(p_worker_id uuid, p_effective_date date)
RETURNS public.bank_accounts
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_row public.bank_accounts; v_count integer;
BEGIN
  IF NOT public.has_payroll_permission('payroll_bank_manage') THEN RAISE EXCEPTION 'Bạn không có quyền xem tài khoản nhận lương đầy đủ'; END IF;
  IF p_effective_date IS NULL THEN RAISE EXCEPTION 'Ngày hiệu lực là bắt buộc'; END IF;
  SELECT count(*) INTO v_count FROM public.bank_accounts x
  WHERE x.tenant_id = v_tenant AND x.worker_id = p_worker_id AND x.is_primary
    AND x.status IN ('VERIFIED','RETIRED') AND x.effective_from <= p_effective_date
    AND (x.effective_to IS NULL OR x.effective_to >= p_effective_date);
  IF v_count = 0 THEN RAISE EXCEPTION 'Chưa có tài khoản nhận lương hiệu lực'; END IF;
  IF v_count > 1 THEN RAISE EXCEPTION 'Có nhiều tài khoản nhận lương cùng hiệu lực'; END IF;
  SELECT * INTO v_row
  FROM public.bank_accounts x
  WHERE x.tenant_id = v_tenant AND x.worker_id = p_worker_id AND x.is_primary
    AND x.status IN ('VERIFIED','RETIRED') AND x.effective_from <= p_effective_date
    AND (x.effective_to IS NULL OR x.effective_to >= p_effective_date)
  ORDER BY x.effective_from DESC
  LIMIT 1;
  RETURN v_row;
END;
$$;

ALTER TABLE public.payroll_policy_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_compensation_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_piece_rate_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_social_insurance_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY payroll_policy_groups_select ON public.payroll_policy_groups FOR SELECT TO authenticated
USING (tenant_id = 'default' AND (
  public.has_payroll_permission('payroll_view') OR public.has_payroll_permission('payroll_policy_manage')
  OR public.has_payroll_permission('payroll_rate_view')
));
CREATE POLICY worker_compensation_assignments_select ON public.worker_compensation_assignments FOR SELECT TO authenticated
USING (tenant_id = 'default' AND public.payroll_worker_in_scope(worker_id));
CREATE POLICY product_piece_rate_versions_select ON public.product_piece_rate_versions FOR SELECT TO authenticated
USING (tenant_id = 'default' AND (
  public.has_payroll_permission('payroll_rate_view') OR public.has_payroll_permission('payroll_rate_manage')
));
CREATE POLICY employee_social_insurance_versions_select ON public.employee_social_insurance_versions FOR SELECT TO authenticated
USING (tenant_id = 'default' AND (
  public.has_payroll_permission('payroll_insurance_manage') OR EXISTS (
    SELECT 1 FROM public.production_workers w WHERE w.id = worker_id AND w.user_id = auth.uid() AND w.tenant_id = tenant_id
  )
));
CREATE POLICY bank_accounts_select ON public.bank_accounts FOR SELECT TO authenticated
USING (tenant_id = 'default' AND (
  public.has_payroll_permission('payroll_bank_manage') OR EXISTS (
    SELECT 1 FROM public.production_workers w WHERE w.id = worker_id AND w.user_id = auth.uid() AND w.tenant_id = tenant_id
  )
));

REVOKE ALL ON public.payroll_policy_groups, public.worker_compensation_assignments,
  public.product_piece_rate_versions, public.employee_social_insurance_versions,
  public.bank_accounts FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.has_payroll_permission(text), public.payroll_worker_in_scope(uuid),
  public.payroll_worker_manageable(uuid), public.mask_bank_account(text),
  public.upsert_payroll_policy_group(text,text,text,boolean,text), public.list_payroll_policy_groups(),
  public.update_payroll_worker_master(uuid,text,text,text,date,date,text,text), public.list_payroll_workers(boolean),
  public.create_worker_compensation_assignment(uuid,text,uuid,date,date,text),
  public.approve_worker_compensation_assignment(uuid,text,boolean),
  public.list_worker_compensation_assignments(uuid), public.resolve_worker_compensation_assignment(uuid,date),
  public.list_payroll_products(text), public.create_product_piece_rate_draft(uuid,numeric,date,date,text,text,text),
  public.approve_product_piece_rate(uuid,text,boolean), public.list_product_piece_rates(uuid),
  public.resolve_product_piece_rate(uuid,date), public.create_social_insurance_draft(uuid,numeric,date,date,text,text),
  public.approve_social_insurance_version(uuid,text,boolean), public.list_social_insurance_versions(uuid),
  public.resolve_social_insurance_version(uuid,date),
  public.create_bank_account_draft(uuid,text,text,text,text,boolean,date,date,text,text),
  public.verify_bank_account(uuid,text,boolean), public.list_worker_bank_accounts(uuid),
  public.resolve_primary_bank_account(uuid,date)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_payroll_permission(text), public.payroll_worker_in_scope(uuid),
  public.payroll_worker_manageable(uuid), public.mask_bank_account(text),
  public.upsert_payroll_policy_group(text,text,text,boolean,text), public.list_payroll_policy_groups(),
  public.update_payroll_worker_master(uuid,text,text,text,date,date,text,text), public.list_payroll_workers(boolean),
  public.create_worker_compensation_assignment(uuid,text,uuid,date,date,text),
  public.approve_worker_compensation_assignment(uuid,text,boolean),
  public.list_worker_compensation_assignments(uuid), public.resolve_worker_compensation_assignment(uuid,date),
  public.list_payroll_products(text), public.create_product_piece_rate_draft(uuid,numeric,date,date,text,text,text),
  public.approve_product_piece_rate(uuid,text,boolean), public.list_product_piece_rates(uuid),
  public.resolve_product_piece_rate(uuid,date), public.create_social_insurance_draft(uuid,numeric,date,date,text,text),
  public.approve_social_insurance_version(uuid,text,boolean), public.list_social_insurance_versions(uuid),
  public.resolve_social_insurance_version(uuid,date),
  public.create_bank_account_draft(uuid,text,text,text,text,boolean,date,date,text,text),
  public.verify_bank_account(uuid,text,boolean), public.list_worker_bank_accounts(uuid)
TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_primary_bank_account(uuid,date) FROM authenticated;
REVOKE ALL ON FUNCTION public.validate_worker_compensation_assignment_scope(),
  public.validate_product_piece_rate_scope(), public.validate_payroll_worker_scope(),
  public.guard_payroll_version_mutation(), public.reject_worker_assignment_overlap(),
  public.reject_product_piece_rate_overlap(), public.reject_social_insurance_overlap(),
  public.reject_primary_bank_account_overlap(), public.audit_bank_account_change()
FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.product_piece_rate_versions IS
  'Canonical product-only piece-rate history. Worker-level worker_compensation_rates.piece_rate remains legacy labor-costing data.';
COMMENT ON TABLE public.bank_accounts IS
  'Payroll bank identifiers are text. Client access is RPC-only so full account numbers are restricted and audit data stays masked.';
COMMENT ON FUNCTION public.resolve_product_piece_rate(uuid,date) IS
  'Resolves exactly one approved historical product piece rate by work date; missing or overlap is a blocking error.';
