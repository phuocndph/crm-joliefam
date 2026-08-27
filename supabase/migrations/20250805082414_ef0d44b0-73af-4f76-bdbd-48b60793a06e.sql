-- Function to update order notes when fabric usage is deleted
CREATE OR REPLACE FUNCTION public.update_order_notes_on_fabric_usage_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  fabric_name TEXT;
  warehouse_name TEXT;
  existing_notes TEXT;
  updated_notes TEXT;
BEGIN
  -- Only process if order_number is provided
  IF OLD.order_number IS NULL OR OLD.order_number = '' THEN
    RETURN OLD;
  END IF;

  -- Get fabric type name and warehouse name
  SELECT 
    ft.name,
    w.name
  INTO fabric_name, warehouse_name
  FROM public.fabric_variants fv
  JOIN public.fabric_types ft ON fv.fabric_type_id = ft.id
  JOIN public.warehouses w ON w.id = OLD.warehouse_id
  WHERE fv.id = OLD.fabric_variant_id;

  -- Get existing notes from order
  SELECT notes INTO existing_notes
  FROM public.orders
  WHERE order_number = OLD.order_number OR display_order_number = OLD.order_number
  LIMIT 1;

  -- Remove fabric usage info from notes
  IF existing_notes IS NOT NULL THEN
    -- Remove the specific fabric usage entry
    updated_notes := regexp_replace(
      existing_notes, 
      '; ?' || fabric_name || '=[^;]*(\([^)]*\))?|' || fabric_name || '=[^;]*(\([^)]*\))?; ?', 
      '', 
      'g'
    );
    
    -- Clean up any remaining semicolons or spaces
    updated_notes := trim(both '; ' FROM updated_notes);
    
    -- Update order notes
    UPDATE public.orders 
    SET notes = CASE 
                  WHEN updated_notes = '' THEN NULL 
                  ELSE updated_notes 
                END,
        updated_at = now()
    WHERE order_number = OLD.order_number OR display_order_number = OLD.order_number;
  END IF;

  RETURN OLD;
END;
$function$