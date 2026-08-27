-- Fix: Set last_care_date = last_purchase_date for customers with orders before 24/9/2024
-- This ensures all customers with purchases before September 24th have their care date set to their last purchase date
UPDATE public.customers 
SET last_care_date = last_purchase_date 
WHERE last_purchase_date IS NOT NULL 
  AND last_purchase_date < '2024-09-24'::date;