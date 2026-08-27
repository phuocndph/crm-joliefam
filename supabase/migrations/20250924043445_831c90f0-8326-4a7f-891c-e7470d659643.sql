-- Fix care dates: Set last_care_date = actual order date for customers with orders before Sept 24, 2025
-- This ensures customers with historical orders show the correct care dates based on their purchase history

UPDATE public.customers 
SET last_care_date = (
  SELECT MAX(o.created_at)
  FROM public.orders o 
  WHERE o.customer_id = customers.id 
    AND o.created_at < '2025-09-24'::date
    AND o.status != 'cancelled'
)
WHERE id IN (
  SELECT DISTINCT c.id 
  FROM public.customers c
  JOIN public.orders o ON o.customer_id = c.id
  WHERE o.created_at < '2025-09-24'::date
    AND o.status != 'cancelled'
);