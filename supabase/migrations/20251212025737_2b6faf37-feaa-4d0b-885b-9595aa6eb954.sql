-- Update the set_manager_id function to handle accountants the same as employees
CREATE OR REPLACE FUNCTION public.set_manager_id()
RETURNS TRIGGER AS $$
DECLARE
  current_user_id uuid;
  user_role_name text;
  assigned_manager_id text;
BEGIN
  -- Get current user ID
  current_user_id := auth.uid();
  
  -- CRITICAL: Reject if no authenticated user
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required. Please log in to create records.';
  END IF;
  
  -- Get current user's role
  SELECT role::text INTO user_role_name
  FROM public.user_roles
  WHERE user_id = current_user_id
  LIMIT 1;
  
  -- If user is a manager, set manager_id to current user
  IF user_role_name = 'manager' THEN
    NEW.manager_id := (current_user_id)::text;
    RAISE LOG 'set_manager_id: Manager % creating record in %', current_user_id, TG_TABLE_NAME;
  -- If user is an employee or accountant, set manager_id to their assigned manager
  ELSIF user_role_name = 'employee' OR user_role_name = 'accountant' THEN
    SELECT (assigned_by)::text INTO assigned_manager_id
    FROM public.user_roles
    WHERE user_id = current_user_id AND (role::text = 'employee' OR role::text = 'accountant')
    LIMIT 1;
    
    NEW.manager_id := assigned_manager_id;
    RAISE LOG 'set_manager_id: %s % creating record with manager % in %', 
              user_role_name, current_user_id, assigned_manager_id, TG_TABLE_NAME;
  END IF;
  -- Admins can set any manager_id or leave it null
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update accountant to have assigned_by set to the manager
UPDATE public.user_roles 
SET assigned_by = '6a1faecc-8571-46ca-a035-01efe09c919b'
WHERE user_id = '4b2f1f05-235d-4032-9209-6bcedb4fb8e1' AND role = 'accountant';

-- Fix existing fabric_transactions to have correct manager_id
UPDATE public.fabric_transactions 
SET manager_id = '6a1faecc-8571-46ca-a035-01efe09c919b'
WHERE manager_id = '4b2f1f05-235d-4032-9209-6bcedb4fb8e1';

-- Fix existing fabric_inventory to have correct manager_id  
UPDATE public.fabric_inventory 
SET manager_id = '6a1faecc-8571-46ca-a035-01efe09c919b'
WHERE manager_id = '4b2f1f05-235d-4032-9209-6bcedb4fb8e1';