
-- Step 1: Update existing ghn_tracking records to link with orders
UPDATE public.ghn_tracking gt
SET order_id = o.id
FROM public.orders o
WHERE gt.order_id IS NULL
  AND gt.internal_order_code IS NOT NULL
  AND gt.internal_order_code = o.display_order_number;

-- Step 2: Create function to auto-link ghn_tracking with orders
CREATE OR REPLACE FUNCTION public.auto_link_ghn_tracking_to_order()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only process if order_id is not already set and internal_order_code exists
  IF NEW.order_id IS NULL AND NEW.internal_order_code IS NOT NULL THEN
    SELECT id INTO NEW.order_id
    FROM public.orders
    WHERE display_order_number = NEW.internal_order_code
    LIMIT 1;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Step 3: Create trigger on INSERT and UPDATE
CREATE TRIGGER trg_auto_link_ghn_tracking
BEFORE INSERT OR UPDATE ON public.ghn_tracking
FOR EACH ROW
EXECUTE FUNCTION public.auto_link_ghn_tracking_to_order();
