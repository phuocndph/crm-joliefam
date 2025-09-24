-- Update existing customers: set last_care_date = last_purchase_date for customers with orders before 24/9/2024
UPDATE public.customers 
SET last_care_date = last_purchase_date 
WHERE last_purchase_date IS NOT NULL 
  AND last_purchase_date < '2024-09-24'::date 
  AND (last_care_date IS NULL OR last_care_date < last_purchase_date);