-- Add RLS policies for managers and employees on expenses table
CREATE POLICY "Managers can insert their expenses" 
ON public.expenses 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can view their expenses" 
ON public.expenses 
FOR SELECT 
USING (has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));

CREATE POLICY "Managers can update their expenses" 
ON public.expenses 
FOR UPDATE 
USING (has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));

CREATE POLICY "Managers can delete their expenses" 
ON public.expenses 
FOR DELETE 
USING (has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));

-- Add policies for employees
CREATE POLICY "Employees can view their manager's expenses" 
ON public.expenses 
FOR SELECT 
USING (has_role(auth.uid(), 'employee'::app_role) AND (manager_id IN ( SELECT (user_roles.assigned_by)::text AS assigned_by
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role)))));

CREATE POLICY "Employees can insert their manager's expenses" 
ON public.expenses 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'employee'::app_role) AND (manager_id IN ( SELECT (user_roles.assigned_by)::text AS assigned_by
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role)))));

CREATE POLICY "Employees can update their manager's expenses" 
ON public.expenses 
FOR UPDATE 
USING (has_role(auth.uid(), 'employee'::app_role) AND (manager_id IN ( SELECT (user_roles.assigned_by)::text AS assigned_by
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role)))));

CREATE POLICY "Employees can delete their manager's expenses" 
ON public.expenses 
FOR DELETE 
USING (has_role(auth.uid(), 'employee'::app_role) AND (manager_id IN ( SELECT (user_roles.assigned_by)::text AS assigned_by
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role)))));