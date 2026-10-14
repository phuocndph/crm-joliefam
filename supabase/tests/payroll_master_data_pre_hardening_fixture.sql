-- Reproduce the historical permissive policy so the forward migration proves
-- that it removes the exact production policy name.
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can insert products" ON public.products;
CREATE POLICY "Users can insert products"
ON public.products FOR INSERT TO authenticated
WITH CHECK (true);
