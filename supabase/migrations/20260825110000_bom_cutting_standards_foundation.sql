-- Sprint 3: versioned BOM, structured cutting standards and material requirement preview.
-- Additive development migration. It does not mutate legacy product, finance or inventory history.

ALTER TABLE public.audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_action_check
  CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'CONFIRM', 'VOID', 'APPROVE', 'SUPERSEDE'));

CREATE TABLE IF NOT EXISTS public.product_manufacturing_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  manufacturing_type text NOT NULL CHECK (manufacturing_type IN (
    'FITTED_SHEET', 'FLAT_SHEET', 'DUVET_COVER', 'PILLOW_CASE', 'PILLOW_INSERT',
    'DUVET_INSERT', 'MATTRESS', 'TOPPER', 'BED_RUNNER', 'TOWEL',
    'GENERIC_SEWN_PRODUCT', 'OTHER'
  )),
  finished_width numeric(18,4) CHECK (finished_width > 0),
  finished_length numeric(18,4) CHECK (finished_length > 0),
  finished_height numeric(18,4) CHECK (finished_height > 0),
  dimension_unit text NOT NULL DEFAULT 'CM' CHECK (dimension_unit IN ('MM', 'CM', 'METER')),
  extra_dimensions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extra_dimensions) = 'object'),
  default_bom_id uuid,
  default_cutting_profile_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.bom_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (btrim(code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE UNIQUE INDEX IF NOT EXISTS bom_headers_active_product_unique
  ON public.bom_headers (tenant_id, product_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.bom_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  bom_id uuid NOT NULL REFERENCES public.bom_headers(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'SUPERSEDED')),
  effective_from date,
  effective_to date,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approval_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  UNIQUE (bom_id, version_number),
  CHECK (effective_to IS NULL OR effective_from IS NOT NULL),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE IF NOT EXISTS public.cutting_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (btrim(code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  manufacturing_type text NOT NULL CHECK (manufacturing_type IN (
    'FITTED_SHEET', 'FLAT_SHEET', 'DUVET_COVER', 'PILLOW_CASE', 'PILLOW_INSERT',
    'DUVET_INSERT', 'MATTRESS', 'TOPPER', 'BED_RUNNER', 'TOWEL',
    'GENERIC_SEWN_PRODUCT', 'OTHER'
  )),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.cutting_profile_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  cutting_profile_id uuid NOT NULL REFERENCES public.cutting_profiles(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'SUPERSEDED')),
  effective_from date,
  effective_to date,
  piece_width_rule text NOT NULL DEFAULT 'FINISHED_WIDTH' CHECK (piece_width_rule IN (
    'FINISHED_WIDTH', 'FINISHED_LENGTH', 'FINISHED_WIDTH_PLUS_2_HEIGHT_TUCK',
    'FINISHED_LENGTH_PLUS_2_HEIGHT_TUCK', 'DOUBLE_FINISHED_LENGTH_PLUS_FLAP', 'PARAMETER'
  )),
  piece_length_rule text NOT NULL DEFAULT 'FINISHED_LENGTH' CHECK (piece_length_rule IN (
    'FINISHED_WIDTH', 'FINISHED_LENGTH', 'FINISHED_WIDTH_PLUS_2_HEIGHT_TUCK',
    'FINISHED_LENGTH_PLUS_2_HEIGHT_TUCK', 'DOUBLE_FINISHED_LENGTH_PLUS_FLAP', 'PARAMETER'
  )),
  piece_width_parameter_cm numeric(18,4) CHECK (piece_width_parameter_cm > 0),
  piece_length_parameter_cm numeric(18,4) CHECK (piece_length_parameter_cm > 0),
  pieces_per_product integer NOT NULL DEFAULT 1 CHECK (pieces_per_product > 0),
  default_fabric_width_cm numeric(18,4) CHECK (default_fabric_width_cm > 0),
  pattern_direction text NOT NULL DEFAULT 'NONE' CHECK (pattern_direction IN ('NONE', 'ONE_DIRECTION', 'BIDIRECTIONAL')),
  allow_rotation boolean NOT NULL DEFAULT false,
  requires_matching_pattern boolean NOT NULL DEFAULT false,
  pattern_repeat_cm numeric(18,4) CHECK (pattern_repeat_cm > 0),
  seam_allowance_cm numeric(18,4) NOT NULL DEFAULT 0 CHECK (seam_allowance_cm >= 0),
  hem_allowance_cm numeric(18,4) NOT NULL DEFAULT 0 CHECK (hem_allowance_cm >= 0),
  tuck_depth_cm numeric(18,4) NOT NULL DEFAULT 0 CHECK (tuck_depth_cm >= 0),
  flap_allowance_cm numeric(18,4) NOT NULL DEFAULT 0 CHECK (flap_allowance_cm >= 0),
  joining_allowed boolean NOT NULL DEFAULT false,
  joining_rule text NOT NULL DEFAULT 'NONE' CHECK (joining_rule IN ('NONE', 'MULTI_PANEL_LENGTHWISE')),
  joining_allowance_cm numeric(18,4) NOT NULL DEFAULT 0 CHECK (joining_allowance_cm >= 0),
  standard_waste_rate numeric(9,4) NOT NULL DEFAULT 0 CHECK (standard_waste_rate >= 0 AND standard_waste_rate <= 100),
  issue_rounding_increment numeric(18,4) NOT NULL DEFAULT 0.0001 CHECK (issue_rounding_increment > 0),
  calculation_strategy text NOT NULL DEFAULT 'GRID' CHECK (calculation_strategy IN ('GRID')),
  engine_version text NOT NULL DEFAULT '1.0' CHECK (btrim(engine_version) <> ''),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approval_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  UNIQUE (cutting_profile_id, version_number),
  CHECK (effective_to IS NULL OR effective_from IS NOT NULL),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK ((piece_width_rule = 'PARAMETER') = (piece_width_parameter_cm IS NOT NULL)),
  CHECK ((piece_length_rule = 'PARAMETER') = (piece_length_parameter_cm IS NOT NULL)),
  CHECK (NOT requires_matching_pattern OR pattern_repeat_cm IS NOT NULL),
  CHECK ((joining_allowed AND joining_rule <> 'NONE') OR (NOT joining_allowed AND joining_rule = 'NONE'))
);

CREATE TABLE IF NOT EXISTS public.bom_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  bom_version_id uuid NOT NULL REFERENCES public.bom_versions(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  line_type text NOT NULL DEFAULT 'MATERIAL' CHECK (line_type IN ('MATERIAL', 'PACKAGING', 'SUPPLY', 'OTHER')),
  quantity_method text NOT NULL CHECK (quantity_method IN ('FIXED', 'PER_UNIT', 'FORMULA', 'CUTTING_ENGINE')),
  standard_quantity numeric(18,4) CHECK (standard_quantity > 0),
  unit text NOT NULL CHECK (unit IN ('METER', 'KG', 'PIECE', 'ROLL', 'SET', 'BAG', 'BOX')),
  waste_rate numeric(9,4) NOT NULL DEFAULT 0 CHECK (waste_rate >= 0 AND waste_rate <= 100),
  scrap_rate numeric(9,4) NOT NULL DEFAULT 0 CHECK (scrap_rate >= 0 AND scrap_rate <= 100),
  formula_type text CHECK (formula_type IN ('PER_BATCH')),
  formula_parameters jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(formula_parameters) = 'object'),
  cutting_profile_id uuid REFERENCES public.cutting_profiles(id) ON DELETE RESTRICT,
  sequence integer NOT NULL CHECK (sequence > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bom_version_id, sequence),
  CHECK (
    (quantity_method IN ('FIXED', 'PER_UNIT') AND standard_quantity IS NOT NULL AND formula_type IS NULL AND cutting_profile_id IS NULL)
    OR (quantity_method = 'FORMULA' AND standard_quantity IS NOT NULL AND formula_type = 'PER_BATCH' AND cutting_profile_id IS NULL)
    OR (quantity_method = 'CUTTING_ENGINE' AND standard_quantity IS NULL AND formula_type IS NULL AND cutting_profile_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.material_requirement_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  bom_version_id uuid NOT NULL REFERENCES public.bom_versions(id) ON DELETE RESTRICT,
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  effective_date date NOT NULL,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  calculation_engine_version text NOT NULL,
  input_snapshot jsonb NOT NULL CHECK (jsonb_typeof(input_snapshot) = 'object'),
  output_snapshot jsonb NOT NULL CHECK (jsonb_typeof(output_snapshot) = 'object'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_manufacturing_profiles
  ADD CONSTRAINT product_manufacturing_profiles_default_bom_fkey
  FOREIGN KEY (default_bom_id) REFERENCES public.bom_headers(id) ON DELETE SET NULL;

ALTER TABLE public.product_manufacturing_profiles
  ADD CONSTRAINT product_manufacturing_profiles_default_cutting_profile_fkey
  FOREIGN KEY (default_cutting_profile_id) REFERENCES public.cutting_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS product_manufacturing_profiles_lookup_idx ON public.product_manufacturing_profiles (tenant_id, product_id, is_active);
CREATE INDEX IF NOT EXISTS bom_headers_product_idx ON public.bom_headers (tenant_id, product_id, is_active);
CREATE INDEX IF NOT EXISTS bom_versions_effective_idx ON public.bom_versions (tenant_id, bom_id, status, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS bom_lines_material_idx ON public.bom_lines (tenant_id, inventory_item_id, bom_version_id);
CREATE INDEX IF NOT EXISTS cutting_profiles_product_idx ON public.cutting_profiles (tenant_id, product_id, is_active);
CREATE INDEX IF NOT EXISTS cutting_profile_versions_effective_idx ON public.cutting_profile_versions (tenant_id, cutting_profile_id, status, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS material_requirement_calculations_lookup_idx ON public.material_requirement_calculations (tenant_id, product_id, effective_date DESC, created_at DESC);

CREATE OR REPLACE FUNCTION public.has_bom_permission(p_permission text DEFAULT 'bom_view')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_cost_permission(p_permission)
$$;

CREATE OR REPLACE FUNCTION public.require_default_tenant()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Bạn chưa đăng nhập';
  END IF;
  RETURN 'default';
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_manufacturing_profile_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.product_id AND p.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Sản phẩm không tồn tại hoặc không cùng phạm vi dữ liệu';
  END IF;
  IF NEW.default_bom_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.bom_headers b WHERE b.id = NEW.default_bom_id AND b.product_id = NEW.product_id AND b.tenant_id = NEW.tenant_id
  ) THEN RAISE EXCEPTION 'BOM mặc định không thuộc sản phẩm'; END IF;
  IF NEW.default_cutting_profile_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cutting_profiles c WHERE c.id = NEW.default_cutting_profile_id AND c.product_id = NEW.product_id AND c.tenant_id = NEW.tenant_id
  ) THEN RAISE EXCEPTION 'Cấu hình cắt mặc định không thuộc sản phẩm'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_bom_header_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.product_id AND p.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Sản phẩm BOM không tồn tại hoặc không cùng phạm vi dữ liệu';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_bom_version_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.bom_headers b WHERE b.id = NEW.bom_id AND b.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'BOM version không cùng phạm vi dữ liệu';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_bom_line_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_unit text; v_active boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.bom_versions v WHERE v.id = NEW.bom_version_id AND v.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'BOM line không cùng phạm vi dữ liệu';
  END IF;
  SELECT base_unit, is_active INTO v_unit, v_active
  FROM public.inventory_items WHERE id = NEW.inventory_item_id AND tenant_id = NEW.tenant_id;
  IF v_unit IS NULL THEN RAISE EXCEPTION 'Vật tư không tồn tại hoặc không cùng phạm vi dữ liệu'; END IF;
  IF NOT v_active THEN RAISE EXCEPTION 'Không thể đưa vật tư đã ngừng hoạt động vào phiên bản mới'; END IF;
  IF v_unit <> NEW.unit THEN RAISE EXCEPTION 'Đơn vị định mức không khớp đơn vị gốc của vật tư'; END IF;
  IF NEW.quantity_method = 'FORMULA' THEN
    IF NOT (NEW.formula_parameters ? 'batch_size')
       OR NEW.formula_parameters->'batch_size' = 'null'::jsonb
       OR (NEW.formula_parameters->>'batch_size') IS NULL
       OR (NEW.formula_parameters->>'batch_size')::numeric <= 0 THEN
      RAISE EXCEPTION 'Công thức PER_BATCH cần batch_size lớn hơn 0';
    END IF;
  END IF;
  IF NEW.cutting_profile_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cutting_profiles c
    JOIN public.bom_versions v ON v.id = NEW.bom_version_id
    JOIN public.bom_headers b ON b.id = v.bom_id
    WHERE c.id = NEW.cutting_profile_id AND c.tenant_id = NEW.tenant_id AND c.product_id = b.product_id AND c.is_active
  ) THEN RAISE EXCEPTION 'Cấu hình cắt không thuộc sản phẩm BOM hoặc đã ngừng hoạt động'; END IF;
  RETURN NEW;
EXCEPTION WHEN invalid_text_representation THEN
  RAISE EXCEPTION 'batch_size của công thức không hợp lệ';
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_cutting_profile_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.product_id AND p.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Sản phẩm cấu hình cắt không tồn tại hoặc không cùng phạm vi dữ liệu';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_cutting_version_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cutting_profiles c WHERE c.id = NEW.cutting_profile_id AND c.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Phiên bản cắt không cùng phạm vi dữ liệu';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_bom_version_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN RAISE EXCEPTION 'Không được xóa phiên bản BOM đã duyệt'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'DRAFT' AND current_setting('app.bom_transition', true) <> 'on' THEN
    RAISE EXCEPTION 'Không được chỉnh sửa phiên bản BOM đã duyệt';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND current_setting('app.bom_transition', true) <> 'on' THEN
    RAISE EXCEPTION 'Trạng thái BOM chỉ được thay đổi qua nghiệp vụ duyệt';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_bom_line_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_version_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.bom_version_id ELSE NEW.bom_version_id END; v_status text;
BEGIN
  SELECT status INTO v_status FROM public.bom_versions WHERE id = v_version_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Không tìm thấy phiên bản BOM'; END IF;
  IF v_status <> 'DRAFT' THEN RAISE EXCEPTION 'Không được chỉnh sửa dòng của phiên bản BOM đã duyệt'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_cutting_version_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN RAISE EXCEPTION 'Không được xóa phiên bản cấu hình cắt đã duyệt'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'DRAFT' AND current_setting('app.cutting_transition', true) <> 'on' THEN
    RAISE EXCEPTION 'Không được chỉnh sửa phiên bản cấu hình cắt đã duyệt';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND current_setting('app.cutting_transition', true) <> 'on' THEN
    RAISE EXCEPTION 'Trạng thái cấu hình cắt chỉ được thay đổi qua nghiệp vụ duyệt';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_dimension_cm(p_value numeric, p_unit text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_unit WHEN 'MM' THEN p_value / 10 WHEN 'CM' THEN p_value WHEN 'METER' THEN p_value * 100 ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.resolve_cutting_rule_dimension(
  p_rule text, p_width_cm numeric, p_length_cm numeric, p_height_cm numeric,
  p_tuck_cm numeric, p_flap_cm numeric, p_parameter_cm numeric
)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_rule
    WHEN 'FINISHED_WIDTH' THEN p_width_cm
    WHEN 'FINISHED_LENGTH' THEN p_length_cm
    WHEN 'FINISHED_WIDTH_PLUS_2_HEIGHT_TUCK' THEN p_width_cm + (2 * (COALESCE(p_height_cm, 0) + COALESCE(p_tuck_cm, 0)))
    WHEN 'FINISHED_LENGTH_PLUS_2_HEIGHT_TUCK' THEN p_length_cm + (2 * (COALESCE(p_height_cm, 0) + COALESCE(p_tuck_cm, 0)))
    WHEN 'DOUBLE_FINISHED_LENGTH_PLUS_FLAP' THEN (2 * p_length_cm) + COALESCE(p_flap_cm, 0)
    WHEN 'PARAMETER' THEN p_parameter_cm
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.save_product_manufacturing_profile(
  p_product_id uuid, p_manufacturing_type text, p_finished_width numeric,
  p_finished_length numeric, p_finished_height numeric DEFAULT NULL,
  p_dimension_unit text DEFAULT 'CM', p_extra_dimensions jsonb DEFAULT '{}'::jsonb,
  p_is_active boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_profile public.product_manufacturing_profiles;
BEGIN
  IF NOT public.has_bom_permission('bom_manage') THEN RAISE EXCEPTION 'Bạn không có quyền quản lý định mức sản xuất'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id AND tenant_id = v_tenant) THEN RAISE EXCEPTION 'Không tìm thấy sản phẩm'; END IF;
  INSERT INTO public.product_manufacturing_profiles (
    tenant_id, product_id, manufacturing_type, finished_width, finished_length, finished_height,
    dimension_unit, extra_dimensions, is_active, created_by, updated_by
  ) VALUES (
    v_tenant, p_product_id, p_manufacturing_type, p_finished_width, p_finished_length, p_finished_height,
    p_dimension_unit, COALESCE(p_extra_dimensions, '{}'::jsonb), COALESCE(p_is_active, true), auth.uid(), auth.uid()
  )
  ON CONFLICT (tenant_id, product_id) DO UPDATE SET
    manufacturing_type = EXCLUDED.manufacturing_type,
    finished_width = EXCLUDED.finished_width,
    finished_length = EXCLUDED.finished_length,
    finished_height = EXCLUDED.finished_height,
    dimension_unit = EXCLUDED.dimension_unit,
    extra_dimensions = EXCLUDED.extra_dimensions,
    is_active = EXCLUDED.is_active,
    updated_by = auth.uid(),
    updated_at = now()
  RETURNING * INTO v_profile;
  RETURN to_jsonb(v_profile);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_bom_draft(
  p_product_id uuid, p_code text, p_name text, p_clone_version_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant(); v_header public.bom_headers;
  v_source public.bom_versions; v_version public.bom_versions; v_next integer;
BEGIN
  IF NOT public.has_bom_permission('bom_manage') THEN RAISE EXCEPTION 'Bạn không có quyền tạo phiên bản BOM'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id AND tenant_id = v_tenant) THEN RAISE EXCEPTION 'Không tìm thấy sản phẩm'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('bom:' || v_tenant || ':' || p_product_id::text, 0));
  SELECT * INTO v_header FROM public.bom_headers WHERE tenant_id = v_tenant AND product_id = p_product_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.bom_headers (tenant_id, product_id, code, name, created_by)
    VALUES (v_tenant, p_product_id, btrim(p_code), btrim(p_name), auth.uid()) RETURNING * INTO v_header;
  END IF;
  IF EXISTS (SELECT 1 FROM public.bom_versions WHERE bom_id = v_header.id AND status = 'DRAFT') THEN
    RAISE EXCEPTION 'Sản phẩm đang có một phiên bản BOM nháp';
  END IF;
  IF p_clone_version_id IS NOT NULL THEN
    SELECT * INTO v_source FROM public.bom_versions WHERE id = p_clone_version_id AND bom_id = v_header.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Phiên bản BOM nguồn không thuộc sản phẩm'; END IF;
  END IF;
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next FROM public.bom_versions WHERE bom_id = v_header.id;
  INSERT INTO public.bom_versions (tenant_id, bom_id, version_number, status, notes, created_by)
  VALUES (v_tenant, v_header.id, v_next, 'DRAFT', CASE WHEN p_clone_version_id IS NULL THEN NULL ELSE 'Sao chép từ BOM V' || v_source.version_number END, auth.uid())
  RETURNING * INTO v_version;
  IF p_clone_version_id IS NOT NULL THEN
    INSERT INTO public.bom_lines (
      tenant_id, bom_version_id, inventory_item_id, line_type, quantity_method, standard_quantity,
      unit, waste_rate, scrap_rate, formula_type, formula_parameters, cutting_profile_id, sequence, notes
    )
    SELECT tenant_id, v_version.id, inventory_item_id, line_type, quantity_method, standard_quantity,
      unit, waste_rate, scrap_rate, formula_type, formula_parameters, cutting_profile_id, sequence, notes
    FROM public.bom_lines WHERE bom_version_id = p_clone_version_id ORDER BY sequence;
  END IF;
  UPDATE public.product_manufacturing_profiles SET default_bom_id = v_header.id, updated_by = auth.uid(), updated_at = now()
  WHERE tenant_id = v_tenant AND product_id = p_product_id AND default_bom_id IS NULL;
  RETURN jsonb_build_object('header', to_jsonb(v_header), 'version', to_jsonb(v_version));
END;
$$;

CREATE OR REPLACE FUNCTION public.save_bom_draft(
  p_version_id uuid, p_effective_from date, p_effective_to date,
  p_notes text, p_lines jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant(); v_version public.bom_versions; v_line jsonb;
  v_count integer := 0; v_sequence integer; v_method text; v_quantity numeric; v_formula text;
BEGIN
  IF NOT public.has_bom_permission('bom_manage') THEN RAISE EXCEPTION 'Bạn không có quyền chỉnh sửa BOM'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN RAISE EXCEPTION 'Danh sách vật tư BOM không hợp lệ'; END IF;
  SELECT * INTO v_version FROM public.bom_versions WHERE id = p_version_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên bản BOM'; END IF;
  IF v_version.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ được chỉnh sửa phiên bản BOM nháp'; END IF;
  IF p_effective_from IS NOT NULL AND p_effective_to IS NOT NULL AND p_effective_to < p_effective_from THEN RAISE EXCEPTION 'Khoảng hiệu lực BOM không hợp lệ'; END IF;
  UPDATE public.bom_versions SET effective_from = p_effective_from, effective_to = p_effective_to, notes = NULLIF(btrim(p_notes), ''), updated_at = now() WHERE id = p_version_id;
  DELETE FROM public.bom_lines WHERE bom_version_id = p_version_id;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_count := v_count + 1;
    v_sequence := COALESCE((v_line->>'sequence')::integer, v_count);
    v_method := v_line->>'quantity_method';
    v_quantity := NULLIF(v_line->>'standard_quantity', '')::numeric;
    v_formula := NULLIF(v_line->>'formula_type', '');
    INSERT INTO public.bom_lines (
      tenant_id, bom_version_id, inventory_item_id, line_type, quantity_method, standard_quantity,
      unit, waste_rate, scrap_rate, formula_type, formula_parameters, cutting_profile_id, sequence, notes
    ) VALUES (
      v_tenant, p_version_id, (v_line->>'inventory_item_id')::uuid, COALESCE(NULLIF(v_line->>'line_type',''), 'MATERIAL'),
      v_method, v_quantity, v_line->>'unit', COALESCE(NULLIF(v_line->>'waste_rate','')::numeric, 0),
      COALESCE(NULLIF(v_line->>'scrap_rate','')::numeric, 0), v_formula,
      COALESCE(v_line->'formula_parameters', '{}'::jsonb), NULLIF(v_line->>'cutting_profile_id','')::uuid,
      v_sequence, NULLIF(btrim(v_line->>'notes'), '')
    );
  END LOOP;
  RETURN jsonb_build_object('id', p_version_id, 'status', 'DRAFT', 'line_count', v_count);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Số thứ tự dòng BOM bị trùng';
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_bom_version(
  p_version_id uuid, p_reason text DEFAULT NULL, p_supersede_previous boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant(); v_version public.bom_versions; v_previous public.bom_versions; v_after public.bom_versions;
BEGIN
  IF NOT public.has_bom_permission('bom_approve') THEN RAISE EXCEPTION 'Bạn không có quyền duyệt BOM'; END IF;
  SELECT * INTO v_version FROM public.bom_versions WHERE id = p_version_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên bản BOM'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('bom-approve:' || v_version.bom_id::text, 0));
  IF v_version.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ phiên bản BOM nháp mới được duyệt'; END IF;
  IF v_version.effective_from IS NULL THEN RAISE EXCEPTION 'BOM chưa có ngày bắt đầu hiệu lực'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bom_lines WHERE bom_version_id = v_version.id) THEN RAISE EXCEPTION 'BOM chưa có vật tư'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.bom_lines l
    LEFT JOIN public.inventory_items i ON i.id = l.inventory_item_id AND i.tenant_id = l.tenant_id
    WHERE l.bom_version_id = v_version.id AND (i.id IS NULL OR NOT i.is_active OR i.base_unit <> l.unit)
  ) THEN RAISE EXCEPTION 'BOM có vật tư không hoạt động hoặc sai đơn vị'; END IF;
  SELECT * INTO v_previous FROM public.bom_versions
  WHERE bom_id = v_version.bom_id AND status = 'APPROVED'
    AND effective_from < v_version.effective_from
    AND (effective_to IS NULL OR effective_to >= v_version.effective_from)
  ORDER BY effective_from DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF NOT p_supersede_previous THEN RAISE EXCEPTION 'Khoảng hiệu lực BOM chồng lấn phiên bản hiện tại'; END IF;
    PERFORM set_config('app.bom_transition', 'on', true);
    PERFORM set_config('app.cost_suppress_audit', 'on', true);
    UPDATE public.bom_versions SET status = 'SUPERSEDED', effective_to = v_version.effective_from - 1, updated_at = now() WHERE id = v_previous.id;
    PERFORM set_config('app.cost_suppress_audit', 'off', true);
    PERFORM public.write_cost_audit('bom_versions', v_previous.id, 'SUPERSEDE', to_jsonb(v_previous), to_jsonb((SELECT x FROM public.bom_versions x WHERE x.id = v_previous.id)), p_reason);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bom_versions v WHERE v.bom_id = v_version.bom_id AND v.id <> v_version.id
      AND v.status IN ('APPROVED', 'SUPERSEDED')
      AND daterange(v.effective_from, COALESCE(v.effective_to, 'infinity'::date), '[]') && daterange(v_version.effective_from, COALESCE(v_version.effective_to, 'infinity'::date), '[]')
  ) THEN RAISE EXCEPTION 'Khoảng hiệu lực BOM chồng lấn phiên bản khác'; END IF;
  PERFORM set_config('app.bom_transition', 'on', true);
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  UPDATE public.bom_versions SET status = 'APPROVED', approved_by = auth.uid(), approved_at = now(), approval_reason = NULLIF(btrim(p_reason), ''), updated_at = now() WHERE id = v_version.id RETURNING * INTO v_after;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  PERFORM public.write_cost_audit('bom_versions', v_after.id, 'APPROVE', to_jsonb(v_version), to_jsonb(v_after), p_reason);
  PERFORM set_config('app.bom_transition', 'off', true);
  RETURN to_jsonb(v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_cutting_profile_draft(
  p_product_id uuid, p_code text, p_name text, p_manufacturing_type text,
  p_clone_version_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant(); v_profile public.cutting_profiles;
  v_source public.cutting_profile_versions; v_version public.cutting_profile_versions; v_next integer;
BEGIN
  IF NOT public.has_bom_permission('cutting_profiles') THEN RAISE EXCEPTION 'Bạn không có quyền quản lý cấu hình cắt'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id AND tenant_id = v_tenant) THEN RAISE EXCEPTION 'Không tìm thấy sản phẩm'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cutting:' || v_tenant || ':' || btrim(p_code), 0));
  SELECT * INTO v_profile FROM public.cutting_profiles WHERE tenant_id = v_tenant AND code = btrim(p_code) FOR UPDATE;
  IF FOUND AND v_profile.product_id <> p_product_id THEN RAISE EXCEPTION 'Mã cấu hình cắt đã thuộc sản phẩm khác'; END IF;
  IF NOT FOUND THEN
    INSERT INTO public.cutting_profiles (tenant_id, product_id, code, name, manufacturing_type, created_by)
    VALUES (v_tenant, p_product_id, btrim(p_code), btrim(p_name), p_manufacturing_type, auth.uid()) RETURNING * INTO v_profile;
  END IF;
  IF EXISTS (SELECT 1 FROM public.cutting_profile_versions WHERE cutting_profile_id = v_profile.id AND status = 'DRAFT') THEN
    RAISE EXCEPTION 'Cấu hình cắt đang có một phiên bản nháp';
  END IF;
  IF p_clone_version_id IS NOT NULL THEN
    SELECT * INTO v_source FROM public.cutting_profile_versions WHERE id = p_clone_version_id AND cutting_profile_id = v_profile.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Phiên bản cắt nguồn không thuộc cấu hình'; END IF;
  END IF;
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next FROM public.cutting_profile_versions WHERE cutting_profile_id = v_profile.id;
  IF p_clone_version_id IS NULL THEN
    INSERT INTO public.cutting_profile_versions (tenant_id, cutting_profile_id, version_number, created_by)
    VALUES (v_tenant, v_profile.id, v_next, auth.uid()) RETURNING * INTO v_version;
  ELSE
    INSERT INTO public.cutting_profile_versions (
      tenant_id, cutting_profile_id, version_number, piece_width_rule, piece_length_rule,
      piece_width_parameter_cm, piece_length_parameter_cm, pieces_per_product, default_fabric_width_cm,
      pattern_direction, allow_rotation, requires_matching_pattern, pattern_repeat_cm,
      seam_allowance_cm, hem_allowance_cm, tuck_depth_cm, flap_allowance_cm,
      joining_allowed, joining_rule, joining_allowance_cm, standard_waste_rate,
      issue_rounding_increment, calculation_strategy, engine_version, notes, created_by
    ) SELECT tenant_id, cutting_profile_id, v_next, piece_width_rule, piece_length_rule,
      piece_width_parameter_cm, piece_length_parameter_cm, pieces_per_product, default_fabric_width_cm,
      pattern_direction, allow_rotation, requires_matching_pattern, pattern_repeat_cm,
      seam_allowance_cm, hem_allowance_cm, tuck_depth_cm, flap_allowance_cm,
      joining_allowed, joining_rule, joining_allowance_cm, standard_waste_rate,
      issue_rounding_increment, calculation_strategy, engine_version, 'Sao chép từ cấu hình cắt V' || version_number, auth.uid()
    FROM public.cutting_profile_versions WHERE id = p_clone_version_id RETURNING * INTO v_version;
  END IF;
  UPDATE public.product_manufacturing_profiles SET default_cutting_profile_id = v_profile.id, updated_by = auth.uid(), updated_at = now()
  WHERE tenant_id = v_tenant AND product_id = p_product_id AND default_cutting_profile_id IS NULL;
  RETURN jsonb_build_object('profile', to_jsonb(v_profile), 'version', to_jsonb(v_version));
END;
$$;

CREATE OR REPLACE FUNCTION public.save_cutting_profile_draft(
  p_version_id uuid, p_effective_from date, p_effective_to date, p_configuration jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_version public.cutting_profile_versions; v_after public.cutting_profile_versions;
BEGIN
  IF NOT public.has_bom_permission('cutting_profiles') THEN RAISE EXCEPTION 'Bạn không có quyền chỉnh sửa cấu hình cắt'; END IF;
  IF p_configuration IS NULL OR jsonb_typeof(p_configuration) <> 'object' THEN RAISE EXCEPTION 'Cấu hình cắt không hợp lệ'; END IF;
  SELECT * INTO v_version FROM public.cutting_profile_versions WHERE id = p_version_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên bản cấu hình cắt'; END IF;
  IF v_version.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ được sửa phiên bản cấu hình cắt nháp'; END IF;
  UPDATE public.cutting_profile_versions SET
    effective_from = p_effective_from,
    effective_to = p_effective_to,
    piece_width_rule = COALESCE(NULLIF(p_configuration->>'piece_width_rule',''), piece_width_rule),
    piece_length_rule = COALESCE(NULLIF(p_configuration->>'piece_length_rule',''), piece_length_rule),
    piece_width_parameter_cm = NULLIF(p_configuration->>'piece_width_parameter_cm','')::numeric,
    piece_length_parameter_cm = NULLIF(p_configuration->>'piece_length_parameter_cm','')::numeric,
    pieces_per_product = COALESCE(NULLIF(p_configuration->>'pieces_per_product','')::integer, pieces_per_product),
    default_fabric_width_cm = NULLIF(p_configuration->>'default_fabric_width_cm','')::numeric,
    pattern_direction = COALESCE(NULLIF(p_configuration->>'pattern_direction',''), pattern_direction),
    allow_rotation = COALESCE((p_configuration->>'allow_rotation')::boolean, false),
    requires_matching_pattern = COALESCE((p_configuration->>'requires_matching_pattern')::boolean, false),
    pattern_repeat_cm = NULLIF(p_configuration->>'pattern_repeat_cm','')::numeric,
    seam_allowance_cm = COALESCE(NULLIF(p_configuration->>'seam_allowance_cm','')::numeric, 0),
    hem_allowance_cm = COALESCE(NULLIF(p_configuration->>'hem_allowance_cm','')::numeric, 0),
    tuck_depth_cm = COALESCE(NULLIF(p_configuration->>'tuck_depth_cm','')::numeric, 0),
    flap_allowance_cm = COALESCE(NULLIF(p_configuration->>'flap_allowance_cm','')::numeric, 0),
    joining_allowed = COALESCE((p_configuration->>'joining_allowed')::boolean, false),
    joining_rule = COALESCE(NULLIF(p_configuration->>'joining_rule',''), 'NONE'),
    joining_allowance_cm = COALESCE(NULLIF(p_configuration->>'joining_allowance_cm','')::numeric, 0),
    standard_waste_rate = COALESCE(NULLIF(p_configuration->>'standard_waste_rate','')::numeric, 0),
    issue_rounding_increment = COALESCE(NULLIF(p_configuration->>'issue_rounding_increment','')::numeric, 0.0001),
    calculation_strategy = COALESCE(NULLIF(p_configuration->>'calculation_strategy',''), 'GRID'),
    notes = NULLIF(btrim(p_configuration->>'notes'), ''),
    updated_at = now()
  WHERE id = p_version_id RETURNING * INTO v_after;
  RETURN to_jsonb(v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_cutting_profile_version(
  p_version_id uuid, p_reason text DEFAULT NULL, p_supersede_previous boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant(); v_version public.cutting_profile_versions;
  v_previous public.cutting_profile_versions; v_after public.cutting_profile_versions;
BEGIN
  IF NOT public.has_bom_permission('cutting_approve') THEN RAISE EXCEPTION 'Bạn không có quyền duyệt cấu hình cắt'; END IF;
  SELECT * INTO v_version FROM public.cutting_profile_versions WHERE id = p_version_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên bản cấu hình cắt'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cutting-approve:' || v_version.cutting_profile_id::text, 0));
  IF v_version.status <> 'DRAFT' THEN RAISE EXCEPTION 'Chỉ phiên bản cấu hình cắt nháp mới được duyệt'; END IF;
  IF v_version.effective_from IS NULL THEN RAISE EXCEPTION 'Cấu hình cắt chưa có ngày bắt đầu hiệu lực'; END IF;
  SELECT * INTO v_previous FROM public.cutting_profile_versions
  WHERE cutting_profile_id = v_version.cutting_profile_id AND status = 'APPROVED'
    AND effective_from < v_version.effective_from AND (effective_to IS NULL OR effective_to >= v_version.effective_from)
  ORDER BY effective_from DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF NOT p_supersede_previous THEN RAISE EXCEPTION 'Khoảng hiệu lực cấu hình cắt chồng lấn phiên bản hiện tại'; END IF;
    PERFORM set_config('app.cutting_transition', 'on', true);
    PERFORM set_config('app.cost_suppress_audit', 'on', true);
    UPDATE public.cutting_profile_versions SET status = 'SUPERSEDED', effective_to = v_version.effective_from - 1, updated_at = now() WHERE id = v_previous.id;
    PERFORM set_config('app.cost_suppress_audit', 'off', true);
    PERFORM public.write_cost_audit('cutting_profile_versions', v_previous.id, 'SUPERSEDE', to_jsonb(v_previous), to_jsonb((SELECT x FROM public.cutting_profile_versions x WHERE x.id = v_previous.id)), p_reason);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cutting_profile_versions v WHERE v.cutting_profile_id = v_version.cutting_profile_id AND v.id <> v_version.id
      AND v.status IN ('APPROVED', 'SUPERSEDED')
      AND daterange(v.effective_from, COALESCE(v.effective_to, 'infinity'::date), '[]') && daterange(v_version.effective_from, COALESCE(v_version.effective_to, 'infinity'::date), '[]')
  ) THEN RAISE EXCEPTION 'Khoảng hiệu lực cấu hình cắt chồng lấn phiên bản khác'; END IF;
  PERFORM set_config('app.cutting_transition', 'on', true);
  PERFORM set_config('app.cost_suppress_audit', 'on', true);
  UPDATE public.cutting_profile_versions SET status = 'APPROVED', approved_by = auth.uid(), approved_at = now(), approval_reason = NULLIF(btrim(p_reason), ''), updated_at = now() WHERE id = v_version.id RETURNING * INTO v_after;
  PERFORM set_config('app.cost_suppress_audit', 'off', true);
  PERFORM public.write_cost_audit('cutting_profile_versions', v_after.id, 'APPROVE', to_jsonb(v_version), to_jsonb(v_after), p_reason);
  PERFORM set_config('app.cutting_transition', 'off', true);
  RETURN to_jsonb(v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_effective_bom_version(p_product_id uuid, p_effective_date date DEFAULT CURRENT_DATE)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_id uuid;
BEGIN
  IF NOT public.has_bom_permission('bom_view') THEN RAISE EXCEPTION 'Bạn không có quyền xem BOM'; END IF;
  SELECT v.id INTO v_id FROM public.bom_headers b JOIN public.bom_versions v ON v.bom_id = b.id
  WHERE b.tenant_id = v_tenant AND b.product_id = p_product_id AND b.is_active
    AND v.status IN ('APPROVED', 'SUPERSEDED') AND v.effective_from <= COALESCE(p_effective_date, CURRENT_DATE)
    AND (v.effective_to IS NULL OR v.effective_to >= COALESCE(p_effective_date, CURRENT_DATE))
  ORDER BY v.effective_from DESC, v.version_number DESC LIMIT 1;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_effective_cutting_profile_version(p_cutting_profile_id uuid, p_effective_date date DEFAULT CURRENT_DATE)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant text := public.require_default_tenant(); v_id uuid;
BEGIN
  IF NOT public.has_bom_permission('bom_view') THEN RAISE EXCEPTION 'Bạn không có quyền xem cấu hình cắt'; END IF;
  SELECT v.id INTO v_id FROM public.cutting_profile_versions v
  WHERE v.tenant_id = v_tenant AND v.cutting_profile_id = p_cutting_profile_id
    AND v.status IN ('APPROVED', 'SUPERSEDED') AND v.effective_from <= COALESCE(p_effective_date, CURRENT_DATE)
    AND (v.effective_to IS NULL OR v.effective_to >= COALESCE(p_effective_date, CURRENT_DATE))
  ORDER BY v.effective_from DESC, v.version_number DESC LIMIT 1;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_cutting_consumption(
  p_cutting_profile_version_id uuid, p_quantity numeric, p_fabric_width_cm numeric DEFAULT NULL,
  p_allow_draft boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant(); v_version public.cutting_profile_versions; v_profile public.cutting_profiles;
  v_mfg public.product_manufacturing_profiles; v_width_cm numeric; v_length_cm numeric; v_height_cm numeric;
  v_base_width numeric; v_base_length numeric; v_fabric_width numeric; v_total_pieces integer;
  v_normal_across integer; v_normal_rows integer; v_normal_net numeric; v_normal_gross numeric; v_normal_final numeric;
  v_rot_across integer := 0; v_rot_rows integer := 0; v_rot_net numeric; v_rot_gross numeric; v_rot_final numeric;
  v_selected text := 'NORMAL'; v_across integer; v_rows integer; v_net numeric; v_gross numeric; v_final numeric;
  v_waste numeric; v_technical numeric; v_panels integer := 1; v_status text := 'FEASIBLE'; v_warning text;
  v_normal_row_length numeric; v_rot_row_length numeric;
BEGIN
  IF NOT public.has_bom_permission('bom_view') THEN RAISE EXCEPTION 'Bạn không có quyền tính định mức cắt'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR trunc(p_quantity) <> p_quantity THEN RAISE EXCEPTION 'Số lượng sản phẩm phải là số nguyên dương'; END IF;
  SELECT * INTO v_version FROM public.cutting_profile_versions WHERE id = p_cutting_profile_version_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên bản cấu hình cắt'; END IF;
  IF v_version.status = 'DRAFT' AND NOT (p_allow_draft AND public.has_bom_permission('cutting_profiles')) THEN RAISE EXCEPTION 'Không được dùng cấu hình cắt nháp trong ngữ cảnh này'; END IF;
  IF v_version.status NOT IN ('DRAFT', 'APPROVED', 'SUPERSEDED') THEN RAISE EXCEPTION 'Trạng thái cấu hình cắt không hợp lệ'; END IF;
  SELECT * INTO v_profile FROM public.cutting_profiles WHERE id = v_version.cutting_profile_id AND tenant_id = v_tenant AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cấu hình cắt đã ngừng hoạt động'; END IF;
  SELECT * INTO v_mfg FROM public.product_manufacturing_profiles WHERE tenant_id = v_tenant AND product_id = v_profile.product_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sản phẩm chưa có hồ sơ kích thước sản xuất'; END IF;
  v_width_cm := public.resolve_dimension_cm(v_mfg.finished_width, v_mfg.dimension_unit);
  v_length_cm := public.resolve_dimension_cm(v_mfg.finished_length, v_mfg.dimension_unit);
  v_height_cm := public.resolve_dimension_cm(v_mfg.finished_height, v_mfg.dimension_unit);
  IF v_width_cm IS NULL OR v_length_cm IS NULL THEN RAISE EXCEPTION 'Sản phẩm chưa có đủ chiều rộng và chiều dài'; END IF;
  v_base_width := public.resolve_cutting_rule_dimension(v_version.piece_width_rule, v_width_cm, v_length_cm, v_height_cm, v_version.tuck_depth_cm, v_version.flap_allowance_cm, v_version.piece_width_parameter_cm);
  v_base_length := public.resolve_cutting_rule_dimension(v_version.piece_length_rule, v_width_cm, v_length_cm, v_height_cm, v_version.tuck_depth_cm, v_version.flap_allowance_cm, v_version.piece_length_parameter_cm);
  IF v_base_width IS NULL OR v_base_length IS NULL OR v_base_width <= 0 OR v_base_length <= 0 THEN RAISE EXCEPTION 'Quy tắc kích thước cắt chưa đủ dữ liệu'; END IF;
  v_fabric_width := COALESCE(p_fabric_width_cm, v_version.default_fabric_width_cm);
  IF v_fabric_width IS NULL OR v_fabric_width <= 0 THEN RAISE EXCEPTION 'Chưa có khổ vải hợp lệ'; END IF;
  v_total_pieces := (p_quantity * v_version.pieces_per_product)::integer;

  v_normal_across := floor(v_fabric_width / (v_base_width + 2 * v_version.seam_allowance_cm));
  IF v_normal_across > 0 THEN
    v_normal_rows := ceil(v_total_pieces::numeric / v_normal_across)::integer;
    v_normal_row_length := v_base_length + 2 * v_version.hem_allowance_cm;
    IF v_version.requires_matching_pattern THEN v_normal_row_length := ceil(v_normal_row_length / v_version.pattern_repeat_cm) * v_version.pattern_repeat_cm; END IF;
    v_normal_net := round((v_normal_rows * v_base_length / 100)::numeric, 4);
    v_normal_gross := round((v_normal_rows * v_normal_row_length / 100)::numeric, 4);
    v_normal_final := v_normal_gross * (1 + v_version.standard_waste_rate / 100);
  END IF;

  IF v_version.allow_rotation AND v_version.pattern_direction <> 'ONE_DIRECTION' THEN
    v_rot_across := floor(v_fabric_width / (v_base_length + 2 * v_version.hem_allowance_cm));
    IF v_rot_across > 0 THEN
      v_rot_rows := ceil(v_total_pieces::numeric / v_rot_across)::integer;
      v_rot_row_length := v_base_width + 2 * v_version.seam_allowance_cm;
      IF v_version.requires_matching_pattern THEN v_rot_row_length := ceil(v_rot_row_length / v_version.pattern_repeat_cm) * v_version.pattern_repeat_cm; END IF;
      v_rot_net := round((v_rot_rows * v_base_width / 100)::numeric, 4);
      v_rot_gross := round((v_rot_rows * v_rot_row_length / 100)::numeric, 4);
      v_rot_final := v_rot_gross * (1 + v_version.standard_waste_rate / 100);
    END IF;
  END IF;

  IF v_normal_across <= 0 AND v_rot_across <= 0 THEN
    IF NOT v_version.joining_allowed OR v_version.joining_rule = 'NONE' THEN
      RETURN jsonb_build_object(
        'status','NOT_FEASIBLE','cutting_profile_version_id',v_version.id,'engine_version',v_version.engine_version,
        'fabric_width_cm',v_fabric_width,'warning','Khổ vải không đủ và chưa cấu hình ghép.',
        'calculation_steps',jsonb_build_array('Không có hướng đặt chi tiết nào vừa khổ vải.')
      );
    END IF;
    IF v_version.joining_rule = 'MULTI_PANEL_LENGTHWISE' THEN
      IF v_fabric_width <= v_version.joining_allowance_cm THEN RAISE EXCEPTION 'Phụ cấp ghép phải nhỏ hơn khổ vải'; END IF;
      v_panels := ceil((v_base_width + 2 * v_version.seam_allowance_cm - v_version.joining_allowance_cm) / (v_fabric_width - v_version.joining_allowance_cm))::integer;
      v_selected := 'JOINED_LENGTHWISE'; v_across := 1; v_rows := v_total_pieces;
      v_net := round((v_rows * v_base_length * v_panels / 100)::numeric, 4);
      v_normal_row_length := v_base_length + 2 * v_version.hem_allowance_cm;
      IF v_version.requires_matching_pattern THEN v_normal_row_length := ceil(v_normal_row_length / v_version.pattern_repeat_cm) * v_version.pattern_repeat_cm; END IF;
      v_gross := round((v_rows * v_normal_row_length * v_panels / 100)::numeric, 4);
      v_warning := 'Kết quả dùng quy tắc ghép nhiều tấm dọc; cần xác nhận quy tắc nghiệp vụ trước khi áp dụng sản xuất.';
    END IF;
  ELSE
    IF v_rot_across > 0 AND (v_normal_across <= 0 OR v_rot_final < v_normal_final) THEN
      v_selected := 'ROTATED'; v_across := v_rot_across; v_rows := v_rot_rows; v_net := v_rot_net; v_gross := v_rot_gross;
    ELSE
      v_selected := 'NORMAL'; v_across := v_normal_across; v_rows := v_normal_rows; v_net := v_normal_net; v_gross := v_normal_gross;
    END IF;
  END IF;
  v_technical := round(v_gross - v_net, 4);
  v_waste := round(v_gross * v_version.standard_waste_rate / 100, 4);
  v_final := ceil((v_gross + v_waste) / v_version.issue_rounding_increment) * v_version.issue_rounding_increment;
  RETURN jsonb_build_object(
    'status',v_status,'cutting_profile_id',v_profile.id,'cutting_profile_version_id',v_version.id,
    'engine_version',v_version.engine_version,'strategy',v_version.calculation_strategy,'selected_orientation',v_selected,
    'quantity',p_quantity,'pieces_per_product',v_version.pieces_per_product,'total_pieces',v_total_pieces,
    'fabric_width_cm',v_fabric_width,'base_piece_width_cm',v_base_width,'base_piece_length_cm',v_base_length,
    'pieces_across',v_across,'rows',v_rows,'joining_panels',v_panels,
    'net_theoretical_length_m',round(v_net,4),'technical_allowance_m',round(v_technical,4),
    'gross_technical_length_m',round(v_gross,4),'standard_waste_rate',v_version.standard_waste_rate,
    'standard_waste_m',round(v_waste,4),'issue_rounding_increment_m',v_version.issue_rounding_increment,
    'final_issue_recommendation_m',round(v_final,4),'per_product_m',round(v_final/p_quantity,4),
    'warning',v_warning,
    'calculation_steps',jsonb_build_array(
      format('Tổng chi tiết: %s x %s = %s', p_quantity, v_version.pieces_per_product, v_total_pieces),
      format('Phương án: %s; %s chi tiết ngang; %s hàng', v_selected, v_across, v_rows),
      format('Mét lý thuyết: %s; phụ cấp kỹ thuật: %s', round(v_net,4), round(v_technical,4)),
      format('Hao hụt chuẩn: %s%% = %s m', v_version.standard_waste_rate, round(v_waste,4)),
      format('Khuyến nghị cấp phát sau làm tròn: %s m', round(v_final,4))
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_standard_material_requirements(
  p_product_id uuid, p_quantity numeric, p_effective_date date DEFAULT CURRENT_DATE,
  p_bom_version_id uuid DEFAULT NULL, p_allow_draft boolean DEFAULT false,
  p_warehouse_id uuid DEFAULT NULL, p_save_snapshot boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant text := public.require_default_tenant(); v_version public.bom_versions; v_header public.bom_headers;
  v_line record; v_cutting_version_id uuid; v_cutting jsonb; v_net numeric; v_standard numeric; v_increment numeric;
  v_requirements jsonb := '[]'::jsonb; v_costed jsonb; v_cost_visible boolean := public.has_cost_permission('inventory_cost_view');
  v_result jsonb; v_snapshot_id uuid;
BEGIN
  IF NOT public.has_bom_permission('bom_view') THEN RAISE EXCEPTION 'Bạn không có quyền tính nhu cầu vật tư'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Số lượng sản phẩm phải lớn hơn 0'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id AND tenant_id = v_tenant) THEN RAISE EXCEPTION 'Không tìm thấy sản phẩm'; END IF;
  IF p_warehouse_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = p_warehouse_id AND tenant_id = v_tenant AND is_active) THEN RAISE EXCEPTION 'Kho không tồn tại hoặc không hoạt động'; END IF;
  IF p_bom_version_id IS NULL THEN
    p_bom_version_id := public.resolve_effective_bom_version(p_product_id, COALESCE(p_effective_date, CURRENT_DATE));
    IF p_bom_version_id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy phiên bản BOM hiệu lực vào ngày yêu cầu'; END IF;
  ELSE
    -- Explicit BOM version: validate it exists, belongs to this product, and is effective on the requested date
    SELECT v.* INTO v_version FROM public.bom_versions v JOIN public.bom_headers b ON b.id = v.bom_id
    WHERE v.id = p_bom_version_id AND v.tenant_id = v_tenant AND b.product_id = p_product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên bản BOM phù hợp'; END IF;
    IF v_version.status = 'DRAFT' AND NOT (p_allow_draft AND public.has_bom_permission('bom_manage')) THEN
      RAISE EXCEPTION 'Luồng tính chính thức không sử dụng BOM nháp';
    END IF;
    IF v_version.status IN ('APPROVED','SUPERSEDED') THEN
      IF v_version.effective_from IS NULL OR v_version.effective_from > COALESCE(p_effective_date, CURRENT_DATE) OR
         (v_version.effective_to IS NOT NULL AND v_version.effective_to < COALESCE(p_effective_date, CURRENT_DATE)) THEN
        RAISE EXCEPTION 'Phiên bản BOM chỉ định không hiệu lực vào ngày yêu cầu';
      END IF;
    END IF;
    SELECT * INTO v_header FROM public.bom_headers WHERE id = v_version.bom_id;
  END IF;
  SELECT v.* INTO v_version FROM public.bom_versions v JOIN public.bom_headers b ON b.id = v.bom_id
  WHERE v.id = p_bom_version_id AND v.tenant_id = v_tenant AND b.product_id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên bản BOM phù hợp'; END IF;
  SELECT * INTO v_header FROM public.bom_headers WHERE id = v_version.bom_id;
  IF v_version.status = 'DRAFT' AND NOT (p_allow_draft AND public.has_bom_permission('bom_manage')) THEN RAISE EXCEPTION 'Luồng tính chính thức không sử dụng BOM nháp'; END IF;
  IF v_version.status NOT IN ('DRAFT','APPROVED','SUPERSEDED') THEN RAISE EXCEPTION 'Trạng thái BOM không hợp lệ'; END IF;
  FOR v_line IN
    SELECT l.*, i.code AS item_code, i.name AS item_name, i.base_unit, i.is_active
    FROM public.bom_lines l JOIN public.inventory_items i ON i.id = l.inventory_item_id AND i.tenant_id = l.tenant_id
    WHERE l.bom_version_id = v_version.id ORDER BY l.sequence
  LOOP
    IF v_line.unit <> v_line.base_unit THEN RAISE EXCEPTION 'Vật tư % có đơn vị không tương thích', v_line.item_code; END IF;
    IF v_version.status = 'DRAFT' AND NOT v_line.is_active THEN RAISE EXCEPTION 'Vật tư % đã ngừng hoạt động', v_line.item_code; END IF;
    v_cutting := NULL; v_cutting_version_id := NULL;
    IF v_line.quantity_method = 'FIXED' THEN
      v_net := v_line.standard_quantity;
    ELSIF v_line.quantity_method = 'PER_UNIT' THEN
      v_net := v_line.standard_quantity * p_quantity;
    ELSIF v_line.quantity_method = 'FORMULA' AND v_line.formula_type = 'PER_BATCH' THEN
      v_net := v_line.standard_quantity * ceil(p_quantity / (v_line.formula_parameters->>'batch_size')::numeric);
    ELSIF v_line.quantity_method = 'CUTTING_ENGINE' THEN
      v_cutting_version_id := public.resolve_effective_cutting_profile_version(v_line.cutting_profile_id, COALESCE(p_effective_date, CURRENT_DATE));
      IF v_cutting_version_id IS NULL AND p_allow_draft AND public.has_bom_permission('cutting_profiles') THEN
        SELECT id INTO v_cutting_version_id FROM public.cutting_profile_versions
        WHERE cutting_profile_id = v_line.cutting_profile_id AND tenant_id = v_tenant AND status = 'DRAFT'
        ORDER BY version_number DESC LIMIT 1;
      END IF;
      IF v_cutting_version_id IS NULL THEN RAISE EXCEPTION 'Chưa có phiên bản cấu hình cắt phù hợp ngày hiệu lực'; END IF;
      v_cutting := public.calculate_cutting_consumption(v_cutting_version_id, p_quantity, NULL, p_allow_draft);
      IF v_cutting->>'status' <> 'FEASIBLE' THEN
        RAISE EXCEPTION '%', COALESCE(v_cutting->>'warning', 'Cấu hình cắt không khả thi');
      END IF;
      IF v_line.unit <> 'METER' THEN RAISE EXCEPTION 'Kết quả cutting engine chỉ tương thích vật tư đơn vị METER'; END IF;
      v_net := (v_cutting->>'final_issue_recommendation_m')::numeric;
    ELSE
      RAISE EXCEPTION 'Phương pháp định mức không được hỗ trợ';
    END IF;
    v_increment := COALESCE(NULLIF(v_line.formula_parameters->>'issue_rounding_increment','')::numeric,
      CASE WHEN v_line.unit IN ('PIECE','ROLL','SET','BAG','BOX') THEN 1 ELSE 0.0001 END);
    IF v_increment <= 0 THEN RAISE EXCEPTION 'Bước làm tròn cấp phát phải lớn hơn 0'; END IF;
    v_standard := ceil((v_net * (1 + (v_line.waste_rate + v_line.scrap_rate) / 100)) / v_increment) * v_increment;
    v_requirements := v_requirements || jsonb_build_array(jsonb_build_object(
      'bom_line_id',v_line.id,'sequence',v_line.sequence,'inventory_item_id',v_line.inventory_item_id,
      'item_code',v_line.item_code,'item_name',v_line.item_name,'line_type',v_line.line_type,
      'method',v_line.quantity_method,'net_quantity',round(v_net,4),'waste_rate',v_line.waste_rate,
      'scrap_rate',v_line.scrap_rate,'standard_quantity',round(v_standard,4),'unit',v_line.unit,
      'cutting_profile_version_id',v_cutting_version_id,'calculation_details',COALESCE(v_cutting, jsonb_build_object(
        'method',v_line.quantity_method,'formula_type',v_line.formula_type,'formula_parameters',v_line.formula_parameters
      ))
    ));
  END LOOP;
  IF jsonb_array_length(v_requirements) = 0 THEN RAISE EXCEPTION 'BOM chưa có vật tư'; END IF;

  WITH raw AS (
    SELECT value AS item FROM jsonb_array_elements(v_requirements)
  ), grouped AS (
    SELECT
      (item->>'inventory_item_id')::uuid AS inventory_item_id,
      item->>'unit' AS unit,
      min((item->>'sequence')::integer) AS sequence,
      max(item->>'item_code') AS item_code,
      max(item->>'item_name') AS item_name,
      CASE WHEN count(DISTINCT item->>'line_type') = 1 THEN min(item->>'line_type') ELSE 'MATERIAL' END AS line_type,
      CASE WHEN count(DISTINCT item->>'method') = 1 THEN min(item->>'method') ELSE 'MULTIPLE' END AS method,
      round(sum((item->>'net_quantity')::numeric),4) AS net_quantity,
      round(sum((item->>'standard_quantity')::numeric),4) AS standard_quantity,
      CASE WHEN count(DISTINCT item->>'waste_rate') = 1 THEN min((item->>'waste_rate')::numeric) END AS waste_rate,
      CASE WHEN count(DISTINCT item->>'scrap_rate') = 1 THEN min((item->>'scrap_rate')::numeric) END AS scrap_rate,
      CASE WHEN count(DISTINCT NULLIF(item->>'cutting_profile_version_id','')) = 1 THEN max(NULLIF(item->>'cutting_profile_version_id','')) END AS cutting_profile_version_id,
      jsonb_agg(item ORDER BY (item->>'sequence')::integer) AS components
    FROM raw
    GROUP BY (item->>'inventory_item_id')::uuid, item->>'unit'
  )
  SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'inventory_item_id',inventory_item_id,'sequence',sequence,'item_code',item_code,'item_name',item_name,
    'line_type',line_type,'method',method,'net_quantity',net_quantity,'standard_quantity',standard_quantity,
    'unit',unit,'waste_rate',waste_rate,'scrap_rate',scrap_rate,
    'cutting_profile_version_id',cutting_profile_version_id,
    'calculation_details',jsonb_build_object('components',components)
  )) ORDER BY sequence) INTO v_requirements
  FROM grouped;

  WITH req AS (
    SELECT value AS item FROM jsonb_array_elements(v_requirements)
  ), balances AS (
    SELECT b.inventory_item_id, COALESCE(SUM(b.quantity_on_hand),0) quantity_on_hand,
      CASE WHEN SUM(b.quantity_on_hand) > 0 THEN SUM(b.inventory_value) / SUM(b.quantity_on_hand) ELSE NULL END average_unit_cost
    FROM public.inventory_balances b
    WHERE b.tenant_id = v_tenant AND (p_warehouse_id IS NULL OR b.warehouse_id = p_warehouse_id)
    GROUP BY b.inventory_item_id
  )
  SELECT jsonb_agg(item || jsonb_build_object(
    'current_stock',COALESCE(b.quantity_on_hand,0),
    'average_unit_cost',CASE WHEN v_cost_visible THEN b.average_unit_cost ELSE NULL END,
    'estimated_material_cost',CASE WHEN v_cost_visible AND b.average_unit_cost IS NOT NULL THEN round((item->>'standard_quantity')::numeric * b.average_unit_cost,2) ELSE NULL END,
    'cost_visible',v_cost_visible,
    'warnings',jsonb_strip_nulls(jsonb_build_object(
      'missing_cost',CASE WHEN b.average_unit_cost IS NULL THEN 'Chưa có giá bình quân tồn kho' END,
      'insufficient_stock',CASE WHEN COALESCE(b.quantity_on_hand,0) < (item->>'standard_quantity')::numeric THEN 'Tồn kho hiện tại thấp hơn nhu cầu chuẩn' END
    ))
  ) ORDER BY (item->>'sequence')::integer) INTO v_costed
  FROM req LEFT JOIN balances b ON b.inventory_item_id = (item->>'inventory_item_id')::uuid;

  v_result := jsonb_build_object(
    'product_id',p_product_id,'bom_id',v_header.id,'bom_version_id',v_version.id,'bom_version_number',v_version.version_number,
    'bom_status',v_version.status,'quantity',p_quantity,'effective_date',COALESCE(p_effective_date,CURRENT_DATE),
    'warehouse_id',p_warehouse_id,'calculation_engine_version','1.0','materials',v_costed,
    'cost_visible',v_cost_visible,'cost_as_of',now(),
    'estimated_material_cost_total',CASE WHEN v_cost_visible THEN (
      SELECT round(COALESCE(SUM((x->>'estimated_material_cost')::numeric),0),2) FROM jsonb_array_elements(v_costed) x
    ) ELSE NULL END,
    'cost_label','Chi phí nguyên vật liệu chuẩn dự kiến',
    'inventory_side_effect',false
  );
  IF p_save_snapshot THEN
    IF NOT public.has_bom_permission('bom_manage') THEN RAISE EXCEPTION 'Bạn không có quyền lưu snapshot định mức'; END IF;
    INSERT INTO public.material_requirement_calculations (
      tenant_id, product_id, bom_version_id, quantity, effective_date, warehouse_id,
      calculation_engine_version, input_snapshot, output_snapshot, created_by
    ) VALUES (
      v_tenant,p_product_id,v_version.id,p_quantity,COALESCE(p_effective_date,CURRENT_DATE),p_warehouse_id,'1.0',
      jsonb_build_object('product_id',p_product_id,'quantity',p_quantity,'effective_date',COALESCE(p_effective_date,CURRENT_DATE),'warehouse_id',p_warehouse_id),
      v_result,auth.uid()
    ) RETURNING id INTO v_snapshot_id;
    v_result := v_result || jsonb_build_object('snapshot_id',v_snapshot_id);
  END IF;
  RETURN v_result;
END;
$$;

DROP TRIGGER IF EXISTS product_manufacturing_profiles_updated_at ON public.product_manufacturing_profiles;
CREATE TRIGGER product_manufacturing_profiles_updated_at BEFORE UPDATE ON public.product_manufacturing_profiles FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS product_manufacturing_profiles_scope ON public.product_manufacturing_profiles;
CREATE TRIGGER product_manufacturing_profiles_scope BEFORE INSERT OR UPDATE ON public.product_manufacturing_profiles FOR EACH ROW EXECUTE FUNCTION public.validate_manufacturing_profile_scope();
DROP TRIGGER IF EXISTS bom_headers_updated_at ON public.bom_headers;
CREATE TRIGGER bom_headers_updated_at BEFORE UPDATE ON public.bom_headers FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS bom_headers_scope ON public.bom_headers;
CREATE TRIGGER bom_headers_scope BEFORE INSERT OR UPDATE ON public.bom_headers FOR EACH ROW EXECUTE FUNCTION public.validate_bom_header_scope();
DROP TRIGGER IF EXISTS bom_versions_updated_at ON public.bom_versions;
CREATE TRIGGER bom_versions_updated_at BEFORE UPDATE ON public.bom_versions FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS bom_versions_scope ON public.bom_versions;
CREATE TRIGGER bom_versions_scope BEFORE INSERT OR UPDATE ON public.bom_versions FOR EACH ROW EXECUTE FUNCTION public.validate_bom_version_scope();
DROP TRIGGER IF EXISTS bom_versions_guard ON public.bom_versions;
CREATE TRIGGER bom_versions_guard BEFORE UPDATE OR DELETE ON public.bom_versions FOR EACH ROW EXECUTE FUNCTION public.guard_bom_version_mutation();
DROP TRIGGER IF EXISTS bom_lines_updated_at ON public.bom_lines;
CREATE TRIGGER bom_lines_updated_at BEFORE UPDATE ON public.bom_lines FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS bom_lines_guard ON public.bom_lines;
CREATE TRIGGER bom_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON public.bom_lines FOR EACH ROW EXECUTE FUNCTION public.guard_bom_line_mutation();
DROP TRIGGER IF EXISTS bom_lines_scope ON public.bom_lines;
CREATE TRIGGER bom_lines_scope BEFORE INSERT OR UPDATE ON public.bom_lines FOR EACH ROW EXECUTE FUNCTION public.validate_bom_line_scope();
DROP TRIGGER IF EXISTS cutting_profiles_updated_at ON public.cutting_profiles;
CREATE TRIGGER cutting_profiles_updated_at BEFORE UPDATE ON public.cutting_profiles FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS cutting_profiles_scope ON public.cutting_profiles;
CREATE TRIGGER cutting_profiles_scope BEFORE INSERT OR UPDATE ON public.cutting_profiles FOR EACH ROW EXECUTE FUNCTION public.validate_cutting_profile_scope();
DROP TRIGGER IF EXISTS cutting_profile_versions_updated_at ON public.cutting_profile_versions;
CREATE TRIGGER cutting_profile_versions_updated_at BEFORE UPDATE ON public.cutting_profile_versions FOR EACH ROW EXECUTE FUNCTION public.set_cost_updated_at();
DROP TRIGGER IF EXISTS cutting_profile_versions_scope ON public.cutting_profile_versions;
CREATE TRIGGER cutting_profile_versions_scope BEFORE INSERT OR UPDATE ON public.cutting_profile_versions FOR EACH ROW EXECUTE FUNCTION public.validate_cutting_version_scope();
DROP TRIGGER IF EXISTS cutting_profile_versions_guard ON public.cutting_profile_versions;
CREATE TRIGGER cutting_profile_versions_guard BEFORE UPDATE OR DELETE ON public.cutting_profile_versions FOR EACH ROW EXECUTE FUNCTION public.guard_cutting_version_mutation();

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['product_manufacturing_profiles','bom_headers','bom_versions','bom_lines','cutting_profiles','cutting_profile_versions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%s ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER audit_%s AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_cost_change()', t, t);
  END LOOP;
END $$;

ALTER TABLE public.product_manufacturing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cutting_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cutting_profile_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_requirement_calculations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_items_select ON public.inventory_items;
CREATE POLICY inventory_items_select ON public.inventory_items FOR SELECT TO authenticated
USING (
  tenant_id = 'default'
  AND (public.has_cost_permission('inventory_view') OR public.has_cost_permission('inventory_items') OR public.has_bom_permission('bom_view'))
  AND (public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'accountant'::public.app_role)
    OR manager_id = public.current_cost_manager_id()
    OR manager_id IS NULL)
);

CREATE POLICY product_manufacturing_profiles_select ON public.product_manufacturing_profiles FOR SELECT TO authenticated
USING (tenant_id = 'default' AND public.has_bom_permission('bom_view'));
CREATE POLICY bom_headers_select ON public.bom_headers FOR SELECT TO authenticated
USING (tenant_id = 'default' AND public.has_bom_permission('bom_view'));
CREATE POLICY bom_versions_select ON public.bom_versions FOR SELECT TO authenticated
USING (tenant_id = 'default' AND (status IN ('APPROVED','SUPERSEDED') AND public.has_bom_permission('bom_view') OR public.has_bom_permission('bom_manage') OR public.has_bom_permission('bom_approve')));
CREATE POLICY bom_lines_select ON public.bom_lines FOR SELECT TO authenticated
USING (tenant_id = 'default' AND EXISTS (
  SELECT 1 FROM public.bom_versions v WHERE v.id = bom_version_id AND v.tenant_id = tenant_id
    AND (v.status IN ('APPROVED','SUPERSEDED') AND public.has_bom_permission('bom_view') OR public.has_bom_permission('bom_manage') OR public.has_bom_permission('bom_approve'))
));
CREATE POLICY cutting_profiles_select ON public.cutting_profiles FOR SELECT TO authenticated
USING (tenant_id = 'default' AND public.has_bom_permission('bom_view'));
CREATE POLICY cutting_profile_versions_select ON public.cutting_profile_versions FOR SELECT TO authenticated
USING (tenant_id = 'default' AND (status IN ('APPROVED','SUPERSEDED') AND public.has_bom_permission('bom_view') OR public.has_bom_permission('cutting_profiles') OR public.has_bom_permission('cutting_approve')));
CREATE POLICY material_requirement_calculations_select ON public.material_requirement_calculations FOR SELECT TO authenticated
USING (
  tenant_id = 'default'
  AND public.has_bom_permission('bom_view')
  AND (
    -- Snapshot without cost data: owner or bom_manage can read
    (
      COALESCE((output_snapshot->>'cost_visible')::boolean, false) = false
      AND (created_by = auth.uid() OR public.has_bom_permission('bom_manage'))
    )
    -- Snapshot with cost data: additionally require inventory_cost_view
    OR (
      COALESCE((output_snapshot->>'cost_visible')::boolean, false) = true
      AND public.has_cost_permission('inventory_cost_view')
      AND (created_by = auth.uid() OR public.has_bom_permission('bom_manage'))
    )
  )
);

GRANT SELECT ON public.product_manufacturing_profiles, public.bom_headers, public.bom_versions, public.bom_lines,
  public.cutting_profiles, public.cutting_profile_versions, public.material_requirement_calculations TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.product_manufacturing_profiles, public.bom_headers, public.bom_versions, public.bom_lines,
  public.cutting_profiles, public.cutting_profile_versions, public.material_requirement_calculations FROM authenticated;

REVOKE ALL ON FUNCTION public.has_bom_permission(text), public.require_default_tenant(),
  public.save_product_manufacturing_profile(uuid,text,numeric,numeric,numeric,text,jsonb,boolean),
  public.create_bom_draft(uuid,text,text,uuid), public.save_bom_draft(uuid,date,date,text,jsonb),
  public.approve_bom_version(uuid,text,boolean), public.create_cutting_profile_draft(uuid,text,text,text,uuid),
  public.save_cutting_profile_draft(uuid,date,date,jsonb), public.approve_cutting_profile_version(uuid,text,boolean),
  public.resolve_effective_bom_version(uuid,date), public.resolve_effective_cutting_profile_version(uuid,date),
  public.calculate_cutting_consumption(uuid,numeric,numeric,boolean),
  public.calculate_standard_material_requirements(uuid,numeric,date,uuid,boolean,uuid,boolean)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_bom_permission(text), public.require_default_tenant(),
  public.save_product_manufacturing_profile(uuid,text,numeric,numeric,numeric,text,jsonb,boolean),
  public.create_bom_draft(uuid,text,text,uuid), public.save_bom_draft(uuid,date,date,text,jsonb),
  public.approve_bom_version(uuid,text,boolean), public.create_cutting_profile_draft(uuid,text,text,text,uuid),
  public.save_cutting_profile_draft(uuid,date,date,jsonb), public.approve_cutting_profile_version(uuid,text,boolean),
  public.resolve_effective_bom_version(uuid,date), public.resolve_effective_cutting_profile_version(uuid,date),
  public.calculate_cutting_consumption(uuid,numeric,numeric,boolean),
  public.calculate_standard_material_requirements(uuid,numeric,date,uuid,boolean,uuid,boolean)
TO authenticated;

REVOKE ALL ON FUNCTION public.validate_manufacturing_profile_scope(), public.validate_bom_header_scope(),
  public.validate_bom_version_scope(), public.validate_bom_line_scope(), public.validate_cutting_profile_scope(),
  public.validate_cutting_version_scope(), public.guard_bom_version_mutation(), public.guard_bom_line_mutation(),
  public.guard_cutting_version_mutation() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.calculate_standard_material_requirements(uuid,numeric,date,uuid,boolean,uuid,boolean)
IS 'Read-only standard material and current inventory cost preview. Never creates inventory movements or changes balances.';

COMMENT ON TABLE public.bom_lines IS 'Versioned quantity standards only. Inventory cost remains sourced from the inventory valuation engine.';
