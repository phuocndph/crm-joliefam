-- Drop existing policy
DROP POLICY IF EXISTS "Employees can update their manager's quotes" ON public.quotes;

-- Recreate with proper WITH CHECK clause to prevent RLS violations
CREATE POLICY "Employees can update their manager's quotes"
ON public.quotes
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'employee'::app_role) 
  AND manager_id IN (
    SELECT (user_roles.assigned_by)::text 
    FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'employee'::app_role
  )
)
WITH CHECK (
  has_role(auth.uid(), 'employee'::app_role) 
  AND manager_id IN (
    SELECT (user_roles.assigned_by)::text 
    FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'employee'::app_role
  )
);