-- Standardize RLS policies for employees to manage their manager's data consistently

-- Update customers table - Add employee insert/update/delete permissions
DROP POLICY IF EXISTS "Employees can insert their manager's customers" ON public.customers;
DROP POLICY IF EXISTS "Employees can update their manager's customers" ON public.customers;
DROP POLICY IF EXISTS "Employees can delete their manager's customers" ON public.customers;

CREATE POLICY "Employees can insert their manager's customers"
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'employee'::app_role) AND 
  (manager_id IN ( SELECT (user_roles.assigned_by)::text AS assigned_by
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role))))
);

CREATE POLICY "Employees can update their manager's customers"
ON public.customers
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'employee'::app_role) AND 
  (manager_id IN ( SELECT (user_roles.assigned_by)::text AS assigned_by
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role))))
);

CREATE POLICY "Employees can delete their manager's customers"
ON public.customers
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'employee'::app_role) AND 
  (manager_id IN ( SELECT (user_roles.assigned_by)::text AS assigned_by
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role))))
);

-- Update orders table - Add employee insert/delete permissions
DROP POLICY IF EXISTS "Employees can insert their manager's orders" ON public.orders;
DROP POLICY IF EXISTS "Employees can delete their manager's orders" ON public.orders;

CREATE POLICY "Employees can insert their manager's orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'employee'::app_role) AND 
  (manager_id IN ( SELECT (user_roles.assigned_by)::text AS assigned_by
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role))))
);

CREATE POLICY "Employees can delete their manager's orders"
ON public.orders
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'employee'::app_role) AND 
  (manager_id IN ( SELECT (user_roles.assigned_by)::text AS assigned_by
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role))))
);

-- Update quotes table - Add employee insert/update/delete permissions
DROP POLICY IF EXISTS "Employees can insert their manager's quotes" ON public.quotes;
DROP POLICY IF EXISTS "Employees can update their manager's quotes" ON public.quotes;
DROP POLICY IF EXISTS "Employees can delete their manager's quotes" ON public.quotes;

CREATE POLICY "Employees can insert their manager's quotes"
ON public.quotes
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'employee'::app_role) AND 
  (manager_id IN ( SELECT (user_roles.assigned_by)::text AS assigned_by
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role))))
);

CREATE POLICY "Employees can update their manager's quotes"
ON public.quotes
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'employee'::app_role) AND 
  (manager_id IN ( SELECT (user_roles.assigned_by)::text AS assigned_by
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role))))
);

CREATE POLICY "Employees can delete their manager's quotes"
ON public.quotes
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'employee'::app_role) AND 
  (manager_id IN ( SELECT (user_roles.assigned_by)::text AS assigned_by
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role))))
);

-- Update assignees table - Add employee insert/update/delete permissions
DROP POLICY IF EXISTS "Employees can insert assignees" ON public.assignees;
DROP POLICY IF EXISTS "Employees can update assignees" ON public.assignees;
DROP POLICY IF EXISTS "Employees can delete assignees" ON public.assignees;

CREATE POLICY "Employees can insert assignees"
ON public.assignees
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'employee'::app_role) AND 
  (manager_id IN ( SELECT (user_roles.assigned_by)::text AS assigned_by
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role))))
);

CREATE POLICY "Employees can update assignees"
ON public.assignees
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'employee'::app_role) AND 
  (manager_id IN ( SELECT (user_roles.assigned_by)::text AS assigned_by
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role))))
);

CREATE POLICY "Employees can delete assignees"
ON public.assignees
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'employee'::app_role) AND 
  (manager_id IN ( SELECT (user_roles.assigned_by)::text AS assigned_by
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role))))
);

-- Update GHN tracking table - Add employee insert/update/delete permissions
DROP POLICY IF EXISTS "Employees can insert GHN tracking data" ON public.ghn_tracking;
DROP POLICY IF EXISTS "Employees can update GHN tracking data" ON public.ghn_tracking;
DROP POLICY IF EXISTS "Employees can delete GHN tracking data" ON public.ghn_tracking;

CREATE POLICY "Employees can insert GHN tracking data"
ON public.ghn_tracking
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'employee'::app_role) AND 
  (manager_id IN ( SELECT (user_roles.assigned_by)::text AS assigned_by
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role))))
);

CREATE POLICY "Employees can update GHN tracking data"
ON public.ghn_tracking
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'employee'::app_role) AND 
  (manager_id IN ( SELECT (user_roles.assigned_by)::text AS assigned_by
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role))))
);

CREATE POLICY "Employees can delete GHN tracking data"
ON public.ghn_tracking
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'employee'::app_role) AND 
  (manager_id IN ( SELECT (user_roles.assigned_by)::text AS assigned_by
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role))))
);