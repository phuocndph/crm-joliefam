-- Add missing fields to quotes table for better data preservation
ALTER TABLE public.quotes 
ADD COLUMN price_list_id uuid,
ADD COLUMN include_vat boolean DEFAULT false,
ADD COLUMN vat_rate numeric DEFAULT 8,
ADD COLUMN subtotal numeric,
ADD COLUMN vat_amount numeric;

-- Add foreign key reference to price_lists if needed
-- ALTER TABLE public.quotes ADD CONSTRAINT fk_quotes_price_list FOREIGN KEY (price_list_id) REFERENCES public.price_lists(id);