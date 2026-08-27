-- Add additional RLS policies for better security

-- Policy to prevent users from updating their own roles
CREATE POLICY "Users cannot update their own roles"
ON public.user_roles
FOR UPDATE
USING (auth.uid() != user_id);

-- Policy to prevent users from deleting their own roles
CREATE POLICY "Users cannot delete their own roles"
ON public.user_roles
FOR DELETE
USING (auth.uid() != user_id);

-- Policy for managers to only update employee roles
CREATE POLICY "Managers can update employee roles only"
ON public.user_roles
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'manager') AND 
  role = 'employee' AND 
  auth.uid() != user_id
);

-- Policy for managers to only delete employee roles
CREATE POLICY "Managers can delete employee roles only"
ON public.user_roles
FOR DELETE
USING (
  public.has_role(auth.uid(), 'manager') AND 
  role = 'employee' AND 
  auth.uid() != user_id
);

-- Policy for admins to update any role except their own
CREATE POLICY "Admins can update any role except their own"
ON public.user_roles
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin') AND 
  auth.uid() != user_id
);

-- Policy for admins to delete any role except their own
CREATE POLICY "Admins can delete any role except their own"
ON public.user_roles
FOR DELETE
USING (
  public.has_role(auth.uid(), 'admin') AND 
  auth.uid() != user_id
);