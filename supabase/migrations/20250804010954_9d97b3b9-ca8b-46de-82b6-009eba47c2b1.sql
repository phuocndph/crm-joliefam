-- Create fabric variants from existing fabric types
-- This will create a basic fabric variant for each fabric type
INSERT INTO public.fabric_variants (
  fabric_type_id,
  variant_name,
  width_code,
  color,
  weight,
  origin,
  unit,
  cost_price,
  selling_price,
  created_at,
  updated_at,
  manager_id,
  tenant_id
)
SELECT 
  ft.id as fabric_type_id,
  ft.name as variant_name,
  'K280' as width_code,
  'Trắng' as color,
  '200g/m²' as weight,
  'TQ' as origin,
  'kg' as unit,
  0 as cost_price,
  0 as selling_price,
  now() as created_at,
  now() as updated_at,
  ft.manager_id,
  ft.tenant_id
FROM public.fabric_types ft
WHERE NOT EXISTS (
  SELECT 1 FROM public.fabric_variants fv 
  WHERE fv.fabric_type_id = ft.id 
  AND fv.variant_name = ft.name
);