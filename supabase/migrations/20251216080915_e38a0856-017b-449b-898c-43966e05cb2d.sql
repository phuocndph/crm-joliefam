-- =====================================================
-- FIX RLS POLICIES FOR EMPLOYEE ACCOUNTS
-- =====================================================

-- 1. FIX QUOTES TABLE - Add trigger and fix INSERT policy
-- =====================================================

-- Add set_manager_id trigger for quotes table (missing before)
DROP TRIGGER IF EXISTS set_quotes_manager_id ON public.quotes;
CREATE TRIGGER set_quotes_manager_id
  BEFORE INSERT ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_manager_id();

-- Fix INSERT policy for employees on quotes - add proper manager_id validation
DROP POLICY IF EXISTS "Employees can insert their manager's quotes" ON public.quotes;
CREATE POLICY "Employees can insert their manager's quotes" 
ON public.quotes 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'employee'::app_role) 
  AND (
    manager_id IS NULL 
    OR manager_id IN (
      SELECT (assigned_by)::text 
      FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'employee'::app_role
    )
  )
);

-- 2. FIX TRANSACTIONS TABLE - Fix INSERT policy
-- =====================================================

DROP POLICY IF EXISTS "Employees can insert their manager's transactions" ON public.transactions;
CREATE POLICY "Employees can insert their manager's transactions" 
ON public.transactions 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'employee'::app_role) 
  AND (
    manager_id IS NULL 
    OR manager_id IN (
      SELECT (assigned_by)::text 
      FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'employee'::app_role
    )
  )
);

-- 3. FIX ORDER_PAYMENTS TABLE - Add INSERT policy for employees
-- =====================================================

-- Check if policy exists and create if not
DROP POLICY IF EXISTS "Employees can insert their manager's order_payments" ON public.order_payments;
CREATE POLICY "Employees can insert their manager's order_payments" 
ON public.order_payments 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'employee'::app_role) 
  AND (
    manager_id IS NULL 
    OR manager_id IN (
      SELECT (assigned_by)::text 
      FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'employee'::app_role
    )
  )
);

-- Add UPDATE policy for employees on order_payments
DROP POLICY IF EXISTS "Employees can update their manager's order_payments" ON public.order_payments;
CREATE POLICY "Employees can update their manager's order_payments" 
ON public.order_payments 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'employee'::app_role) 
  AND manager_id IN (
    SELECT (assigned_by)::text 
    FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'employee'::app_role
  )
);

-- Add DELETE policy for employees on order_payments
DROP POLICY IF EXISTS "Employees can delete their manager's order_payments" ON public.order_payments;
CREATE POLICY "Employees can delete their manager's order_payments" 
ON public.order_payments 
FOR DELETE 
USING (
  has_role(auth.uid(), 'employee'::app_role) 
  AND manager_id IN (
    SELECT (assigned_by)::text 
    FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'employee'::app_role
  )
);

-- Add SELECT policy for employees on order_payments
DROP POLICY IF EXISTS "Employees can view their manager's order_payments" ON public.order_payments;
CREATE POLICY "Employees can view their manager's order_payments" 
ON public.order_payments 
FOR SELECT 
USING (
  has_role(auth.uid(), 'employee'::app_role) 
  AND manager_id IN (
    SELECT (assigned_by)::text 
    FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'employee'::app_role
  )
);

-- 4. FIX GHN_TRACKING TABLE - Fix INSERT policy
-- =====================================================

DROP POLICY IF EXISTS "Employees can insert GHN tracking data" ON public.ghn_tracking;
CREATE POLICY "Employees can insert GHN tracking data" 
ON public.ghn_tracking 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'employee'::app_role) 
  AND (
    manager_id IS NULL 
    OR manager_id IN (
      SELECT (assigned_by)::text 
      FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'employee'::app_role
    )
  )
);

-- 5. ADD ACCOUNTANT POLICIES FOR ORDER_PAYMENTS
-- =====================================================

DROP POLICY IF EXISTS "Accountants can manage all order_payments" ON public.order_payments;
CREATE POLICY "Accountants can manage all order_payments" 
ON public.order_payments 
FOR ALL
USING (has_role(auth.uid(), 'accountant'::app_role))
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));

-- 6. FIX FABRIC TABLES - Add employee CRUD policies
-- =====================================================

-- fabric_types - Add employee management policies
DROP POLICY IF EXISTS "Employees can manage their manager's fabric_types" ON public.fabric_types;
CREATE POLICY "Employees can manage their manager's fabric_types" 
ON public.fabric_types 
FOR ALL
USING (
  has_role(auth.uid(), 'employee'::app_role) 
  AND manager_id IN (
    SELECT (assigned_by)::text 
    FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'employee'::app_role
  )
)
WITH CHECK (
  has_role(auth.uid(), 'employee'::app_role) 
  AND (
    manager_id IS NULL 
    OR manager_id IN (
      SELECT (assigned_by)::text 
      FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'employee'::app_role
    )
  )
);

-- fabric_widths - Add employee management policies
DROP POLICY IF EXISTS "Employees can manage their manager's fabric_widths" ON public.fabric_widths;
CREATE POLICY "Employees can manage their manager's fabric_widths" 
ON public.fabric_widths 
FOR ALL
USING (
  has_role(auth.uid(), 'employee'::app_role) 
  AND manager_id IN (
    SELECT (assigned_by)::text 
    FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'employee'::app_role
  )
)
WITH CHECK (
  has_role(auth.uid(), 'employee'::app_role) 
  AND (
    manager_id IS NULL 
    OR manager_id IN (
      SELECT (assigned_by)::text 
      FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'employee'::app_role
    )
  )
);

-- fabric_variants - Add employee management policies
DROP POLICY IF EXISTS "Employees can manage their manager's fabric_variants" ON public.fabric_variants;
CREATE POLICY "Employees can manage their manager's fabric_variants" 
ON public.fabric_variants 
FOR ALL
USING (
  has_role(auth.uid(), 'employee'::app_role) 
  AND manager_id IN (
    SELECT (assigned_by)::text 
    FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'employee'::app_role
  )
)
WITH CHECK (
  has_role(auth.uid(), 'employee'::app_role) 
  AND (
    manager_id IS NULL 
    OR manager_id IN (
      SELECT (assigned_by)::text 
      FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'employee'::app_role
    )
  )
);

-- fabric_inventory - Add employee management policies
DROP POLICY IF EXISTS "Employees can manage their manager's fabric_inventory" ON public.fabric_inventory;
CREATE POLICY "Employees can manage their manager's fabric_inventory" 
ON public.fabric_inventory 
FOR ALL
USING (
  has_role(auth.uid(), 'employee'::app_role) 
  AND manager_id IN (
    SELECT (assigned_by)::text 
    FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'employee'::app_role
  )
)
WITH CHECK (
  has_role(auth.uid(), 'employee'::app_role) 
  AND (
    manager_id IS NULL 
    OR manager_id IN (
      SELECT (assigned_by)::text 
      FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'employee'::app_role
    )
  )
);

-- 7. FIX HISTORICAL DATA - Update quotes with wrong manager_id
-- =====================================================

-- Update quotes that have admin's manager_id to the correct manager
UPDATE public.quotes 
SET manager_id = '6a1faecc-8571-46ca-a035-01efe09c919b'
WHERE manager_id = '4b2f1f05-235d-4032-9209-6bcedb4fb8e1';

-- Update order_payments that might have wrong manager_id
UPDATE public.order_payments 
SET manager_id = '6a1faecc-8571-46ca-a035-01efe09c919b'
WHERE manager_id = '4b2f1f05-235d-4032-9209-6bcedb4fb8e1';