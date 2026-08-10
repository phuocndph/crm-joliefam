DROP POLICY IF EXISTS "Employees can view their manager products" ON public.products;

CREATE POLICY "Employees can view all products"
ON public.products
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'employee'::app_role));

CREATE OR REPLACE FUNCTION public.get_products_cost_prices(_ids uuid[])
RETURNS TABLE(id uuid, cost_price numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.cost_price
  FROM public.products p
  WHERE p.id = ANY(_ids)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'accountant'::app_role)
      OR public.has_role(auth.uid(), 'employee'::app_role)
    )
$function$;