CREATE OR REPLACE FUNCTION public.get_duplicate_display_order_numbers()
RETURNS TABLE(display_number text, dup_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT display_order_number, COUNT(*)::bigint
  FROM public.orders
  WHERE display_order_number ~ '^\d+$'
  GROUP BY display_order_number
  HAVING COUNT(*) > 1
  ORDER BY display_order_number;
$$;

GRANT EXECUTE ON FUNCTION public.get_duplicate_display_order_numbers() TO authenticated;