-- Drop and recreate the set_manager_id function with proper search_path
DROP FUNCTION IF EXISTS public.set_manager_id() CASCADE;

CREATE OR REPLACE FUNCTION public.set_manager_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  -- If user is an employee, set manager_id to their assigned manager
  ELSIF user_role_name = 'employee' THEN
    SELECT (assigned_by)::text INTO assigned_manager_id
    FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text = 'employee'
    LIMIT 1;
    
    -- Set manager_id to the assigned manager
    NEW.manager_id := assigned_manager_id;
  END IF;
  -- Admins and accountants can set any manager_id or leave it null
  
  RETURN NEW;
END;
$$;

-- Recreate all triggers that use set_manager_id
DROP TRIGGER IF EXISTS set_manager_id_quotes ON public.quotes;
CREATE TRIGGER set_manager_id_quotes
  BEFORE INSERT ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_manager_id();

DROP TRIGGER IF EXISTS set_manager_id_customers ON public.customers;
CREATE TRIGGER set_manager_id_customers
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_manager_id();

DROP TRIGGER IF EXISTS set_manager_id_products ON public.products;
CREATE TRIGGER set_manager_id_products
  BEFORE INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_manager_id();

-- Ensure assignees is nullable to avoid issues
ALTER TABLE public.quotes ALTER COLUMN assignee_id DROP NOT NULL;

-- Update RLS policy for employees to allow insert with manager_id that will be set by trigger
DROP POLICY IF EXISTS "Employees can insert their manager's quotes" ON public.quotes;
CREATE POLICY "Employees can insert their manager's quotes"
  ON public.quotes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'employee'::app_role)
  );

COMMENT ON POLICY "Employees can insert their manager's quotes" ON public.quotes IS 
'Employees can insert quotes. The manager_id will be automatically set by the set_manager_id trigger to their assigned manager.';