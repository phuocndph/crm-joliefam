-- Update for the correct year 2025: Set last_care_date = last_purchase_date for customers with orders before 24/9/2025
UPDATE public.customers 
SET last_care_date = last_purchase_date 
WHERE last_purchase_date IS NOT NULL 
  AND last_purchase_date < '2025-09-24'::date;