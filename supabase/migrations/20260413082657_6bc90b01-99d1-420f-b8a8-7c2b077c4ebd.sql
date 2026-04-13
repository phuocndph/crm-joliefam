
-- Create shipping_companies table
CREATE TABLE public.shipping_companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  areas TEXT[] DEFAULT '{}',
  contact_person TEXT,
  notes TEXT,
  manager_id TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.shipping_companies ENABLE ROW LEVEL SECURITY;

-- RLS policies following existing pattern
CREATE POLICY "Users can view shipping companies"
ON public.shipping_companies FOR SELECT
TO authenticated
USING (
  manager_id = (auth.uid())::text
  OR public.has_role(auth.uid(), 'admin')
  OR manager_id = (
    SELECT (assigned_by)::text FROM public.user_roles
    WHERE user_id = auth.uid() LIMIT 1
  )
);

CREATE POLICY "Users can create shipping companies"
ON public.shipping_companies FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can update shipping companies"
ON public.shipping_companies FOR UPDATE
TO authenticated
USING (
  manager_id = (auth.uid())::text
  OR public.has_role(auth.uid(), 'admin')
  OR manager_id = (
    SELECT (assigned_by)::text FROM public.user_roles
    WHERE user_id = auth.uid() LIMIT 1
  )
);

CREATE POLICY "Users can delete shipping companies"
ON public.shipping_companies FOR DELETE
TO authenticated
USING (
  manager_id = (auth.uid())::text
  OR public.has_role(auth.uid(), 'admin')
  OR manager_id = (
    SELECT (assigned_by)::text FROM public.user_roles
    WHERE user_id = auth.uid() LIMIT 1
  )
);

-- Trigger for auto-setting manager_id
CREATE TRIGGER set_shipping_companies_manager_id
BEFORE INSERT ON public.shipping_companies
FOR EACH ROW
EXECUTE FUNCTION public.set_manager_id();

-- Trigger for auto-updating updated_at
CREATE TRIGGER update_shipping_companies_updated_at
BEFORE UPDATE ON public.shipping_companies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for search
CREATE INDEX idx_shipping_companies_areas ON public.shipping_companies USING GIN(areas);
CREATE INDEX idx_shipping_companies_manager ON public.shipping_companies(manager_id);
