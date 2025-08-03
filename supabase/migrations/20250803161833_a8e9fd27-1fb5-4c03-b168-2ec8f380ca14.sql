-- Create trigger to automatically create fabric inventory records when a new fabric variant is created
CREATE OR REPLACE FUNCTION public.create_fabric_inventory_on_variant_creation()
RETURNS TRIGGER AS $$
DECLARE
  warehouse_rec RECORD;
BEGIN
  -- Get all warehouses and create inventory records for each
  FOR warehouse_rec IN SELECT id, manager_id, tenant_id FROM public.warehouses LOOP
    INSERT INTO public.fabric_inventory (
      fabric_variant_id,
      warehouse_id,
      current_stock,
      reserved_stock,
      minimum_stock,
      maximum_stock,
      manager_id,
      tenant_id,
      created_at,
      updated_at,
      last_updated
    ) VALUES (
      NEW.id,
      warehouse_rec.id,
      0, -- Start with 0 stock
      0,
      0,
      0,
      warehouse_rec.manager_id,
      warehouse_rec.tenant_id,
      now(),
      now(),
      now()
    )
    ON CONFLICT (fabric_variant_id, warehouse_id) DO NOTHING; -- Avoid duplicates if record already exists
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for fabric variant creation
CREATE TRIGGER create_fabric_inventory_after_variant_creation
  AFTER INSERT ON public.fabric_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.create_fabric_inventory_on_variant_creation();

-- Also create a trigger to handle new warehouses (create inventory records for all existing fabric variants)
CREATE OR REPLACE FUNCTION public.create_fabric_inventory_on_warehouse_creation()
RETURNS TRIGGER AS $$
DECLARE
  variant_rec RECORD;
BEGIN
  -- Get all fabric variants and create inventory records for the new warehouse
  FOR variant_rec IN SELECT id, manager_id, tenant_id FROM public.fabric_variants LOOP
    INSERT INTO public.fabric_inventory (
      fabric_variant_id,
      warehouse_id,
      current_stock,
      reserved_stock,
      minimum_stock,
      maximum_stock,
      manager_id,
      tenant_id,
      created_at,
      updated_at,
      last_updated
    ) VALUES (
      variant_rec.id,
      NEW.id,
      0, -- Start with 0 stock
      0,
      0,
      0,
      variant_rec.manager_id,
      variant_rec.tenant_id,
      now(),
      now(),
      now()
    )
    ON CONFLICT (fabric_variant_id, warehouse_id) DO NOTHING; -- Avoid duplicates if record already exists
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for warehouse creation
CREATE TRIGGER create_fabric_inventory_after_warehouse_creation
  AFTER INSERT ON public.warehouses
  FOR EACH ROW
  EXECUTE FUNCTION public.create_fabric_inventory_on_warehouse_creation();