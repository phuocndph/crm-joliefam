-- Check current RLS policies for customers table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'customers';

-- Drop existing restrictive RLS policies for customers if they exist
DROP POLICY IF EXISTS "Users can view their own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can insert their own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can update their own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can delete their own customers" ON public.customers;
DROP POLICY IF EXISTS "Managers can view all customers" ON public.customers;
DROP POLICY IF EXISTS "Managers can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Managers can update all customers" ON public.customers;
DROP POLICY IF EXISTS "Managers can delete all customers" ON public.customers;
DROP POLICY IF EXISTS "Employees can view their manager's customers" ON public.customers;
DROP POLICY IF EXISTS "Employees can insert for their manager" ON public.customers;

-- Create new global RLS policies for customers
-- All authenticated users can view customers (for global access)
CREATE POLICY "All authenticated users can view customers"
ON public.customers
FOR SELECT
TO authenticated
USING (true);

-- All authenticated users can insert customers
CREATE POLICY "All authenticated users can insert customers"
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (true);

-- All authenticated users can update customers
CREATE POLICY "All authenticated users can update customers"
ON public.customers
FOR UPDATE
TO authenticated
USING (true);

-- Managers and admins can delete customers
CREATE POLICY "Managers and admins can delete customers"
ON public.customers
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role)
);