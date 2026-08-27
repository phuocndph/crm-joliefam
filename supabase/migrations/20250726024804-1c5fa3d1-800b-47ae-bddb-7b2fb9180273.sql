-- Add RLS policies for employees to work with orders and order_payments

-- Allow employees to update orders from their manager
CREATE POLICY "Employees can update their manager's orders" 
ON public.orders 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'employee'::app_role) AND 
  manager_id IN (
    SELECT (user_roles.assigned_by)::text AS assigned_by
    FROM user_roles
    WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'employee'::app_role
  )
);

-- Allow employees to view order_payments from their manager
CREATE POLICY "Employees can view their manager's order_payments" 
ON public.order_payments 
FOR SELECT 
USING (
  has_role(auth.uid(), 'employee'::app_role) AND 
  manager_id IN (
    SELECT (user_roles.assigned_by)::text AS assigned_by
    FROM user_roles
    WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'employee'::app_role
  )
);

-- Allow employees to insert order_payments for their manager's orders
CREATE POLICY "Employees can insert their manager's order_payments" 
ON public.order_payments 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'employee'::app_role) AND 
  manager_id IN (
    SELECT (user_roles.assigned_by)::text AS assigned_by
    FROM user_roles
    WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'employee'::app_role
  )
);

-- Allow employees to update order_payments from their manager
CREATE POLICY "Employees can update their manager's order_payments" 
ON public.order_payments 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'employee'::app_role) AND 
  manager_id IN (
    SELECT (user_roles.assigned_by)::text AS assigned_by
    FROM user_roles
    WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'employee'::app_role
  )
);

-- Allow employees to delete order_payments from their manager
CREATE POLICY "Employees can delete their manager's order_payments" 
ON public.order_payments 
FOR DELETE 
USING (
  has_role(auth.uid(), 'employee'::app_role) AND 
  manager_id IN (
    SELECT (user_roles.assigned_by)::text AS assigned_by
    FROM user_roles
    WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'employee'::app_role
  )
);