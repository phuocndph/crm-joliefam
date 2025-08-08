-- Create edge function to handle password changes and resets
-- This will be implemented as an edge function for security

-- Add a table to track password reset attempts (optional security measure)
CREATE TABLE IF NOT EXISTS public.password_reset_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  reset_type TEXT NOT NULL CHECK (reset_type IN ('admin_reset', 'manager_reset')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.password_reset_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for password reset logs
CREATE POLICY "Admins can view all password reset logs" 
ON public.password_reset_logs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins and managers can insert password reset logs" 
ON public.password_reset_logs 
FOR INSERT 
WITH CHECK (
  auth.uid() = admin_user_id AND
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
  )
);