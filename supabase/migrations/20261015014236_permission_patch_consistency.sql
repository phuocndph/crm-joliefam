-- Append-only patch API. Keep replace_employee_permissions for old clients;
-- partial edits must never call its replacement semantics.
BEGIN;
CREATE OR REPLACE FUNCTION public.patch_employee_permissions(p_user_id uuid,p_permissions jsonb,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_admin boolean := public.has_role(auth.uid(),'admin'::public.app_role);
  v_catalog constant text[] := ARRAY[
    'dashboard','customers','products','quotes','orders','cash_flow','transactions','reports','user_management','quote_supplement','customer_care','fabric_management','ghn_tracking','quote_approval','knowledge_base','contracts','shipping_companies',
    'cost_transactions','cost_categories','cost_centers','cost_objects','transaction_types','cost_transaction_confirm','cost_transaction_void','cost_audit',
    'inventory_view','inventory_items','inventory_documents','inventory_confirm','inventory_adjustment','inventory_opening','inventory_cost_view','inventory_audit',
    'bom_view','bom_manage','bom_approve','cutting_profiles','cutting_approve','production_view','production_manage','production_release','production_complete','production_operations','production_worker_manage','production_attendance_approve',
    'payroll_view','payroll_team_view','payroll_worker_manage'
  ];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Bạn chưa đăng nhập' USING ERRCODE='42501'; END IF;
  IF p_user_id IS NULL OR jsonb_typeof(p_permissions) IS DISTINCT FROM 'array' OR NULLIF(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Dữ liệu phân quyền và lý do thay đổi là bắt buộc'; END IF;
  -- Serialize this API without deleting grants omitted by another editor.
  PERFORM pg_advisory_xact_lock(hashtextextended('employee-permissions:'||p_user_id::text,0));
  IF NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p_user_id AND r.role IN ('employee'::public.app_role,'accountant'::public.app_role))
     OR EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p_user_id AND r.role IN ('admin'::public.app_role,'manager'::public.app_role)) THEN
    RAISE EXCEPTION 'Không thể cấu hình quyền cho tài khoản này' USING ERRCODE='42501';
  END IF;
  IF NOT v_admin AND NOT (public.has_role(auth.uid(),'manager'::public.app_role)
      AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p_user_id AND r.role='employee'::public.app_role AND r.assigned_by=auth.uid())
      AND NOT public.has_role(p_user_id,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'Bạn không có quyền cập nhật phân quyền này' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_permissions) value
      WHERE jsonb_typeof(value) IS DISTINCT FROM 'object'
        OR jsonb_typeof(value->'permission_type') IS DISTINCT FROM 'string'
        OR jsonb_typeof(value->'enabled') IS DISTINCT FROM 'boolean'
        OR NOT coalesce((value->>'permission_type')=ANY(v_catalog),false)) THEN
    RAISE EXCEPTION 'Danh sách có quyền không hợp lệ';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_permissions) value GROUP BY value->>'permission_type' HAVING count(*)>1) THEN RAISE EXCEPTION 'Danh sách quyền bị trùng'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('permission_type',permission_type,'enabled',enabled) ORDER BY permission_type),'[]'::jsonb) INTO v_before FROM public.employee_permissions WHERE user_id=p_user_id;
  INSERT INTO public.employee_permissions(user_id,permission_type,enabled)
    SELECT p_user_id,value->>'permission_type',(value->>'enabled')::boolean FROM jsonb_array_elements(p_permissions) value
    ON CONFLICT(user_id,permission_type) DO UPDATE SET enabled=excluded.enabled,updated_at=now();
  SELECT coalesce(jsonb_agg(jsonb_build_object('permission_type',permission_type,'enabled',enabled) ORDER BY permission_type),'[]'::jsonb) INTO v_after FROM public.employee_permissions WHERE user_id=p_user_id;
  PERFORM public.write_cost_audit('employee_permissions',p_user_id,'UPDATE',v_before,v_after,btrim(p_reason));
  RETURN jsonb_build_object('user_id',p_user_id,'permissions',v_after);
END;
$$;
REVOKE ALL ON FUNCTION public.patch_employee_permissions(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.patch_employee_permissions(uuid,jsonb,text) TO authenticated;
COMMENT ON FUNCTION public.patch_employee_permissions(uuid,jsonb,text) IS 'Patch known delegated rights only; preserve omitted grants and audit authenticated actor. Does not replace the legacy full-list RPC.';
COMMIT;
