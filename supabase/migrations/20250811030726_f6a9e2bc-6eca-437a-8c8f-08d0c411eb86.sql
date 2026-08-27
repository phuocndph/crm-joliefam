-- Fix the manager_id data in orders table first
-- Update orders without manager_id to use the creating user's manager_id
UPDATE public.orders 
SET manager_id = (
  SELECT (auth.uid())::text 
  FROM user_roles 
  WHERE user_id = '0a1026f0-5c35-4b20-ae9f-0688b0df4ee4' -- admin5@company.com
  LIMIT 1
)
WHERE order_number = 'ORD-1754827255005';

UPDATE public.orders 
SET manager_id = (
  SELECT (auth.uid())::text 
  FROM user_roles 
  WHERE user_id = '03b5e832-1840-4056-b16c-d5aa8976705b' -- admin6@company.com  
  LIMIT 1
)
WHERE order_number = 'ORD-1754841712246';

-- Update the recent order to have a manager_id
UPDATE public.orders 
SET manager_id = '0a1026f0-5c35-4b20-ae9f-0688b0df4ee4'
WHERE order_number = 'ORD-1754877222922';

-- Now update the RLS policies to automatically set manager_id on insert
-- Drop the existing insert policies and recreate them with better logic

DROP POLICY IF EXISTS "Admins can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Managers can insert their orders only" ON public.orders;

-- Admins can insert any orders (no manager_id constraint)
CREATE POLICY "Admins can insert orders" 
ON public.orders 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Managers can insert orders but manager_id must be set to their own ID
CREATE POLICY "Managers can insert their orders only" 
ON public.orders 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role) 
  AND (manager_id IS NULL OR manager_id = (auth.uid())::text)
);

-- Create a trigger to automatically set manager_id for managers and employees
CREATE OR REPLACE FUNCTION public.set_order_manager_id()
RETURNS TRIGGER AS $$
DECLARE
  user_role_name text;
  assigned_manager_id text;
BEGIN
  -- Get current user's role
  SELECT role::text INTO user_role_name
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  -- If user is a manager, set manager_id to current user
  IF user_role_name = 'manager' THEN
    NEW.manager_id := (auth.uid())::text;
  -- If user is an employee, set manager_id to their assigned manager
  ELSIF user_role_name = 'employee' THEN
    SELECT (assigned_by)::text INTO assigned_manager_id
    FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text = 'employee'
    LIMIT 1;
    NEW.manager_id := assigned_manager_id;
  END IF;
  -- Admins and accountants can set any manager_id or leave it null
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for orders
DROP TRIGGER IF EXISTS set_order_manager_id_trigger ON public.orders;
CREATE TRIGGER set_order_manager_id_trigger
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_manager_id();