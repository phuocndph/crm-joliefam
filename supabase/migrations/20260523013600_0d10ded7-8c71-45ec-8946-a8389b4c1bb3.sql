
CREATE OR REPLACE FUNCTION public.get_products_catalog(
  _price_list_id uuid,
  _search text DEFAULT NULL,
  _category text DEFAULT NULL,
  _in_stock boolean DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  price numeric,
  sku text,
  category text,
  specifications text,
  in_stock boolean,
  manager_id text,
  tenant_id text,
  price_list_id uuid,
  image_url text,
  images jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT p.*
    FROM public.products p
    WHERE auth.uid() IS NOT NULL
      AND (_price_list_id IS NULL OR p.price_list_id = _price_list_id)
      AND (_category IS NULL OR _category = 'all' OR p.category = _category)
      AND (_in_stock IS NULL OR p.in_stock = _in_stock)
      AND (
        _search IS NULL OR _search = '' OR
        p.name ILIKE '%' || _search || '%' OR
        p.sku ILIKE '%' || _search || '%' OR
        p.description ILIKE '%' || _search || '%'
      )
  ), counted AS (
    SELECT (SELECT count(*) FROM base) AS total
  )
  SELECT
    b.id, b.name, b.description, b.price, b.sku, b.category, b.specifications,
    b.in_stock, b.manager_id, b.tenant_id, b.price_list_id, b.image_url, b.images,
    b.created_at, b.updated_at,
    c.total
  FROM base b CROSS JOIN counted c
  ORDER BY b.category NULLS LAST, b.sku NULLS LAST
  LIMIT GREATEST(_limit, 0)
  OFFSET GREATEST(_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.get_products_catalog(uuid, text, text, boolean, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.get_products_catalog(uuid, text, text, boolean, int, int) TO authenticated;
