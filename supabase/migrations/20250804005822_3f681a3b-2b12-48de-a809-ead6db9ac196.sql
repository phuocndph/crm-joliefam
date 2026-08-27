-- Fix deletion issue by adding CASCADE to foreign key constraints
-- and ensure inventory is created for new fabric variants

-- First, let's check if the trigger exists and fix the cascade deletion issue
ALTER TABLE fabric_variants 
DROP CONSTRAINT IF EXISTS fabric_variants_fabric_type_id_fkey;

ALTER TABLE fabric_variants 
ADD CONSTRAINT fabric_variants_fabric_type_id_fkey 
FOREIGN KEY (fabric_type_id) REFERENCES fabric_types(id) 
ON DELETE CASCADE;

-- Fix fabric_usage constraint to cascade as well
ALTER TABLE fabric_usage 
DROP CONSTRAINT IF EXISTS fabric_usage_fabric_variant_id_fkey;

ALTER TABLE fabric_usage 
ADD CONSTRAINT fabric_usage_fabric_variant_id_fkey 
FOREIGN KEY (fabric_variant_id) REFERENCES fabric_variants(id) 
ON DELETE CASCADE;

-- Fix fabric_inventory constraint to cascade
ALTER TABLE fabric_inventory 
DROP CONSTRAINT IF EXISTS fabric_inventory_fabric_variant_id_fkey;

ALTER TABLE fabric_inventory 
ADD CONSTRAINT fabric_inventory_fabric_variant_id_fkey 
FOREIGN KEY (fabric_variant_id) REFERENCES fabric_variants(id) 
ON DELETE CASCADE;

-- Fix fabric_transactions constraint to cascade
ALTER TABLE fabric_transactions 
DROP CONSTRAINT IF EXISTS fabric_transactions_fabric_variant_id_fkey;

ALTER TABLE fabric_transactions 
ADD CONSTRAINT fabric_transactions_fabric_variant_id_fkey 
FOREIGN KEY (fabric_variant_id) REFERENCES fabric_variants(id) 
ON DELETE CASCADE;

-- Fix fabric_transfers constraint to cascade
ALTER TABLE fabric_transfers 
DROP CONSTRAINT IF EXISTS fabric_transfers_fabric_variant_id_fkey;

ALTER TABLE fabric_transfers 
ADD CONSTRAINT fabric_transfers_fabric_variant_id_fkey 
FOREIGN KEY (fabric_variant_id) REFERENCES fabric_variants(id) 
ON DELETE CASCADE;

-- Recreate the trigger to ensure it works properly for creating inventory
CREATE OR REPLACE FUNCTION public.create_fabric_inventory_on_variant_creation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
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
$function$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_create_fabric_inventory_on_variant_creation ON public.fabric_variants;

-- Create the trigger
CREATE TRIGGER trigger_create_fabric_inventory_on_variant_creation
    AFTER INSERT ON public.fabric_variants
    FOR EACH ROW
    EXECUTE FUNCTION public.create_fabric_inventory_on_variant_creation();