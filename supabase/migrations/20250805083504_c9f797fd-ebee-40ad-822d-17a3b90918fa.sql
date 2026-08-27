-- Update the delete function to properly rebuild notes without the deleted usage
CREATE OR REPLACE FUNCTION public.update_order_notes_on_fabric_usage_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  all_fabric_usage TEXT;
BEGIN
  -- Only process if order_number is provided
  IF OLD.order_number IS NULL OR OLD.order_number = '' THEN
    RETURN OLD;
  END IF;

  -- Get all remaining fabric usage for this order after deletion
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
  WHERE fu.order_number = OLD.order_number
    AND fu.id != OLD.id; -- Exclude the deleted record

  -- Update order notes with remaining fabric usage info
  UPDATE public.orders 
  SET notes = all_fabric_usage,
      updated_at = now()
  WHERE order_number = OLD.order_number OR display_order_number = OLD.order_number;

  RETURN OLD;
END;
$$;