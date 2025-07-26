-- Add RLS policies for employees to insert and update transactions for their manager

-- Allow employees to insert transactions for their manager's orders
CREATE POLICY "Employees can insert their manager's transactions" 
ON public.transactions 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'employee'::app_role) AND 
  manager_id IN (
    SELECT (user_roles.assigned_by)::text AS assigned_by
    FROM user_roles
    WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'employee'::app_role
  )
);

-- Allow employees to update transactions from their manager
CREATE POLICY "Employees can update their manager's transactions" 
ON public.transactions 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'employee'::app_role) AND 
  manager_id IN (
    SELECT (user_roles.assigned_by)::text AS assigned_by
    FROM user_roles
    WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'employee'::app_role
  )
);

-- Allow employees to delete transactions from their manager
CREATE POLICY "Employees can delete their manager's transactions" 
ON public.transactions 
FOR DELETE 
USING (
  has_role(auth.uid(), 'employee'::app_role) AND 
  manager_id IN (
    SELECT (user_roles.assigned_by)::text AS assigned_by
    FROM user_roles
    WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'employee'::app_role
  )
);