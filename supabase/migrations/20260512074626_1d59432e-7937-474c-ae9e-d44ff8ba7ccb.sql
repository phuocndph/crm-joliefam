
-- 1) Resync product ownership to match its price list owner
UPDATE public.products p
SET manager_id = pl.manager_id
FROM public.price_lists pl
WHERE p.price_list_id = pl.id
  AND pl.manager_id IS NOT NULL
  AND (p.manager_id IS DISTINCT FROM pl.manager_id);

-- 2) Allow viewing products via accessible price_lists (defense in depth)
DROP POLICY IF EXISTS "Users can view products in accessible price_lists" ON public.products;
CREATE POLICY "Users can view products in accessible price_lists"
ON public.products
FOR SELECT
TO authenticated
USING (
  price_list_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.price_lists pl
    WHERE pl.id = public.products.price_list_id
  )
);
