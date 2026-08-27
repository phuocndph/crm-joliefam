-- Function to update order notes when fabric usage changes
CREATE OR REPLACE FUNCTION public.update_order_notes_on_fabric_usage()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  usage_info TEXT;
  existing_notes TEXT;
  updated_notes TEXT;
  fabric_name TEXT;
  warehouse_name TEXT;
BEGIN
  -- Only process if order_number is provided
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    RETURN NEW;
  END IF;

  -- Get fabric type name and warehouse name
  SELECT 
    ft.name,
    w.name
  INTO fabric_name, warehouse_name
  FROM public.fabric_variants fv
  JOIN public.fabric_types ft ON fv.fabric_type_id = ft.id
  JOIN public.warehouses w ON w.id = NEW.warehouse_id
  WHERE fv.id = NEW.fabric_variant_id;

  -- Create usage info string
  usage_info := fabric_name || '=' || NEW.quantity_used || 'm (' || warehouse_name || ')';

  -- Get existing notes from order
  SELECT notes INTO existing_notes
  FROM public.orders
  WHERE order_number = NEW.order_number OR display_order_number = NEW.order_number
  LIMIT 1;

  -- Update or create notes
  IF existing_notes IS NULL OR existing_notes = '' THEN
    updated_notes := usage_info;
  ELSE
    -- Check if this fabric usage info already exists in notes
    IF existing_notes NOT LIKE '%' || fabric_name || '=%' THEN
      updated_notes := existing_notes || '; ' || usage_info;
    ELSE
      -- Replace existing fabric info with updated info
      updated_notes := regexp_replace(
        existing_notes, 
        fabric_name || '=[^;]*(\([^)]*\))?', 
        usage_info, 
        'g'
      );
    END IF;
  END IF;

  -- Update order notes
  UPDATE public.orders 
  SET notes = updated_notes,
      updated_at = now()
  WHERE order_number = NEW.order_number OR display_order_number = NEW.order_number;

  RETURN NEW;
END;
$function$