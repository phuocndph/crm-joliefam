-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Users can view customers" ON public.customers;
DROP POLICY IF EXISTS "Users can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Users can update customers" ON public.customers;
DROP POLICY IF EXISTS "Users can delete customers" ON public.customers;

DROP POLICY IF EXISTS "Users can view quotes" ON public.quotes;
DROP POLICY IF EXISTS "Users can insert quotes" ON public.quotes;
DROP POLICY IF EXISTS "Users can update quotes" ON public.quotes;
DROP POLICY IF EXISTS "Users can delete quotes" ON public.quotes;

DROP POLICY IF EXISTS "Users can view orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update orders" ON public.orders;
DROP POLICY IF EXISTS "Users can delete orders" ON public.orders;

DROP POLICY IF EXISTS "Users can view products" ON public.products;
DROP POLICY IF EXISTS "Users can insert products" ON public.products;
DROP POLICY IF EXISTS "Users can update products" ON public.products;
DROP POLICY IF EXISTS "Users can delete products" ON public.products;

DROP POLICY IF EXISTS "Users can view finance_data" ON public.finance_data;
DROP POLICY IF EXISTS "Users can insert finance_data" ON public.finance_data;
DROP POLICY IF EXISTS "Users can update finance_data" ON public.finance_data;
DROP POLICY IF EXISTS "Users can delete finance_data" ON public.finance_data;

DROP POLICY IF EXISTS "Users can view transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can update transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can delete transactions" ON public.transactions;

-- Create new RLS policies for customers table
CREATE POLICY "Admins can view all customers" ON public.customers
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can view their customers" ON public.customers
FOR SELECT USING (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

CREATE POLICY "Employees can view their manager's customers" ON public.customers
FOR SELECT USING (
  public.has_role(auth.uid(), 'employee') AND 
  manager_id IN (
    SELECT assigned_by::text FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'employee'
  )
);

CREATE POLICY "Admins can insert customers" ON public.customers
FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can insert their customers" ON public.customers
FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

CREATE POLICY "Admins can update all customers" ON public.customers
FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can update their customers" ON public.customers
FOR UPDATE USING (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

CREATE POLICY "Admins can delete all customers" ON public.customers
FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can delete their customers" ON public.customers
FOR DELETE USING (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

-- Create new RLS policies for quotes table
CREATE POLICY "Admins can view all quotes" ON public.quotes
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can view their quotes" ON public.quotes
FOR SELECT USING (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

CREATE POLICY "Employees can view their manager's quotes" ON public.quotes
FOR SELECT USING (
  public.has_role(auth.uid(), 'employee') AND 
  manager_id IN (
    SELECT assigned_by::text FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'employee'
  )
);

CREATE POLICY "Admins can insert quotes" ON public.quotes
FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can insert their quotes" ON public.quotes
FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

CREATE POLICY "Admins can update all quotes" ON public.quotes
FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can update their quotes" ON public.quotes
FOR UPDATE USING (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

CREATE POLICY "Admins can delete all quotes" ON public.quotes
FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can delete their quotes" ON public.quotes
FOR DELETE USING (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

-- Create new RLS policies for orders table
CREATE POLICY "Admins can view all orders" ON public.orders
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can view their orders" ON public.orders
FOR SELECT USING (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

CREATE POLICY "Employees can view their manager's orders" ON public.orders
FOR SELECT USING (
  public.has_role(auth.uid(), 'employee') AND 
  manager_id IN (
    SELECT assigned_by::text FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'employee'
  )
);

CREATE POLICY "Admins can insert orders" ON public.orders
FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can insert their orders" ON public.orders
FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

CREATE POLICY "Admins can update all orders" ON public.orders
FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can update their orders" ON public.orders
FOR UPDATE USING (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

CREATE POLICY "Admins can delete all orders" ON public.orders
FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can delete their orders" ON public.orders
FOR DELETE USING (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

-- Create new RLS policies for products table
CREATE POLICY "Admins can view all products" ON public.products
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can view their products" ON public.products
FOR SELECT USING (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

CREATE POLICY "Employees can view their manager's products" ON public.products
FOR SELECT USING (
  public.has_role(auth.uid(), 'employee') AND 
  manager_id IN (
    SELECT assigned_by::text FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'employee'
  )
);

CREATE POLICY "Admins can insert products" ON public.products
FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can insert their products" ON public.products
FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

CREATE POLICY "Admins can update all products" ON public.products
FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can update their products" ON public.products
FOR UPDATE USING (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

CREATE POLICY "Admins can delete all products" ON public.products
FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can delete their products" ON public.products
FOR DELETE USING (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

-- Create new RLS policies for finance_data table
CREATE POLICY "Admins can view all finance_data" ON public.finance_data
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can view their finance_data" ON public.finance_data
FOR SELECT USING (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

CREATE POLICY "Employees can view their manager's finance_data" ON public.finance_data
FOR SELECT USING (
  public.has_role(auth.uid(), 'employee') AND 
  manager_id IN (
    SELECT assigned_by::text FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'employee'
  )
);

CREATE POLICY "Admins can insert finance_data" ON public.finance_data
FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can insert their finance_data" ON public.finance_data
FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

CREATE POLICY "Admins can update all finance_data" ON public.finance_data
FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can update their finance_data" ON public.finance_data
FOR UPDATE USING (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

CREATE POLICY "Admins can delete all finance_data" ON public.finance_data
FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can delete their finance_data" ON public.finance_data
FOR DELETE USING (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

-- Create new RLS policies for transactions table
CREATE POLICY "Admins can view all transactions" ON public.transactions
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can view their transactions" ON public.transactions
FOR SELECT USING (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

CREATE POLICY "Employees can view their manager's transactions" ON public.transactions
FOR SELECT USING (
  public.has_role(auth.uid(), 'employee') AND 
  manager_id IN (
    SELECT assigned_by::text FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'employee'
  )
);

CREATE POLICY "Admins can insert transactions" ON public.transactions
FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can insert their transactions" ON public.transactions
FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

CREATE POLICY "Admins can update all transactions" ON public.transactions
FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can update their transactions" ON public.transactions
FOR UPDATE USING (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);

CREATE POLICY "Admins can delete all transactions" ON public.transactions
FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can delete their transactions" ON public.transactions
FOR DELETE USING (
  public.has_role(auth.uid(), 'manager') AND 
  (manager_id = auth.uid()::text OR manager_id IS NULL)
);