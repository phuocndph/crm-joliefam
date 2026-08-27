-- Allow users to view all products in a price_list they're allowed to see
-- This fixes the case where products belong to multiple manager_ids inside the same price list
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