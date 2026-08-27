-- Create function to update fabric inventory when fabric usage is recorded
CREATE OR REPLACE FUNCTION public.update_fabric_inventory_on_usage()
RETURNS TRIGGER AS $$
BEGIN
  -- Update fabric inventory by reducing current_stock when fabric is used
  UPDATE public.fabric_inventory 
  SET 
    current_stock = current_stock - NEW.quantity_used,
    last_updated = now(),
    updated_at = now()
  WHERE fabric_variant_id = NEW.fabric_variant_id 
    AND warehouse_id = NEW.warehouse_id;
  
  -- If no inventory record exists, create one with negative stock to track usage
  IF NOT FOUND THEN
    INSERT INTO public.fabric_inventory (
      fabric_variant_id,
      warehouse_id,
      current_stock,
      reserved_stock,
      minimum_stock,
      maximum_stock,
      manager_id,
      tenant_id
    ) VALUES (
      NEW.fabric_variant_id,
      NEW.warehouse_id,
      -NEW.quantity_used, -- Negative to indicate deficit
      0,
      0,
      0,
      NEW.manager_id,
      NEW.tenant_id
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update fabric inventory when fabric usage is recorded
CREATE TRIGGER update_fabric_inventory_after_usage
  AFTER INSERT ON public.fabric_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_fabric_inventory_on_usage();

-- Also create trigger for when fabric usage is updated
CREATE OR REPLACE FUNCTION public.update_fabric_inventory_on_usage_update()
RETURNS TRIGGER AS $$
BEGIN
  -- First, add back the old quantity
  UPDATE public.fabric_inventory 
  SET 
    current_stock = current_stock + OLD.quantity_used,
    last_updated = now(),
    updated_at = now()
  WHERE fabric_variant_id = OLD.fabric_variant_id 
    AND warehouse_id = OLD.warehouse_id;
    
  -- Then subtract the new quantity
  UPDATE public.fabric_inventory 
  SET 
    current_stock = current_stock - NEW.quantity_used,
    last_updated = now(),
    updated_at = now()
  WHERE fabric_variant_id = NEW.fabric_variant_id 
    AND warehouse_id = NEW.warehouse_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_fabric_inventory_after_usage_update
  AFTER UPDATE ON public.fabric_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_fabric_inventory_on_usage_update();

-- Create trigger for when fabric usage is deleted (to add back the quantity)
CREATE OR REPLACE FUNCTION public.update_fabric_inventory_on_usage_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Add back the quantity when usage record is deleted
  UPDATE public.fabric_inventory 
  SET 
    current_stock = current_stock + OLD.quantity_used,
    last_updated = now(),
    updated_at = now()
  WHERE fabric_variant_id = OLD.fabric_variant_id 
    AND warehouse_id = OLD.warehouse_id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_fabric_inventory_after_usage_delete
  AFTER DELETE ON public.fabric_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_fabric_inventory_on_usage_delete();