-- 1. ai_config: remove broad authenticated-read policy (admin/manager read policy already exists)
DROP POLICY IF EXISTS "All authenticated users can read ai_config" ON public.ai_config;

-- 2. price_lists: drop permissive 'true' policies
DROP POLICY IF EXISTS "Authenticated users can view price_lists" ON public.price_lists;
DROP POLICY IF EXISTS "Authenticated users can insert price_lists" ON public.price_lists;
DROP POLICY IF EXISTS "Authenticated users can update price_lists" ON public.price_lists;
DROP POLICY IF EXISTS "Authenticated users can delete price_lists" ON public.price_lists;

-- Add role-scoped price_lists policies
CREATE POLICY "Admins can manage all price_lists"
  ON public.price_lists FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Accountants can view all price_lists"
  ON public.price_lists FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Managers can manage their price_lists"
  ON public.price_lists FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)))
  WITH CHECK (public.has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));

CREATE POLICY "Employees can manage their manager's price_lists"
  ON public.price_lists FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'employee'::app_role)
    AND (manager_id IN (
      SELECT (assigned_by)::text FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'employee'::app_role
    ))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'employee'::app_role)
    AND ((manager_id IS NULL) OR (manager_id IN (
      SELECT (assigned_by)::text FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'employee'::app_role
    )))
  );

-- 3. products: same treatment
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can insert products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can update products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can delete products" ON public.products;

CREATE POLICY "Admins can manage all products"
  ON public.products FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Accountants can view all products"
  ON public.products FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Managers can manage their products"
  ON public.products FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)))
  WITH CHECK (public.has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));

CREATE POLICY "Employees can manage their manager's products"
  ON public.products FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'employee'::app_role)
    AND (manager_id IN (
      SELECT (assigned_by)::text FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'employee'::app_role
    ))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'employee'::app_role)
    AND ((manager_id IS NULL) OR (manager_id IN (
      SELECT (assigned_by)::text FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'employee'::app_role
    )))
  );

-- 4. user_roles: remove the two PERMISSIVE policies that grant blanket access
-- Existing admin/manager policies already restrict properly.
DROP POLICY IF EXISTS "Users cannot delete their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users cannot update their own roles" ON public.user_roles;