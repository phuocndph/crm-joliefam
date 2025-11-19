-- Update set_manager_id() function to reject NULL auth
CREATE OR REPLACE FUNCTION public.set_manager_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  -- If user is an employee, set manager_id to their assigned manager
  ELSIF user_role_name = 'employee' THEN
    SELECT (assigned_by)::text INTO assigned_manager_id
    FROM public.user_roles
    WHERE user_id = current_user_id AND role::text = 'employee'
    LIMIT 1;
    
    NEW.manager_id := assigned_manager_id;
    RAISE LOG 'set_manager_id: Employee % creating record with manager % in %', 
              current_user_id, assigned_manager_id, TG_TABLE_NAME;
  END IF;
  -- Admins and accountants can set any manager_id or leave it null
  
  RETURN NEW;
END;
$function$;

-- Update set_order_manager_id() function to reject NULL auth
CREATE OR REPLACE FUNCTION public.set_order_manager_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id uuid;
  user_role_name text;
  assigned_manager_id text;
BEGIN
  -- Get current user ID
  current_user_id := auth.uid();
  
  -- CRITICAL: Reject if no authenticated user
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required. Please log in to create orders.';
  END IF;
  
  -- Get current user's role
  SELECT role::text INTO user_role_name
  FROM public.user_roles
  WHERE user_id = current_user_id
  LIMIT 1;
  
  -- If user is a manager, set manager_id to current user
  IF user_role_name = 'manager' THEN
    NEW.manager_id := (current_user_id)::text;
    RAISE LOG 'set_order_manager_id: Manager % creating order', current_user_id;
  -- If user is an employee, set manager_id to their assigned manager
  ELSIF user_role_name = 'employee' THEN
    SELECT (assigned_by)::text INTO assigned_manager_id
    FROM public.user_roles
    WHERE user_id = current_user_id AND role::text = 'employee'
    LIMIT 1;
    
    NEW.manager_id := assigned_manager_id;
    RAISE LOG 'set_order_manager_id: Employee % creating order with manager %', 
              current_user_id, assigned_manager_id;
  END IF;
  -- Admins and accountants can set any manager_id or leave it null
  
  RETURN NEW;
END;
$function$;