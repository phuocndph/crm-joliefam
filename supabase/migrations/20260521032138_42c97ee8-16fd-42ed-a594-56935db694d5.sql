
-- Restore shared catalog visibility for products while protecting cost_price via a column-less view

-- 1) Re-add SELECT policy: any authenticated user can view products that belong to an accessible price_list
DROP POLICY IF EXISTS "Users can view products in accessible price_lists" ON public.products;
CREATE POLICY "Users can view products in accessible price_lists"
ON public.products
FOR SELECT
TO authenticated
USING (
  price_list_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.price_lists pl WHERE pl.id = public.products.price_list_id)
);

-- 2) Create a public view that excludes cost_price
DROP VIEW IF EXISTS public.products_public;
CREATE VIEW public.products_public
WITH (security_invoker = on) AS
SELECT
  id, name, description, price, sku, category, specifications, in_stock,
  manager_id, tenant_id, price_list_id, image_url, images, created_at, updated_at
FROM public.products;

GRANT SELECT ON public.products_public TO authenticated;
