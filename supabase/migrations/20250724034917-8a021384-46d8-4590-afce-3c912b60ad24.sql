-- Add display_order_number field to orders table for custom display names
ALTER TABLE public.orders 
ADD COLUMN display_order_number TEXT;