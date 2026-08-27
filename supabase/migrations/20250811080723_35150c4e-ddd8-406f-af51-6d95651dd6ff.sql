-- Allow managers to view all GHN tracking data like admins
CREATE POLICY "Managers can view all GHN tracking data"
ON public.ghn_tracking
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

-- Allow managers to manage all GHN tracking data like admins
CREATE POLICY "Managers can update all GHN tracking data"
ON public.ghn_tracking
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can delete all GHN tracking data"  
ON public.ghn_tracking
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

-- Drop the old restrictive manager policies
DROP POLICY IF EXISTS "Managers can view their GHN tracking data" ON public.ghn_tracking;
DROP POLICY IF EXISTS "Managers can update their GHN tracking data" ON public.ghn_tracking;
DROP POLICY IF EXISTS "Managers can delete their GHN tracking data" ON public.ghn_tracking;