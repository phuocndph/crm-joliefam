-- Create table for GHN tracking data
CREATE TABLE public.ghn_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  ghn_order_code TEXT NOT NULL,
  ghn_status TEXT,
  ghn_status_text TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  package_weight NUMERIC,
  created_date TIMESTAMP WITH TIME ZONE,
  expected_delivery_date TIMESTAMP WITH TIME ZONE,
  delivered_date TIMESTAMP WITH TIME ZONE,
  cod_amount NUMERIC DEFAULT 0,
  tracking_url TEXT,
  raw_data JSONB,
  manager_id TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(ghn_order_code)
);

-- Enable RLS
ALTER TABLE public.ghn_tracking ENABLE ROW LEVEL SECURITY;

-- Create policies for ghn_tracking
CREATE POLICY "Admins can view all GHN tracking data" 
ON public.ghn_tracking 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert GHN tracking data" 
ON public.ghn_tracking 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all GHN tracking data" 
ON public.ghn_tracking 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete all GHN tracking data" 
ON public.ghn_tracking 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view their GHN tracking data" 
ON public.ghn_tracking 
FOR SELECT 
USING (has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));

CREATE POLICY "Managers can insert their GHN tracking data" 
ON public.ghn_tracking 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can update their GHN tracking data" 
ON public.ghn_tracking 
FOR UPDATE 
USING (has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));

CREATE POLICY "Managers can delete their GHN tracking data" 
ON public.ghn_tracking 
FOR DELETE 
USING (has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));

CREATE POLICY "Employees can view their manager's GHN tracking data" 
ON public.ghn_tracking 
FOR SELECT 
USING (has_role(auth.uid(), 'employee'::app_role) AND (manager_id IN ( SELECT (user_roles.assigned_by)::text AS assigned_by
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role)))));

-- Create trigger for updated_at
CREATE TRIGGER update_ghn_tracking_updated_at
BEFORE UPDATE ON public.ghn_tracking
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();