-- Fix security vulnerability: Remove NULL fallback in managers' customer access policies
-- This prevents managers from viewing unassigned customers across tenants

-- Drop existing policies that have NULL fallback vulnerability
DROP POLICY IF EXISTS "Managers can view their customers" ON customers;
DROP POLICY IF EXISTS "Managers can update their customers" ON customers;
DROP POLICY IF EXISTS "Managers can delete their customers" ON customers;
DROP POLICY IF EXISTS "Managers can insert their customers" ON customers;

-- Recreate policies WITHOUT NULL fallback - managers can only access their own customers
CREATE POLICY "Managers can view their customers"
  ON customers FOR SELECT
  USING (has_role(auth.uid(), 'manager'::app_role) AND manager_id = (auth.uid())::text);

CREATE POLICY "Managers can update their customers"
  ON customers FOR UPDATE
  USING (has_role(auth.uid(), 'manager'::app_role) AND manager_id = (auth.uid())::text);

CREATE POLICY "Managers can delete their customers"
  ON customers FOR DELETE
  USING (has_role(auth.uid(), 'manager'::app_role) AND manager_id = (auth.uid())::text);

CREATE POLICY "Managers can insert their customers"
  ON customers FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role) AND manager_id = (auth.uid())::text);

-- Also update the duplicate "Managers and admins can delete customers" policy to be more specific
DROP POLICY IF EXISTS "Managers and admins can delete customers" ON customers;