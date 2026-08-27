-- Check and recreate triggers for automatic manager_id assignment

-- First, check if triggers exist and drop them if they do
DROP TRIGGER IF EXISTS set_manager_id_on_customers ON public.customers;
DROP TRIGGER IF EXISTS set_manager_id_on_expenses ON public.expenses;
DROP TRIGGER IF EXISTS set_manager_id_on_transactions ON public.transactions;
DROP TRIGGER IF EXISTS set_order_manager_id_trigger ON public.orders;

-- Update the set_manager_id function with better logging
CREATE OR REPLACE FUNCTION public.set_manager_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    RAISE LOG 'set_manager_id: Manager % creating record in %', auth.uid(), TG_TABLE_NAME;
  -- If user is an employee, set manager_id to their assigned manager
  ELSIF user_role_name = 'employee' THEN
    SELECT (assigned_by)::text INTO assigned_manager_id
    FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text = 'employee'
    LIMIT 1;
    
    NEW.manager_id := assigned_manager_id;
    RAISE LOG 'set_manager_id: Employee % creating record with manager % in %', auth.uid(), assigned_manager_id, TG_TABLE_NAME;
  END IF;
  -- Admins and accountants can set any manager_id or leave it null
  
  RETURN NEW;
END;
$$;

-- Update the set_order_manager_id function with better logging
CREATE OR REPLACE FUNCTION public.set_order_manager_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    RAISE LOG 'set_order_manager_id: Manager % creating order', auth.uid();
  -- If user is an employee, set manager_id to their assigned manager
  ELSIF user_role_name = 'employee' THEN
    SELECT (assigned_by)::text INTO assigned_manager_id
    FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text = 'employee'
    LIMIT 1;
    
    NEW.manager_id := assigned_manager_id;
    RAISE LOG 'set_order_manager_id: Employee % creating order with manager %', auth.uid(), assigned_manager_id;
  END IF;
  -- Admins and accountants can set any manager_id or leave it null
  
  RETURN NEW;
END;
$$;

-- Recreate triggers on all relevant tables
CREATE TRIGGER set_manager_id_on_customers
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_manager_id();

CREATE TRIGGER set_manager_id_on_expenses
  BEFORE INSERT ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_manager_id();

CREATE TRIGGER set_manager_id_on_transactions
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_manager_id();

CREATE TRIGGER set_order_manager_id_trigger
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_manager_id();