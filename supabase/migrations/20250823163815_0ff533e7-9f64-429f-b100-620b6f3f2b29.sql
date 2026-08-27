-- Fix critical security issues

-- 1. Create password_reset_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.password_reset_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  reset_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on password_reset_logs
ALTER TABLE public.password_reset_logs ENABLE ROW LEVEL SECURITY;

-- 2. Fix overly permissive customer RLS policies
-- Remove the problematic "All authenticated users" policies
DROP POLICY IF EXISTS "All authenticated users can insert customers" ON public.customers;
DROP POLICY IF EXISTS "All authenticated users can update customers" ON public.customers;
DROP POLICY IF EXISTS "All authenticated users can view customers" ON public.customers;

-- 3. Update all database functions to use proper security settings
-- Update update_customer_stats function
CREATE OR REPLACE FUNCTION public.update_customer_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  -- Update customer purchase stats when order is completed
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
    UPDATE public.customers 
    SET 
      purchase_count = purchase_count + 1,
      last_purchase_date = NEW.updated_at,
      total_spent = total_spent + COALESCE(NEW.total_amount, 0)
    WHERE id = NEW.customer_id;
    
    -- Update auto tags based on purchase count
    UPDATE public.customers 
    SET auto_tags = 
      CASE 
        WHEN purchase_count = 1 THEN ARRAY['Đã Mua']
        WHEN purchase_count = 2 THEN ARRAY['Đã Mua lần 2']
        WHEN purchase_count = 3 THEN ARRAY['Đã Mua lần 3']
        WHEN purchase_count > 3 THEN ARRAY['KHTT']
        ELSE auto_tags
      END
    WHERE id = NEW.customer_id;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Update calculate_order_profit function
CREATE OR REPLACE FUNCTION public.calculate_order_profit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  -- Calculate profit when order is updated
  NEW.profit_before = COALESCE(NEW.total_amount, 0) - COALESCE(NEW.cost_price, 0);
  
  -- For profit after, we'll subtract a percentage of expenses (simplified)
  NEW.profit_after = NEW.profit_before - (COALESCE(NEW.cost_price, 0) * 0.1);
  
  RETURN NEW;
END;
$function$;

-- Update set_order_manager_id function
CREATE OR REPLACE FUNCTION public.set_order_manager_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
$function$;

-- Update set_manager_id function
CREATE OR REPLACE FUNCTION public.set_manager_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
$function$;

-- 4. Add RLS policies for password_reset_logs
CREATE POLICY "Admins can view all password reset logs" 
ON public.password_reset_logs 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view their password reset logs" 
ON public.password_reset_logs 
FOR SELECT 
USING (has_role(auth.uid(), 'manager'::app_role) AND admin_user_id = auth.uid());

-- 5. Create secure password verification function
CREATE OR REPLACE FUNCTION public.verify_user_password(_user_id uuid, _password text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  stored_hash text;
BEGIN
  -- This is a placeholder function since Supabase doesn't expose password hashes
  -- In a real implementation, you would check against stored password hashes
  -- For now, we'll return false as we can't securely verify passwords this way
  RETURN false;
END;
$function$;