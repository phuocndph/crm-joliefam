
-- Create contracts table
CREATE TABLE public.contracts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_number text NOT NULL,
  customer_id uuid REFERENCES public.customers(id),
  order_id uuid REFERENCES public.orders(id),
  quote_id uuid REFERENCES public.quotes(id),
  title text NOT NULL DEFAULT '',
  content text,
  total_amount numeric DEFAULT 0,
  deposit_amount numeric DEFAULT 0,
  deposit_percentage numeric DEFAULT 70,
  status text NOT NULL DEFAULT 'draft',
  contract_date timestamptz DEFAULT now(),
  start_date timestamptz,
  end_date timestamptz,
  items jsonb,
  terms jsonb DEFAULT '["Đặt cọc 70% giá trị hợp đồng khi ký.", "Thanh toán 30% còn lại khi hoàn thành lắp đặt.", "Bảo hành sản phẩm 24 tháng.", "Hợp đồng có hiệu lực kể từ ngày ký."]'::jsonb,
  notes text,
  manager_id text,
  tenant_id text NOT NULL DEFAULT 'default',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create contract_template_settings table
CREATE TABLE public.contract_template_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name text DEFAULT 'CÔNG TY TNHH NỘI THẤT REMY',
  company_title text DEFAULT 'Showroom Rèm Cao Cấp Remy - Uy Tín & Chất Lượng',
  address text DEFAULT 'BT06-22 Khu đô thị An Vượng Villa, Dương Nội, Hà Đông, Hà Nội',
  phone text DEFAULT '096.866.06.06',
  tax_code text DEFAULT '0110184566',
  headquarters text DEFAULT 'Số 1 Ngõ 54 Ngọc Hồi, Hoàng Liệt, Hoàng Mai, Hà Nội',
  bank_info text DEFAULT 'STK: 0021000410845 VIETCOMBANK - ĐÀO THỊ TRÀ MY (Chi Nhánh TT)',
  logo_url text,
  default_terms jsonb DEFAULT '["Đặt cọc 70% giá trị hợp đồng khi ký.", "Thanh toán 30% còn lại khi hoàn thành lắp đặt.", "Bảo hành sản phẩm 24 tháng.", "Hợp đồng có hiệu lực kể từ ngày ký."]'::jsonb,
  footer_note text DEFAULT 'Cảm ơn Quý khách đã tin tưởng sử dụng dịch vụ của chúng tôi!',
  tenant_id text DEFAULT 'default',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_template_settings ENABLE ROW LEVEL SECURITY;

-- Contracts RLS policies (same RBAC pattern as orders)
CREATE POLICY "Admins can manage all contracts" ON public.contracts FOR ALL TO public USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can manage their contracts" ON public.contracts FOR ALL TO public USING (has_role(auth.uid(), 'manager') AND (manager_id = (auth.uid())::text)) WITH CHECK (has_role(auth.uid(), 'manager') AND (manager_id = (auth.uid())::text));

CREATE POLICY "Employees can view their manager contracts" ON public.contracts FOR SELECT TO public USING (has_role(auth.uid(), 'employee') AND manager_id IN (SELECT (assigned_by)::text FROM user_roles WHERE user_id = auth.uid() AND role = 'employee'));

CREATE POLICY "Employees can insert contracts" ON public.contracts FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'employee') AND manager_id IN (SELECT (assigned_by)::text FROM user_roles WHERE user_id = auth.uid() AND role = 'employee'));

CREATE POLICY "Employees can update their manager contracts" ON public.contracts FOR UPDATE TO public USING (has_role(auth.uid(), 'employee') AND manager_id IN (SELECT (assigned_by)::text FROM user_roles WHERE user_id = auth.uid() AND role = 'employee'));

CREATE POLICY "Employees can delete their manager contracts" ON public.contracts FOR DELETE TO authenticated USING (has_role(auth.uid(), 'employee') AND manager_id IN (SELECT (assigned_by)::text FROM user_roles WHERE user_id = auth.uid() AND role = 'employee'));

CREATE POLICY "Accountants can manage all contracts" ON public.contracts FOR ALL TO authenticated USING (has_role(auth.uid(), 'accountant')) WITH CHECK (has_role(auth.uid(), 'accountant'));

-- Contract template settings RLS
CREATE POLICY "Users can view contract template settings" ON public.contract_template_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can insert contract template settings" ON public.contract_template_settings FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager')));

CREATE POLICY "Managers can update contract template settings" ON public.contract_template_settings FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager')));

-- Add set_manager_id trigger for contracts
CREATE TRIGGER set_contracts_manager_id BEFORE INSERT ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.set_manager_id();

-- Add updated_at trigger
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contract_template_settings_updated_at BEFORE UPDATE ON public.contract_template_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
