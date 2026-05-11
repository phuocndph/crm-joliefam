CREATE POLICY "Authenticated can view products"
ON public.products
FOR SELECT
TO authenticated
USING (true);