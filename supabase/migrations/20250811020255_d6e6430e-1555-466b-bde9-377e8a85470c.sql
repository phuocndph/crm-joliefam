-- Check current RLS policies for orders table
-- First, let's update the orders RLS policies to be more strict

-- Drop existing policies
DROP POLICY IF EXISTS "Accountants can manage all orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can delete all orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update all orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Employees can update their manager's orders" ON public.orders;
DROP POLICY IF EXISTS "Employees can view their manager's orders" ON public.orders;
DROP POLICY IF EXISTS "Managers can delete their orders only" ON public.orders;
DROP POLICY IF EXISTS "Managers can insert their orders only" ON public.orders;
DROP POLICY IF EXISTS "Managers can update their orders only" ON public.orders;
DROP POLICY IF EXISTS "Managers can view their orders only" ON public.orders;

-- Create new strict policies for orders table
-- Only admins can see all orders
CREATE POLICY "Admins can view all orders" 
ON public.orders 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert orders" 
ON public.orders 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all orders" 
ON public.orders 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete all orders" 
ON public.orders 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Accountants can manage all orders
CREATE POLICY "Accountants can manage all orders" 
ON public.orders 
FOR ALL 
USING (has_role(auth.uid(), 'accountant'::app_role))
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));

-- Managers can only see/manage their own orders
CREATE POLICY "Managers can view their orders only" 
ON public.orders 
FOR SELECT 
USING (
  has_role(auth.uid(), 'manager'::app_role) 
  AND manager_id = (auth.uid())::text
);

CREATE POLICY "Managers can insert their orders only" 
ON public.orders 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role) 
  AND manager_id = (auth.uid())::text
);

CREATE POLICY "Managers can update their orders only" 
ON public.orders 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'manager'::app_role) 
  AND manager_id = (auth.uid())::text
);

CREATE POLICY "Managers can delete their orders only" 
ON public.orders 
FOR DELETE 
USING (
  has_role(auth.uid(), 'manager'::app_role) 
  AND manager_id = (auth.uid())::text
);

-- Employees can view and update orders of their assigned manager
CREATE POLICY "Employees can view their manager's orders" 
ON public.orders 
FOR SELECT 
USING (
  has_role(auth.uid(), 'employee'::app_role) 
  AND manager_id IN (
    SELECT (assigned_by)::text 
    FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'employee'::app_role
  )
);

CREATE POLICY "Employees can update their manager's orders" 
ON public.orders 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'employee'::app_role) 
  AND manager_id IN (
    SELECT (assigned_by)::text 
    FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'employee'::app_role
  )
);