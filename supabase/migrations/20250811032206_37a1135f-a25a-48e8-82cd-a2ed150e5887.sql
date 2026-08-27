-- Update RLS policy for managers to be more strict
-- Drop the current policy that allows NULL manager_id
DROP POLICY IF EXISTS "Managers can insert their orders only" ON public.orders;

-- Create a stricter policy that requires manager_id to be set
CREATE POLICY "Managers can insert their orders only" 
ON public.orders 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role) AND 
  manager_id = (auth.uid())::text
);

-- Also ensure all existing orders have proper manager_id set
-- Update orders with NULL manager_id to have a default manager (if needed)
-- For now, let's just ensure the policy is strict