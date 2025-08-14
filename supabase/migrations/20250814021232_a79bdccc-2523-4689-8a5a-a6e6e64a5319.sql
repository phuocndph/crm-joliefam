-- Update RLS policies for assignees to allow global access across all accounts

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Employees can view their manager's assignees" ON public.assignees;
DROP POLICY IF EXISTS "Managers can view their assignees" ON public.assignees;
DROP POLICY IF EXISTS "Managers can insert their assignees" ON public.assignees;
DROP POLICY IF EXISTS "Managers can update their assignees" ON public.assignees;
DROP POLICY IF EXISTS "Managers can delete their assignees" ON public.assignees;

-- Create new global policies for assignees
CREATE POLICY "All authenticated users can view assignees"
ON public.assignees
FOR SELECT
TO authenticated
USING (true);

-- Allow managers and admins to insert assignees (globally available)
CREATE POLICY "Managers and admins can insert assignees"
ON public.assignees
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role)
);

-- Allow managers and admins to update assignees
CREATE POLICY "Managers and admins can update assignees"
ON public.assignees
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role)
);

-- Allow managers and admins to delete assignees
CREATE POLICY "Managers and admins can delete assignees"
ON public.assignees
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role)
);