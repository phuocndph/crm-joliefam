-- Fix 1: Improve auto-link trigger
CREATE OR REPLACE FUNCTION public.auto_link_ghn_tracking_to_order()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int;
  v_order_id uuid;
BEGIN
  -- Only process if order_id not set, internal_order_code exists and is purely numeric
  IF NEW.order_id IS NULL 
     AND NEW.internal_order_code IS NOT NULL 
     AND NEW.internal_order_code ~ '^[0-9]+$' THEN
    
    SELECT COUNT(*), MIN(id) INTO v_count, v_order_id
    FROM public.orders
    WHERE display_order_number = NEW.internal_order_code;
    
    -- Only link when EXACTLY 1 order matches (avoid random linking on duplicates)
    IF v_count = 1 THEN
      NEW.order_id := v_order_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Fix 4: Repair existing mismatched links
UPDATE public.ghn_tracking gt
SET order_id = correct.correct_order_id
FROM (
  SELECT 
    gt2.id AS tracking_id,
    (SELECT o.id FROM public.orders o 
     WHERE o.display_order_number = gt2.internal_order_code 
     LIMIT 1) AS correct_order_id
  FROM public.ghn_tracking gt2
  WHERE gt2.internal_order_code IS NOT NULL
    AND gt2.internal_order_code ~ '^[0-9]+$'
    AND (SELECT COUNT(*) FROM public.orders 
         WHERE display_order_number = gt2.internal_order_code) = 1
    AND (
      gt2.order_id IS NULL
      OR gt2.order_id != (SELECT o.id FROM public.orders o 
                          WHERE o.display_order_number = gt2.internal_order_code 
                          LIMIT 1)
    )
) correct
WHERE gt.id = correct.tracking_id
  AND correct.correct_order_id IS NOT NULL;