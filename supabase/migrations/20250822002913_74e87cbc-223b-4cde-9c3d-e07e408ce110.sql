-- Delete all products with incorrect prices (less than 100,000)
DELETE FROM public.products 
WHERE price < 100000 OR cost_price < 100000;