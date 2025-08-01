-- Fix RLS policy for expenses table INSERT
DROP POLICY IF EXISTS "Admins can insert expenses" ON public.expenses;

-- Create new INSERT policy with proper WITH CHECK condition  
CREATE POLICY "Admins can insert expenses" 
ON public.expenses 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));