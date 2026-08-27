-- Update the set_manager_id function to preserve assignee_id
CREATE OR REPLACE FUNCTION public.set_manager_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  user_role_name text;
BEGIN
  -- Get current user's role
  SELECT role::text INTO user_role_name
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  -- Only set manager_id, preserve assignee_id
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
  
  -- IMPORTANT: Don't modify assignee_id - let it be set by the application
  
  RETURN NEW;
END;
$function$;