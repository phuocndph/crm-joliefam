-- Fix security vulnerability: Replace permissive price_lists policies with role-based access control
-- This prevents unauthorized users from manipulating pricing data

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Users can view price_lists" ON price_lists;
DROP POLICY IF EXISTS "Users can insert price_lists" ON price_lists;
DROP POLICY IF EXISTS "Users can update price_lists" ON price_lists;
DROP POLICY IF EXISTS "Users can delete price_lists" ON price_lists;

-- Create proper role-based policies

-- Admins can manage all price lists
CREATE POLICY "Admins can view all price_lists"
  ON price_lists FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert price_lists"
  ON price_lists FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all price_lists"
  ON price_lists FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete all price_lists"
  ON price_lists FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Managers can manage their own price lists
CREATE POLICY "Managers can view their price_lists"
  ON price_lists FOR SELECT
  USING (has_role(auth.uid(), 'manager'::app_role) AND manager_id = (auth.uid())::text);

CREATE POLICY "Managers can insert their price_lists"
  ON price_lists FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role) AND manager_id = (auth.uid())::text);

CREATE POLICY "Managers can update their price_lists"
  ON price_lists FOR UPDATE
  USING (has_role(auth.uid(), 'manager'::app_role) AND manager_id = (auth.uid())::text);

CREATE POLICY "Managers can delete their price_lists"
  ON price_lists FOR DELETE
  USING (has_role(auth.uid(), 'manager'::app_role) AND manager_id = (auth.uid())::text);

-- Employees can view their manager's price lists (read-only)
CREATE POLICY "Employees can view their manager's price_lists"
  ON price_lists FOR SELECT
  USING (has_role(auth.uid(), 'employee'::app_role) AND manager_id IN (
    SELECT (assigned_by)::text FROM user_roles WHERE user_id = auth.uid() AND role = 'employee'::app_role
  ));

-- Accountants can view all price lists (read-only for financial purposes)
CREATE POLICY "Accountants can view all price_lists"
  ON price_lists FOR SELECT
  USING (has_role(auth.uid(), 'accountant'::app_role));