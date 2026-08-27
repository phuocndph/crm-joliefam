
-- Create contract_templates table
CREATE TABLE public.contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_basis jsonb DEFAULT '["Căn cứ Luật Thương mại số 36/2005/QH11 ngày 14/06/2005;", "Căn cứ Bộ luật Dân sự số 91/2015/QH13 ngày 24/11/2015;", "Căn cứ vào nhu cầu và khả năng của hai bên."]'::jsonb,
  seller_info jsonb DEFAULT '{}'::jsonb,
  item_columns jsonb DEFAULT '[{"key":"name","label":"Tên sản phẩm"},{"key":"specifications","label":"Kích thước/ Quy cách"},{"key":"quantity","label":"SL"},{"key":"price","label":"Đơn giá"},{"key":"total","label":"Thành tiền"}]'::jsonb,
  articles jsonb DEFAULT '[]'::jsonb,
  include_vat boolean DEFAULT false,
  vat_rate numeric DEFAULT 8,
  payment_terms jsonb DEFAULT '{"deposit_percentage":70,"payment_stages":[{"name":"Đợt 1 (Đặt cọc)","percentage":70,"description":"Thanh toán khi ký hợp đồng"},{"name":"Đợt 2 (Còn lại)","percentage":30,"description":"Thanh toán khi hoàn thành lắp đặt"}]}'::jsonb,
  manager_id text,
  tenant_id text NOT NULL DEFAULT 'default'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as contracts)
CREATE POLICY "Admins can manage all contract_templates" ON public.contract_templates FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Managers can manage their contract_templates" ON public.contract_templates FOR ALL TO public USING (has_role(auth.uid(), 'manager'::app_role) AND (manager_id = (auth.uid())::text OR manager_id IS NULL)) WITH CHECK (has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "Employees can view contract_templates" ON public.contract_templates FOR SELECT TO authenticated USING (has_role(auth.uid(), 'employee'::app_role) AND manager_id IN (SELECT (assigned_by)::text FROM user_roles WHERE user_id = auth.uid() AND role = 'employee'::app_role));
CREATE POLICY "Accountants can view contract_templates" ON public.contract_templates FOR SELECT TO authenticated USING (has_role(auth.uid(), 'accountant'::app_role));

-- Triggers
CREATE TRIGGER set_contract_templates_manager_id BEFORE INSERT ON public.contract_templates FOR EACH ROW EXECUTE FUNCTION set_manager_id();
CREATE TRIGGER update_contract_templates_updated_at BEFORE UPDATE ON public.contract_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add template_id to contracts table
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.contract_templates(id);
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS legal_basis jsonb;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS seller_info jsonb;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS buyer_info jsonb;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS articles jsonb;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS include_vat boolean DEFAULT false;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 8;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS subtotal numeric;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS vat_amount numeric;
