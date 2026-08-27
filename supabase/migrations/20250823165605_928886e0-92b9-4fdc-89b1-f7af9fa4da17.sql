-- Add RLS policy for employees to view their manager's customers
CREATE POLICY "Employees can view their manager's customers" ON public.customers
FOR SELECT USING (
  has_role(auth.uid(), 'employee'::app_role) AND 
  manager_id IN (
    SELECT (user_roles.assigned_by)::text AS assigned_by
    FROM user_roles
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'employee'::app_role
  )
);