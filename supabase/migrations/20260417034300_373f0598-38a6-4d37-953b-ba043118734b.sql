-- Fix trigger: replace MIN(id) (không hỗ trợ uuid) bằng subquery
CREATE OR REPLACE FUNCTION public.auto_link_ghn_tracking_to_order()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int;
BEGIN
  IF NEW.order_id IS NULL 
     AND NEW.internal_order_code IS NOT NULL 
     AND NEW.internal_order_code ~ '^[0-9]+$' THEN
    
    SELECT COUNT(*) INTO v_count
    FROM public.orders
    WHERE display_order_number = NEW.internal_order_code;
    
    IF v_count = 1 THEN
      SELECT id INTO NEW.order_id
      FROM public.orders
      WHERE display_order_number = NEW.internal_order_code
      LIMIT 1;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Fix GYKTLTF9: clear link sai
UPDATE public.ghn_tracking 
SET order_id = NULL 
WHERE ghn_order_code = 'GYKTLTF9' 
  AND order_id = '39ed0bcf-8d29-4b2e-83f3-36e17c910f71';

-- Re-link các record NULL có đúng 1 match
UPDATE public.ghn_tracking gt
SET order_id = (
  SELECT o.id FROM public.orders o 
  WHERE o.display_order_number = gt.internal_order_code 
  LIMIT 1
)
WHERE gt.order_id IS NULL
  AND gt.internal_order_code IS NOT NULL
  AND gt.internal_order_code ~ '^[0-9]+$'
  AND (SELECT COUNT(*) FROM public.orders WHERE display_order_number = gt.internal_order_code) = 1;