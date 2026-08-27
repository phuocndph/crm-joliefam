-- Ensure manager_id is properly set for role-based data separation

-- Update function to auto-assign manager_id when creating records
CREATE OR REPLACE FUNCTION public.set_manager_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_role_name text;
BEGIN
  -- Get current user's role
  SELECT role::text INTO user_role_name
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  -- If user is a manager or employee, set manager_id to current user for managers, 
  -- or to their assigned manager for employees
  IF user_role_name = 'manager' THEN
    NEW.manager_id := auth.uid()::text;
  ELSIF user_role_name = 'employee' THEN
    -- Get the employee's assigned manager
    SELECT assigned_by::text INTO NEW.manager_id
    FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text = 'employee'
    LIMIT 1;
  END IF;
  -- Admins can see all data, so we don't set manager_id for them
  
  RETURN NEW;
END;
$$;

-- Add triggers to automatically set manager_id on INSERT
CREATE TRIGGER set_manager_id_customers
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_manager_id();

CREATE TRIGGER set_manager_id_orders
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_manager_id();

CREATE TRIGGER set_manager_id_quotes
  BEFORE INSERT ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_manager_id();

CREATE TRIGGER set_manager_id_products
  BEFORE INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_manager_id();

CREATE TRIGGER set_manager_id_finance_data
  BEFORE INSERT ON public.finance_data
  FOR EACH ROW
  EXECUTE FUNCTION public.set_manager_id();

CREATE TRIGGER set_manager_id_transactions
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_manager_id();

CREATE TRIGGER set_manager_id_order_payments
  BEFORE INSERT ON public.order_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_manager_id();

-- Update existing data to have proper manager_id based on user roles
-- For now, we'll set all existing data to be managed by the first admin user
-- In production, you should assign data to specific managers

DO $$
DECLARE
  first_admin_id uuid;
BEGIN
  -- Get the first admin user
  SELECT user_id INTO first_admin_id
  FROM public.user_roles
  WHERE role::text = 'admin'
  ORDER BY created_at
  LIMIT 1;
  
  -- Update existing records that don't have manager_id set
  IF first_admin_id IS NOT NULL THEN
    UPDATE public.customers 
    SET manager_id = first_admin_id::text 
    WHERE manager_id IS NULL;
    
    UPDATE public.orders 
    SET manager_id = first_admin_id::text 
    WHERE manager_id IS NULL;
    
    UPDATE public.quotes 
    SET manager_id = first_admin_id::text 
    WHERE manager_id IS NULL;
    
    UPDATE public.products 
    SET manager_id = first_admin_id::text 
    WHERE manager_id IS NULL;
    
    UPDATE public.finance_data 
    SET manager_id = first_admin_id::text 
    WHERE manager_id IS NULL;
    
    UPDATE public.transactions 
    SET manager_id = first_admin_id::text 
    WHERE manager_id IS NULL;
    
    UPDATE public.order_payments 
    SET manager_id = first_admin_id::text 
    WHERE manager_id IS NULL;
  END IF;
END $$;