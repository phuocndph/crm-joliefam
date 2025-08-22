-- First, remove duplicates from products table keeping the one with highest price (correct one)
WITH duplicates AS (
  SELECT sku, price_list_id, 
         ROW_NUMBER() OVER (PARTITION BY sku, price_list_id ORDER BY price DESC, created_at DESC) as rn,
         id
  FROM public.products 
  WHERE (sku, price_list_id) IN (
    SELECT sku, price_list_id 
    FROM public.products 
    GROUP BY sku, price_list_id 
    HAVING COUNT(*) > 1
  )
)
DELETE FROM public.products 
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Add unique constraint to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_price_list 
ON public.products(sku, price_list_id);