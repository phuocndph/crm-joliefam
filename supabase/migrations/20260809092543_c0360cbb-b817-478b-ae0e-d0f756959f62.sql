DROP POLICY IF EXISTS "Managers can view their products" ON public.products;

CREATE POLICY "Managers can view all products"
ON public.products
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'manager'::app_role));