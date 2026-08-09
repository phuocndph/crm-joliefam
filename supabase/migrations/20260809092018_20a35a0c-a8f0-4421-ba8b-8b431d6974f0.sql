CREATE OR REPLACE FUNCTION public.get_products_cost_prices(_ids uuid[])
RETURNS TABLE(id uuid, cost_price numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.cost_price
  FROM public.products p
  WHERE p.id = ANY(_ids)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'accountant'::app_role)
    )
$$;

GRANT EXECUTE ON FUNCTION public.get_products_cost_prices(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_products_cost_prices(uuid[]) TO service_role;