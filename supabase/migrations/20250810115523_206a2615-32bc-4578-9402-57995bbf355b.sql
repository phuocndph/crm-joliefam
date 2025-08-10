-- Add quote_data field to quotes table to store payment and VAT settings
ALTER TABLE public.quotes ADD COLUMN quote_data JSONB;