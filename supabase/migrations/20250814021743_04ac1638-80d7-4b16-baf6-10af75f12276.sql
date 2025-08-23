-- Drop existing restrictive RLS policies for ghn_tracking
DROP POLICY IF EXISTS "Accountants can manage all GHN tracking data" ON public.ghn_tracking;
DROP POLICY IF EXISTS "Admins can delete all GHN tracking data" ON public.ghn_tracking;
DROP POLICY IF EXISTS "Admins can insert GHN tracking data" ON public.ghn_tracking;
DROP POLICY IF EXISTS "Admins can update all GHN tracking data" ON public.ghn_tracking;
DROP POLICY IF EXISTS "Admins can view all GHN tracking data" ON public.ghn_tracking;
DROP POLICY IF EXISTS "Employees can insert their manager's GHN tracking data" ON public.ghn_tracking;
DROP POLICY IF EXISTS "Employees can view their manager's GHN tracking data" ON public.ghn_tracking;
DROP POLICY IF EXISTS "Managers can delete all GHN tracking data" ON public.ghn_tracking;
DROP POLICY IF EXISTS "Managers can insert their GHN tracking data" ON public.ghn_tracking;
DROP POLICY IF EXISTS "Managers can update all GHN tracking data" ON public.ghn_tracking;
DROP POLICY IF EXISTS "Managers can view all GHN tracking data" ON public.ghn_tracking;

-- Create new global RLS policies for ghn_tracking
-- All authenticated users can view GHN tracking data (global sync)
CREATE POLICY "All authenticated users can view GHN tracking data"
ON public.ghn_tracking
FOR SELECT
TO authenticated
USING (true);

-- Managers and admins can insert GHN tracking data
CREATE POLICY "Managers and admins can insert GHN tracking data"
ON public.ghn_tracking
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role)
);

-- Managers and admins can update GHN tracking data
CREATE POLICY "Managers and admins can update GHN tracking data"
ON public.ghn_tracking
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role)
);

-- Managers and admins can delete GHN tracking data
CREATE POLICY "Managers and admins can delete GHN tracking data"
ON public.ghn_tracking
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role)
);

-- Accountants can manage all GHN tracking data
CREATE POLICY "Accountants can manage all GHN tracking data"
ON public.ghn_tracking
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'accountant'::app_role))
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));