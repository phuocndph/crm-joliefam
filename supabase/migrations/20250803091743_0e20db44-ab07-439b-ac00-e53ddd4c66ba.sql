-- Create fabric types and variants tables
CREATE TABLE public.fabric_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  manager_id TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'default'
);

-- Create fabric variants table
CREATE TABLE public.fabric_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fabric_type_id UUID NOT NULL REFERENCES public.fabric_types(id) ON DELETE CASCADE,
  variant_name TEXT NOT NULL, -- trơn, sọc, ô vuông, etc.
  width_code TEXT, -- k260, k280, k305, etc.
  weight TEXT, -- 110g, 120g, etc.
  color TEXT, -- xanh than, ghi đậm, trắng, etc.
  origin TEXT, -- TQ (Trung Quốc), VN (Việt Nam)
  unit TEXT NOT NULL DEFAULT 'kg',
  cost_price NUMERIC DEFAULT 0,
  selling_price NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  manager_id TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'default'
);

-- Create warehouses table
CREATE TABLE public.warehouses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  warehouse_type TEXT NOT NULL DEFAULT 'main', -- main, branch
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  manager_id TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'default'
);

-- Create fabric inventory table
CREATE TABLE public.fabric_inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fabric_variant_id UUID NOT NULL REFERENCES public.fabric_variants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  current_stock NUMERIC NOT NULL DEFAULT 0,
  reserved_stock NUMERIC NOT NULL DEFAULT 0,
  minimum_stock NUMERIC DEFAULT 0,
  maximum_stock NUMERIC DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  manager_id TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  UNIQUE(fabric_variant_id, warehouse_id)
);

-- Create fabric transactions table
CREATE TABLE public.fabric_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fabric_variant_id UUID NOT NULL REFERENCES public.fabric_variants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL, -- inbound, outbound, transfer_in, transfer_out, adjustment
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC DEFAULT 0,
  total_amount NUMERIC DEFAULT 0,
  reference_number TEXT, -- số chứng từ
  supplier_name TEXT,
  recipient_name TEXT,
  notes TEXT,
  transaction_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  manager_id TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'default'
);

-- Create fabric transfers table
CREATE TABLE public.fabric_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fabric_variant_id UUID NOT NULL REFERENCES public.fabric_variants(id) ON DELETE CASCADE,
  from_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  to_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL,
  transfer_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_transit, completed, cancelled
  notes TEXT,
  approved_by TEXT,
  received_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  manager_id TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'default'
);

-- Enable RLS on all tables
ALTER TABLE public.fabric_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fabric_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fabric_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fabric_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fabric_transfers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for fabric_types
CREATE POLICY "Admins can manage all fabric_types" ON public.fabric_types FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Managers can manage their fabric_types" ON public.fabric_types FOR ALL USING (has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));
CREATE POLICY "Employees can view their manager's fabric_types" ON public.fabric_types FOR SELECT USING (has_role(auth.uid(), 'employee'::app_role) AND (manager_id IN (SELECT (user_roles.assigned_by)::text FROM user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role)))));

-- Create RLS policies for fabric_variants
CREATE POLICY "Admins can manage all fabric_variants" ON public.fabric_variants FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Managers can manage their fabric_variants" ON public.fabric_variants FOR ALL USING (has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));
CREATE POLICY "Employees can view their manager's fabric_variants" ON public.fabric_variants FOR SELECT USING (has_role(auth.uid(), 'employee'::app_role) AND (manager_id IN (SELECT (user_roles.assigned_by)::text FROM user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role)))));

-- Create RLS policies for warehouses
CREATE POLICY "Admins can manage all warehouses" ON public.warehouses FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Managers can manage their warehouses" ON public.warehouses FOR ALL USING (has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));
CREATE POLICY "Employees can view their manager's warehouses" ON public.warehouses FOR SELECT USING (has_role(auth.uid(), 'employee'::app_role) AND (manager_id IN (SELECT (user_roles.assigned_by)::text FROM user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role)))));

