-- Create a table for fabric widths
CREATE TABLE public.fabric_widths (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  width_code TEXT NOT NULL,
  description TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  manager_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT fabric_widths_width_code_unique UNIQUE (width_code, tenant_id)
);

-- Enable RLS on fabric_widths table
ALTER TABLE public.fabric_widths ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for fabric_widths
CREATE POLICY "Admins can manage all fabric_widths" 
ON public.fabric_widths 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can manage their fabric_widths" 
ON public.fabric_widths 
FOR ALL 
USING (has_role(auth.uid(), 'manager'::app_role) AND (manager_id = auth.uid()::text OR manager_id IS NULL));

CREATE POLICY "Employees can view their manager's fabric_widths" 
ON public.fabric_widths 
FOR SELECT 
USING (has_role(auth.uid(), 'employee'::app_role) AND manager_id IN (
  SELECT assigned_by::text 
  FROM user_roles 
  WHERE user_id = auth.uid() AND role = 'employee'::app_role
));

-- Insert fabric widths from the provided list
INSERT INTO public.fabric_widths (width_code, description) VALUES
('K240', 'Khổ vải 240'),
('K260', 'Khổ vải 260'),
('K280', 'Khổ vải 280'),
('K305', 'Khổ vải 305');

-- Create trigger for updated_at
CREATE TRIGGER update_fabric_widths_updated_at
BEFORE UPDATE ON public.fabric_widths
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Update the fabric_variants table to reference fabric_widths
ALTER TABLE public.fabric_variants 
ADD COLUMN IF NOT EXISTS fabric_width_id UUID REFERENCES public.fabric_widths(id);

-- Create an index for better performance
CREATE INDEX IF NOT EXISTS idx_fabric_variants_fabric_width_id ON public.fabric_variants(fabric_width_id);