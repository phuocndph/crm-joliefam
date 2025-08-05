-- Update the function to properly handle multiple fabric usages for the same order
CREATE OR REPLACE FUNCTION public.update_order_notes_on_fabric_usage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  all_fabric_usage TEXT;
  existing_notes TEXT;
BEGIN
  -- Only process if order_number is provided
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    RETURN NEW;
  END IF;

  -- Get all fabric usage for this order and build the complete notes
  SELECT string_agg(
    ft.name || '=' || fu.quantity_used || 'm (' || w.name || ')', 
    '; ' 
    ORDER BY fu.created_at
  )
  INTO all_fabric_usage
  FROM public.fabric_usage fu
  JOIN public.fabric_variants fv ON fv.id = fu.fabric_variant_id
  JOIN public.fabric_types ft ON ft.id = fv.fabric_type_id
  JOIN public.warehouses w ON w.id = fu.warehouse_id
  WHERE fu.order_number = NEW.order_number;

  -- Update order notes with complete fabric usage info
  UPDATE public.orders 
  SET notes = all_fabric_usage,
      updated_at = now()
  WHERE order_number = NEW.order_number OR display_order_number = NEW.order_number;

  RETURN NEW;
END;
$$;