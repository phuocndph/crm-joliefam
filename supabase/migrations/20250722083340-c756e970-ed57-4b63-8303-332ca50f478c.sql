-- Add unique constraint on sku and price_list_id combination
ALTER TABLE public.products 
ADD CONSTRAINT products_sku_price_list_unique 
UNIQUE (sku, price_list_id);