-- Create employee permissions table to manage what sections employees can access
CREATE TABLE public.employee_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_type TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, permission_type)
);

-- Enable RLS
ALTER TABLE public.employee_permissions ENABLE ROW LEVEL SECURITY;

-- Create policies for employee_permissions
CREATE POLICY "Admins can view all employee permissions"
  ON public.employee_permissions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view their employees permissions"
  ON public.employee_permissions FOR SELECT
  USING (
    has_role(auth.uid(), 'manager'::app_role) AND
    user_id IN (
      SELECT ur.user_id 
      FROM user_roles ur 
      WHERE ur.role = 'employee'::app_role 
      AND ur.assigned_by = auth.uid()
    )
  );

CREATE POLICY "Employees can view their own permissions"
  ON public.employee_permissions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can insert employee permissions"
  ON public.employee_permissions FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can insert permissions for their employees"
  ON public.employee_permissions FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'manager'::app_role) AND
    user_id IN (
      SELECT ur.user_id 
      FROM user_roles ur 
      WHERE ur.role = 'employee'::app_role 
      AND ur.assigned_by = auth.uid()
    )
  );

CREATE POLICY "Admins can update employee permissions"
  ON public.employee_permissions FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can update permissions for their employees"
  ON public.employee_permissions FOR UPDATE
  USING (
    has_role(auth.uid(), 'manager'::app_role) AND
    user_id IN (
      SELECT ur.user_id 
      FROM user_roles ur 
      WHERE ur.role = 'employee'::app_role 
      AND ur.assigned_by = auth.uid()
    )
  );

CREATE POLICY "Admins can delete employee permissions"
  ON public.employee_permissions FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can delete permissions for their employees"
  ON public.employee_permissions FOR DELETE
  USING (
    has_role(auth.uid(), 'manager'::app_role) AND
    user_id IN (
      SELECT ur.user_id 
      FROM user_roles ur 
      WHERE ur.role = 'employee'::app_role 
      AND ur.assigned_by = auth.uid()
    )
  );

-- Add trigger for updated_at
CREATE TRIGGER update_employee_permissions_updated_at
  BEFORE UPDATE ON public.employee_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default permission types
INSERT INTO public.employee_permissions (user_id, permission_type, enabled, created_by)
SELECT 
  ur.user_id,
  permission_type,
  false,
  ur.assigned_by
FROM user_roles ur
CROSS JOIN (
  VALUES 
    ('dashboard'),
    ('customers'), 
    ('products'),
    ('quotes'),
    ('orders'),
    ('cash_flow'),
    ('transactions'),
    ('reports'),
    ('user_management'),
    ('quote_supplement')
) AS permissions(permission_type)
WHERE ur.role = 'employee'::app_role
ON CONFLICT (user_id, permission_type) DO NOTHING;