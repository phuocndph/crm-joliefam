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

-- Function to consolidate fabric usage info for order notes
CREATE OR REPLACE FUNCTION public.consolidate_fabric_usage_notes(p_order_number TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $function$
DECLARE
  usage_record RECORD;
  consolidated_notes TEXT := '';
  first_entry BOOLEAN := TRUE;
BEGIN
  -- Get all fabric usage for this order number, grouped by fabric type and warehouse
  FOR usage_record IN
    SELECT 
      ft.name as fabric_name,
      w.name as warehouse_name,
      SUM(fu.quantity_used) as total_quantity
    FROM public.fabric_usage fu
    JOIN public.fabric_variants fv ON fu.fabric_variant_id = fv.id
    JOIN public.fabric_types ft ON fv.fabric_type_id = ft.id
    JOIN public.warehouses w ON fu.warehouse_id = w.id
    WHERE fu.order_number = p_order_number
    GROUP BY ft.name, w.name, ft.id, w.id
    ORDER BY ft.name, w.name
  LOOP
    IF NOT first_entry THEN
      consolidated_notes := consolidated_notes || '; ';
    END IF;
    
    consolidated_notes := consolidated_notes || usage_record.fabric_name || '=' || usage_record.total_quantity || 'm (' || usage_record.warehouse_name || ')';
    first_entry := FALSE;
  END LOOP;
  
  RETURN NULLIF(consolidated_notes, '');
END;
$function$

-- Create triggers for fabric usage changes
CREATE TRIGGER trigger_update_order_notes_on_fabric_usage_insert
  AFTER INSERT ON public.fabric_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_order_notes_on_fabric_usage();

CREATE TRIGGER trigger_update_order_notes_on_fabric_usage_update
  AFTER UPDATE ON public.fabric_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_order_notes_on_fabric_usage();

CREATE TRIGGER trigger_update_order_notes_on_fabric_usage_delete
  AFTER DELETE ON public.fabric_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_order_notes_on_fabric_usage_delete();