-- Update customers' last_care_date to match their actual order dates for orders before Sept 24, 2025
-- This fixes the issue where customers with old orders (2023) show current dates instead of historical dates

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