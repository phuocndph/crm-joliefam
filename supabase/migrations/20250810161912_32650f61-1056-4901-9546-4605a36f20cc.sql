-- Fix RLS policies for orders table to ensure managers only see their own orders
DROP POLICY IF EXISTS "Managers can view their orders" ON public.orders;
DROP POLICY IF EXISTS "Managers can insert their orders" ON public.orders;
DROP POLICY IF EXISTS "Managers can update their orders" ON public.orders;
DROP POLICY IF EXISTS "Managers can delete their orders" ON public.orders;

-- Create strict RLS policies for managers
CREATE POLICY "Managers can view their orders" 
ON public.orders 
FOR SELECT 
USING (
  has_role(auth.uid(), 'manager'::app_role) 
  AND manager_id = (auth.uid())::text
);

CREATE POLICY "Managers can insert their orders" 
ON public.orders 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role) 
  AND manager_id = (auth.uid())::text
);

CREATE POLICY "Managers can update their orders" 
ON public.orders 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'manager'::app_role) 
  AND manager_id = (auth.uid())::text
);

CREATE POLICY "Managers can delete their orders" 
ON public.orders 
FOR DELETE 
USING (
  has_role(auth.uid(), 'manager'::app_role) 
  AND manager_id = (auth.uid())::text
);