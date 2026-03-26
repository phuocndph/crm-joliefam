
-- Bảng einvoices lưu lịch sử hoá đơn điện tử
CREATE TABLE public.einvoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  transaction_uuid TEXT,
  invoice_number TEXT,
  invoice_type TEXT DEFAULT '01GTKT',
  template_code TEXT,
  invoice_series TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  issued_date TIMESTAMPTZ,
  total_amount NUMERIC,
  vat_amount NUMERIC,
  total_with_vat NUMERIC,
  buyer_name TEXT,
  buyer_tax_code TEXT,
  response_data JSONB,
  request_data JSONB,
  manager_id TEXT,
  tenant_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.einvoices ENABLE ROW LEVEL SECURITY;

-- Trigger set_manager_id
CREATE TRIGGER set_einvoices_manager_id
  BEFORE INSERT ON public.einvoices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_manager_id();

-- Trigger updated_at
CREATE TRIGGER update_einvoices_updated_at
  BEFORE UPDATE ON public.einvoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS policies (same pattern as contracts)
CREATE POLICY "Admin full access on einvoices"
  ON public.einvoices FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Manager access own einvoices"
  ON public.einvoices FOR ALL
  TO authenticated
  USING (manager_id = (auth.uid())::text)
  WITH CHECK (manager_id = (auth.uid())::text);

CREATE POLICY "Employee read einvoices"
  ON public.einvoices FOR SELECT
  TO authenticated
  USING (
    manager_id = (
      SELECT (assigned_by)::text FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('employee', 'accountant')
      LIMIT 1
    )
  );
