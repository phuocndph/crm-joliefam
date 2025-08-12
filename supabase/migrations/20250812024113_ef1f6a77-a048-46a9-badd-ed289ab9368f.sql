-- Add quote_id column to orders table for direct linking
ALTER TABLE public.orders 
ADD COLUMN quote_id UUID REFERENCES public.quotes(id);

-- Add index for better performance
CREATE INDEX idx_orders_quote_id ON public.orders(quote_id);