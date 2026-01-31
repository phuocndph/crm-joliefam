-- =====================================================
-- SECURITY FIX MIGRATION
-- Fix 6 security vulnerabilities identified in audit
-- =====================================================

-- 1. Remove old cron jobs with exposed keys
-- (Note: These may not exist, so we use DO blocks to handle errors)
DO $$
BEGIN
  PERFORM cron.unschedule('ghn-tracking-hourly-sync');
EXCEPTION WHEN OTHERS THEN
  -- Job doesn't exist, ignore
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('update-ghn-tracking-hourly');
EXCEPTION WHEN OTHERS THEN
  -- Job doesn't exist, ignore
  NULL;
END $$;

-- Create new cron job without hardcoded keys (ghn-auto-update has verify_jwt = false)
SELECT cron.schedule(
  'ghn-auto-update-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kmxfljxsmnozvvgypdei.supabase.co/functions/v1/ghn-auto-update',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- 2. Fix Products Table RLS Policies
-- Drop old overly permissive policies
DROP POLICY IF EXISTS "Users can view products" ON products;
DROP POLICY IF EXISTS "Users can insert products" ON products;
DROP POLICY IF EXISTS "Users can update products" ON products;
DROP POLICY IF EXISTS "Users can delete products" ON products;
DROP POLICY IF EXISTS "Authenticated users can view products" ON products;
DROP POLICY IF EXISTS "Authenticated users can insert products" ON products;
DROP POLICY IF EXISTS "Authenticated users can update products" ON products;
DROP POLICY IF EXISTS "Authenticated users can delete products" ON products;

-- Create role-based policies for products

-- Admin full access
CREATE POLICY "Admins have full access to products"
  ON products FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Managers can manage their own products
CREATE POLICY "Managers can manage their products"
  ON products FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::public.app_role) 
    AND (manager_id = (auth.uid())::text OR manager_id IS NULL)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND (manager_id = (auth.uid())::text OR manager_id IS NULL)
  );

-- Employees can manage their assigned manager's products
CREATE POLICY "Employees can manage their managers products"
  ON products FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'employee'::public.app_role) 
    AND manager_id IN (
      SELECT (assigned_by)::text 
      FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'employee'::public.app_role
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'employee'::public.app_role) 
    AND (manager_id IS NULL OR manager_id IN (
      SELECT (assigned_by)::text 
      FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'employee'::public.app_role
    ))
  );

-- Accountants can only view products (read-only)
CREATE POLICY "Accountants can view products"
  ON products FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'accountant'::public.app_role)
    AND manager_id IN (
      SELECT (assigned_by)::text 
      FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'accountant'::public.app_role
    )
  );

-- 3. Fix Security Definer View - Convert to Security Invoker
DROP VIEW IF EXISTS payment_summary;

CREATE VIEW payment_summary 
WITH (security_invoker = true) AS
SELECT 
  o.id AS order_id,
  o.order_number,
  o.payment_status,
  o.total_amount,
  o.payment_date AS final_payment_date,
  c.name AS customer_name,
  c.customer_code,
  COALESCE(sum(op.payment_amount), 0::numeric) AS total_paid,
  (o.total_amount - COALESCE(sum(op.payment_amount), 0::numeric)) AS remaining_amount,
  count(op.id) AS payment_count,
  min(op.payment_date) AS first_payment_date,
  max(op.payment_date) AS last_payment_date
FROM orders o
  LEFT JOIN order_payments op ON o.id = op.order_id
  LEFT JOIN customers c ON o.customer_id = c.id
GROUP BY o.id, o.order_number, o.payment_status, o.total_amount, o.payment_date, c.name, c.customer_code;