-- Create RLS policies for fabric_inventory
CREATE POLICY "Admins can manage all fabric_inventory" ON public.fabric_inventory FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Managers can manage their fabric_inventory" ON public.fabric_inventory FOR ALL USING (has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));
CREATE POLICY "Employees can view their manager's fabric_inventory" ON public.fabric_inventory FOR SELECT USING (has_role(auth.uid(), 'employee'::app_role) AND (manager_id IN (SELECT (user_roles.assigned_by)::text FROM user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role)))));

-- Create RLS policies for fabric_transactions
CREATE POLICY "Admins can manage all fabric_transactions" ON public.fabric_transactions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Managers can manage their fabric_transactions" ON public.fabric_transactions FOR ALL USING (has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));
CREATE POLICY "Employees can manage their manager's fabric_transactions" ON public.fabric_transactions FOR ALL USING (has_role(auth.uid(), 'employee'::app_role) AND (manager_id IN (SELECT (user_roles.assigned_by)::text FROM user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role)))));

-- Create RLS policies for fabric_transfers
CREATE POLICY "Admins can manage all fabric_transfers" ON public.fabric_transfers FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Managers can manage their fabric_transfers" ON public.fabric_transfers FOR ALL USING (has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));
CREATE POLICY "Employees can manage their manager's fabric_transfers" ON public.fabric_transfers FOR ALL USING (has_role(auth.uid(), 'employee'::app_role) AND (manager_id IN (SELECT (user_roles.assigned_by)::text FROM user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role)))));

-- Create triggers for updated_at
CREATE TRIGGER update_fabric_types_updated_at BEFORE UPDATE ON public.fabric_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_fabric_variants_updated_at BEFORE UPDATE ON public.fabric_variants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_warehouses_updated_at BEFORE UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_fabric_inventory_updated_at BEFORE UPDATE ON public.fabric_inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_fabric_transactions_updated_at BEFORE UPDATE ON public.fabric_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_fabric_transfers_updated_at BEFORE UPDATE ON public.fabric_transfers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger to set manager_id automatically
CREATE TRIGGER set_fabric_types_manager_id BEFORE INSERT ON public.fabric_types FOR EACH ROW EXECUTE FUNCTION public.set_manager_id();
CREATE TRIGGER set_fabric_variants_manager_id BEFORE INSERT ON public.fabric_variants FOR EACH ROW EXECUTE FUNCTION public.set_manager_id();
CREATE TRIGGER set_warehouses_manager_id BEFORE INSERT ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.set_manager_id();
CREATE TRIGGER set_fabric_inventory_manager_id BEFORE INSERT ON public.fabric_inventory FOR EACH ROW EXECUTE FUNCTION public.set_manager_id();
CREATE TRIGGER set_fabric_transactions_manager_id BEFORE INSERT ON public.fabric_transactions FOR EACH ROW EXECUTE FUNCTION public.set_manager_id();
CREATE TRIGGER set_fabric_transfers_manager_id BEFORE INSERT ON public.fabric_transfers FOR EACH ROW EXECUTE FUNCTION public.set_manager_id();

-- Insert initial warehouses
INSERT INTO public.warehouses (name, address, warehouse_type) VALUES 
('Kho Hà Nội', 'Hà Nội', 'main'),
('Kho Bắc Ninh', 'Bắc Ninh', 'branch');

-- Insert initial fabric types based on the image data
INSERT INTO public.fabric_types (name, description) VALUES 
('T233', 'Vải T233'),
('T200', 'Vải T200'),
('T250', 'Vải T250'),
('T260', 'Vải T260'),
('T300', 'Vải T300'),
('T400', 'Vải T400'),
('T600', 'Vải T600'),
('LTH', 'Vải lth (cotton)'),
('Chống thấm', 'Vải chống thấm'),
('110g', 'Vải 110g'),
('120g', 'Vải 120g');