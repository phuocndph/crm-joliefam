-- Create fabric usage table to track fabric consumption by orders
CREATE TABLE public.fabric_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL,
  fabric_variant_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  quantity_used numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'kg',
  usage_date timestamp with time zone NOT NULL DEFAULT now(),
  notes text,
  customer_name text,
  customer_code text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  tenant_id text NOT NULL DEFAULT 'default'::text,
  manager_id text
);

-- Enable RLS
ALTER TABLE public.fabric_usage ENABLE ROW LEVEL SECURITY;

-- Create policies for fabric_usage
CREATE POLICY "Admins can manage all fabric_usage" 
ON public.fabric_usage 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can manage their fabric_usage" 
ON public.fabric_usage 
FOR ALL 
USING (has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));

CREATE POLICY "Employees can manage their manager's fabric_usage" 
ON public.fabric_usage 
FOR ALL 
USING (has_role(auth.uid(), 'employee'::app_role) AND (manager_id IN ( 
  SELECT (user_roles.assigned_by)::text AS assigned_by
  FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role))
)));

-- Create trigger to set manager_id
CREATE TRIGGER set_manager_id_fabric_usage
  BEFORE INSERT ON public.fabric_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.set_manager_id();

-- Create trigger for updated_at
CREATE TRIGGER update_fabric_usage_updated_at
  BEFORE UPDATE ON public.fabric_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add sample fabric usage data
INSERT INTO public.fabric_usage (
  order_id, 
  fabric_variant_id, 
  warehouse_id, 
  quantity_used, 
  customer_name, 
  customer_code,
  usage_date,
  notes
) 
SELECT 
  gen_random_uuid(), -- order_id (placeholder)
  fv.id,
  fi.warehouse_id,
  CASE 
    WHEN random() < 0.3 THEN 15 + random() * 10  -- 15-25kg
    WHEN random() < 0.6 THEN 25 + random() * 15  -- 25-40kg  
    ELSE 40 + random() * 20  -- 40-60kg
  END,
  CASE (random() * 5)::int
    WHEN 0 THEN 'Công ty TNHH May Minh Đức'
    WHEN 1 THEN 'Xưởng May Thanh Xuân'
    WHEN 2 THEN 'Công ty CP Dệt May Hà Nội'
    WHEN 3 THEN 'Xí nghiệp May Bắc Ninh'
    ELSE 'Công ty TNHH May Việt Nam'
  END,
  'KH' || LPAD((random() * 9999)::int::text, 4, '0'),
  now() - (random() * 30)::int * interval '1 day',
  CASE (random() * 4)::int
    WHEN 0 THEN 'Sản xuất chăn ga gối đơn'
    WHEN 1 THEN 'Đơn hàng xuất khẩu'
    WHEN 2 THEN 'Sản xuất nệm bông'
    ELSE 'Đơn hàng nội địa'
  END
FROM fabric_variants fv
JOIN fabric_inventory fi ON fv.id = fi.fabric_variant_id
WHERE fi.current_stock > 0
LIMIT 20;

-- Update fabric usage with proper order numbers
UPDATE public.fabric_usage 
SET order_id = (
  CASE 
    WHEN customer_code LIKE 'KH00%' THEN gen_random_uuid()
    ELSE gen_random_uuid()
  END
);

-- Add order numbers as text field for display
ALTER TABLE public.fabric_usage ADD COLUMN order_number text;

UPDATE public.fabric_usage 
SET order_number = 'DH' || LPAD((1000 + (random() * 8999)::int)::text, 4, '0');