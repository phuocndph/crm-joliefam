-- Remove the automatic trigger
DROP TRIGGER IF EXISTS auto_update_order_from_quote_trigger ON public.quotes;
DROP FUNCTION IF EXISTS public.auto_update_order_from_quote();