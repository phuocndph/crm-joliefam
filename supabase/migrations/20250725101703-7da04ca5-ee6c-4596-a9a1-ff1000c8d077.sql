-- Add delivered_date column to orders table
ALTER TABLE public.orders ADD COLUMN delivered_date TIMESTAMP WITH TIME ZONE;