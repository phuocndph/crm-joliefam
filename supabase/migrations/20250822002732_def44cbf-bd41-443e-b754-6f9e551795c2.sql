-- Remove duplicate products with incorrect prices (less than 100,000)
-- Keep only the products with correct prices (1,000,000+)
DELETE FROM public.products 
WHERE sku IN ('DBECS160X10', 'DBECS180X10', 'DBECS200X10') 
  AND (price < 100000 OR cost_price < 100000);

-- Add unique constraint to prevent future duplicates on sku + price_list_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_price_list 
ON public.products(sku, price_list_id);