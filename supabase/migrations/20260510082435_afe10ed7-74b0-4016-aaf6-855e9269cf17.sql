
-- ============ QUOTES: replace broad policies with role-scoped ============
DROP POLICY IF EXISTS "Authenticated users can view quotes" ON public.quotes;
DROP POLICY IF EXISTS "Authenticated users can insert quotes" ON public.quotes;
DROP POLICY IF EXISTS "Authenticated users can update quotes" ON public.quotes;
DROP POLICY IF EXISTS "Authenticated users can delete quotes" ON public.quotes;

CREATE POLICY "Admins can manage all quotes" ON public.quotes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Accountants can manage all quotes" ON public.quotes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'accountant'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Managers can manage their quotes" ON public.quotes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)))
  WITH CHECK (public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Employees can view their manager quotes" ON public.quotes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'employee'::app_role) AND (manager_id IN (
    SELECT (ur.assigned_by)::text FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'employee'::app_role
  )));

CREATE POLICY "Employees can insert their manager quotes" ON public.quotes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'employee'::app_role) AND (manager_id IN (
    SELECT (ur.assigned_by)::text FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'employee'::app_role
  )));

CREATE POLICY "Employees can update their manager quotes" ON public.quotes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'employee'::app_role) AND (manager_id IN (
    SELECT (ur.assigned_by)::text FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'employee'::app_role
  )));

CREATE POLICY "Employees can delete their manager quotes" ON public.quotes
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'employee'::app_role) AND (manager_id IN (
    SELECT (ur.assigned_by)::text FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'employee'::app_role
  )));

-- ============ GHN_TRACKING: drop broad SELECT, scope by role ============
DROP POLICY IF EXISTS "All authenticated users can view GHN tracking data" ON public.ghn_tracking;

CREATE POLICY "Admins can view all GHN tracking data" ON public.ghn_tracking
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view their GHN tracking data" ON public.ghn_tracking
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));

CREATE POLICY "Employees can view their manager GHN tracking data" ON public.ghn_tracking
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'employee'::app_role) AND (manager_id IN (
    SELECT (ur.assigned_by)::text FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'employee'::app_role
  )));

-- ============ PRODUCTS: scope SELECT ============
DROP POLICY IF EXISTS "Authenticated can view products" ON public.products;

CREATE POLICY "Admins can view all products" ON public.products
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Accountants can view all products" ON public.products
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Managers can view their products" ON public.products
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));

CREATE POLICY "Employees can view their manager products" ON public.products
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'employee'::app_role) AND (manager_id IN (
    SELECT (ur.assigned_by)::text FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'employee'::app_role
  )));

-- ============ SHIPPING_COMPANIES: tighten INSERT ============
DROP POLICY IF EXISTS "Users can create shipping companies" ON public.shipping_companies;

CREATE POLICY "Users can create shipping companies" ON public.shipping_companies
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (public.has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)))
    OR (public.has_role(auth.uid(), 'employee'::app_role) AND (manager_id IN (
      SELECT (ur.assigned_by)::text FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'employee'::app_role
    )))
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

-- ============ TEMPLATE SETTINGS: restrict SELECT to users with a role ============
DROP POLICY IF EXISTS "Users can view contract template settings" ON public.contract_template_settings;
CREATE POLICY "Users with role can view contract template settings" ON public.contract_template_settings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view template settings" ON public.quote_template_settings;
CREATE POLICY "Users with role can view quote template settings" ON public.quote_template_settings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()));

-- ============ STORAGE: logos & knowledge-files restrict to admin/manager ============
DROP POLICY IF EXISTS "Authenticated users can upload logos" ON storage.objects;
CREATE POLICY "Admin/manager can upload logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'logos' AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role)));

DROP POLICY IF EXISTS "Authenticated users can update logos" ON storage.objects;
CREATE POLICY "Admin/manager can update logos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'logos' AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role)));

DROP POLICY IF EXISTS "Authenticated users can upload knowledge files" ON storage.objects;
CREATE POLICY "Admin/manager can upload knowledge files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'knowledge-files' AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role)));

-- ============ SECURITY DEFINER functions: revoke EXECUTE from anon/public ============
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
