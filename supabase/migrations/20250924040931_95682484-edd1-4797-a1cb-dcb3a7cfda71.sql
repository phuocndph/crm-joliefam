-- Add last_care_date column to customers table to track latest care/contact date
ALTER TABLE public.customers 
ADD COLUMN last_care_date timestamp with time zone DEFAULT now();