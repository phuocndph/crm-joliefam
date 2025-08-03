-- Add missing foreign key constraints to fabric_usage table
ALTER TABLE fabric_usage 
ADD CONSTRAINT fabric_usage_fabric_variant_id_fkey 
FOREIGN KEY (fabric_variant_id) REFERENCES fabric_variants(id);

ALTER TABLE fabric_usage 
ADD CONSTRAINT fabric_usage_warehouse_id_fkey 
FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);