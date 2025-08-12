-- Create function to automatically update orders when quotes are updated
CREATE OR REPLACE FUNCTION public.auto_update_order_from_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Only update if quote status is approved and content has changed
  IF NEW.status = 'approved' AND (
    OLD.total_amount IS DISTINCT FROM NEW.total_amount OR
    OLD.items IS DISTINCT FROM NEW.items
  ) THEN
    -- Update the corresponding order
    UPDATE public.orders 
    SET 
      total_amount = NEW.total_amount,
      items = NEW.items,
      notes = CONCAT('Được tạo từ báo giá ', NEW.quote_number, ' (tự động cập nhật lúc ', NOW()::timestamp::text, ')'),
      updated_at = NOW()
    WHERE quote_id = NEW.id;
    
    -- If no order found by quote_id, try to find by notes and update quote_id
    IF NOT FOUND THEN
      UPDATE public.orders 
      SET 
        total_amount = NEW.total_amount,
        items = NEW.items,
        notes = CONCAT('Được tạo từ báo giá ', NEW.quote_number, ' (tự động cập nhật lúc ', NOW()::timestamp::text, ')'),
        updated_at = NOW(),
        quote_id = NEW.id
      WHERE notes ILIKE CONCAT('%', NEW.quote_number, '%')
      AND quote_id IS NULL;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger to automatically update orders when quotes change
CREATE OR REPLACE TRIGGER auto_update_order_from_quote_trigger
  AFTER UPDATE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_update_order_from_quote();