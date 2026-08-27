-- Fix critical security issues (updated)

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

-- 3. Drop and recreate password reset log policies
DROP POLICY IF EXISTS "Admins can view all password reset logs" ON public.password_reset_logs;
DROP POLICY IF EXISTS "Managers can view their password reset logs" ON public.password_reset_logs;

-- Add RLS policies for password_reset_logs
CREATE POLICY "Admins can view all password reset logs" 
ON public.password_reset_logs 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view their password reset logs" 
ON public.password_reset_logs 
FOR SELECT 
USING (has_role(auth.uid(), 'manager'::app_role) AND admin_user_id = auth.uid());