-- price_lists: shared catalog read, owner-only write
DROP POLICY IF EXISTS "Managers can manage their price_lists" ON public.price_lists;
DROP POLICY IF EXISTS "Employees can manage their manager's price_lists" ON public.price_lists;
DROP POLICY IF EXISTS "Accountants can view all price_lists" ON public.price_lists;

CREATE POLICY "Authenticated can view price_lists"
  ON public.price_lists FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers can insert price_lists"
  ON public.price_lists FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL))
  );

CREATE POLICY "Managers can update their price_lists"
  ON public.price_lists FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND (manager_id = (auth.uid())::text)
  );

CREATE POLICY "Managers can delete their price_lists"
  ON public.price_lists FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND (manager_id = (auth.uid())::text)
  );

-- products: same treatment
DROP POLICY IF EXISTS "Managers can manage their products" ON public.products;
DROP POLICY IF EXISTS "Employees can manage their manager's products" ON public.products;
DROP POLICY IF EXISTS "Accountants can view all products" ON public.products;

CREATE POLICY "Authenticated can view products"
  ON public.products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers can insert products"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL))
  );

CREATE POLICY "Managers can update their products"
  ON public.products FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND (manager_id = (auth.uid())::text)
  );

CREATE POLICY "Managers can delete their products"
  ON public.products FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND (manager_id = (auth.uid())::text)
  );